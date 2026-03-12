import { readFile, writeFile, access } from "fs/promises";
import { join } from "path";

/**
 * Check if a file exists at the given path.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect which env file to write to based on the project root contents.
 *
 * Priority:
 *  1. `wrangler.toml` exists → `.dev.vars` (Cloudflare Workers convention)
 *  2. `.env` exists → `.env`
 *  3. `.env.local` exists → `.env.local`
 *  4. default → `.env`
 */
export async function detectEnvFile(projectRoot: string): Promise<string> {
  if (await fileExists(join(projectRoot, "wrangler.toml"))) {
    return ".dev.vars";
  }
  if (await fileExists(join(projectRoot, ".env"))) {
    return ".env";
  }
  if (await fileExists(join(projectRoot, ".env.local"))) {
    return ".env.local";
  }
  return ".env";
}

/**
 * Merge env vars into the appropriate env file for the project.
 *
 * - Calls `detectEnvFile` to determine the target file
 * - Reads existing file content (if any)
 * - Updates existing keys in-place (matches `^KEY=` pattern)
 * - Appends new keys at end
 * - Preserves comments, blank lines, and unmanaged keys
 *
 * @returns The filename that was written to (e.g. ".env", ".dev.vars")
 */
export async function writeEnvFile(
  projectRoot: string,
  envVars: Record<string, string>
): Promise<string> {
  const envFile = await detectEnvFile(projectRoot);
  const envPath = join(projectRoot, envFile);

  // Read existing content
  let existing = "";
  try {
    existing = await readFile(envPath, "utf-8");
  } catch {
    // File doesn't exist yet — start empty
  }

  const lines = existing ? existing.split("\n") : [];

  // Track which keys we've already updated in-place
  const updatedKeys = new Set<string>();

  // Update existing keys in-place
  for (let i = 0; i < lines.length; i++) {
    for (const [key, value] of Object.entries(envVars)) {
      if (lines[i].startsWith(`${key}=`)) {
        lines[i] = `${key}=${value}`;
        updatedKeys.add(key);
      }
    }
  }

  // Append new keys (those not updated in-place)
  const newKeys = Object.entries(envVars).filter(
    ([key]) => !updatedKeys.has(key)
  );

  if (newKeys.length > 0) {
    for (const [key, value] of newKeys) {
      const newLine = `${key}=${value}`;
      // If file ends with a trailing newline (last element is ""), insert before it
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.splice(lines.length - 1, 0, newLine);
      } else {
        lines.push(newLine);
      }
    }
  }

  // Ensure file ends with a newline
  const content =
    lines.join("\n") + (lines[lines.length - 1] !== "" ? "\n" : "");

  await writeFile(envPath, content);
  return envFile;
}
