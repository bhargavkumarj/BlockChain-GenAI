import type { FileRef } from "./schemas";

/** Pin one file to IPFS through the app's pinning endpoint. */
export async function uploadFile(file: File): Promise<FileRef> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/ipfs", { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Could not upload ${file.name}`);
  return { name: json.name, cid: json.cid, mediaType: json.mediaType, size: json.size };
}

/** Pin a Pactum document (terms, delivery, evidence). The server validates it against the schema. */
export async function pinDocument(doc: unknown): Promise<string> {
  const res = await fetch("/api/ipfs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Could not pin the document");
  return json.cid as string;
}

export const ipfsUrl = (cid: string) => `/api/ipfs/${cid}`;

export function isImage(mediaType: string) {
  return /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(mediaType);
}

export function isText(mediaType: string) {
  return mediaType.startsWith("text/") || mediaType === "application/json";
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
