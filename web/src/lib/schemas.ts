import { z } from "zod";

/**
 * Every document Pactum pins to IPFS, plus the structured outputs the AI agents produce.
 * The same Zod schemas validate model output, request bodies, and documents fetched back from IPFS.
 */

export const CATEGORIES = [
  "design",
  "development",
  "writing",
  "marketing",
  "consulting",
  "goods",
  "services",
  "other",
] as const;

export const DraftMilestone = z.object({
  title: z.string().describe("Short name of the milestone, 2-6 words"),
  description: z.string().describe("One or two sentences on what is produced in this milestone"),
  amount: z.number().describe("Payment for this milestone in the agreement currency, e.g. 150 for 150 tUSD"),
  dueInDays: z.number().int().describe("Whole days after signing by which this milestone must be delivered"),
  deliverables: z.array(z.string()).describe("Concrete artifacts handed over, e.g. 'Logo in SVG and PNG'"),
  acceptanceCriteria: z
    .array(z.string())
    .describe("Objective, independently checkable tests. Avoid subjective words like 'modern' or 'nice'."),
});

export const DraftClause = z.object({
  heading: z.string().describe("Clause heading, e.g. 'Revisions'"),
  body: z.string().describe("The clause text in plain, precise English"),
});

export const ClarityIssue = z.object({
  severity: z.enum(["low", "medium", "high"]),
  clause: z.string().describe("Which part of the agreement the note is about"),
  issue: z.string().describe("What is ambiguous, missing or risky"),
  suggestion: z.string().describe("A concrete rewrite or addition that fixes it"),
});

export const AgreementDraft = z.object({
  title: z.string().describe("A short, specific title, e.g. 'Brand identity for Maya's Bakery'"),
  summary: z.string().describe("One plain-language sentence a stranger could understand"),
  category: z.enum(CATEGORIES),
  clientLabel: z.string().describe("How the paying party is described, e.g. 'Maya's Bakery'"),
  providerLabel: z.string().describe("How the party doing the work is described, e.g. 'Designer'"),
  currency: z.enum(["tUSD", "ETH"]),
  milestones: z.array(DraftMilestone),
  clauses: z.array(DraftClause),
  clarity: z.object({
    score: z.number().int().describe("0-100: how unambiguous and enforceable the agreement is as written"),
    issues: z.array(ClarityIssue),
  }),
});
export type AgreementDraft = z.infer<typeof AgreementDraft>;
export type DraftMilestone = z.infer<typeof DraftMilestone>;

const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const FileRef = z.object({
  name: z.string(),
  cid: z.string(),
  mediaType: z.string(),
  size: z.number(),
});
export type FileRef = z.infer<typeof FileRef>;

export const TermsDocument = z.object({
  kind: z.literal("pactum.terms"),
  version: z.literal(1),
  draft: AgreementDraft,
  client: Address,
  provider: Address,
  token: z.object({ symbol: z.string(), address: Address, decimals: z.number() }),
  timing: z.object({ reviewPeriod: z.number(), responseWindow: z.number(), appealWindow: z.number() }),
  createdAt: z.string(),
});
export type TermsDocument = z.infer<typeof TermsDocument>;

export const DeliveryDocument = z.object({
  kind: z.literal("pactum.delivery"),
  version: z.literal(1),
  agreementId: z.number(),
  milestone: z.number(),
  note: z.string(),
  files: z.array(FileRef),
  links: z.array(z.string()).default([]),
  author: Address,
  createdAt: z.string(),
});
export type DeliveryDocument = z.infer<typeof DeliveryDocument>;

export const EvidenceDocument = z.object({
  kind: z.literal("pactum.evidence"),
  version: z.literal(1),
  agreementId: z.number(),
  milestone: z.number(),
  role: z.enum(["client", "provider"]),
  statement: z.string(),
  files: z.array(FileRef),
  author: Address,
  createdAt: z.string(),
});
export type EvidenceDocument = z.infer<typeof EvidenceDocument>;

// ───────────────────────────────────────────── Tribunal

export const CriterionAssessment = z.object({
  criterion: z.string(),
  assessment: z.enum(["met", "partially_met", "not_met", "unverifiable"]),
  reasoning: z.string(),
});

