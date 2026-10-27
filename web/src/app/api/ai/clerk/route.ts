import { z } from "zod";
import { describeAIError, generateText } from "@/lib/ai/engine";
import { CLERK_SYSTEM } from "@/lib/ai/prompts";
import { simulateClerk } from "@/lib/ai/simulate";
import { PHASE_COPY, STATUS_COPY } from "@/lib/agreement";
import { tokenFor } from "@/lib/config";
import { describeWindow, formatAmount, roman } from "@/lib/format";
import { sseResponse } from "@/lib/sse";
import { loadTerms } from "@/lib/server/case-file";
import { readAgreement } from "@/lib/server/chain";
import { fail, readBody } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 60;

const Body = z.object({
  agreementId: z.number().int().positive(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(20),
});

/** The Clerk: grounded Q&A about one agreement, streamed. The agreement context is prompt-cached across turns. */
export async function POST(req: Request) {
  const limited = await rateLimit(req, "clerk", 60, 3600);
  if (limited) return limited;
  const { data, error } = await readBody(req, Body);
  if (error) return error;
  if (data.messages.at(-1)?.role !== "user") return fail("The last message must be from the user");

  const agreement = await readAgreement(data.agreementId);
  if (!agreement) return fail("Agreement not found", 404);
  const terms = await loadTerms(agreement.termsCID);
  const token = tokenFor(agreement.token);

  const state = [
    `Agreement ${agreement.id}: ${STATUS_COPY[agreement.status].label}.`,
    `Escrowed total: ${formatAmount(agreement.total, token.decimals)} ${token.symbol}.`,
    `Review period ${describeWindow(agreement.reviewPeriod)}, evidence window ${describeWindow(agreement.responseWindow)}, ${
      agreement.appealWindow ? `appeal window ${describeWindow(agreement.appealWindow)}` : "rulings are final (no appeal court)"
    }.`,
    ...agreement.milestones.map(
      (m) =>
        `Milestone ${roman(m.index + 1)}: ${formatAmount(m.amount, token.decimals)} ${token.symbol}, ${PHASE_COPY[m.phase].label}${
          m.dueBy ? `, due ${new Date(m.dueBy * 1000).toISOString()}` : ""
        }.`,
    ),
  ].join("\n");

  const context = `<agreement>\n${terms ? JSON.stringify(terms.draft, null, 1) : "(terms unavailable)"}\n</agreement>\n<onchain_state>\n${state}\n</onchain_state>`;
  const question = data.messages.at(-1)!.content;

  return sseResponse(async (send, signal) => {
    try {
      const { text } = await generateText({
        system: [{ type: "text", text: `${CLERK_SYSTEM}\n\n${context}` }],
        messages: data.messages,
        effort: "low",
        maxTokens: 2_000,
        cache: true,
        onDelta: (delta) => send("delta", { delta }),
        simulate: () => simulateClerk(question, terms),
        signal,
      });
      send("done", { text });
    } catch (e) {
      send("error", { message: describeAIError(e) });
    }
  }, req.signal);
}
