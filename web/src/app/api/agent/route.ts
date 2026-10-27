import { z } from "zod";
import { AgentBusy, agentTask, runAgentStep } from "@/lib/ai/agent";
import { describeAIError } from "@/lib/ai/engine";
import { sseResponse } from "@/lib/sse";
import { latestTimestamp, readAgreement } from "@/lib/server/chain";
import { serverEnv } from "@/lib/server/env";
import { fail, readBody } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 300;

const Body = z.object({ agreementId: z.number().int().positive() });

/** Nudge Ada, the resident AI agent, to take its next step on an agreement where it is the provider. */
export async function POST(req: Request) {
  if (!serverEnv.agentKey) return fail("The agent wallet is not configured on this deployment", 503);
  const { data, error } = await readBody(req, Body);
  if (error) return error;
  const agreement = await readAgreement(data.agreementId);
  if (!agreement) return fail("Agreement not found", 404);
  if (!agentTask(agreement, await latestTimestamp())) return Response.json({ idle: true });
  const limited = await rateLimit(req, "agent", 40, 3600);
  if (limited) return limited;

  return sseResponse(async (send, signal) => {
    try {
      await runAgentStep(agreement, send, signal);
      send("done", {});
    } catch (e) {
      send("error", { message: e instanceof AgentBusy ? e.message : describeAIError(e), busy: e instanceof AgentBusy });
    }
  }, req.signal);
}
