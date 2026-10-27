import type { Metadata } from "next";
import Link from "next/link";
import { Seal } from "@/components/seal";
import { JURORS } from "@/lib/schemas";
import { agreementNumber, formatDate, roman } from "@/lib/format";
import { readPrecedents } from "@/lib/server/precedents";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Precedents",
  description: "Every ruling of the Pactum AI tribunal, with each juror's reasoning, published on IPFS.",
};

export default async function PrecedentsPage() {
  const precedents = await readPrecedents();
  return (
    <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6 lg:py-16">
      <div className="grid gap-8 border-b border-ink pb-10 lg:grid-cols-[1fr_380px] lg:items-end">
        <div>
          <p className="label">Reports of the Pactum tribunal · vol. I</p>
          <h1 className="display mt-3 text-[clamp(3rem,7vw,6rem)]">Precedents</h1>
        </div>
        <p className="leading-relaxed text-ink-2">
          Every dispute decided on Pactum, in the open. Each ruling links to its full record on IPFS: the evidence, all three
          jurors’ opinions, the models and the prompt version that produced them.
        </p>
      </div>

      {precedents.length === 0 ? (
        <div className="grid place-items-center px-6 py-24 text-center">
          <Seal seed="no-precedents" ghost size={140} className="text-ink" />
          <p className="display mt-6 text-3xl">No rulings yet.</p>
          <p className="mt-2 max-w-md text-ink-3">
            The first dispute settled by the tribunal will appear here. Try it yourself: hire Ada, dispute a delivery, and convene the
            tribunal.
          </p>
          <Link href="/draft" className="btn btn-ink mt-6">
            Draft an agreement
          </Link>
        </div>
      ) : (
        <ol>
          {precedents.map((p) => {
            const award = p.ruling.aggregation.providerBps / 100;
            return (
              <li key={`${p.agreementId}-${p.milestone}`} className="border-b border-rule">
                <Link
                  href={`/a/${p.agreementId}#m${p.milestone}`}
                  className="group grid gap-6 py-8 md:grid-cols-[150px_1fr_220px]"
                >
                  <div className="flex items-start gap-3 md:flex-col">
                    <Seal seed={p.seed} number={p.agreementId} size={72} className="text-seal" />
                    <div>
                      <p className="font-mono text-xs">
                        {agreementNumber(p.agreementId)} · {roman(p.milestone + 1)}
                      </p>
                      <p className="font-mono text-[0.68rem] text-ink-4">{formatDate(p.ruledAt, false)}</p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="label">
                      {p.category} · {p.amount} · {p.title}
                    </p>
                    <h2 className="mt-2 font-serif text-3xl leading-tight group-hover:text-seal">{p.ruling.opinion.title}</h2>
                    <p className="mt-3 max-w-3xl font-serif text-lg italic leading-snug text-ink-2">{p.ruling.opinion.holding}</p>
                    {p.ruling.opinion.dissent && (
                      <p className="mt-3 text-sm text-ink-3">
                        <span className="label mr-2">Dissent</span>
                        {p.ruling.opinion.dissent}
                      </p>
                    )}
                  </div>
                  <div className="md:text-right">
                    <p className="label">Awarded to provider</p>
                    <p className="display text-6xl tabular">{award}%</p>
                    <div className="mt-3 flex gap-3 font-mono text-[0.7rem] text-ink-3 md:justify-end">
                      {p.ruling.jurors.map((j, i) => (
                        <span key={j.id} title={j.name}>
                          {JURORS[i]?.seat ?? i + 1}: {j.opinion.providerSharePercent}%
                        </span>
                      ))}
                    </div>
                    {p.ruling.simulated && <p className="mt-2 font-mono text-[0.62rem] uppercase text-ink-4">simulated</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
