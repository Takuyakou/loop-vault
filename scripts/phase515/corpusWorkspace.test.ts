import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { corpusWorkspaceExists } from "./corpusWorkspace";

describe("ignored Phase 5.15 corpus workspace safety", () => {
  it("requires both manifests to be handle-readable below real repository roots", async () => {
    const repository = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-local-"));
    await mkdir(resolve(repository, "test/phase5.15"), { recursive: true });
    await mkdir(resolve(repository, "test/phase5.15-supplemental"), {
      recursive: true,
    });
    await writeFile(resolve(repository, "test/phase5.15/manifest.json"), "{}");
    await writeFile(
      resolve(repository, "test/phase5.15-supplemental/manifest-supplemental.json"),
      "{}",
    );
    try {
      await expect(corpusWorkspaceExists(repository)).resolves.toBe(true);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it("rejects an ignored corpus root which is a junction", async () => {
    const repository = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-local-"));
    const outside = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-outside-"));
    await mkdir(resolve(repository, "test/phase5.15-supplemental"), {
      recursive: true,
    });
    await writeFile(resolve(outside, "manifest.json"), "{}");
    await writeFile(
      resolve(repository, "test/phase5.15-supplemental/manifest-supplemental.json"),
      "{}",
    );
    try {
      try {
        await symlink(outside, resolve(repository, "test/phase5.15"), "junction");
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "EPERM") return;
        throw cause;
      }
      await expect(corpusWorkspaceExists(repository))
        .rejects.toThrow(/real directory|junction|inside the repository/);
    } finally {
      await unlink(resolve(repository, "test/phase5.15"))
        .catch(() => undefined);
      await rm(repository, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
