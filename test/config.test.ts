import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { loadConfig, buildSecretRefMap, buildEnvKeyToOpRef } from "../src/config";
import { OnePasswordBackend } from "../src/backends/onepassword";
import { BitwardenBackend } from "../src/backends/bitwarden";

const TMP = join(import.meta.dir, "__config_fixtures__");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("loadConfig", () => {
  test("reads shipkey.json and parses backend field", async () => {
    writeFileSync(
      join(TMP, "shipkey.json"),
      JSON.stringify({
        project: "myapp",
        vault: "shipkey",
        backend: "bitwarden",
      })
    );
    const config = await loadConfig(TMP);
    expect(config.backend).toBe("bitwarden");
    expect(config.project).toBe("myapp");
  });

  test("defaults backend to undefined when not specified", async () => {
    writeFileSync(
      join(TMP, "shipkey.json"),
      JSON.stringify({
        project: "myapp",
        vault: "shipkey",
      })
    );
    const config = await loadConfig(TMP);
    expect(config.backend).toBeUndefined();
  });
});

describe("buildSecretRefMap", () => {
  test("works with 1Password backend (returns op:// refs)", () => {
    const config = {
      project: "myapp",
      vault: "shipkey",
      providers: {
        OpenAI: { fields: ["OPENAI_API_KEY"] },
      },
    };
    const backend = new OnePasswordBackend();
    const map = buildSecretRefMap(config, backend, "prod");
    expect(map.get("OPENAI_API_KEY")).toBe(
      "op://shipkey/OpenAI/myapp-prod/OPENAI_API_KEY"
    );
  });

  test("works with Bitwarden backend (returns null refs)", () => {
    const config = {
      project: "myapp",
      vault: "shipkey",
      providers: {
        OpenAI: { fields: ["OPENAI_API_KEY"] },
      },
    };
    const backend = new BitwardenBackend();
    const map = buildSecretRefMap(config, backend, "prod");
    expect(map.get("OPENAI_API_KEY")).toBeNull();
  });
});

describe("buildEnvKeyToOpRef (legacy)", () => {
  test("still builds op:// refs for backwards compatibility", () => {
    const config = {
      project: "myapp",
      vault: "shipkey",
      providers: {
        Stripe: { fields: ["STRIPE_SECRET_KEY"] },
      },
    };
    const map = buildEnvKeyToOpRef(config, "dev");
    expect(map.get("STRIPE_SECRET_KEY")).toBe(
      "op://shipkey/Stripe/myapp-dev/STRIPE_SECRET_KEY"
    );
  });
});

describe("buildSecretRefMap with parenthesized provider", () => {
  test("sanitizes parentheses in op:// references", () => {
    const config = {
      project: "myapp",
      vault: "shipkey",
      providers: {
        "xAI (Grok)": { fields: ["XAI_API_KEY"] },
      },
    };
    const backend = new OnePasswordBackend();
    const map = buildSecretRefMap(config, backend, "prod");
    expect(map.get("XAI_API_KEY")).toBe(
      "op://shipkey/xAI Grok/myapp-prod/XAI_API_KEY"
    );
  });
});
