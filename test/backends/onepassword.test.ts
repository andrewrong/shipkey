import { describe, test, expect } from "bun:test";
import { OnePasswordBackend } from "../../src/backends/onepassword";

describe("OnePasswordBackend", () => {
  test("name is '1Password'", () => {
    const backend = new OnePasswordBackend();
    expect(backend.name).toBe("1Password");
  });

  test("builds correct op:// reference", () => {
    const backend = new OnePasswordBackend();
    const ref = {
      vault: "Dev",
      provider: "OpenRouter",
      project: "shipcast",
      env: "dev",
      field: "api-key",
    };
    expect(backend.buildRef(ref)).toBe(
      "op://Dev/OpenRouter/shipcast-dev/api-key"
    );
  });

  test("builds correct op item create args", () => {
    const backend = new OnePasswordBackend();
    const args = backend.buildWriteArgs({
      ref: {
        vault: "Dev",
        provider: "OpenRouter",
        project: "shipcast",
        env: "dev",
        field: "api-key",
      },
      value: "sk-test-123",
    });
    expect(args).toContain("--vault");
    expect(args).toContain("Dev");
    expect(args).toContain("OpenRouter");
  });

  test("sanitizes parentheses from provider name in op:// reference", () => {
    const backend = new OnePasswordBackend();
    const ref = {
      vault: "shipkey",
      provider: "xAI (Grok)",
      project: "myapp",
      env: "prod",
      field: "XAI_API_KEY",
    };
    expect(backend.buildRef(ref)).toBe(
      "op://shipkey/xAI Grok/myapp-prod/XAI_API_KEY"
    );
  });

  test("sanitizes brackets and braces from provider name", () => {
    const backend = new OnePasswordBackend();
    const ref = {
      vault: "shipkey",
      provider: "Test [Provider] {Name}",
      project: "app",
      env: "dev",
      field: "KEY",
    };
    expect(backend.buildRef(ref)).toBe(
      "op://shipkey/Test Provider Name/app-dev/KEY"
    );
  });

  test("sanitized provider name used in write args", () => {
    const backend = new OnePasswordBackend();
    const args = backend.buildWriteArgs({
      ref: {
        vault: "shipkey",
        provider: "xAI (Grok)",
        project: "myapp",
        env: "prod",
        field: "XAI_API_KEY",
      },
      value: "xai-test-123",
    });
    expect(args).toContain("xAI Grok");
    expect(args).not.toContain("xAI (Grok)");
  });
});
