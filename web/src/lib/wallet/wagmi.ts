"use client";

import { createConfig, http, injected } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import { RPC_URL, chain } from "@/lib/config";
import { guestWallet } from "./guest-connector";

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [
    guestWallet(),
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: "Pactum", preference: { options: "all" } }),
  ],
  transports: { [chain.id]: http(RPC_URL, { batch: { wait: 16 } }) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
