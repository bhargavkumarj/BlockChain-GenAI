import { AGENT_ADDRESS, ARBITER_ADDRESS, CHAIN_ID, IS_CONFIGURED, PACTUM_ADDRESS } from "@/lib/config";
import { aiMode, modelName } from "@/lib/ai/engine";
import { aiProvider, serverEnv } from "@/lib/server/env";
import { isDurableKV } from "@/lib/server/kv";
import { usingPinata } from "@/lib/server/ipfs";

export const dynamic = "force-dynamic";

/** Deployment health, shown in the footer and used by the UI to label simulated AI honestly. */
export async function GET() {
  return Response.json({
    chainId: CHAIN_ID,
    contracts: IS_CONFIGURED,
    pactum: PACTUM_ADDRESS ?? null,
    ai: { mode: aiMode(), provider: aiMode() === "live" ? aiProvider() : null, model: modelName() },
    ipfs: usingPinata() ? "pinata" : "local",
    kv: isDurableKV() ? "redis" : "memory",
    tribunal: Boolean(serverEnv.arbiterKey) && Boolean(ARBITER_ADDRESS),
    agent: Boolean(serverEnv.agentKey) && Boolean(AGENT_ADDRESS) ? AGENT_ADDRESS : null,
  });
}
