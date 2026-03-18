import { describe, test, expect } from "bun:test";
import { guessProvider, groupByProvider } from "../../packages/core/src/providers/registry";

describe("guessProvider", () => {
  test("recognizes xAI keys", () => {
    expect(guessProvider("XAI_API_KEY")).toBe("xAI");
  });

  test("recognizes Grok keys", () => {
    expect(guessProvider("GROK_API_KEY")).toBe("xAI");
  });

  test("recognizes OpenAI keys", () => {
    expect(guessProvider("OPENAI_API_KEY")).toBe("OpenAI");
  });

  test("falls back to General for unknown keys", () => {
    expect(guessProvider("SOME_RANDOM_KEY")).toBe("General");
  });
});

describe("groupByProvider", () => {
  test("groups xAI keys under xAI provider", () => {
    const result = groupByProvider(["XAI_API_KEY", "OPENAI_API_KEY"]);
    expect(result["xAI"]).toBeDefined();
    expect(result["xAI"].fields).toContain("XAI_API_KEY");
    expect(result["OpenAI"].fields).toContain("OPENAI_API_KEY");
  });

  test("xAI provider includes guide_url", () => {
    const result = groupByProvider(["XAI_API_KEY"]);
    expect(result["xAI"].guide_url).toBe("https://console.x.ai");
  });
});
