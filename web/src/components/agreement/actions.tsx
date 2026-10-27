"use client";

import { useState } from "react";
import type { Hash } from "viem";
import { useConnection, useReadContract, useWriteContract } from "wagmi";
import { Dots, Modal, Notice, SplitBar, TxLink } from "@/components/ui";
import { useTx } from "@/hooks/use-tx";
import { pactumAbi } from "@/lib/abi";
import { type ActionId, type AgreementView, type MilestoneView, type Role, availableActions } from "@/lib/agreement";
import { PACTUM_ADDRESS, tokenFor } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatAmount, percent, roman } from "@/lib/format";
import type { DeliveryDocument, EvidenceDocument, FileRef } from "@/lib/schemas";
import { pinDocument, uploadFile } from "@/lib/upload";

type Props = {
  agreement: AgreementView;
  milestone?: MilestoneView;
  role: Role;
  now: number;
  onDone: () => void;
};

/** Agreement-level actions while the agreement awaits the provider's acceptance. */
export function ProposalActions({ agreement, role, onDone }: Omit<Props, "milestone" | "now">) {
  const write = useWriteContract();
  const tx = useTx(onDone);
  const id = BigInt(agreement.id);
  const call = (label: string, fn: "accept" | "cancel") =>
    tx.run(label, () => write.mutateAsync({ address: PACTUM_ADDRESS!, abi: pactumAbi, functionName: fn, args: [id] }));
  if (agreement.status !== "Proposed" || role === "viewer") return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {role === "provider" ? (
        <>
          <button className="btn btn-ink" disabled={tx.busy} onClick={() => call("Accept", "accept")}>
            Accept the terms
          </button>
          <button className="btn btn-quiet" disabled={tx.busy} onClick={() => call("Decline", "cancel")}>
            Decline
          </button>
        </>
      ) : (
        <button className="btn btn-line" disabled={tx.busy} onClick={() => call("Withdraw", "cancel")}>
          Withdraw &amp; refund
        </button>
      )}
      <TxStatus state={tx.state} />
    </div>
  );
}

