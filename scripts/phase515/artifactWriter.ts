import { createHash, randomUUID } from "node:crypto";
import {
  access,
  link,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import {
  findPrivacyIssues,
  findPrivacyIssuesInText,
  scanPrivacyArtifacts,
} from "./privacy";

export const PHASE515_REPORT_NAMES = [
  "00-data-inventory.json",
  "00-current-failure-matrix.json",
  "00-roundtrip-baseline.json",
  "00-runtime-baseline.json",
] as const;

const OPERATION_LOCK_NAME = ".p515-report-refresh.lock";
const RECOVERY_CLAIM_NAME = ".p515-report-refresh.recovery";
const JOURNAL_NAME = ".p515-report-refresh.journal.json";
const REVIEWED_CANDIDATE_NAME = "p515-baseline-lock.reviewed-candidate.json";

type ReportName = (typeof PHASE515_REPORT_NAMES)[number];

interface ReportTransactionEntry {
  name: ReportName;
  stagedName: string;
  backupName: string;
  newLinkName: string;
  targetCaptureName: string;
  rollbackCaptureName: string;
  backupDev: string;
  backupIno: string;
  newDev: string;
  newIno: string;
  oldSha256: string;
  newSha256: string;
  status: "prepared" | "old-captured" | "promoted" | "new-captured" | "restored";
}

interface ReportTransactionJournal {
  schemaVersion: 2;
  transactionId: string;
  state: "promoting" | "rolled-back" | "committed";
  entries: ReportTransactionEntry[];
}

interface OperationLock {
  schemaVersion: 1;
  pid: number;
  nonce: string;
}

export interface ReportPromotionOptions {
  afterJournal?: (
    entries: readonly ReportTransactionEntry[],
  ) => void | Promise<void>;
  /**
   * Test/diagnostic hook before the final identity check for one target.
   * Production callers leave this unset.
   */
  beforeTargetPromotion?: (
    name: ReportName,
    promotionIndex: number,
  ) => void | Promise<void>;
  /** Runs immediately after rename removed the target into its unique capture. */
  afterTargetCaptured?: (
    name: ReportName,
    promotionIndex: number,
    capturePath: string,
  ) => void | Promise<void>;
  /** Runs after the old target has been atomically captured and verified. */
  afterTargetCaptureVerified?: (
    name: ReportName,
    promotionIndex: number,
    capturePath: string,
  ) => void | Promise<void>;
  afterPromotion?: (promotedCount: number) => void | Promise<void>;
}

export interface ReportRecoveryOptions {
  afterStatePersisted?: (
    state: ReportTransactionJournal["state"],
  ) => void | Promise<void>;
  afterAuxiliaryCleanup?: (removedCount: number) => void | Promise<void>;
  /**
   * Test/diagnostic hook after rollback has captured a unique hard link but
   * before that capture is promoted over the target.
   */
  afterBackupCapture?: (
    name: ReportName,
    backupPath: string,
    capturePath: string,
  ) => void | Promise<void>;
  /** Runs after the promoted target has been atomically captured and verified. */
  afterRollbackCaptureVerified?: (
    name: ReportName,
    targetPath: string,
    capturePath: string,
  ) => void | Promise<void>;
  /** Runs immediately after rename removed the promoted target. */
  afterRollbackTargetCaptured?: (
    name: ReportName,
    targetPath: string,
    capturePath: string,
  ) => void | Promise<void>;
}

export function validateBaselineWriteMode(options: {
  refreshReports: boolean;
  emitReviewedLockCandidate: boolean;
}): void {
  if (options.emitReviewedLockCandidate && options.refreshReports) {
    throw new Error(
      "--emit-reviewed-lock-candidate and --refresh-reports are mutually exclusive.",
    );
  }
}

export interface RenderedJsonArtifact {
  name: string;
  text: string;
}

export function renderPrivacySafeJson(
  name: string,
  value: unknown,
): RenderedJsonArtifact {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const parsed: unknown = JSON.parse(text);
  const issues = [
    ...findPrivacyIssues(value, `${name}.source`),
    ...findPrivacyIssues(parsed, `${name}.parsed`),
    ...findPrivacyIssuesInText(text, `${name}.raw`),
  ];
  if (issues.length > 0) {
    throw new Error(
      `In-memory P5.15 artifact privacy scan failed: ${JSON.stringify(issues)}`,
    );
  }
  return { name, text };
}

export async function assertSafePhase515ReportRoot(
  repositoryRoot: string,
  outputRoot: string,
): Promise<string> {
  const lexicalRepositoryRoot = resolve(repositoryRoot);
  const lexicalOutputRoot = resolve(outputRoot);
  const expectedOutputRoot = resolve(lexicalRepositoryRoot, "docs/phase5.15");
  if (lexicalOutputRoot !== expectedOutputRoot) {
    throw new Error("P5.15 report output must be the fixed docs/phase5.15 directory.");
  }
  const repositoryInfo = await lstat(lexicalRepositoryRoot);
  if (!repositoryInfo.isDirectory() || repositoryInfo.isSymbolicLink()) {
    throw new Error(
      "P5.15 report repository root must be a real directory, not a junction.",
    );
  }

  const [realRepositoryRoot, realOutputRoot] = await Promise.all([
    realpath(lexicalRepositoryRoot),
    realpath(lexicalOutputRoot),
  ]);
  const fromRepository = relative(realRepositoryRoot, realOutputRoot);
  if (
    !fromRepository
    || fromRepository.startsWith("..")
    || isAbsolute(fromRepository)
  ) {
    throw new Error("P5.15 report output resolves outside the repository.");
  }

  const lexicalFromRepository = relative(
    lexicalRepositoryRoot,
    lexicalOutputRoot,
  );
  let cursor = lexicalRepositoryRoot;
  for (const component of lexicalFromRepository.split(/[\\/]/)) {
    cursor = resolve(cursor, component);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) {
      throw new Error("P5.15 report output cannot contain a symlink or junction.");
    }
  }
  const outputInfo = await lstat(lexicalOutputRoot);
  if (!outputInfo.isDirectory()) {
    throw new Error("P5.15 report output must be a real directory.");
  }
  return realOutputRoot;
}

