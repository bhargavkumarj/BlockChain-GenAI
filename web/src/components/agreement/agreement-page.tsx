"use client";

import Link from "next/link";
import { useConnection } from "wagmi";
import { AgreementDocument } from "@/components/draft/agreement-document";
import { Seal } from "@/components/seal";
import { AddressTag, Countdown, Pill, SectionLabel, useNow } from "@/components/ui";
import { useAgreement, useIpfsJson } from "@/hooks/use-agreement";
import {
  type AgreementView,
  type Role,
  STATUS_COPY,
  clock,
  focusMilestone,
  roleOf,
  sealSeed,
} from "@/lib/agreement";
import { CHAIN_LABEL, IS_CONFIGURED, PACTUM_ADDRESS, explorerAddress, tokenFor } from "@/lib/config";
import { agreementNumber, describeWindow, formatAmount, formatDate, roman } from "@/lib/format";
import { TermsDocument } from "@/lib/schemas";
import { ipfsUrl } from "@/lib/upload";
import { ProposalActions } from "./actions";
import { AdaDesk } from "./ada-desk";
import { ClerkChat } from "./clerk-chat";
import { MilestoneCard } from "./milestone-card";

export function AgreementPage({ id }: { id: number }) {
  const { address } = useConnection();
  const now = useNow();
  const { data: agreement, isLoading, error, refetch } = useAgreement(id);
  const { data: terms } = useIpfsJson(agreement?.termsCID, TermsDocument);

  if (!IS_CONFIGURED) return <Centered title="Contracts not configured" body="This deployment has no Pactum contract address yet." />;
  if (isLoading) return <PageSkeleton />;
  if (error || !agreement)
    return <Centered title={`No agreement ${agreementNumber(id)}`} body="It may not exist yet on this network." />;

  const role = roleOf(agreement, address);
  const token = tokenFor(agreement.token);
  const focus = focusMilestone(agreement);
  const draft = terms?.draft;
  const sync = () => void refetch();

  return (
    <div className="mx-auto max-w-[1320px] px-4 sm:px-6">
      <header className="grid gap-8 border-b border-rule py-10 lg:grid-cols-[1fr_auto] lg:py-14">
        <div className="min-w-0">
          <p className="label">
            {agreementNumber(agreement.id)} · Sealed {formatDate(agreement.createdAt, false)} · {CHAIN_LABEL}
          </p>
          <h1 className="display mt-4 text-[clamp(2.5rem,6vw,5.25rem)]">
            {draft?.title ?? <span className="inline-block h-[0.8em] w-2/3 skeleton align-middle" />}
          </h1>
          {draft?.summary && <p className="mt-5 max-w-3xl text-lg leading-relaxed text-ink-2">{draft.summary}</p>}
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Pill tone={STATUS_COPY[agreement.status].tone} live={agreement.status === "Active"}>
              {STATUS_COPY[agreement.status].label}
            </Pill>
            <span className="tabular font-mono">
              {formatAmount(agreement.total, token.decimals)} <span className="text-ink-3">{token.symbol} escrowed</span>
            </span>
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
            <div>
              <dt className="label">Client{draft && draft.clientLabel !== "Client" ? ` · ${draft.clientLabel}` : ""}</dt>
              <dd className="mt-1">
                <AddressTag address={agreement.client} you={role === "client"} />
              </dd>
            </div>
            <div>
              <dt className="label">Provider{draft && draft.providerLabel !== "Provider" ? ` · ${draft.providerLabel}` : ""}</dt>
              <dd className="mt-1">
                <AddressTag address={agreement.provider} you={role === "provider"} />
              </dd>
            </div>
          </dl>
          <div className="mt-7">
            <ProposalActions agreement={agreement} role={role} onDone={sync} />
          </div>
        </div>
        <div className="flex justify-center text-seal lg:block lg:pt-6">
          <Seal seed={sealSeed(agreement)} number={agreement.id} size={220} animate />
        </div>
      </header>

      <div className="grid gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <SectionLabel n="I">Milestones</SectionLabel>
          <div className="mt-2">
            {agreement.milestones.map((m) => (
              <MilestoneCard
                key={m.index}
                agreement={agreement}
                milestone={m}
                terms={draft?.milestones[m.index]}
                role={role}
                me={address}
                now={now}
                focused={m.index === focus?.index}
                onChange={sync}
              />
            ))}
          </div>

          <div className="mt-10">
            <SectionLabel n="II">The agreement as sealed</SectionLabel>
            <div className="mt-6">
              {draft ? (
                <AgreementDocument
                  draft={draft}
                  label={`Terms · ipfs://${agreement.termsCID.slice(0, 14)}…`}
                  currency={token.symbol}
                  clientName={<AddressTag address={agreement.client} />}
                  providerName={<AddressTag address={agreement.provider} />}
                />
              ) : (
                <div className="h-64 skeleton" />
              )}
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-6 lg:sticky lg:top-24 lg:self-start">
          <NextStep agreement={agreement} role={role} now={now} />
          <AdaDesk agreement={agreement} onAction={sync} />
          <ClerkChat agreementId={agreement.id} />
          <RecordFacts agreement={agreement} />
        </aside>
      </div>
    </div>
  );
}

