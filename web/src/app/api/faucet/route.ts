import { isAddress } from "viem";
import { z } from "zod";
import { dripFromFaucet } from "@/lib/server/chain";
import { serverEnv } from "@/lib/server/env";
import { fail, readBody } from "@/lib/server/http";
import { kv } from "@/lib/server/kv";
import { rateLimit } from "@/lib/server/ratelimit";

export const maxDuration = 60;

const Body = z.object({ address: z.string().refine((v) => isAddress(v), "Invalid address") });

/** Testnet onboarding: a little ETH for gas plus 1,000 tUSD, so a visitor can try Pactum immediately. */
export async function POST(req: Request) {
  if (!serverEnv.agentKey) return fail("The faucet is not configured on this deployment", 503);
  const limited = await rateLimit(req, "faucet", 6, 3600);
  if (limited) return limited;
  const { data, error } = await readBody(req, Body);
  if (error) return error;

  const address = data.address.toLowerCase() as `0x${string}`;
  if (!(await kv.set(`faucet:${address}`, Date.now(), { nx: true, ex: 3600 }))) {
    return fail("This address was topped up within the last hour.", 429);
  }
  try {
    const hashes = await dripFromFaucet(address);
    return Response.json({ hashes });
  } catch (e) {
    await kv.del(`faucet:${address}`);
    return fail(e instanceof Error ? e.message.split("\n")[0]! : "Faucet failed", 502);
  }
}
