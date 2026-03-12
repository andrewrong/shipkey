import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { detectEnvFile, writeEnvFile } from "../src/env-writer";

const TMP = join(import.meta.dir, "__env_writer_fixtures__");

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("detectEnvFile", () => {
  test("returns .dev.vars when wrangler.toml exists", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'my-worker'\n");
    const result = await detectEnvFile(TMP);
    expect(result).toBe(".dev.vars");
  });

  test("returns .env when .env exists (no wrangler.toml)", async () => {
    writeFileSync(join(TMP, ".env"), "FOO=bar\n");
    const result = await detectEnvFile(TMP);
    expect(result).toBe(".env");
  });

  test("returns .env.local when only .env.local exists", async () => {
    writeFileSync(join(TMP, ".env.local"), "FOO=bar\n");
    const result = await detectEnvFile(TMP);
    expect(result).toBe(".env.local");
  });

  test("returns .env when nothing exists (default)", async () => {
    const result = await detectEnvFile(TMP);
    expect(result).toBe(".env");
  });

  test("prefers .dev.vars over .env when wrangler.toml exists", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'my-worker'\n");
    writeFileSync(join(TMP, ".env"), "FOO=bar\n");
    const result = await detectEnvFile(TMP);
    expect(result).toBe(".dev.vars");
  });
});

describe("writeEnvFile", () => {
  test("merges into existing .env without losing fields", async () => {
    writeFileSync(join(TMP, ".env"), "EXISTING_KEY=existing_value\n");
    await writeEnvFile(TMP, { NEW_KEY: "new_value" });
    const content = readFileSync(join(TMP, ".env"), "utf-8");
    expect(content).toContain("EXISTING_KEY=existing_value");
    expect(content).toContain("NEW_KEY=new_value");
  });

  test("updates existing keys in-place", async () => {
    writeFileSync(
      join(TMP, ".env"),
      "FIRST=1\nUPDATE_ME=old_value\nLAST=3\n"
    );
    await writeEnvFile(TMP, { UPDATE_ME: "new_value" });
    const content = readFileSync(join(TMP, ".env"), "utf-8");
    expect(content).toContain("UPDATE_ME=new_value");
    expect(content).not.toContain("old_value");
    // Verify in-place: UPDATE_ME should still be between FIRST and LAST
    const lines = content.split("\n").filter((l) => l.trim() !== "");
    const firstIdx = lines.findIndex((l) => l.startsWith("FIRST="));
    const updateIdx = lines.findIndex((l) => l.startsWith("UPDATE_ME="));
    const lastIdx = lines.findIndex((l) => l.startsWith("LAST="));
    expect(updateIdx).toBeGreaterThan(firstIdx);
    expect(updateIdx).toBeLessThan(lastIdx);
  });

  test("creates .env if no env file exists", async () => {
    const filename = await writeEnvFile(TMP, { MY_KEY: "my_value" });
    expect(filename).toBe(".env");
    expect(existsSync(join(TMP, ".env"))).toBe(true);
    const content = readFileSync(join(TMP, ".env"), "utf-8");
    expect(content).toContain("MY_KEY=my_value");
  });

  test("writes to .dev.vars when wrangler.toml exists", async () => {
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'my-worker'\n");
    const filename = await writeEnvFile(TMP, { SECRET: "abc123" });
    expect(filename).toBe(".dev.vars");
    expect(existsSync(join(TMP, ".dev.vars"))).toBe(true);
    const content = readFileSync(join(TMP, ".dev.vars"), "utf-8");
    expect(content).toContain("SECRET=abc123");
  });

  test("preserves comments and blank lines", async () => {
    writeFileSync(
      join(TMP, ".env"),
      "# This is a comment\n\nFOO=bar\n\n# Another comment\nBAZ=qux\n"
    );
    await writeEnvFile(TMP, { NEW_VAR: "hello" });
    const content = readFileSync(join(TMP, ".env"), "utf-8");
    expect(content).toContain("# This is a comment");
    expect(content).toContain("# Another comment");
    expect(content).toContain("FOO=bar");
    expect(content).toContain("BAZ=qux");
    expect(content).toContain("NEW_VAR=hello");
    // Verify blank lines are preserved
    const lines = content.split("\n");
    const blankCount = lines.filter((l) => l === "").length;
    // Original had 2 blank lines + trailing newline; at least 2 blank lines should remain
    expect(blankCount).toBeGreaterThanOrEqual(2);
  });

  test("returns the file name that was written to", async () => {
    const filename = await writeEnvFile(TMP, { KEY: "val" });
    expect(filename).toBe(".env");

    // Also test with wrangler
    writeFileSync(join(TMP, "wrangler.toml"), "name = 'worker'\n");
    const filename2 = await writeEnvFile(TMP, { KEY2: "val2" });
    expect(filename2).toBe(".dev.vars");
  });
});
