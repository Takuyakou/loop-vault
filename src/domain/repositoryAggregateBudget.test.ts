import { describe, expect, it } from "vitest";
import { MAX_EXTERNAL_VAULT_BYTES } from "../security/intakeBudgets";
import {
  DATA_PATH,
  JsonVaultRepository,
  TEMP_DATA_PATH,
  assertVaultSerializedByteLength,
  createEmptyVault,
  vaultCanonicalSerializedByteLength,
  type VaultStorage,
} from "./repository";
import { makeIdea } from "./testFactory";

class MemoryStorage implements VaultStorage {
  files = new Map<string, string>();
  operations: string[] = [];
  async ensureDir(path: string) { this.operations.push(`ensure:${path}`); }
  async exists(path: string) { return this.files.has(path); }
  async readText(path: string) {
    const value = this.files.get(path);
    if (value === undefined) throw new Error("missing synthetic fixture");
    return value;
  }
  async writeText(path: string, value: string) { this.operations.push(`write:${path}`); this.files.set(path, value); }
  async rename(from: string, to: string) { this.operations.push(`rename:${from}:${to}`); this.files.set(to, this.files.get(from)!); this.files.delete(from); }
  async copyFile(from: string, to: string) { this.operations.push(`copy:${from}:${to}`); this.files.set(to, this.files.get(from)!); }
  async removeFile(path: string) { this.files.delete(path); }
  async listFiles() { return []; }
}

function legacyVaultAtCanonicalBytes(targetBytes: number, ideaId: string): string {
  const baseIdea = makeIdea({ id: ideaId, chordMemo: "", progressionBlocks: [] });
  const migrated = { ...createEmptyVault(), ideas: [baseIdea] };
  const memoBytes = targetBytes - vaultCanonicalSerializedByteLength(migrated);
  if (memoBytes < 0) throw new Error("Synthetic canonical target is too small.");
  const raw = JSON.stringify({
    ...migrated,
    fileVersion: 1,
    ideas: [{ ...baseIdea, chordMemo: "x".repeat(memoBytes) }],
  });
  return raw;
}

function vaultJson(fileVersion: 1 | 2, ideaId: string, memoBytes: number): string {
  return JSON.stringify({
    ...createEmptyVault(),
    fileVersion,
    ideas: [makeIdea({ id: ideaId, chordMemo: "x".repeat(memoBytes) })],
  });
}

describe("whole-Vault 16 MiB aggregate budget", () => {
  it("accepts the exact byte ceiling and rejects one byte over with a path-free error", () => {
    expect(() => assertVaultSerializedByteLength(MAX_EXTERNAL_VAULT_BYTES)).not.toThrow();
    expect(() => assertVaultSerializedByteLength(MAX_EXTERNAL_VAULT_BYTES + 1)).toThrowError(
      "Vault exceeds Loop Vault's 16 MiB storage limit.",
    );
  });

  it("uses migrated-v2 canonical bytes for exact and plus-one legacy recovery", async () => {
    const exactStorage = new MemoryStorage();
    const exactRaw = legacyVaultAtCanonicalBytes(
      MAX_EXTERNAL_VAULT_BYTES,
      "10000000-0000-4000-8000-000000000001",
    );
    exactStorage.files.set(DATA_PATH, exactRaw);
    const exact = await new JsonVaultRepository(exactStorage).load();
    expect(vaultCanonicalSerializedByteLength(exact.vault)).toBe(MAX_EXTERNAL_VAULT_BYTES);
    expect(exact.sizeRecovery).toBeUndefined();
    expect(exactStorage.files.get(DATA_PATH)).toBe(exactRaw);

    const overStorage = new MemoryStorage();
    const overRaw = legacyVaultAtCanonicalBytes(
      MAX_EXTERNAL_VAULT_BYTES + 1,
      "11000000-0000-4000-8000-000000000011",
    );
    overStorage.files.set(DATA_PATH, overRaw);
    const over = await new JsonVaultRepository(overStorage).load();
    expect(vaultCanonicalSerializedByteLength(over.vault)).toBe(MAX_EXTERNAL_VAULT_BYTES + 1);
    expect(over.sizeRecovery).toBe(true);
    expect(overStorage.files.get(DATA_PATH)).toBe(overRaw);
    expect(overStorage.operations).not.toContain(`write:${TEMP_DATA_PATH}`);
  });

  it("rejects over-budget save and export before their destination writes", async () => {
    const storage = new MemoryStorage();
    const oversized = {
      ...createEmptyVault(),
      ideas: [makeIdea({
        id: "50000000-0000-4000-8000-000000000005",
        chordMemo: "x".repeat(MAX_EXTERNAL_VAULT_BYTES),
      })],
    };
    const repository = new JsonVaultRepository(storage);
    await expect(repository.save(oversized)).rejects.toMatchObject({ kind: "vault-too-large" });
    expect(storage.operations).toEqual([]);

    storage.files.set(
      DATA_PATH,
      vaultJson(1, "60000000-0000-4000-8000-000000000006", MAX_EXTERNAL_VAULT_BYTES),
    );
    await expect(repository.exportTo("export.json")).rejects.toMatchObject({
      kind: "vault-too-large",
    });
    expect(storage.files.has("export.json")).toBe(false);
    expect(storage.operations).not.toContain("write:export.json");
  });

  it("rejects a minified import whose canonical aggregate exceeds the limit", async () => {
    const storage = new MemoryStorage();
    const ideaId = "70000000-0000-4000-8000-000000000007";
    const emptyRaw = vaultJson(2, ideaId, 0);
    const raw = vaultJson(2, ideaId, MAX_EXTERNAL_VAULT_BYTES - new TextEncoder().encode(emptyRaw).byteLength);
    expect(new TextEncoder().encode(raw).byteLength).toBe(MAX_EXTERNAL_VAULT_BYTES);
    storage.files.set("external.json", raw);
    const repository = new JsonVaultRepository(storage);
    await expect(repository.importFrom("external.json", { mode: "replace" })).rejects.toMatchObject({
      kind: "vault-too-large",
    });
    expect(storage.operations.some((entry) => entry.startsWith("write:") || entry.startsWith("copy:") || entry.startsWith("rename:"))).toBe(false);
  });

  it("rejects an over-budget merge before backup, temp, or destination write", async () => {
    const storage = new MemoryStorage();
    const half = Math.floor(MAX_EXTERNAL_VAULT_BYTES * 0.55);
    storage.files.set(DATA_PATH, vaultJson(2, "20000000-0000-4000-8000-000000000002", half));
    storage.files.set("external.json", vaultJson(2, "30000000-0000-4000-8000-000000000003", half));
    const repository = new JsonVaultRepository(storage);
    await expect(repository.importFrom("external.json", { mode: "merge" })).rejects.toMatchObject({
      kind: "vault-too-large",
    });
    expect(storage.operations.some((entry) => entry.startsWith("write:") || entry.startsWith("copy:") || entry.startsWith("rename:"))).toBe(false);
  });
});
