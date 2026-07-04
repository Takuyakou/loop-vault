import { describe, expect, it } from "vitest";
import {
  BACKUP_DIR,
  DATA_PATH,
  JsonVaultRepository,
  TEMP_DATA_PATH,
  backupFileName,
  createEmptyVault,
  serializeVault,
  type VaultStorage,
} from "./repository";

class MemoryVaultStorage implements VaultStorage {
  readonly files = new Map<string, string>();
  readonly directories = new Set<string>();
  readonly operations: { type: string; path?: string; from?: string; to?: string }[] =
    [];

  async ensureDir(path: string): Promise<void> {
    this.operations.push({ type: "ensureDir", path });
    this.directories.add(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  async readText(path: string): Promise<string> {
    const contents = this.files.get(path);
    if (contents === undefined) {
      throw new Error(`Missing file: ${path}`);
    }
    return contents;
  }

  async writeText(path: string, contents: string): Promise<void> {
    this.operations.push({ type: "writeText", path });
    this.files.set(path, contents);
  }

  async rename(from: string, to: string): Promise<void> {
    this.operations.push({ type: "rename", from, to });
    const contents = this.files.get(from);
    if (contents === undefined) {
      throw new Error(`Missing file: ${from}`);
    }
    this.files.set(to, contents);
    this.files.delete(from);
  }

  async copyFile(from: string, to: string): Promise<void> {
    this.operations.push({ type: "copyFile", from, to });
    const contents = this.files.get(from);
    if (contents === undefined) {
      throw new Error(`Missing file: ${from}`);
    }
    this.files.set(to, contents);
  }

  async removeFile(path: string): Promise<void> {
    this.operations.push({ type: "removeFile", path });
    this.files.delete(path);
  }

  async listFiles(path: string): Promise<string[]> {
    const prefix = `${path}/`;
    return [...this.files.keys()]
      .filter((filePath) => filePath.startsWith(prefix))
      .map((filePath) => filePath.slice(prefix.length))
      .filter((name) => !name.includes("/"));
  }
}

describe("JsonVaultRepository", () => {
  it("saves with a tmp file followed by rename", async () => {
    const storage = new MemoryVaultStorage();
    const repo = new JsonVaultRepository(storage);
    const vault = createEmptyVault();

    await repo.save(vault);

    expect(storage.files.has(TEMP_DATA_PATH)).toBe(false);
    expect(storage.files.get(DATA_PATH)).toBe(serializeVault(vault));
    expect(storage.operations).toContainEqual({
      type: "writeText",
      path: TEMP_DATA_PATH,
    });
    expect(storage.operations).toContainEqual({
      type: "rename",
      from: TEMP_DATA_PATH,
      to: DATA_PATH,
    });
  });

  it("creates a startup backup and keeps only the latest 20 generations", async () => {
    const storage = new MemoryVaultStorage();
    const vault = createEmptyVault();
    storage.files.set(DATA_PATH, serializeVault(vault));

    for (let day = 1; day <= 20; day += 1) {
      const backupDate = new Date(2026, 6, day, 10, 0, 0);
      storage.files.set(
        `${BACKUP_DIR}/${backupFileName(backupDate)}`,
        serializeVault(vault),
      );
    }

    const repo = new JsonVaultRepository(storage, {
      now: () => new Date(2026, 6, 21, 10, 0, 0),
    });

    await repo.load();

    const backupNames = (await repo.listBackups()).map((backup) => backup.name);
    expect(backupNames).toHaveLength(20);
    expect(backupNames).toContain("data-20260721-1000.json");
    expect(backupNames).not.toContain("data-20260701-1000.json");
  });

  it("loads an empty vault when data.json does not exist", async () => {
    const storage = new MemoryVaultStorage();
    const repo = new JsonVaultRepository(storage);

    const result = await repo.load();

    expect(result.created).toBe(true);
    expect(result.vault).toEqual(createEmptyVault());
    expect(result.quarantine).toHaveLength(0);
  });
});
