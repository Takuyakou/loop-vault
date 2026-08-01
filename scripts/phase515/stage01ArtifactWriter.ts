import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  assertSafePhase515ReportRoot,
  withPhase515ArtifactOperationLock,
} from "./artifactWriter";
import { findPrivacyIssuesInText } from "./privacy";

export const STAGE01_ARTIFACT_NAMES = [
  "01-corpus-lock-binding.json",
  "01-evidence-dedup-report.md",
] as const;
export type Stage01ArtifactName = (typeof STAGE01_ARTIFACT_NAMES)[number];
export const STAGE01_ARTIFACT_DURABILITY = Object.freeze({
  contract: "PROCESS_CRASH_RECOVERABLE" as const,
  powerLossDurabilityGuaranteed: false as const,
});

const JOURNAL_NAME = ".p515-stage01-artifact.journal.json";
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

interface FileEvidence {
  sha256: string;
  dev: string;
  ino: string;
}

type OriginalEvidence = { state: "absent" } | ({ state: "present" } & FileEvidence);
export type Stage01TransactionPhase =
  | "prepared"
  | "temp-written"
  | "temp-synced"
  | "original-backed-up-or-absent"
  | "target-promoted"
  | "target-synced"
  | "commit-complete"
  | "rollback-requested"
  | "rollback-complete"
  | "cleanup-complete";
export type Stage01LowLevelOperation =
  | "backup-link"
  | "target-promote-rename"
  | "rollback-restore-rename"
  | "file-unlink"
  | "file-fsync"
  | "journal-write"
  | "journal-fsync"
  | "journal-replace"
  | "directory-fsync";
export interface Stage01LowLevelCheckpoint {
  /** Static code-site identity plus a per-invocation occurrence suffix. */
  id: string;
  siteId: string;
  operation: Stage01LowLevelOperation;
  phase: Stage01TransactionPhase | "none";
  context: string;
  pathRole: string;
  occurrence: number;
}

const JOURNAL_CHECKPOINT_PHASES = [
  ["commit", "prepared"], ["commit", "temp-written"], ["commit", "temp-synced"],
  ["commit", "original-backed-up-or-absent"], ["commit", "target-promoted"],
  ["commit", "target-synced"], ["commit", "commit-complete"],
  ["commit", "cleanup-complete"], ["rollback", "rollback-requested"],
  ["rollback", "rollback-complete"], ["rollback", "cleanup-complete"],
] as const;
const JOURNAL_CHECKPOINT_OPERATIONS = [
  ["temp-write", "journal-write", "journal-temporary"],
  ["temp-fsync", "journal-fsync", "journal-temporary"],
  ["replace", "journal-replace", "journal"],
  ["directory-fsync", "directory-fsync", "report-directory"],
  ["temp-unlink", "file-unlink", "journal-temporary"],
] as const;

/** Every statically reachable low-level operation site in the Stage 01 writer. */
export const STAGE01_LOW_LEVEL_CHECKPOINT_MANIFEST = Object.freeze([
  ...JOURNAL_CHECKPOINT_PHASES.flatMap(([intent, phase]) =>
    JOURNAL_CHECKPOINT_OPERATIONS.map(([suffix, operation, pathRole]) => ({
      siteId: `journal.${intent}.${phase}.${suffix}`,
      operation,
      phase,
      context: `${intent}-journal`,
      pathRole,
    }))),
  ...[
    ["transaction.start.directory-fsync", "directory-fsync", "none", "transaction-start", "report-directory"],
    ["prepare.temporary.file-fsync", "file-fsync", "temp-written", "commit-preparation", "temporary"],
    ["prepare.backup.link", "backup-link", "temp-synced", "commit-preparation", "backup"],
    ["prepare.backup.file-fsync", "file-fsync", "temp-synced", "commit-preparation", "backup"],
    ["recovery.prepare.temporary.file-fsync", "file-fsync", "temp-written", "recovery-preparation", "temporary"],
    ["recovery.prepare.backup.link", "backup-link", "temp-synced", "recovery-preparation", "backup"],
    ["recovery.prepare.backup.file-fsync", "file-fsync", "temp-synced", "recovery-preparation", "backup"],
    ["commit.promote.target.rename", "target-promote-rename", "original-backed-up-or-absent", "commit-promotion", "target"],
    ["commit.promote.directory-fsync", "directory-fsync", "original-backed-up-or-absent", "commit-promotion", "report-directory"],
    ["commit.target.file-fsync", "file-fsync", "target-promoted", "commit", "target"],
    ["rollback.restore-over-new.rename", "rollback-restore-rename", "rollback-requested", "rollback-new-target", "target"],
    ["rollback.restore-over-new.directory-fsync", "directory-fsync", "rollback-requested", "rollback-new-target", "report-directory"],
    ["rollback.restore-absent.rename", "rollback-restore-rename", "rollback-requested", "rollback-absent-target", "target"],
    ["rollback.restore-absent.directory-fsync", "directory-fsync", "rollback-requested", "rollback-absent-target", "report-directory"],
    ["rollback.target.file-fsync", "file-fsync", "rollback-requested", "rollback", "target"],
    ["rollback.remove-target.unlink", "file-unlink", "rollback-requested", "rollback", "target"],
    ["rollback.remove-target.directory-fsync", "directory-fsync", "rollback-requested", "rollback", "report-directory"],
    ...(["commit", "rollback"] as const).flatMap((intent) => [
      [`cleanup.${intent}.backup.unlink`, "file-unlink", "cleanup-complete", `${intent}-cleanup`, "backup"],
      [`cleanup.${intent}.helpers.directory-fsync`, "directory-fsync", "cleanup-complete", `${intent}-cleanup`, "report-directory"],
      [`cleanup.${intent}.journal.unlink`, "file-unlink", "cleanup-complete", `${intent}-cleanup`, "journal"],
      [`cleanup.${intent}.journal.directory-fsync`, "directory-fsync", "cleanup-complete", `${intent}-cleanup`, "report-directory"],
    ]),
    ["cleanup.rollback.temporary.unlink", "file-unlink", "cleanup-complete", "rollback-cleanup", "temporary"],
    ...(["temporary", "backup", "journal-temporary"] as const).flatMap((role) => [
      [`recovery.orphan.${role}.unlink`, "file-unlink", "none", "orphan-recovery", role],
    ]),
    ["recovery.orphan.directory-fsync", "directory-fsync", "none", "orphan-recovery", "report-directory"],
  ].map(([siteId, operation, phase, context, pathRole]) => ({
    siteId,
    operation: operation as Stage01LowLevelOperation,
    phase: phase as Stage01TransactionPhase | "none",
    context,
    pathRole,
  })) as Array<Omit<Stage01LowLevelCheckpoint, "id" | "occurrence">>,
] satisfies ReadonlyArray<Omit<Stage01LowLevelCheckpoint, "id" | "occurrence">>);

