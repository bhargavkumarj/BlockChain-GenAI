"use client";

import { Allow, parse } from "partial-json";
import { useEffect, useRef, useState } from "react";
import { Dots, TxLink, useNow } from "@/components/ui";
import { useStream } from "@/hooks/use-stream";
import { type AgreementView, agentTask } from "@/lib/agreement";
import { AGENT_ADDRESS } from "@/lib/config";

type LogLine = { at: number; text: string; hash?: string; tone?: "seal" | "ledger" };

/**
 * Ada's desk: nudges the resident agent whenever the agreement reaches a state where it should act, and
 * shows its work as it happens: reasoning status, the deliverable being written, and each transaction.
 */
export function AdaDesk({ agreement, onAction }: { agreement: AgreementView; onAction: () => void }) {
  const now = useNow(2000);
  const stream = useStream();
  const [log, setLog] = useState<LogLine[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(new Set<string>());
  const buffer = useRef("");

  const task = agentTask(agreement, now);
  const key = task ? `${task.kind}:${"index" in task ? task.index : ""}:${agreement.milestones.map((m) => m.phase).join(",")}` : "";

  function push(line: Omit<LogLine, "at">) {
    setLog((l) => [...l.slice(-30), { ...line, at: Date.now() }]);
  }

  function nudge(force = false) {
    if (!key || stream.running) return;
    if (attempted.current.has(key) && !force) return;
    attempted.current.add(key);
    setError(null);
    buffer.current = "";
    setDraft("");
    void stream.start("/api/agent", { agreementId: agreement.id }, ({ event, data }) => {
      const d = data as Record<string, unknown>;
      if (event === "status") push({ text: d.text as string });
      else if (event === "decision") push({ text: `${d.accept ? "Accepting" : "Declining"}: ${d.reason as string}`, tone: d.accept ? "ledger" : "seal" });
      else if (event === "work_delta") {
        buffer.current += d.delta as string;
        try {
          const partial = parse(buffer.current, Allow.ALL) as { files?: { content?: string }[]; statement?: string; coverNote?: string };
          const text = partial.statement ?? partial.files?.at(-1)?.content ?? partial.coverNote ?? "";
          setDraft(text);
        } catch {}
      } else if (event === "tx") {
        push({ text: TX_COPY[d.action as string] ?? "Transaction sent", hash: d.hash as string, tone: "ledger" });
        setDraft("");
        onAction();
      } else if (event === "error") {
        if (!d.busy) setError(d.message as string);
      }
    });
  }

  useEffect(() => {
    nudge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!AGENT_ADDRESS || agreement.provider.toLowerCase() !== AGENT_ADDRESS.toLowerCase()) return null;

  return (
    <section className="border border-ink bg-ink p-5 text-paper">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-paper/60">Ada’s desk · autonomous agent</p>
        <span className={`size-2 rounded-full ${stream.running ? "pulse-dot bg-seal" : "bg-ledger"}`} aria-hidden />
      </div>
      <p className="mt-3 font-serif text-2xl leading-tight">
        {stream.running ? "Ada is working." : task ? "Ada will act shortly." : idleCopy(agreement)}
      </p>
      {draft && (
        <pre className="mt-4 max-h-44 overflow-hidden whitespace-pre-wrap border-t border-paper/15 pt-3 font-mono text-[0.72rem] leading-relaxed text-paper/80 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
          {draft.slice(-900)}
          <span className="caret" />
        </pre>
      )}
      {log.length > 0 && (
        <ol className="mt-4 grid gap-2 border-t border-paper/15 pt-3 text-sm">
          {log.map((l, i) => (
            <li key={i} className="grid grid-cols-[3.5rem_1fr] gap-2">
              <span className="font-mono text-[0.68rem] text-paper/40">
                {new Date(l.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={l.tone === "ledger" ? "text-[var(--ledger-wash)]" : l.tone === "seal" ? "text-seal" : "text-paper/85"}>
                {l.text} {l.hash && <span className="[&_a]:text-paper/60"><TxLink hash={l.hash} /></span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      {stream.running && !draft && (
        <p className="mt-3 text-paper/60">
          <Dots label="thinking" />
        </p>
      )}
      {error && (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-seal">
          <span>{error}</span>
          <button className="btn btn-sm border-paper/40 text-paper" onClick={() => nudge(true)}>
            Retry
          </button>
        </div>
      )}
    </section>
  );
}

const TX_COPY: Record<string, string> = {
  accept: "Accepted the agreement on-chain",
  decline: "Declined; the escrow was refunded",
  deliver: "Delivered the work on-chain",
  evidence: "Filed a statement with the tribunal",
  claim: "Claimed payment after the review period",
  finalize: "Executed the final ruling",
};

function idleCopy(a: AgreementView) {
  if (a.status === "Closed") return "Done. Thanks for the work.";
  if (a.status === "Cancelled") return "This agreement was withdrawn.";
  const m = a.milestones.find((x) => x.phase === "Delivered");
  if (m) return "Waiting for your review.";
  if (a.milestones.some((x) => x.phase === "Disputed")) return "Statement filed. Waiting for the tribunal.";
  return "Standing by.";
}
