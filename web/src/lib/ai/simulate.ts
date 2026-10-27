import "server-only";
import { keccak256, toHex } from "viem";
import { roman } from "@/lib/format";
import type {
  AgentDecision,
  AgentDefense,
  AgentDeliverable,
  AgreementDraft,
  InspectionReport,
  JurorId,
  JurorOpinion,
  TermsDocument,
  TribunalOpinion,
} from "@/lib/schemas";

/**
 * Deterministic stand-ins for every model call. They power local development without an API key and make
 * end-to-end tests reproducible. Output is plausible but plainly formulaic; live mode replaces all of it.
 */

function seeded(input: string) {
  const hash = keccak256(toHex(input));
  let i = 2;
  return (max: number) => {
    const n = parseInt(hash.slice(i, i + 4), 16);
    i = i + 4 > 62 ? 2 : i + 4;
    return n % max;
  };
}

export function simulateDraft(prompt: string, current?: AgreementDraft, instruction?: string): AgreementDraft {
  if (current && instruction) {
    const next = structuredClone(current);
    next.clarity.issues = next.clarity.issues.slice(1);
    next.clarity.score = Math.min(96, next.clarity.score + 6);
    if (/revision/i.test(instruction)) {
      next.clauses = next.clauses.map((c) =>
        c.heading === "Revisions" ? { ...c, body: `${c.body} Additional rounds are billed at 10% of the milestone each.` } : c,
      );
    } else {
      next.clauses.push({ heading: "Amendment", body: `As requested: ${instruction.trim().replace(/\.$/, "")}.` });
    }
    return next;
  }

  const text = prompt.trim();
  const amountMatch =
    text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:t?usd|usdc|dollars|eth)\b/i) ??
    text.match(/\$\s*(\d[\d,]*(?:\.\d+)?)/) ??
    text.match(/(\d[\d,]*(?:\.\d+)?)/);
  const total = amountMatch ? Number(amountMatch[1]!.replace(/,/g, "")) : 300;
  const currency = /\beth\b/i.test(text) ? "ETH" : "tUSD";
  const daysMatch = text.match(/(\d+)\s*(day|week)s?/i);
  const days = daysMatch ? Number(daysMatch[1]) * (/week/i.test(daysMatch[2]!) ? 7 : 1) : 10;
  const design = /logo|design|brand|illustrat|poster|icon/i.test(text);
  const writing = /write|copy|blog|article|poem|tagline|post|story|newsletter/i.test(text);
  const subject = text
    .split(/[.:;—]|,\s/)[0]!
    .replace(/^(an?|the)\s+/i, "")
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");

  const first = Math.round(total * 0.4 * 100) / 100;
  const second = Math.round((total - first) * 100) / 100;
  const kind = design ? "concepts" : writing ? "draft" : "first version";

  return {
    title: subject.length > 6 ? subject.charAt(0).toUpperCase() + subject.slice(1) : "Service agreement",
    summary: `${text.length > 160 ? `${text.slice(0, 157)}…` : text.replace(/\.?$/, ".")} Paid in two milestones, ${total} ${currency} in total.`,
    category: design ? "design" : writing ? "writing" : "services",
    clientLabel: "Client",
    providerLabel: design ? "Designer" : writing ? "Writer" : "Provider",
    currency,
    milestones: [
      {
        title: `Initial ${kind}`,
        description: `A first complete ${kind} for review, covering the full brief.`,
        amount: first,
        dueInDays: Math.max(1, Math.round(days / 2)),
        deliverables: design ? ["Three distinct concepts as SVG files"] : ["Complete first draft as a Markdown file"],
        acceptanceCriteria: design
          ? ["Exactly three concepts are delivered", "Each concept is a valid SVG file with a viewBox", "Each concept works in one colour"]
          : ["The draft covers every point in the brief", "Length is within ±10% of the requested length", "No placeholder text remains"],
      },
      {
        title: "Final delivery",
        description: "Revisions incorporated and final files handed over.",
        amount: second,
        dueInDays: days,
        deliverables: design ? ["Final logo in SVG and a usage note"] : ["Final text as Markdown and plain text"],
        acceptanceCriteria: design
          ? ["All requested revisions from milestone I are applied", "Final logo delivered as SVG", "A one-page usage note is included"]
          : ["All requested revisions are applied", "Final file is proofread with no spelling errors", "Delivered in both requested formats"],
      },
    ],
    clauses: [
      { heading: "Revisions", body: "The client may request up to two rounds of revisions per milestone, within the review period." },
      { heading: "Ownership & licence", body: "On payment of each milestone, all rights in the delivered work transfer to the client." },
      { heading: "Communication", body: "Both parties reply to messages within two business days." },
      { heading: "Late delivery", body: "If a milestone is not delivered by its due date, the client may reclaim that milestone's escrow." },
      { heading: "Cancellation", body: "Before acceptance either party may withdraw. Afterwards, unfinished milestones are settled by agreement or by the tribunal." },
    ],
    clarity: {
      score: amountMatch ? 78 : 64,
      issues: [
        ...(amountMatch
          ? []
          : [{ severity: "high" as const, clause: "Price", issue: "No price was stated.", suggestion: `Confirm the total of ${total} ${currency}.` }]),
        {
          severity: "medium",
          clause: "Milestone I",
          issue: "Style expectations are not defined.",
          suggestion: "Attach two or three reference examples the client likes.",
        },
        {
          severity: "low",
          clause: "Communication",
          issue: "No channel is named.",
          suggestion: "Name the channel (email, Telegram, etc.) used for revision requests.",
        },
      ],
    },
  };
}

