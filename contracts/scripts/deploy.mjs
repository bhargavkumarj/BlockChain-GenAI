#!/usr/bin/env node
// Deploys TestUSD + Pactum with viem using Foundry's build artifacts (run `forge build` first).
//
//   RPC_URL=https://sepolia.base.org DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy.mjs
//
// Optional env: FEE_BPS (default 100 = 1%), FEE_RECIPIENT (default deployer), APPEAL_FEE_WEI (default 0),
//               USD_ADDRESS (reuse an existing token instead of deploying TestUSD).
// Writes deployments/<chainId>.json and prints the NEXT_PUBLIC_* env vars for the web app.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifact = (name) => JSON.parse(readFileSync(join(root, "out", `${name}.sol`, `${name}.json`), "utf8"));

const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error("DEPLOYER_PRIVATE_KEY is required");

const account = privateKeyToAccount(key);
const transport = http(rpcUrl);
const publicClient = createPublicClient({ transport });
const chainId = await publicClient.getChainId();
const chain = { id: chainId, name: `chain-${chainId}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } };
const wallet = createWalletClient({ account, chain, transport });

const feeBps = Number(process.env.FEE_BPS ?? 100);
const feeRecipient = process.env.FEE_RECIPIENT ?? account.address;
const appealFee = BigInt(process.env.APPEAL_FEE_WEI ?? 0);

async function deploy(name, args = []) {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet.deployContract({ abi, bytecode: bytecode.object, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ${name.padEnd(8)} ${receipt.contractAddress}  (block ${receipt.blockNumber})`);
  return receipt;
}

console.log(`Deploying to chain ${chainId} from ${account.address}`);
let usdAddress = process.env.USD_ADDRESS;
if (usdAddress && !isAddress(usdAddress)) throw new Error("USD_ADDRESS is not an address");
if (!usdAddress) usdAddress = (await deploy("TestUSD")).contractAddress;
const pactumReceipt = await deploy("Pactum", [account.address, feeBps, feeRecipient]);
const pactum = pactumReceipt.contractAddress;

if (appealFee > 0n) {
  const { abi } = artifact("Pactum");
  const hash = await wallet.writeContract({ address: pactum, abi, functionName: "setAppealFee", args: [appealFee] });
  await publicClient.waitForTransactionReceipt({ hash });
}

const out = {
  chainId,
  pactum,
  testUSD: usdAddress,
  deployBlock: Number(pactumReceipt.blockNumber),
  deployer: account.address,
  feeBps,
  feeRecipient,
  deployedAt: new Date().toISOString(),
};
mkdirSync(join(root, "deployments"), { recursive: true });
writeFileSync(join(root, "deployments", `${chainId}.json`), JSON.stringify(out, null, 2) + "\n");

console.log(`\nAdd to web/.env.local (or your Vercel project):\n
NEXT_PUBLIC_CHAIN_ID=${chainId}
NEXT_PUBLIC_PACTUM_ADDRESS=${pactum}
NEXT_PUBLIC_USD_ADDRESS=${usdAddress}
NEXT_PUBLIC_DEPLOY_BLOCK=${out.deployBlock}`);
