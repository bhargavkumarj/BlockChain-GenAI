"use client";

import { useEffect, useState } from "react";
import { Countdown, Notice, Pill, SplitBar } from "@/components/ui";
import {
  type AgreementView,
  type MilestoneView,
  PHASE_COPY,
  type Role,
  clock,
  isTerminal,
} from "@/lib/agreement";
import { tokenFor } from "@/lib/config";
import { formatAmount, formatDate, formatDuration, roman } from "@/lib/format";
import type { DraftMilestone } from "@/lib/schemas";
import { MilestoneActions } from "./actions";
import { DeliveryView, FilingsView } from "./records";
import { RecordedRuling, TribunalSession } from "./tribunal";

export function MilestoneCard({
  agreement,
  milestone,
  terms,
  role,
  me,
  now,
  focused,
  onChange,
}: {
  agreement: AgreementView;
  milestone: MilestoneView;
  terms?: DraftMilestone;
  role: Role;
  me?: string;
  now: number;
  focused: boolean;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(focused || milestone.disputedAt > 0);
  useEffect(() => {
    if (focused || milestone.disputedAt > 0) setOpen(true);
  }, [focused, milestone.disputedAt]);
  const token = tokenFor(agreement.token);
  const copy = PHASE_COPY[milestone.phase];
  const c = agreement.status === "Active" ? clock(agreement, milestone, now) : null;
  const evidenceClosed =
    (milestone.clientFiled && milestone.providerFiled) || now >= milestone.disputedAt + agreement.responseWindow;

  return (
    <article className={`border-t py-8 ${focused ? "border-ink" : "border-rule"}`} id={`m${milestone.index}`}>
      <header className="grid grid-cols-[3rem_1fr] gap-x-4 gap-y-3 sm:grid-cols-[4rem_1fr_auto]">
        <span className={`font-serif text-5xl italic leading-none ${focused ? "text-seal" : "text-ink-4"}`}>{roman(milestone.index + 1)}</span>
        <div className="min-w-0">
          <h3 className="font-serif text-[1.9rem] leading-tight">{terms?.title ?? `Milestone ${roman(milestone.index + 1)}`}</h3>
          {terms?.description && <p className="mt-1 max-w-2xl text-ink-2">{terms.description}</p>}
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-1 sm:flex-col sm:items-end">
          <span className="tabular font-mono text-lg">
            {formatAmount(milestone.amount, token.decimals)} <span className="text-ink-3">{token.symbol}</span>
          </span>
          <Pill tone={copy.tone} live={!isTerminal(milestone.phase) && agreement.status === "Active"}>
            {copy.label}
          </Pill>
          {c && c.remaining > 0 && <Countdown endsAt={c.endsAt} label={c.label} />}
        </div>
      </header>

      <Rail agreement={agreement} milestone={milestone} />

      {!open ? (
        <button className="mt-5 font-mono text-[0.7rem] uppercase tracking-wider text-ink-3 hover:text-ink" onClick={() => setOpen(true)}>
          Show details +
        </button>
      ) : (
        <div className="mt-6 grid gap-8 sm:pl-20">
          {terms && terms.acceptanceCriteria.length > 0 && !milestone.deliveredAt && (
            <div>
              <p className="label">Acceptance criteria</p>
              <ul className="mt-2 grid gap-1.5 text-[0.95rem]">
                {terms.acceptanceCriteria.map((a, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-[0.3rem] size-3 shrink-0 border border-ink/60" aria-hidden />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DeliveryView agreement={agreement} milestone={milestone} />
          <FilingsView agreement={agreement} milestone={milestone} me={me} />

          {milestone.phase === "Disputed" &&
            (evidenceClosed ? (
              <TribunalSession agreement={agreement} milestone={milestone} onExecuted={onChange} />
            ) : (
              <Notice tone="amber">
                The evidence window is open for another {formatDuration(milestone.disputedAt + agreement.responseWindow - now)}. The
                tribunal can convene as soon as both sides have filed, or when the window closes.
              </Notice>
            ))}

          {milestone.rulingCID && <RecordedRuling cid={milestone.rulingCID} />}

          {isTerminal(milestone.phase) && <Outcome agreement={agreement} milestone={milestone} />}

          <MilestoneActions agreement={agreement} milestone={milestone} role={role} now={now} onDone={onChange} />
        </div>
      )}
    </article>
  );
}

function Outcome({ agreement, milestone }: { agreement: AgreementView; milestone: MilestoneView }) {
  const token = tokenFor(agreement.token);
  const label =
    milestone.phase === "Released"
      ? "Released in full to the provider"
      : milestone.phase === "Refunded"
        ? "Returned in full to the client"
        : milestone.rulingCID
          ? "Divided by the tribunal’s ruling"
          : "Divided by mutual settlement";
  return (
    <div className="border border-rule bg-sheet p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-serif text-xl">{label}</p>
        <p className="font-mono text-xs text-ink-3">{milestone.closedAt ? formatDate(milestone.closedAt) : ""}</p>
      </div>
      <div className="mt-4">
        <SplitBar providerBps={milestone.providerBps} />
      </div>
      <p className="mt-2 font-mono text-xs text-ink-3">
        {formatAmount(milestone.amount, token.decimals)} {token.symbol} settled · protocol fee taken from the provider’s share only
      </p>
    </div>
  );
}

/** The milestone's life so far, as a ruled timeline of on-chain timestamps. */
function Rail({ agreement, milestone }: { agreement: AgreementView; milestone: MilestoneView }) {
  const steps: { label: string; at: number; tone?: "seal" | "ledger" }[] = [
    { label: "Escrowed", at: agreement.createdAt },
    { label: "Delivered", at: milestone.deliveredAt },
  ];
  if (milestone.disputedAt) steps.push({ label: "Disputed", at: milestone.disputedAt, tone: "seal" });
  if (milestone.ruledAt) steps.push({ label: "Ruled", at: milestone.ruledAt, tone: "seal" });
  const final =
    milestone.phase === "Released" ? "Paid" : milestone.phase === "Refunded" ? "Refunded" : milestone.phase === "Resolved" ? "Settled" : "Settled";
  steps.push({ label: final, at: milestone.closedAt, tone: "ledger" });

  return (
    <ol className="mt-6 grid gap-0 sm:ml-20" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const done = s.at > 0;
        return (
          <li key={s.label} className="relative pr-2">
            <div className="flex items-center">
              <span
                className={`size-2.5 shrink-0 rotate-45 border ${
                  done ? (s.tone === "seal" ? "border-seal bg-seal" : s.tone === "ledger" ? "border-ledger bg-ledger" : "border-ink bg-ink") : "border-rule-strong bg-paper"
                }`}
              />
              {i < steps.length - 1 && <span className={`h-px flex-1 ${steps[i + 1]!.at > 0 ? "bg-ink" : "bg-rule"}`} />}
            </div>
            <p className={`mt-2 font-mono text-[0.65rem] uppercase tracking-wider ${done ? "text-ink" : "text-ink-4"}`}>{s.label}</p>
            <p className="font-mono text-[0.62rem] text-ink-4">{done ? formatDate(s.at) : "—"}</p>
          </li>
        );
      })}
    </ol>
  );
}
