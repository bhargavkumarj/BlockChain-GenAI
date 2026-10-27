import { z } from "zod";
import { describeAIError } from "@/lib/ai/engine";
import { TribunalBusy, convene, existingRuling } from "@/lib/ai/tribunal";
import { sseResponse } from "@/lib/sse";
import { latestTimestamp, readAgreement } from "@/lib/server/chain";
import { fail, readBody } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { serverEnv } from "@/lib/server/env";

export const maxDuration = 300;

const Body = z.object({ agreementId: z.number().int().positive(), milestone: z.number().int().min(0).max(19) });

async function load(agreementId: number, milestone: number) {
  const agreement = await readAgreement(agreementId);
  const m = agreement?.milestones[milestone];
  if (!agreement || !m) return { error: fail("Milestone not found", 404) };
  if (m.phase !== "Disputed") return { error: fail("This milestone is not in dispute", 409) };
  return { agreement, m };
}

/** Convene the AI tribunal. Streams each juror's deliberation, then returns a signed, executable ruling. */
export async function POST(req: Request) {
  if (!serverEnv.arbiterKey) return fail("The tribunal signer is not configured on this deployment", 503);
  const { data, error } = await readBody(req, Body);
  if (error) return error;
  const loaded = await load(data.agreementId, data.milestone);
  if (loaded.error) return loaded.error;
  const { agreement, m } = loaded;

  const existing = await existingRuling(agreement, data.milestone);
  if (!existing) {
    // Due process, mirrored from the contract: both sides have filed, or the evidence window has closed.
    const now = await latestTimestamp();
    const ready = (m.clientFiled && m.providerFiled) || now >= m.disputedAt + agreement.responseWindow;
    if (!ready) {
      return fail("The evidence window is still open: the other party has not filed yet.", 409);
    }
    const limited = await rateLimit(req, "tribunal", 8, 3600);
    if (limited) return limited;
  }

  return sseResponse(async (send, signal) => {
    try {
      await convene(agreement, data.milestone, send, signal);
    } catch (e) {
      send("error", { message: e instanceof TribunalBusy ? e.message : describeAIError(e), busy: e instanceof TribunalBusy });
    }
  }, req.signal);
}

/** The ruling already issued for a dispute, so any visitor can submit it on-chain or follow along. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const agreementId = Number(url.searchParams.get("agreementId"));
  const milestone = Number(url.searchParams.get("milestone"));
  if (!Number.isInteger(agreementId) || !Number.isInteger(milestone)) return fail("agreementId and milestone required");
  const loaded = await load(agreementId, milestone);
  if (loaded.error) return loaded.error;
  const ruling = await existingRuling(loaded.agreement, milestone);
  return ruling ? Response.json(ruling) : fail("No ruling yet", 404);
}
