# Deploying Pactum

Target: contracts on **Base Sepolia**, the app on **Vercel**. Allow about 20 minutes.

## 1. Accounts and keys

You need three keys. Generate them with Foundry:

```bash
cast wallet new   # deployer: deploys the contracts, owns the fee settings
cast wallet new   # arbiter: signs tribunal rulings (needs no ETH)
cast wallet new   # agent: Ada's wallet, also funds the faucet
```

Fund the **deployer** (≈0.01 ETH) and the **agent** (≈0.05 ETH) with Base Sepolia ETH from a faucet such as the
[Coinbase Developer Platform faucet](https://portal.cdp.coinbase.com/products/faucet). The agent pays for Ada's transactions and
sends small gas drips to guest wallets.

Also create:

- an **Anthropic API key**: [console.anthropic.com](https://console.anthropic.com)
- a **Pinata JWT**: [app.pinata.cloud](https://app.pinata.cloud) → API Keys → New key (pinning permissions)
- an **Upstash Redis** database (or add the Upstash integration from the Vercel Marketplace later)

## 2. Deploy the contracts

```bash
pnpm install
pnpm contracts:build
RPC_URL=https://sepolia.base.org \
DEPLOYER_PRIVATE_KEY=0x… \
FEE_BPS=100 \
pnpm contracts:deploy
```

The script prints the `NEXT_PUBLIC_*` values for the app and writes `contracts/deployments/84532.json` (commit it so the
deployment is recorded).

Optional: verify the source on Basescan so anyone can read it.

```bash
cd contracts
forge verify-contract <PACTUM_ADDRESS> src/Pactum.sol:Pactum \
  --chain base-sepolia --etherscan-api-key <BASESCAN_KEY> \
  --constructor-args $(cast abi-encode "constructor(address,uint16,address)" <DEPLOYER> 100 <DEPLOYER>)
forge verify-contract <USD_ADDRESS> src/TestUSD.sol:TestUSD --chain base-sepolia --etherscan-api-key <BASESCAN_KEY>
```

Optional: enable human appeals by setting an appeal fee and naming a court (an EOA or a Safe multisig) in the app config:

```bash
cast send <PACTUM_ADDRESS> "setAppealFee(uint256)" 1000000000000000 --rpc-url https://sepolia.base.org --private-key <DEPLOYER_KEY>
```

## 3. Deploy the app to Vercel

1. Import the GitHub repository in Vercel.
2. **Root Directory:** `web`. Framework preset: Next.js. Leave the build command as is.
3. Add the environment variables (see [`web/.env.example`](../web/.env.example)):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | `84532` |
| `NEXT_PUBLIC_PACTUM_ADDRESS` | from step 2 |
| `NEXT_PUBLIC_USD_ADDRESS` | from step 2 |
| `NEXT_PUBLIC_DEPLOY_BLOCK` | from step 2 |
| `NEXT_PUBLIC_SITE_URL` | your production URL |
| `NEXT_PUBLIC_RPC_URL` | optional: an Alchemy / QuickNode Base Sepolia URL for higher rate limits |
| `NEXT_PUBLIC_APPEAL_COURT` | optional: address of the appeal court |
| `ANTHROPIC_API_KEY` | your key |
| `ARBITER_PRIVATE_KEY` | arbiter key |
| `AGENT_PRIVATE_KEY` | agent key |
| `PINATA_JWT` | your JWT |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | from Upstash (or set automatically by the Vercel integration) |

The arbiter and agent **addresses** are derived from their keys at build time, so they never need to be configured separately
and the keys never reach the browser.

4. Deploy. The tribunal and agent routes declare `maxDuration = 300`; Vercel's default Fluid compute supports this.

## 4. Smoke test

1. Open the site: the landing page shows live counters (zeros at first) and no "simulation" banner in the app.
2. `/draft` → describe a deal → the document streams in.
3. Connect → **Instant guest wallet** → the wallet menu shows 1,000 tUSD after a few seconds.
4. Hire Ada → Seal → the seal stamps and you land on the agreement; Ada accepts and delivers within a minute.
5. Dispute the delivery → Ada files a statement → **Call to order** → execute the ruling → `/precedents` lists it.

`GET /api/status` reports what the deployment is running with (AI mode and model, IPFS backend, KV backend, tribunal and agent
availability).

## Operating notes

- **Keep the agent funded.** Each faucet drip sends 0.002 ETH. `/api/status` keeps working when it runs dry, but the faucet and
  Ada will fail with a clear error.
- **Rate limits** (per IP, per hour): drafting 30, Clerk 60, Inspector 20, tribunal 8, agent 40, faucet 6, pinning 60. Adjust in
  the route handlers.
- **Without Upstash** the KV falls back to memory per serverless instance: fine for a demo, but the one-ruling-per-dispute
  guarantee only holds within an instance. Use Redis in production.
- **Costs.** A dispute costs four model calls (three jurors and the opinion); Ada makes one call per decision, delivery or
  defence; drafting, the Clerk and the Inspector are single low-effort calls.