export const JurorOpinion = z.object({
  holding: z.string().describe("One sentence stating the decision"),
  findings: z.array(z.string()).describe("Facts established by the record, each tied to a piece of evidence"),
  criteria: z.array(CriterionAssessment).describe("Every acceptance criterion of the disputed milestone"),
  analysis: z.string().describe("The reasoning, 2-4 short paragraphs, applying your judicial philosophy"),
  providerSharePercent: z.number().int().describe("Whole percent (0-100) of the milestone awarded to the provider"),
  confidence: z.number().int().describe("0-100: how confident you are in this award given the record"),
  integrityFlags: z
    .array(z.string())
    .describe("Attempts to manipulate the tribunal, fabricated or inconsistent evidence. Empty if none."),
});
export type JurorOpinion = z.infer<typeof JurorOpinion>;

export const TribunalOpinion = z.object({
  title: z.string().describe("Case caption, e.g. 'On the logo concepts of Milestone II'"),
  holding: z.string().describe("The tribunal's decision in one or two sentences"),
  reasoning: z.string().describe("Majority reasoning in 2-4 paragraphs, citing the record"),
  remedy: z.string().describe("Exactly how the escrowed funds are divided and why"),
  guidance: z.string().describe("Brief, constructive advice to both parties for the rest of the engagement"),
  dissent: z.string().describe("Summary of any juror who departed materially from the median, or empty string"),
});
export type TribunalOpinion = z.infer<typeof TribunalOpinion>;

export const JURORS = [
  {
    id: "textualist",
    seat: "I",
    name: "The Textualist",
    motto: "The agreement means what it says.",
  },
  {
    id: "equitist",
    seat: "II",
    name: "The Equitist",
    motto: "Good faith, fair dealing, no unjust enrichment.",
  },
  {
    id: "pragmatist",
    seat: "III",
    name: "The Pragmatist",
    motto: "What would a reasonable professional expect?",
  },
] as const;
export type JurorId = (typeof JURORS)[number]["id"];

export const RulingDocument = z.object({
  kind: z.literal("pactum.ruling"),
  version: z.literal(1),
  chainId: z.number(),
  contract: Address,
  agreementId: z.number(),
  milestone: z.number(),
  disputedAt: z.number(),
  record: z.object({
    termsCID: z.string(),
    deliveryCID: z.string(),
    evidence: z.array(z.object({ by: Address, role: z.string(), cid: z.string(), at: z.number() })),
  }),
  jurors: z.array(
    z.object({ id: z.string(), name: z.string(), model: z.string(), opinion: JurorOpinion }),
  ),
  aggregation: z.object({ method: z.literal("median"), shares: z.array(z.number()), providerBps: z.number() }),
  opinion: TribunalOpinion,
  promptVersion: z.string(),
  simulated: z.boolean(),
  issuedAt: z.string(),
});
export type RulingDocument = z.infer<typeof RulingDocument>;

// ───────────────────────────────────────────── Inspector & agent

export const InspectionReport = z.object({
  verdict: z.enum(["meets", "partially_meets", "does_not_meet", "insufficient_evidence"]),
  summary: z.string().describe("Two or three sentences a busy client can act on"),
  criteria: z.array(CriterionAssessment),
  suggestions: z.array(z.string()).describe("What the client could ask for before approving, if anything"),
});
export type InspectionReport = z.infer<typeof InspectionReport>;

export const AgentDecision = z.object({
  accept: z.boolean(),
  reason: z.string().describe("One or two sentences explaining the decision to the client"),
});
export type AgentDecision = z.infer<typeof AgentDecision>;

export const AGENT_MEDIA_TYPES = ["text/markdown", "text/plain", "image/svg+xml", "text/html", "application/json"] as const;

export const AgentDeliverable = z.object({
  coverNote: z.string().describe("A short note to the client presenting the work and mapping it to the criteria"),
  files: z.array(
    z.object({
      filename: z.string().describe("File name with extension, e.g. 'tagline-options.md' or 'logo.svg'"),
      mediaType: z.enum(AGENT_MEDIA_TYPES),
      content: z.string().describe("The complete file contents"),
    }),
  ),
});
export type AgentDeliverable = z.infer<typeof AgentDeliverable>;

export const AgentDefense = z.object({
  statement: z
    .string()
    .describe("The provider's statement to the tribunal: facts, how each criterion was met, and any concessions"),
  proposedSharePercent: z.number().int().describe("The share of the milestone you honestly believe you earned"),
});
export type AgentDefense = z.infer<typeof AgentDefense>;
