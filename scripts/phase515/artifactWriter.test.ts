import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PHASE515_REPORT_NAMES,
  assertSafePhase515ReportRoot,
  promotePrivacySafeReports,
  recoverPhase515ReportTransaction,
  renderPrivacySafeJson,
  validateBaselineWriteMode,
  writeReviewedLockCandidate,
} from "./artifactWriter";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function makeRepository() {
  const root = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-writer-"));
  temporaryRoots.push(root);
  const outputRoot = resolve(root, "docs/phase5.15");
  await mkdir(outputRoot, { recursive: true });
  return { root, outputRoot };
}

function reports(value: unknown = { status: "PASS" }) {
  return Object.fromEntries(PHASE515_REPORT_NAMES.map((name) => [name, value]));
}

describe("P5.15 artifact writer", () => {
  it("keeps report refresh and candidate output mutually exclusive", () => {
    expect(() => validateBaselineWriteMode({
      refreshReports: false,
      emitReviewedLockCandidate: true,
    })).not.toThrow();
    expect(() => validateBaselineWriteMode({
      refreshReports: true,
      emitReviewedLockCandidate: true,
    })).toThrow(/mutually exclusive/);
  });

  it("scans source, parsed JSON, and raw JSON before any write", () => {
    expect(() => renderPrivacySafeJson("candidate.json", {
      nested: { sourcePath: "relative.mid" },
    })).toThrow(/privacy scan failed/);
    expect(() => renderPrivacySafeJson("candidate.json", {
      detail: "C:\\Users\\person\\private.mid",
    })).toThrow(/privacy scan failed/);
  });

  it("promotes an exclusive candidate once and never overwrites it", async () => {
    const { root } = await makeRepository();
    const target = resolve(root, "p515-baseline-lock.reviewed-candidate.json");
    await writeReviewedLockCandidate(root, target, { revision: 1 });
    await expect(writeReviewedLockCandidate(root, target, { revision: 2 }))
      .rejects.toThrow(/already exists/);
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({ revision: 1 });
  });

  it("rejects a junction candidate target", async () => {
    const { root } = await makeRepository();
    const target = resolve(root, "p515-baseline-lock.reviewed-candidate.json");
    const outside = resolve(root, "candidate-outside");
    await mkdir(outside);
    await symlink(outside, target, "junction");
    await expect(writeReviewedLockCandidate(root, target, { revision: 1 }))
      .rejects.toThrow(/already exists/);
    expect((await lstat(target)).isSymbolicLink()).toBe(true);
  });

  it("candidate privacy failure changes neither reports nor candidate", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    const target = resolve(root, "p515-baseline-lock.reviewed-candidate.json");
    await expect(writeReviewedLockCandidate(root, target, {
      memo: "private",
    })).rejects.toThrow(/privacy scan failed/);
    await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
    for (const name of PHASE515_REPORT_NAMES) {
      expect(await readFile(resolve(outputRoot, name), "utf8"))
        .toBe("{\"revision\":1}\n");
    }
  });

  it("rejects an output-root junction and report-file symlink", async () => {
    const { root, outputRoot } = await makeRepository();
    const outside = resolve(root, "outside");
    await mkdir(outside);
    await rm(outputRoot, { recursive: true });
    await symlink(outside, outputRoot, "junction");
    await expect(assertSafePhase515ReportRoot(root, outputRoot))
      .rejects.toThrow(/symlink or junction/);

    await rm(outputRoot);
    await mkdir(outputRoot);
    const target = resolve(outputRoot, PHASE515_REPORT_NAMES[0]);
    const marker = resolve(outside, "marker.json");
    await writeFile(marker, "{\"safe\":true}\n");
    await symlink(outside, target, "junction");
    await expect(promotePrivacySafeReports(root, outputRoot, reports()))
      .rejects.toThrow(/existing regular file/);
    expect(await readFile(marker, "utf8")).toBe("{\"safe\":true}\n");
  });

  it("rejects a repository root which is itself a junction", async () => {
    const realRoot = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-real-"));
    temporaryRoots.push(realRoot);
    const linkedRoot = `${realRoot}-junction`;
    await mkdir(resolve(realRoot, "docs/phase5.15"), { recursive: true });
    try {
      await symlink(realRoot, linkedRoot, "junction");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "EPERM") return;
      throw cause;
    }
    try {
      await expect(assertSafePhase515ReportRoot(
        linkedRoot,
        resolve(linkedRoot, "docs/phase5.15"),
      )).rejects.toThrow(/repository root.*real directory|junction/i);
    } finally {
      await rm(linkedRoot, { force: true });
    }
  });

  it("rejects a privacy mutation before replacing any report", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    const mutated = reports();
    mutated["00-runtime-baseline.json"] = {
      detail: "file:///private/song.mid",
    };
    await expect(promotePrivacySafeReports(root, outputRoot, mutated))
      .rejects.toThrow(/privacy scan failed/);
    for (const name of PHASE515_REPORT_NAMES) {
      expect(await readFile(resolve(outputRoot, name), "utf8"))
        .toBe("{\"revision\":1}\n");
    }
  });

  it("refreshes each of exactly the four regular report files", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    await promotePrivacySafeReports(root, outputRoot, reports({ revision: 2 }));
    for (const name of PHASE515_REPORT_NAMES) {
      expect(JSON.parse(await readFile(resolve(outputRoot, name), "utf8")))
        .toEqual({ revision: 2 });
    }
  });

  it("serializes concurrent refresh attempts", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    let releaseFirst!: () => void;
    const firstPaused = new Promise<void>((resolvePause) => {
      releaseFirst = resolvePause;
    });
    let firstPromoted!: () => void;
    const promoted = new Promise<void>((resolvePromoted) => {
      firstPromoted = resolvePromoted;
    });
    const first = promotePrivacySafeReports(
      root,
      outputRoot,
      reports({ revision: 2 }),
      {
        afterPromotion: async (count) => {
          if (count === 1) {
            firstPromoted();
            await firstPaused;
          }
        },
      },
    );
    await promoted;
    await expect(promotePrivacySafeReports(
      root,
      outputRoot,
      reports({ revision: 3 }),
    )).rejects.toThrow(/already in progress/);
    releaseFirst();
    await first;
    for (const name of PHASE515_REPORT_NAMES) {
      expect(JSON.parse(await readFile(resolve(outputRoot, name), "utf8")))
        .toEqual({ revision: 2 });
    }
  });

  it("rolls every report back after a forced mid-promotion failure", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    await expect(promotePrivacySafeReports(
      root,
      outputRoot,
      reports({ revision: 2 }),
      {
        afterPromotion: (count) => {
          if (count === 2) throw new Error("forced mid-promotion failure");
        },
      },
    )).rejects.toThrow(/forced mid-promotion failure/);
    for (const name of PHASE515_REPORT_NAMES) {
      expect(await readFile(resolve(outputRoot, name), "utf8"))
        .toBe("{\"revision\":1}\n");
    }
    await expect(recoverPhase515ReportTransaction(root, outputRoot))
      .resolves.toBe(false);
  });

  it("fails closed on a same-bytes target substitution immediately before promotion", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    const substituted = PHASE515_REPORT_NAMES[1]!;
    await expect(promotePrivacySafeReports(
      root,
      outputRoot,
      reports({ revision: 2 }),
      {
        beforeTargetPromotion: async (_name, index) => {
          if (index !== 2) return;
          const target = resolve(outputRoot, substituted);
          await rm(target);
          await writeFile(target, "{\"revision\":1}\n");
        },
      },
    )).rejects.toThrow(/exact rollback could not be completed|old-target evidence/);
    // The concurrent replacement is never overwritten merely because its
    // bytes equal the old report, and the already-promoted first target is
    // restored from its proven backup.
    for (const name of PHASE515_REPORT_NAMES) {
      expect(await readFile(resolve(outputRoot, name), "utf8"))
        .toBe("{\"revision\":1}\n");
    }
  });

  it("never overwrites a third-party target created after promotion capture verification", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    const attackedName = PHASE515_REPORT_NAMES[0];
    const attackedTarget = resolve(outputRoot, attackedName);
    await expect(promotePrivacySafeReports(
      root,
      outputRoot,
      reports({ revision: 2 }),
      {
        afterTargetCaptureVerified: async (name) => {
          if (name !== attackedName) return;
          await writeFile(
            attackedTarget,
            "{\"revision\":666}\n",
            { flag: "wx" },
          );
        },
      },
    )).rejects.toThrow(/exclusive target|concurrently created|rollback could not/);
    expect(await readFile(attackedTarget, "utf8"))
      .toBe("{\"revision\":666}\n");
    await expect(recoverPhase515ReportTransaction(root, outputRoot))
      .rejects.toThrow(/unknown concurrent replacement/);
    expect(await readFile(attackedTarget, "utf8"))
      .toBe("{\"revision\":666}\n");
  });

  it("re-enters exactly after crashes at both promotion capture boundaries", async () => {
    for (const flag of [
      "--kill-after-target-capture",
      "--kill-after-target-verification",
    ]) {
      const { root, outputRoot } = await makeRepository();
      for (const name of PHASE515_REPORT_NAMES) {
        await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
      }
      const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
        const child = spawn(process.execPath, [
          resolve("node_modules/vite-node/vite-node.mjs"),
          resolve("scripts/phase515/artifactWriterCrashChild.ts"),
          flag,
          root,
        ], { stdio: "ignore" });
        child.once("error", rejectExit);
        child.once("exit", resolveExit);
      });
      expect(exitCode).not.toBe(0);
      await expect(recoverPhase515ReportTransaction(root, outputRoot))
        .resolves.toBe(true);
      for (const name of PHASE515_REPORT_NAMES) {
        expect(await readFile(resolve(outputRoot, name), "utf8"))
          .toBe("{\"revision\":1}\n");
      }
    }
  }, 60_000);

  it("recovers exact old reports after the writer process is forcibly killed", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    const exit = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
      stderr: string;
    }>((resolveExit, rejectExit) => {
      const child = spawn(process.execPath, [
        resolve("node_modules/vite-node/vite-node.mjs"),
        resolve("scripts/phase515/artifactWriterCrashChild.ts"),
        root,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.once("error", rejectExit);
      child.once("exit", (code, signal) => resolveExit({ code, signal, stderr }));
    });
    expect(exit.code === 0 && exit.signal === null).toBe(false);
    const journal = await lstat(resolve(
      outputRoot,
      ".p515-report-refresh.journal.json",
    )).catch(() => undefined);
    if (!journal) {
      throw new Error(`Crash child did not leave a journal: ${exit.stderr}`);
    }
    await expect(recoverPhase515ReportTransaction(root, outputRoot))
      .resolves.toBe(true);
    for (const name of PHASE515_REPORT_NAMES) {
      expect(await readFile(resolve(outputRoot, name), "utf8"))
        .toBe("{\"revision\":1}\n");
    }
  }, 45_000);

  it("restores only the captured rollback inode when the backup name is swapped", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
      const child = spawn(process.execPath, [
        resolve("node_modules/vite-node/vite-node.mjs"),
        resolve("scripts/phase515/artifactWriterCrashChild.ts"),
        root,
      ], { stdio: "ignore" });
      child.once("error", rejectExit);
      child.once("exit", resolveExit);
    });
    expect(exitCode).not.toBe(0);

    let attacked = false;
    await expect(recoverPhase515ReportTransaction(root, outputRoot, {
      afterBackupCapture: async (_name, backupPath) => {
        if (attacked) return;
        attacked = true;
        await rm(backupPath);
        await writeFile(backupPath, "{\"revision\":666}\n", { flag: "wx" });
      },
    })).resolves.toBe(true);
    expect(attacked).toBe(true);
    for (const name of PHASE515_REPORT_NAMES) {
      expect(await readFile(resolve(outputRoot, name), "utf8"))
        .toBe("{\"revision\":1}\n");
    }
  }, 45_000);

  it("does not overwrite a target replaced after rollback backup capture", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
      const child = spawn(process.execPath, [
        resolve("node_modules/vite-node/vite-node.mjs"),
        resolve("scripts/phase515/artifactWriterCrashChild.ts"),
        root,
      ], { stdio: "ignore" });
      child.once("error", rejectExit);
      child.once("exit", resolveExit);
    });
    expect(exitCode).not.toBe(0);

    const attackedName = PHASE515_REPORT_NAMES[0];
    const attackedTarget = resolve(outputRoot, attackedName);
    let attacked = false;
    const replacePromotedTarget = {
      afterRollbackCaptureVerified: async (name: string) => {
        if (attacked || name !== attackedName) return;
        attacked = true;
        await writeFile(attackedTarget, "{\"revision\":666}\n", { flag: "wx" });
      },
    };
    await expect(recoverPhase515ReportTransaction(
      root,
      outputRoot,
      replacePromotedTarget,
    )).rejects.toThrow(/concurrently created|exact rollback could not/);
    expect(attacked).toBe(true);
    expect(await readFile(attackedTarget, "utf8"))
      .toBe("{\"revision\":666}\n");

    await expect(recoverPhase515ReportTransaction(root, outputRoot))
      .rejects.toThrow(/unknown concurrent replacement/);
    expect(await readFile(attackedTarget, "utf8"))
      .toBe("{\"revision\":666}\n");
  }, 45_000);

  it("resumes recovery after the recovery process is killed during cleanup", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    const runChild = (script: string) => new Promise<number | null>(
      (resolveExit, rejectExit) => {
        const child = spawn(process.execPath, [
          resolve("node_modules/vite-node/vite-node.mjs"),
          resolve(script),
          root,
        ], { stdio: "ignore" });
        child.once("error", rejectExit);
        child.once("exit", (code) => resolveExit(code));
      },
    );
    expect(await runChild(
      "scripts/phase515/artifactWriterCrashChild.ts",
    )).not.toBe(0);
    expect(await runChild(
      "scripts/phase515/artifactWriterRecoveryCrashChild.ts",
    )).not.toBe(0);
    await expect(recoverPhase515ReportTransaction(root, outputRoot))
      .resolves.toBe(true);
    for (const name of PHASE515_REPORT_NAMES) {
      expect(await readFile(resolve(outputRoot, name), "utf8"))
        .toBe("{\"revision\":1}\n");
    }
  }, 60_000);

  it("re-enters recovery and cleans a capture left by a killed rollback", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    const runChild = (script: string, extraArgs: string[] = []) =>
      new Promise<number | null>((resolveExit, rejectExit) => {
        const child = spawn(process.execPath, [
          resolve("node_modules/vite-node/vite-node.mjs"),
          resolve(script),
          ...extraArgs,
          root,
        ], { stdio: "ignore" });
        child.once("error", rejectExit);
        child.once("exit", (code) => resolveExit(code));
      });
    expect(await runChild(
      "scripts/phase515/artifactWriterCrashChild.ts",
    )).not.toBe(0);
    expect(await runChild(
      "scripts/phase515/artifactWriterRecoveryCrashChild.ts",
      ["--kill-after-backup-capture"],
    )).not.toBe(0);
    expect((await readdir(outputRoot)).some((name) =>
      name.includes(".rollback-capture-"))).toBe(true);

    await expect(recoverPhase515ReportTransaction(root, outputRoot))
      .resolves.toBe(true);
    expect((await readdir(outputRoot)).some((name) =>
      name.includes(".rollback-capture-"))).toBe(false);
    for (const name of PHASE515_REPORT_NAMES) {
      expect(await readFile(resolve(outputRoot, name), "utf8"))
        .toBe("{\"revision\":1}\n");
    }
  }, 60_000);

  it("re-enters exactly after crashes at both rollback capture boundaries", async () => {
    for (const flag of [
      "--kill-after-rollback-capture",
      "--kill-after-rollback-verification",
    ]) {
      const { root, outputRoot } = await makeRepository();
      for (const name of PHASE515_REPORT_NAMES) {
        await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
      }
      const runChild = (script: string, args: string[] = []) =>
        new Promise<number | null>((resolveExit, rejectExit) => {
          const child = spawn(process.execPath, [
            resolve("node_modules/vite-node/vite-node.mjs"),
            resolve(script),
            ...args,
            root,
          ], { stdio: "ignore" });
          child.once("error", rejectExit);
          child.once("exit", resolveExit);
        });
      expect(await runChild(
        "scripts/phase515/artifactWriterCrashChild.ts",
      )).not.toBe(0);
      expect(await runChild(
        "scripts/phase515/artifactWriterRecoveryCrashChild.ts",
        [flag],
      )).not.toBe(0);
      await expect(recoverPhase515ReportTransaction(root, outputRoot))
        .resolves.toBe(true);
      for (const name of PHASE515_REPORT_NAMES) {
        expect(await readFile(resolve(outputRoot, name), "utf8"))
          .toBe("{\"revision\":1}\n");
      }
    }
  }, 120_000);

  it("rejects crafted journals whose auxiliary names are not exact transaction bindings", async () => {
    const { root, outputRoot } = await makeRepository();
    const transactionId = randomUUID();
    const entries = PHASE515_REPORT_NAMES.map((name, index) => ({
      name,
      stagedName: index === 0
        ? ".p515-report-refresh.journal.json"
        : `.p515-txn-${transactionId}.new-${name}`,
      backupName: `.p515-txn-${transactionId}.old-${name}`,
      newLinkName: `.p515-txn-${transactionId}.new-link-${name}`,
      targetCaptureName: `.p515-txn-${transactionId}.target-capture-${name}`,
      rollbackCaptureName: `.p515-txn-${transactionId}.rollback-capture-${name}`,
      backupDev: "1",
      backupIno: String(index + 1),
      newDev: "1",
      newIno: String(index + 101),
      oldSha256: "0".repeat(64),
      newSha256: "1".repeat(64),
      status: "prepared",
    }));
    await writeFile(
      resolve(outputRoot, ".p515-report-refresh.journal.json"),
      JSON.stringify({
        schemaVersion: 2,
        transactionId,
        state: "promoting",
        entries,
      }),
    );
    await expect(recoverPhase515ReportTransaction(root, outputRoot))
      .rejects.toThrow(/bound to the transaction/);
  });

  it("reclaims a stale recovery claim using its pid and nonce metadata", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    await writeFile(
      resolve(outputRoot, ".p515-report-refresh.recovery"),
      JSON.stringify({
        schemaVersion: 1,
        pid: 2_147_483_647,
        nonce: randomUUID(),
      }),
      { flag: "wx" },
    );
    await expect(promotePrivacySafeReports(
      root,
      outputRoot,
      reports({ revision: 2 }),
    )).resolves.toBeUndefined();
    await expect(lstat(resolve(outputRoot, ".p515-report-refresh.recovery")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes only exact orphan transaction auxiliaries left before journaling", async () => {
    const { root, outputRoot } = await makeRepository();
    const orphan = resolve(
      outputRoot,
      `.p515-txn-${randomUUID()}.new-${PHASE515_REPORT_NAMES[0]}`,
    );
    const unrelated = resolve(outputRoot, ".p515-txn-user-note");
    await writeFile(orphan, "orphan");
    await writeFile(unrelated, "keep");
    await expect(recoverPhase515ReportTransaction(root, outputRoot))
      .resolves.toBe(false);
    await expect(lstat(orphan)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(unrelated, "utf8")).toBe("keep");
  });

  it("fails closed when backup inode or bytes change before the first target change", async () => {
    const { root, outputRoot } = await makeRepository();
    for (const name of PHASE515_REPORT_NAMES) {
      await writeFile(resolve(outputRoot, name), "{\"revision\":1}\n");
    }
    await expect(promotePrivacySafeReports(
      root,
      outputRoot,
      reports({ revision: 2 }),
      {
        afterJournal: async (entries) => {
          const backup = resolve(outputRoot, entries[0]!.backupName);
          await rm(backup);
          await writeFile(backup, "corrupt backup");
        },
      },
    )).rejects.toThrow(/exact rollback could not be completed/);
    for (const name of PHASE515_REPORT_NAMES) {
      expect(await readFile(resolve(outputRoot, name), "utf8"))
        .toBe("{\"revision\":1}\n");
    }
  });
});
