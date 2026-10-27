"use client";

import { useState } from "react";
import type { Hash } from "viem";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { friendlyError } from "@/lib/errors";

export type TxState =
  | { status: "idle" }
  | { status: "signing"; label: string }
  | { status: "pending"; label: string; hash: Hash }
  | { status: "success"; label: string; hash: Hash }
  | { status: "error"; label: string; error: string };

/**
 * Wraps a wallet write: sign → wait for inclusion → report. Each step is surfaced to the UI so users always
 * know whether they are waiting on their wallet or on the chain.
 */
export function useTx(onConfirmed?: () => void) {
  const config = useConfig();
  const [state, setState] = useState<TxState>({ status: "idle" });

  async function run(label: string, send: () => Promise<Hash>) {
    setState({ status: "signing", label });
    try {
      const hash = await send();
      setState({ status: "pending", label, hash });
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      setState({ status: "success", label, hash });
      onConfirmed?.();
      return hash;
    } catch (error) {
      setState({ status: "error", label, error: friendlyError(error) });
      return undefined;
    }
  }

  return { state, run, reset: () => setState({ status: "idle" }), busy: state.status === "signing" || state.status === "pending" };
}
