import type { Address } from "viem";
import { AGENT_ADDRESS } from "./config";

export const STATUSES = ["Proposed", "Active", "Closed", "Cancelled"] as const;
export const PHASES = ["Pending", "Delivered", "Disputed", "Ruled", "Appealed", "Released", "Refunded", "Resolved"] as const;

export type Status = (typeof STATUSES)[number];
export type Phase = (typeof PHASES)[number];
export type Role = "client" | "provider" | "viewer";

export type MilestoneView = {
  index: number;
  amount: bigint;
  dueBy: number;
  deliveredAt: number;
  disputedAt: number;
  ruledAt: number;
  closedAt: number;
  providerBps: number;
  phase: Phase;
  clientFiled: boolean;
  providerFiled: boolean;
  disputant: Address;
  deliveryCID: string;
  rulingCID: string;
};

export type AgreementView = {
  id: number;
  client: Address;
  provider: Address;
  token: Address;
  arbiter: Address;
  appealCourt: Address;
  reviewPeriod: number;
  responseWindow: number;
  appealWindow: number;
  status: Status;
  openMilestones: number;
  createdAt: number;
  createdBlock: bigint;
  acceptedAt: number;
  total: bigint;
  termsCID: string;
  milestones: MilestoneView[];
};

export type Filing = { by: Address; at: number; cid: string };

type RawAgreement = {
  client: Address;
  provider: Address;
  token: Address;
  arbiter: Address;
  appealCourt: Address;
  reviewPeriod: number;
  responseWindow: number;
  appealWindow: number;
  status: number;
  openMilestones: number;
  createdAt: bigint;
  createdBlock: bigint;
  acceptedAt: bigint;
  total: bigint;
  termsCID: string;
};

type RawMilestone = {
  amount: bigint;
  dueBy: bigint;
  deliveredAt: bigint;
  disputedAt: bigint;
  ruledAt: bigint;
  closedAt: bigint;
  providerBps: number;
  phase: number;
  evidence: number;
  disputant: Address;
  deliveryCID: string;
  rulingCID: string;
};

/** Converts the tuple returned by `getAgreement` into a friendlier, number-typed view. */
export function toAgreementView(id: number | bigint, raw: readonly [RawAgreement, readonly RawMilestone[]]): AgreementView {
  const [a, ms] = raw;
  return {
    id: Number(id),
    client: a.client,
    provider: a.provider,
    token: a.token,
    arbiter: a.arbiter,
    appealCourt: a.appealCourt,
    reviewPeriod: Number(a.reviewPeriod),
    responseWindow: Number(a.responseWindow),
    appealWindow: Number(a.appealWindow),
    status: STATUSES[a.status] ?? "Proposed",
    openMilestones: Number(a.openMilestones),
    createdAt: Number(a.createdAt),
    createdBlock: a.createdBlock,
    acceptedAt: Number(a.acceptedAt),
    total: a.total,
    termsCID: a.termsCID,
    milestones: ms.map((m, index) => ({
      index,
      amount: m.amount,
      dueBy: Number(m.dueBy),
      deliveredAt: Number(m.deliveredAt),
      disputedAt: Number(m.disputedAt),
      ruledAt: Number(m.ruledAt),
      closedAt: Number(m.closedAt),
      providerBps: Number(m.providerBps),
      phase: PHASES[m.phase] ?? "Pending",
      clientFiled: (m.evidence & 1) !== 0,
      providerFiled: (m.evidence & 2) !== 0,
      disputant: m.disputant,
      deliveryCID: m.deliveryCID,
      rulingCID: m.rulingCID,
    })),
  };
}

export function roleOf(a: Pick<AgreementView, "client" | "provider">, who?: string): Role {
  if (!who) return "viewer";
  const w = who.toLowerCase();
  if (w === a.client.toLowerCase()) return "client";
  if (w === a.provider.toLowerCase()) return "provider";
  return "viewer";
}

export const isTerminal = (p: Phase) => p === "Released" || p === "Refunded" || p === "Resolved";

export type Tone = "neutral" | "seal" | "ledger" | "amber" | "muted";

export const STATUS_COPY: Record<Status, { label: string; tone: Tone }> = {
  Proposed: { label: "Awaiting acceptance", tone: "amber" },
  Active: { label: "In force", tone: "neutral" },
  Closed: { label: "Fulfilled", tone: "ledger" },
  Cancelled: { label: "Withdrawn", tone: "muted" },
};

export const PHASE_COPY: Record<Phase, { label: string; tone: Tone }> = {
  Pending: { label: "In progress", tone: "neutral" },
  Delivered: { label: "Under review", tone: "amber" },
  Disputed: { label: "In dispute", tone: "seal" },
  Ruled: { label: "Ruled · appealable", tone: "seal" },
  Appealed: { label: "On appeal", tone: "seal" },
  Released: { label: "Paid", tone: "ledger" },
  Refunded: { label: "Refunded", tone: "muted" },
  Resolved: { label: "Settled by ruling", tone: "ledger" },
};

