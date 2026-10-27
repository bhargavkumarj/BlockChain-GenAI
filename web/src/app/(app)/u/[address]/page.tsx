import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { Seal } from "@/components/seal";
import { Pill } from "@/components/ui";
import { PHASE_COPY, STATUS_COPY, focusMilestone, roleOf, sealSeed } from "@/lib/agreement";
import { AGENT_ADDRESS, ARBITER_ADDRESS, IS_CONFIGURED, explorerAddress, tokenFor } from "@/lib/config";
import { agreementNumber, formatAmount, formatDate, shortAddress } from "@/lib/format";
import { loadTerms } from "@/lib/server/case-file";
import { readAgreementsOf, readTrackRecord } from "@/lib/server/chain";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/u/[address]">): Promise<Metadata> {
  const { address } = await props.params;
  return { title: isAddress(address) ? `Track record of ${shortAddress(address)}` : "Profile" };
}

export default async function ProfilePage(props: PageProps<"/u/[address]">) {
  const raw = (await props.params).address;
  if (!isAddress(raw)) notFound();
  const address = getAddress(raw);
  const isAgent = AGENT_ADDRESS === address;
  const isArbiter = ARBITER_ADDRESS === address;

  const [record, agreements] = IS_CONFIGURED
    ? await Promise.all([readTrackRecord(address), readAgreementsOf(address)]).catch(() => [null, []] as const)
    : [null, []];
  const titles = await Promise.all(agreements.map((a) => loadTerms(a.termsCID).then((t) => t?.draft.title ?? null)));
  const explorer = explorerAddress(address);

  const stats = record
    ? ([
        ["As client", record.asClient],
        ["As provider", record.asProvider],
        ["Fulfilled", record.completed],
        ["Milestones paid", record.milestonesPaid],
        ["Disputes", record.disputes],
        ["Favourable rulings", record.favorableRulings],
      ] as const)
    : [];

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6 lg:py-16">
      <p className="label">{isAgent ? "Autonomous agent" : isArbiter ? "Tribunal signer" : "Track record"} · on-chain, portable</p>
      <h1 className="display mt-3 break-all text-[clamp(2rem,5vw,4.25rem)]">
        {isAgent ? "Ada" : isArbiter ? "The Pactum Tribunal" : shortAddress(address, 6)}
      </h1>
      <p className="mt-2 break-all font-mono text-sm text-ink-3">
        {address}{" "}
        {explorer && (
          <a className="link" href={explorer} target="_blank" rel="noreferrer">
            ↗
          </a>
        )}
      </p>
      {isAgent && (
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
          Ada is an AI agent with its own wallet. It reads the agreements it is offered, accepts the ones it can fulfil, writes and
          pins its deliverables, and answers for its work before the tribunal. Every step is an on-chain transaction it signs
          itself.
        </p>
      )}
      {isArbiter && (
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-2">
          This key signs the tribunal’s EIP-712 rulings. It can only split a milestone that is already in dispute, after due
          process; it can never move funds on its own.
        </p>
      )}

      {record && (
        <dl className="mt-10 grid grid-cols-2 border-y border-ink sm:grid-cols-3 lg:grid-cols-6">
          {stats.map(([label, value]) => (
            <div key={label} className="border-rule px-1 py-5 sm:px-4 [&:not(:last-child)]:border-r">
              <dt className="label">{label}</dt>
              <dd className="display mt-2 text-5xl tabular">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <h2 className="label mt-14">Recent agreements</h2>
      {agreements.length === 0 ? (
        <p className="mt-4 text-ink-3">No agreements yet.</p>
      ) : (
        <ul className="mt-2">
          {agreements.map((a, i) => {
            const role = roleOf(a, address);
            const focus = focusMilestone(a);
            const phase = a.status === "Active" && focus ? PHASE_COPY[focus.phase] : STATUS_COPY[a.status];
            const token = tokenFor(a.token);
            return (
              <li key={a.id} className="border-b border-rule">
                <Link href={`/a/${a.id}`} className="group grid grid-cols-[48px_1fr_auto] items-center gap-4 py-4">
                  <Seal seed={sealSeed(a)} number={a.id} size={48} className="text-seal" />
                  <div className="min-w-0">
                    <p className="label">
                      {agreementNumber(a.id)} · as {role} · {formatDate(a.createdAt, false)}
                    </p>
                    <p className="truncate font-serif text-xl group-hover:text-seal">{titles[i] ?? "Untitled"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Pill tone={phase.tone}>{phase.label}</Pill>
                    <span className="tabular hidden font-mono sm:inline">
                      {formatAmount(a.total, token.decimals)} {token.symbol}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
