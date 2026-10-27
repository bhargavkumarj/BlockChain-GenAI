# Pactum: the idea

## The problem

The internet made it easy to work with strangers and never made it safe to pay them.

- **Freelancers** deliver first and chase invoices later, or accept a platform's cut (up to 20% on some marketplaces) in
  exchange for its dispute desk.
- **Clients** pay up front and hope, or pay on delivery and leave the freelancer exposed.
- **Small cross-border disputes** are effectively unenforceable: litigation costs more than the amount at stake, so the party
  holding the money wins by default.
- **Smart contracts** solve custody (nobody can run off with escrowed funds) but not judgment. A contract cannot tell whether a
  logo meets a brief, so pure on-chain escrow just moves the deadlock on-chain.

## The insight

Escrow needs two things that have never lived in the same place: **impartial custody** and **cheap, fast, explainable
judgment**. Blockchains are good at the first. Large language models are now good enough at the second, *if* the system
around them is designed for it:

1. Agreements must be **written to be judged**, with objective acceptance criteria instead of "make it look modern". So the AI
   that drafts the agreement is as important as the AI that judges it.
2. Judgment must be **robust** (no single model call decides), **due-process bound** (both sides heard first), **auditable**
   (every word published), and **appealable** to humans.
3. Money must only ever move along paths the contract enforces. The AI never holds funds; it can only sign a split of a
   milestone that is already in dispute.

## Who it is for

| User | Job to be done |
|---|---|
| Freelancers and small studios | Get paid on delivery without a 10–20% platform cut or a collections fight |
| Clients | Pay only for work that meets the brief, with a fast remedy when it does not |
| Peer-to-peer sellers | Sell a domain, a commission or a used camera to someone met online |
| DAOs, grant programs, bounty boards | Release milestone funding against checkable criteria |
| **AI agents** | Hold real budgets and take paid work with recourse. Ada, the resident agent, is the first such user |

## Why now

- **Models can judge.** Structured outputs, long context, vision and PDF input mean a juror can read an entire case file,
  including the delivered work itself, and return a typed opinion.
- **Agents are becoming economic actors.** Autonomous agents need a way to be hired and paid with accountability. An escrow
  with an evidence record and a tribunal is that missing piece.
- **L2 fees are negligible.** Storing a full case record in state on Base costs cents, so the protocol needs no indexer.

## Product decisions worth noting

- **Drafting is the moat.** Most disputes come from vague agreements. Scribe scores clarity and rewrites taste words into
  observable properties before money is ever locked.
- **Silence has consequences.** An unanswered review lets the provider claim; a missed deadline lets the client reclaim. No
  agreement can stall forever.
- **Settlement first.** Either party can propose a split at any time; the tribunal is the fallback, not the default.
- **Zero-friction onboarding.** A guest wallet and faucet mean a visitor can complete the entire lifecycle, dispute included,
  without installing anything.
- **Honest labelling.** Without an API key the app runs a deterministic simulator and says so on every page.

## Business model

A protocol fee (capped at 3% in the contract, set to 1% in the default deployment) taken only from the provider's payout, plus
an appeal fee paid to the human court. Even at 1%, Pactum undercuts marketplace fees by an order of magnitude because it does
not need a support organisation to adjudicate disputes.

## Risks and how the design answers them

| Risk | Mitigation |
|---|---|
| A model makes a bad call | Median of three independent jurors; published reasoning; human appeal court |
| Prompt injection via evidence | Evidence fenced as data, forged structure neutralised, manipulation flagged and penalised; median limits the blast radius |
| Re-rolling the tribunal for a better outcome | One ruling per dispute, keyed by the dispute's on-chain timestamp, with a session lock |
| The signing key is a trusted party | It can only split disputed milestones after due process; arbiter is per agreement and may be an ERC-1271 multisig or TEE-held key |
| Griefing the record | Per-party filing caps; deadlines on every window |
| Payment griefing by a reverting receiver | Pull-payment fallback credits the payout for withdrawal |

## What a production version needs next

Model diversity across providers for the jury, a hardware-backed or multisig arbiter key, an independent audit, KYC-free
fiat on-ramps for stablecoins, and integrations so marketplaces can use Pactum as their escrow and dispute layer.
