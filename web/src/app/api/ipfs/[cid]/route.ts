import { fail } from "@/lib/server/http";
import { fetchCID, isCID } from "@/lib/server/ipfs";

/**
 * Read-through IPFS proxy. Content is immutable, so it is cached forever at the edge. Party-supplied files are
 * served with a sandboxing CSP: an uploaded SVG or HTML file can be displayed but can never run script on
 * Pactum's origin.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/ipfs/[cid]">) {
  const { cid } = await ctx.params;
  if (!isCID(cid)) return fail("Invalid CID");
  try {
    const { bytes, mediaType } = await fetchCID(cid);
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": mediaType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Not found", 404);
  }
}