export function MilestoneActions({ agreement, milestone, role, now, onDone }: Props) {
  const write = useWriteContract();
  const tx = useTx(onDone);
  const [compose, setCompose] = useState<"delivery" | "dispute" | "evidence" | null>(null);
  const [settling, setSettling] = useState(false);
  const { data: appealFee } = useReadContract({
    address: PACTUM_ADDRESS,
    abi: pactumAbi,
    functionName: "appealFee",
    query: { enabled: Boolean(PACTUM_ADDRESS) && milestone?.phase === "Ruled" },
  });
  if (!milestone || agreement.status !== "Active") return null;

  const token = tokenFor(agreement.token);
  const amount = `${formatAmount(milestone.amount, token.decimals)} ${token.symbol}`;
  const actions = availableActions(agreement, milestone, role, now);
  const id = BigInt(agreement.id);
  const i = BigInt(milestone.index);
  const send = (label: string, fn: "release" | "claim" | "reclaim" | "refund" | "finalize") =>
    tx.run(label, () => write.mutateAsync({ address: PACTUM_ADDRESS!, abi: pactumAbi, functionName: fn, args: [id, i] }));

  const has = (a: ActionId) => actions.includes(a);
  const buttons: React.ReactNode[] = [];

  if (has("deliver"))
    buttons.push(
      <button key="deliver" className="btn btn-ink" onClick={() => setCompose("delivery")}>
        {milestone.phase === "Delivered" ? "Resubmit delivery" : "Submit delivery"}
      </button>,
    );
  if (has("release") && (milestone.phase === "Delivered" || milestone.phase === "Pending"))
    buttons.push(
      <button key="release" className={milestone.phase === "Delivered" ? "btn btn-ink" : "btn btn-line"} disabled={tx.busy} onClick={() => send("Release", "release")}>
        {milestone.phase === "Delivered" ? `Approve & release ${amount}` : `Release ${amount} early`}
      </button>,
    );
  if (has("claim"))
    buttons.push(
      <button key="claim" className="btn btn-ink" disabled={tx.busy} onClick={() => send("Claim", "claim")}>
        Claim {amount}
      </button>,
    );
  if (has("evidence"))
    buttons.push(
      <button
        key="evidence"
        className={(role === "client" ? milestone.clientFiled : milestone.providerFiled) ? "btn btn-line" : "btn btn-ink"}
        onClick={() => setCompose("evidence")}
      >
        {(role === "client" ? milestone.clientFiled : milestone.providerFiled) ? "Add to the record" : "File your response"}
      </button>,
    );
  if (has("dispute"))
    buttons.push(
      <button key="dispute" className="btn btn-line" onClick={() => setCompose("dispute")}>
        Open a dispute
      </button>,
    );
  if (has("reclaim"))
    buttons.push(
      <button key="reclaim" className="btn btn-line" disabled={tx.busy} onClick={() => send("Reclaim", "reclaim")}>
        Reclaim (deadline missed)
      </button>,
    );
  if (has("appeal"))
    buttons.push(
      <button
        key="appeal"
        className="btn btn-line"
        disabled={tx.busy}
        onClick={() =>
          tx.run("Appeal", () =>
            write.mutateAsync({ address: PACTUM_ADDRESS!, abi: pactumAbi, functionName: "appeal", args: [id, i], value: appealFee ?? 0n }),
          )
        }
      >
        Appeal to the human court{appealFee ? ` (${formatAmount(appealFee, 18, 4)} ETH)` : ""}
      </button>,
    );
  if (has("finalize"))
    buttons.push(
      <button key="finalize" className="btn btn-ink" disabled={tx.busy} onClick={() => send("Finalize", "finalize")}>
        Execute the ruling
      </button>,
    );
  if (has("settle"))
    buttons.push(
      <button key="settle" className="btn btn-quiet" onClick={() => setSettling(true)}>
        Propose a settlement
      </button>,
    );
  if (has("release") && milestone.phase !== "Delivered" && milestone.phase !== "Pending")
    buttons.push(
      <button
        key="concede-release"
        className="btn btn-quiet"
        disabled={tx.busy}
        onClick={() => confirm(`Concede and release the full ${amount} to the provider?`) && send("Release", "release")}
      >
        Concede: release in full
      </button>,
    );
  if (has("refund"))
    buttons.push(
      <button
        key="refund"
        className="btn btn-quiet"
        disabled={tx.busy}
        onClick={() => confirm(`Refund the full ${amount} to the client?`) && send("Refund", "refund")}
      >
        Refund the client
      </button>,
    );

  if (!buttons.length) return null;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2.5">{buttons}</div>
      <TxStatus state={tx.state} />
      {compose && (
        <Composer kind={compose} agreement={agreement} milestone={milestone} role={role} onClose={() => setCompose(null)} onDone={onDone} />
      )}
      {settling && <SettleModal agreement={agreement} milestone={milestone} role={role} onClose={() => setSettling(false)} onDone={onDone} />}
    </div>
  );
}

export function TxStatus({ state }: { state: ReturnType<typeof useTx>["state"] }) {
  if (state.status === "idle") return null;
  if (state.status === "signing") return <Dots label="Confirm in your wallet" />;
  if (state.status === "pending")
    return (
      <span className="inline-flex items-center gap-3">
        <Dots label="Waiting for the block" /> <TxLink hash={state.hash} />
      </span>
    );
  if (state.status === "success")
    return (
      <span className="inline-flex items-center gap-2 text-sm text-ledger">
        ✓ {state.label} confirmed <TxLink hash={state.hash} />
      </span>
    );
  return <span className="text-sm text-seal">{state.error}</span>;
}

