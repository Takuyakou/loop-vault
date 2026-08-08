import {
  generateDegreeExercise,
  type ChordContextHistoryEntry,
  type GeneratorSnapshot,
  type PracticeAttempt,
  type PracticeExercise,
  type PracticeIssue,
  type PracticeRating,
  type PracticeSettings,
  type ReviewQueueItem,
  type RhythmPracticeAttempt,
} from "../domain";
import {
  addChordContextHistoryEntry,
  addCompletedAttempt,
  addCompletedRhythmAttempt,
  JsonPracticeRepository,
  PracticeRepositoryError,
  type PracticeFileV1,
  type PracticeBackupMetadata,
  type PracticeLoadResult,
  type PracticeQuarantine,
  type PracticeRecoveryMetadata,
  type PracticeStorage,
  validatePracticeFile,
} from "../infra/repository";

export function createPracticeControllerIfEnabled(enabled: boolean, storageFactory: () => PracticeStorage): PracticeDataController | undefined {
  return enabled ? new PracticeDataController(new JsonPracticeRepository(storageFactory())) : undefined;
}

export type PracticeDataSnapshot =
  | { readonly status: "disabled" | "loading"; readonly file?: undefined; readonly quarantine: readonly PracticeQuarantine[]; readonly backups?: undefined; readonly error?: undefined }
  | { readonly status: "ready"; readonly file: PracticeFileV1; readonly quarantine: readonly PracticeQuarantine[]; readonly backups?: undefined; readonly error?: string }
  | { readonly status: "recovery-required"; readonly file?: undefined; readonly quarantine: readonly PracticeQuarantine[]; readonly backups: readonly PracticeBackupMetadata[]; readonly recovery: PracticeRecoveryMetadata; readonly error: string }
  | { readonly status: "future-version"; readonly file?: undefined; readonly quarantine: readonly PracticeQuarantine[]; readonly backups?: undefined; readonly error: string }
  | { readonly status: "error"; readonly file?: PracticeFileV1; readonly quarantine: readonly PracticeQuarantine[]; readonly backups: readonly PracticeBackupMetadata[]; readonly error: string };

export interface ClaimedPracticeExercise {
  readonly claimId: string;
  readonly exercise: PracticeExercise;
  readonly sourceAttemptId: string;
  readonly transferOfAttemptId?: string;
  readonly reason: ReviewQueueItem["reason"];
}

export class PracticeDataController {
  private snapshot: PracticeDataSnapshot = { status: "loading", quarantine: [] };
  private readonly listeners = new Set<() => void>();
  private file?: PracticeFileV1;
  private saveQueue = Promise.resolve();

