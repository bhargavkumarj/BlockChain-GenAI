import type { Address } from "viem";
import { describe, expect, it } from "vitest";
import { type AgreementView, type MilestoneView, agentTask, availableActions, focusMilestone, roleOf } from "./agreement";

const CLIENT = "0x00000000000000000000000000000000000000c1" as Address;
const ADA = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address;
const NOW = 1_800_000_000;

function milestone(index: number, patch: Partial<MilestoneView> = {}): MilestoneView {
  return {
    index,
    amount: 100_000_000n,
    dueBy: NOW + 86400,
    deliveredAt: 0,
    disputedAt: 0,
    ruledAt: 0,
    closedAt: 0,
    providerBps: 0,
    phase: "Pending",
    clientFiled: false,
    providerFiled: false,
    disputant: "0x0000000000000000000000000000000000000000",
    deliveryCID: "",
    rulingCID: "",
    ...patch,
  };
}

function agreement(patch: Partial<AgreementView> = {}, milestones = [milestone(0), milestone(1)]): AgreementView {
  return {
    id: 1,
    client: CLIENT,
    provider: ADA,
    token: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    arbiter: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    appealCourt: "0x0000000000000000000000000000000000000000",
    reviewPeriod: 600,
    responseWindow: 300,
    appealWindow: 0,
    status: "Active",
    openMilestones: milestones.length,
    createdAt: NOW - 1000,
    createdBlock: 10n,
    acceptedAt: NOW - 900,
    total: 200_000_000n,
    termsCID: "bafkreiterms",
    milestones,
    ...patch,
  };
}

describe("roles", () => {
  it("identifies parties case-insensitively", () => {
    const a = agreement();
    expect(roleOf(a, CLIENT.toUpperCase().replace("0X", "0x"))).toBe("client");
    expect(roleOf(a, ADA.toLowerCase())).toBe("provider");
    expect(roleOf(a, "0x0000000000000000000000000000000000000001")).toBe("viewer");
    expect(roleOf(a)).toBe("viewer");
  });
});

describe("availableActions mirrors the contract's guards", () => {
  it("only offers acceptance while proposed", () => {
    const a = agreement({ status: "Proposed" });
    expect(availableActions(a, a.milestones[0], "provider", NOW)).toEqual(["accept", "decline"]);
    expect(availableActions(a, a.milestones[0], "client", NOW)).toEqual(["withdraw"]);
    expect(availableActions(a, a.milestones[0], "viewer", NOW)).toEqual([]);
  });

  it("lets the client dispute a delivery only inside the review period", () => {
    const delivered = milestone(0, { phase: "Delivered", deliveredAt: NOW - 100 });
    expect(availableActions(agreement({}, [delivered]), delivered, "client", NOW)).toContain("dispute");
    const late = milestone(0, { phase: "Delivered", deliveredAt: NOW - 601 });
    expect(availableActions(agreement({}, [late]), late, "client", NOW)).not.toContain("dispute");
    expect(availableActions(agreement({}, [late]), late, "provider", NOW)).toContain("claim");
  });

  it("offers reclaim only after a missed deadline", () => {
    const due = milestone(0, { dueBy: NOW - 1 });
    expect(availableActions(agreement({}, [due]), due, "client", NOW)).toContain("reclaim");
    expect(availableActions(agreement(), agreement().milestones[0], "client", NOW)).not.toContain("reclaim");
  });

  it("convenes the tribunal once both sides filed or the window closed", () => {
    const open = milestone(0, { phase: "Disputed", disputedAt: NOW - 10, clientFiled: true });
    expect(availableActions(agreement({}, [open]), open, "viewer", NOW)).not.toContain("convene");
    const bothFiled = { ...open, providerFiled: true };
    expect(availableActions(agreement({}, [bothFiled]), bothFiled, "viewer", NOW)).toContain("convene");
    const lapsed = milestone(0, { phase: "Disputed", disputedAt: NOW - 301, clientFiled: true });
    expect(availableActions(agreement({}, [lapsed]), lapsed, "viewer", NOW)).toContain("convene");
  });

  it("offers nothing on settled milestones", () => {
    const paid = milestone(0, { phase: "Released" });
    expect(availableActions(agreement({}, [paid]), paid, "client", NOW)).toEqual([]);
  });
});

describe("Ada's work loop", () => {
  it("decides on proposals, then works milestones strictly in order", () => {
    expect(agentTask(agreement({ status: "Proposed" }), NOW)).toEqual({ kind: "decide" });
    expect(agentTask(agreement(), NOW)).toEqual({ kind: "deliver", index: 0 });
    const firstUnderReview = agreement({}, [milestone(0, { phase: "Delivered", deliveredAt: NOW - 10 }), milestone(1)]);
    expect(agentTask(firstUnderReview, NOW)).toBeNull();
    const firstPaid = agreement({}, [milestone(0, { phase: "Released" }), milestone(1)]);
    expect(agentTask(firstPaid, NOW)).toEqual({ kind: "deliver", index: 1 });
  });

  it("defends disputes it has not answered and claims lapsed reviews", () => {
    const disputed = agreement({}, [milestone(0, { phase: "Disputed", disputedAt: NOW, clientFiled: true })]);
    expect(agentTask(disputed, NOW)).toEqual({ kind: "defend", index: 0 });
    const lapsed = agreement({}, [milestone(0, { phase: "Delivered", deliveredAt: NOW - 600 })]);
    expect(agentTask(lapsed, NOW)).toEqual({ kind: "claim", index: 0 });
  });

  it("ignores agreements where it is not the provider", () => {
    expect(agentTask(agreement({ provider: CLIENT }), NOW)).toBeNull();
  });

  it("focuses the first open milestone", () => {
    const a = agreement({}, [milestone(0, { phase: "Released" }), milestone(1, { phase: "Delivered" })]);
    expect(focusMilestone(a)?.index).toBe(1);
  });
});
