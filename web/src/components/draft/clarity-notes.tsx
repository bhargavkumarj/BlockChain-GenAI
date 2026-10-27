import type { PartialDraft } from "./agreement-document";

/** Scribe's editorial notes, set as red-pen marginalia beside the document. */
export function ClarityNotes({ clarity, streaming }: { clarity: PartialDraft["clarity"]; streaming: boolean }) {
  const score = clarity?.score;
  const issues = clarity?.issues ?? [];
  const tone = score === undefined ? "text-ink-4" : score >= 80 ? "text-ledger" : score >= 60 ? "text-amber" : "text-seal";
  return (
    <aside className="border-l-2 border-seal/60 pl-4">
      <p className="label">Scribe’s notes</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`display text-6xl ${tone}`}>{score ?? "··"}</span>
        <span className="font-mono text-xs text-ink-3">/ 100 clarity</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-3">How enforceable the agreement is as written. The tribunal can only judge what it can check.</p>
      <ul className="mt-5 grid gap-4">
        {issues.map((issue, i) => (
          <li key={i} className="animate-ink-in">
            <p className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-wider">
              <span
                className={
                  issue?.severity === "high" ? "text-seal" : issue?.severity === "medium" ? "text-amber" : "text-ink-3"
                }
              >
                ● {issue?.severity}
              </span>
              <span className="text-ink-3">{issue?.clause}</span>
            </p>
            <p className="mt-1 font-serif text-[1.05rem] italic leading-snug text-seal">{issue?.issue}</p>
            {issue?.suggestion && <p className="mt-1 text-sm leading-snug text-ink-2">→ {issue.suggestion}</p>}
          </li>
        ))}
        {streaming && !issues.length && <li className="h-12 skeleton" aria-hidden />}
      </ul>
    </aside>
  );
}
