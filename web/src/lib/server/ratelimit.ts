import "server-only";
import { kv } from "./kv";

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Fixed-window limiter. Returns a ready-made 429 response when the caller is over budget. */
export async function rateLimit(req: Request, bucket: string, max: number, windowSeconds: number) {
  const key = `rl:${bucket}:${clientIp(req)}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const count = await kv.incr(key, windowSeconds);
  if (count <= max) return null;
  return Response.json(
    { error: `Rate limit reached for ${bucket}. Try again in a little while.` },
    { status: 429, headers: { "Retry-After": String(windowSeconds) } },
  );
}
