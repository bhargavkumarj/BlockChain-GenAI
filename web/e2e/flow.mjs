// End-to-end walkthrough of the whole protocol in a real browser, against a running app.
//
//   BASE_URL=http://localhost:3000 SHOTS=./e2e/shots node e2e/flow.mjs
//
// Requires: a local chain with Pactum deployed, ARBITER/AGENT keys configured, and Playwright available.
// Covers: guest wallet + faucet → AI drafting → sealing (EIP-2612 permit) → Ada accepts & delivers →
// dispute → Ada's defence → AI tribunal → executing the signed ruling → approving the final milestone.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS ?? "e2e/shots";
const HEADLESS = process.env.HEADED !== "1";
mkdirSync(SHOTS, { recursive: true });

const step = (n, text) => console.log(`\n▸ ${n}. ${text}`);
const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const browser = await chromium.launch({ headless: HEADLESS });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("pageerror", (e) => console.log("  ! pageerror:", e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("hydrat")) console.log("  ! console:", m.text().slice(0, 240));
});
page.on("dialog", (d) => d.accept());
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

try {
  step(1, "Draft with Scribe");
  const deal = "Five tagline options and a 150-word About page for an indoor climbing gym called Crux. 120 tUSD, delivered in 3 days.";
  await page.goto(`${BASE}/draft?q=${encodeURIComponent(deal)}`);
  await page.getByText("Revise with Scribe").waitFor({ timeout: 90_000 });
  console.log(`  drafted (${elapsed()})`);
  await shot("01-drafted");

  step(2, "Create a guest wallet (auto-funded by the faucet)");
  await page.getByRole("button", { name: /connect a wallet to seal/i }).click();
  await page.getByRole("button", { name: /instant guest wallet/i }).click();
  await page.getByRole("button", { name: /seal & escrow/i }).waitFor({ timeout: 30_000 });
  await page.getByText(/1,000 tUSD/).first().waitFor({ timeout: 45_000 });
  console.log(`  funded (${elapsed()})`);

  step(3, "Seal: pin terms, sign the permit, escrow on-chain");
  await page.getByRole("button", { name: /seal & escrow/i }).click();
  await page.getByRole("button", { name: /sign & seal/i }).click();
  await page.getByText("Sealed.").waitFor({ timeout: 60_000 });
  await shot("02-sealed");
  await page.waitForURL(/\/a\/\d+/, { timeout: 30_000 });
  const id = page.url().split("/a/")[1];
  console.log(`  agreement ${id} (${elapsed()})`);

  step(4, "Ada accepts and delivers milestone I");
  await page.getByText("Accepted the agreement on-chain").waitFor({ timeout: 90_000 });
  await page.getByText("Delivered the work on-chain").waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: /open a dispute/i }).first().waitFor({ timeout: 30_000 });
  console.log(`  delivered (${elapsed()})`);
  await shot("03-delivered");

  step(5, "Ask the Inspector, then dispute milestone I");
  await page.getByRole("button", { name: /ask the inspector/i }).first().click();
  await page.getByText("Inspector’s report").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /open a dispute/i }).first().click();
  await page
    .getByPlaceholder(/what was agreed/i)
    .fill("Only four tagline options were delivered and the About page is 210 words, well over the agreed 150. I ask for a partial refund.");
  await page.getByRole("button", { name: /file & open dispute/i }).click();
  await page.getByText(/open a dispute confirmed|file & open dispute confirmed/i).waitFor({ timeout: 60_000 });
  console.log(`  disputed (${elapsed()})`);

  step(6, "Ada files its defence; the tribunal convenes");
  await page.getByText("Filed a statement with the tribunal").waitFor({ timeout: 90_000 });
  await page.getByRole("button", { name: /call to order/i }).waitFor({ timeout: 60_000 });
  await shot("04-record");
  await page.getByRole("button", { name: /call to order/i }).click();
  await page.getByRole("button", { name: /execute ruling on-chain/i }).waitFor({ timeout: 240_000 });
  console.log(`  ruled (${elapsed()})`);
  await shot("05-ruling");

  step(7, "Execute the signed ruling on-chain");
  await page.getByRole("button", { name: /execute ruling on-chain/i }).click();
  await page.getByText(/settled by ruling/i).first().waitFor({ timeout: 60_000 });
  console.log(`  executed (${elapsed()})`);

  step(8, "Ada delivers milestone II; the client approves");
  await page.getByRole("button", { name: /approve & release/i }).waitFor({ timeout: 150_000 });
  await page.getByRole("button", { name: /approve & release/i }).click();
  await page.getByText("Fulfilled", { exact: false }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await shot("06-fulfilled");
  console.log(`\n✓ Full lifecycle passed in ${elapsed()} · agreement ${id}`);
} catch (error) {
  await shot("failure").catch(() => {});
  console.error(`\n✗ Failed after ${elapsed()}:`, error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
