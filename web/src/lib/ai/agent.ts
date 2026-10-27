import "server-only";
import { type AgreementView, agentTask } from "@/lib/agreement";
import { roman } from "@/lib/format";
import {
  AgentDecision,
  AgentDefense,
  AgentDeliverable,
  type DeliveryDocument,
  type EvidenceDocument,
  type FileRef,
} from "@/lib/schemas";
import type { SendFn } from "@/lib/sse";
import { buildCaseFile, loadTerms } from "@/lib/server/case-file";
import { agentAccount, agentWrite, latestTimestamp } from "@/lib/server/chain";
import { kv } from "@/lib/server/kv";
import { pinFile, pinJSON } from "@/lib/server/ipfs";
import { generateObject } from "./engine";
import { AGENT_DECIDE_SYSTEM, AGENT_DEFEND_SYSTEM, AGENT_DELIVER_SYSTEM } from "./prompts";
import { simulateAgentDecision, simulateDefense, simulateDeliverable } from "./simulate";

export { agentTask };

export class AgentBusy extends Error {}

/**
 * Run one step of Ada's work loop and stream progress. Each step ends in an on-chain transaction from the
 * agent's own wallet; a per-agreement lock keeps two browser tabs from triggering the same step twice.
 */
export async function runAgentStep(a: AgreementView, send: SendFn, signal: AbortSignal) {
  const now = await latestTimestamp();
  const task = agentTask(a, now);
  if (!task) {
    send("idle", { text: "Nothing for Ada to do right now." });
    return;
  }
  const lock = `agent:${a.id}`;
  if (!(await kv.set(lock, task.kind, { nx: true, ex: 300 }))) throw new AgentBusy("Ada is already working on this.");

  try {
    const terms = await loadTerms(a.termsCID);
    const termsText = terms ? JSON.stringify(terms.draft) : "(terms unavailable)";

    if (task.kind === "decide") {
      send("status", { text: "Ada is reading the agreement" });
      const { value } = await generateObject({
        system: AGENT_DECIDE_SYSTEM,
        content: `<agreement>${termsText}</agreement>`,
        schema: AgentDecision,
        effort: "low",
        simulate: simulateAgentDecision,
        signal,
      });
      send("decision", value);
      const hash = await agentWrite(value.accept ? "accept" : "cancel", [BigInt(a.id)]);
      send("tx", { action: value.accept ? "accept" : "decline", hash });
      return;
    }

    if (task.kind === "deliver") {
      const i = task.index;
      const milestone = terms?.draft.milestones[i];
      send("status", { text: `Ada is working on milestone ${roman(i + 1)}` });
      const { value } = await generateObject({
        system: AGENT_DELIVER_SYSTEM,
        content: `<agreement>${termsText}</agreement>\n<task>Deliver milestone ${roman(i + 1)}: ${JSON.stringify(milestone ?? {})}</task>`,
        schema: AgentDeliverable,
        effort: "medium",
        maxTokens: 32_000,
        onDelta: (delta) => send("work_delta", { delta }),
        simulate: () => simulateDeliverable(terms, i),
        signal,
      });
      send("status", { text: "Pinning the work to IPFS" });
      const files: FileRef[] = [];
      for (const f of value.files.slice(0, 8)) {
        const bytes = new TextEncoder().encode(f.content);
        const name = f.filename.replace(/[^\w.\-]+/g, "-").slice(0, 80) || "file.txt";
        const { cid, size } = await pinFile(bytes, name, f.mediaType);
        files.push({ name, cid, mediaType: f.mediaType, size });
      }
      const doc: DeliveryDocument = {
        kind: "pactum.delivery",
        version: 1,
        agreementId: a.id,
        milestone: i,
        note: value.coverNote,
        files,
        links: [],
        author: agentAccount().address,
        createdAt: new Date().toISOString(),
      };
      const { cid } = await pinJSON(doc, `pactum-delivery-${a.id}-${i}`);
      const hash = await agentWrite("deliver", [BigInt(a.id), BigInt(i), cid]);
      send("tx", { action: "deliver", hash, cid });
      return;
    }

    if (task.kind === "defend") {
      const i = task.index;
      send("status", { text: "Ada is preparing a statement for the tribunal" });
      const record = await buildCaseFile(a, i);
      const { value } = await generateObject({
        system: AGENT_DEFEND_SYSTEM,
        content: [
          ...record.blocks,
          { type: "text", text: `You are the provider. Write your statement on milestone ${roman(i + 1)}.` },
        ],
        schema: AgentDefense,
        effort: "low",
        onDelta: (delta) => send("work_delta", { delta }),
        simulate: simulateDefense,
        signal,
      });
      const doc: EvidenceDocument = {
        kind: "pactum.evidence",
        version: 1,
        agreementId: a.id,
        milestone: i,
        role: "provider",
        statement: `${value.statement}\n\nShare I believe I earned: ${value.proposedSharePercent}%.`,
        files: [],
        author: agentAccount().address,
        createdAt: new Date().toISOString(),
      };
      const { cid } = await pinJSON(doc, `pactum-evidence-${a.id}-${i}-provider`);
      const hash = await agentWrite("submitEvidence", [BigInt(a.id), BigInt(i), cid]);
      send("tx", { action: "evidence", hash, cid });
      return;
    }

    if (task.kind === "claim" || task.kind === "finalize") {
      const hash = await agentWrite(task.kind, [BigInt(a.id), BigInt(task.index)]);
      send("tx", { action: task.kind, hash });
    }
  } finally {
    await kv.del(lock);
  }
}
