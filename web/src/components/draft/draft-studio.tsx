"use client";

import { useSearchParams } from "next/navigation";
import { Allow, parse } from "partial-json";
import { useEffect, useState } from "react";
import { type Address, isAddress, zeroAddress } from "viem";
import { useConnection } from "wagmi";
import { Seal } from "@/components/seal";
import { Dots, Notice, SectionLabel } from "@/components/ui";
import { openWalletModal, useTokenBalance } from "@/components/wallet/wallet-button";
import { useStream } from "@/hooks/use-stream";
import { AGENT_ADDRESS, IS_CONFIGURED, TOKENS } from "@/lib/config";
import { formatAmount, toUnits } from "@/lib/format";
import type { AgreementDraft } from "@/lib/schemas";
import { AgreementDocument, type PartialDraft } from "./agreement-document";
import { ClarityNotes } from "./clarity-notes";
import { SealDialog, TIMINGS } from "./seal-dialog";

const EXAMPLES = [
  "A logo for my bakery “Crumb & Co”: three concepts, then a final SVG with a usage note. 400 tUSD, two weeks.",
  "Five tagline options and a 150-word About page for an indoor climbing gym. 120 tUSD, delivered in 3 days.",
  "Translate my 2,000-word landing page into Spanish, keeping headings and links intact. 90 tUSD within a week.",
  "A React component library with Button, Input and Modal, documented and tested. 1,500 tUSD over three milestones.",
];

const REVISIONS = [
  "Make every acceptance criterion measurable",
  "Add a kill fee if the client cancels mid-way",
  "Split the work into three milestones",
  "Allow one extra revision round",
];

type Phase = "idle" | "drafting" | "ready" | "error";