const COPY = {
  delivery: {
    title: "Submit a delivery",
    field: "Cover note",
    placeholder: "What you are handing over, and where each acceptance criterion is met.",
    button: "Deliver",
  },
  dispute: {
    title: "Open a dispute",
    field: "Your statement to the tribunal",
    placeholder: "What was agreed, what happened, which criteria were not met, and what outcome you think is fair.",
    button: "File & open dispute",
  },
  evidence: {
    title: "Add to the record",
    field: "Statement",
    placeholder: "Your account of the facts, with references to the files you attach.",
    button: "File",
  },
} as const;

function Composer({
  kind,
  agreement,
  milestone,
  role,
  onClose,
  onDone,
}: {
  kind: keyof typeof COPY;
  agreement: AgreementView;
  milestone: MilestoneView;
  role: Role;
  onClose: () => void;
  onDone: () => void;
}) {
  const { address } = useConnection();
  const write = useWriteContract();
  const tx = useTx(() => {
    onDone();
    setTimeout(onClose, 900);
  });
  const [text, setText] = useState("");
  const [links, setLinks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];

  async function submit() {
    if (!address || role === "viewer") return;
    setError(null);
    try {
      const refs: FileRef[] = [];
      for (const [n, f] of files.entries()) {
        setStage(`Pinning file ${n + 1} of ${files.length}`);
        refs.push(await uploadFile(f));
      }
      setStage("Pinning the record");
      const createdAt = new Date().toISOString();
      const doc: DeliveryDocument | EvidenceDocument =
        kind === "delivery"
          ? {
              kind: "pactum.delivery",
              version: 1,
              agreementId: agreement.id,
              milestone: milestone.index,
              note: text.trim(),
              files: refs,
              links: links.split(/\s+/).filter((l) => /^https?:\/\//.test(l)),
              author: address,
              createdAt,
            }
          : {
              kind: "pactum.evidence",
              version: 1,
              agreementId: agreement.id,
              milestone: milestone.index,
              role,
              statement: text.trim(),
              files: refs,
              author: address,
              createdAt,
            };
      const cid = await pinDocument(doc);
      setStage(null);
      const id = BigInt(agreement.id);
      const i = BigInt(milestone.index);
      await tx.run(copy.button, (): Promise<Hash> => {
        if (kind === "delivery") return write.mutateAsync({ address: PACTUM_ADDRESS!, abi: pactumAbi, functionName: "deliver", args: [id, i, cid] });
        if (kind === "dispute") return write.mutateAsync({ address: PACTUM_ADDRESS!, abi: pactumAbi, functionName: "dispute", args: [id, i, cid] });
        return write.mutateAsync({ address: PACTUM_ADDRESS!, abi: pactumAbi, functionName: "submitEvidence", args: [id, i, cid] });
      });
    } catch (e) {
      setStage(null);
      setError(friendlyError(e));
    }
  }

  const busy = Boolean(stage) || tx.busy;
  return (
    <Modal open onClose={() => !busy && onClose()} title={`${copy.title} · milestone ${roman(milestone.index + 1)}`} wide>
      <div className="grid gap-4">
        {kind === "dispute" && (
          <Notice tone="amber">
            Disputes freeze the milestone. The other side gets {Math.round(agreement.responseWindow / 60)} minutes
            {agreement.responseWindow >= 3600 ? ` (${Math.round(agreement.responseWindow / 3600)}h)` : ""} to respond, then the AI
            tribunal can rule. Write for a careful, neutral reader.
          </Notice>
        )}
        <label className="block">
          <span className="label">{copy.field}</span>
          <textarea
            className="box-field mt-2 min-h-40 resize-y leading-relaxed"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={copy.placeholder}
          />
        </label>
        {kind === "delivery" && (
          <label className="block">
            <span className="label">Links (optional, one per line)</span>
            <textarea className="box-field mt-2 h-16 resize-y font-mono text-sm" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://…" />
          </label>
        )}
        <label className="block">
          <span className="label">Files · pinned to IPFS · up to 6, 8 MB each</span>
          <input
            type="file"
            multiple
            className="mt-2 block w-full text-sm file:mr-3 file:border file:border-ink file:bg-transparent file:px-3 file:py-1.5 file:font-mono file:text-xs file:uppercase"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))}
          />
        </label>
        {error && <Notice tone="seal">{error}</Notice>}
        <div className="flex items-center justify-between gap-3 border-t border-rule pt-4">
          <span>{stage ? <Dots label={stage} /> : <TxStatus state={tx.state} />}</span>
          <button className="btn btn-ink" disabled={busy || text.trim().length < 10} onClick={submit}>
            {copy.button}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SettleModal({
  agreement,
  milestone,
  role,
  onClose,
  onDone,
}: {
  agreement: AgreementView;
  milestone: MilestoneView;
  role: Role;
  onClose: () => void;
  onDone: () => void;
}) {
  const { address } = useConnection();
  const write = useWriteContract();
  const [share, setShare] = useState(50);
  const offer = useReadContract({
    address: PACTUM_ADDRESS,
    abi: pactumAbi,
    functionName: "offers",
    args: [BigInt(agreement.id), BigInt(milestone.index)],
    query: { enabled: Boolean(PACTUM_ADDRESS), refetchInterval: 5000 },
  });
  const tx = useTx(() => {
    void offer.refetch();
    onDone();
  });
  const token = tokenFor(agreement.token);
  const [by, bps] = offer.data ?? ["0x0000000000000000000000000000000000000000", 0];
  const theirs = by !== "0x0000000000000000000000000000000000000000" && by.toLowerCase() !== address?.toLowerCase();
  const mine = by.toLowerCase() === address?.toLowerCase();
  const id = BigInt(agreement.id);
  const i = BigInt(milestone.index);
  const toProvider = (milestone.amount * BigInt(share * 100)) / 10_000n;

  return (
    <Modal open onClose={() => !tx.busy && onClose()} title={`Settle milestone ${roman(milestone.index + 1)}`} wide>
      <div className="grid gap-5">
        <p className="text-sm leading-relaxed text-ink-2">
          Agree a split without the tribunal. An offer executes the moment the other party accepts exactly the same split.
        </p>
        {theirs && (
          <div className="border border-ink p-4">
            <p className="label">The {role === "client" ? "provider" : "client"} offers</p>
            <div className="mt-3">
              <SplitBar providerBps={bps} />
            </div>
            <button
              className="btn btn-ink mt-4"
              disabled={tx.busy}
              onClick={() =>
                tx.run("Accept settlement", () =>
                  write.mutateAsync({ address: PACTUM_ADDRESS!, abi: pactumAbi, functionName: "acceptSettlement", args: [id, i, bps] }),
                )
              }
            >
              Accept {percent(bps)} to the provider
            </button>
          </div>
        )}
        {mine && <Notice>Your offer of {percent(bps)} to the provider is on the table. Making a new one replaces it.</Notice>}
        <div>
          <label className="flex items-baseline justify-between" htmlFor="share">
            <span className="label">Your proposal</span>
            <span className="font-mono text-sm">
              {share}% · {formatAmount(toProvider, token.decimals)} {token.symbol} to the provider
            </span>
          </label>
          <input
            id="share"
            type="range"
            min={0}
            max={100}
            step={5}
            value={share}
            onChange={(e) => setShare(Number(e.target.value))}
            className="mt-3 w-full accent-[var(--seal)]"
          />
          <div className="mt-3">
            <SplitBar providerBps={share * 100} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-rule pt-4">
          <TxStatus state={tx.state} />
          <button
            className="btn btn-line"
            disabled={tx.busy}
            onClick={() =>
              tx.run("Offer", () =>
                write.mutateAsync({ address: PACTUM_ADDRESS!, abi: pactumAbi, functionName: "offerSettlement", args: [id, i, share * 100] }),
              )
            }
          >
            Offer {share}% to the provider
          </button>
        </div>
      </div>
    </Modal>
  );
}
