"use client";

import Link from "next/link";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { Seal } from "@/components/seal";
import { Pill, SectionLabel, useNow } from "@/components/ui";
import { openWalletModal } from "@/components/wallet/wallet-button";
import { useIpfsJson } from "@/hooks/use-agreement";
import { pactumAbi } from "@/lib/abi";
import {
  type AgreementView,
  PHASE_COPY,
  type Role,
  STATUS_COPY,
  availableActions,
  focusMilestone,
  roleOf,
  sealSeed,
  toAgreementView,
} from "@/lib/agreement";
import { PACTUM_ADDRESS, tokenFor } from "@/lib/config";
import { agreementNumber, formatAmount, formatDate, roman, shortAddress } from "@/lib/format";
import { TermsDocument } from "@/lib/schemas";

export function Ledger() {
  const { address } = useConnection();
  const ids = useReadContract({
    address: PACTUM_ADDRESS,
    abi: pactumAbi,
    functionName: "agreementsOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && PACTUM_ADDRESS), refetchInterval: 8000 },
  });
  const list = [...(ids.data ?? [])].reverse();
  const agreements = useReadContracts({
    contracts: list.map((id) => ({ address: PACTUM_ADDRESS!, abi: pactumAbi, functionName: "getAgreement", args: [id] }) as const),
    query: { enabled: list.length > 0, refetchInterval: 8000 },
  });
  const views: AgreementView[] = (agreements.data ?? [])
    .map((r, i) => (r.status === "success" ? toAgreementView(list[i]!, r.result) : null))
    .filter((v): v is AgreementView => v !== null);

  return (
    <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6 lg:py-16">
      <p className="label">Your ledger</p>
      <h1 className="display mt-3 text-[clamp(2.75rem,6vw,5rem)]">Everything you have signed.</h1>
      {!address ? (
        <div className="mt-10 border border-rule bg-sheet p-8">
          <p className="max-w-lg text-ink-2">Connect a wallet to see agreements where you are the client or the provider.</p>
          <button className="btn btn-ink mt-5" onClick={openWalletModal}>
            Connect
          </button>
        </div>
      ) : (
        <>
          <TrackRecord address={address} />
          <div className="mt-12">
            <SectionLabel>{list.length} agreement{list.length === 1 ? "" : "s"}</SectionLabel>
          </div>
          {ids.isLoading || agreements.isLoading ? (
            <div className="mt-6 grid gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 skeleton" />
              ))}
            </div>
          ) : views.length === 0 ? (
            <div className="mt-8 grid place-items-center border border-dashed border-rule-strong px-6 py-16 text-center">
              <Seal seed="ledger-empty" ghost size={120} className="text-ink" />
              <p className="display mt-5 text-3xl">Nothing sealed yet.</p>
              <Link href="/draft" className="btn btn-ink mt-5">
                Draft your first agreement
              </Link>
            </div>
          ) : (
            <ul className="mt-2">
              {views.map((a) => (
                <Row key={a.id} agreement={a} role={roleOf(a, address)} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function TrackRecord({ address }: { address: `0x${string}` }) {
  const { data } = useReadContract({
    address: PACTUM_ADDRESS,
    abi: pactumAbi,
    functionName: "records",
    args: [address],
    query: { enabled: Boolean(PACTUM_ADDRESS) },
  });
  const [asClient, asProvider, completed, paid, disputes, favorable] = data ?? [0, 0, 0, 0, 0, 0];
  const stats = [
    ["As client", asClient],
    ["As provider", asProvider],
    ["Fulfilled", completed],
    ["Milestones paid", paid],
    ["Disputes", disputes],
    ["Favourable rulings", favorable],
  ] as const;
  return (
    <dl className="mt-10 grid grid-cols-2 border-y border-ink sm:grid-cols-3 lg:grid-cols-6">
      {stats.map(([label, value]) => (
        <div key={label} className="border-rule px-1 py-5 sm:px-4 [&:not(:last-child)]:border-r">
          <dt className="label">{label}</dt>
          <dd className="display mt-2 text-5xl tabular">{Number(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Row({ agreement, role }: { agreement: AgreementView; role: Role }) {
  const now = useNow(15_000);
  const { data: terms } = useIpfsJson(agreement.termsCID, TermsDocument);
  const token = tokenFor(agreement.token);
  const focus = focusMilestone(agreement);
  const actions = availableActions(agreement, focus, role, now);
  const yourMove =
    (agreement.status === "Proposed" && role === "provider") ||
    actions.some((a) => ["deliver", "claim", "convene", "finalize"].includes(a)) ||
    (role === "client" && focus?.phase === "Delivered") ||
    (focus?.phase === "Disputed" && (role === "client" ? !focus.clientFiled : !focus.providerFiled));
  const counterparty = role === "client" ? agreement.provider : agreement.client;
  const phase = agreement.status === "Active" && focus ? PHASE_COPY[focus.phase] : STATUS_COPY[agreement.status];

  return (
    <li className="border-b border-rule">
      <Link href={`/a/${agreement.id}`} className="group grid grid-cols-[56px_1fr] items-center gap-4 py-5 sm:grid-cols-[64px_1fr_auto]">
        <Seal seed={sealSeed(agreement)} number={agreement.id} size={56} className="text-seal transition-transform group-hover:rotate-6" />
        <div className="min-w-0">
          <p className="label">
            {agreementNumber(agreement.id)} · {role} · with {shortAddress(counterparty)} · {formatDate(agreement.createdAt, false)}
          </p>
          <p className="mt-1 truncate font-serif text-2xl group-hover:text-seal">{terms?.draft.title ?? "…"}</p>
          {focus && agreement.status === "Active" && (
            <p className="mt-0.5 text-sm text-ink-3">
              Milestone {roman(focus.index + 1)} of {agreement.milestones.length}
            </p>
          )}
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-1 sm:justify-end">
          {yourMove && <span className="bg-seal px-2 py-1 font-mono text-[0.62rem] uppercase tracking-wider text-on-seal">Your move</span>}
          <Pill tone={phase.tone}>{phase.label}</Pill>
          <span className="tabular w-32 text-right font-mono">
            {formatAmount(agreement.total, token.decimals)} {token.symbol}
          </span>
        </div>
      </Link>
    </li>
  );
}
