import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NEXT_PUBLIC_CHAIN_ID: "31337",
      NEXT_PUBLIC_AGENT_ADDRESS: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    },
  },
});