  constructor(private readonly repository: JsonPracticeRepository) {}
  getSnapshot = (): PracticeDataSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };

  async initialize(): Promise<void> {
    this.file = undefined;
    this.publish({ status: "loading", quarantine: [] });
    try {
      const result = await this.repository.load(); this.file = result.file;
      if (result.recovery) {
        this.file = undefined;
        this.publish({ status: "recovery-required", quarantine: [], backups: result.recovery.backups, recovery: result.recovery, error: "Practice data was safely retained because it could not be validated. Choose a validated backup or Start Fresh." });
      } else this.publish({ status: "ready", file: result.file, quarantine: result.quarantine, error: recoveryMessage(result) });
    } catch (error) {
      if (error instanceof PracticeRepositoryError && error.kind === "future-version") {
        this.publish({ status: "future-version", quarantine: [], error: error.message });
      } else this.publish({ status: "error", quarantine: [], backups: await this.safeListBackups(), error: errorMessage(error) });
    }
  }

  recordAttempt(attempt: PracticeAttempt): Promise<void> {
    const operation = this.saveQueue.then(async () => {
      if (!this.file) throw new Error("Practice progress is not ready.");
      try {
        this.file = await this.repository.save(addAttemptAndAcknowledgeClaim(this.file, attempt));
      } catch (error) {
        if (!isStaleRevisionError(error)) throw error;
        const latest = await this.repository.load(); this.file = latest.file;
        if (!this.file.attempts.some(({ id }) => id === attempt.id)) {
          this.file = await this.repository.save(addAttemptAndAcknowledgeClaim(this.file, attempt));
        }
      }
      this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine });
    });
    this.saveQueue = operation.catch(() => undefined);
    return operation.catch((error) => {
      if (this.file) this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine, error: errorMessage(error) });
      throw error;
    });
  }

  recordRhythmAttempt(attempt: RhythmPracticeAttempt): Promise<void> {
    const operation = this.saveQueue.then(async () => {
      if (!this.file) throw new Error("Practice progress is not ready.");
      this.file = await this.persistMutation((file) => addCompletedRhythmAttempt(file, attempt));
      this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine });
    });
    this.saveQueue = operation.catch(() => undefined);
    return operation.catch((error) => {
      if (this.file) this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine, error: errorMessage(error) });
      throw error;
    });
  }

  recordChordContextHistory(entry: ChordContextHistoryEntry): Promise<void> {
    const operation = this.saveQueue.then(async () => {
      if (!this.file) throw new Error("Practice progress is not ready.");
      this.file = await this.persistMutation((file) => addChordContextHistoryEntry(file, entry));
      this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine });
    });
    this.saveQueue = operation.catch(() => undefined);
    return operation.catch((error) => {
      if (this.file) this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine, error: errorMessage(error) });
      throw error;
    });
  }
  claimNextExercise(sessionId: string, now: Date): Promise<ClaimedPracticeExercise | undefined> {
    const operation = this.saveQueue.then(async () => {
      if (!this.file) throw new Error("Practice progress is not ready.");
      const existing = this.file.reviewQueue.find((item) => item.claim?.sessionId === sessionId);
      const item = existing ?? this.file.reviewQueue.find((candidate) => isQueueItemEligible(candidate, this.file!, sessionId, now));
      if (!item) return undefined;
      if (!existing) {
        this.file = await this.persistMutation((file) => {
          const refreshed = file.reviewQueue.find((entry) => entry.sourceAttemptId === item.sourceAttemptId && entry.reason === item.reason);
          if (!refreshed || refreshed.claim) return file;
          const source = file.attempts.find(({ id }) => id === refreshed.sourceAttemptId);
          if (!source) throw new Error("The queued Practice source is no longer available.");
          const claimed: ReviewQueueItem = {
            ...refreshed,
            claim: {
              id: claimId(refreshed),
              sessionId,
              claimedAt: now.toISOString(),
              exercise: regenerateQueueExercise(refreshed, source),
            },
          };
          const sessions = file.sessions.some(({ id }) => id === sessionId) ? file.sessions : [...file.sessions, emptySession(sessionId, now, file.settings.sessionTargetCount)];
          return validatePracticeFile({ ...file, sessions, reviewQueue: file.reviewQueue.map((entry) => entry === refreshed ? claimed : entry), updatedAt: now.toISOString() });
        });
        this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine });
      }
      const activeItem = this.file.reviewQueue.find((entry) => entry.sourceAttemptId === item.sourceAttemptId && entry.reason === item.reason);
      if (activeItem?.claim?.sessionId !== sessionId) return undefined;
      return restoreClaimedExercise(this.file, sessionId);
    });
    this.saveQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  ensureSession(sessionId: string, now: Date): Promise<void> {
    const operation = this.saveQueue.then(async () => {
      if (!this.file) throw new Error("Practice progress is read-only or requires recovery.");
      if (this.file.sessions.some(({ id }) => id === sessionId)) return;
      this.file = await this.persistMutation((file) => file.sessions.some(({ id }) => id === sessionId) ? file : validatePracticeFile({ ...file, sessions: [...file.sessions, emptySession(sessionId, now, file.settings.sessionTargetCount)], updatedAt: now.toISOString() }));
      this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine });
    });
    this.saveQueue = operation.catch(() => undefined); return operation;
  }

  abandonSession(sessionId: string, now: Date): Promise<void> {
    const operation = this.saveQueue.then(async () => {
      if (!this.file) throw new Error("Practice progress is read-only or requires recovery.");
      const session = this.file.sessions.find(({ id }) => id === sessionId);
      if (!session || session.completedAt || session.abandoned) return;
      this.file = await this.persistMutation((file) => {
        const current = file.sessions.find(({ id }) => id === sessionId);
        if (!current || current.completedAt || current.abandoned) return file;
        return validatePracticeFile({ ...file, sessions: file.sessions.map((entry) => entry.id === sessionId ? { ...entry, abandoned: true, completedAt: now.toISOString() } : entry), reviewQueue: file.reviewQueue.map((item) => item.claim?.sessionId === sessionId ? { ...item, claim: undefined } : item), updatedAt: now.toISOString() });
      });
      this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine });
    });
    this.saveQueue = operation.catch(() => undefined); return operation;
  }

  updateSettings(settings: PracticeSettings): Promise<void> {
    const operation = this.saveQueue.then(async () => {
      if (!this.file) throw new Error("Practice progress is not ready.");
      const updatedAt = new Date().toISOString();
      this.file = await this.persistMutation((file) => ({ ...file, settings, updatedAt }));
      this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine });
    });
    this.saveQueue = operation.catch(() => undefined);
    return operation.catch((error) => {
      if (this.file) this.publish({ status: "ready", file: this.file, quarantine: this.snapshot.quarantine, error: errorMessage(error) });
      throw error;
    });
  }

  async refreshRecoveryBackups(): Promise<void> {
    if (this.snapshot.status === "recovery-required") { await this.initialize(); return; }
    if (this.snapshot.status !== "error") return;
    this.publish({ ...this.snapshot, backups: await this.safeListBackups() });
  }

  async restoreBackup(name: string): Promise<void> {
    if (this.snapshot.status !== "recovery-required") throw new Error("Practice backup restore is not available in the current state.");
    try {
      const result = await this.repository.restoreBackup(name);
      this.file = result.file;
      this.publish({ status: "ready", file: result.file, quarantine: result.quarantine, error: recoveryMessage(result) });
    } catch (error) {
      const current = this.snapshot;
      if (current.status === "recovery-required") this.publish({ ...current, error: errorMessage(error) });
      else this.publish({ status: "error", file: this.file, quarantine: current.quarantine, backups: await this.safeListBackups(), error: errorMessage(error) });
      throw error;
    }
  }

  async startFresh(): Promise<void> {
    if (this.snapshot.status !== "recovery-required") throw new Error("Start Fresh is not available in the current state.");
    try {
      const result = await this.repository.startFresh(); this.file = result.file;
      this.publish({ status: "ready", file: result.file, quarantine: [], error: "A fresh Practice file was created. The corrupt original remains retained for recovery." });
    } catch (error) {
      this.publish({ ...this.snapshot, error: errorMessage(error) });
      throw error;
    }
  }

  retryLoad(): Promise<void> { return this.initialize(); }

  private publish(snapshot: PracticeDataSnapshot): void { this.snapshot = snapshot; this.listeners.forEach((listener) => listener()); }
  private async safeListBackups(): Promise<readonly PracticeBackupMetadata[]> {
    try { return await this.repository.listBackups(); } catch { return []; }
  }
  private async persistMutation(create: (file: PracticeFileV1) => PracticeFileV1): Promise<PracticeFileV1> {
    if (!this.file) throw new Error("Practice progress is not ready.");
    let candidate = create(this.file);
    if (candidate === this.file) return this.file;
    try { return await this.repository.save(candidate); }
    catch (error) {
      if (!isStaleRevisionError(error)) throw error;
      const latest = await this.repository.load(); this.file = latest.file; candidate = create(latest.file);
      return candidate === latest.file ? latest.file : this.repository.save(candidate);
    }
  }
}