function NextStep({ agreement, role, now }: { agreement: AgreementView; role: Role; now: number }) {
  const m = focusMilestone(agreement);
  const n = m ? roman(m.index + 1) : "";
  const c = m && agreement.status === "Active" ? clock(agreement, m, now) : null;
  let text: string;
  if (agreement.status === "Proposed") {
    text =
      role === "provider"
        ? "The client has already escrowed the full amount. Review the terms and accept to start work."
        : role === "client"
          ? "Waiting for the provider to accept. Until then you can withdraw for a full refund."
          : "Waiting for the provider to accept the terms.";
  } else if (agreement.status === "Closed") {
    text = "Fulfilled. Every milestone is settled, and both parties’ track records were updated on-chain.";
  } else if (agreement.status === "Cancelled") {
    text = "Withdrawn before work began. The escrow was refunded in full.";
  } else if (!m) {
    text = "";
  } else if (m.phase === "Pending") {
    text =
      role === "provider"
        ? `Deliver milestone ${n}. Upload the work; it is pinned to IPFS and timestamped on-chain.`
        : `The provider is working on milestone ${n}. You can release payment early, or reclaim it if the deadline passes undelivered.`;
  } else if (m.phase === "Delivered") {
    text =
      role === "client"
        ? `Review milestone ${n}. Approve to release payment, or open a dispute before the review period ends. If you do nothing, the provider can claim payment.`
        : role === "provider"
          ? `Waiting for the client's review of milestone ${n}. If they stay silent, you can claim payment when the review period ends.`
          : `Milestone ${n} is under review.`;
  } else if (m.phase === "Disputed") {
    text = `Milestone ${n} is in dispute. Each side files its account; the AI tribunal can convene once both have filed or the evidence window closes.`;
  } else if (m.phase === "Ruled") {
    text = `The tribunal has ruled on milestone ${n}. Either party may appeal to the human court before the window closes; then anyone can execute it.`;
  } else if (m.phase === "Appealed") {
    text = `Milestone ${n} is before the human appeal court. Both sides can still add evidence or settle.`;
  } else {
    text = "";
  }
  return (
    <section className="border-l-2 border-seal pl-4">
      <p className="label">What happens next{role !== "viewer" ? ` · you are the ${role}` : ""}</p>
      <p className="mt-2 font-serif text-[1.35rem] leading-snug">{text}</p>
      {c && c.remaining > 0 && (
        <p className="mt-3">
          <Countdown endsAt={c.endsAt} label={c.label} />
        </p>
      )}
      {role === "viewer" && agreement.status !== "Closed" && (
        <p className="mt-3 text-sm text-ink-3">You are viewing a public agreement. Connect as one of the parties to act on it.</p>
      )}
    </section>
  );
}

function RecordFacts({ agreement }: { agreement: AgreementView }) {
  const contract = PACTUM_ADDRESS ? explorerAddress(PACTUM_ADDRESS) : undefined;
  const rows: [string, React.ReactNode][] = [
    ["Contract", contract ? <a className="link" href={contract} target="_blank" rel="noreferrer">{PACTUM_ADDRESS?.slice(0, 10)}… ↗</a> : PACTUM_ADDRESS?.slice(0, 10)],
    ["Terms", <a key="t" className="link" href={ipfsUrl(agreement.termsCID)} target="_blank" rel="noreferrer">ipfs://{agreement.termsCID.slice(0, 12)}… ↗</a>],
    ["Block", agreement.createdBlock.toString()],
    ["Review period", describeWindow(agreement.reviewPeriod)],
    ["Evidence window", describeWindow(agreement.responseWindow)],
    ["Appeals", agreement.appealWindow ? describeWindow(agreement.appealWindow) : "Rulings are final"],
    ["Arbiter", <AddressTag key="a" address={agreement.arbiter} />],
  ];
  return (
    <section>
      <p className="label">On the record</p>
      <dl className="mt-3 grid gap-2 border-t border-rule pt-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-right font-mono text-[0.78rem]">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Centered({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-4 text-center">
      <div>
        <Seal seed={title} ghost size={140} className="mx-auto text-ink" />
        <h1 className="display mt-6 text-4xl">{title}</h1>
        <p className="mt-2 text-ink-3">{body}</p>
        <Link href="/draft" className="btn btn-ink mt-6">
          Draft an agreement
        </Link>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1320px] gap-6 px-4 py-14 sm:px-6">
      <div className="h-4 w-60 skeleton" />
      <div className="h-20 w-3/4 skeleton" />
      <div className="h-5 w-1/2 skeleton" />
      <div className="mt-10 h-72 skeleton" />
    </div>
  );
}

