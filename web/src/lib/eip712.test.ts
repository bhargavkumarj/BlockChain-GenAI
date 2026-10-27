import {
  concat,
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  recoverTypedDataAddress,
  toBytes,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { rulingDomain, rulingTypes } from "./eip712";

const contract = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as const;
const message = {
  agreementId: 12n,
  milestone: 1n,
  providerBps: 6500,
  rulingCIDHash: keccak256(toBytes("bafkreiruling")),
  disputedAt: 1_750_000_000n,
  deadline: 1_750_600_000n,
};

/** The digest exactly as Pactum.sol computes it: _hashTypedDataV4(keccak256(abi.encode(TYPEHASH, ...))). */
function solidityDigest(chainId: number) {
  const typeHash = keccak256(
    toBytes("Ruling(uint256 agreementId,uint256 milestone,uint16 providerBps,bytes32 rulingCIDHash,uint64 disputedAt,uint256 deadline)"),
  );
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint16" }, { type: "bytes32" }, { type: "uint64" }, { type: "uint256" }],
      [typeHash, message.agreementId, message.milestone, message.providerBps, message.rulingCIDHash, message.disputedAt, message.deadline],
    ),
  );
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        keccak256(toBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
        keccak256(toBytes("Pactum")),
        keccak256(toBytes("1")),
        BigInt(chainId),
        contract,
      ],
    ),
  );
  return keccak256(concat([toHex("\x19\x01"), domainSeparator, structHash]));
}

describe("EIP-712 ruling", () => {
  it("matches the contract's digest byte for byte", () => {
    const viemDigest = hashTypedData({ domain: rulingDomain(84532, contract), types: rulingTypes, primaryType: "Ruling", message });
    expect(viemDigest).toBe(solidityDigest(84532));
  });

  it("binds the chain: a Base Sepolia ruling is not valid elsewhere", () => {
    expect(solidityDigest(84532)).not.toBe(solidityDigest(8453));
  });

  it("recovers the arbiter from its signature", async () => {
    const arbiter = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const typed = { domain: rulingDomain(31337, contract), types: rulingTypes, primaryType: "Ruling" as const, message };
    const signature = await arbiter.signTypedData(typed);
    expect(await recoverTypedDataAddress({ ...typed, signature })).toBe(arbiter.address);
  });
});
