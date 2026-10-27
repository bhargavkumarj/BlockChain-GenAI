import type { Metadata } from "next";
import Link from "next/link";
import { SectionLabel } from "@/components/ui";
import { PACTUM_ADDRESS, explorerAddress } from "@/lib/config";

export const metadata: Metadata = {
  title: "The protocol",
  description: "How Pactum works: milestone escrow, an AI tribunal with median-of-three rulings, EIP-712 signatures and a clear trust model.",
};

const TOC = [
  ["lifecycle", "Lifecycle"],
  ["tribunal", "The tribunal"],
  ["trust", "Trust model"],
  ["contracts", "Contracts"],
  ["architecture", "Architecture"],
] as const;

export default function ProtocolPage() {
  const contract = PACTUM_ADDRESS ? explorerAddress(PACTUM_ADDRESS) : undefined;
  return (
    <div className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6 lg:py-16">
      <header className="grid gap-8 border-b border-ink pb-12 lg:grid-cols-[1fr_340px] lg:items-end">
        <div>
          <p className="label">The protocol · v1</p>
          <h1 className="display mt-3 text-[clamp(3rem,7vw,6.5rem)]">
            Small enough to audit.
            <br />
            <em className="text-seal">Fair enough to trust.</em>
          </h1>
        </div>
        <p className="leading-relaxed text-ink-2">
          Pactum is one Solidity contract, a handful of IPFS documents and four AI agents. This page explains what each part may and
          may not do, and why a stranger on the other side of the world can rely on it.
        </p>
      </header>

      <div className="grid gap-12 py-12 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="On this page">
          <ol className="sticky top-24 grid gap-2 font-mono text-[0.75rem] uppercase tracking-wider">
            {TOC.map(([id, label], i) => (
              <li key={id}>
                <a href={`#${id}`} className="text-ink-3 hover:text-seal">
                  {String(i + 1).padStart(2, "0")} {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="grid min-w-0 gap-20">
          <section id="lifecycle" className="scroll-mt-24">
            <SectionLabel n="1">Lifecycle</SectionLabel>
            <h2 className="display mt-6 text-5xl">Money moves only along these arrows.</h2>
            <div className="mt-6 grid gap-6 text-ink-2 md:grid-cols-2">
              <p className="leading-relaxed">
                A client funds the whole agreement up front. The provider accepts, then each milestone moves through its own state
                machine. Every transition is a transaction guarded by the contract; there is no admin path to the escrow.
              </p>
              <p className="leading-relaxed">
                Silence has consequences on both sides: a client who never reviews a delivery lets the provider claim payment, and a
                provider who misses a deadline lets the client reclaim the milestone. Either party can propose a split at any time.
              </p>
            </div>
            <figure className="mt-10 overflow-x-auto border border-rule bg-sheet p-6">
              <LifecycleDiagram />
              <figcaption className="mt-4 font-mono text-[0.7rem] text-ink-3">
                Milestone phases. Terminal phases are filled. A settlement offer accepted by the counterparty resolves any open phase.
              </figcaption>
            </figure>
          </section>

          <section id="tribunal" className="scroll-mt-24">
            <SectionLabel n="2">The tribunal</SectionLabel>
            <h2 className="display mt-6 text-5xl">Three jurors, one median, every word on IPFS.</h2>
            <ol className="mt-8 grid gap-px border border-rule bg-rule md:grid-cols-2">
              {[
                ["Due process", "A dispute freezes the milestone. The tribunal may sit only once both sides have filed or the evidence window has closed, and the contract enforces the same rule."],
                ["The record", "Terms, the on-chain timeline, the delivery and every filing are assembled into one case file. Text files are read in full; images and PDFs are attached for the model to see."],
                ["Independent jurors", "A Textualist, an Equitist and a Pragmatist deliberate in parallel, each producing a structured opinion with findings, per-criterion assessments and an award."],
                ["Median aggregation", "The binding award is the median of the three. No single juror, and no single prompt-injection success, can move the outcome on its own."],
                ["Opinion & publication", "A clerk writes the opinion of the tribunal. The full deliberation, with models and prompt version, is pinned to IPFS."],
                ["Signed & executable", "The arbiter signs an EIP-712 ruling binding agreement, milestone, split, the ruling's CID and the dispute's timestamp. Anyone can submit it; the contract verifies it."],
              ].map(([title, body], i) => (
                <li key={title} className="bg-sheet p-6">
                  <p className="font-serif text-3xl italic text-seal">{["I", "II", "III", "IV", "V", "VI"][i]}</p>
                  <p className="mt-2 font-medium">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <Fact title="Prompt-injection hardened">
                Party content is fenced and treated as evidence, never instructions. Any attempt to forge the record’s structure is
                neutralised, and manipulation attempts are flagged and held against the party who made them.
              </Fact>
              <Fact title="No re-rolls">
                Exactly one ruling per dispute: results are stored under (chain, contract, agreement, milestone, disputedAt) and a
                lock prevents parallel sessions.
              </Fact>
              <Fact title="Humans above the machine">
                Agreements can name a human appeal court. Within the appeal window, either party can escalate; the court’s decision
                replaces the AI ruling.
              </Fact>
            </div>
          </section>

          <section id="trust" className="scroll-mt-24">
            <SectionLabel n="3">Trust model</SectionLabel>
            <h2 className="display mt-6 text-5xl">Who can do what.</h2>
            <div className="mt-8 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-y border-ink">
                    <th className="label py-3 pr-4">Actor</th>
                    <th className="label py-3 pr-4">Can</th>
                    <th className="label py-3">Cannot</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  {[
                    ["Client", "Fund, approve or release early, dispute within the review period, reclaim a missed milestone, offer a split.", "Pull money back once work is delivered, except through a dispute or the provider’s consent."],
                    ["Provider", "Accept or decline, deliver, claim after an unanswered review period, dispute, refund, offer a split.", "Be paid for a milestone without approval, a lapsed review period, a ruling or a settlement."],
                    ["Tribunal signer", "Split a disputed milestone after due process, with a ruling bound to its published reasoning.", "Touch undisputed funds, rule early, replay a ruling, or rule on a different dispute."],
                    ["Appeal court", "Replace a ruling during the appeal window when a party appeals (optional per agreement).", "Act on agreements that did not name it, or on milestones nobody appealed."],
                    ["Protocol owner", "Set the protocol fee (capped at 3%, taken from the provider’s share) and the appeal fee.", "Move, freeze or redirect any escrowed funds."],
                  ].map(([who, can, cannot]) => (
                    <tr key={who} className="border-b border-rule">
                      <td className="py-4 pr-4 font-serif text-xl">{who}</td>
                      <td className="py-4 pr-4 leading-relaxed text-ink-2">{can}</td>
                      <td className="py-4 leading-relaxed text-ink-2">{cannot}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 max-w-3xl leading-relaxed text-ink-2">
              The arbiter is chosen per agreement and can be any EOA or ERC-1271 contract, so the single signing key used today can be
              swapped for a multisig of independent model operators or a key held in a trusted execution environment without changing
              the escrow contract.
            </p>
          </section>

          <section id="contracts" className="scroll-mt-24">
            <SectionLabel n="4">Contracts</SectionLabel>
            <h2 className="display mt-6 text-5xl">Boring on purpose.</h2>
            <ul className="mt-8 grid gap-x-10 gap-y-5 md:grid-cols-2">
              {[
                ["Exact solvency", "An invariant test drives thousands of random user actions and checks the escrow always holds exactly the open milestones plus accrued fees."],
                ["Pull-payment fallback", "Payouts are pushed; if a receiver reverts (a contract wallet, a blacklisted address), the amount is credited for withdrawal instead of blocking the counterparty."],
                ["Transient reentrancy guard", "EIP-1153 transient storage via OpenZeppelin, plus checks-effects-interactions on every payout."],
                ["One-transaction funding", "EIP-2612 permits let EOAs approve and escrow in a single transaction; fee-on-transfer tokens are rejected."],
                ["Evidence caps per party", "Each side may file up to eight times per dispute, so neither can exhaust the record and silence the other."],
                ["Fully on-chain record", "Deliveries, filings, rulings and timestamps live in state, so any client can rebuild a case without an indexer."],
              ].map(([title, body]) => (
                <li key={title} className="border-t border-rule pt-4">
                  <p className="font-medium">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-8 font-mono text-xs text-ink-3">
              Solidity 0.8.28 · OpenZeppelin 5 · Foundry: unit, fuzz and invariant suites ·{" "}
              {contract ? (
                <a className="link" href={contract} target="_blank" rel="noreferrer">
                  deployed contract ↗
                </a>
              ) : (
                "deployment pending"
              )}
            </p>
          </section>

          <section id="architecture" className="scroll-mt-24">
            <SectionLabel n="5">Architecture</SectionLabel>
            <h2 className="display mt-6 text-5xl">Where everything lives.</h2>
            <figure className="mt-8 overflow-x-auto border border-rule bg-sheet p-6">
              <ArchitectureDiagram />
            </figure>
            <div className="mt-8 grid gap-6 md:grid-cols-4">
              <Fact title="Scribe">Drafts agreements from one sentence as schema-validated JSON, streamed into the page as it is written.</Fact>
              <Fact title="Clerk">Answers questions about a specific agreement, grounded in its terms and live on-chain state.</Fact>
              <Fact title="Inspector">Checks a delivery against its acceptance criteria before the client approves. Advice, not a ruling.</Fact>
              <Fact title="Ada">An autonomous provider agent with its own wallet: accepts, delivers, defends and gets paid on-chain.</Fact>
            </div>
            <p className="mt-10">
              <Link href="/draft" className="btn btn-ink">
                Try the whole lifecycle
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-seal pl-4">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">{children}</p>
    </div>
  );
}

function Node({ x, y, w = 128, label, terminal = false, tone = "ink" }: { x: number; y: number; w?: number; label: string; terminal?: boolean; tone?: "ink" | "seal" | "ledger" }) {
  const color = tone === "seal" ? "var(--seal)" : tone === "ledger" ? "var(--ledger)" : "var(--ink)";
  return (
    <g>
      <rect x={x} y={y} width={w} height={40} fill={terminal ? color : "var(--sheet)"} stroke={color} strokeWidth={1.4} />
      <text
        x={x + w / 2}
        y={y + 21}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="var(--font-mono)"
        fontSize="12"
        letterSpacing="0.06em"
        fill={terminal ? "var(--sheet)" : color}
      >
        {label.toUpperCase()}
      </text>
    </g>
  );
}

function Edge({ d, label, lx, ly }: { d: string; label?: string; lx?: number; ly?: number }) {
  return (
    <g>
      <path d={d} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} markerEnd="url(#arrow)" />
      {label && (
        <text x={lx} y={ly} fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--ink-2)" textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

function LifecycleDiagram() {
  return (
    <svg viewBox="0 0 900 330" className="w-full min-w-[760px]" role="img" aria-label="Milestone state machine">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--ink-3)" />
        </marker>
      </defs>
      <Node x={20} y={40} label="Pending" />
      <Node x={250} y={40} label="Delivered" />
      <Node x={500} y={40} label="Released" terminal tone="ledger" />
      <Node x={250} y={160} label="Disputed" tone="seal" />
      <Node x={500} y={160} label="Ruled" tone="seal" />
      <Node x={740} y={160} w={140} label="Resolved" terminal tone="ledger" />
      <Node x={500} y={270} label="Appealed" tone="seal" />
      <Node x={20} y={270} label="Refunded" terminal />

      <Edge d="M148 60 L246 60" label="deliver" lx={197} ly={50} />
      <Edge d="M378 60 L496 60" label="approve · claim" lx={437} ly={50} />
      <Edge d="M314 80 L314 156" label="dispute" lx={346} ly={122} />
      <Edge d="M84 80 C84 150 200 180 246 180" label="dispute" lx={150} ly={152} />
      <Edge d="M378 180 L496 180" label="signed ruling" lx={437} ly={170} />
      <Edge d="M628 180 L736 180" label="finalize" lx={682} ly={170} />
      <Edge d="M564 200 L564 266" label="appeal" lx={592} ly={238} />
      <Edge d="M628 290 C700 290 790 260 806 204" label="court decides" lx={740} ly={300} />
      <Edge d="M378 168 C560 120 700 130 790 156" label="final ruling (no appeals)" lx={610} ly={120} />
      <Edge d="M84 80 L84 266" label="reclaim after deadline" lx={84} ly={238} />
    </svg>
  );
}

function ArchitectureDiagram() {
  const box = (x: number, y: number, w: number, h: number, title: string, lines: string[], accent = false) => (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--sheet)" stroke={accent ? "var(--seal)" : "var(--ink)"} strokeWidth={1.4} />
      <text x={x + 14} y={y + 24} fontFamily="var(--font-serif)" fontSize="20" fill="var(--ink)">
        {title}
      </text>
      {lines.map((l, i) => (
        <text key={l} x={x + 14} y={y + 50 + i * 19} fontFamily="var(--font-mono)" fontSize="11" fill="var(--ink-2)">
          {l}
        </text>
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 900 330" className="w-full min-w-[760px]" role="img" aria-label="System architecture">
      <defs>
        <marker id="arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--ink-3)" />
        </marker>
      </defs>
      {box(20, 30, 230, 150, "Browser", ["Next.js 16 · React 19", "wagmi 3 · viem", "guest wallet · permits", "streams AI over SSE"])}
      {box(335, 30, 230, 150, "Pactum server", ["Scribe · Clerk · Inspector", "Tribunal (3 jurors + clerk)", "Ada (agent wallet)", "EIP-712 signer"], true)}
      {box(650, 30, 230, 150, "Base", ["Pactum.sol escrow", "TestUSD (EIP-2612)", "rulings verified on-chain", "portable track records"])}
      {box(335, 220, 230, 90, "Claude", ["Opus 5.5 · structured outputs", "streaming · vision · fallbacks"])}
      {box(650, 220, 230, 90, "IPFS", ["terms · deliveries · evidence", "full tribunal records"])}
      {box(20, 220, 230, 90, "KV", ["rate limits · tribunal locks", "one ruling per dispute"])}
      <g stroke="var(--ink-3)" strokeWidth={1.2} fill="none" markerEnd="url(#arrow2)">
        <path d="M250 90 L331 90" />
        <path d="M335 120 L254 120" />
        <path d="M250 150 C450 210 560 200 646 150" />
        <path d="M565 90 L646 90" />
        <path d="M450 180 L450 216" />
        <path d="M565 260 L646 260" />
        <path d="M335 265 L254 265" />
      </g>
      <text x="290" y="82" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="11" fill="var(--ink-2)">API</text>
      <text x="606" y="82" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="11" fill="var(--ink-2)">reads · agent txs</text>
      <text x="450" y="212" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="11" fill="var(--ink-2)">wallet transactions</text>
    </svg>
  );
}
