"use client";

import type { ReactNode } from "react";
import { AutoTextarea } from "@/components/ui";
import type { AgreementDraft, DraftMilestone } from "@/lib/schemas";
import { roman } from "@/lib/format";

export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type PartialDraft = DeepPartial<AgreementDraft>;

type Props = {
  draft: PartialDraft;
  streaming?: boolean;
  editable?: boolean;
  onChange?: (next: AgreementDraft) => void;
  clientName?: ReactNode;
  providerName?: ReactNode;
  currency?: string;
  /** Rendered beside each milestone heading (e.g. on-chain phase on the agreement page). */
  milestoneAside?: (index: number) => ReactNode;
  seal?: ReactNode;
  label?: string;
};

/**
 * The agreement, typeset like a document. Renders partial JSON while Scribe is still writing, and becomes an
 * inline editor once the draft is complete.
 */
export function AgreementDocument({
  draft,
  streaming = false,
  editable = false,
  onChange,
  clientName,
  providerName,
  currency,
  milestoneAside,
  seal,
  label = "Agreement · draft",
}: Props) {
  const full = draft as AgreementDraft;
  const canEdit = editable && !streaming && Boolean(onChange);
  const cur = currency ?? draft.currency ?? "tUSD";
  const milestones = (draft.milestones ?? []) as DeepPartial<DraftMilestone>[];
  const total = milestones.reduce((sum, m) => sum + (Number(m?.amount) || 0), 0);

  function update(mutate: (d: AgreementDraft) => void) {
    if (!onChange) return;
    const next = structuredClone(full);
    mutate(next);
    onChange(next);
  }

  return (
    <article className="sheet relative px-6 pb-12 pt-8 sm:px-12 sm:pt-12">
      <div className="pointer-events-none absolute right-5 top-5 text-seal sm:right-8 sm:top-8">{seal}</div>
      <p className="label">{label}</p>

      {canEdit ? (
        <AutoTextarea
          className="display mt-4 max-w-[78%] text-[clamp(2rem,4.2vw,3.25rem)] leading-[1] focus:underline focus:decoration-rule-strong focus:decoration-1 focus:underline-offset-8"
          value={full.title}
          onChange={(v) => update((d) => void (d.title = v))}
          aria-label="Agreement title"
        />
      ) : (
        <h2 className={`display mt-4 max-w-[78%] text-[clamp(2rem,4.2vw,3.25rem)] leading-[1] ${streaming && !draft.summary ? "caret" : ""}`}>
          {draft.title || <span className="text-ink-4">Untitled agreement</span>}
        </h2>
      )}

      {draft.summary !== undefined && (
        <p className={`mt-5 max-w-2xl text-lg leading-relaxed text-ink-2 ${streaming && !draft.milestones ? "caret" : ""}`}>
          {draft.summary}
        </p>
      )}

      <dl className="mt-8 grid gap-4 border-y border-rule py-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="label">Client</dt>
          <dd className="mt-1">{clientName ?? draft.clientLabel ?? "—"}</dd>
        </div>
        <div>
          <dt className="label">Provider</dt>
          <dd className="mt-1">{providerName ?? draft.providerLabel ?? "—"}</dd>
        </div>
        <div>
          <dt className="label">Total in escrow</dt>
          <dd className="tabular mt-1 font-mono">
            {total.toLocaleString("en-US", { maximumFractionDigits: 6 })} {cur}
          </dd>
        </div>
      </dl>

      {milestones.length > 0 && (
        <section className="mt-10">
          <h3 className="label">Milestones</h3>
          <ol className="mt-4 grid gap-8">
            {milestones.map((m, i) => (
              <li key={i} className="grid gap-x-6 gap-y-3 sm:grid-cols-[3.5rem_1fr]">
                <span className="font-serif text-4xl italic leading-none text-seal">{roman(i + 1)}</span>
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    {canEdit ? (
                      <AutoTextarea
                        className="min-w-[12ch] flex-1 basis-56 font-serif text-2xl leading-tight focus:underline focus:decoration-rule-strong"
                        value={full.milestones[i]!.title}
                        onChange={(v) => update((d) => void (d.milestones[i]!.title = v))}
                        aria-label={`Milestone ${i + 1} title`}
                      />
                    ) : (
                      <h4 className="font-serif text-2xl leading-tight">{m?.title}</h4>
                    )}
                    <div className="flex shrink-0 items-center gap-4 font-mono text-sm">
                      {milestoneAside?.(i)}
                      {canEdit ? (
                        <>
                          <label className="flex items-center gap-1 text-ink-3">
                            due in
                            <input
                              type="number"
                              min={1}
                              className="field w-9 py-0 text-right text-ink"
                              value={full.milestones[i]!.dueInDays}
                              onChange={(e) => update((d) => void (d.milestones[i]!.dueInDays = Math.max(1, Number(e.target.value) || 1)))}
                              aria-label={`Milestone ${i + 1} due in days`}
                            />
                            d
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className="field tabular w-20 py-0 text-right"
                              value={full.milestones[i]!.amount}
                              onChange={(e) => update((d) => void (d.milestones[i]!.amount = Math.max(0, Number(e.target.value) || 0)))}
                              aria-label={`Milestone ${i + 1} amount`}
                            />
                            <span className="text-ink-3">{cur}</span>
                          </label>
                        </>
                      ) : (
                        <>
                          {m?.dueInDays !== undefined && <span className="text-ink-3">due in {m.dueInDays}d</span>}
                          {m?.amount !== undefined && (
                            <span className="tabular">
                              {Number(m.amount).toLocaleString("en-US", { maximumFractionDigits: 6 })} {cur}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {m?.description && <p className="mt-2 max-w-2xl leading-relaxed text-ink-2">{m.description}</p>}
                  <div className="mt-4 grid gap-6 md:grid-cols-2">
                    {m?.deliverables && m.deliverables.length > 0 && (
                      <div>
                        <p className="label">Deliverables</p>
                        <ul className="mt-2 grid gap-1.5 text-[0.95rem] text-ink-2">
                          {m.deliverables.map((d, k) => (
                            <li key={k} className="flex gap-2">
                              <span className="text-ink-4">—</span>
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m?.acceptanceCriteria && m.acceptanceCriteria.length > 0 && (
                      <div>
                        <p className="label">Acceptance criteria</p>
                        <ul className="mt-2 grid gap-1.5 text-[0.95rem]">
                          {m.acceptanceCriteria.map((c, k) => (
                            <li key={k} className="group flex gap-2.5">
                              <span className="mt-[0.3rem] size-3 shrink-0 border border-ink/60" aria-hidden />
                              {canEdit ? (
                                <>
                                  <AutoTextarea
                                    className="min-w-0 flex-1 leading-snug focus:underline focus:decoration-rule-strong"
                                    value={full.milestones[i]!.acceptanceCriteria[k] ?? ""}
                                    onChange={(v) => update((d) => void (d.milestones[i]!.acceptanceCriteria[k] = v))}
                                    aria-label={`Criterion ${k + 1}`}
                                  />
                                  <button
                                    type="button"
                                    className="text-ink-4 opacity-0 transition-opacity hover:text-seal group-hover:opacity-100 focus:opacity-100"
                                    onClick={() => update((d) => void d.milestones[i]!.acceptanceCriteria.splice(k, 1))}
                                    aria-label={`Remove criterion ${k + 1}`}
                                  >
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <span>{c}</span>
                              )}
                            </li>
                          ))}
                          {canEdit && (
                            <li>
                              <button
                                type="button"
                                className="font-mono text-xs uppercase tracking-wider text-ink-3 hover:text-seal"
                                onClick={() => update((d) => void d.milestones[i]!.acceptanceCriteria.push("New criterion"))}
                              >
                                + Add criterion
                              </button>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {draft.clauses && draft.clauses.length > 0 && (
        <section className="mt-12 border-t border-rule pt-8">
          <h3 className="label">Terms</h3>
          <ol className="mt-4 grid gap-4 md:grid-cols-2">
            {draft.clauses.map((c, i) => (
              <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-2">
                <span className="font-serif text-xl italic text-ink-3">§ {i + 1}</span>
                <div>
                  <p className="font-medium">{c?.heading}</p>
                  <p className="mt-1 text-[0.95rem] leading-relaxed text-ink-2">{c?.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {streaming && <div className="mt-8 h-3 w-40 skeleton" aria-hidden />}
    </article>
  );
}
