"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { erc20Abi } from "viem";
import {
  useBalance,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { Dots, Modal, Notice } from "@/components/ui";
import { CHAIN_LABEL, USD_ADDRESS, chain } from "@/lib/config";
import { formatAmount, shortAddress } from "@/lib/format";
import { forgetGuestKey, readGuestKey } from "@/lib/wallet/guest-connector";

const OPEN_EVENT = "pactum:connect";

/** Open the wallet dialog from anywhere ("Connect to continue" buttons). */
export function openWalletModal() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function useTokenBalance(address?: `0x${string}`) {
  return useReadContract({
    address: USD_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && USD_ADDRESS), refetchInterval: 10_000 },
  });
}

async function requestFunds(address: string) {
  const res = await fetch("/api/faucet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Faucet unavailable");
  return json as { hashes: string[] };
}

export function WalletButton() {
  const { address, status, chainId, connector } = useConnection();
  const connect = useConnect();
  const connectors = useConnectors();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);
  const [funding, setFunding] = useState<"idle" | "busy" | "done" | string>("idle");
  const [revealKey, setRevealKey] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const usd = useTokenBalance(address);
  const eth = useBalance({ address, query: { enabled: Boolean(address), refetchInterval: 10_000 } });

  useEffect(() => {
    const open = () => setModal(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  async function fund(target: string) {
    setFunding("busy");
    try {
      await requestFunds(target);
      setFunding("done");
      await queryClient.invalidateQueries();
    } catch (e) {
      setFunding(e instanceof Error ? e.message : "Faucet failed");
    }
  }

  async function connectWith(id: string) {
    const target = connectors.find((c) => c.id === id || c.type === id);
    if (!target) return;
    const isNewGuest = target.id === "guest" && !readGuestKey();
    try {
      const result = await connect.mutateAsync({ connector: target, chainId: chain.id });
      setModal(false);
      if (target.id === "guest" && (isNewGuest || funding === "idle")) {
        const first = result.accounts[0] as string | { address: string } | undefined;
        if (first) void fund(typeof first === "string" ? first : first.address);
      }
    } catch {
      // Surfaced via connect.error below.
    }
  }

  const injectedConnectors = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
  const genericInjected = connectors.find((c) => c.id === "injected");
  const hasInjected = typeof window !== "undefined" && "ethereum" in window;
  const browserWallets = injectedConnectors.length ? injectedConnectors : hasInjected && genericInjected ? [genericInjected] : [];

  if (status === "connected" && address) {
    const wrongChain = chainId !== chain.id;
    return (
      <div className="relative" ref={menuRef}>
        {wrongChain ? (
          <button className="btn btn-seal btn-sm" onClick={() => switchChain.mutate({ chainId: chain.id })}>
            Switch to {CHAIN_LABEL}
          </button>
        ) : (
          <button
            className="btn btn-line btn-sm gap-2.5 normal-case tracking-normal"
            onClick={() => setMenu((v) => !v)}
            aria-expanded={menu}
          >
            <span className="size-1.5 rounded-full bg-ledger" aria-hidden />
            <span className="font-mono">{shortAddress(address)}</span>
            <span className="hidden text-ink-3 sm:inline">
              {usd.data !== undefined ? `${formatAmount(usd.data, 6)} tUSD` : ""}
            </span>
          </button>
        )}
        {menu && (
          <div className="sheet absolute right-0 top-[calc(100%+8px)] z-50 w-72 p-4 animate-ink-in">
            <p className="label">Connected · {connector?.name}</p>
            <p className="mt-1 break-all font-mono text-xs">{address}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-rule pt-3">
              <div>
                <dt className="label">tUSD</dt>
                <dd className="tabular font-mono">{usd.data !== undefined ? formatAmount(usd.data, 6) : "—"}</dd>
              </div>
              <div>
                <dt className="label">ETH (gas)</dt>
                <dd className="tabular font-mono">{eth.data ? formatAmount(eth.data.value, 18, 5) : "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 grid gap-2">
              <button className="btn btn-line btn-sm w-full" disabled={funding === "busy"} onClick={() => fund(address)}>
                {funding === "busy" ? <Dots label="Requesting test funds" /> : "Get test funds"}
              </button>
              {funding !== "idle" && funding !== "busy" && (
                <p className={`text-xs ${funding === "done" ? "text-ledger" : "text-seal"}`}>
                  {funding === "done" ? "Funds sent: 1,000 tUSD and gas." : funding}
                </p>
              )}
              <a href="/ledger" className="btn btn-quiet btn-sm w-full">
                My ledger
              </a>
              {connector?.id === "guest" && (
                <button className="btn btn-quiet btn-sm w-full" onClick={() => setRevealKey((v) => !v)}>
                  {revealKey ? "Hide guest key" : "Export guest key"}
                </button>
              )}
              {revealKey && (
                <p className="break-all border border-amber/60 bg-amber-wash p-2 font-mono text-[0.65rem] leading-relaxed">
                  {readGuestKey()}
                  <span className="mt-1 block font-sans text-[0.7rem] text-ink-2">
                    Testnet only. Anyone with this key controls the wallet.
                  </span>
                </p>
              )}
              <button
                className="btn btn-quiet btn-sm w-full"
                onClick={() => {
                  disconnect.mutate();
                  setMenu(false);
                }}
              >
                Disconnect
              </button>
              {connector?.id === "guest" && (
                <button
                  className="text-left text-[0.7rem] text-ink-4 underline-offset-2 hover:text-seal hover:underline"
                  onClick={() => {
                    if (confirm("Forget this guest wallet? Its test funds will be unreachable.")) {
                      disconnect.mutate();
                      forgetGuestKey();
                      setMenu(false);
                    }
                  }}
                >
                  Forget guest wallet
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button className="btn btn-ink btn-sm" onClick={() => setModal(true)} disabled={status === "connecting" || status === "reconnecting"}>
        {status === "connecting" || status === "reconnecting" ? <Dots /> : "Connect"}
      </button>
      <Modal open={modal} onClose={() => setModal(false)} title="Sign in with a wallet">
        <div className="grid gap-3">
          <WalletOption
            title="Instant guest wallet"
            tag="Recommended"
            description="A fresh testnet key made in this browser and funded with test ETH and 1,000 tUSD. Nothing to install."
            onClick={() => connectWith("guest")}
            busy={connect.isPending && connect.variables?.connector && "id" in connect.variables.connector && connect.variables.connector.id === "guest"}
          />
          {browserWallets.length ? (
            browserWallets.map((c) => (
              <WalletOption
                key={c.uid}
                title={c.name === "Injected" ? "Browser wallet" : c.name}
                description="MetaMask, Rabby or any extension wallet. Use the faucet in the wallet menu for test funds."
                icon={"icon" in c ? (c.icon as string | undefined) : undefined}
                onClick={() => connectWith(c.id)}
              />
            ))
          ) : (
            <WalletOption
              title="Browser wallet"
              description="No extension detected in this browser."
              disabled
              onClick={() => {}}
            />
          )}
          <WalletOption
            title="Coinbase Smart Wallet"
            description="Create a passkey wallet in seconds, no extension needed."
            onClick={() => connectWith("coinbaseWalletSDK")}
          />
          {connect.error && <Notice tone="seal">{connect.error.message.split("\n")[0]}</Notice>}
          <p className="text-xs leading-relaxed text-ink-3">
            Pactum runs on {CHAIN_LABEL}, a test network. No real money is involved.
          </p>
        </div>
      </Modal>
    </>
  );
}

function WalletOption({
  title,
  description,
  tag,
  icon,
  onClick,
  disabled,
  busy,
}: {
  title: string;
  description: string;
  tag?: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-start gap-3 border border-rule-strong p-4 text-left transition-colors hover:border-ink disabled:opacity-50 disabled:hover:border-rule-strong"
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" className="mt-0.5 size-6" />
      ) : (
        <span className="mt-0.5 grid size-6 place-items-center border border-ink font-serif text-sm italic">P</span>
      )}
      <span className="flex-1">
        <span className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {tag && <span className="bg-seal px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-white">{tag}</span>}
        </span>
        <span className="mt-1 block text-sm leading-snug text-ink-3">{busy ? <Dots label="Creating" /> : description}</span>
      </span>
      <span className="text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink">→</span>
    </button>
  );
}
