import { z } from "zod";
import { DeliveryDocument, EvidenceDocument, TermsDocument } from "@/lib/schemas";
import { fail } from "@/lib/server/http";
import { pinFile, pinJSON } from "@/lib/server/ipfs";
import { rateLimit } from "@/lib/server/ratelimit";

const MAX_FILE = 8 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(png|jpeg|gif|webp|svg\+xml)|text\/(plain|markdown|csv|html)|application\/(pdf|json|zip))$/;

/** Only Pactum documents may be pinned as JSON, so the endpoint cannot be used as free general storage. */
const PactumDocument = z.discriminatedUnion("kind", [TermsDocument, DeliveryDocument, EvidenceDocument]);

export async function POST(req: Request) {
  const limited = await rateLimit(req, "ipfs", 60, 3600);
  if (limited) return limited;
  const type = req.headers.get("content-type") ?? "";

  try {
    if (type.startsWith("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return fail("Missing file");
      if (file.size > MAX_FILE) return fail("Files are limited to 8 MB");
      const mediaType = file.type || "application/octet-stream";
      if (!ALLOWED_TYPES.test(mediaType)) return fail(`Unsupported file type ${mediaType}`);
      const name = file.name.replace(/[^\w.\- ]+/g, "-").slice(0, 100) || "file";
      const { cid, size } = await pinFile(new Uint8Array(await file.arrayBuffer()), name, mediaType);
      return Response.json({ cid, size, name, mediaType });
    }

    const body = await req.json().catch(() => null);
    const parsed = PactumDocument.safeParse(body);
    if (!parsed.success) return fail("Not a valid Pactum document");
    const doc = parsed.data;
    const label = doc.kind === "pactum.terms" ? "terms" : `${doc.kind.split(".")[1]}-${doc.agreementId}-${doc.milestone}`;
    const { cid, size } = await pinJSON(doc, `pactum-${label}`);
    return Response.json({ cid, size });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Pinning failed", 502);
  }
}
