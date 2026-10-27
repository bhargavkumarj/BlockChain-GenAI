import "server-only";
import type { Hex } from "viem";
import { RPC_URL } from "@/lib/config";

function key(value: string | undefined): Hex | undefined {
  return value && /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as Hex) : undefined;
}

/** Server-only settings. Nothing here is ever bundled for the browser. */
export const serverEnv = {
  rpcUrl: process.env.RPC_URL || RPC_URL,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  /** Claude through OpenRouter's Anthropic-compatible Messages API. Used when no Anthropic key is set. */
  openRouterKey: process.env.OPENROUTER_API_KEY,
  /** Force the deterministic simulator even when a key is present (tests, offline demos). */
  forceSimulatedAI: process.env.AI_SIMULATE === "1",
  model: process.env.AI_MODEL || "claude-opus-5-5",
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY || "gateway.pinata.cloud",
  arbiterKey: key(process.env.ARBITER_PRIVATE_KEY),
  agentKey: key(process.env.AGENT_PRIVATE_KEY),
  redisUrl: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
  localDataDir: process.env.PACTUM_DATA_DIR || ".data",
};

/** Which API serves Claude. A direct Anthropic key wins when both are set. */
export const aiProvider = () =>
  serverEnv.anthropicKey ? ("anthropic" as const) : serverEnv.openRouterKey ? ("openrouter" as const) : null;

export const isSimulatedAI = () => serverEnv.forceSimulatedAI || !aiProvider();