export async function recoverPhase515ReportTransaction(
  repositoryRoot: string,
  outputRoot: string,
  options: ReportRecoveryOptions = {},
): Promise<boolean> {
  const realOutputRoot = await assertSafePhase515ReportRoot(
    repositoryRoot,
    outputRoot,
  );
  return withOperationLock(realOutputRoot, async () => {
    const journalPath = resolve(realOutputRoot, JOURNAL_NAME);
    const journalPresent = await pathExistsLstat(journalPath);
    if (journalPresent) {
      await recoverReportTransactionLocked(realOutputRoot, options);
    }
    await cleanupOrphanedControlSnapshots(realOutputRoot);
    await cleanupOrphanedTransactionFiles(realOutputRoot);
    return journalPresent;
  });
}

export async function promotePrivacySafeReports(
  repositoryRoot: string,
  outputRoot: string,
  reports: Record<string, unknown>,
  options: ReportPromotionOptions = {},
): Promise<void> {
  const names = Object.keys(reports).sort();
  const expectedNames = [...PHASE515_REPORT_NAMES].sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error("Report refresh must contain exactly the four fixed P5.15 reports.");
  }
  const rendered = Object.fromEntries(
    PHASE515_REPORT_NAMES.map((name) => [
      name,
      renderPrivacySafeJson(name, reports[name]),
    ]),
  ) as Record<ReportName, RenderedJsonArtifact>;

  const realOutputRoot = await assertSafePhase515ReportRoot(
    repositoryRoot,
    outputRoot,
  );
  for (const name of PHASE515_REPORT_NAMES) {
    await assertRegularFile(resolve(realOutputRoot, name));
  }
  const existingPrivacyIssues = await scanPrivacyArtifacts(repositoryRoot);
  if (existingPrivacyIssues.length > 0) {
    throw new Error(
      `Existing P5.15 artifact privacy scan failed: ${
        JSON.stringify(existingPrivacyIssues)
      }`,
    );
  }

  await withOperationLock(realOutputRoot, async () => {
    await recoverReportTransactionLocked(realOutputRoot);
    await cleanupOrphanedControlSnapshots(realOutputRoot);
    await cleanupOrphanedTransactionFiles(realOutputRoot);
    await assertSafePhase515ReportRoot(repositoryRoot, outputRoot);
    for (const name of PHASE515_REPORT_NAMES) {
      await assertRegularFile(resolve(realOutputRoot, name));
    }

    const transactionId = randomUUID();
    const entries: ReportTransactionEntry[] = [];
    try {
      for (const name of PHASE515_REPORT_NAMES) {
        const target = resolve(realOutputRoot, name);
        const stagedName = `.p515-txn-${transactionId}.new-${name}`;
        const backupName = `.p515-txn-${transactionId}.old-${name}`;
        const newLinkName = `.p515-txn-${transactionId}.new-link-${name}`;
        const targetCaptureName = `.p515-txn-${transactionId}.target-capture-${name}`;
        const rollbackCaptureName = `.p515-txn-${transactionId}.rollback-capture-${name}`;
        const staged = resolve(realOutputRoot, stagedName);
        const backup = resolve(realOutputRoot, backupName);
        const newLink = resolve(realOutputRoot, newLinkName);
        await writeFile(staged, rendered[name].text, {
          encoding: "utf8",
          flag: "wx",
        });
        await link(staged, newLink);
        await link(target, backup);
        const [backupInfo, newInfo] = await Promise.all([
          stat(backup),
          stat(newLink),
        ]);
        if (!await sameFile(target, backup)) {
          throw new Error(`Backup inode mismatch before journaling: ${name}.`);
        }
        entries.push({
          name,
          stagedName,
          backupName,
          newLinkName,
          targetCaptureName,
          rollbackCaptureName,
          backupDev: String(backupInfo.dev),
          backupIno: String(backupInfo.ino),
          newDev: String(newInfo.dev),
          newIno: String(newInfo.ino),
          oldSha256: await hashFile(backup),
          newSha256: sha256Text(rendered[name].text),
          status: "prepared",
        });
      }

      let journal: ReportTransactionJournal = {
        schemaVersion: 2,
        transactionId,
        state: "promoting",
        entries,
      };
      await writeJournalExclusive(realOutputRoot, journal);
      await options.afterJournal?.(entries);

      // Validate every rollback source before the first destructive rename.
      for (const entry of entries) {
        await verifyBackupEvidence(realOutputRoot, entry);
        if (!await sameFile(
          resolve(realOutputRoot, entry.name),
          resolve(realOutputRoot, entry.backupName),
        )) {
          throw new Error(
            `Report target changed before promotion: ${entry.name}.`,
          );
        }
      }

      for (let index = 0; index < entries.length; index += 1) {
        let entry = journal.entries[index]!;
        const target = resolve(realOutputRoot, entry.name);
        const targetCapture = resolve(
          realOutputRoot,
          entry.targetCaptureName,
        );
        const newLink = resolve(realOutputRoot, entry.newLinkName);
        await options.beforeTargetPromotion?.(entry.name, index + 1);
        await verifyBackupEvidence(realOutputRoot, entry);
        await captureTarget(
          target,
          targetCapture,
          entry,
          "old",
          () => options.afterTargetCaptured?.(
            entry.name,
            index + 1,
            targetCapture,
          ),
          () => options.afterTargetCaptureVerified?.(
            entry.name,
            index + 1,
            targetCapture,
          ),
        );
        journal = await persistEntryStatus(
          realOutputRoot,
          journal,
          index,
          "old-captured",
        );
        entry = journal.entries[index]!;
        try {
          // link() is the no-replace commit point. EEXIST can only preserve a
          // competing target; unlike rename(), it can never overwrite it.
          await link(newLink, target);
        } catch (cause) {
          await restoreCaptureExclusively(targetCapture, target, entry.name)
            .catch((restoreCause) => {
              throw new AggregateError(
                [cause, restoreCause],
                `Report promotion lost its exclusive target: ${entry.name}.`,
              );
            });
          throw cause;
        }
        await assertRecordedNewTarget(target, entry);
        journal = await persistEntryStatus(
          realOutputRoot,
          journal,
          index,
          "promoted",
        );
        await options.afterPromotion?.(index + 1);
      }

      await replaceJournal(realOutputRoot, {
        ...journal,
        state: "committed",
      });
      await recoverReportTransactionLocked(realOutputRoot);
    } catch (cause) {
      if (await pathExistsLstat(resolve(realOutputRoot, JOURNAL_NAME))) {
        try {
          await recoverReportTransactionLocked(realOutputRoot);
        } catch (recoveryCause) {
          throw new AggregateError(
            [cause, recoveryCause],
            "Report refresh failed and exact rollback could not be completed.",
            { cause: recoveryCause },
          );
        }
      } else {
        await cleanupUnjournaledEntries(realOutputRoot, entries);
        await cleanupOrphanedTransactionFiles(realOutputRoot);
      }
      throw cause;
    }
  });
}

