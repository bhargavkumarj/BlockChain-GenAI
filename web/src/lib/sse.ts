/**
 * Minimal Server-Sent Events over a POST response. The server pushes typed events as the AI works;
 * the browser reads them with `readEvents`. Plain fetch streaming — no EventSource, so requests can have bodies.
 */

export type SendFn = (event: string, data: unknown) => void;

export function sseResponse(run: (send: SendFn, signal: AbortSignal) => Promise<void>, signal: AbortSignal) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send: SendFn = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      // Comment frames keep proxies from closing an idle connection while a model is thinking.
      const heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            closed = true;
          }
        }
      }, 10_000);
      try {
        await run(send, signal);
      } catch (error) {
        send("error", { message: errorMessage(error) });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Something went wrong";
}

export type StreamEvent = { event: string; data: unknown };

/** Parse an SSE body, invoking `onEvent` for each complete event. Resolves when the stream ends. */
export async function readEvents(response: Response, onEvent: (e: StreamEvent) => void) {
  if (!response.ok || !response.body) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split: number;
    while ((split = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;
      onEvent({ event, data: JSON.parse(data) });
    }
  }
}
