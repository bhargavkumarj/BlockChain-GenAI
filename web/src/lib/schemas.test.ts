import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  AgentDecision,
  AgentDefense,
  AgentDeliverable,
  AgreementDraft,
  InspectionReport,
  JurorOpinion,
  TribunalOpinion,
} from "./schemas";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: unknown;
  items?: JsonSchema;
  [key: string]: unknown;
};

/** Every object in a structured-output schema must be closed; collect anything that is not. */
function openObjects(node: JsonSchema | undefined, path: string, out: string[] = []) {
  if (!node || typeof node !== "object") return out;
  if (node.type === "object") {
    if (node.additionalProperties !== false) out.push(path);
    for (const [key, child] of Object.entries(node.properties ?? {})) openObjects(child, `${path}.${key}`, out);
  }
  if (node.items) openObjects(node.items, `${path}[]`, out);
  return out;
}

const AI_SCHEMAS: Record<string, z.ZodType> = {
  AgreementDraft,
  JurorOpinion,
  TribunalOpinion,
  InspectionReport,
  AgentDecision,
  AgentDeliverable,
  AgentDefense,
};

describe("AI output schemas", () => {
  for (const [name, schema] of Object.entries(AI_SCHEMAS)) {
    it(`${name} converts to a closed JSON schema for structured outputs`, () => {
      const format = betaZodOutputFormat(schema) as unknown as { type: string; schema: JsonSchema };
      expect(format.type).toBe("json_schema");
      expect(openObjects(format.schema, name)).toEqual([]);
    });
  }

  it("rejects a juror opinion missing its award", () => {
    const parsed = JurorOpinion.safeParse({ holding: "x", findings: [], criteria: [], analysis: "", confidence: 50, integrityFlags: [] });
    expect(parsed.success).toBe(false);
  });
});
