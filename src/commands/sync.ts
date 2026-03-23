import { Command } from "commander";
import { resolve } from "path";
import { getBackend } from "../backends";
import type { SecretBackend } from "../backends/types";
import { GitHubTarget } from "../targets/github";
import { TICK, CROSS, ARROW } from "../symbols";
import { CloudflareTarget } from "../targets/cloudflare";
import type { SyncTarget } from "../targets/types";
import { loadConfig, buildSecretRefMap } from "../config";
import type { TargetConfig } from "../config";

const TARGETS: Record<string, SyncTarget> = {
  github: new GitHubTarget(),
  cloudflare: new CloudflareTarget(),
};

async function resolveSecret(
  nameOrRef: string,
  refMap: Map<string, string | null>,
  backend: SecretBackend
): Promise<{ name: string; value: string }> {
  // For 1Password backend, check if it's a direct op:// reference
  if (nameOrRef.startsWith("op://") && "readRaw" in backend) {
    const value = await (backend as any).readRaw(nameOrRef);
    return { name: nameOrRef, value };
  }

  // Look up env key name via the ref map
  const inlineRef = refMap.get(nameOrRef);
  if (inlineRef && "readRaw" in backend) {
    // Backend supports direct URI reading (1Password)
    const value = await (backend as any).readRaw(inlineRef);
    return { name: nameOrRef, value };
  }

  // No inline ref or backend doesn't support readRaw — not resolvable via this path
  // This happens for Bitwarden where we need to resolve through the config
  throw new Error(
    `Cannot resolve secret "${nameOrRef}". Ensure it's configured in providers in shipkey.json.`
  );
}

async function syncTarget(
  target: SyncTarget,
  config: TargetConfig,
  refMap: Map<string, string | null>,
  backend: SecretBackend
): Promise<void> {
  console.log(`Syncing to ${target.name}...\n`);

  if (!(await target.isAvailable())) {
    console.error(`Error: ${target.installHint()}`);
    return;
  }

  let totalSynced = 0;
  let totalFailed = 0;

  for (const [destination, secretRefs] of Object.entries(config)) {
    const secrets: { name: string; value: string }[] = [];

    if (Array.isArray(secretRefs)) {
      // Array format: ["NPM_TOKEN", "CLOUDFLARE_API_TOKEN"]
      // Resolve env key names via providers config
      for (const envKey of secretRefs) {
        try {
          const secret = await resolveSecret(envKey, refMap, backend);
          secrets.push(secret);
        } catch (err) {
          console.error(
            `  ${CROSS} ${envKey} — ${err instanceof Error ? err.message : err}`
          );
          totalFailed++;
        }
      }
    } else {
      // Record format: { "SECRET_NAME": "op://..." }
      for (const [name, ref] of Object.entries(secretRefs)) {
        try {
          if (ref.startsWith("op://") && "readRaw" in backend) {
            const value = await (backend as any).readRaw(ref);
            secrets.push({ name, value });
          } else {
            const secret = await resolveSecret(name, refMap, backend);
            secrets.push(secret);
          }
        } catch (err) {
          console.error(
            `  ${CROSS} ${name} — ${err instanceof Error ? err.message : err}`
          );
          totalFailed++;
        }
      }
    }

    if (secrets.length === 0) continue;

    const result = await target.sync(secrets, destination);

    for (const name of result.success) {
      console.log(`  ${TICK} ${name} ${ARROW} ${destination}`);
      totalSynced++;
    }
    for (const { name, error } of result.failed) {
      console.error(`  ${CROSS} ${name} ${ARROW} ${destination} — ${error}`);
      totalFailed++;
    }
  }

  if (totalFailed > 0) {
    console.log(`\n  Done. ${totalSynced} synced, ${totalFailed} failed.\n`);
  } else {
    console.log(`\n  Done. ${totalSynced} secrets synced.\n`);
  }
}

export const syncCommand = new Command("sync")
  .description(
    "Sync secrets to external platforms (GitHub Actions, Cloudflare)"
  )
  .argument("[target]", "target platform (github, cloudflare)")
  .argument("[dir]", "project directory", ".")
  .action(async (targetArg: string | undefined, dir: string) => {
    const projectRoot = resolve(dir);
    const config = await loadConfig(projectRoot);

    if (!config.targets) {
      console.error(
        'No "targets" configured in shipkey.json. Add a targets section to sync secrets.'
      );
      process.exit(1);
    }

    const backend = getBackend(config.backend);
    if (!(await backend.isAvailable())) {
      console.error(
        `Error: ${backend.name} CLI not available. Run 'shipkey setup' for installation instructions.`
      );
      process.exit(1);
    }

    const refMap = buildSecretRefMap(config, backend);

    // Determine which targets to sync
    const targetNames = targetArg
      ? [targetArg]
      : Object.keys(config.targets);

    for (const name of targetNames) {
      const target = TARGETS[name];
      if (!target) {
        console.error(
          `Unknown target: ${name}. Available: ${Object.keys(TARGETS).join(", ")}`
        );
        continue;
      }

      const targetConfig =
        config.targets[name as keyof typeof config.targets];
      if (!targetConfig) {
        console.log(
          `No configuration for target "${name}" in shipkey.json. Skipping.`
        );
        continue;
      }

      await syncTarget(target, targetConfig, refMap, backend);
    }
  });
