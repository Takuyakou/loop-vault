import { describe, expect, it } from "vitest";
import {
  BACKUP_DIR,
  DATA_PATH,
  JsonVaultRepository,
  TEMP_DATA_PATH,
  backupFileName,
  corruptFileName,
  createEmptyVault,
  mergeVaults,
  serializeVault,
  VaultRepositoryError,
  type VaultStorage,
} from "./repository";
import { makeIdea } from "./testFactory";

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
    expect(storage.files.get(DATA_PATH)).toBe(serializeVault(createEmptyVault()));
  });

  it("moves syntax-damaged JSON to a corrupt file without writing an empty vault", async () => {
    const storage = new MemoryVaultStorage();
    const now = new Date(2026, 6, 22, 10, 11, 12);
    const corruptPath = `loopvault/${corruptFileName(now)}`;
    storage.files.set(DATA_PATH, "{ not json");
    const repo = new JsonVaultRepository(storage, { now: () => now });

    await expect(repo.load()).rejects.toMatchObject({
      kind: "invalid-json",
      details: expect.objectContaining({ corruptPath }),
    });

    expect(storage.files.has(DATA_PATH)).toBe(false);
    expect(storage.files.get(corruptPath)).toBe("{ not json");
    expect(storage.files.has(TEMP_DATA_PATH)).toBe(false);
  });

  it("quarantines only invalid records while loading the valid records", async () => {
    const storage = new MemoryVaultStorage();
    const validIdea = makeIdea({
      id: "33333333-3333-4333-8333-333333333333",
    });
    const invalidIdea = makeIdea({
      id: "44444444-4444-4444-8444-444444444444",
      bpm: 10,
    });
    storage.files.set(
      DATA_PATH,
      JSON.stringify({
        ...createEmptyVault(),
        ideas: [validIdea, invalidIdea],
      }),
    );
    const repo = new JsonVaultRepository(storage);

    const result = await repo.load();

    expect(result.vault.ideas).toEqual([validIdea]);
    expect(result.quarantine).toHaveLength(1);
    expect(result.quarantine[0]?.index).toBe(1);
  });

  it("reports future fileVersion without modifying data.json", async () => {
    const storage = new MemoryVaultStorage();
    const futureVault = JSON.stringify({
      ...createEmptyVault(),
      fileVersion: 2,
    });
    storage.files.set(DATA_PATH, futureVault);
    const repo = new JsonVaultRepository(storage);

    await expect(repo.load()).rejects.toBeInstanceOf(VaultRepositoryError);
    await expect(repo.load()).rejects.toMatchObject({
      kind: "future-version",
    });
    expect(storage.files.get(DATA_PATH)).toBe(futureVault);
    expect(
      storage.operations.some((operation) => operation.type === "copyFile"),
    ).toBe(false);
  });

  it("merges imported vaults using newer updatedAt on id collisions", async () => {
    const currentNewer = makeIdea({
      id: "55555555-5555-4555-8555-555555555555",
      title: "Current Newer",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
    const incomingOlder = makeIdea({
      id: currentNewer.id,
      title: "Incoming Older",
      updatedAt: "2026-07-19T00:00:00.000Z",
    });
    const incomingNew = makeIdea({
      id: "66666666-6666-4666-8666-666666666666",
      title: "Incoming New",
      updatedAt: "2026-07-21T00:00:00.000Z",
    });

    const merged = mergeVaults(
      { ...createEmptyVault(), ideas: [currentNewer] },
      { ...createEmptyVault(), ideas: [incomingOlder, incomingNew] },
    );

    expect(merged.ideas.map((idea) => idea.title)).toEqual([
      "Incoming New",
      "Current Newer",
    ]);
  });

  it("imports with merge mode and saves only after validation", async () => {
    const storage = new MemoryVaultStorage();
    const current = makeIdea({
      id: "77777777-7777-4777-8777-777777777777",
      title: "Current",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
    const incoming = makeIdea({
      id: "88888888-8888-4888-8888-888888888888",
      title: "Incoming",
      updatedAt: "2026-07-21T00:00:00.000Z",
    });
    storage.files.set(DATA_PATH, serializeVault({ ...createEmptyVault(), ideas: [current] }));
    storage.files.set("C:/export.json", serializeVault({ ...createEmptyVault(), ideas: [incoming] }));
    const repo = new JsonVaultRepository(storage);

    const result = await repo.importFrom("C:/export.json", { mode: "merge" });

    expect(result.vault.ideas.map((idea) => idea.id).sort()).toEqual([
      current.id,
      incoming.id,
    ].sort());
    expect(storage.files.get(DATA_PATH)).toBe(serializeVault(result.vault));
  });

  it("does not touch data.json when import JSON is invalid", async () => {
    const storage = new MemoryVaultStorage();
    const original = serializeVault(createEmptyVault());
    storage.files.set(DATA_PATH, original);
    storage.files.set("C:/broken.json", "{ nope");
    const repo = new JsonVaultRepository(storage);

    await expect(repo.importFrom("C:/broken.json")).rejects.toMatchObject({
      kind: "invalid-json",
    });
    expect(storage.files.get(DATA_PATH)).toBe(original);
  });
});