const checkpointManifestById = new Map(
  STAGE01_LOW_LEVEL_CHECKPOINT_MANIFEST.map((item) => [item.siteId, item]),
);
if (checkpointManifestById.size !== STAGE01_LOW_LEVEL_CHECKPOINT_MANIFEST.length) {
  throw new Error("Stage 01 low-level checkpoint manifest contains duplicate site IDs.");
}
const checkpointOccurrences = new WeakMap<object, Map<string, number>>();

interface Stage01Journal {
  schemaVersion: 2;
  operationId: string;
  name: Stage01ArtifactName;
  intent: "commit" | "rollback";
  phase: Stage01TransactionPhase;
  targetName: Stage01ArtifactName;
  temporaryName: string;
  backupName: string;
  payloadSha256: string;
  original: OriginalEvidence;
  temporaryEvidence: FileEvidence | null;
  durabilityContract: "PROCESS_CRASH_RECOVERABLE";
  directorySyncEvidence: "SUPPORTED_AT_TRANSACTION_START" | "UNSUPPORTED_BY_NODE_PLATFORM";
}

export interface Stage01ArtifactWriterOptions {
  afterTemporarySync?: (temporaryPath: string) => void | Promise<void>;
  whileLocked?: () => void | Promise<void>;
  beforePromotion?: (backupPath: string | null) => void | Promise<void>;
  afterAtomicPromotion?: (targetPath: string) => void | Promise<void>;
  /** Fault-injection hook after rollback mutates the target, before phase persistence. */
  afterRollbackMutation?: (targetPath: string) => void | Promise<void>;
  /** Fault-injection hook. Production callers must leave this unset. */
  afterPhase?: (phase: Stage01TransactionPhase) => void | Promise<void>;
  /** Low-level crash-injection hook. Production callers must leave this unset. */
  beforeOperation?: (checkpoint: Stage01LowLevelCheckpoint) => void | Promise<void>;
  /** Low-level crash-injection hook. Production callers must leave this unset. */
  afterOperation?: (checkpoint: Stage01LowLevelCheckpoint) => void | Promise<void>;
}

/** Publish one fixed artifact through a durable, crash-reentrant transaction. */
export async function writeStage01Artifact(
  repositoryRoot: string,
  name: Stage01ArtifactName,
  text: string,
  options: Stage01ArtifactWriterOptions = {},
): Promise<void> {
  validateArtifact(name, text);
  await withPhase515ArtifactOperationLock(repositoryRoot, async (outputRoot) => {
    await recoverStage01Transaction(outputRoot, options);
    await options.whileLocked?.();
    await assertSafePhase515ReportRoot(repositoryRoot, resolve(repositoryRoot, "docs/phase5.15"));
    const target = resolve(outputRoot, name);
    await assertRegularOrAbsent(target);
    let journal: Stage01Journal | null = null;
    try {
      journal = await beginTransaction(outputRoot, target, name, text, randomUUID(), options);
      await continueCommit(outputRoot, journal, options);
    } catch (cause) {
      const journalPresent = await exists(resolve(outputRoot, JOURNAL_NAME));
      if (journalPresent) {
        try {
          const current = parseJournal(await readFile(resolve(outputRoot, JOURNAL_NAME), "utf8"));
          if (current.phase === "commit-complete" || current.phase === "cleanup-complete") {
            await recoverStage01Transaction(outputRoot, options);
          } else {
            await persistPhase(outputRoot, { ...current, intent: "rollback", phase: "rollback-requested" }, options);
            await recoverStage01Transaction(outputRoot, options);
          }
        } catch (recoveryCause) {
          throw new AggregateError(
            [cause, recoveryCause],
            "Stage 01 artifact write failed and exact recovery could not complete.",
            { cause: recoveryCause },
          );
        }
      } else if (journal) {
        await cleanupNames(outputRoot, journal, options);
      }
      throw cause;
    }
  });
}

