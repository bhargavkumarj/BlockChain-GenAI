"use client";

import { Allow, parse } from "partial-json";
import { useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { useWriteContract } from "wagmi";
import { Dots, Notice, SplitBar, TxLink } from "@/components/ui";
import { useIpfsJson } from "@/hooks/use-agreement";
import { useStream } from "@/hooks/use-stream";
import { useTx } from "@/hooks/use-tx";
import { pactumAbi } from "@/lib/abi";
import type { AgreementView, MilestoneView } from "@/lib/agreement";
import { PACTUM_ADDRESS, tokenFor } from "@/lib/config";
import { formatAmount, roman } from "@/lib/format";
import { JURORS, type JurorOpinion, RulingDocument, type TribunalOpinion } from "@/lib/schemas";
import { ipfsUrl } from "@/lib/upload";
import { JurorGlyph } from "./juror-glyph";

type DeepPartial<T> = T extends (infer U)[] ? DeepPartial<U>[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

type SignedRuling = {
  agreementId: number;
  milestone: number;
  disputedAt: number;
  providerBps: number;
  rulingCID: string;
  deadline: number;
  signature: Hex;
};

type JurorState = {
  status: "waiting" | "deliberating" | "done";
  opinion?: DeepPartial<JurorOpinion>;
  model?: string;
};

type Session = {
  stage: "idle" | "record" | "deliberation" | "opinion" | "seal" | "ruled" | "error";
  text?: string;
  record?: { filings: number; hasDelivery: boolean; deliveryFiles: number; attachments: number };
  jurors: Record<string, JurorState>;
  shares?: number[];
  median?: number;
  opinion?: DeepPartial<TribunalOpinion>;
  ruling?: SignedRuling;
  error?: string;
};

const emptySession = (): Session => ({
  stage: "idle",
  jurors: Object.fromEntries(JURORS.map((j) => [j.id, { status: "waiting" }])),
});

/** Live tribunal session for a disputed milestone whose evidence window has closed. */
export function TribunalSession({
  agreement,
  milestone,
  onExecuted,
}: {
  agreement: AgreementView;
  milestone: MilestoneView;
  onExecuted: () => void;
}) {
  const [session, setSession] = useState<Session>(emptySession);
  const stream = useStream();
  const buffers = useRef<Record<string, string>>({});
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);
  const { data: rulingDoc } = useIpfsJson(session.ruling?.rulingCID, RulingDocument);

  // A ruling may already exist for this dispute (signed but not yet executed): show it instead of re-convening.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tribunal?agreementId=${agreement.id}&milestone=${milestone.index}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((ruling: SignedRuling | null) => {
        if (ruling && !cancelled) setSession((s) => ({ ...s, stage: "ruled", ruling }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (polling.current) clearInterval(polling.current);
    };
  }, [agreement.id, milestone.index, milestone.disputedAt]);

  function pollForRuling() {
    if (polling.current) return;
    polling.current = setInterval(async () => {
      const res = await fetch(`/api/tribunal?agreementId=${agreement.id}&milestone=${milestone.index}`);
      if (!res.ok) return;
      const ruling = (await res.json()) as SignedRuling;
      setSession((s) => ({ ...s, stage: "ruled", ruling, error: undefined }));
      if (polling.current) clearInterval(polling.current);
      polling.current = null;
    }, 3000);
  }

  function convene() {
    buffers.current = {};
    setSession({ ...emptySession(), stage: "record", text: "Calling the tribunal to order" });
    void stream.start("/api/tribunal", { agreementId: agreement.id, milestone: milestone.index }, ({ event, data }) => {
      const d = data as Record<string, unknown>;
      setSession((s) => {
        switch (event) {
          case "status":
            return { ...s, stage: d.stage as Session["stage"], text: d.text as string };
          case "record":
            return { ...s, record: d as Session["record"] };
          case "juror_start":
            return { ...s, jurors: { ...s.jurors, [d.id as string]: { status: "deliberating" } } };
          case "juror_delta": {
            const id = d.id as string;
            buffers.current[id] = (buffers.current[id] ?? "") + (d.delta as string);
            let opinion = s.jurors[id]?.opinion;
            try {
              opinion = parse(buffers.current[id]!, Allow.ALL);
            } catch {}
            return { ...s, jurors: { ...s.jurors, [id]: { status: "deliberating", opinion } } };
          }
          case "juror_done":
            return {
              ...s,
              jurors: { ...s.jurors, [d.id as string]: { status: "done", opinion: d.opinion as JurorOpinion, model: d.model as string } },
            };
          case "verdict":
            return { ...s, shares: d.shares as number[], median: d.median as number };
          case "opinion_delta": {
            buffers.current.__opinion = (buffers.current.__opinion ?? "") + (d.delta as string);
            let opinion = s.opinion;
            try {
              opinion = parse(buffers.current.__opinion, Allow.ALL);
            } catch {}
            return { ...s, opinion };
          }
          case "opinion_done":
            return { ...s, opinion: d.opinion as TribunalOpinion };
          case "ruling":
            return { ...s, stage: "ruled", ruling: d as unknown as SignedRuling };
          case "json":
          case "error":
            if (d.busy) pollForRuling();
            return { ...s, stage: d.busy ? s.stage : "error", text: d.busy ? "The tribunal is already in session; waiting for its ruling" : s.text, error: d.busy ? undefined : ((d.message as string) ?? (d.error as string)) };
          default:
            return s;
        }
      });
    });
  }

  // When the ruling came from cache, fill the bench from the pinned ruling document.
  const fromDoc = rulingDoc && session.stage === "ruled" && !session.median;
  const jurors: Session["jurors"] = fromDoc
    ? Object.fromEntries(rulingDoc.jurors.map((j) => [j.id, { status: "done" as const, opinion: j.opinion, model: j.model }]))
    : session.jurors;
  const shares = fromDoc ? rulingDoc.aggregation.shares : session.shares;
  const median = fromDoc ? rulingDoc.aggregation.providerBps / 100 : session.median;
  const opinion = fromDoc ? rulingDoc.opinion : session.opinion;

  if (session.stage === "idle") {
    return (
      <div className="border border-ink bg-ink px-6 py-8 text-paper sm:px-8">
        <p className="label !text-paper/60">The evidence is closed</p>
        <p className="display mt-3 text-4xl sm:text-5xl">Convene the tribunal.</p>
        <p className="mt-3 max-w-xl text-paper/75">
          Three AI jurors with different judicial philosophies will read the full record independently. The median of their
          awards becomes a signed ruling that anyone can execute on-chain. One session per dispute; it cannot be re-rolled.
        </p>
        <button className="btn btn-seal mt-6" onClick={convene} disabled={stream.running}>
          Call to order
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <p className="label">Tribunal · milestone {roman(milestone.index + 1)}</p>
        {session.stage !== "ruled" && session.stage !== "error" && <Dots label={session.text} />}
        {session.record && (
          <p className="font-mono text-[0.68rem] text-ink-3">
            Record: {session.record.hasDelivery ? `delivery with ${session.record.deliveryFiles} file(s)` : "no delivery"} ·{" "}
            {session.record.filings} filing(s) · {session.record.attachments} attachment(s) for vision
          </p>
        )}
      </div>

      <Bench jurors={jurors} />
      {shares && median !== undefined && <AwardScale shares={shares} median={median} />}
      {opinion && <OpinionView opinion={opinion} streaming={session.stage === "opinion"} />}
      {session.error && <Notice tone="seal">{session.error}</Notice>}
      {session.stage === "error" && (
        <button className="btn btn-line w-fit" onClick={convene}>
          Try again
        </button>
      )}
      {session.ruling && (
        <ExecuteRuling agreement={agreement} milestone={milestone} ruling={session.ruling} onExecuted={onExecuted} />
      )}
    </div>
  );
}

export function Bench({ jurors }: { jurors: Record<string, JurorState> }) {
  return (
    <div className="grid grid-cols-1 gap-px border border-rule bg-rule md:grid-cols-3">
      {JURORS.map((j) => {
        const state = jurors[j.id] ?? { status: "waiting" };
        const o = state.opinion;
        const done = state.status === "done";
        return (
          <section key={j.id} className="flex flex-col bg-sheet p-5">
            <header>
              <div className="flex items-start justify-between gap-3">
                <JurorGlyph id={j.id} active={state.status === "deliberating"} size={48} />
                <div className="text-right">
                  <p className="label">Award</p>
                  <p className={`display text-5xl tabular ${done ? "text-ink" : "text-ink-4"}`}>
                    {o?.providerSharePercent !== undefined ? `${o.providerSharePercent}%` : "··"}
                  </p>
                </div>
              </div>
              <p className="label mt-3">Seat {j.seat}</p>
              <h4 className="font-serif text-[1.7rem] leading-tight">{j.name}</h4>
              <p className="text-xs italic text-ink-3">{j.motto}</p>
            </header>
            <div className="mt-4 grid flex-1 content-start gap-3 text-sm leading-relaxed">
              {state.status === "waiting" && <p className="text-ink-4">Awaiting the record…</p>}
              {state.status === "deliberating" && !o?.holding && <Dots label="Reading the record" />}
              {o?.holding && <p className="font-serif text-[1.1rem] italic leading-snug">“{o.holding}”</p>}
              {o?.criteria && o.criteria.length > 0 && (
                <ul className="grid gap-1.5 border-t border-rule pt-3">
                  {o.criteria.map((c, i) => (
                    <li key={i} className="grid grid-cols-[1rem_1fr] gap-2 text-[0.82rem]">
                      <span className={assessmentColor(c?.assessment)}>{assessmentMark(c?.assessment)}</span>
                      <span className="text-ink-2">{c?.criterion}</span>
                    </li>
                  ))}
                </ul>
              )}
              {o?.analysis && (
                <p className={`whitespace-pre-line border-t border-rule pt-3 text-ink-2 ${state.status === "deliberating" ? "caret" : ""}`}>
                  {o.analysis}
                </p>
              )}
              {o?.integrityFlags && o.integrityFlags.length > 0 && (
                <Notice tone="seal">
                  <span className="label !text-seal">Integrity flags</span>
                  <ul className="mt-1 list-disc pl-4">
                    {o.integrityFlags.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </Notice>
              )}
            </div>
            {done && (
              <footer className="mt-4 flex justify-between border-t border-rule pt-3 font-mono text-[0.65rem] uppercase tracking-wider text-ink-3">
                <span>Confidence {o?.confidence ?? "—"}%</span>
                <span>{state.model}</span>
              </footer>
            )}
          </section>
        );
      })}
    </div>
  );
}

function assessmentMark(a?: string) {
  return a === "met" ? "✓" : a === "partially_met" ? "◐" : a === "not_met" ? "✕" : "?";
}
function assessmentColor(a?: string) {
  return a === "met" ? "text-ledger" : a === "partially_met" ? "text-amber" : a === "not_met" ? "text-seal" : "text-ink-4";
}

/** The three awards on a 0–100 line, with the median — the binding award — circled. */
export function AwardScale({ shares, median }: { shares: number[]; median: number }) {
  return (
    <div className="border border-rule bg-sheet px-5 pb-6 pt-5 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">Aggregation · median of three</p>
        <p className="font-mono text-sm">
          Binding award: <span className="text-seal">{median}% to the provider</span>
        </p>
      </div>
      <div className="relative mx-2 mt-14 h-px bg-ink">
        {[0, 25, 50, 75, 100].map((t) => (
          <span key={t} className="absolute top-0 -translate-x-1/2" style={{ left: `${t}%` }}>
            <span className="block h-2 w-px bg-ink" />
            <span className="mt-1 block font-mono text-[0.65rem] text-ink-3">{t}</span>
          </span>
        ))}
        {shares.map((s, i) => {
          // Every award gets a marker on the line; labels of awards within a few points of an earlier one are
          // lifted a row so they never collide.
          const level = shares.slice(0, i).filter((other) => Math.abs(other - s) < 6).length;
          return (
            <span key={i} className="absolute top-0" style={{ left: `${s}%` }}>
              <span className="absolute -top-1 block size-2 -translate-x-1/2 rotate-45 bg-ink" />
              <span
                className="absolute -translate-x-1/2 font-mono text-[0.65rem] text-ink-2"
                style={{ bottom: 10 + level * 13 }}
              >
                {JURORS[i]?.seat}
              </span>
            </span>
          );
        })}
        <span
          className="absolute top-0 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-seal animate-stamp"
          style={{ left: `${median}%` }}
          aria-label={`Median ${median}%`}
        />
      </div>
    </div>
  );
}

export function OpinionView({ opinion, streaming = false }: { opinion: DeepPartial<TribunalOpinion>; streaming?: boolean }) {
  return (
    <article className="sheet px-6 py-8 sm:px-10">
      <p className="label">Opinion of the tribunal</p>
      {opinion.title && <h3 className="display mt-3 text-3xl sm:text-4xl">{opinion.title}</h3>}
      {opinion.holding && <p className="mt-4 font-serif text-xl italic leading-snug text-seal">{opinion.holding}</p>}
      <div className="doc mt-5 grid gap-4">
        {opinion.reasoning && <p className="whitespace-pre-line">{opinion.reasoning}</p>}
        {opinion.remedy && (
          <p>
            <span className="label mr-2">Remedy</span>
            {opinion.remedy}
          </p>
        )}
        {opinion.guidance && (
          <p>
            <span className="label mr-2">Guidance</span>
            {opinion.guidance}
          </p>
        )}
        {opinion.dissent && (
          <p className="border-l-2 border-rule-strong pl-4 italic">
            <span className="label mr-2 not-italic">Dissent</span>
            {opinion.dissent}
          </p>
        )}
      </div>
      {streaming && <span className="caret" />}
    </article>
  );
}

function ExecuteRuling({
  agreement,
  milestone,
  ruling,
  onExecuted,
}: {
  agreement: AgreementView;
  milestone: MilestoneView;
  ruling: SignedRuling;
  onExecuted: () => void;
}) {
  const write = useWriteContract();
  const tx = useTx(onExecuted);
  const token = tokenFor(agreement.token);
  const toProvider = (milestone.amount * BigInt(ruling.providerBps)) / 10_000n;
  const toClient = milestone.amount - toProvider;
  return (
    <div className="grid gap-4 border border-ink p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">Signed ruling · EIP-712</p>
        <a href={ipfsUrl(ruling.rulingCID)} target="_blank" rel="noreferrer" className="link font-mono text-xs">
          ipfs://{ruling.rulingCID.slice(0, 18)}… ↗
        </a>
      </div>
      <SplitBar providerBps={ruling.providerBps} animate />
      <p className="text-sm text-ink-2">
        Executing sends {formatAmount(toProvider, token.decimals)} {token.symbol} to the provider (less the protocol fee) and returns{" "}
        {formatAmount(toClient, token.decimals)} {token.symbol} to the client
        {agreement.appealWindow ? `, after a ${Math.round(agreement.appealWindow / 3600)}h appeal window` : ""}. Anyone may
        submit it; the contract checks the tribunal’s signature.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn btn-seal"
          disabled={tx.busy || !PACTUM_ADDRESS}
          onClick={() =>
            tx.run("Execute ruling", () =>
              write.mutateAsync({
                address: PACTUM_ADDRESS!,
                abi: pactumAbi,
                functionName: "rule",
                args: [
                  BigInt(ruling.agreementId),
                  BigInt(ruling.milestone),
                  ruling.providerBps,
                  ruling.rulingCID,
                  BigInt(ruling.deadline),
                  ruling.signature,
                ],
              }),
            )
          }
        >
          {tx.busy ? <Dots label={tx.state.status === "signing" ? "Confirm in wallet" : "Executing"} /> : "Execute ruling on-chain"}
        </button>
        {tx.state.status === "success" && <TxLink hash={tx.state.hash} />}
        {tx.state.status === "error" && <span className="text-sm text-seal">{tx.state.error}</span>}
      </div>
    </div>
  );
}

/** A ruling that is already on-chain: rebuild the bench from its IPFS record. */
export function RecordedRuling({ cid }: { cid: string }) {
  const { data, isLoading, error } = useIpfsJson(cid, RulingDocument);
  if (isLoading) return <div className="h-40 skeleton" />;
  if (error || !data) return <Notice tone="amber">The ruling record could not be loaded from IPFS ({cid}).</Notice>;
  const jurors = Object.fromEntries(data.jurors.map((j) => [j.id, { status: "done" as const, opinion: j.opinion, model: j.model }]));
  return (
    <div className="grid gap-6">
      <Bench jurors={jurors} />
      <AwardScale shares={data.aggregation.shares} median={data.aggregation.providerBps / 100} />
      <OpinionView opinion={data.opinion} />
      <p className="font-mono text-[0.68rem] leading-relaxed text-ink-3">
        Ruling record ipfs://{cid} · prompts {data.promptVersion} · issued {new Date(data.issuedAt).toLocaleString("en-GB")}
        {data.simulated ? " · produced by the offline simulator" : ""}
      </p>
    </div>
  );
}