export async function writeReviewedLockCandidate(
  repositoryRoot: string,
  target: string,
  value: unknown,
): Promise<void> {
  const lexicalRoot = resolve(repositoryRoot);
  const expectedTarget = resolve(lexicalRoot, REVIEWED_CANDIDATE_NAME);
  if (resolve(target) !== expectedTarget) {
    throw new Error("Reviewed lock candidate must use the fixed repository-root path.");
  }
  const rootInfo = await lstat(lexicalRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Reviewed lock candidate repository root must be a real directory.");
  }
  await realpath(lexicalRoot);
  await assertAbsent(expectedTarget);
  const rendered = renderPrivacySafeJson(REVIEWED_CANDIDATE_NAME, value);
  await writeExclusiveRenderedJson(expectedTarget, rendered);
}

async function writeExclusiveRenderedJson(
  target: string,
  rendered: RenderedJsonArtifact,
): Promise<void> {
  const temporary = resolve(
    dirname(target),
    `.${basename(target)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, rendered.text, {
      encoding: "utf8",
      flag: "wx",
    });
    await assertAbsent(target);
    await link(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function withOperationLock<T>(
  outputRoot: string,
  task: () => Promise<T>,
): Promise<T> {
  const nonce = randomUUID();
  const ownerName = `.p515-report-refresh.${nonce}.owner`;
  const ownerPath = resolve(outputRoot, ownerName);
  const lockPath = resolve(outputRoot, OPERATION_LOCK_NAME);
  const owner: OperationLock = {
    schemaVersion: 1,
    pid: process.pid,
    nonce,
  };
  await writeFile(ownerPath, renderPrivacySafeJson(ownerName, owner).text, {
    encoding: "utf8",
    flag: "wx",
  });
  try {
    await acquireOperationLock(outputRoot, ownerPath, owner);
    try {
      return await task();
    } finally {
      await removeOwnedFixedControlFile(lockPath, ownerPath);
    }
  } finally {
    await rm(ownerPath, { force: true }).catch(() => undefined);
  }
}

/**
 * Run another P5.15 artifact transaction under the same hardened operation
 * lock used by the Stage 00 report writer.  Callers get the verified real
 * report root only after stale-lock recovery and Stage 00 transaction cleanup
 * have completed.
 */
export async function withPhase515ArtifactOperationLock<T>(
  repositoryRoot: string,
  task: (realOutputRoot: string) => Promise<T>,
): Promise<T> {
  const outputRoot = resolve(repositoryRoot, "docs/phase5.15");
  const realOutputRoot = await assertSafePhase515ReportRoot(
    repositoryRoot,
    outputRoot,
  );
  return withOperationLock(realOutputRoot, async () => {
    await recoverReportTransactionLocked(realOutputRoot);
    await cleanupOrphanedControlSnapshots(realOutputRoot);
    await cleanupOrphanedTransactionFiles(realOutputRoot);
    await assertSafePhase515ReportRoot(repositoryRoot, outputRoot);
    return task(realOutputRoot);
  });
}

async function acquireOperationLock(
  outputRoot: string,
  ownerPath: string,
  owner: OperationLock,
): Promise<void> {
  const lockPath = resolve(outputRoot, OPERATION_LOCK_NAME);
  const claimPath = resolve(outputRoot, RECOVERY_CLAIM_NAME);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await pathExistsLstat(claimPath)) {
      await reclaimStaleClaim(outputRoot, claimPath);
    }
    try {
      await link(ownerPath, lockPath);
      return;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
    }

    const observed = await readOperationLockWithIdentity(lockPath);
    if (isProcessAlive(observed.pid)) {
      throw new Error(`P5.15 report refresh is already in progress (pid ${observed.pid}).`);
    }

    const claim: OperationLock = {
      schemaVersion: 1,
      pid: process.pid,
      nonce: randomUUID(),
    };
    let claimInfo: { dev: number; ino: number };
    try {
      claimInfo = await writeOperationLockExclusive(
        claimPath,
        RECOVERY_CLAIM_NAME,
        claim,
      );
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(
          "P5.15 report refresh stale-lock recovery is already in progress.",
          { cause },
        );
      }
      throw cause;
    }
    try {
      const current = await readOperationLockWithIdentity(lockPath);
      if (
        current.nonce !== observed.nonce
        || current.pid !== observed.pid
        || current.dev !== observed.dev
        || current.ino !== observed.ino
        || isProcessAlive(current.pid)
      ) {
        continue;
      }
      const snapshot = resolve(
        outputRoot,
        `.p515-report-refresh.stale-lock-${randomUUID()}`,
      );
      try {
        await rename(lockPath, snapshot);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw cause;
      }
      try {
        const captured = await readOperationLockWithIdentity(snapshot);
        if (
          captured.nonce !== observed.nonce
          || captured.pid !== observed.pid
          || captured.dev !== observed.dev
          || captured.ino !== observed.ino
          || isProcessAlive(captured.pid)
        ) {
          await restoreCapturedControlFile(snapshot, lockPath);
          await rm(snapshot);
          continue;
        }
        await removeIfSameFile(
          resolve(outputRoot, `.p515-report-refresh.${current.nonce}.owner`),
          snapshot,
        );
      } finally {
        // If restore failed, retain the atomically captured inode as evidence
        // rather than deleting an ABA replacement.
        if (await pathExistsLstat(snapshot)) {
          const captured = await readOperationLock(snapshot).catch(() => undefined);
          if (captured?.pid === observed.pid && captured.nonce === observed.nonce) {
            await rm(snapshot, { force: true }).catch(() => undefined);
          }
        }
      }
    } finally {
      await removeClaimIfOwned(claimPath, claim, claimInfo);
    }
  }
  throw new Error(
    `Unable to acquire the P5.15 report refresh lock for pid ${owner.pid}.`,
  );
}

type OperationLockWithIdentity = OperationLock & { dev: number; ino: number };

async function readOperationLockWithIdentity(
  path: string,
): Promise<OperationLockWithIdentity> {
  const handle = await open(path, "r");
  let text: string;
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await handle.stat();
    if (!info.isFile()) {
      throw new Error(
        "Malformed P5.15 report refresh lock; refusing unsafe recovery.",
      );
    }
    text = await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
  const lexical = await lstat(path);
  if (
    lexical.isSymbolicLink()
    || !lexical.isFile()
    || lexical.dev !== info.dev
    || lexical.ino !== info.ino
  ) {
    throw new Error(
      "P5.15 report refresh lock identity changed during read.",
    );
  }
  const parsed = JSON.parse(text) as Partial<OperationLock>;
  if (
    parsed.schemaVersion !== 1
    || !Number.isInteger(parsed.pid)
    || (parsed.pid ?? 0) <= 0
    || typeof parsed.nonce !== "string"
    || !/^[a-f0-9-]{16,}$/i.test(parsed.nonce)
  ) {
    throw new Error("Malformed P5.15 report refresh lock; refusing unsafe recovery.");
  }
  return {
    ...(parsed as OperationLock),
    dev: info.dev,
    ino: info.ino,
  };
}

async function readOperationLock(path: string): Promise<OperationLock> {
  const lock = await readOperationLockWithIdentity(path);
  return {
    schemaVersion: lock.schemaVersion,
    pid: lock.pid,
    nonce: lock.nonce,
  };
}

async function writeOperationLockExclusive(
  path: string,
  name: string,
  lock: OperationLock,
): Promise<{ dev: number; ino: number }> {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(renderPrivacySafeJson(name, lock).text, "utf8");
    const info = await handle.stat();
    return { dev: info.dev, ino: info.ino };
  } finally {
    await handle.close();
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function writeJournalExclusive(
  outputRoot: string,
  journal: ReportTransactionJournal,
): Promise<void> {
  const target = resolve(outputRoot, JOURNAL_NAME);
  await assertAbsent(target);
  await writeExclusiveRenderedJson(
    target,
    renderPrivacySafeJson(JOURNAL_NAME, journal),
  );
}

async function replaceJournal(
  outputRoot: string,
  journal: ReportTransactionJournal,
): Promise<void> {
  const target = resolve(outputRoot, JOURNAL_NAME);
  await assertRegularFile(target);
  const temporary = resolve(
    outputRoot,
    `.p515-report-refresh.journal.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(
      temporary,
      renderPrivacySafeJson(JOURNAL_NAME, journal).text,
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function recoverReportTransactionLocked(
  outputRoot: string,
  options: ReportRecoveryOptions = {},
): Promise<void> {
  const journalPath = resolve(outputRoot, JOURNAL_NAME);
  if (!await pathExistsLstat(journalPath)) return;
  await assertRegularFile(journalPath);
  const text = await readFile(journalPath, "utf8");
  const rawIssues = findPrivacyIssuesInText(text, JOURNAL_NAME);
  if (rawIssues.length > 0) {
    throw new Error(`Report transaction journal privacy scan failed: ${
      JSON.stringify(rawIssues)
    }`);
  }
  let journal = parseJournal(text);

  if (journal.state === "promoting") {
    // No target is changed until every backup has proven both its recorded
    // identity and bytes. A crafted/corrupt journal therefore fails closed.
    for (const entry of journal.entries) {
      await verifyBackupEvidence(outputRoot, entry);
    }
    for (let index = 0; index < journal.entries.length; index += 1) {
      journal = await rollBackEntry(
        outputRoot,
        journal,
        index,
        options,
      );
    }
    // Cleanup begins only after a durable state transition. If the process is
    // killed during cleanup, the next explicit recovery verifies old targets
    // and resumes without requiring already-removed backups.
    await replaceJournal(outputRoot, {
      ...journal,
      state: "rolled-back",
    });
    await options.afterStatePersisted?.("rolled-back");
  } else if (journal.state === "rolled-back") {
    for (const entry of journal.entries) {
      const target = resolveTransactionFile(outputRoot, entry.name);
      await assertRecordedOldTarget(target, entry);
    }
  } else {
    for (const entry of journal.entries) {
      const target = resolveTransactionFile(outputRoot, entry.name);
      await assertRecordedNewTarget(target, entry);
    }
  }

  let removedCount = 0;
  for (const entry of journal.entries) {
    await removeRegularAuxiliary(
      resolveTransactionFile(outputRoot, entry.stagedName),
    );
    removedCount += 1;
    await options.afterAuxiliaryCleanup?.(removedCount);
    await removeRegularAuxiliary(
      resolveTransactionFile(outputRoot, entry.backupName),
    );
    removedCount += 1;
    await options.afterAuxiliaryCleanup?.(removedCount);
    await removeRegularAuxiliary(
      resolveTransactionFile(outputRoot, entry.newLinkName),
    );
    removedCount += 1;
    await options.afterAuxiliaryCleanup?.(removedCount);
    await removeRegularAuxiliary(
      resolveTransactionFile(outputRoot, entry.targetCaptureName),
    );
    removedCount += 1;
    await options.afterAuxiliaryCleanup?.(removedCount);
    await removeRegularAuxiliary(
      resolveTransactionFile(outputRoot, entry.rollbackCaptureName),
    );
    removedCount += 1;
    await options.afterAuxiliaryCleanup?.(removedCount);
  }
  await removeRegularAuxiliary(journalPath);
}

function parseJournal(text: string): ReportTransactionJournal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Malformed report transaction journal; recovery is fail-closed.");
  }
  const issues = findPrivacyIssues(parsed, JOURNAL_NAME);
  if (issues.length > 0) {
    throw new Error(`Report transaction journal privacy scan failed: ${
      JSON.stringify(issues)
    }`);
  }
  const value = parsed as Partial<ReportTransactionJournal>;
  if (
    value.schemaVersion !== 2
    || typeof value.transactionId !== "string"
    || !/^[a-f0-9-]{16,}$/i.test(value.transactionId)
    || !["promoting", "rolled-back", "committed"].includes(value.state ?? "")
    || !Array.isArray(value.entries)
    || value.entries.length !== PHASE515_REPORT_NAMES.length
  ) {
    throw new Error("Invalid report transaction journal; recovery is fail-closed.");
  }
  if (
    !hasExactKeys(value as Record<string, unknown>, [
      "schemaVersion", "transactionId", "state", "entries",
    ])
  ) {
    throw new Error("Invalid report transaction journal keys; recovery is fail-closed.");
  }
  const seen = new Set<string>();
  const auxiliaryNames = new Set<string>();
  for (const entry of value.entries) {
    if (
      !entry
      || typeof entry !== "object"
      || !PHASE515_REPORT_NAMES.includes(entry.name as ReportName)
      || seen.has(entry.name as string)
      || typeof entry.stagedName !== "string"
      || typeof entry.backupName !== "string"
      || typeof entry.newLinkName !== "string"
      || typeof entry.targetCaptureName !== "string"
      || typeof entry.rollbackCaptureName !== "string"
      || typeof entry.backupDev !== "string"
      || typeof entry.backupIno !== "string"
      || typeof entry.newDev !== "string"
      || typeof entry.newIno !== "string"
      || !isSha256(entry.oldSha256)
      || !isSha256(entry.newSha256)
      || ![
        "prepared",
        "old-captured",
        "promoted",
        "new-captured",
        "restored",
      ].includes(entry.status)
    ) {
      throw new Error("Invalid report transaction journal entry; recovery is fail-closed.");
    }
    const expected = expectedAuxiliaryNames(value.transactionId, entry.name as ReportName);
    if (
      entry.stagedName !== expected.stagedName
      || entry.backupName !== expected.backupName
      || entry.newLinkName !== expected.newLinkName
      || entry.targetCaptureName !== expected.targetCaptureName
      || entry.rollbackCaptureName !== expected.rollbackCaptureName
      || !hasExactKeys(entry as unknown as Record<string, unknown>, [
        "name", "stagedName", "backupName", "newLinkName",
        "targetCaptureName", "rollbackCaptureName",
        "backupDev", "backupIno", "newDev", "newIno",
        "oldSha256", "newSha256", "status",
      ])
    ) {
      throw new Error(
        "Journal auxiliary names are not bound to the transaction and target.",
      );
    }
    for (const auxiliary of [
      entry.stagedName,
      entry.backupName,
      entry.newLinkName,
      entry.targetCaptureName,
      entry.rollbackCaptureName,
    ]) {
      if (
        auxiliaryNames.has(auxiliary)
        || isReservedControlName(auxiliary)
      ) {
        throw new Error("Journal auxiliary names must be distinct and non-reserved.");
      }
      auxiliaryNames.add(auxiliary);
    }
    seen.add(entry.name as string);
  }
  if (seen.size !== PHASE515_REPORT_NAMES.length) {
    throw new Error("Incomplete report transaction journal; recovery is fail-closed.");
  }
  if (
    value.state === "committed"
    && value.entries.some((entry) => entry.status !== "promoted")
  ) {
    throw new Error("Committed report journal has invalid entry status.");
  }
  if (
    value.state === "rolled-back"
    && value.entries.some((entry) => entry.status !== "restored")
  ) {
    throw new Error("Rolled-back report journal has invalid entry status.");
  }
  return value as ReportTransactionJournal;
}

function expectedAuxiliaryNames(transactionId: string, name: ReportName) {
  return {
    stagedName: `.p515-txn-${transactionId}.new-${name}`,
    backupName: `.p515-txn-${transactionId}.old-${name}`,
    newLinkName: `.p515-txn-${transactionId}.new-link-${name}`,
    targetCaptureName: `.p515-txn-${transactionId}.target-capture-${name}`,
    rollbackCaptureName: `.p515-txn-${transactionId}.rollback-capture-${name}`,
  };
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return JSON.stringify(Object.keys(value).sort())
    === JSON.stringify([...expected].sort());
}

function isReservedControlName(name: string): boolean {
  return [
    OPERATION_LOCK_NAME,
    RECOVERY_CLAIM_NAME,
    JOURNAL_NAME,
    REVIEWED_CANDIDATE_NAME,
    ...PHASE515_REPORT_NAMES,
  ].includes(name as ReportName);
}

async function verifyBackupEvidence(
  outputRoot: string,
  entry: ReportTransactionEntry,
): Promise<void> {
  const backup = resolveTransactionFile(outputRoot, entry.backupName);
  await assertRegularFile(backup);
  const info = await stat(backup);
  if (
    String(info.dev) !== entry.backupDev
    || String(info.ino) !== entry.backupIno
    || await hashFile(backup) !== entry.oldSha256
  ) {
    throw new Error(`Report backup evidence mismatch: ${entry.name}.`);
  }
}

async function assertRecordedOldTarget(
  target: string,
  entry: ReportTransactionEntry,
): Promise<void> {
  await assertRegularFile(target);
  const info = await stat(target);
  if (
    String(info.dev) !== entry.backupDev
    || String(info.ino) !== entry.backupIno
    || await hashFile(target) !== entry.oldSha256
  ) {
    throw new Error(`Report old-target evidence mismatch: ${entry.name}.`);
  }
}

async function cleanupOrphanedTransactionFiles(outputRoot: string): Promise<void> {
  if (await pathExistsLstat(resolve(outputRoot, JOURNAL_NAME))) return;
  const reportAlternation = PHASE515_REPORT_NAMES
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const pattern = new RegExp(
    `^\\.p515-txn-[0-9a-f-]{16,}\\.(?:new|old|new-link|target-capture|rollback-capture)-(?:${reportAlternation})$`,
    "i",
  );
  for (const entry of await readdir(outputRoot, { withFileTypes: true })) {
    if (!pattern.test(entry.name)) continue;
    await removeRegularAuxiliary(resolve(outputRoot, entry.name));
  }
}

async function reclaimStaleClaim(
  outputRoot: string,
  claimPath: string,
): Promise<void> {
  const claim = await readOperationLockWithIdentity(claimPath);
  if (isProcessAlive(claim.pid)) {
    throw new Error(
      `P5.15 report refresh stale-lock recovery is already in progress (pid ${claim.pid}).`,
    );
  }
  const snapshot = resolve(
    outputRoot,
    `.p515-report-refresh.stale-claim-${randomUUID()}`,
  );
  try {
    await rename(claimPath, snapshot);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
    throw cause;
  }
  try {
    const captured = await readOperationLockWithIdentity(snapshot);
    if (
      captured.pid !== claim.pid
      || captured.nonce !== claim.nonce
      || captured.dev !== claim.dev
      || captured.ino !== claim.ino
      || isProcessAlive(captured.pid)
    ) {
      await restoreCapturedControlFile(snapshot, claimPath);
      await rm(snapshot);
      throw new Error("Recovery claim changed while reclaiming it.");
    }
    await rm(snapshot);
  } finally {
    // A failed restore intentionally leaves the unique capture in place.
  }
}

async function removeClaimIfOwned(
  claimPath: string,
  expected: OperationLock,
  identity: { dev: number; ino: number },
): Promise<void> {
  const capturedPath = resolve(
    dirname(claimPath),
    `.p515-report-refresh.claim-release-${randomUUID()}`,
  );
  try {
    await rename(claimPath, capturedPath);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
    throw cause;
  }
  const current = await readOperationLock(capturedPath).catch(() => undefined);
  const currentInfo = await stat(capturedPath).catch(() => undefined);
  if (
    !current
    || !currentInfo
    || current.pid !== expected.pid
    || current.nonce !== expected.nonce
    || currentInfo.dev !== identity.dev
    || currentInfo.ino !== identity.ino
  ) {
    await restoreCapturedControlFile(capturedPath, claimPath);
    await rm(capturedPath);
    throw new Error("Recovery claim ownership changed during release.");
  }
  await rm(capturedPath);
}

async function cleanupOrphanedControlSnapshots(outputRoot: string): Promise<void> {
  const pattern = /^\.p515-report-refresh\.stale-(?:lock|claim)-[a-f0-9-]{16,}$/i;
  for (const entry of await readdir(outputRoot, { withFileTypes: true })) {
    if (!pattern.test(entry.name)) continue;
    const path = resolve(outputRoot, entry.name);
    const owner = await readOperationLock(path);
    if (isProcessAlive(owner.pid)) {
      throw new Error(
        `Live P5.15 recovery snapshot cannot be cleaned (pid ${owner.pid}).`,
      );
    }
    await removeRegularAuxiliary(path);
  }
}

function resolveTransactionFile(outputRoot: string, name: string): string {
  if (basename(name) !== name) {
    throw new Error("Report transaction journal contains a non-local filename.");
  }
  const path = resolve(outputRoot, name);
  if (dirname(path) !== resolve(outputRoot)) {
    throw new Error("Report transaction journal filename escapes its root.");
  }
  return path;
}

async function persistEntryStatus(
  outputRoot: string,
  journal: ReportTransactionJournal,
  index: number,
  status: ReportTransactionEntry["status"],
): Promise<ReportTransactionJournal> {
  const entries = journal.entries.map((entry, entryIndex) =>
    entryIndex === index ? { ...entry, status } : entry);
  const updated = { ...journal, entries };
  await replaceJournal(outputRoot, updated);
  return updated;
}

async function captureTarget(
  target: string,
  capture: string,
  entry: ReportTransactionEntry,
  expected: "old" | "new",
  afterCapture?: () => void | Promise<void>,
  afterVerified?: () => void | Promise<void>,
): Promise<void> {
  await assertAbsent(capture);
  await rename(target, capture);
  try {
    await afterCapture?.();
    if (expected === "old") {
      await verifyCapturedOldTarget(capture, entry);
    } else {
      await verifyCapturedNewTarget(capture, entry);
    }
    await afterVerified?.();
  } catch (cause) {
    try {
      await restoreCaptureExclusively(capture, target, entry.name);
    } catch (restoreCause) {
      throw new AggregateError(
        [cause, restoreCause],
        `Captured report could not be restored exclusively: ${entry.name}.`,
        { cause: restoreCause },
      );
    }
    throw cause;
  }
}

async function restoreCaptureExclusively(
  capture: string,
  target: string,
  name: ReportName,
): Promise<void> {
  try {
    await link(capture, target);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Report target was concurrently created; preserving it: ${name}.`,
        { cause },
      );
    }
    throw cause;
  }
  if (!await sameFile(capture, target)) {
    throw new Error(`Exclusive report restoration identity mismatch: ${name}.`);
  }
}

async function assertRecordedNewTarget(
  target: string,
  entry: ReportTransactionEntry,
): Promise<void> {
  await assertRegularFile(target);
  const info = await stat(target);
  if (
    String(info.dev) !== entry.newDev
    || String(info.ino) !== entry.newIno
    || await hashFile(target) !== entry.newSha256
  ) {
    throw new Error(`Report new-target evidence mismatch: ${entry.name}.`);
  }
}

async function verifyCapturedOldTarget(
  capture: string,
  entry: ReportTransactionEntry,
): Promise<void> {
  await assertRegularFile(capture);
  const info = await stat(capture);
  if (
    String(info.dev) !== entry.backupDev
    || String(info.ino) !== entry.backupIno
    || await hashFile(capture) !== entry.oldSha256
  ) {
    throw new Error(`Report rollback capture evidence mismatch: ${entry.name}.`);
  }
}

async function verifyCapturedNewTarget(
  capture: string,
  entry: ReportTransactionEntry,
): Promise<void> {
  await assertRegularFile(capture);
  const info = await stat(capture);
  if (
    String(info.dev) !== entry.newDev
    || String(info.ino) !== entry.newIno
    || await hashFile(capture) !== entry.newSha256
  ) {
    throw new Error(`Report promoted capture evidence mismatch: ${entry.name}.`);
  }
}

async function identifyTarget(
  target: string,
  entry: ReportTransactionEntry,
): Promise<"absent" | "old" | "new" | "unknown"> {
  const info = await lstat(target).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return undefined;
    throw cause;
  });
  if (!info) return "absent";
  if (!info.isFile() || info.isSymbolicLink()) return "unknown";
  const hash = await hashFile(target);
  if (
    String(info.dev) === entry.backupDev
    && String(info.ino) === entry.backupIno
    && hash === entry.oldSha256
  ) return "old";
  if (
    String(info.dev) === entry.newDev
    && String(info.ino) === entry.newIno
    && hash === entry.newSha256
  ) return "new";
  return "unknown";
}

async function rollBackEntry(
  outputRoot: string,
  journal: ReportTransactionJournal,
  index: number,
  options: ReportRecoveryOptions,
): Promise<ReportTransactionJournal> {
  let entry = journal.entries[index]!;
  const target = resolveTransactionFile(outputRoot, entry.name);
  const backup = resolveTransactionFile(outputRoot, entry.backupName);
  const oldCapture = resolveTransactionFile(
    outputRoot,
    entry.targetCaptureName,
  );
  const newCapture = resolveTransactionFile(
    outputRoot,
    entry.rollbackCaptureName,
  );

  if (await pathExistsLstat(oldCapture)) {
    await verifyCapturedOldTarget(oldCapture, entry);
    if (entry.status === "prepared") {
      journal = await persistEntryStatus(
        outputRoot,
        journal,
        index,
        "old-captured",
      );
      entry = journal.entries[index]!;
    }
  }
  if (await pathExistsLstat(newCapture)) {
    await verifyCapturedNewTarget(newCapture, entry);
    if (entry.status !== "restored" && entry.status !== "new-captured") {
      journal = await persistEntryStatus(
        outputRoot,
        journal,
        index,
        "new-captured",
      );
      entry = journal.entries[index]!;
    }
  }

  let identity = await identifyTarget(target, entry);
  if (entry.status === "restored") {
    if (identity !== "old") {
      throw new Error(
        `Report recovery found an unknown concurrent replacement: ${entry.name}.`,
      );
    }
    return journal;
  }

  if (entry.status === "prepared" && identity === "old") {
    return persistEntryStatus(outputRoot, journal, index, "restored");
  }

  if (identity === "unknown") {
    throw new Error(
      `Report recovery found an unknown concurrent replacement: ${entry.name}.`,
    );
  }

  if (identity === "new") {
    await captureTarget(
      target,
      newCapture,
      entry,
      "new",
      () => options.afterRollbackTargetCaptured?.(
        entry.name,
        target,
        newCapture,
      ),
      () => options.afterRollbackCaptureVerified?.(
        entry.name,
        target,
        newCapture,
      ),
    );
    journal = await persistEntryStatus(
      outputRoot,
      journal,
      index,
      "new-captured",
    );
    entry = journal.entries[index]!;
    identity = "absent";
  }

  if (identity === "old") {
    return persistEntryStatus(outputRoot, journal, index, "restored");
  }
  if (identity !== "absent" || !await pathExistsLstat(oldCapture)) {
    throw new Error(`Report recovery is missing its captured old target: ${entry.name}.`);
  }

  await verifyCapturedOldTarget(oldCapture, entry);
  await options.afterBackupCapture?.(entry.name, backup, oldCapture);
  await restoreCaptureExclusively(oldCapture, target, entry.name);
  await assertRecordedOldTarget(target, entry);
  return persistEntryStatus(outputRoot, journal, index, "restored");
}

async function cleanupUnjournaledEntries(
  outputRoot: string,
  entries: readonly ReportTransactionEntry[],
): Promise<void> {
  for (const entry of entries) {
    await removeRegularAuxiliary(resolve(outputRoot, entry.stagedName));
    await removeRegularAuxiliary(resolve(outputRoot, entry.backupName));
    await removeRegularAuxiliary(resolve(outputRoot, entry.newLinkName));
    await removeRegularAuxiliary(resolve(outputRoot, entry.targetCaptureName));
    await removeRegularAuxiliary(resolve(outputRoot, entry.rollbackCaptureName));
  }
}

async function removeRegularAuxiliary(path: string): Promise<void> {
  const info = await lstat(path).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return undefined;
    throw cause;
  });
  if (!info) return;
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Refusing to remove non-regular transaction file: ${basename(path)}.`);
  }
  await rm(path);
}

