import { describe, expect, it } from "vitest";
import { openRouterModelId } from "./model-id";

describe("openRouterModelId", () => {
  it("maps Anthropic model ids to OpenRouter slugs", () => {
    expect(openRouterModelId("claude-opus-5-5")).toBe("anthropic/claude-opus-5.5");
    expect(openRouterModelId("claude-sonnet-5-5")).toBe("anthropic/claude-sonnet-5.5");
    expect(openRouterModelId("claude-haiku-4-5")).toBe("anthropic/claude-haiku-4.5");
    expect(openRouterModelId("claude-opus-5")).toBe("anthropic/claude-opus-5");
  });

  it("leaves slugs that already name a vendor untouched", () => {
    expect(openRouterModelId("anthropic/claude-opus-5.5")).toBe("anthropic/claude-opus-5.5");
    expect(openRouterModelId("anthropic/claude-opus-5.5:batch")).toBe("anthropic/claude-opus-5.5:batch");
  });
});
