import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  STAGE01_LOW_LEVEL_CHECKPOINT_MANIFEST,
  writeStage01Artifact,
  recoverStage01ArtifactTransaction,
  type Stage01ArtifactName,
  type Stage01LowLevelOperation,
} from "./stage01ArtifactWriter";

const roots: string[] = [];
let bundledWriterPath = "";
let bundledWriterRoot = "";

beforeAll(async () => {
  bundledWriterRoot = await mkdtemp(resolve(tmpdir(), "p515-stage01-writer-bundle-"));
  bundledWriterPath = resolve(bundledWriterRoot, "stage01ArtifactWriter.mjs");
  await build({
    entryPoints: [resolve(import.meta.dirname, "stage01ArtifactWriter.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    outfile: bundledWriterPath,
    logLevel: "silent",
  });
});

afterAll(async () => {
  if (bundledWriterRoot) await rm(bundledWriterRoot, { recursive: true, force: true });
});

async function repository(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "p515-stage01-writer-"));
  roots.push(root);
  await mkdir(resolve(root, "docs/phase5.15"), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function writeStaleAbsentTransaction(
  outputRoot: string,
  expectedPayload: string,
  temporaryPayload: string,
) {
  const operationId = "01234567-89ab-4def-8123-456789abcdef";
  const name = "01-evidence-dedup-report.md" as const;
  const temporaryName = `.p515-stage01-txn-${operationId}.new-${name}`;
  const backupName = `.p515-stage01-txn-${operationId}.old-${name}`;
  const temporary = resolve(outputRoot, temporaryName);
  await writeFile(temporary, temporaryPayload, "utf8");
  const info = await stat(temporary);
  const temporaryEvidence = {
    sha256: createHash("sha256").update(temporaryPayload).digest("hex"),
    dev: String(info.dev),
    ino: String(info.ino),
  };
  await writeFile(resolve(outputRoot, ".p515-stage01-artifact.journal.json"), `${JSON.stringify({
    schemaVersion: 2,
    operationId,
    name,
    intent: "commit",
    phase: "temp-synced",
    targetName: name,
    temporaryName,
    backupName,
    payloadSha256: createHash("sha256").update(expectedPayload).digest("hex"),
    original: { state: "absent" },
    temporaryEvidence,
    durabilityContract: "PROCESS_CRASH_RECOVERABLE",
    directorySyncEvidence: "UNSUPPORTED_BY_NODE_PLATFORM",
  })}\n`, "utf8");
  return { temporaryName };
}

async function writeCrashRunner(root: string): Promise<string> {
  const runner = resolve(root, "stage01-crash-runner.ts");
  const writerUrl = pathToFileURL(bundledWriterPath).href;
  await writeFile(runner, `
import { writeStage01Artifact, recoverStage01ArtifactTransaction } from ${JSON.stringify(writerUrl)};
const [action, root, phase, checkpointId, side] = process.argv.slice(2);
const isTarget = (checkpoint) => checkpoint.id === checkpointId
  || checkpoint.operation === checkpointId;
const inducedFsyncSite = checkpointId?.includes(".temp-unlink#")
  ? checkpointId.split("#")[0].replace(/[.]temp-unlink$/, ".temp-fsync") : null;
const crashHooks = {
  beforeOperation(current) { if (side === "before" && isTarget(current)) process.exit(91); },
  afterOperation(current) {
    if (side === "after" && isTarget(current)) process.exit(91);
    if (inducedFsyncSite && current.siteId === inducedFsyncSite) throw new Error("induce journal-temp cleanup");
  },
};
if (action === "recover-twice") {
  await recoverStage01ArtifactTransaction(root);
  await recoverStage01ArtifactTransaction(root);
} else if (action === "recover-hook-crash") {
  await recoverStage01ArtifactTransaction(root, crashHooks);
} else if (action === "operation-crash") {
  await writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\\n", crashHooks);
} else if (action === "rollback-operation-crash") {
  let rollingBack = false;
  const rollbackHooks = {
    beforeOperation(current) {
      if (rollingBack && side === "before" && isTarget(current)) process.exit(91);
    },
    afterOperation(current) {
      if (rollingBack && side === "after" && isTarget(current)) process.exit(91);
      if (rollingBack && inducedFsyncSite && current.siteId === inducedFsyncSite) {
        throw new Error("induce journal-temp cleanup");
      }
    },
    afterAtomicPromotion() { rollingBack = true; throw new Error("request rollback"); },
  };
  await writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\\n", rollbackHooks);
} else if (action === "rollback-early-operation-crash") {
  let rollingBack = false;
  await writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\\n", {
    beforeOperation(current) {
      if (rollingBack && side === "before" && isTarget(current)) process.exit(91);
    },
    afterOperation(current) {
      if (rollingBack && side === "after" && isTarget(current)) process.exit(91);
      if (rollingBack && inducedFsyncSite && current.siteId === inducedFsyncSite) {
        throw new Error("induce journal-temp cleanup");
      }
    },
    afterPhase(current) {
      if (current === "original-backed-up-or-absent") {
        rollingBack = true;
        throw new Error("request early rollback");
      }
    },
  });
} else if (action === "rollback-requested-crash") {
  await writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\\n", {
    afterAtomicPromotion() { throw new Error("request rollback"); },
    afterPhase(current) { if (current === "rollback-requested") process.exit(91); },
  });
} else if (action === "unsupported-dir-crash") {
  let injected = false;
  await writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\\n", {
    beforeOperation(current) {
      if (!injected && current.operation === "directory-fsync") {
        injected = true;
        const error = new Error("simulated unsupported directory fsync");
        error.code = "EINVAL";
        throw error;
      }
    },
    afterPhase(current) { if (current === "prepared") process.exit(91); },
  });
} else if (action === "rollback-crash") {
  await writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\\n", {
    afterAtomicPromotion() { throw new Error("request rollback"); },
    afterPhase(current) { if (current === "rollback-complete") process.exit(91); },
  });
} else {
  await writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\\n", {
    afterPhase(current) { if (current === phase) process.exit(91); },
  });
}
`, "utf8");
  return runner;
}

function runCrashRunner(runner: string, args: readonly string[]) {
  // Failure hypothesis/result: killing a vite-node runner left its esbuild
  // descendant holding inherited pipes. The bundled direct Node child has no
  // transport descendant; bounded spawn return is part of this assertion.
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
    windowsHide: true,
    timeout: 5_000,
  });
}

