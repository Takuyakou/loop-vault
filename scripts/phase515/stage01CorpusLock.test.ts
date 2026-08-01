import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findPrivacyIssues } from "./privacy";
import {
  buildStage01CorpusLockBinding,
  stage01SourceLockSha256,
  stage01CorpusLockBindingSchema,
  verifyStage01CorpusLock,
} from "./stage01CorpusLock";

const repositoryRoot = resolve(import.meta.dirname, "../..");

describe("Stage 01 frozen 317-entry corpus binding", () => {
  it("canonicalizes only source-lock JSON line endings and rejects content changes", () => {
    const lf = Buffer.from("{\n  \"schemaVersion\": 1\n}\n", "utf8");
    const crlf = Buffer.from("{\r\n  \"schemaVersion\": 1\r\n}\r\n", "utf8");
    const cr = Buffer.from("{\r  \"schemaVersion\": 1\r}\r", "utf8");
    const changed = Buffer.from("{\n  \"schemaVersion\": 2\n}\n", "utf8");
    expect(stage01SourceLockSha256(crlf)).toBe(stage01SourceLockSha256(lf));
    expect(stage01SourceLockSha256(cr)).toBe(stage01SourceLockSha256(lf));
    expect(stage01SourceLockSha256(changed)).not.toBe(stage01SourceLockSha256(lf));
    expect(() => stage01SourceLockSha256(Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      lf,
    ]))).toThrow(/canonical UTF-8/u);
    expect(() => stage01SourceLockSha256(Buffer.from([0xff]))).toThrow(/canonical UTF-8/u);
  });

  it("matches the tracked normalized manifest and verifies file bytes without Analyzer", async () => {
    const result = await verifyStage01CorpusLock(repositoryRoot);
    expect(result).toMatchObject({
      pass: true,
      logicalEntryCount: 317,
      uniquePhysicalFileCount: 277,
      normalizedManifestSha256: "8e97f2f9a16546d9f3b2ad6a8dcff76f8fff40b8df8a063a28b1dc2456b78eb6",
    });
  }, 30_000);

  it("is deterministic, strict, and privacy-safe", async () => {
    const built = await buildStage01CorpusLockBinding(repositoryRoot);
    const tracked = stage01CorpusLockBindingSchema.parse(JSON.parse(await readFile(
      resolve(repositoryRoot, "docs/phase5.15/01-corpus-lock-binding.json"),
      "utf8",
    )));
    expect(built).toEqual(tracked);
    expect(findPrivacyIssues(tracked, "binding")).toEqual([]);
    expect(tracked.normalizedManifest).toMatchObject({
      logicalEntryCount: 317,
      uniquePhysicalFileCount: 277,
    });
    expect(tracked.normalizedManifest.suites.flatMap((suite) => suite.files)).toHaveLength(317);
    expect(tracked.normalizedManifest.allowedCrossSuiteOverlaps).toEqual([{
      suiteIds: ["voicing-gold-40-file-selection", "voicing-gold-development"],
      files: expect.any(Array),
    }]);
    expect(tracked.normalizedManifest.allowedCrossSuiteOverlaps[0].files).toHaveLength(40);
  });

  it("allows only the exact 40-file selection/development physical overlap", async () => {
    const binding = await buildStage01CorpusLockBinding(repositoryRoot);
    const groups = new Map<string, Array<{ suiteId: string; byteLength: number; sha256: string }>>();
    for (const suite of binding.normalizedManifest.suites) {
      for (const file of suite.files) {
        const group = groups.get(file.relativePath) ?? [];
        group.push({ suiteId: suite.id, byteLength: file.byteLength, sha256: file.sha256 });
        groups.set(file.relativePath, group);
      }
    }
    const duplicates = [...groups.entries()].filter(([, entries]) => entries.length > 1);
    expect(duplicates).toHaveLength(40);
    for (const [path, entries] of duplicates) {
      expect(entries.map((entry) => entry.suiteId).sort()).toEqual([
        "voicing-gold-40-file-selection",
        "voicing-gold-development",
      ].sort());
      expect(new Set(entries.map((entry) => `${entry.byteLength}:${entry.sha256}`))).toHaveLength(1);
      expect(binding.normalizedManifest.allowedCrossSuiteOverlaps[0].files)
        .toContainEqual({
          relativePath: path,
          byteLength: entries[0]!.byteLength,
          sha256: entries[0]!.sha256,
        });
    }
  });

  it("rejects file, manifest, source-lock, and partition mutations", async () => {
    const binding = await buildStage01CorpusLockBinding(repositoryRoot);
    const mutations = [
      (value: typeof binding) => { value.normalizedManifest.suites[0]!.files[0]!.byteLength += 1; },
      (value: typeof binding) => {
        value.normalizedManifest.sha256 = "0".repeat(64) as typeof value.normalizedManifest.sha256;
      },
      (value: typeof binding) => { value.sourceLocks.baselineLockSha256 = "0".repeat(64) as typeof value.sourceLocks.baselineLockSha256; },
      (value: typeof binding) => { value.baseline.partitionLockSha256 = "0".repeat(64) as typeof value.baseline.partitionLockSha256; },
      (value: typeof binding) => {
        value.normalizedManifest.allowedCrossSuiteOverlaps[0].files[0]!.byteLength += 1;
      },
      (value: typeof binding) => {
        const source = value.normalizedManifest.suites[0]!.files[0]!;
        value.normalizedManifest.suites[1]!.files.push(structuredClone(source));
      },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(binding);
      mutate(value);
      expect(() => stage01CorpusLockBindingSchema.parse(value)).toThrow();
    }
  });
});
