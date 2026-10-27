"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type StreamEvent, readEvents } from "@/lib/sse";

/**
 * POST to an SSE endpoint and dispatch events as they arrive. Aborts on unmount or when restarted,
 * so a slow model never writes into a component that has moved on.
 */
export function useStream() {
  const controller = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async (url: string, body: unknown, onEvent: (e: StreamEvent) => void) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    setRunning(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.headers.get("content-type")?.includes("application/json")) {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
        onEvent({ event: "json", data: json });
        return;
      }
      await readEvents(res, onEvent);
    } catch (error) {
      if (ctrl.signal.aborted) return;
      onEvent({ event: "error", data: { message: error instanceof Error ? error.message : "Request failed" } });
    } finally {
      if (controller.current === ctrl) setRunning(false);
    }
  }, []);

  const stop = useCallback(() => {
    controller.current?.abort();
    setRunning(false);
  }, []);

  return { start, stop, running };
}
