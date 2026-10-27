import type { NextConfig } from "next";
import { privateKeyToAccount } from "viem/accounts";

/** Derive a public address from a server key at build time, so the key itself never reaches the client. */
function addressOf(key: string | undefined) {
  if (!key) return "";
  try {
    return privateKeyToAccount(key as `0x${string}`).address;
  } catch {
    return "";
  }
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_ARBITER_ADDRESS:
      process.env.NEXT_PUBLIC_ARBITER_ADDRESS || addressOf(process.env.ARBITER_PRIVATE_KEY),
    NEXT_PUBLIC_AGENT_ADDRESS: process.env.NEXT_PUBLIC_AGENT_ADDRESS || addressOf(process.env.AGENT_PRIVATE_KEY),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