async function removeIfSameFile(target: string, source: string): Promise<void> {
  if (await sameFile(target, source)) {
    await rm(target, { force: true });
  }
}

async function removeOwnedFixedControlFile(
  target: string,
  ownerPath: string,
): Promise<void> {
  const capturedPath = resolve(
    dirname(target),
    `.p515-report-refresh.lock-release-${randomUUID()}`,
  );
  try {
    await rename(target, capturedPath);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
    throw cause;
  }
  if (!await sameFile(capturedPath, ownerPath)) {
    await restoreCapturedControlFile(capturedPath, target);
    await rm(capturedPath);
    throw new Error("Report refresh lock ownership changed during release.");
  }
  await rm(capturedPath);
}

async function restoreCapturedControlFile(
  capturedPath: string,
  fixedPath: string,
): Promise<void> {
  try {
    await link(capturedPath, fixedPath);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Control file changed during atomic capture: ${basename(fixedPath)}.`,
        { cause },
      );
    }
    throw cause;
  }
}

async function sameFile(left: string, right: string): Promise<boolean> {
  const [leftInfo, rightInfo] = await Promise.all([
    stat(left).catch(() => undefined),
    stat(right).catch(() => undefined),
  ]);
  return Boolean(
    leftInfo
    && rightInfo
    && leftInfo.dev === rightInfo.dev
    && leftInfo.ino === rightInfo.ino,
  );
}

async function assertRegularFile(path: string): Promise<void> {
  const info = await lstat(path).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return undefined;
    throw cause;
  });
  if (!info || !info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Artifact target must be an existing regular file: ${basename(path)}.`);
  }
}

async function assertAbsent(path: string): Promise<void> {
  if (await access(path).then(() => true, () => false)) {
    throw new Error(`Exclusive artifact already exists: ${basename(path)}.`);
  }
  const info = await lstat(path).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return undefined;
    throw cause;
  });
  if (info) {
    throw new Error(`Exclusive artifact already exists: ${basename(path)}.`);
  }
}

async function pathExistsLstat(path: string): Promise<boolean> {
  return lstat(path).then(() => true, (cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return false;
    throw cause;
  });
}

async function hashFile(path: string): Promise<string> {
  return sha256Text(await readFile(path));
}

function sha256Text(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