/** Recover one interrupted Stage 01 transaction without publishing a new artifact. */
export async function recoverStage01ArtifactTransaction(
  repositoryRoot: string,
  options: Stage01ArtifactWriterOptions = {},
): Promise<typeof STAGE01_ARTIFACT_DURABILITY> {
  await withPhase515ArtifactOperationLock(repositoryRoot, async (outputRoot) => {
    await recoverStage01Transaction(outputRoot, options);
  });
  return STAGE01_ARTIFACT_DURABILITY;
}

async function beginTransaction(
  outputRoot: string,
  target: string,
  name: Stage01ArtifactName,
  text: string,
  operationId: string,
  options: Stage01ArtifactWriterOptions,
): Promise<Stage01Journal> {
  const names = transactionNames(operationId, name);
  const original = await originalEvidence(target);
  const directorySyncSupported = await syncDirectory(
    outputRoot,
    options,
    "transaction.start.directory-fsync",
  );
  let journal: Stage01Journal = {
    schemaVersion: 2,
    operationId,
    name,
    intent: "commit",
    phase: "prepared",
    targetName: name,
    temporaryName: names.temporaryName,
    backupName: names.backupName,
    payloadSha256: sha256(text),
    original,
    temporaryEvidence: null,
    durabilityContract: STAGE01_ARTIFACT_DURABILITY.contract,
    directorySyncEvidence: directorySyncSupported
      ? "SUPPORTED_AT_TRANSACTION_START" : "UNSUPPORTED_BY_NODE_PLATFORM",
  };
  await writeJournalExclusive(outputRoot, journal, options);
  await options.afterPhase?.("prepared");

  const temporary = transactionPath(outputRoot, journal.temporaryName);
  let handle;
  try {
    handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    await handle.writeFile(text, { encoding: "utf8" });
    await handle.close();
    handle = undefined;
    journal = await persistPhase(outputRoot, { ...journal, phase: "temp-written" }, options);
    await syncFile(temporary, options, "prepare.temporary.file-fsync");
    const temporaryEvidence = await evidence(temporary);
    if (temporaryEvidence.sha256 !== journal.payloadSha256) {
      throw new Error("Stage 01 temporary payload hash mismatch.");
    }
    journal = await persistPhase(outputRoot, { ...journal, phase: "temp-synced", temporaryEvidence }, options);
    await options.afterTemporarySync?.(temporary);

    if (original.state === "present") {
      const backup = transactionPath(outputRoot, journal.backupName);
      await hookedOperation(options, "prepare.backup.link", () => link(target, backup));
      await syncFile(backup, options, "prepare.backup.file-fsync");
      await assertEvidence(backup, original, "Stage 01 original backup");
      await assertSameFile(target, backup, "Stage 01 backup identity mismatch");
    } else {
      await assertAbsent(target);
    }
    return persistPhase(outputRoot, { ...journal, phase: "original-backed-up-or-absent" }, options);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function continueCommit(
  outputRoot: string,
  initial: Stage01Journal,
  options: Stage01ArtifactWriterOptions = {},
): Promise<void> {
  let journal = initial;
  const target = transactionPath(outputRoot, journal.targetName);
  const temporary = transactionPath(outputRoot, journal.temporaryName);
  const backup = transactionPath(outputRoot, journal.backupName);

  if (journal.intent === "rollback") {
    await continueRollback(outputRoot, journal, options);
    return;
  }
  const targetKind = await identifyTarget(target, journal);
  if (targetKind === "unknown") throw new Error("Stage 01 recovery found unknown target evidence.");
  if (targetKind === "new") {
    if (!phaseAtLeast(journal.phase, "target-promoted")) {
      journal = await persistPhase(outputRoot, { ...journal, phase: "target-promoted" }, options);
    }
  } else if (phaseAtLeast(journal.phase, "target-promoted")) {
    throw new Error("Stage 01 promoted transaction no longer has its recorded target.");
  }

  if (!phaseAtLeast(journal.phase, "original-backed-up-or-absent")) {
    const resumed = await resumePreparation(outputRoot, journal, options);
    if (!resumed) return;
    journal = resumed;
  }
  if (targetKind !== "new") {
    await assertTemporary(journal, temporary);
    await options.beforePromotion?.(journal.original.state === "present" ? backup : null);
    if (journal.original.state === "present") {
      await assertEvidence(backup, journal.original, "Stage 01 recovery backup");
      await assertEvidence(target, journal.original, "Stage 01 target before promotion");
      await assertSameFile(target, backup, "Stage 01 target changed before promotion");
    } else {
      await assertAbsent(target);
    }
    await hookedOperation(options, "commit.promote.target.rename", () => rename(temporary, target));
    await syncDirectory(outputRoot, options, "commit.promote.directory-fsync");
    await assertPayloadTarget(target, journal);
    journal = await persistPhase(outputRoot, { ...journal, phase: "target-promoted" }, options);
    await options.afterAtomicPromotion?.(target);
  }
  await syncFile(target, options, "commit.target.file-fsync");
  journal = await persistPhase(outputRoot, { ...journal, phase: "target-synced" }, options);
  journal = await persistPhase(outputRoot, { ...journal, phase: "commit-complete" }, options);
  await finishCleanup(outputRoot, journal, options);
}

async function resumePreparation(
  outputRoot: string,
  initial: Stage01Journal,
  options: Stage01ArtifactWriterOptions,
): Promise<Stage01Journal | null> {
  let journal = initial;
  const target = transactionPath(outputRoot, journal.targetName);
  const temporary = transactionPath(outputRoot, journal.temporaryName);
  const backup = transactionPath(outputRoot, journal.backupName);
  if (!await exists(temporary)) {
    await requestRollback(outputRoot, journal, options);
    return null;
  }
  const actualTemporary = await evidence(temporary);
  if (actualTemporary.sha256 !== journal.payloadSha256) {
    // A partial or replaced temporary is retained with the journal as evidence.
    throw new Error("Stage 01 recovery found invalid temporary evidence.");
  }
  if (journal.temporaryEvidence && !sameEvidence(actualTemporary, journal.temporaryEvidence)) {
    throw new Error("Stage 01 recovery temporary identity changed.");
  }
  if (!journal.temporaryEvidence) {
    await syncFile(temporary, options, "recovery.prepare.temporary.file-fsync");
    journal = await persistPhase(
      outputRoot,
      { ...journal, phase: "temp-synced", temporaryEvidence: actualTemporary },
      options,
    );
  }
  if (journal.original.state === "present") {
    await assertEvidence(target, journal.original, "Stage 01 recovery original target");
    if (await exists(backup)) {
      await assertEvidence(backup, journal.original, "Stage 01 recovery backup");
      await assertSameFile(target, backup, "Stage 01 recovery backup identity mismatch");
    } else {
      await hookedOperation(options, "recovery.prepare.backup.link", () => link(target, backup));
      await syncFile(backup, options, "recovery.prepare.backup.file-fsync");
      await assertEvidence(backup, journal.original, "Stage 01 recovery backup");
    }
  } else {
    await assertAbsent(target);
    if (await exists(backup)) throw new Error("Absent Stage 01 original has an unexpected backup.");
  }
  return persistPhase(outputRoot, { ...journal, phase: "original-backed-up-or-absent" }, options);
}

async function requestRollback(
  outputRoot: string,
  journal: Stage01Journal,
  options: Stage01ArtifactWriterOptions,
): Promise<void> {
  const requested = await persistPhase(
    outputRoot,
    { ...journal, intent: "rollback", phase: "rollback-requested" },
    options,
  );
  await continueRollback(outputRoot, requested, options);
}

async function continueRollback(
  outputRoot: string,
  journal: Stage01Journal,
  options: Stage01ArtifactWriterOptions = {},
): Promise<void> {
  if (journal.intent !== "rollback" || journal.phase !== "rollback-requested") {
    if (journal.phase === "rollback-complete" || journal.phase === "cleanup-complete") {
      if (journal.phase === "rollback-complete") await finishCleanup(outputRoot, journal, options);
      else await finalizeCleanup(outputRoot, journal, options);
      return;
    }
    journal = await persistPhase(
      outputRoot,
      { ...journal, intent: "rollback", phase: "rollback-requested" },
      options,
    );
  }
  const target = transactionPath(outputRoot, journal.targetName);
  const backup = transactionPath(outputRoot, journal.backupName);
  const kind = await identifyTarget(target, journal);
  if (kind === "unknown") throw new Error("Stage 01 rollback found unknown target evidence.");

  if (journal.original.state === "present") {
    if (kind === "new") {
      await assertEvidence(backup, journal.original, "Stage 01 rollback backup");
      await hookedOperation(options, "rollback.restore-over-new.rename", () => rename(backup, target));
      await syncDirectory(outputRoot, options, "rollback.restore-over-new.directory-fsync");
      await options.afterRollbackMutation?.(target);
    } else if (kind === "absent") {
      // Missing target is only recoverable from the exact retained backup.
      await assertEvidence(backup, journal.original, "Stage 01 rollback backup");
      await hookedOperation(options, "rollback.restore-absent.rename", () => rename(backup, target));
      await syncDirectory(outputRoot, options, "rollback.restore-absent.directory-fsync");
      await options.afterRollbackMutation?.(target);
    }
    await assertEvidence(target, journal.original, "rolled-back Stage 01 target");
    await syncFile(target, options, "rollback.target.file-fsync");
  } else {
    // rollback-requested is durable before unlink. A crash after unlink leaves
    // journal+missing target, which is a valid and idempotent rollback state.
    if (kind === "new") {
      await removeRegularFile(target, options, "rollback.remove-target.unlink");
      await syncDirectory(outputRoot, options, "rollback.remove-target.directory-fsync");
      await options.afterRollbackMutation?.(target);
    }
    await assertAbsent(target);
  }
  journal = await persistPhase(outputRoot, { ...journal, phase: "rollback-complete" }, options);
  await finishCleanup(outputRoot, journal, options);
}

async function recoverStage01Transaction(
  outputRoot: string,
  options: Stage01ArtifactWriterOptions = {},
): Promise<void> {
  const journalPath = resolve(outputRoot, JOURNAL_NAME);
  const info = await lstat(journalPath).catch(missingOnly);
  if (!info) {
    await cleanupStage01Orphans(outputRoot, null, options);
    return;
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error("Stage 01 artifact journal must be a regular file.");
  }
  const journal = parseJournal(await readFile(journalPath, "utf8"));
  await cleanupStage01Orphans(outputRoot, journal, options);
  if (["commit-complete", "rollback-complete", "cleanup-complete"].includes(journal.phase)) {
    await validateTerminalTransaction(outputRoot, journal);
  }
  if (journal.phase === "cleanup-complete") {
    await finalizeCleanup(outputRoot, journal, options);
  } else if (journal.intent === "commit" && journal.phase === "commit-complete") {
    await finishCleanup(outputRoot, journal, options);
  } else if (journal.intent === "rollback" || journal.phase === "rollback-requested" || journal.phase === "rollback-complete") {
    await continueRollback(outputRoot, journal, options);
  } else {
    await continueCommit(outputRoot, journal, options);
  }
}

async function validateTerminalTransaction(outputRoot: string, journal: Stage01Journal) {
  const target = transactionPath(outputRoot, journal.targetName);
  const temporary = transactionPath(outputRoot, journal.temporaryName);
  const backup = transactionPath(outputRoot, journal.backupName);
  const kind = await identifyTarget(target, journal);
  const committed = journal.intent === "commit"
    && (journal.phase === "commit-complete" || journal.phase === "cleanup-complete");
  const rolledBack = journal.intent === "rollback"
    && (journal.phase === "rollback-complete" || journal.phase === "cleanup-complete");
  const expected = committed ? "new"
    : rolledBack && journal.original.state === "present" ? "old"
      : rolledBack ? "absent" : "unknown";
  if (kind !== expected) {
    throw new Error(`Stage 01 terminal ${journal.intent} outcome evidence mismatch.`);
  }
  const temporaryPresent = await exists(temporary);
  const backupPresent = await exists(backup);
  if (journal.phase === "commit-complete" && temporaryPresent) {
    throw new Error("Stage 01 commit-complete journal retains its promoted temporary.");
  }
  if (journal.phase === "commit-complete"
    && (backupPresent !== (journal.original.state === "present"))) {
    throw new Error("Stage 01 commit-complete rollback-source presence is inconsistent.");
  }
  if (temporaryPresent) await assertTemporary(journal, temporary);
  if (backupPresent) {
    if (journal.original.state !== "present") {
      throw new Error("Stage 01 absent original has unexpected terminal backup evidence.");
    }
    await assertEvidence(backup, journal.original, "Stage 01 terminal backup");
  }
}

async function finishCleanup(
  outputRoot: string,
  journal: Stage01Journal,
  options: Stage01ArtifactWriterOptions,
): Promise<void> {
  const cleanupComplete = await persistPhase(
    outputRoot,
    { ...journal, phase: "cleanup-complete" },
    options,
  );
  await finalizeCleanup(outputRoot, cleanupComplete, options);
}

async function finalizeCleanup(
  outputRoot: string,
  journal: Stage01Journal,
  options: Stage01ArtifactWriterOptions,
): Promise<void> {
  await cleanupNames(outputRoot, journal, options);
  await syncDirectory(outputRoot, options, `cleanup.${journal.intent}.helpers.directory-fsync`);
  await removeJournal(outputRoot, journal, options);
}

async function removeJournal(
  outputRoot: string,
  journal: Stage01Journal,
  options: Stage01ArtifactWriterOptions,
) {
  await removeRegularFile(
    resolve(outputRoot, JOURNAL_NAME),
    options,
    `cleanup.${journal.intent}.journal.unlink`,
  );
  await syncDirectory(outputRoot, options, `cleanup.${journal.intent}.journal.directory-fsync`);
}

async function cleanupStage01Orphans(
  outputRoot: string,
  journal: Stage01Journal | null,
  options: Stage01ArtifactWriterOptions,
) {
  const retained = journal
    ? new Set(Object.values(transactionNames(journal.operationId, journal.name)))
    : new Set<string>();
  let removed = false;
  for (const name of await readdir(outputRoot)) {
    if (retained.has(name) || !isStage01OrphanName(name)) continue;
    const role = name.includes(".new-") ? "temporary"
      : name.includes(".old-") ? "backup" : "journal-temporary";
    await removeRegularFile(
      transactionPath(outputRoot, name),
      options,
      `recovery.orphan.${role}.unlink`,
    );
    removed = true;
  }
  if (removed) await syncDirectory(outputRoot, options, "recovery.orphan.directory-fsync");
}

function parseJournal(text: string): Stage01Journal {
  let value: unknown;
  try { value = JSON.parse(text); } catch {
    throw new Error("Malformed Stage 01 artifact journal; recovery is fail-closed.");
  }
  if (!value || typeof value !== "object") {
    throw new Error("Invalid Stage 01 artifact journal; recovery is fail-closed.");
  }
  const journal = value as Partial<Stage01Journal>;
  const allowed = new Set([
    "schemaVersion", "operationId", "name", "intent", "phase", "targetName",
    "temporaryName", "backupName", "payloadSha256", "original", "temporaryEvidence",
    "durabilityContract", "directorySyncEvidence",
  ]);
  const phases: Stage01TransactionPhase[] = [
    "prepared", "temp-written", "temp-synced", "original-backed-up-or-absent",
    "target-promoted", "target-synced", "commit-complete", "rollback-requested",
    "rollback-complete", "cleanup-complete",
  ];
  const commitPhases: readonly Stage01TransactionPhase[] = [
    "prepared", "temp-written", "temp-synced", "original-backed-up-or-absent",
    "target-promoted", "target-synced", "commit-complete", "cleanup-complete",
  ];
  const rollbackPhases: readonly Stage01TransactionPhase[] = [
    "rollback-requested", "rollback-complete", "cleanup-complete",
  ];
  if (journal.schemaVersion !== 2
    || typeof journal.operationId !== "string"
    || !new RegExp(`^${UUID_PATTERN}$`, "iu").test(journal.operationId)
    || !STAGE01_ARTIFACT_NAMES.includes(journal.name as Stage01ArtifactName)
    || journal.targetName !== journal.name
    || !["commit", "rollback"].includes(journal.intent ?? "")
    || !phases.includes(journal.phase as Stage01TransactionPhase)
    || (journal.intent === "commit" && !commitPhases.includes(journal.phase as Stage01TransactionPhase))
    || (journal.intent === "rollback" && !rollbackPhases.includes(journal.phase as Stage01TransactionPhase))
    || typeof journal.payloadSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(journal.payloadSha256)
    || !isOriginalEvidence(journal.original)
    || !(journal.temporaryEvidence === null || isEvidence(journal.temporaryEvidence))
    || journal.durabilityContract !== "PROCESS_CRASH_RECOVERABLE"
    || !["SUPPORTED_AT_TRANSACTION_START", "UNSUPPORTED_BY_NODE_PLATFORM"]
      .includes(journal.directorySyncEvidence ?? "")
    || Object.keys(journal).some((key) => !allowed.has(key))) {
    throw new Error("Invalid Stage 01 artifact journal; recovery is fail-closed.");
  }
  if ((journal.phase === "prepared" || journal.phase === "temp-written") && journal.temporaryEvidence !== null) {
    throw new Error("Stage 01 journal contains premature temporary evidence.");
  }
  if (phaseAtLeast(journal.phase as Stage01TransactionPhase, "temp-synced")
    && !["rollback-requested", "rollback-complete", "cleanup-complete"].includes(journal.phase!)
    && !isEvidence(journal.temporaryEvidence)) {
    throw new Error("Stage 01 journal is missing synced temporary evidence.");
  }
  const expected = transactionNames(journal.operationId, journal.name as Stage01ArtifactName);
  if (journal.temporaryName !== expected.temporaryName || journal.backupName !== expected.backupName) {
    throw new Error("Stage 01 artifact journal helper basenames are invalid.");
  }
  return journal as Stage01Journal;
}

function transactionNames(operationId: string, name: Stage01ArtifactName) {
  const prefix = `.p515-stage01-txn-${operationId}`;
  return { temporaryName: `${prefix}.new-${name}`, backupName: `${prefix}.old-${name}` };
}

function isStage01OrphanName(name: string): boolean {
  const artifact = "(?:01-corpus-lock-binding\\.json|01-evidence-dedup-report\\.md)";
  return new RegExp(`^\\.p515-stage01-txn-${UUID_PATTERN}\\.(?:new|old)-${artifact}$`, "iu").test(name)
    || new RegExp(`^\\.p515-stage01-journal-${UUID_PATTERN}\\.tmp$`, "iu").test(name);
}

function transactionPath(outputRoot: string, name: string): string {
  if (basename(name) !== name || dirname(resolve(outputRoot, name)) !== resolve(outputRoot)) {
    throw new Error("Stage 01 transaction helper escaped its fixed directory.");
  }
  return resolve(outputRoot, name);
}

async function writeJournalExclusive(
  outputRoot: string,
  journal: Stage01Journal,
  options: Stage01ArtifactWriterOptions,
) {
  const path = resolve(outputRoot, JOURNAL_NAME);
  if (await exists(path)) throw new Error("Stage 01 artifact journal already exists.");
  await replaceJournal(outputRoot, journal, options);
}

async function persistPhase(
  outputRoot: string,
  journal: Stage01Journal,
  options: Stage01ArtifactWriterOptions,
): Promise<Stage01Journal> {
  await replaceJournal(outputRoot, journal, options);
  await options.afterPhase?.(journal.phase);
  return journal;
}

async function replaceJournal(
  outputRoot: string,
  journal: Stage01Journal,
  options: Stage01ArtifactWriterOptions,
) {
  const target = resolve(outputRoot, JOURNAL_NAME);
  const temporary = resolve(outputRoot, `.p515-stage01-journal-${randomUUID()}.tmp`);
  const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  const journalSite = (suffix: string) => `journal.${journal.intent}.${journal.phase}.${suffix}`;
  try {
    await hookedOperation(options, journalSite("temp-write"), () =>
      handle.writeFile(`${JSON.stringify(journal)}\n`, "utf8"));
    await hookedOperation(options, journalSite("temp-fsync"), () => handle.sync());
    await handle.close();
    await hookedOperation(options, journalSite("replace"), () => rename(temporary, target));
    await syncDirectory(outputRoot, options, journalSite("directory-fsync"));
  } finally {
    await handle.close().catch(() => undefined);
    if (await exists(temporary)) {
      await removeRegularFile(temporary, options, journalSite("temp-unlink"));
    }
  }
}

async function cleanupNames(
  outputRoot: string,
  journal: Stage01Journal,
  options: Stage01ArtifactWriterOptions = {},
) {
  const names = transactionNames(journal.operationId, journal.name);
  await removeRegularFile(
    transactionPath(outputRoot, names.temporaryName),
    options,
    `cleanup.${journal.intent}.temporary.unlink`,
  );
  await removeRegularFile(
    transactionPath(outputRoot, names.backupName),
    options,
    `cleanup.${journal.intent}.backup.unlink`,
  );
}

async function removeRegularFile(
  path: string,
  options: Stage01ArtifactWriterOptions,
  checkpointSiteId: string,
) {
  const info = await lstat(path).catch(missingOnly);
  if (!info) return;
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Refusing to remove non-regular Stage 01 helper: ${basename(path)}.`);
  }
  await hookedOperation(options, checkpointSiteId, () => rm(path));
}

async function syncFile(
  path: string,
  options: Stage01ArtifactWriterOptions,
  checkpointSiteId: string,
) {
  const handle = await open(path, constants.O_RDWR);
  try { await hookedOperation(options, checkpointSiteId, () => handle.sync()); } finally { await handle.close(); }
}

async function syncDirectory(
  path: string,
  options: Stage01ArtifactWriterOptions,
  checkpointSiteId: string,
): Promise<boolean> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, constants.O_RDONLY);
    const openedDirectory = handle;
    return await hookedOperation(options, checkpointSiteId, async () => {
      try {
        await openedDirectory.sync();
        return true;
      } catch (cause) {
        if (!(["EINVAL", "ENOTSUP", "EPERM", "EISDIR"] as Array<string | undefined>)
          .includes((cause as NodeJS.ErrnoException).code)) throw cause;
        return false;
      }
    });
  } catch (cause) {
    if (!(["EINVAL", "ENOTSUP", "EPERM", "EISDIR"] as Array<string | undefined>)
      .includes((cause as NodeJS.ErrnoException).code)) throw cause;
    return false;
  } finally { await handle?.close().catch(() => undefined); }
}

async function hookedOperation<T>(
  options: Stage01ArtifactWriterOptions,
  siteId: string,
  action: () => Promise<T>,
): Promise<T> {
  const definition = checkpointManifestById.get(siteId);
  if (!definition) throw new Error(`Unmanifested Stage 01 low-level checkpoint: ${siteId}.`);
  let occurrences = checkpointOccurrences.get(options);
  if (!occurrences) {
    occurrences = new Map();
    checkpointOccurrences.set(options, occurrences);
  }
  const occurrence = (occurrences.get(siteId) ?? 0) + 1;
  occurrences.set(siteId, occurrence);
  const checkpoint: Stage01LowLevelCheckpoint = {
    ...definition,
    id: `${siteId}#${occurrence}`,
    occurrence,
  };
  await options.beforeOperation?.(checkpoint);
  const result = await action();
  await options.afterOperation?.(checkpoint);
  return result;
}

async function originalEvidence(path: string): Promise<OriginalEvidence> {
  const info = await lstat(path).catch(missingOnly);
  if (!info) return { state: "absent" };
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Stage 01 target must be regular or absent.");
  return { state: "present", ...await evidence(path) };
}

async function evidence(path: string): Promise<FileEvidence> {
  const [info, bytes] = await Promise.all([stat(path), readFile(path)]);
  if (!info.isFile()) throw new Error(`Stage 01 evidence is not a file: ${basename(path)}.`);
  return { sha256: createHash("sha256").update(bytes).digest("hex"), dev: String(info.dev), ino: String(info.ino) };
}

async function identifyTarget(path: string, journal: Stage01Journal): Promise<"absent" | "old" | "new" | "unknown"> {
  const info = await lstat(path).catch(missingOnly);
  if (!info) return "absent";
  if (!info.isFile() || info.isSymbolicLink()) return "unknown";
  const actual = await evidence(path);
  if (journal.original.state === "present" && sameEvidence(actual, journal.original)) return "old";
  if (journal.temporaryEvidence
    && actual.sha256 === journal.payloadSha256
    && sameEvidence(actual, journal.temporaryEvidence)) return "new";
  return "unknown";
}

async function assertTemporary(journal: Stage01Journal, path: string) {
  if (!journal.temporaryEvidence) throw new Error("Stage 01 transaction lacks temporary evidence.");
  await assertEvidence(path, journal.temporaryEvidence, "Stage 01 temporary source");
  if (journal.temporaryEvidence.sha256 !== journal.payloadSha256) throw new Error("Stage 01 temporary hash mismatch.");
}

async function assertPayloadTarget(path: string, journal: Stage01Journal) {
  const actual = await evidence(path);
  if (actual.sha256 !== journal.payloadSha256
    || (journal.temporaryEvidence && !sameEvidence(actual, journal.temporaryEvidence))) {
    throw new Error("Stage 01 promoted target evidence mismatch.");
  }
}

async function assertEvidence(path: string, expected: FileEvidence, label: string) {
  if (!sameEvidence(await evidence(path), expected)) throw new Error(`${label} evidence mismatch.`);
}

async function assertSameFile(left: string, right: string, message: string) {
  const [a, b] = await Promise.all([stat(left), stat(right)]);
  if (a.dev !== b.dev || a.ino !== b.ino) throw new Error(message);
}

function sameEvidence(left: FileEvidence, right: FileEvidence) {
  return left.sha256 === right.sha256 && left.dev === right.dev && left.ino === right.ino;
}

function isEvidence(value: unknown): value is FileEvidence {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FileEvidence>;
  return typeof item.sha256 === "string" && /^[a-f0-9]{64}$/u.test(item.sha256)
    && typeof item.dev === "string" && /^\d+$/u.test(item.dev)
    && typeof item.ino === "string" && /^\d+$/u.test(item.ino);
}

function isOriginalEvidence(value: unknown): value is OriginalEvidence {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<OriginalEvidence> & Partial<FileEvidence>;
  return item.state === "absent" || (item.state === "present" && isEvidence(item));
}

const phaseOrder: readonly Stage01TransactionPhase[] = [
  "prepared", "temp-written", "temp-synced", "original-backed-up-or-absent",
  "target-promoted", "target-synced", "commit-complete", "cleanup-complete",
];
function phaseAtLeast(actual: Stage01TransactionPhase, expected: Stage01TransactionPhase) {
  const actualIndex = phaseOrder.indexOf(actual);
  const expectedIndex = phaseOrder.indexOf(expected);
  return actualIndex >= 0 && expectedIndex >= 0 && actualIndex >= expectedIndex;
}

function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }

function validateArtifact(name: Stage01ArtifactName, text: string) {
  if (!STAGE01_ARTIFACT_NAMES.includes(name)) throw new Error("Stage 01 artifact name is not allowlisted.");
  if (!text.endsWith("\n") || text.includes("\r")) throw new Error("Stage 01 artifacts must use UTF-8 text with LF and a final newline.");
  if (name.endsWith(".json")) {
    try { JSON.parse(text); } catch (cause) { throw new Error("Stage 01 JSON artifact is malformed.", { cause }); }
  }
  const issues = findPrivacyIssuesInText(text, name);
  if (issues.length > 0) throw new Error(`Stage 01 artifact privacy scan failed: ${JSON.stringify(issues)}`);
}

async function assertRegularOrAbsent(path: string) {
  const info = await lstat(path).catch(missingOnly);
  if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error("Stage 01 artifact target must be absent or a regular file.");
}

async function assertAbsent(path: string) { if (await exists(path)) throw new Error("Stage 01 atomic target unexpectedly exists."); }
async function exists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, (cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return false;
    throw cause;
  });
}
function missingOnly(cause: NodeJS.ErrnoException) { if (cause.code === "ENOENT") return undefined; throw cause; }
