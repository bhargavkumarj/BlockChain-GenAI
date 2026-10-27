import type { Address } from "viem";

/** EIP-712 shape of a tribunal ruling. Must match `Pactum.RULING_TYPEHASH` byte for byte. */
export const rulingTypes = {
  Ruling: [
    { name: "agreementId", type: "uint256" },
    { name: "milestone", type: "uint256" },
    { name: "providerBps", type: "uint16" },
    { name: "rulingCIDHash", type: "bytes32" },
    { name: "disputedAt", type: "uint64" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function rulingDomain(chainId: number, verifyingContract: Address) {
  return { name: "Pactum", version: "1", chainId, verifyingContract } as const;
}
