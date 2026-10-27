import { type Address, type Chain, defineChain, getAddress, isAddress, zeroAddress } from "viem";

/**
 * Public, build-time configuration. Every value here is safe to ship to the browser.
 * NEXT_PUBLIC_* variables must be read with literal `process.env.X` access so Next can inline them.
 */
const env = {
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
  pactum: process.env.NEXT_PUBLIC_PACTUM_ADDRESS,
  usd: process.env.NEXT_PUBLIC_USD_ADDRESS,
  deployBlock: process.env.NEXT_PUBLIC_DEPLOY_BLOCK,
  arbiter: process.env.NEXT_PUBLIC_ARBITER_ADDRESS,
  agent: process.env.NEXT_PUBLIC_AGENT_ADDRESS,
  appealCourt: process.env.NEXT_PUBLIC_APPEAL_COURT,
  walletConnect: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
};

function address(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? getAddress(value) : undefined;
}

// Defined inline rather than imported from "viem/chains": that barrel pulls every chain into the client bundle.
const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://sepolia.basescan.org" } },
  contracts: { multicall3: { address: "0xca11bde05977b3631167028862be2a173976ca11", blockCreated: 1059647 } },
  testnet: true,
});

const devnet = defineChain({
  id: 31337,
  name: "Local devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
  testnet: true,
});

export const CHAIN_ID = Number(env.chainId || baseSepolia.id);
const baseChain = CHAIN_ID === devnet.id ? devnet : baseSepolia;
export const RPC_URL = env.rpcUrl || baseChain.rpcUrls.default.http[0]!;

export const chain: Chain = {
  ...baseChain,
  rpcUrls: { default: { http: [RPC_URL] } },
};

export const CHAIN_LABEL = baseChain.name;
export const EXPLORER_URL = chain.blockExplorers?.default.url;

export const PACTUM_ADDRESS = address(env.pactum);
export const USD_ADDRESS = address(env.usd);
export const ARBITER_ADDRESS = address(env.arbiter);
export const AGENT_ADDRESS = address(env.agent);
export const APPEAL_COURT_ADDRESS = address(env.appealCourt);
export const DEPLOY_BLOCK = BigInt(env.deployBlock || 0);
export const WALLETCONNECT_PROJECT_ID = env.walletConnect || "";
export const SITE_URL = env.siteUrl || "http://localhost:3000";

/** True once contracts are deployed and the tribunal signer is known. The UI degrades gracefully otherwise. */
export const IS_CONFIGURED = Boolean(PACTUM_ADDRESS && USD_ADDRESS && ARBITER_ADDRESS);

export type TokenInfo = { symbol: string; address: Address; decimals: number; name: string };

export const TOKENS: TokenInfo[] = [
  ...(USD_ADDRESS ? [{ symbol: "tUSD", address: USD_ADDRESS, decimals: 6, name: "Test USD" }] : []),
  { symbol: "ETH", address: zeroAddress, decimals: 18, name: "Ether" },
];

export function tokenFor(addr: Address | string | undefined): TokenInfo {
  const found = TOKENS.find((t) => addr && t.address.toLowerCase() === addr.toLowerCase());
  return found ?? { symbol: "TOKEN", address: (addr as Address) ?? zeroAddress, decimals: 18, name: "Unknown token" };
}

export function explorerTx(hash: string) {
  return EXPLORER_URL ? `${EXPLORER_URL}/tx/${hash}` : undefined;
}

export function explorerAddress(addr: string) {
  return EXPLORER_URL ? `${EXPLORER_URL}/address/${addr}` : undefined;
}