const COMMIT_OPERATIONS: readonly Stage01LowLevelOperation[] = [
  "backup-link", "target-promote-rename", "file-unlink", "file-fsync",
  "journal-write", "journal-fsync", "journal-replace", "directory-fsync",
];
const ROLLBACK_OPERATIONS = {
  present: [
    "rollback-restore-rename", "file-unlink", "file-fsync",
    "journal-write", "journal-fsync", "journal-replace", "directory-fsync",
  ],
  absent: [
    "file-unlink", "journal-write", "journal-fsync", "journal-replace", "directory-fsync",
  ],
} as const satisfies Record<"present" | "absent", readonly Stage01LowLevelOperation[]>;

describe("Stage 01 safe artifact writer", () => {
  it.each([
    "prepared", "temp-written", "temp-synced", "original-backed-up-or-absent",
    "target-promoted", "target-synced", "commit-complete", "cleanup-complete",
  ] as const)("recovers twice in another process after a %s process crash", async (phase) => {
    for (const original of ["present", "absent"] as const) {
      const root = await repository();
      const outputRoot = resolve(root, "docs/phase5.15");
      const target = resolve(outputRoot, "01-evidence-dedup-report.md");
      if (original === "present") await writeFile(target, "old\n", "utf8");
      const runner = await writeCrashRunner(root);
      const crashed = runCrashRunner(runner, ["write", root, phase]);
      expect(crashed.status).toBe(91);
      const recovered = runCrashRunner(runner, ["recover-twice", root]);
      expect({ status: recovered.status, stderr: recovered.stderr }).toEqual({ status: 0, stderr: "" });
      const expectsCommit = phase !== "prepared";
      if (expectsCommit) {
        expect(await readFile(target, "utf8")).toBe("new\n");
      } else if (original === "present") {
        expect(await readFile(target, "utf8")).toBe("old\n");
      } else {
        await expect(readFile(target, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      }
      expect((await readdir(outputRoot)).filter((entry) => entry.startsWith(".p515-stage01")
        || entry === ".p515-report-refresh.lock")).toEqual([]);
    }
  }, 40_000);

  it("recovers rollback-complete twice and rejects contradictory terminal outcomes", async () => {
    for (const original of ["present", "absent"] as const) {
      const root = await repository();
      const outputRoot = resolve(root, "docs/phase5.15");
      const target = resolve(outputRoot, "01-evidence-dedup-report.md");
      if (original === "present") await writeFile(target, "old\n", "utf8");
      const runner = await writeCrashRunner(root);
      expect(runCrashRunner(runner, ["rollback-crash", root]).status).toBe(91);
      const recovered = runCrashRunner(runner, ["recover-twice", root]);
      expect(recovered.status).toBe(0);
      if (original === "present") expect(await readFile(target, "utf8")).toBe("old\n");
      else await expect(readFile(target, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      const contradictedRoot = await repository();
      const contradictedOutput = resolve(contradictedRoot, "docs/phase5.15");
      const contradictedTarget = resolve(contradictedOutput, "01-evidence-dedup-report.md");
      if (original === "present") await writeFile(contradictedTarget, "old\n", "utf8");
      const contradictedRunner = await writeCrashRunner(contradictedRoot);
      expect(runCrashRunner(contradictedRunner, ["rollback-crash", contradictedRoot]).status).toBe(91);
      await writeFile(contradictedTarget, "unknown\n", "utf8");
      const rejected = runCrashRunner(contradictedRunner, ["recover-twice", contradictedRoot]);
      expect(rejected.status).not.toBe(0);
      await expect(readFile(resolve(contradictedOutput, ".p515-stage01-artifact.journal.json"), "utf8"))
        .resolves.toContain('"phase":"rollback-complete"');
      expect(await readFile(contradictedTarget, "utf8")).toBe("unknown\n");
    }
  }, 40_000);

  it("fails closed without deleting contradictory cleanup-complete evidence", async () => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const runner = await writeCrashRunner(root);
    expect(runCrashRunner(runner, ["write", root, "cleanup-complete"]).status).toBe(91);
    const journalPath = resolve(outputRoot, ".p515-stage01-artifact.journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as { temporaryName: string };
    const contradictoryHelper = resolve(outputRoot, journal.temporaryName);
    await writeFile(contradictoryHelper, "unknown\n", "utf8");
    const rejected = runCrashRunner(runner, ["recover-twice", root]);
    expect(rejected.status).not.toBe(0);
    await expect(readFile(journalPath, "utf8")).resolves.toContain('"phase":"cleanup-complete"');
    expect(await readFile(contradictoryHelper, "utf8")).toBe("unknown\n");
  }, 20_000);

  it("retains a commit-complete journal whose required original backup is missing", async () => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const target = resolve(outputRoot, "01-evidence-dedup-report.md");
    await writeFile(target, "old\n", "utf8");
    const runner = await writeCrashRunner(root);
    expect(runCrashRunner(runner, ["write", root, "commit-complete"]).status).toBe(91);
    const journalPath = resolve(outputRoot, ".p515-stage01-artifact.journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as { backupName: string };
    await rm(resolve(outputRoot, journal.backupName));
    const rejected = runCrashRunner(runner, ["recover-twice", root]);
    expect(rejected.status).not.toBe(0);
    await expect(readFile(journalPath, "utf8")).resolves.toContain('"phase":"commit-complete"');
    expect(await readFile(target, "utf8")).toBe("new\n");
  }, 20_000);

  it("recovers every before/after low-level commit crash point with exact atomic evidence", async () => {
    for (const original of ["present", "absent"] as const) {
      for (const operation of COMMIT_OPERATIONS) {
        if (operation === "backup-link" && original === "absent") continue;
        for (const side of ["before", "after"] as const) {
          const root = await repository();
          const outputRoot = resolve(root, "docs/phase5.15");
          const target = resolve(outputRoot, "01-evidence-dedup-report.md");
          if (original === "present") await writeFile(target, "old\n", "utf8");
          const runner = await writeCrashRunner(root);
          const crashed = runCrashRunner(runner, ["operation-crash", root, "", operation, side]);
          expect({ operation, side, original, status: crashed.status })
            .toMatchObject({ status: 91 });
          const recovered = runCrashRunner(runner, ["recover-twice", root]);
          expect({ operation, side, original, status: recovered.status, stderr: recovered.stderr })
            .toMatchObject({ status: 0, stderr: "" });
          const content = await readFile(target, "utf8").catch((cause: NodeJS.ErrnoException) => {
            if (cause.code === "ENOENT") return "absent";
            throw cause;
          });
          expect(original === "present" ? ["old\n", "new\n"] : ["absent", "new\n"])
            .toContain(content);
          expect((await readdir(outputRoot)).filter((entry) => entry.startsWith(".p515-stage01")
            || entry === ".p515-report-refresh.lock")).toEqual([]);
        }
      }
    }
  }, 180_000);

  it("recovers every before/after low-level rollback crash point for present and absent originals", async () => {
    for (const original of ["present", "absent"] as const) {
      for (const operation of ROLLBACK_OPERATIONS[original]) {
        for (const side of ["before", "after"] as const) {
          const root = await repository();
          const outputRoot = resolve(root, "docs/phase5.15");
          const target = resolve(outputRoot, "01-evidence-dedup-report.md");
          if (original === "present") await writeFile(target, "old\n", "utf8");
          const runner = await writeCrashRunner(root);
          const crashed = runCrashRunner(runner, ["rollback-operation-crash", root, "", operation, side]);
          expect({ operation, side, original, status: crashed.status })
            .toMatchObject({ status: 91 });
          const recovered = runCrashRunner(runner, ["recover-twice", root]);
          expect({ operation, side, original, status: recovered.status, stderr: recovered.stderr })
            .toMatchObject({ status: 0, stderr: "" });
          const rollbackRequestWasDurable = operation === "journal-replace" ? side === "after"
            : operation !== "journal-write" && operation !== "journal-fsync";
          if (!rollbackRequestWasDurable) {
            expect(await readFile(target, "utf8")).toBe("new\n");
          } else if (original === "present") {
            expect(await readFile(target, "utf8")).toBe("old\n");
          } else {
            await expect(readFile(target, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
          }
          expect((await readdir(outputRoot)).filter((entry) => entry.startsWith(".p515-stage01")
            || entry === ".p515-report-refresh.lock")).toEqual([]);
        }
      }
    }
  }, 180_000);

  it("recrashes recovery at every applicable before/after operation and remains reentrant", async () => {
    for (const original of ["present", "absent"] as const) {
      const operations = COMMIT_OPERATIONS.filter((operation) => operation !== "backup-link" || original === "present");
      for (const operation of operations) {
        for (const side of ["before", "after"] as const) {
          const root = await repository();
          const outputRoot = resolve(root, "docs/phase5.15");
          const target = resolve(outputRoot, "01-evidence-dedup-report.md");
          if (original === "present") await writeFile(target, "old\n", "utf8");
          const runner = await writeCrashRunner(root);
          expect(runCrashRunner(runner, ["write", root, "temp-synced"]).status).toBe(91);
          const recrashed = runCrashRunner(runner, ["recover-hook-crash", root, "", operation, side]);
          expect({ operation, side, original, status: recrashed.status })
            .toMatchObject({ status: 91 });
          const recovered = runCrashRunner(runner, ["recover-twice", root]);
          expect({ operation, side, original, status: recovered.status, stderr: recovered.stderr })
            .toMatchObject({ status: 0, stderr: "" });
          expect(await readFile(target, "utf8")).toBe("new\n");
          expect((await readdir(outputRoot)).filter((entry) => entry.startsWith(".p515-stage01")
            || entry === ".p515-report-refresh.lock")).toEqual([]);
        }
      }
    }
  }, 180_000);

  it("kills before and after every exact manifested checkpoint and recovers twice", async () => {
    const manifestSiteIds = STAGE01_LOW_LEVEL_CHECKPOINT_MANIFEST.map((item) => item.siteId);
    expect(new Set(manifestSiteIds).size).toBe(manifestSiteIds.length);
    const reached = new Set<string>();
    for (const definition of STAGE01_LOW_LEVEL_CHECKPOINT_MANIFEST) {
      for (const side of ["before", "after"] as const) {
        const root = await repository();
        const outputRoot = resolve(root, "docs/phase5.15");
        const target = resolve(outputRoot, "01-evidence-dedup-report.md");
        const checkpointId = `${definition.siteId}#1`;
        const requiresAbsentOriginal = definition.siteId.startsWith("rollback.remove-target");
        if (!requiresAbsentOriginal) await writeFile(target, "old\n", "utf8");
        const runner = await writeCrashRunner(root);
        let crashed;
        if (definition.siteId.startsWith("recovery.prepare.")) {
          const phase = definition.siteId.includes("temporary.file-fsync") ? "temp-written" : "temp-synced";
          expect(runCrashRunner(runner, ["write", root, phase]).status).toBe(91);
          crashed = runCrashRunner(runner, ["recover-hook-crash", root, "", checkpointId, side]);
        } else if (definition.siteId.startsWith("recovery.orphan.")) {
          const operationId = "12345678-1234-4abc-8123-123456789abc";
          const orphanName = definition.pathRole === "backup"
            ? `.p515-stage01-txn-${operationId}.old-01-evidence-dedup-report.md`
            : definition.pathRole === "temporary"
              ? `.p515-stage01-txn-${operationId}.new-01-evidence-dedup-report.md`
              : `.p515-stage01-journal-${operationId}.tmp`;
          await writeFile(resolve(outputRoot, orphanName), "orphan\n", "utf8");
          crashed = runCrashRunner(runner, ["recover-hook-crash", root, "", checkpointId, side]);
        } else if (definition.siteId.startsWith("rollback.restore-absent")) {
          expect(runCrashRunner(runner, ["rollback-requested-crash", root]).status).toBe(91);
          await rm(target);
          crashed = runCrashRunner(runner, ["recover-hook-crash", root, "", checkpointId, side]);
        } else {
          const earlyRollback = definition.siteId === "cleanup.rollback.temporary.unlink"
            || definition.siteId === "cleanup.rollback.backup.unlink";
          const rollback = definition.context.startsWith("rollback")
            || definition.context === "rollback-journal";
          const action = earlyRollback ? "rollback-early-operation-crash"
            : rollback ? "rollback-operation-crash" : "operation-crash";
          crashed = runCrashRunner(runner, [action, root, "", checkpointId, side]);
        }
        expect({
          checkpointId,
          side,
          status: crashed.status,
          signal: crashed.signal,
          stderr: crashed.stderr,
        }).toMatchObject({ status: 91, signal: null });
        reached.add(definition.siteId);
        const recovered = runCrashRunner(runner, ["recover-twice", root]);
        expect({ checkpointId, side, status: recovered.status, stderr: recovered.stderr })
          .toMatchObject({ status: 0, stderr: "" });
        expect((await readdir(outputRoot)).filter((entry) => entry.startsWith(".p515-stage01")
          || entry === ".p515-report-refresh.lock")).toEqual([]);
      }
    }
    expect([...reached].sort()).toEqual([...manifestSiteIds].sort());
  }, 240_000);

  it("assigns unique occurrence suffixes when one manifested orphan site repeats", async () => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const operationIds = [
      "12345678-1234-4abc-8123-123456789abc",
      "22345678-1234-4abc-8123-123456789abc",
    ];
    for (const operationId of operationIds) {
      await writeFile(
        resolve(outputRoot, `.p515-stage01-txn-${operationId}.new-01-evidence-dedup-report.md`),
        "orphan\n",
        "utf8",
      );
    }
    const observed: string[] = [];
    await recoverStage01ArtifactTransaction(root, {
      beforeOperation(checkpoint) {
        if (checkpoint.siteId === "recovery.orphan.temporary.unlink") observed.push(checkpoint.id);
      },
    });
    expect(observed).toEqual([
      "recovery.orphan.temporary.unlink#1",
      "recovery.orphan.temporary.unlink#2",
    ]);
    expect((await readdir(outputRoot)).filter((entry) => entry.startsWith(".p515-stage01")))
      .toEqual([]);
  });

  it("records unsupported directory sync honestly and recovers the prepared journal", async () => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const runner = await writeCrashRunner(root);
    const crashed = runCrashRunner(runner, ["unsupported-dir-crash", root]);
    expect(crashed.status).toBe(91);
    const journalPath = resolve(outputRoot, ".p515-stage01-artifact.journal.json");
    await expect(readFile(journalPath, "utf8"))
      .resolves.toContain('"directorySyncEvidence":"UNSUPPORTED_BY_NODE_PLATFORM"');
    expect(runCrashRunner(runner, ["recover-twice", root]).status).toBe(0);
    expect((await readdir(outputRoot)).filter((entry) => entry.startsWith(".p515-stage01")))
      .toEqual([]);
  }, 20_000);

  it("recovers after a simulated sharing violation without corrupting the original", async () => {
    const root = await repository();
    const target = resolve(root, "docs/phase5.15/01-evidence-dedup-report.md");
    await writeFile(target, "old\n", "utf8");
    let injected = false;
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      beforeOperation(checkpoint) {
        if (!injected && checkpoint.operation === "target-promote-rename") {
          injected = true;
          throw Object.assign(new Error("simulated sharing violation"), { code: "EBUSY" });
        }
      },
    })).rejects.toThrow("simulated sharing violation");
    expect(await readFile(target, "utf8")).toBe("old\n");
    expect((await readdir(resolve(root, "docs/phase5.15")))
      .filter((entry) => entry.startsWith(".p515-stage01"))).toEqual([]);
  });

  it("writes fixed UTF-8 text through a flushed temporary and atomic rename", async () => {
    const root = await repository();
    await writeStage01Artifact(root, "01-evidence-dedup-report.md", "# report\n");
    expect(await readFile(resolve(root, "docs/phase5.15/01-evidence-dedup-report.md"), "utf8"))
      .toBe("# report\n");
  });

  it.each([
    "prepared",
    "temp-written",
    "temp-synced",
    "original-backed-up-or-absent",
    "target-promoted",
    "target-synced",
  ] as const)("rolls back exact old evidence after a %s phase fault", async (faultPhase) => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const target = resolve(outputRoot, "01-evidence-dedup-report.md");
    await writeFile(target, "old\n", "utf8");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      afterPhase: (phase) => { if (phase === faultPhase) throw new Error(`fault:${phase}`); },
    })).rejects.toThrow(`fault:${faultPhase}`);
    expect(await readFile(target, "utf8")).toBe("old\n");
    expect((await readdir(outputRoot)).filter((entry) => entry.startsWith(".p515-stage01")))
      .toEqual([]);
  });

  it.each([
    "prepared",
    "temp-written",
    "temp-synced",
    "original-backed-up-or-absent",
    "target-promoted",
    "target-synced",
  ] as const)("restores exact absence after a %s phase fault", async (faultPhase) => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const target = resolve(outputRoot, "01-evidence-dedup-report.md");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      afterPhase: (phase) => { if (phase === faultPhase) throw new Error(`fault:${phase}`); },
    })).rejects.toThrow(`fault:${faultPhase}`);
    await expect(readFile(target, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(outputRoot)).filter((entry) => entry.startsWith(".p515-stage01")))
      .toEqual([]);
  });

  it("resumes a stale commit with a valid synced temporary", async () => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    await writeStaleAbsentTransaction(outputRoot, "new\n", "new\n");
    const capability = await recoverStage01ArtifactTransaction(root);
    expect(capability).toEqual({
      contract: "PROCESS_CRASH_RECOVERABLE",
      powerLossDurabilityGuaranteed: false,
    });
    expect(await readFile(resolve(outputRoot, "01-evidence-dedup-report.md"), "utf8"))
      .toBe("new\n");
    expect((await readdir(outputRoot)).filter((entry) => entry.startsWith(".p515-stage01")))
      .toEqual([]);
  });

  it("fails closed and retains evidence for an invalid stale temporary", async () => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const { temporaryName } = await writeStaleAbsentTransaction(outputRoot, "expected\n", "tampered\n");
    await expect(recoverStage01ArtifactTransaction(root)).rejects.toThrow(/invalid temporary evidence/u);
    expect(await readFile(resolve(outputRoot, temporaryName), "utf8")).toBe("tampered\n");
    await expect(readFile(resolve(outputRoot, ".p515-stage01-artifact.journal.json"), "utf8"))
      .resolves.toContain('"intent":"commit"');
  });

  it("rejects commit intent with rollback-complete phase before accepting an unknown target", async () => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const target = resolve(outputRoot, "01-evidence-dedup-report.md");
    await writeStaleAbsentTransaction(outputRoot, "new\n", "new\n");
    const journalPath = resolve(outputRoot, ".p515-stage01-artifact.journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as { phase: string };
    journal.phase = "rollback-complete";
    await writeFile(journalPath, `${JSON.stringify(journal)}\n`, "utf8");
    await writeFile(target, "unknown\n", "utf8");
    await expect(recoverStage01ArtifactTransaction(root)).rejects.toThrow(/invalid .*journal/iu);
    expect(await readFile(target, "utf8")).toBe("unknown\n");
    await expect(readFile(journalPath, "utf8")).resolves.toContain('"intent":"commit"');
  });

  it("treats a durable commit-complete interruption as committed on recovery", async () => {
    const root = await repository();
    const target = resolve(root, "docs/phase5.15/01-evidence-dedup-report.md");
    await writeFile(target, "old\n", "utf8");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      afterPhase: (phase) => { if (phase === "commit-complete") throw new Error("commit crash"); },
    })).rejects.toThrow("commit crash");
    expect(await readFile(target, "utf8")).toBe("new\n");
    await writeStage01Artifact(root, "01-evidence-dedup-report.md", "after-recovery\n");
    expect(await readFile(target, "utf8")).toBe("after-recovery\n");
  });

  it("preserves the old report when writing fails after temporary sync", async () => {
    const root = await repository();
    const target = resolve(root, "docs/phase5.15/01-evidence-dedup-report.md");
    await writeFile(target, "old\n", "utf8");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      afterTemporarySync: () => { throw new Error("injected failure"); },
    })).rejects.toThrow("injected failure");
    expect(await readFile(target, "utf8")).toBe("old\n");
  });

  it("rejects a concurrent writer before it creates a report", async () => {
    const root = await repository();
    let release!: () => void;
    const held = new Promise<void>((resolvePromise) => { release = resolvePromise; });
    let entered!: () => void;
    const ready = new Promise<void>((resolvePromise) => { entered = resolvePromise; });
    const first = writeStage01Artifact(root, "01-evidence-dedup-report.md", "first\n", {
      whileLocked: () => { entered(); return held; },
    });
    await ready;
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "second\n"))
      .rejects.toThrow(/already in progress|already active/u);
    release();
    await first;
  });

  it("rejects traversal and privacy-sensitive text", async () => {
    const root = await repository();
    await expect(writeStage01Artifact(
      root,
      "../report.md" as Stage01ArtifactName,
      "safe\n",
    )).rejects.toThrow("allowlisted");
    await expect(writeStage01Artifact(
      root,
      "01-evidence-dedup-report.md",
      "C:\\Users\\someone\\private.mid\n",
    )).rejects.toThrow("privacy");
  });

  it("rejects a symlinked report directory", async () => {
    const root = await repository();
    const outside = await mkdtemp(resolve(tmpdir(), "p515-stage01-outside-"));
    roots.push(outside);
    await rm(resolve(root, "docs/phase5.15"), { recursive: true });
    await symlink(outside, resolve(root, "docs/phase5.15"), "junction");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "safe\n"))
      .rejects.toThrow(/symlink|junction|outside/u);
  });

  it("keeps the old target present when promotion is interrupted", async () => {
    const root = await repository();
    const target = resolve(root, "docs/phase5.15/01-evidence-dedup-report.md");
    await writeFile(target, "old\n", "utf8");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      beforePromotion: async () => {
        expect(await readFile(target, "utf8")).toBe("old\n");
        throw new Error("promotion failure");
      },
    })).rejects.toThrow("promotion failure");
    expect(await readFile(target, "utf8")).toBe("old\n");
    expect((await readdir(resolve(root, "docs/phase5.15")))
      .filter((name) => name.includes("stage01-txn") || name.includes("stage01-artifact.journal")))
      .toEqual([]);
  });

  it("does not take a concurrently replaced target and preserves the old backup", async () => {
    const root = await repository();
    const target = resolve(root, "docs/phase5.15/01-evidence-dedup-report.md");
    await writeFile(target, "old\n", "utf8");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      beforePromotion: async () => {
        await rm(target);
        await writeFile(target, "concurrent\n", "utf8");
      },
    })).rejects.toThrow(/exact recovery|changed before promotion|evidence mismatch/u);
    expect(await readFile(target, "utf8")).toBe("concurrent\n");
    const helpers = await readdir(resolve(root, "docs/phase5.15"));
    expect(helpers.some((name) => name.includes(".old-01-evidence-dedup-report.md")))
      .toBe(true);
  });

  it("detects a swapped backup before atomic promotion and keeps the old target", async () => {
    const root = await repository();
    const target = resolve(root, "docs/phase5.15/01-evidence-dedup-report.md");
    await writeFile(target, "old\n", "utf8");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      beforePromotion: async (backup) => {
        expect(backup).not.toBeNull();
        await rm(backup!);
        await writeFile(backup!, "swapped\n", "utf8");
      },
    })).rejects.toThrow(/exact recovery|backup/u);
    expect(await readFile(target, "utf8")).toBe("old\n");
  });

  it("rolls back the exact old target when a post-promotion hook throws", async () => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const target = resolve(outputRoot, "01-evidence-dedup-report.md");
    await writeFile(target, "old\n", "utf8");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      afterAtomicPromotion: async () => {
        const journalPath = resolve(outputRoot, ".p515-stage01-artifact.journal.json");
        const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
          phase: string; backupName: string;
        };
        journal.phase = "original-backed-up-or-absent";
        await writeFile(journalPath, `${JSON.stringify(journal)}\n`, "utf8");
        throw new Error("simulated kill");
      },
    })).rejects.toThrow("simulated kill");
    expect(await readFile(target, "utf8")).toBe("old\n");
    expect((await readdir(outputRoot)).filter((name) => name.startsWith(".p515-stage01")))
      .toEqual([]);
  });

  it("restores an absent target when a post-promotion hook throws", async () => {
    const root = await repository();
    const target = resolve(root, "docs/phase5.15/01-evidence-dedup-report.md");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      afterAtomicPromotion: () => { throw new Error("post-promotion failure"); },
    })).rejects.toThrow("post-promotion failure");
    await expect(readFile(target, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recovers absent rollback after interruption between unlink and phase persistence", async () => {
    // Fault hypothesis: rollback unlink can succeed while the following journal
    // update is lost. Result: durable rollback-requested makes missing idempotent.
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const target = resolve(outputRoot, "01-evidence-dedup-report.md");
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "new\n", {
      afterAtomicPromotion: () => { throw new Error("caller failed"); },
      afterRollbackMutation: () => { throw new Error("simulated rollback kill"); },
    })).rejects.toThrow(/exact recovery/u);
    await expect(readFile(target, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(resolve(outputRoot, ".p515-stage01-artifact.journal.json"), "utf8"))
      .toContain('"phase":"rollback-requested"');

    await writeStage01Artifact(root, "01-evidence-dedup-report.md", "recovered\n");
    expect(await readFile(target, "utf8")).toBe("recovered\n");
    await writeStage01Artifact(root, "01-evidence-dedup-report.md", "second-recovery\n");
    expect(await readFile(target, "utf8")).toBe("second-recovery\n");
  });

  it("removes pre-journal and replace-journal temporary orphans", async () => {
    const root = await repository();
    const outputRoot = resolve(root, "docs/phase5.15");
    const id = "01234567-89ab-4def-8123-456789abcdef";
    await writeFile(resolve(outputRoot, `.p515-stage01-txn-${id}.new-01-evidence-dedup-report.md`), "orphan\n");
    await writeFile(resolve(outputRoot, `.p515-stage01-journal-${id}.tmp`), "orphan\n");
    await writeStage01Artifact(root, "01-evidence-dedup-report.md", "safe\n");
    expect((await readdir(outputRoot)).filter((name) => name.includes(id))).toEqual([]);
  });

  it("reclaims the shared writer's stale operation lock", async () => {
    const root = await repository();
    await writeFile(
      resolve(root, "docs/phase5.15/.p515-report-refresh.lock"),
      `${JSON.stringify({ schemaVersion: 1, pid: 2147483647, nonce: "01234567-89ab-cdef-0123-456789abcdef" })}\n`,
      "utf8",
    );
    await expect(writeStage01Artifact(root, "01-evidence-dedup-report.md", "safe\n"))
      .resolves.toBeUndefined();
    expect(await readFile(resolve(root, "docs/phase5.15/01-evidence-dedup-report.md"), "utf8"))
      .toBe("safe\n");
  });
});
