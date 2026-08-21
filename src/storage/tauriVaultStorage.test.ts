import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_EXTERNAL_VAULT_BYTES } from "../security/intakeBudgets";
import { TauriVaultStorage } from "./tauriVaultStorage";

const mocks = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 26 },
  copyFile: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  readTextFile: mocks.readTextFile,
  remove: vi.fn(),
  rename: vi.fn(),
  stat: mocks.stat,
  writeTextFile: vi.fn(),
}));

describe("TauriVaultStorage external import budget", () => {
  beforeEach(() => {
    mocks.readTextFile.mockReset();
    mocks.stat.mockReset();
  });

  it("checks external metadata before reading", async () => {
    mocks.stat.mockResolvedValue({ size: MAX_EXTERNAL_VAULT_BYTES + 1 });
    const storage = new TauriVaultStorage();

    await expect(storage.readText("selected.json", { external: true })).rejects.toMatchObject({
      code: "vault-file-bytes",
    });
    expect(mocks.readTextFile).not.toHaveBeenCalled();
  });

  it("rechecks external UTF-8 bytes after reading", async () => {
    mocks.stat.mockResolvedValue({ size: 1 });
    mocks.readTextFile.mockResolvedValue("x".repeat(MAX_EXTERNAL_VAULT_BYTES + 1));
    const storage = new TauriVaultStorage();

    await expect(storage.readText("selected.json", { external: true })).rejects.toMatchObject({
      code: "vault-file-bytes",
    });
  });

  it("does not stat internal AppData reads", async () => {
    mocks.readTextFile.mockResolvedValue("{}");
    const storage = new TauriVaultStorage();

    await expect(storage.readText("loopvault/data.json")).resolves.toBe("{}");
    expect(mocks.stat).not.toHaveBeenCalled();
  });
});
