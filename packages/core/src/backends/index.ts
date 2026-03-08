import { OnePasswordBackend } from "./onepassword";
import { BitwardenBackend } from "./bitwarden";
import type { SecretBackend } from "./types";

const BACKENDS: Record<string, () => SecretBackend> = {
  "1password": () => new OnePasswordBackend(),
  bitwarden: () => new BitwardenBackend(),
};

export function getBackend(name = "1password"): SecretBackend {
  const factory = BACKENDS[name];
  if (!factory) {
    throw new Error(
      `Unknown backend: ${name}. Available: ${Object.keys(BACKENDS).join(", ")}`,
    );
  }
  return factory();
}

export function listBackends(): string[] {
  return Object.keys(BACKENDS);
}
