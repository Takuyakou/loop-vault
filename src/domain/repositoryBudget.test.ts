import { describe, expect, it } from "vitest";
import { JsonVaultRepository, type VaultStorage } from "./repository";
import { MAX_EXTERNAL_VAULT_BYTES } from "../security/intakeBudgets";

class OversizedImportStorage implements VaultStorage {
  async ensureDir(): Promise<void> {}
  async exists(): Promise<boolean> { return false; }
  async readText(): Promise<string> { return "x".repeat(MAX_EXTERNAL_VAULT_BYTES + 1); }
  async writeText(): Promise<void> {}
  async rename(): Promise<void> {}
  async copyFile(): Promise<void> {}
  async removeFile(): Promise<void> {}
  async listFiles(): Promise<string[]> { return []; }
}

describe("JsonVaultRepository import budget", () => {
  it("revalidates external contents before JSON parsing", async () => {
    const repository = new JsonVaultRepository(new OversizedImportStorage());
    await expect(repository.importFrom("selected.json")).rejects.toMatchObject({
      code: "vault-file-bytes",
    });
  });
});
