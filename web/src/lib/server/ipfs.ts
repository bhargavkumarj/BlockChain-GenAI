import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";
import { serverEnv } from "./env";

/**
 * Content-addressed storage. With PINATA_JWT set, documents are pinned to IPFS through Pinata and served from
 * any gateway. Without it (local development) bytes are stored on disk under their real CIDv1 (raw, sha-256),
 * so the addresses written on-chain are still genuine content hashes.
 */

const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,100})$/;
const MAX_BYTES = 8 * 1024 * 1024;

export const isCID = (value: string) => CID_PATTERN.test(value);
export const usingPinata = () => Boolean(serverEnv.pinataJwt);

type Stored = { cid: string; size: number };

export async function pinJSON(content: unknown, name: string): Promise<Stored> {
  const body = JSON.stringify(content);
  if (serverEnv.pinataJwt) {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.pinataJwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        pinataContent: content,
        pinataMetadata: { name, keyvalues: { app: "pactum" } },
        pinataOptions: { cidVersion: 1 },
      }),
    });
    if (!res.ok) throw new Error(`Pinata JSON pin failed (${res.status}): ${await res.text()}`);
    const json = (await res.json()) as { IpfsHash: string; PinSize: number };
    remember(json.IpfsHash, new TextEncoder().encode(body), "application/json");
    return { cid: json.IpfsHash, size: json.PinSize };
  }
  return storeLocally(new TextEncoder().encode(body), "application/json");
}

export async function pinFile(bytes: Uint8Array, name: string, mediaType: string): Promise<Stored> {
  if (bytes.byteLength > MAX_BYTES) throw new Error("File is larger than 8 MB");
  if (serverEnv.pinataJwt) {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart], { type: mediaType }), name);
    form.append("pinataMetadata", JSON.stringify({ name, keyvalues: { app: "pactum" } }));
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv.pinataJwt}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Pinata file pin failed (${res.status}): ${await res.text()}`);
    const json = (await res.json()) as { IpfsHash: string; PinSize: number };
    remember(json.IpfsHash, bytes, mediaType);
    return { cid: json.IpfsHash, size: json.PinSize };
  }
  return storeLocally(bytes, mediaType);
}

export type Fetched = { bytes: Uint8Array; mediaType: string };

export async function fetchCID(cid: string): Promise<Fetched> {
  if (!isCID(cid)) throw new Error("Invalid CID");
  const cached = memory.get(cid);
  if (cached) return cached;

  const local = await readLocal(cid);
  if (local) return remember(cid, local.bytes, local.mediaType);

  const gateways = [serverEnv.pinataGateway, "ipfs.io", "dweb.link"];
  let lastError: unknown;
  for (const gateway of gateways) {
    try {
      const res = await fetch(`https://${gateway}/ipfs/${cid}`, {
        signal: AbortSignal.timeout(12_000),
        cache: "force-cache",
      });
      if (!res.ok) throw new Error(`${gateway} responded ${res.status}`);
      const length = Number(res.headers.get("content-length") ?? 0);
      if (length > MAX_BYTES) throw new Error("Content too large");
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) throw new Error("Content too large");
      const mediaType = res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
      return remember(cid, bytes, mediaType);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not retrieve ${cid}: ${lastError instanceof Error ? lastError.message : "unavailable"}`);
}

export async function fetchJSON<T = unknown>(cid: string): Promise<T> {
  const { bytes } = await fetchCID(cid);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function fetchText(cid: string) {
  const { bytes, mediaType } = await fetchCID(cid);
  return { text: new TextDecoder().decode(bytes), mediaType };
}

// ───────────────────────────────────────────── caches & local store

const memory = new Map<string, Fetched>();

function remember(cid: string, bytes: Uint8Array, mediaType: string): Fetched {
  if (bytes.byteLength < 512 * 1024) {
    if (memory.size > 500) memory.delete(memory.keys().next().value!);
    memory.set(cid, { bytes, mediaType });
  }
  return { bytes, mediaType };
}

const localDir = () => join(process.cwd(), serverEnv.localDataDir, "ipfs");

async function storeLocally(bytes: Uint8Array, mediaType: string): Promise<Stored> {
  const cid = CID.create(1, raw.code, await sha256.digest(bytes)).toString();
  try {
    await mkdir(localDir(), { recursive: true });
    await writeFile(join(localDir(), cid), bytes);
    await writeFile(join(localDir(), `${cid}.type`), mediaType);
  } catch (error) {
    console.warn("[ipfs] local store unavailable; content kept in memory only", error);
  }
  remember(cid, bytes, mediaType);
  return { cid, size: bytes.byteLength };
}

async function readLocal(cid: string): Promise<Fetched | null> {
  try {
    const bytes = new Uint8Array(await readFile(join(localDir(), cid)));
    const mediaType = await readFile(join(localDir(), `${cid}.type`), "utf8").catch(() => "application/octet-stream");
    return { bytes, mediaType };
  } catch {
    return null;
  }
}
