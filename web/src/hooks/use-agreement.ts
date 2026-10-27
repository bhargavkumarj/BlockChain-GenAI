"use client";

import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import type { z } from "zod";
import { pactumAbi } from "@/lib/abi";
import { toAgreementView } from "@/lib/agreement";
import { PACTUM_ADDRESS } from "@/lib/config";

export function useAgreement(id: number) {
  return useReadContract({
    address: PACTUM_ADDRESS,
    abi: pactumAbi,
    functionName: "getAgreement",
    args: [BigInt(id)],
    query: {
      enabled: Boolean(PACTUM_ADDRESS) && id > 0,
      refetchInterval: 5_000,
      select: (raw) => toAgreementView(id, raw),
    },
  });
}

export function useFilings(id: number, milestone: number | undefined, enabled = true) {
  return useReadContract({
    address: PACTUM_ADDRESS,
    abi: pactumAbi,
    functionName: "getEvidence",
    args: [BigInt(id), BigInt(milestone ?? 0)],
    query: {
      enabled: Boolean(PACTUM_ADDRESS) && milestone !== undefined && enabled,
      refetchInterval: 6_000,
      select: (raw) => raw.map((f) => ({ by: f.by, at: Number(f.at), cid: f.cid })),
    },
  });
}

/** Fetch and validate a JSON document from IPFS (through the caching proxy). CIDs are immutable. */
export function useIpfsJson<T extends z.ZodType>(cid: string | undefined, schema: T) {
  return useQuery({
    queryKey: ["ipfs", cid],
    enabled: Boolean(cid),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/ipfs/${cid}`);
      if (!res.ok) throw new Error(`IPFS fetch failed (${res.status})`);
      return schema.parse(await res.json()) as z.infer<T>;
    },
  });
}

export function useIpfsText(cid: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["ipfs-text", cid],
    enabled: Boolean(cid) && enabled,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`/api/ipfs/${cid}`);
      if (!res.ok) throw new Error(`IPFS fetch failed (${res.status})`);
      return res.text();
    },
  });
}

export type DeploymentStatus = {
  chainId: number;
  contracts: boolean;
  ai: { mode: "live" | "simulated"; model: string };
  ipfs: "pinata" | "local";
  kv: "redis" | "memory";
  tribunal: boolean;
  agent: string | null;
};

export function useDeploymentStatus() {
  return useQuery({
    queryKey: ["status"],
    staleTime: 5 * 60_000,
    queryFn: async () => (await fetch("/api/status")).json() as Promise<DeploymentStatus>,
  });
}
