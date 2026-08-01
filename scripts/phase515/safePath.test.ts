import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  safeResolveExistingWithinRoot,
  safeResolveWithinRoot,
  readFileExistingWithinRoot,
} from "./safePath";

describe("safeResolveWithinRoot", () => {
  it.each([
    ["v1 filename", "../escape.mid"],
    ["Phase 4.7 holdout item.path", "../../private.mid"],
    ["Voicing Gold item.path", "nested/../../../private.mid"],
    ["absolute Windows path", "C:\\Users\\person\\private.mid"],
  ])("rejects %s traversal/absolute values", (_label, value) => {
    expect(() => safeResolveWithinRoot(resolve("test/corpus"), value)).toThrow();
  });

  it("accepts a nested corpus-relative path", () => {
    expect(safeResolveWithinRoot(resolve("test/corpus"), "nested/file.mid"))
      .toBe(resolve("test/corpus/nested/file.mid"));
  });

  it("rejects a symlink/junction read that resolves outside the corpus root", async () => {
    const temporary = await mkdtemp(resolve(tmpdir(), "loop-vault-safe-path-"));
    const root = resolve(temporary, "root");
    const outside = resolve(temporary, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(resolve(outside, "private.mid"), "private");
    await symlink(outside, resolve(root, "escape"), "junction");
    try {
      await expect(safeResolveExistingWithinRoot(
        root,
        "escape/private.mid",
      )).rejects.toThrow(/escapes root/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("rejects a corpus root which is itself a junction", async () => {
    const temporary = await mkdtemp(resolve(tmpdir(), "loop-vault-safe-root-"));
    const realRoot = resolve(temporary, "real-root");
    const linkedRoot = resolve(temporary, "linked-root");
    await mkdir(realRoot);
    await writeFile(resolve(realRoot, "manifest.json"), "{}");
    try {
      try {
        await symlink(realRoot, linkedRoot, "junction");
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "EPERM") return;
        throw cause;
      }
      await expect(readFileExistingWithinRoot(linkedRoot, "manifest.json"))
        .rejects.toThrow(/real directory|symlink or junction/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("reads a regular contained file through an identity-checked handle", async () => {
    const temporary = await mkdtemp(resolve(tmpdir(), "loop-vault-safe-read-"));
    await mkdir(resolve(temporary, "nested"));
    await writeFile(resolve(temporary, "nested/file.mid"), "safe");
    try {
      await expect(readFileExistingWithinRoot(temporary, "nested/file.mid"))
        .resolves.toEqual(Buffer.from("safe"));
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("rejects a final-file symlink even when it resolves inside the root", async () => {
    const temporary = await mkdtemp(resolve(tmpdir(), "loop-vault-safe-read-"));
    await writeFile(resolve(temporary, "real.mid"), "safe");
    try {
      try {
        await symlink(
          resolve(temporary, "real.mid"),
          resolve(temporary, "linked.mid"),
          "file",
        );
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "EPERM") return;
        throw cause;
      }
      await expect(readFileExistingWithinRoot(temporary, "linked.mid"))
        .rejects.toThrow(/symlink or junction|ELOOP/);
      expect(await readFile(resolve(temporary, "real.mid"), "utf8")).toBe("safe");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
