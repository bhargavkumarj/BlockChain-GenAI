import "server-only";
import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  nonceManager,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pactumAbi, testUsdAbi } from "@/lib/abi";
import { type AgreementView, type Filing, toAgreementView } from "@/lib/agreement";
import { CHAIN_ID, PACTUM_ADDRESS, USD_ADDRESS, chain } from "@/lib/config";
import { rulingDomain, rulingTypes } from "@/lib/eip712";
import { serverEnv } from "./env";

const transport = http(serverEnv.rpcUrl, { batch: { wait: 10 }, retryCount: 2 });
export const publicClient = createPublicClient({ chain, transport });

export function requirePactum(): Address {
  if (!PACTUM_ADDRESS) throw new Error("Pactum contract address is not configured");
  return PACTUM_ADDRESS;
}

export async function readAgreement(id: number): Promise<AgreementView | null> {
  try {
    const raw = await publicClient.readContract({
      address: requirePactum(),
      abi: pactumAbi,
      functionName: "getAgreement",
      args: [BigInt(id)],
    });
    return toAgreementView(id, raw);
  } catch {
    return null;
  }
}

export async function readFilings(id: number, milestone: number): Promise<Filing[]> {
  const raw = await publicClient.readContract({
    address: requirePactum(),
    abi: pactumAbi,
    functionName: "getEvidence",
    args: [BigInt(id), BigInt(milestone)],
  });
  return raw.map((f) => ({ by: f.by, at: Number(f.at), cid: f.cid }));
}

export async function readAgreementCount() {
  if (!PACTUM_ADDRESS) return 0;
  const count = await publicClient.readContract({
    address: PACTUM_ADDRESS,
    abi: pactumAbi,
    functionName: "agreementCount",
  });
  return Number(count);
}

/** Most recent agreements, newest first. Reads are batched into a single JSON-RPC round trip. */
export async function readRecentAgreements(limit = 24): Promise<AgreementView[]> {
  const count = await readAgreementCount();
  const ids = Array.from({ length: Math.min(limit, count) }, (_, i) => count - i);
  const views = await Promise.all(ids.map((id) => readAgreement(id)));
  return views.filter((v): v is AgreementView => v !== null);
}

export type TrackRecord = {
  asClient: number;
  asProvider: number;
  completed: number;
  milestonesPaid: number;
  disputes: number;
  favorableRulings: number;
};

export async function readTrackRecord(party: Address): Promise<TrackRecord> {
  const [asClient, asProvider, completed, milestonesPaid, disputes, favorableRulings] = await publicClient.readContract({
    address: requirePactum(),
    abi: pactumAbi,
    functionName: "records",
    args: [party],
  });
  return { asClient, asProvider, completed, milestonesPaid, disputes, favorableRulings };
}

export async function readAgreementsOf(party: Address, limit = 20): Promise<AgreementView[]> {
  const ids = await publicClient.readContract({
    address: requirePactum(),
    abi: pactumAbi,
    functionName: "agreementsOf",
    args: [party],
  });
  const recent = [...ids].reverse().slice(0, limit);
  const views = await Promise.all(recent.map((id) => readAgreement(Number(id))));
  return views.filter((v): v is AgreementView => v !== null);
}

export async function latestTimestamp() {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return Number(block.timestamp);
}

// ───────────────────────────────────────────── server signers

export function arbiterAccount() {
  if (!serverEnv.arbiterKey) throw new Error("ARBITER_PRIVATE_KEY is not configured");
  return privateKeyToAccount(serverEnv.arbiterKey);
}

let agent: ReturnType<typeof privateKeyToAccount> | undefined;

/** The agent key also funds the faucet; a shared nonce manager keeps concurrent sends from colliding. */
export function agentAccount() {
  if (!serverEnv.agentKey) throw new Error("AGENT_PRIVATE_KEY is not configured");
  agent ??= privateKeyToAccount(serverEnv.agentKey, { nonceManager });
  return agent;
}

export function agentWallet() {
  return createWalletClient({ account: agentAccount(), chain, transport });
}

export async function signRuling(input: {
  agreementId: number;
  milestone: number;
  providerBps: number;
  rulingCID: string;
  disputedAt: number;
  deadline: number;
}): Promise<Hex> {
  return arbiterAccount().signTypedData({
    domain: rulingDomain(CHAIN_ID, requirePactum()),
    types: rulingTypes,
    primaryType: "Ruling",
    message: {
      agreementId: BigInt(input.agreementId),
      milestone: BigInt(input.milestone),
      providerBps: input.providerBps,
      rulingCIDHash: keccak256(toBytes(input.rulingCID)),
      disputedAt: BigInt(input.disputedAt),
      deadline: BigInt(input.deadline),
    },
  });
}

/** Sends a Pactum call from the agent wallet and waits for it to be mined. */
export async function agentWrite(
  functionName: "accept" | "cancel" | "deliver" | "submitEvidence" | "claim" | "finalize" | "rule",
  args: readonly unknown[],
) {
  const wallet = agentWallet();
  const { request } = await publicClient.simulateContract({
    account: wallet.account,
    address: requirePactum(),
    abi: pactumAbi,
    functionName,
    args: args as never,
  });
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  return hash;
}

export async function dripFromFaucet(to: Address) {
  const wallet = agentWallet();
  const hashes: Hex[] = [];
  const balance = await publicClient.getBalance({ address: to });
  const gasDrip = 2_000_000_000_000_000n; // 0.002 ETH: hundreds of L2 transactions
  if (balance < gasDrip / 2n) {
    const hash = await wallet.sendTransaction({ to, value: gasDrip });
    hashes.push(hash);
  }
  if (USD_ADDRESS) {
    try {
      const { request } = await publicClient.simulateContract({
        account: wallet.account,
        address: USD_ADDRESS,
        abi: testUsdAbi,
        functionName: "faucet",
        args: [to],
      });
      hashes.push(await wallet.writeContract(request));
    } catch {
      // Cooling down: the address was topped up within the last hour.
    }
  }
  await Promise.all(hashes.map((hash) => publicClient.waitForTransactionReceipt({ hash })));
  return hashes;
}
