import "server-only";
import type { z } from "zod";

export function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

/** Parse and validate a JSON body. Returns either the data or a ready 400 response. */
export async function readBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T>; error?: undefined } | { data?: undefined; error: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: fail("Body must be JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: fail(issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid body") };
  }
  return { data: parsed.data };
}
