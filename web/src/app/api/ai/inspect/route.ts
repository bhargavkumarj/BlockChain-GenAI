import { z } from "zod";
import { describeAIError, generateObject } from "@/lib/ai/engine";
import { INSPECTOR_SYSTEM } from "@/lib/ai/prompts";
import { simulateInspection } from "@/lib/ai/simulate";
import { roman } from "@/lib/format";
import { InspectionReport } from "@/lib/schemas";
import { sseResponse } from "@/lib/sse";
import { buildCaseFile } from "@/lib/server/case-file";
import { readAgreement } from "@/lib/server/chain";
import { fail, readBody } from "@/lib/server/http";
import { kv } from "@/lib/server/kv";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 120;

const Body = z.object({ agreementId: z.number().int().positive(), milestone: z.number().int().min(0).max(19) });

/** Inspector: a non-binding check of a delivery against its acceptance criteria, cached per delivery. */
export async function POST(req: Request) {
  const { data, error } = await readBody(req, Body);
  if (error) return error;
  const agreement = await readAgreement(data.agreementId);
  const m = agreement?.milestones[data.milestone];
  if (!agreement || !m) return fail("Milestone not found", 404);
  if (!m.deliveryCID) return fail("Nothing has been delivered for this milestone yet", 409);

  const cacheKey = `inspect:${m.deliveryCID}`;
  const cached = await kv.get<InspectionReport>(cacheKey);
  if (!cached) {
    const limited = await rateLimit(req, "inspect", 20, 3600);
    if (limited) return limited;
  }

  return sseResponse(async (send, signal) => {
    if (cached) {
      send("done", { report: cached, cached: true });
      return;
    }
    try {
      send("status", { text: "Reading the delivery" });
      const record = await buildCaseFile(agreement, data.milestone, { includeFilings: false });
      const criteria = record.terms?.draft.milestones[data.milestone]?.acceptanceCriteria ?? [];
      const { value } = await generateObject({
        system: INSPECTOR_SYSTEM,
        content: [
          ...record.blocks,
          { type: "text", text: `Inspect the delivery for milestone ${roman(data.milestone + 1)}.` },
        ],
        schema: InspectionReport,
        effort: "low",
        onDelta: (delta) => send("delta", { delta }),
        simulate: () => simulateInspection(criteria, Boolean(record.delivery)),
        signal,
      });
      await kv.set(cacheKey, value, { ex: 7 * 24 * 3600 });
      send("done", { report: value });
    } catch (e) {
      send("error", { message: describeAIError(e) });
    }
  }, req.signal);
}
