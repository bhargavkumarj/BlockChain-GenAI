import Link from "next/link";
import { JurorGlyph } from "@/components/agreement/juror-glyph";
import { HeroPrompt } from "@/components/landing/hero-prompt";
import { Seal } from "@/components/seal";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { CHAIN_LABEL } from "@/lib/config";
import { agreementNumber } from "@/lib/format";
import { JURORS } from "@/lib/schemas";
import { readLandingData } from "@/lib/server/stats";

export const revalidate = 60;

const EXAMPLE_TICKER = [
  { id: 1, title: "Brand identity for a bakery", amount: "400 tUSD", status: "Example" },
  { id: 2, title: "Spanish translation of a landing page", amount: "90 tUSD", status: "Example" },
  { id: 3, title: "Five taglines for a climbing gym", amount: "60 tUSD", status: "Example" },
  { id: 4, title: "React component library", amount: "1,500 tUSD", status: "Example" },
];

export default async function Home() {
  const data = await readLandingData();
  const ticker = data.ticker.length ? data.ticker : EXAMPLE_TICKER;

  return (
    <>
      <Header />
      <main>
        {/* ───────────── Hero */}
        <section className="relative overflow-hidden border-b border-rule">
          <GridLines />
          <div className="relative mx-auto grid max-w-[1320px] gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:pb-28 lg:pt-20">
            <div className="animate-rise">
              <p className="label">№ 001 — A protocol for kept promises</p>
              <h1 className="display mt-6 text-[clamp(3.6rem,8.6vw,8.4rem)]">
                Agreements
                <br />
                that keep <em className="text-seal">themselves.</em>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-ink-2 sm:text-xl">
                Describe a deal in plain words. Pactum drafts it with AI, locks the money in an on-chain escrow, and if anything goes
                wrong, convenes an AI tribunal that rules in minutes, not months.
              </p>
              <HeroPrompt />
              <p className="mt-5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-3">
                <span>No wallet needed to draft</span>
                <span>Free test funds to seal</span>
                <span>{CHAIN_LABEL} · IPFS · Claude</span>
              </p>
            </div>
            <Specimen />
          </div>
        </section>

        {/* ───────────── Live ledger ticker */}
        <section className="marquee overflow-hidden border-b border-ink bg-ink py-3 text-paper" aria-label="Recent agreements">
          <div className="marquee-track flex w-max gap-10 whitespace-nowrap font-mono text-[0.72rem] uppercase tracking-[0.08em]">
            {[...ticker, ...ticker, ...ticker, ...ticker].map((t, i) => (
              <span key={i} className="flex items-center gap-3">
                <span className="text-seal">✦</span>
                <span className="text-paper/60">{agreementNumber(t.id)}</span>
                <span>{t.title}</span>
                <span className="text-paper/60">{t.amount}</span>
                <span className="text-[var(--ledger-wash)]">{t.status}</span>
              </span>
            ))}
          </div>
        </section>

        {/* ───────────── Numbers */}
        <section className="border-b border-rule">
          <dl className="mx-auto grid max-w-[1320px] grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:divide-x lg:divide-rule">
            {[
              ["Agreements sealed", data.agreements.toLocaleString("en-US")],
              ["tUSD under agreement", data.escrowedUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })],
              ["Rulings issued", data.rulings.toLocaleString("en-US")],
              ["Jobs completed by Ada", data.adaJobs.toLocaleString("en-US")],
            ].map(([label, value], i) => (
              <div key={label} className={`py-8 ${i > 0 ? "lg:pl-8" : ""} ${i % 2 === 1 ? "pl-6 max-lg:border-l max-lg:border-rule" : ""}`}>
                <dt className="label">{label}</dt>
                <dd className="display mt-2 text-6xl tabular">{data.live ? value : "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ───────────── The problem */}
        <section className="mx-auto max-w-[1320px] px-4 py-24 sm:px-6 lg:py-32">
          <p className="label">§ I — The problem</p>
          <h2 className="display mt-6 max-w-5xl text-[clamp(2.5rem,5.6vw,5rem)]">
            The internet made it easy to work with strangers. It never made it <em className="text-seal">safe to pay them.</em>
          </h2>
          <div className="mt-16 grid gap-px border border-rule bg-rule md:grid-cols-3">
            {[
              ["Platforms", "Marketplaces keep up to 20% of every invoice to stand in the middle, and their support desk is the court of appeal."],
              ["Courts", "Small cross-border disputes are too slow and too expensive to litigate. In practice, the party holding the money wins."],
              ["Smart contracts", "Code can hold money impartially, but it cannot tell whether a logo meets a brief. Real agreements need judgment."],
            ].map(([title, body]) => (
              <div key={title} className="bg-paper p-8">
                <p className="font-serif text-3xl">{title}</p>
                <p className="mt-3 leading-relaxed text-ink-2">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-12 max-w-3xl font-serif text-[1.9rem] leading-snug">
            Pactum splits the job: <span className="text-seal">code holds the money</span>, AI supplies the judgment, and humans keep
            the final say.
          </p>
        </section>

        {/* ───────────── How it works */}
        <section className="border-y border-rule bg-paper-2">
          <div className="mx-auto max-w-[1320px] px-4 py-24 sm:px-6 lg:py-28">
            <p className="label">§ II — How it works</p>
            <h2 className="display mt-6 text-[clamp(2.5rem,5vw,4.5rem)]">Four articles. That is the whole protocol.</h2>
            <ol className="mt-16 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {[
                ["I", "Draft", "Say it in a sentence. Scribe returns milestones, prices, deadlines and acceptance criteria a tribunal can actually check, with editorial notes on anything ambiguous.", <DraftArt key="d" />],
                ["II", "Seal", "Terms are pinned to IPFS. One signature and one transaction lock the money in escrow on Base. Neither side can move it alone.", <SealArt key="s" />],
                ["III", "Deliver", "Work is submitted on-chain, content-addressed and timestamped. Approve to pay, or let the review period lapse and the provider can claim.", <DeliverArt key="v" />],
                ["IV", "Adjudicate", "Disagree? Three AI jurors read the record independently. Their median becomes a signed ruling the contract executes.", <JudgeArt key="j" />],
              ].map(([n, title, body, art]) => (
                <li key={n as string} className="border-t border-ink pt-6">
                  <div className="flex items-baseline justify-between">
                    <span className="font-serif text-6xl italic text-seal">{n}</span>
                    <span className="label">Article {n}</span>
                  </div>
                  <div className="mt-6 grid h-36 place-items-center border border-rule bg-sheet">{art}</div>
                  <h3 className="mt-6 font-serif text-3xl">{title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-2">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────────── The tribunal */}
        <section className="bg-ink text-paper">
          <div className="mx-auto grid max-w-[1320px] gap-16 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-32">
            <div>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-paper/60">§ III — The tribunal</p>
              <h2 className="display mt-6 text-[clamp(2.5rem,5vw,4.75rem)]">
                Three judges.
                <br />
                <em className="text-seal">No single point of failure.</em>
              </h2>
              <p className="mt-8 max-w-lg text-lg leading-relaxed text-paper/75">
                Each juror holds a different judicial philosophy and deliberates alone over the full record, images and documents
                included. The binding award is the median, so no single model, and no single manipulated prompt, decides the outcome.
              </p>
              <ul className="mt-10 grid gap-4 text-paper/85">
                {[
                  "Due process enforced by the contract: both sides are heard first",
                  "Evidence is fenced as data; manipulation attempts are flagged",
                  "Every opinion, model and prompt version is published on IPFS",
                  "Rulings are EIP-712 signatures the contract verifies, never replayable",
                  "Optional human appeal court with the final word",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-2 size-1.5 shrink-0 rotate-45 bg-seal" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid content-start gap-4">
              {JURORS.map((j, i) => (
                <div key={j.id} className="grid grid-cols-[64px_1fr_auto] items-center gap-5 border border-paper/20 p-5">
                  <span className="text-paper">
                    <JurorGlyph id={j.id} size={64} />
                  </span>
                  <div>
                    <p className="font-mono text-[0.65rem] uppercase tracking-widest text-paper/50">Seat {j.seat}</p>
                    <p className="font-serif text-3xl">{j.name}</p>
                    <p className="text-sm italic text-paper/60">{j.motto}</p>
                  </div>
                  <span className="display text-4xl tabular text-paper/80">{[55, 68, 72][i]}%</span>
                </div>
              ))}
              <div className="border border-seal p-5">
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-[0.65rem] uppercase tracking-widest text-paper/60">Median · binding award</p>
                  <p className="display text-5xl text-seal">68%</p>
                </div>
                <div className="relative mt-5 h-px bg-paper/60">
                  {[55, 68, 72].map((s) => (
                    <span key={s} className="absolute -top-1 size-2 -translate-x-1/2 rotate-45 bg-paper" style={{ left: `${s}%` }} />
                  ))}
                  <span className="absolute top-0 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-seal" style={{ left: "68%" }} />
                </div>
                <p className="mt-6 font-serif text-lg italic leading-snug text-paper/85">
                  “The work was delivered on time and meets four of five criteria; the provider earns the milestone less the value of
                  the missing variant.”
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────── Ada */}
        <section className="mx-auto grid max-w-[1320px] gap-16 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:py-32">
          <div>
            <p className="label">§ IV — Meet Ada</p>
            <h2 className="display mt-6 text-[clamp(2.5rem,5vw,4.5rem)]">A freelancer with its own wallet.</h2>
            <p className="mt-8 text-lg leading-relaxed text-ink-2">
              Ada is an autonomous AI agent living on the protocol. Hire it for copy, documentation, code or SVG artwork: it reads your
              agreement, decides whether it can deliver, writes the work, pins it to IPFS, submits it on-chain, and answers for it
              before the tribunal. Agents will be economic actors; this is what accountable agent commerce looks like.
            </p>
            <Link href="/draft" className="btn btn-ink mt-8">
              Hire Ada
            </Link>
          </div>
          <div className="self-start border border-ink bg-ink p-6 font-mono text-[0.8rem] leading-relaxed text-paper/85 shadow-[10px_10px_0_0_var(--seal)]">
            <p className="text-[0.65rem] uppercase tracking-[0.12em] text-paper/50">Ada’s desk · agreement № 0042</p>
            <ol className="mt-4 grid gap-2.5">
              {[
                ["14:02:11", "Reading the agreement"],
                ["14:02:14", "Accepting: every milestone can be delivered as text and SVG", "ledger"],
                ["14:02:15", "Accepted on-chain · 0x7d8f…c952", "ledger"],
                ["14:02:16", "Working on milestone I: tagline-options.md"],
                ["14:02:41", "Pinned 2 files to IPFS · bafkrei…q4ma"],
                ["14:02:42", "Delivered on-chain · 0x093f…3e9a", "ledger"],
                ["14:19:05", "Client disputed milestone I: preparing a statement"],
                ["14:19:22", "Filed statement with the tribunal · 0x72a7…fe25"],
                ["14:24:50", "Ruling executed: 68% to provider · 40.8 tUSD received", "ledger"],
              ].map(([t, text, tone]) => (
                <li key={t} className="grid grid-cols-[4.5rem_1fr] gap-3">
                  <span className="text-paper/40">{t}</span>
                  <span className={tone ? "text-[var(--ledger-wash)]" : ""}>{text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-paper/50">
              <span className="caret" />
            </p>
          </div>
        </section>

        {/* ───────────── Use cases */}
        <section className="border-t border-rule bg-paper-2">
          <div className="mx-auto max-w-[1320px] px-4 py-24 sm:px-6">
            <p className="label">§ V — Built for</p>
            <div className="mt-10 grid gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Freelancers & clients", "Get paid on delivery, not on goodwill. Clients pay only for what meets the brief."],
                ["Peer-to-peer deals", "Selling a domain, a used camera or a custom commission to someone you met online."],
                ["Bounties & grants", "Fund milestones up front; release them as checkable criteria are met."],
                ["Hiring AI agents", "Give autonomous agents real budgets with recourse when their work falls short."],
              ].map(([title, body]) => (
                <div key={title} className="bg-paper p-7">
                  <p className="font-serif text-2xl">{title}</p>
                  <p className="mt-3 text-sm leading-relaxed text-ink-2">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────── Spec sheet */}
        <section className="mx-auto grid max-w-[1320px] gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:py-28">
          <div>
            <p className="label">§ VI — Under the hood</p>
            <h2 className="display mt-6 text-[clamp(2.5rem,5vw,4rem)]">Open, verifiable, small.</h2>
            <p className="mt-6 leading-relaxed text-ink-2">
              One escrow contract with unit, fuzz and invariant tests. Every document content-addressed. Every AI decision published
              with the model and prompt version that produced it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/protocol" className="btn btn-ink">
                Read the protocol
              </Link>
              <Link href="/precedents" className="btn btn-line">
                Browse precedents
              </Link>
            </div>
          </div>
          <dl className="border-t border-ink font-mono text-[0.8rem]">
            {[
              ["Settlement", `Solidity 0.8.28 · OpenZeppelin 5 · ${CHAIN_LABEL}`],
              ["Signatures", "EIP-712 rulings · ERC-1271 arbiters · EIP-2612 permits"],
              ["Safety", "Transient reentrancy guard · pull-payment fallback · invariant-tested solvency"],
              ["Storage", "IPFS: terms, deliveries, evidence, full tribunal records"],
              ["Intelligence", "Claude Opus 5.5 · structured outputs · vision · streaming"],
              ["Agents", "Scribe · Clerk · Inspector · Tribunal (3 + clerk) · Ada"],
              ["Interface", "Next.js 16 · React 19 · wagmi 3 · viem · Tailwind 4"],
              ["Onboarding", "Guest wallet in one click · faucet · Coinbase Smart Wallet"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-4 border-b border-rule py-3.5 sm:grid-cols-[11rem_1fr]">
                <dt className="uppercase tracking-[0.08em] text-ink-3">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <Footer big />
    </>
  );
}

/** Faint layout grid behind the hero, like the guides on a typesetter's page. */
function GridLines() {
  return (
    <div className="pointer-events-none absolute inset-0 mx-auto grid max-w-[1320px] grid-cols-6 px-4 opacity-60 sm:px-6 lg:grid-cols-12" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className={`border-l border-rule/70 ${i >= 6 ? "hidden lg:block" : ""} ${i === 11 ? "border-r" : ""}`} />
      ))}
    </div>
  );
}

/** A collage of paper: a sealed agreement and the tribunal's ruling slip. */
function Specimen() {
  return (
    <div className="relative mx-auto h-[520px] w-full max-w-[460px] lg:mt-6" aria-hidden>
      <div className="sheet absolute left-0 top-0 w-[88%] rotate-[-2.5deg] px-7 pb-8 pt-7 animate-rise [animation-delay:150ms]">
        <p className="label">Agreement № 0042 · in force</p>
        <p className="display mt-3 text-[2.1rem]">Brand identity for Crumb &amp; Co</p>
        <div className="mt-5 grid gap-3 border-t border-rule pt-4">
          {[
            ["I", "Three logo concepts", "160"],
            ["II", "Final mark & usage note", "240"],
          ].map(([n, t, a]) => (
            <div key={n} className="grid grid-cols-[1.8rem_1fr_auto] items-baseline gap-2">
              <span className="font-serif text-xl italic text-seal">{n}</span>
              <span className="text-sm">{t}</span>
              <span className="font-mono text-xs">{a} tUSD</span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-1.5">
          {["Exactly three distinct concepts", "Valid SVG with a viewBox", "Works in a single colour"].map((c) => (
            <p key={c} className="flex items-center gap-2 text-[0.82rem] text-ink-2">
              <span className="size-2.5 border border-ink/60" />
              {c}
            </p>
          ))}
        </div>
      </div>
      <div className="absolute right-0 top-[38%] text-seal animate-stamp [animation-delay:700ms]">
        <Seal seed="42:specimen" number={42} size={170} />
      </div>
      <div className="sheet absolute bottom-2 left-[14%] w-[80%] rotate-[2deg] px-6 py-5 animate-rise [animation-delay:350ms]">
        <div className="flex items-baseline justify-between">
          <p className="label">Ruling · milestone II</p>
          <p className="font-mono text-[0.65rem] text-ink-3">ipfs://bafkrei…7zbq</p>
        </div>
        <p className="mt-2 font-serif text-lg italic leading-snug">“Substantially performed; the usage note is missing.”</p>
        <div className="mt-4 flex justify-between font-mono text-[0.65rem] uppercase tracking-wider">
          <span className="text-ledger">Provider 80%</span>
          <span className="text-ink-3">Client 20%</span>
        </div>
        <div className="mt-1.5 h-2 border border-ink/80">
          <div className="h-full w-[80%] bg-ledger" />
        </div>
      </div>
    </div>
  );
}

function DraftArt() {
  return (
    <svg viewBox="0 0 160 100" width="160" height="100">
      <text x="6" y="22" fontFamily="var(--font-serif)" fontSize="13" fontStyle="italic" fill="var(--ink-2)">
        “a logo, 400, two weeks”
      </text>
      <path d="M80 30 L80 44" stroke="var(--seal)" strokeWidth="1.4" markerEnd="url(#a1)" />
      <defs>
        <marker id="a1" viewBox="0 0 10 10" refX="5" refY="9" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 0 L5 10 z" fill="var(--seal)" />
        </marker>
      </defs>
      {[54, 66, 78, 90].map((y, i) => (
        <g key={y}>
          <text x="20" y={y + 3} fontFamily="var(--font-mono)" fontSize="8" fill="var(--seal)">
            §{i + 1}
          </text>
          <rect x="36" y={y - 2} width={[96, 80, 104, 70][i]} height="4" fill="var(--ink)" opacity="0.75" />
        </g>
      ))}
    </svg>
  );
}

function SealArt() {
  return (
    <div className="text-seal">
      <Seal seed="article-ii" number={2} size={104} />
    </div>
  );
}

function DeliverArt() {
  return (
    <svg viewBox="0 0 160 100" width="160" height="100">
      <rect x="30" y="12" width="64" height="78" fill="var(--sheet)" stroke="var(--ink)" strokeWidth="1.4" />
      <path d="M78 12 L94 28 L78 28 Z" fill="var(--paper-3)" stroke="var(--ink)" strokeWidth="1.2" />
      {[40, 50, 60, 70].map((y, i) => (
        <rect key={y} x="40" y={y} width={[40, 32, 44, 26][i]} height="3" fill="var(--ink)" opacity="0.6" />
      ))}
      <text x="102" y="48" fontFamily="var(--font-mono)" fontSize="8" fill="var(--ink-2)">
        bafkrei…
      </text>
      <text x="102" y="60" fontFamily="var(--font-mono)" fontSize="8" fill="var(--ledger)">
        ✓ on-chain
      </text>
      <text x="102" y="72" fontFamily="var(--font-mono)" fontSize="8" fill="var(--ink-3)">
        14:02 UTC
      </text>
    </svg>
  );
}

function JudgeArt() {
  return (
    <div className="flex items-center gap-2 text-ink">
      {JURORS.map((j) => (
        <JurorGlyph key={j.id} id={j.id} size={40} />
      ))}
      <span className="ml-2 grid size-10 place-items-center rounded-full border-2 border-seal font-mono text-xs text-seal">x̃</span>
    </div>
  );
}
