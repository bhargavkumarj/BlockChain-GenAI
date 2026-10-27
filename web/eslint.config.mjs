import next from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...next,
  ...nextTs,
  { ignores: [".next/**", "out/**", "next-env.d.ts", "e2e/**", "src/lib/abi.ts"] },
];

export default config;
