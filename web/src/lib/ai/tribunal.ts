import "server-only";
import type { Hex } from "viem";
import type { AgreementView } from "@/lib/agreement";
import { CHAIN_ID } from "@/lib/config";
import { roman } from "@/lib/format";
import {
  JURORS,
  JurorOpinion,
  type JurorOpinion as JurorOpinionT,
  type RulingDocument,
  TribunalOpinion,
} from "@/lib/schemas";
import type { SendFn } from "@/lib/sse";
import { buildCaseFile } from "@/lib/server/case-file";
import { latestTimestamp, requirePactum, signRuling } from "@/lib/server/chain";
import { isDurableKV, kv } from "@/lib/server/kv";
import { pinJSON } from "@/lib/server/ipfs";
import { clampPercent, fence, median } from "@/lib/tribunal-math";
import { serverEnv } from "@/lib/server/env";
import { type Effort, aiMode, generateObject, modelName } from "./engine";
import { PROMPT_VERSION, jurorSystem, opinionSystem } from "./prompts";
import { simulateJuror, simulateOpinion } from "./simulate";

export type SignedRuling = {
  agreementId: number;
  milestone: number;
  disputedAt: number;
  providerBps: number;
  rulingCID: string;
  deadline: number;
  signature: Hex;
};

export class TribunalBusy extends Error {}

const rulingKey = (a: AgreementView, index: number) =>
  `ruling:${CHAIN_ID}:${requirePactum().toLowerCase()}:${a.id}:${index}:${a.milestones[index]!.disputedAt}`;

const RULING_VALIDITY = 7 * 24 * 3600;

/**
 * A ruling already issued for this exact dispute, if any. If nobody executed it before its signature expired,
 * the same award and reasoning are re-signed with a fresh deadline: the outcome never changes, so waiting out
 * the deadline is not a way to re-roll the jurors.
 */
export async function existingRuling(a: AgreementView, index: number) {
  const key = rulingKey(a, index);
  const ruling = await kv.get<SignedRuling>(key);
  if (!ruling) return null;
  const now = await latestTimestamp();
  if (ruling.deadline > now + 3600) return ruling;
  const deadline = now + RULING_VALIDITY;
  const refreshed: SignedRuling = {
    ...ruling,
    deadline,
    signature: await signRuling({ ...ruling, deadline }),
  };
  await kv.set(key, refreshed);
  return refreshed;
}


/**
 * Convene the tribunal for one disputed milestone and stream its deliberation.
 *
 * Integrity properties:
 * - Exactly one ruling per dispute: results are stored under (chain, contract, agreement, milestone,
 *   disputedAt) and a lock prevents concurrent sessions, so a party cannot re-roll the jurors.
 * - The award is the median of three independent opinions, so no single juror decides the outcome.
 * - The full deliberation is pinned to IPFS and its CID is part of the EIP-712 message the contract verifies.
 */
