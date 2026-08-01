import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generatePhase515Corpus } from "./generateCorpus";

describe("Phase 5.15 corpus generator write safety", () => {
  it("rejects an existing non-empty output directory without modifying it", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-output-"));
    const output = resolve(parent, "existing");
    await mkdir(output);
    const sentinel = resolve(output, "keep.txt");
    await writeFile(sentinel, "keep");
    try {
      await expect(generatePhase515Corpus(output)).rejects.toThrow(/any existing/);
      await expect(import("node:fs/promises").then(({ readFile }) =>
        readFile(sentinel, "utf8"))).resolves.toBe("keep");
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("rejects an existing empty output directory", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-output-"));
    const output = resolve(parent, "existing-empty");
    await mkdir(output);
    try {
      await expect(generatePhase515Corpus(output)).rejects.toThrow(/any existing/);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("accepts a new path and promotes the complete corpus atomically", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-output-"));
    const output = resolve(parent, "new-output");
    try {
      await expect(generatePhase515Corpus(output)).resolves.toHaveLength(36);
      await expect(import("node:fs/promises").then(({ access }) =>
        access(resolve(output, "test/phase5.15/manifest.json")))).resolves
        .toBeUndefined();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("rejects a symlink or junction output target", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-output-"));
    const outside = resolve(parent, "outside");
    const output = resolve(parent, "linked");
    await mkdir(outside);
    await symlink(outside, output, "junction");
    try {
      await expect(generatePhase515Corpus(output)).rejects.toThrow(/any existing/);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("never overwrites or deletes a destination during a concurrent race", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-race-"));
    const output = resolve(parent, "contended");
    try {
      const attempts = await Promise.allSettled([
        generatePhase515Corpus(output),
        generatePhase515Corpus(output),
      ]);
      expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
      expect(attempts.filter((item) => item.status === "rejected")).toHaveLength(1);
      await expect(import("node:fs/promises").then(({ access }) =>
        access(resolve(output, "test/phase5.15/manifest.json")))).resolves
        .toBeUndefined();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("leaks no generated files when a non-cooperating writer wins promotion", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-race-"));
    const output = resolve(parent, "contended");
    const foreign = resolve(output, "foreign.txt");
    try {
      await expect(generatePhase515Corpus(
        output,
        undefined,
        {
          beforePromotion: async () => {
            await mkdir(output);
            await writeFile(foreign, "foreign");
          },
        },
      )).rejects.toThrow(/existing|EEXIST|EPERM/i);
      await expect(import("node:fs/promises").then(({ readFile }) =>
        readFile(foreign, "utf8"))).resolves.toBe("foreign");
      await expect(import("node:fs/promises").then(({ access }) =>
        access(resolve(output, "test")))).rejects.toMatchObject({ code: "ENOENT" });
      const entries = await import("node:fs/promises").then(({ readdir }) =>
        readdir(parent));
      expect(entries.some((entry) =>
        entry.startsWith(".loop-vault-p515-stage-"))).toBe(false);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("reclaims a stale PID/nonce destination lock", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-stale-"));
    const output = resolve(parent, "generated");
    const lockKey = createHash("sha256")
      .update(resolve(output))
      .digest("hex")
      .slice(0, 24);
    const lock = resolve(
      dirname(output),
      `.loop-vault-p515-generate-${lockKey}.lock`,
    );
    await writeFile(lock, JSON.stringify({
      schemaVersion: 1,
      pid: 2_147_483_647,
      nonce: randomUUID(),
    }));
    try {
      await expect(generatePhase515Corpus(output)).resolves.toHaveLength(36);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("fails closed on a malformed destination lock", async () => {
    const parent = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-stale-"));
    const output = resolve(parent, "generated");
    const lockKey = createHash("sha256")
      .update(resolve(output))
      .digest("hex")
      .slice(0, 24);
    const lock = resolve(
      dirname(output),
      `.loop-vault-p515-generate-${lockKey}.lock`,
    );
    await writeFile(lock, "not-json");
    try {
      await expect(generatePhase515Corpus(output))
        .rejects.toThrow(/Unexpected token|Malformed/);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
