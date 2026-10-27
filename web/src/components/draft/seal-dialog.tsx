"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Address, type Hash, erc20Abi, parseEventLogs, parseSignature, zeroAddress } from "viem";
import { useConfig, useConnection, useSignTypedData, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { Seal } from "@/components/seal";
import { Dots, Modal, Notice, TxLink } from "@/components/ui";
import { pactumAbi, testUsdAbi } from "@/lib/abi";
import { APPEAL_COURT_ADDRESS, ARBITER_ADDRESS, PACTUM_ADDRESS, type TokenInfo, chain } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { roman, toUnits } from "@/lib/format";
import type { AgreementDraft, TermsDocument } from "@/lib/schemas";

export type Timing = { reviewPeriod: number; responseWindow: number; appealWindow: number; label: string };

export const TIMINGS: Record<"express" | "standard", Timing> = {
  express: { reviewPeriod: 10 * 60, responseWindow: 5 * 60, appealWindow: 0, label: "Express · minutes, for demos" },
  standard: {
    reviewPeriod: 3 * 86400,
    responseWindow: 2 * 86400,
    appealWindow: APPEAL_COURT_ADDRESS ? 2 * 86400 : 0,
    label: "Standard · days",
  },
};

type Step = "pin" | "authorize" | "create" | "done";
type StepState = { step: Step; error?: string; hash?: Hash; id?: number; cid?: string };

const STEPS: { id: Step; title: string; body: string }[] = [
  { id: "pin", title: "Pin terms to IPFS", body: "The full agreement is stored content-addressed; only its CID goes on-chain." },
  { id: "authorize", title: "Authorise the escrow", body: "A gasless EIP-2612 permit signature (or an approval for smart wallets)." },
  { id: "create", title: "Fund the escrow", body: "One transaction locks the money in the Pactum contract on Base." },
];

export function SealDialog({
  open,
  onClose,
  draft,
  provider,
  token,
  timing,
}: {
  open: boolean;
  onClose: () => void;
  draft: AgreementDraft;
  provider: Address;
  token: TokenInfo;
  timing: Timing;
}) {
  const router = useRouter();
  const config = useConfig();
  const { address, connector } = useConnection();
  const signTypedData = useSignTypedData();
  const writeContract = useWriteContract();
  const [state, setState] = useState<StepState | null>(null);

  const amounts = draft.milestones.map((m) => toUnits(m.amount, token.decimals));
  const total = amounts.reduce((a, b) => a + b, 0n);

  async function run() {
    if (!address || !PACTUM_ADDRESS || !ARBITER_ADDRESS) return;
    try {
      // 1 · Pin the terms.
      setState({ step: "pin" });
      const terms: TermsDocument = {
        kind: "pactum.terms",
        version: 1,
        draft,
        client: address,
        provider,
        token: { symbol: token.symbol, address: token.address, decimals: token.decimals },
        timing: { reviewPeriod: timing.reviewPeriod, responseWindow: timing.responseWindow, appealWindow: timing.appealWindow },
        createdAt: new Date().toISOString(),
      };
      const pinned = await fetch("/api/ipfs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(terms),
      });
      const pinJson = await pinned.json();
      if (!pinned.ok) throw new Error(pinJson.error ?? "Could not pin the terms");
      const cid = pinJson.cid as string;

      const now = Math.floor(Date.now() / 1000);
      const params = {
        provider,
        token: token.address,
        arbiter: ARBITER_ADDRESS,
        appealCourt: timing.appealWindow ? (APPEAL_COURT_ADDRESS ?? zeroAddress) : zeroAddress,
        reviewPeriod: timing.reviewPeriod,
        responseWindow: timing.responseWindow,
        appealWindow: timing.appealWindow,
        termsCID: cid,
        amounts,
        dueBy: draft.milestones.map((m) => BigInt(now + Math.max(1, m.dueInDays) * 86400)),
      } as const;

      // 2 · Authorise (ERC-20 only).
      setState({ step: "authorize", cid });
      let hash: Hash;
      if (token.address === zeroAddress) {
        setState({ step: "create", cid });
        hash = await writeContract.mutateAsync({
          address: PACTUM_ADDRESS,
          abi: pactumAbi,
          functionName: "create",
          args: [params],
          value: total,
        });
      } else {
        const allowance = await readContract(config, {
          address: token.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, PACTUM_ADDRESS],
        });
        const canPermit = connector?.type === "guest" || connector?.type === "injected";
        if (allowance >= total) {
          setState({ step: "create", cid });
          hash = await writeContract.mutateAsync({ address: PACTUM_ADDRESS, abi: pactumAbi, functionName: "create", args: [params] });
        } else if (canPermit) {
          const nonce = await readContract(config, { address: token.address, abi: testUsdAbi, functionName: "nonces", args: [address] });
          const deadline = BigInt(now + 3600);
          const signature = await signTypedData.mutateAsync({
            domain: { name: token.name, version: "1", chainId: chain.id, verifyingContract: token.address },
            types: {
              Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
              ],
            },
            primaryType: "Permit",
            message: { owner: address, spender: PACTUM_ADDRESS, value: total, nonce, deadline },
          });
          const { v, r, s, yParity } = parseSignature(signature);
          setState({ step: "create", cid });
          hash = await writeContract.mutateAsync({
            address: PACTUM_ADDRESS,
            abi: pactumAbi,
            functionName: "createWithPermit",
            args: [params, deadline, Number(v ?? BigInt(yParity + 27)), r, s],
          });
        } else {
          const approval = await writeContract.mutateAsync({
            address: token.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [PACTUM_ADDRESS, total],
          });
          await waitForTransactionReceipt(config, { hash: approval });
          setState({ step: "create", cid });
          hash = await writeContract.mutateAsync({ address: PACTUM_ADDRESS, abi: pactumAbi, functionName: "create", args: [params] });
        }
      }

      // 3 · Wait for inclusion and read the new agreement id from the event.
      setState({ step: "create", cid, hash });
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted");
      const [created] = parseEventLogs({ abi: pactumAbi, eventName: "AgreementCreated", logs: receipt.logs });
      const id = Number(created?.args.id ?? 0);
      setState({ step: "done", cid, hash, id });
      setTimeout(() => router.push(`/a/${id}`), 2600);
    } catch (error) {
      setState((s) => ({ step: s?.step ?? "pin", cid: s?.cid, error: friendlyError(error) }));
    }
  }

  const order: Step[] = ["pin", "authorize", "create", "done"];
  const at = state ? order.indexOf(state.step) : -1;

  return (
    <Modal open={open} onClose={() => (state && !state.error && state.step !== "done" ? undefined : onClose())} title="Seal the agreement">
      {state?.step === "done" ? (
        <div className="grid place-items-center py-4 text-center">
          <Seal seed={`${state.id}:${state.cid}`} number={state.id} size={180} animate className="text-seal" />
          <p className="display mt-6 text-4xl">Sealed.</p>
          <p className="mt-2 text-ink-3">
            Agreement {roman(state.id ?? 1)} is live on-chain. Opening it now…
          </p>
          {state.hash && (
            <p className="mt-3">
              <TxLink hash={state.hash} />
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-5">
          <ol className="grid gap-4">
            {STEPS.map((s, i) => {
              const isDone = at > i;
              const active = at === i;
              return (
                <li key={s.id} className="grid grid-cols-[1.75rem_1fr] gap-3">
                  <span
                    className={`grid size-7 place-items-center border font-mono text-xs ${
                      isDone ? "border-ledger bg-ledger text-white" : active ? "border-ink" : "border-rule-strong text-ink-4"
                    }`}
                  >
                    {isDone ? "✓" : i + 1}
                  </span>
                  <div>
                    <p className={`font-medium ${!isDone && !active ? "text-ink-3" : ""}`}>{s.title}</p>
                    <p className="text-sm text-ink-3">{s.body}</p>
                    {active && !state?.error && (
                      <p className="mt-1.5">
                        <Dots label={state?.hash ? "Waiting for the block" : s.id === "pin" ? "Pinning" : "Confirm in your wallet"} />
                      </p>
                    )}
                    {s.id === "pin" && state?.cid && (
                      <p className="mt-1 break-all font-mono text-[0.68rem] text-ink-3">ipfs://{state.cid}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {state?.error && <Notice tone="seal">{state.error}</Notice>}
          <div className="flex items-center justify-between gap-3 border-t border-rule pt-4">
            <p className="text-sm text-ink-3">
              {draft.milestones.length} milestone{draft.milestones.length === 1 ? "" : "s"} · {timing.label}
            </p>
            <button className="btn btn-seal" onClick={run} disabled={Boolean(state && !state.error)}>
              {state?.error ? "Try again" : state ? <Dots /> : "Sign & seal"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