export async function convene(a: AgreementView, index: number, send: SendFn, signal: AbortSignal) {
  const key = rulingKey(a, index);
  const cached = await existingRuling(a, index);
  if (cached) {
    send("ruling", { ...cached, cached: true });
    return cached;
  }
  const lock = `lock:${key}`;
  if (!(await kv.set(lock, Date.now(), { nx: true, ex: 600 }))) {
    throw new TribunalBusy("The tribunal is already in session for this dispute.");
  }
  if (!isDurableKV()) {
    console.warn("[tribunal] no durable KV configured: ruling idempotency only holds within this server instance");
  }

  try {
    const m = a.milestones[index]!;
    send("status", { stage: "record", text: "The clerk is assembling the record" });
    const record = await buildCaseFile(a, index);
    const criteria = record.terms?.draft.milestones[index]?.acceptanceCriteria ?? [];
    send("record", {
      filings: record.filings.length,
      hasDelivery: Boolean(record.delivery),
      deliveryFiles: record.delivery?.files.length ?? 0,
      attachments: Math.max(0, (record.blocks.length - 1) / 2),
      title: record.terms?.draft.title ?? `Agreement ${a.id}`,
    });

    const effort = (process.env.AI_TRIBUNAL_EFFORT as Effort) || "medium";
    const jurorModels = (process.env.AI_JUROR_MODELS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const seed = `${a.id}:${index}:${m.disputedAt}:${record.text.length}`;
    send("status", { stage: "deliberation", text: "Three jurors are deliberating independently" });

    const opinions = await Promise.all(
      JURORS.map(async (juror, i) => {
        send("juror_start", { id: juror.id });
        const model = jurorModels[i] || serverEnv.model;
        const { value, model: used } = await generateObject({
          system: jurorSystem(juror.id, juror.name),
          content: [
            ...record.blocks,
            {
              type: "text",
              text: `Decide the dispute over milestone ${roman(index + 1)} (index ${index}). Return your opinion.`,
            },
          ],
          schema: JurorOpinion,
          effort,
          model,
          onDelta: (delta) => send("juror_delta", { id: juror.id, delta }),
          simulate: () => simulateJuror(juror.id, seed, criteria),
          signal,
        });
        const opinion: JurorOpinionT = {
          ...value,
          providerSharePercent: clampPercent(value.providerSharePercent),
          confidence: clampPercent(value.confidence),
        };
        send("juror_done", { id: juror.id, opinion, model: used });
        return { id: juror.id, name: juror.name, model: used, opinion };
      }),
    );

    const shares = opinions.map((o) => o.opinion.providerSharePercent);
    const awarded = median(shares);
    send("verdict", { shares, median: awarded });

    send("status", { stage: "opinion", text: "The clerk is writing the opinion of the tribunal" });
    const { value: opinion } = await generateObject({
      system: opinionSystem(awarded),
      content: [
        { type: "text", text: record.text },
        {
          type: "text",
          text: `<opinions>\n${opinions
            .map((o) => `<juror name="${o.name}" award="${o.opinion.providerSharePercent}">\n${fence(JSON.stringify(o.opinion))}\n</juror>`)
            .join("\n")}\n</opinions>\nWrite the opinion of the tribunal for milestone ${roman(index + 1)}.`,
        },
      ],
      schema: TribunalOpinion,
      effort: "low",
      onDelta: (delta) => send("opinion_delta", { delta }),
      simulate: () => simulateOpinion(awarded, shares),
      signal,
    });
    send("opinion_done", { opinion });

    const doc: RulingDocument = {
      kind: "pactum.ruling",
      version: 1,
      chainId: CHAIN_ID,
      contract: requirePactum(),
      agreementId: a.id,
      milestone: index,
      disputedAt: m.disputedAt,
      record: {
        termsCID: a.termsCID,
        deliveryCID: m.deliveryCID,
        evidence: record.filings.map((f) => ({ by: f.by, role: f.role, cid: f.cid, at: f.at })),
      },
      jurors: opinions,
      aggregation: { method: "median", shares, providerBps: awarded * 100 },
      opinion,
      promptVersion: PROMPT_VERSION,
      simulated: aiMode() === "simulated",
      issuedAt: new Date().toISOString(),
    };
    send("status", { stage: "seal", text: "Pinning the ruling to IPFS and signing it" });
    const { cid } = await pinJSON(doc, `pactum-ruling-${a.id}-${index}`);

    const deadline = (await latestTimestamp()) + RULING_VALIDITY;
    const ruling: SignedRuling = {
      agreementId: a.id,
      milestone: index,
      disputedAt: m.disputedAt,
      providerBps: awarded * 100,
      rulingCID: cid,
      deadline,
      signature: await signRuling({
        agreementId: a.id,
        milestone: index,
        providerBps: awarded * 100,
        rulingCID: cid,
        disputedAt: m.disputedAt,
        deadline,
      }),
    };
    await kv.set(key, ruling);
    send("ruling", { ...ruling, model: modelName() });
    return ruling;
  } finally {
    await kv.del(lock);
  }
}
