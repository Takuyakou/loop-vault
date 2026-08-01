import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCanonicalLockEqual,
  baselineLockSchema,
  partitionLockSchema,
  inspectBuildArtifacts,
  trackedSafetyCounts,
} from "./lockContract";
import { verifyFrozenExternalSuites } from "./externalSuites";

function readJson(name: string) {
  return import("node:fs").then(({ readFileSync }) =>
    JSON.parse(readFileSync(resolve("docs/phase5.15", name), "utf8")));
}

describe("Phase 5.15 write-once strict locks", () => {
  it.each([
    ["partition", partitionLockSchema, "00-partition-lock.json"],
    ["baseline", baselineLockSchema, "00-baseline-lock.json"],
  ])("rejects extra, missing, and mutated %s keys", async (_label, schema, name) => {
    const lock = await readJson(name);
    expect(() => assertCanonicalLockEqual(lock, lock, schema, name)).not.toThrow();
    expect(() => assertCanonicalLockEqual(
      { ...lock, unexpected: true },
      lock,
      schema,
      name,
    )).toThrow(/schema mismatch/);
    const missing = structuredClone(lock) as Record<string, unknown>;
    delete missing.phase;
    expect(() => assertCanonicalLockEqual(missing, lock, schema, name))
      .toThrow(/schema mismatch/);
    const mutated = structuredClone(lock) as { phase: string };
    mutated.phase = "P5.15-01";
    expect(() => assertCanonicalLockEqual(mutated, lock, schema, name)).toThrow();
  });

  it("rejects nested partition membership, policy, and extra-key mutations", async () => {
    const lock = await readJson("00-partition-lock.json") as {
      development: string[];
      policy: Record<string, unknown>;
    };
    const membership = structuredClone(lock);
    membership.development.reverse();
    expect(() => assertCanonicalLockEqual(
      membership,
      lock,
      partitionLockSchema,
      "Partition",
    )).toThrow(/deep comparison/);
    const policy = structuredClone(lock);
    policy.policy.thresholdTuningAgainstHoldout = true;
    expect(() => assertCanonicalLockEqual(
      policy,
      lock,
      partitionLockSchema,
      "Partition",
    )).toThrow();
    const extra = structuredClone(lock);
    extra.policy.privateMemo = "should not exist";
    expect(() => assertCanonicalLockEqual(
      extra,
      lock,
      partitionLockSchema,
      "Partition",
    )).toThrow(/schema mismatch/);
  });

  it("rejects nested baseline fingerprint, product, and inventory mutations", async () => {
    const lock = await readJson("00-baseline-lock.json") as {
      sourceFingerprints: { evaluatorSelfSha256: string };
      product: { featureFlags: { implementedAtBaseline: boolean } };
      syntheticInventory: { cases: Array<{ byteLength: number }> };
      externalSuites: Array<{ contentSha256: string }>;
      buildArtifacts: { productName: string };
    };
    for (const mutate of [
      (value: typeof lock) => {
        value.sourceFingerprints.evaluatorSelfSha256 = "0".repeat(64);
      },
      (value: typeof lock) => {
        value.product.featureFlags.implementedAtBaseline = true;
      },
      (value: typeof lock) => {
        value.syntheticInventory.cases[0]!.byteLength += 1;
      },
      (value: typeof lock) => {
        value.externalSuites[0]!.contentSha256 = "0".repeat(64);
      },
      (value: typeof lock) => {
        value.buildArtifacts.productName += " changed";
      },
    ]) {
      const mutated = structuredClone(lock);
      mutate(mutated);
      expect(() => assertCanonicalLockEqual(
        mutated,
        lock,
        baselineLockSchema,
        "Baseline",
      )).toThrow();
    }
  });

  it("verifies present external suites and retains frozen hashes when absent", async () => {
    const lock = baselineLockSchema.parse(await readJson("00-baseline-lock.json"));
    const present = await verifyFrozenExternalSuites(resolve("."), lock.externalSuites);
    expect(present).toHaveLength(lock.externalSuites.length);
    expect(present.every((item) =>
      (item.status === "VERIFIED" && item.exists)
      || (item.status === "SKIPPED" && !item.exists))).toBe(true);
    expect(present.map((item) => item.frozenFingerprint))
      .toEqual(lock.externalSuites);

    const empty = await mkdtemp(resolve(tmpdir(), "loop-vault-empty-suites-"));
    try {
      const absent = await verifyFrozenExternalSuites(empty, lock.externalSuites);
      expect(absent.every((item) =>
        item.status === "SKIPPED"
        && !item.exists
        && item.frozenFingerprint.contentSha256.length === 64)).toBe(true);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  }, 20_000);

  it("derives artifact metadata and reports missing bundles as skipped", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "loop-vault-build-artifacts-"));
    await mkdir(resolve(root, "src-tauri"), { recursive: true });
    await writeFile(resolve(root, "src-tauri/tauri.conf.json"), JSON.stringify({
      productName: "Derived Product",
      version: "9.8.7",
    }));
    await writeFile(resolve(root, "package.json"), JSON.stringify({
      version: "9.8.7",
    }));
    try {
      const result = await inspectBuildArtifacts(root);
      expect(result).toMatchObject({
        productName: "Derived Product",
        version: "9.8.7",
        packageVersion: "9.8.7",
      });
      expect(result.current).toEqual([
        expect.objectContaining({ kind: "executable", exists: false, status: "SKIPPED" }),
        expect.objectContaining({ kind: "msi", exists: false, status: "SKIPPED" }),
        expect.objectContaining({ kind: "nsis", exists: false, status: "SKIPPED" }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when build discovery finds an extra artifact candidate", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "loop-vault-build-artifacts-"));
    await mkdir(resolve(root, "src-tauri/target/release"), { recursive: true });
    await writeFile(resolve(root, "src-tauri/tauri.conf.json"), JSON.stringify({
      productName: "Derived Product",
      version: "9.8.7",
    }));
    await writeFile(resolve(root, "package.json"), JSON.stringify({
      version: "9.8.7",
    }));
    await writeFile(resolve(root, "src-tauri/target/release/one.exe"), "one");
    await writeFile(resolve(root, "src-tauri/target/release/two.exe"), "two");
    try {
      await expect(inspectBuildArtifacts(root))
        .rejects.toThrow(/multiple executable candidates/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("counts tracked safety policy from all NUL-decoded paths case-insensitively", () => {
    expect(trackedSafetyCounts([
      "src/app.ts",
      "fixtures/UPPER.MID",
      "fixtures/lower.midi",
      ".LOCAL-EVALUATION/input.json",
      "src-tauri/target-next/release/app.exe",
      "playwright-report/index.html",
      "artifacts/phase5/report.json",
      "src-tauri/gen/schemas.json",
    ])).toEqual({
      trackedMidi: 2,
      trackedLocalEvaluation: 1,
      trackedBuildArtifacts: 3,
      trackedReviewedArtifactFiles: 1,
    });
  });
});
