import { z } from "zod";
import { describeAIError, generateObject } from "@/lib/ai/engine";
import { SCRIBE_SYSTEM } from "@/lib/ai/prompts";
import { simulateDraft } from "@/lib/ai/simulate";
import { AgreementDraft } from "@/lib/schemas";
import { sseResponse } from "@/lib/sse";
import { readBody } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 120;

const Body = z.object({
  prompt: z.string().trim().min(8, "Describe the deal in a sentence or two").max(4000),
  current: AgreementDraft.optional(),
  instruction: z.string().trim().max(1000).optional(),
});

/** Scribe: plain-language deal → structured agreement, streamed as JSON so the document fills in live. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "draft", 30, 3600);
  if (limited) return limited;
  const { data, error } = await readBody(req, Body);
  if (error) return error;

  const content =
    data.current && data.instruction
      ? `<deal>${data.prompt}</deal>\n<current_draft>${JSON.stringify(data.current)}</current_draft>\n<instruction>${data.instruction}</instruction>`
      : `<deal>${data.prompt}</deal>`;

  return sseResponse(async (send, signal) => {
    try {
      const { value, model, simulated } = await generateObject({
        system: SCRIBE_SYSTEM,
        content,
        schema: AgreementDraft,
        effort: "low",
        onDelta: (delta) => send("delta", { delta }),
        simulate: () => simulateDraft(data.prompt, data.current, data.instruction),
        signal,
      });
      send("done", { draft: value, model, simulated });
    } catch (e) {
      send("error", { message: describeAIError(e) });
    }
  }, req.signal);
}