export interface PracticeHomeSummary {
  readonly firstRun: boolean;
  readonly dueCount: number;
  readonly completedToday: number;
  readonly nextFocus: PracticeIssue | "degree-recall";
}

export function derivePracticeHomeSummary(file: PracticeFileV1, now: Date): PracticeHomeSummary {
  const day = now.toISOString().slice(0, 10);
  const validAttempts = file.attempts.filter((attempt) => attempt.completedAt && attempt.rating);
  const issueCounts = new Map<PracticeIssue, number>();
  validAttempts.forEach((attempt) => { if (attempt.mainIssue) issueCounts.set(attempt.mainIssue, (issueCounts.get(attempt.mainIssue) ?? 0) + 1); });
  const nextFocus = [...issueCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "degree-recall";
  return {
    firstRun: validAttempts.length === 0,
    dueCount: file.reviewQueue.filter((item) => !item.claim && item.dueAt <= now.toISOString()).length,
    completedToday: validAttempts.filter((attempt) => attempt.completedAt?.slice(0, 10) === day).length,
    nextFocus,
  };
}

export interface PracticeHistorySummary {
  readonly id: string;
  readonly mode?: "degree" | "rhythm";
  readonly at: string;
  readonly completedCount: number;
  readonly targetCount: number;
  readonly ratingCounts: Readonly<Record<PracticeRating, number>>;
  readonly goodOrEasyCount: number;
  readonly independentSuccessCount: number;
  readonly averageListenCount: number;
  readonly transferCount: number;
  readonly nextFocus: PracticeIssue | "degree-recall";
}

export function derivePracticeHistory(file: PracticeFileV1, limit = 100): readonly PracticeHistorySummary[] {
  const summarize = <T extends { readonly id: string; readonly startedAt: string; readonly completedAt?: string; readonly targetCount: number; readonly attemptIds: readonly string[] }>(session: T, attempts: readonly (PracticeAttempt | RhythmPracticeAttempt)[], mode: "degree" | "rhythm"): PracticeHistorySummary | undefined => {
    const byId = new Map(attempts.map((attempt) => [attempt.id, attempt]));
    const completed = session.attemptIds.map((id) => byId.get(id)).filter((attempt): attempt is PracticeAttempt | RhythmPracticeAttempt => Boolean(attempt));
    if (completed.length === 0) return undefined;
    const ratingCounts: Record<PracticeRating, number> = { again: 0, hard: 0, good: 0, easy: 0 }; const issues = new Map<PracticeIssue, number>();
    completed.forEach((attempt) => { ratingCounts[attempt.rating!] += 1; if (attempt.mainIssue) issues.set(attempt.mainIssue, (issues.get(attempt.mainIssue) ?? 0) + 1); });
    return { id: session.id, mode, at: session.completedAt ?? completed[completed.length - 1]?.completedAt ?? session.startedAt, completedCount: completed.length, targetCount: session.targetCount, ratingCounts, goodOrEasyCount: ratingCounts.good + ratingCounts.easy, independentSuccessCount: completed.filter(({ independentSuccess }) => independentSuccess).length, averageListenCount: completed.reduce((sum, attempt) => sum + attempt.listenCount, 0) / completed.length, transferCount: completed.filter(({ transferOfAttemptId }) => Boolean(transferOfAttemptId)).length, nextFocus: [...issues.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "degree-recall" };
  };
  return [...file.sessions.map((session) => summarize(session, file.attempts, "degree")), ...file.rhythmSessions.map((session) => summarize(session, file.rhythmAttempts, "rhythm"))].filter((summary): summary is PracticeHistorySummary => Boolean(summary)).sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).slice(0, limit);
}
export function restoreClaimedExercise(file: PracticeFileV1, sessionId: string): ClaimedPracticeExercise | undefined {
  const item = file.reviewQueue.find((candidate) => candidate.claim?.sessionId === sessionId);
  if (!item?.claim) return undefined;
  return {
    claimId: item.claim.id,
    exercise: item.claim.exercise,
    sourceAttemptId: item.sourceAttemptId,
    transferOfAttemptId: item.schedule.kind === "spaced-transfer" ? item.sourceAttemptId : undefined,
    reason: item.reason,
  };
}

function isQueueItemEligible(item: ReviewQueueItem, file: PracticeFileV1, sessionId: string, now: Date): boolean {
  if (item.claim) return false;
  const source = file.attempts.find(({ id }) => id === item.sourceAttemptId);
  const session = file.sessions.find(({ id }) => id === sessionId);
  if (!source) return false;
  if (!session) return (item.reason === "again" || item.reason === "hard")
    ? source.sessionId !== sessionId
    : item.dueAt <= now.toISOString();
  if (item.schedule.kind === "current-session-offset") {
    if (source.sessionId !== sessionId) return true;
    const sourceIndex = session.attemptIds.indexOf(source.id);
    return sourceIndex >= 0 && session.completedCount - sourceIndex - 1 >= item.schedule.questionsLater;
  }
  if (item.schedule.kind === "session-boundary") return source.sessionId !== sessionId || session.completedCount >= session.targetCount - 1;
  return item.dueAt <= now.toISOString();
}

function regenerateQueueExercise(item: ReviewQueueItem, source: PracticeAttempt): PracticeExercise {
  const original = source.exerciseSnapshot.generatorSnapshot;
  const keys = ["C", "G", "D", "A", "E", "F", "Bb"];
  const key = item.schedule.kind === "variation" || item.schedule.kind === "spaced-transfer"
    ? keys.find((candidate) => candidate !== original.key) ?? original.key : original.key;
  const tempoMultiplier = item.schedule.tempoMultiplier;
  const snapshot: GeneratorSnapshot = {
    ...original, key, tempo: Math.max(30, Math.round(original.tempo * tempoMultiplier)),
    seed: `review-v1:${source.id}:${item.reason}`,
  };
  const result = generateDegreeExercise(snapshot);
  if (!result.ok) throw new Error(`Queued Practice exercise could not be regenerated: ${result.error.message}`);
  return result.exercise;
}

function recoveryMessage(result: PracticeLoadResult): string | undefined {
  if (result.recovery) return "Practice data was isolated because it could not be validated. Vault data was not changed.";
  if (result.quarantine.length) return `${result.quarantine.length} invalid Practice attempt(s) were isolated and excluded from summaries.`;
  return undefined;
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Practice progress could not be loaded."; }
function addAttemptAndAcknowledgeClaim(file: PracticeFileV1, attempt: PracticeAttempt): PracticeFileV1 {
  return addCompletedAttempt(file, attempt);
}
function isStaleRevisionError(error: unknown): boolean {
  const seen = new Set<unknown>();
  const stack: unknown[] = [error];
  while (stack.length) {
    const candidate = stack.pop();
    if (candidate === null || candidate === undefined || seen.has(candidate)) continue;
    seen.add(candidate);
    if (typeof candidate === "string" && /stale revision/i.test(candidate)) return true;
    if (candidate instanceof Error) {
      if (/stale revision/i.test(candidate.message)) return true;
      stack.push((candidate as Error & { cause?: unknown }).cause);
    } else if (typeof candidate === "object") {
      const record = candidate as Record<string, unknown>;
      stack.push(record.message, record.cause, record.error);
    }
  }
  return false;
}
function claimId(item: ReviewQueueItem): string { return `claim-v1:${item.sourceAttemptId}:${item.reason}`; }
function emptySession(id: string, now: Date, targetCount: number) {
  return { id, startedAt: now.toISOString(), targetCount, completedCount: 0, mode: "degree" as const, attemptIds: [], abandoned: false };
}
