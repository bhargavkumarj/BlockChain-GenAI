import "server-only";
import { formatUnits } from "viem";
import { AGENT_ADDRESS, IS_CONFIGURED, USD_ADDRESS } from "@/lib/config";
import { PHASE_COPY, STATUS_COPY, focusMilestone } from "@/lib/agreement";
import { tokenFor } from "@/lib/config";
import { loadTerms } from "./case-file";
import { readAgreementCount, readRecentAgreements } from "./chain";

export type LandingData = {
  live: boolean;
  agreements: number;
  escrowedUsd: number;
  rulings: number;
  adaJobs: number;
  ticker: { id: number; title: string; amount: string; status: string }[];
};

/** Live numbers for the landing page. Falls back to an empty, honest state when the chain is unreachable. */
export async function readLandingData(): Promise<LandingData> {
  const empty: LandingData = { live: false, agreements: 0, escrowedUsd: 0, rulings: 0, adaJobs: 0, ticker: [] };
  if (!IS_CONFIGURED) return empty;
  try {
    const [count, recent] = await Promise.all([readAgreementCount(), readRecentAgreements(120)]);
    const titles = await Promise.all(recent.slice(0, 12).map((a) => loadTerms(a.termsCID).then((t) => t?.draft.title)));
    let escrowed = 0n;
    let rulings = 0;
    let adaJobs = 0;
    for (const a of recent) {
      if (USD_ADDRESS && a.token.toLowerCase() === USD_ADDRESS.toLowerCase()) escrowed += a.total;
      rulings += a.milestones.filter((m) => m.rulingCID).length;
      if (AGENT_ADDRESS && a.provider.toLowerCase() === AGENT_ADDRESS.toLowerCase() && a.status === "Closed") adaJobs += 1;
    }
    return {
      live: true,
      agreements: count,
      escrowedUsd: Number(formatUnits(escrowed, 6)),
      rulings,
      adaJobs,
      ticker: recent.slice(0, 12).map((a, i) => {
        const token = tokenFor(a.token);
        const focus = focusMilestone(a);
        return {
          id: a.id,
          title: titles[i] ?? "Untitled agreement",
          amount: `${Number(formatUnits(a.total, token.decimals)).toLocaleString("en-US")} ${token.symbol}`,
          status: a.status === "Active" && focus ? PHASE_COPY[focus.phase].label : STATUS_COPY[a.status].label,
        };
      }),
    };
  } catch {
    return empty;
  }
}