export function DraftStudio() {
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [prompt, setPrompt] = useState(initial);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<AgreementDraft | null>(null);
  const [partial, setPartial] = useState<PartialDraft | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ model: string; simulated: boolean; ms: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [counterparty, setCounterparty] = useState<"ada" | "address">(AGENT_ADDRESS ? "ada" : "address");
  const [other, setOther] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState<string | null>(null);
  const [timingKey, setTimingKey] = useState<keyof typeof TIMINGS>("express");
  const [sealing, setSealing] = useState(false);
  const stream = useStream();
  const { address } = useConnection();

  useEffect(() => {
    if (phase !== "drafting") return;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - t0), 100);
    return () => clearInterval(t);
  }, [phase]);

  async function generate(revise?: string) {
    if (prompt.trim().length < 8) {
      setError("Describe the deal in a sentence or two.");
      return;
    }
    setError(null);
    setPhase("drafting");
    const t0 = Date.now();
    let buffer = "";
    const base = revise ? draft : null;
    if (!revise) setDraft(null);
    setPartial(base ?? {});
    await stream.start(
      "/api/ai/draft",
      revise && draft ? { prompt, current: draft, instruction: revise } : { prompt },
      ({ event, data }) => {
        const d = data as Record<string, unknown>;
        if (event === "delta") {
          buffer += d.delta as string;
          try {
            setPartial(parse(buffer, Allow.ALL) as PartialDraft);
          } catch {
            // Wait for more tokens.
          }
        } else if (event === "done") {
          const next = d.draft as AgreementDraft;
          setDraft(next);
          setPartial(null);
          setTokenSymbol((s) => s ?? next.currency);
          setMeta({ model: d.model as string, simulated: Boolean(d.simulated), ms: Date.now() - t0 });
          setPhase("ready");
          setInstruction("");
        } else if (event === "error") {
          setError((d.message as string) ?? "Drafting failed");
          setPartial(null);
          setPhase(base ? "ready" : "error");
        }
      },
    );
  }

  // Start drafting straight away when arriving with ?q= (from the landing page). The cleanup aborts the
  // request, so StrictMode's mount → unmount → mount simply restarts it.
  useEffect(() => {
    if (!initial) return;
    void generate();
    return () => stream.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const token = TOKENS.find((t) => t.symbol === (tokenSymbol ?? draft?.currency)) ?? TOKENS[0]!;
  const provider: Address | undefined =
    counterparty === "ada" ? AGENT_ADDRESS : isAddress(other.trim()) ? (other.trim() as Address) : undefined;
  const totalUnits = draft ? draft.milestones.reduce((sum, m) => sum + toUnits(m.amount, token.decimals), 0n) : 0n;
  const balance = useTokenBalance(address);
  const insufficient = token.address !== zeroAddress && balance.data !== undefined && balance.data < totalUnits;

  const sealProblems: string[] = [];
  if (draft) {
    if (!draft.milestones.length) sealProblems.push("Add at least one milestone.");
    if (draft.milestones.some((m) => !(m.amount > 0))) sealProblems.push("Every milestone needs an amount above zero.");
    if (!provider) sealProblems.push(counterparty === "ada" ? "Ada is not configured on this deployment." : "Enter the provider's address.");
    if (provider && address && provider.toLowerCase() === address.toLowerCase()) sealProblems.push("You cannot hire yourself.");
  }

  const shown = partial ?? draft;
  const streaming = phase === "drafting";

  return (
    <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[400px_1fr] lg:py-14">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <SectionLabel n="I">Describe the deal</SectionLabel>
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <label htmlFor="deal" className="sr-only">
            Describe the deal
          </label>
          <textarea
            id="deal"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate();
            }}
            rows={5}
            placeholder="Who does what, for how much, by when…"
            className="box-field resize-none font-serif text-[1.35rem] leading-snug"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="font-mono text-[0.68rem] text-ink-4">⌘/Ctrl + Enter</span>
            <button className="btn btn-ink" disabled={streaming}>
              {streaming && !draft ? <Dots label={`${(elapsed / 1000).toFixed(1)}s`} /> : draft ? "Redraft" : "Draft it"}
            </button>
          </div>
        </form>

        {!draft && !streaming && (
          <div className="mt-8">
            <p className="label">Or start from an example</p>
            <ul className="mt-3 grid gap-2">
              {EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button
                    type="button"
                    className="w-full border border-rule px-3 py-2.5 text-left text-sm leading-snug text-ink-2 transition-colors hover:border-ink hover:text-ink"
                    onClick={() => setPrompt(ex)}
                  >
                    {ex}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {draft && (
          <div className="mt-10 animate-ink-in">
            <SectionLabel n="II">Revise with Scribe</SectionLabel>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (instruction.trim()) void generate(instruction.trim());
              }}
            >
              <input
                className="field flex-1"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="e.g. require reference images"
                aria-label="Revision instruction"
              />
              <button className="btn btn-line btn-sm" disabled={streaming || !instruction.trim()}>
                {streaming ? <Dots /> : "Revise"}
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {REVISIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={streaming}
                  onClick={() => void generate(r)}
                  className="border border-rule px-2 py-1 text-xs text-ink-3 transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="mt-10">
              <SectionLabel n="III">Seal</SectionLabel>
              <fieldset className="mt-4">
                <legend className="label">Provider</legend>
                <div className="mt-2 grid gap-2">
                  {AGENT_ADDRESS && (
                    <Choice checked={counterparty === "ada"} onChange={() => setCounterparty("ada")} name="cp">
                      <span className="font-medium">Hire Ada</span>
                      <span className="block text-sm text-ink-3">
                        The resident AI agent. Accepts, delivers and defends its work on-chain. Best for text, code and SVG.
                      </span>
                    </Choice>
                  )}
                  <Choice checked={counterparty === "address"} onChange={() => setCounterparty("address")} name="cp">
                    <span className="font-medium">Someone else</span>
                    {counterparty === "address" && (
                      <input
                        className="field mt-1 font-mono text-sm"
                        placeholder="0x… provider address"
                        value={other}
                        onChange={(e) => setOther(e.target.value)}
                        aria-label="Provider address"
                      />
                    )}
                  </Choice>
                </div>
              </fieldset>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="label">Currency</span>
                  <select
                    className="field mt-1"
                    value={token.symbol}
                    onChange={(e) => setTokenSymbol(e.target.value)}
                  >
                    {TOKENS.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.symbol}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Windows</span>
                  <select
                    className="field mt-1"
                    value={timingKey}
                    onChange={(e) => setTimingKey(e.target.value as keyof typeof TIMINGS)}
                  >
                    <option value="express">Express (demo)</option>
                    <option value="standard">Standard</option>
                  </select>
                </label>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-3">
                {timingKey === "express"
                  ? "10-minute review period, 5-minute evidence window: the whole lifecycle fits in a coffee break."
                  : "3-day review period and 2-day evidence window, as a real engagement would use."}
              </p>

              {sealProblems.length > 0 && (
                <ul className="mt-4 grid gap-1 text-sm text-seal">
                  {sealProblems.map((p) => (
                    <li key={p}>· {p}</li>
                  ))}
                </ul>
              )}
              {insufficient && (
                <Notice tone="amber">
                  Your balance is {formatAmount(balance.data ?? 0n, token.decimals)} {token.symbol}. Use “Get test funds” in the
                  wallet menu.
                </Notice>
              )}
              <button
                className="btn btn-seal mt-5 w-full"
                disabled={!IS_CONFIGURED || streaming || sealProblems.length > 0}
                onClick={() => (address ? setSealing(true) : openWalletModal())}
              >
                {!IS_CONFIGURED
                  ? "Contracts not configured"
                  : address
                    ? `Seal & escrow ${formatAmount(totalUnits, token.decimals)} ${token.symbol}`
                    : "Connect a wallet to seal"}
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <Notice tone="seal">{error}</Notice>
          </div>
        )}
      </aside>

      <section aria-live="polite" className="min-w-0">
        {shown ? (
          <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
            <AgreementDocument
              draft={shown}
              streaming={streaming}
              editable={phase === "ready"}
              onChange={setDraft}
              currency={token.symbol}
              clientName={address ? "You" : undefined}
              providerName={counterparty === "ada" && AGENT_ADDRESS ? "Ada · AI agent" : undefined}
              seal={<Seal seed={JSON.stringify(shown.title ?? "")} ghost size={110} />}
            />
            <div className="xl:sticky xl:top-24 xl:self-start">
              <ClarityNotes clarity={shown.clarity} streaming={streaming} />
              {meta && (
                <p className="mt-4 font-mono text-[0.68rem] leading-relaxed text-ink-4">
                  Drafted by {meta.simulated ? "the offline simulator" : meta.model} in {(meta.ms / 1000).toFixed(1)}s · structured output
                  validated against the agreement schema
                </p>
              )}
            </div>
          </div>
        ) : (
          <EmptySheet />
        )}
      </section>

      {draft && provider && (
        <SealDialog
          open={sealing}
          onClose={() => setSealing(false)}
          draft={draft}
          provider={provider}
          token={token}
          timing={TIMINGS[timingKey]}
        />
      )}
    </div>
  );
}

function Choice({
  checked,
  onChange,
  name,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 border p-3 transition-colors ${checked ? "border-ink bg-sheet" : "border-rule hover:border-rule-strong"}`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-[var(--seal)]" />
      <span className="flex-1">{children}</span>
    </label>
  );
}

function EmptySheet() {
  return (
    <div className="sheet relative grid min-h-[520px] place-items-center overflow-hidden px-8 py-16 text-center">
      <div className="absolute inset-x-12 top-14 grid gap-3 opacity-60" aria-hidden>
        <div className="h-3 w-24 bg-paper-3" />
        <div className="h-9 w-3/4 bg-paper-2" />
        <div className="h-3 w-2/3 bg-paper-2" />
        <div className="mt-8 grid gap-2">
          {[90, 70, 80, 60].map((w) => (
            <div key={w} className="h-2.5 bg-paper-2" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
      <div className="relative">
        <Seal seed="empty" ghost size={150} className="mx-auto text-ink" />
        <p className="display mt-6 text-3xl">Your agreement will be typeset here.</p>
        <p className="mx-auto mt-2 max-w-sm text-ink-3">
          Scribe turns one sentence into milestones, prices, deadlines and acceptance criteria a tribunal can actually check.
        </p>
      </div>
    </div>
  );
}
