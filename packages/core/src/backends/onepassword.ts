import type { SecretBackend, SecretRef, SecretEntry } from "./types";
import { exec as execCmd, execShell as execShellCmd } from "../exec";

const opEnv = {
  ...process.env,
  OP_BIOMETRIC_UNLOCK_ENABLED: "true",
};

async function exec(args: string[]): Promise<string> {
  return execCmd("op", args, opEnv);
}

async function execShell(command: string): Promise<string> {
  return execShellCmd(command, opEnv);
}

export class OnePasswordBackend implements SecretBackend {
  readonly name = "1Password";

  private sectionName(project: string, env: string): string {
    return `${project}-${env}`;
  }

  /** Escape dots, equals, and backslashes for op assignment statements */
  private escapeAssignment(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/\./g, "\\.").replace(/=/g, "\\=");
  }

  buildRef(ref: SecretRef): string {
    const section = this.sectionName(ref.project, ref.env);
    return `op://${ref.vault}/${ref.provider}/${section}/${ref.field}`;
  }

  buildInlineRef(ref: SecretRef): string | null {
    return this.buildRef(ref);
  }

  buildWriteArgs(entry: SecretEntry): string[] {
    const { ref, value } = entry;
    const section = this.escapeAssignment(this.sectionName(ref.project, ref.env));
    const field = this.escapeAssignment(ref.field);
    const fieldKey = `${section}.${field}`;
    return [
      "item",
      "edit",
      ref.provider,
      "--vault",
      ref.vault,
      `${fieldKey}[password]=${value}`,
    ];
  }

  async isAvailable(): Promise<boolean> {
    const status = await this.checkStatus();
    return status === "ready";
  }

  async checkStatus(): Promise<"not_installed" | "not_logged_in" | "ready"> {
    try {
      const output = await exec(["account", "list", "--format=json"]);
      const accounts = JSON.parse(output);
      if (!Array.isArray(accounts) || accounts.length === 0) {
        return "not_logged_in";
      }
      return "ready";
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("not found") || msg.includes("ENOENT")) {
        return "not_installed";
      }
      return "not_logged_in";
    }
  }

  async read(ref: SecretRef): Promise<string> {
    return exec(["read", this.buildRef(ref)]);
  }

  async readRaw(opUri: string): Promise<string> {
    return exec(["read", opUri]);
  }

  async listVaultItems(
    vault: string,
  ): Promise<{ title: string; id: string }[]> {
    try {
      const raw = await exec([
        "item",
        "list",
        "--vault",
        vault,
        "--format",
        "json",
      ]);
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async getItemFields(
    provider: string,
    vault: string,
  ): Promise<{ section: string; label: string }[]> {
    try {
      const raw = await exec([
        "item",
        "get",
        provider,
        "--vault",
        vault,
        "--format",
        "json",
      ]);
      const item = JSON.parse(raw);
      if (!item.fields) return [];
      return item.fields
        .filter((f: any) => f.section?.label && f.label)
        .map((f: any) => ({
          section: f.section.label as string,
          label: f.label as string,
        }));
    } catch {
      return [];
    }
  }

  async getAllFields(
    vault: string,
  ): Promise<Map<string, { section: string; label: string }[]>> {
    const result = new Map<string, { section: string; label: string }[]>();
    try {
      // Use shell pipe: op item list | op item get - (2 op processes in 1 shell command)
      const safeVault = vault.replace(/'/g, "'\\''");
      const raw = await execShell(
        `op item list --vault '${safeVault}' --format json | op item get - --format json`
      );

      // op item get outputs concatenated multi-line JSON objects
      let items: any[];
      const trimmed = raw.trim();
      if (trimmed.startsWith("[")) {
        items = JSON.parse(trimmed);
      } else {
        // Parse concatenated JSON objects by tracking brace depth
        items = [];
        let depth = 0, start = 0;
        for (let i = 0; i < trimmed.length; i++) {
          if (trimmed[i] === "{") { if (depth === 0) start = i; depth++; }
          if (trimmed[i] === "}") { depth--; if (depth === 0) { try { items.push(JSON.parse(trimmed.substring(start, i + 1))); } catch {} } }
        }
      }

      for (const item of items) {
        if (item.fields && item.title) {
          result.set(
            item.title,
            item.fields
              .filter((f: any) => f.section?.label && f.label)
              .map((f: any) => ({
                section: f.section.label as string,
                label: f.label as string,
              }))
          );
        }
      }
    } catch {
      // vault doesn't exist, not accessible, or pipe failed
    }
    return result;
  }

  private vaultCache = new Set<string>();

  async ensureVault(vault: string): Promise<void> {
    if (this.vaultCache.has(vault)) return;
    try {
      await exec(["vault", "get", vault]);
    } catch {
      await exec(["vault", "create", vault, "--icon", "vault-door"]);
    }
    this.vaultCache.add(vault);
  }

  async write(entry: SecretEntry): Promise<void> {
    const { ref, value } = entry;
    const section = this.escapeAssignment(this.sectionName(ref.project, ref.env));
    const field = this.escapeAssignment(ref.field);
    const fieldKey = `${section}.${field}`;

    await this.ensureVault(ref.vault);

    try {
      // Try editing existing item first
      await exec([
        "item",
        "edit",
        ref.provider,
        "--vault",
        ref.vault,
        `${fieldKey}[password]=${value}`,
      ]);
    } catch {
      // Item doesn't exist, create it
      await exec([
        "item",
        "create",
        "--vault",
        ref.vault,
        "--category",
        "API Credential",
        "--title",
        ref.provider,
        `${fieldKey}[password]=${value}`,
      ]);
    }
  }

  async writeMany(entries: SecretEntry[]): Promise<void> {
    if (entries.length === 0) return;

    // Group by vault + provider
    const groups = new Map<string, SecretEntry[]>();
    for (const entry of entries) {
      const key = `${entry.ref.vault}\0${entry.ref.provider}`;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      const { vault, provider, project, env } = group[0].ref;
      const section = this.escapeAssignment(this.sectionName(project, env));
      await this.ensureVault(vault);

      const fieldArgs = group.map(({ ref, value }) => {
        const field = this.escapeAssignment(ref.field);
        const fieldKey = `${section}.${field}`;
        return `${fieldKey}[password]=${value}`;
      });

      try {
        // Edit existing item with all fields at once
        await exec(["item", "edit", provider, "--vault", vault, ...fieldArgs]);
      } catch {
        // Item doesn't exist, create with all fields
        await exec([
          "item", "create", "--vault", vault,
          "--category", "API Credential",
          "--title", provider,
          ...fieldArgs,
        ]);
      }
    }
  }

  async list(
    project?: string,
    env?: string,
    vault = "shipkey",
  ): Promise<SecretRef[]> {
    const raw = await exec([
      "item",
      "list",
      "--vault",
      vault,
      "--format",
      "json",
    ]);
    const items = JSON.parse(raw) as { title: string; id: string }[];
    const refs: SecretRef[] = [];

    for (const item of items) {
      const detail = await exec([
        "item",
        "get",
        item.id,
        "--format",
        "json",
      ]);
      const parsed = JSON.parse(detail);
      if (!parsed.fields) continue;

      for (const field of parsed.fields) {
        if (!field.section?.label) continue;
        const sectionLabel = field.section.label as string;
        const dashIndex = sectionLabel.lastIndexOf("-");
        if (dashIndex === -1) continue;

        const proj = sectionLabel.slice(0, dashIndex);
        const e = sectionLabel.slice(dashIndex + 1);

        if (project && proj !== project) continue;
        if (env && e !== env) continue;

        refs.push({
          vault,
          provider: item.title,
          project: proj,
          env: e,
          field: field.label,
        });
      }
    }

    return refs;
  }
}
