import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { SITE_URL } from "@/lib/config";
import { openRouterModelId } from "@/lib/model-id";
import { aiProvider, isSimulatedAI, serverEnv } from "@/lib/server/env";

/**
 * One entry point for every model call in Pactum.
 *
 * Live mode streams from Claude, directly from Anthropic or through OpenRouter's Anthropic-compatible
 * Messages API, with structured outputs (JSON schema from Zod) and, on Anthropic, server-side refusal fallbacks.
 * Simulated mode — used when no API key is configured or AI_SIMULATE=1 — replays a deterministic result
 * through the same streaming callbacks, so the UI and tests behave identically offline.
 */

export type Effort = "low" | "medium" | "high";
export type Content = string | Anthropic.Beta.BetaContentBlockParam[];

export class AIError extends Error {}

let client: Anthropic | undefined;
function anthropic() {
  client ??=
    aiProvider() === "openrouter"
      ? new Anthropic({
          authToken: serverEnv.openRouterKey,
          baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api",
          // Attribution shown in OpenRouter's activity log.
          defaultHeaders: { "HTTP-Referer": SITE_URL, "X-Title": "Pactum" },
          maxRetries: 2,
        })
      : new Anthropic({ apiKey: serverEnv.anthropicKey, maxRetries: 2 });
  return client;
}

/** The model id in the form the active provider expects. */
const resolveModel = (model: string) => (aiProvider() === "openrouter" ? openRouterModelId(model) : model);

export const aiMode = () => (isSimulatedAI() ? "simulated" : "live");
export const modelName = () => (isSimulatedAI() ? "pactum-simulator" : resolveModel(serverEnv.model));

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Anthropic's server-side refusal fallback. OpenRouter's Messages API doesn't take it and routes on its own. */
const fallbackParams = () =>
  aiProvider() === "anthropic" ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {};

type ObjectOptions<T extends z.ZodType> = {
  system: string;
  content: Content;
  schema: T;
  effort: Effort;
  maxTokens?: number;
  model?: string;
  onDelta?: (jsonChunk: string) => void;
  simulate: () => z.infer<T>;
  signal?: AbortSignal;
};

export async function generateObject<T extends z.ZodType>(opts: ObjectOptions<T>) {
  if (isSimulatedAI()) {
    const value = opts.schema.parse(opts.simulate());
    await replay(JSON.stringify(value), opts.onDelta, opts.signal);
    return { value: value as z.infer<T>, model: modelName(), simulated: true };
  }

  const stream = anthropic().beta.messages.stream(
    {
      model: resolveModel(opts.model ?? serverEnv.model),
      max_tokens: opts.maxTokens ?? 16_000,
      ...fallbackParams(),
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    },
    { signal: opts.signal },
  );
  if (opts.onDelta) stream.on("text", (delta) => opts.onDelta!(delta));
  const message = await stream.finalMessage();
  assertCompleted(message);

  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AIError("The model returned malformed JSON. Please try again.");
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) throw new AIError("The model's answer did not match the expected shape. Please try again.");
  return { value: parsed.data as z.infer<T>, model: message.model, simulated: false };
}

type TextOptions = {
  system: string | Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  effort: Effort;
  maxTokens?: number;
  /** Cache the prompt prefix (system + earlier turns) across a multi-turn conversation. */
  cache?: boolean;
  onDelta?: (text: string) => void;
  simulate: () => string;
  signal?: AbortSignal;
};

export async function generateText(opts: TextOptions) {
  if (isSimulatedAI()) {
    const text = opts.simulate();
    await replay(text, opts.onDelta, opts.signal);
    return { text, model: modelName(), simulated: true };
  }
  const stream = anthropic().beta.messages.stream(
    {
      model: resolveModel(serverEnv.model),
      max_tokens: opts.maxTokens ?? 4_000,
      ...fallbackParams(),
      system: opts.system,
      messages: opts.messages,
      output_config: { effort: opts.effort },
      ...(opts.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
    },
    { signal: opts.signal },
  );
  if (opts.onDelta) stream.on("text", (delta) => opts.onDelta!(delta));
  const message = await stream.finalMessage();
  assertCompleted(message);
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return { text, model: message.model, simulated: false };
}

function assertCompleted(message: Anthropic.Beta.BetaMessage) {
  if (message.stop_reason === "refusal") {
    throw new AIError("The model declined this request. Rephrase it and try again.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AIError("The response was cut short. Try a shorter request.");
  }
}

/** Streams a finished string in small, irregular chunks so simulated output feels like generation. */
async function replay(text: string, onDelta?: (chunk: string) => void, signal?: AbortSignal) {
  if (!onDelta) return;
  const fast = process.env.AI_SIMULATE_FAST === "1";
  let i = 0;
  while (i < text.length) {
    if (signal?.aborted) return;
    const size = 6 + ((i * 7) % 23);
    onDelta(text.slice(i, i + size));
    i += size;
    if (!fast) await new Promise((r) => setTimeout(r, 14));
  }
}

export function describeAIError(error: unknown) {
  if (error instanceof AIError) return error.message;
  if (error instanceof Anthropic.RateLimitError) return "The AI service is busy. Please try again in a minute.";
  if (error instanceof Anthropic.AuthenticationError) return "The AI service is misconfigured (invalid API key).";
  if (error instanceof Anthropic.APIError) return `The AI service returned an error (${error.status}).`;
  return error instanceof Error ? error.message : "Unexpected AI error";
}