/** Seconds until a deadline, or null when the clock is not running. */
export function clock(a: AgreementView, m: MilestoneView, now: number) {
  switch (m.phase) {
    case "Delivered":
      return { label: "Review closes", endsAt: m.deliveredAt + a.reviewPeriod, remaining: m.deliveredAt + a.reviewPeriod - now };
    case "Disputed":
      return {
        label: "Evidence closes",
        endsAt: m.disputedAt + a.responseWindow,
        remaining: m.clientFiled && m.providerFiled ? 0 : m.disputedAt + a.responseWindow - now,
      };
    case "Ruled":
      return { label: "Appeal window", endsAt: m.ruledAt + a.appealWindow, remaining: m.ruledAt + a.appealWindow - now };
    case "Pending":
      return m.dueBy ? { label: "Due", endsAt: m.dueBy, remaining: m.dueBy - now } : null;
    default:
      return null;
  }
}

export type ActionId =
  | "accept"
  | "decline"
  | "withdraw"
  | "deliver"
  | "release"
  | "claim"
  | "reclaim"
  | "dispute"
  | "evidence"
  | "convene"
  | "finalize"
  | "appeal"
  | "settle"
  | "refund";

/**
 * Which actions a given party can take on a milestone right now. Mirrors the contract's guards so the UI
 * never offers a transaction that would revert; the contract remains the source of truth.
 */
export function availableActions(a: AgreementView, m: MilestoneView | undefined, role: Role, now: number): ActionId[] {
  const out: ActionId[] = [];
  if (a.status === "Proposed") {
    if (role === "provider") out.push("accept", "decline");
    if (role === "client") out.push("withdraw");
    return out;
  }
  if (a.status !== "Active" || !m || isTerminal(m.phase)) return out;
  const reviewOver = m.deliveredAt > 0 && now >= m.deliveredAt + a.reviewPeriod;
  const evidenceClosed = (m.clientFiled && m.providerFiled) || now >= m.disputedAt + a.responseWindow;

  if (role === "provider") {
    if (m.phase === "Pending" || m.phase === "Delivered") out.push("deliver");
    if (m.phase === "Delivered" && reviewOver) out.push("claim");
  }
  if (role === "client") {
    out.push("release");
    if (m.phase === "Pending" && m.dueBy > 0 && now > m.dueBy) out.push("reclaim");
  }
  if (role !== "viewer") {
    if (m.phase === "Pending" || (m.phase === "Delivered" && (role === "provider" || !reviewOver))) out.push("dispute");
    if (m.phase === "Disputed" || m.phase === "Appealed") out.push("evidence");
    if (m.phase === "Ruled" && now < m.ruledAt + a.appealWindow) out.push("appeal");
    out.push("settle");
    if (role === "provider") out.push("refund");
  }
  if (m.phase === "Disputed" && evidenceClosed) out.push("convene");
  if (m.phase === "Ruled" && now >= m.ruledAt + a.appealWindow) out.push("finalize");
  return out;
}

/** The milestone that needs attention: first non-terminal one, else the last. */
export function focusMilestone(a: AgreementView) {
  return a.milestones.find((m) => !isTerminal(m.phase)) ?? a.milestones[a.milestones.length - 1];
}

export function sealSeed(a: Pick<AgreementView, "id" | "termsCID">) {
  return `${a.id}:${a.termsCID}`;
}

export type AgentTask =
  | { kind: "decide" }
  | { kind: "deliver" | "defend" | "claim" | "finalize"; index: number };

/**
 * What Ada, the resident agent, would do next on an agreement where it is the provider. Shared by the
 * browser (to know when to nudge it) and the server (to decide what to run).
 */
export function agentTask(a: AgreementView, now: number): AgentTask | null {
  if (!AGENT_ADDRESS || a.provider.toLowerCase() !== AGENT_ADDRESS.toLowerCase()) return null;
  if (a.status === "Proposed") return { kind: "decide" };
  if (a.status !== "Active") return null;
  for (const m of a.milestones) {
    if (m.phase === "Disputed" && !m.providerFiled) return { kind: "defend", index: m.index };
    if (m.phase === "Delivered" && now >= m.deliveredAt + a.reviewPeriod) return { kind: "claim", index: m.index };
    if (m.phase === "Ruled" && now >= m.ruledAt + a.appealWindow) return { kind: "finalize", index: m.index };
  }
  // Work milestones in order: start the next one only when everything before it is settled.
  const next = a.milestones.find((m) => !isTerminal(m.phase));
  if (next?.phase === "Pending" && a.milestones.slice(0, next.index).every((m) => isTerminal(m.phase))) {
    return { kind: "deliver", index: next.index };
  }
  return null;
}