export function simulateClerk(question: string, terms: TermsDocument | null) {
  const d = terms?.draft;
  if (!d) return "I could not load the terms document for this agreement, so I can only speak to its on-chain state.";
  const q = question.toLowerCase();
  const revisions = d.clauses.findIndex((c) => /revision/i.test(c.heading));
  if (q.includes("revision") && revisions >= 0) {
    return `Under § ${revisions + 1} (${d.clauses[revisions]!.heading}): ${d.clauses[revisions]!.body} Anything beyond that is outside the agreement unless both parties settle on new terms.`;
  }
  if (q.includes("late") || q.includes("deadline")) {
    return `Each milestone has its own due date. If milestone ${roman(1)} is not delivered in time, the client can reclaim that milestone's escrow on-chain; a delivery that arrives first stops that option.`;
  }
  return `This agreement has ${d.milestones.length} milestones: ${d.milestones
    .map((m, i) => `${roman(i + 1)} "${m.title}" for ${m.amount} ${d.currency}`)
    .join(", ")}. Payment for each is released when the client approves it, or automatically once the review period lapses.`;
}

export function simulateInspection(criteria: string[], hasDelivery: boolean): InspectionReport {
  if (!hasDelivery) {
    return {
      verdict: "insufficient_evidence",
      summary: "No delivery has been submitted for this milestone yet.",
      criteria: criteria.map((c) => ({ criterion: c, assessment: "unverifiable", reasoning: "Nothing delivered." })),
      suggestions: [],
    };
  }
  return {
    verdict: "partially_meets",
    summary: "Most acceptance criteria are visibly satisfied; one cannot be fully verified from the files alone.",
    criteria: criteria.map((c, i) => ({
      criterion: c,
      assessment: i === criteria.length - 1 ? "partially_met" : "met",
      reasoning: i === criteria.length - 1 ? "Only partly evidenced in the delivered files." : "Evidenced directly in the delivered files.",
    })),
    suggestions: ["Ask the provider to point to where the last criterion is satisfied before approving."],
  };
}

export function simulateJuror(id: JurorId, seed: string, criteria: string[]): JurorOpinion {
  const r = seeded(`${seed}:${id}`);
  const base = 45 + r(30);
  const lean = id === "textualist" ? -8 : id === "equitist" ? 4 : 10;
  const share = Math.max(0, Math.min(100, base + lean));
  return {
    holding: `The provider earns ${share}% of the milestone: the work was delivered but did not meet every criterion as written.`,
    findings: [
      "A delivery was submitted on-chain with its files pinned to IPFS.",
      "The client opened a dispute within the review period.",
      "Both parties' filings were considered.",
    ],
    criteria: criteria.map((c, i) => ({
      criterion: c,
      assessment: i % 3 === 2 ? "partially_met" : i % 3 === 1 && r(2) === 0 ? "not_met" : "met",
      reasoning: "Assessed against the delivered files in the record.",
    })),
    analysis:
      id === "textualist"
        ? "Read strictly, the acceptance criteria are only partly satisfied. Payment follows the criteria that were met; nothing outside the text is added or excused."
        : id === "equitist"
          ? "Both parties acted in good faith. The client received real value and should pay for it, but not for the portion that fell short."
          : "A professional in this field would consider the work substantially performed, with defects that are fixable but material enough to reduce the fee.",
    providerSharePercent: share,
    confidence: 60 + r(30),
    integrityFlags: [],
  };
}

export function simulateOpinion(median: number, shares: number[]): TribunalOpinion {
  const spread = Math.max(...shares) - Math.min(...shares);
  return {
    title: "On the disputed milestone",
    holding: `The tribunal awards ${median}% of the milestone to the provider and returns ${100 - median}% to the client.`,
    reasoning:
      "The jurors agree that a genuine delivery was made and that it fell short of the agreed acceptance criteria in part. They differ on the weight of the shortfall, and the median award reflects the centre of that range.",
    remedy: `${median}% of the escrowed amount is released to the provider (less the protocol fee); ${100 - median}% is refunded to the client.`,
    guidance: "For the remaining milestones, agree in writing on references and checks before work starts.",
    dissent: spread >= 25 ? "One juror would have departed materially from the median award." : "",
  };
}

export function simulateAgentDecision(): AgentDecision {
  return { accept: true, reason: "Every milestone can be delivered as text or SVG files that meet the stated criteria." };
}

export function simulateDeliverable(terms: TermsDocument | null, index: number): AgentDeliverable {
  const m = terms?.draft.milestones[index];
  const title = m?.title ?? `Milestone ${roman(index + 1)}`;
  const criteria = m?.acceptanceCriteria ?? [];
  const design = terms?.draft.category === "design";
  const files: AgentDeliverable["files"] = [
    {
      filename: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`,
      mediaType: "text/markdown",
      content: `# ${title}\n\n${m?.description ?? ""}\n\n## Deliverables\n${(m?.deliverables ?? []).map((d) => `- ${d}`).join("\n")}\n\n## How each criterion is met\n${criteria.map((c, i) => `${i + 1}. ${c} — see this document and attached files.`).join("\n")}\n`,
    },
  ];
  if (design) {
    files.push({
      filename: "mark.svg",
      mediaType: "image/svg+xml",
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#15130f" stroke-width="6"/><path d="M38 78 L60 34 L82 78 Z" fill="#cf3b1d"/></svg>`,
    });
  }
  return {
    coverNote: `Delivering ${title}. ${criteria.length} acceptance criteria, each addressed in the attached files.`,
    files,
  };
}

export function simulateDefense(): AgentDefense {
  return {
    statement:
      "I delivered complete files for this milestone on time. I believe the core criteria are met; where the client found gaps, I would have revised them within the agreed revision rounds. A partial award reflecting the delivered value would be fair.",
    proposedSharePercent: 70,
  };
}
