"use client";

import { useDeploymentStatus } from "@/hooks/use-agreement";
import { IS_CONFIGURED } from "@/lib/config";

/**
 * Honest labelling: if this deployment runs without contracts or without a live model, say so up front
 * rather than letting simulated output pass for the real thing.
 */
export function StatusStrip() {
  const { data } = useDeploymentStatus();
  if (!IS_CONFIGURED) {
    return (
      <div className="border-b border-amber/40 bg-amber-wash px-4 py-2 text-center font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink-2">
        Contracts are not configured on this deployment · drafting works, sealing is disabled
      </div>
    );
  }
  if (data?.ai.mode === "simulated") {
    return (
      <div className="border-b border-rule bg-paper-2 px-4 py-2 text-center font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ink-3">
        AI is running in simulation mode on this deployment · add an Anthropic or OpenRouter API key for live Claude agents
      </div>
    );
  }
  return null;
}
