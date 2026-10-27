"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Tone } from "@/lib/agreement";
import { AGENT_ADDRESS, explorerAddress, explorerTx } from "@/lib/config";
import { formatDuration, percent, shortAddress } from "@/lib/format";

const toneClass: Record<Tone, string> = {
  neutral: "border-ink/70 text-ink",
  seal: "border-seal text-seal",
  ledger: "border-ledger text-ledger",
  amber: "border-amber text-amber",
  muted: "border-rule-strong text-ink-3",
};

export function Pill({ tone = "neutral", children, live = false }: { tone?: Tone; children: React.ReactNode; live?: boolean }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 border px-2 font-mono text-[0.65rem] uppercase tracking-[0.08em] ${toneClass[tone]}`}
    >
      <span className={`size-1.5 rounded-full bg-current ${live ? "pulse-dot" : ""}`} aria-hidden />
      {children}
    </span>
  );
}

/** Re-renders every second with the current unix time. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Countdown({ endsAt, label }: { endsAt: number; label: string }) {
  const now = useNow();
  const remaining = endsAt - now;
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className={`tabular font-mono text-sm ${remaining <= 0 ? "text-ink-3" : "text-ink"}`}>
        {remaining <= 0 ? "elapsed" : formatDuration(remaining)}
      </span>
    </span>
  );
}

export function AddressTag({ address, you, className = "" }: { address: string; you?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const isAgent = AGENT_ADDRESS && address.toLowerCase() === AGENT_ADDRESS.toLowerCase();
  const href = explorerAddress(address);
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-[0.8rem] ${className}`}>
      <a href={`/u/${address}`} className="link tabular" title={address}>
        {shortAddress(address)}
      </a>
      {isAgent && <span className="bg-ink px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider text-paper">Ada · AI agent</span>}
      {you && <span className="text-[0.65rem] uppercase tracking-wider text-seal">you</span>}
      <button
        type="button"
        className="text-ink-4 transition-colors hover:text-ink"
        aria-label="Copy address"
        onClick={() => {
          navigator.clipboard?.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "✓" : "⧉"}
      </button>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className="text-ink-4 hover:text-ink" aria-label="View on explorer">
          ↗
        </a>
      )}
    </span>
  );
}

export function TxLink({ hash }: { hash: string }) {
  const href = explorerTx(hash);
  const label = shortAddress(hash, 6);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="link font-mono text-xs">
      {label} ↗
    </a>
  ) : (
    <span className="font-mono text-xs text-ink-3">{label}</span>
  );
}

/** Provider share vs. client share of a milestone, as a single ruled bar. */
export function SplitBar({ providerBps, animate = false }: { providerBps: number; animate?: boolean }) {
  const shown = providerBps;
  return (
    <div>
      <div className="flex justify-between font-mono text-[0.7rem] uppercase tracking-wider">
        <span className="text-ledger">Provider {percent(shown)}</span>
        <span className="text-ink-3">Client {percent(10_000 - shown)}</span>
      </div>
      <div className="relative mt-2 h-2.5 border border-ink/80">
        <div
          className={`absolute inset-y-0 left-0 bg-ledger transition-[width] duration-700 ${animate ? "animate-split" : ""}`}
          style={{ width: `${shown / 100}%` }}
        />
        <div className="absolute inset-y-[-5px] left-1/2 w-px bg-ink/40" aria-hidden />
      </div>
    </div>
  );
}

export function Dots({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-3" role="status">
      <span className="inline-flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="pulse-dot size-1 rounded-full bg-current" style={{ animationDelay: `${i * 180}ms` }} />
        ))}
      </span>
      {label && <span className="font-mono text-xs">{label}</span>}
    </span>
  );
}

/** Native <dialog> modal: accessible focus trapping and Esc handling for free. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-2xl" : "max-w-md"} border border-ink bg-sheet p-0 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]`}
    >
      <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
        <h2 className="label !text-ink">{title}</h2>
        <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="px-5 py-5">{children}</div>
    </dialog>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "seal" | "ledger" | "amber"; children: React.ReactNode }) {
  const cls = {
    neutral: "border-rule-strong bg-paper-2 text-ink-2",
    seal: "border-seal/50 bg-seal-wash text-ink",
    ledger: "border-ledger/50 bg-ledger-wash text-ink",
    amber: "border-amber/50 bg-amber-wash text-ink",
  }[tone];
  return <div className={`border px-4 py-3 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

export function SectionLabel({ n, children }: { n?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {n && <span className="font-serif text-lg italic text-seal">§ {n}</span>}
      <span className="label">{children}</span>
      <span className="h-px flex-1 bg-rule" aria-hidden />
    </div>
  );
}

/** A textarea that grows with its content, for inline editing that wraps like the surrounding text. */
export function AutoTextarea({
  value,
  onChange,
  className = "",
  ...rest
}: { value: string; onChange: (value: string) => void; className?: string } & Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      className={`block w-full resize-none overflow-hidden bg-transparent outline-none ${className}`}
      {...rest}
    />
  );
}
