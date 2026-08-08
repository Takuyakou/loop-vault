import { z } from "zod";
import { isCanonicalRhythmAttempt, rhythmAttemptSchema, rhythmIndependentSuccess, rhythmSessionSchema } from "./rhythmSchemas";
import { sha256Hex } from "../../../../domain/midi/fingerprint";
import {
  deriveIndependentSuccess,
  deriveReviewQueue,
  generateDegreeExercise,
  type ChordContextHistoryEntry,
  type PracticeAttempt,
  type PracticeExercise,
  type PracticeSession,
  type PracticeSettings,
  type ReviewQueueItem,
  type RhythmPracticeAttempt,
  type RhythmPracticeSession,
} from "../../domain";

export const PRACTICE_DATA_PATH = "loopvault/practice-v1.json";
export const PRACTICE_TEMP_PATH = "loopvault/practice-v1.json.tmp";
export const PRACTICE_BACKUP_DIR = "loopvault/practice-backups";
export const PRACTICE_FILE_VERSION = 1 as const;
export const MAX_PRACTICE_BACKUPS = 20;

const degreeSchema = z.object({ degree: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]), accidental: z.union([z.literal(-1), z.literal(0), z.literal(1)]), octave: z.number().int() }).strict();
const targetEventSchema = z.object({ index: z.number().int().nonnegative(), degree: degreeSchema, midiNote: z.number().int().min(0).max(127), startBeat: z.number().finite().nonnegative(), durationBeats: z.number().finite().positive(), velocity: z.number().finite().min(0).max(1) }).strict();
const difficultySchema = z.object({ noteCount: z.number().int().min(1).max(6), phraseLengthBeats: z.number().finite().positive(), tempo: z.number().finite().positive(), pitchSpanSemitones: z.number().finite().nonnegative(), degreeComplexity: z.number().finite().nonnegative(), rhythmComplexity: z.number().finite().nonnegative(), positionShift: z.number().finite().nonnegative(), listenLimit: z.number().int().positive(), hintAvailability: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), transferDistance: z.number().finite().nonnegative() }).strict();
const singingModeSchema = z.enum(["auto", "original", "octave-1", "octave-2"]);
const snapshotSchema = z.object({
  generatorVersion: z.string().min(1), seed: z.string().min(1), key: z.string().min(1), scale: z.enum(["major", "minor"]), allowedDegrees: z.array(degreeSchema),
  vocabularyId: z.enum(["tonic-single", "tonic-dominant", "tonic-dominant-octave", "minor-color-cadence", "tonic-dominant-mixolydian", "ascending-minor-color", "dominant-octave-resolution", "chromatic-approach-1", "chromatic-approach-3", "chromatic-approach-5"]),
  degreeSequence: z.array(degreeSchema).min(1).max(6), noteCount: z.number().int().min(1).max(6), phraseLengthBeats: z.number().finite().positive(), tempo: z.number().finite().positive(),
  pitchSpan: z.object({ minMidi: z.number().int().min(0).max(127), maxMidi: z.number().int().min(0).max(127) }).strict(), instrument: z.literal("bass"), tuning: z.array(z.number().int().min(0).max(127)).min(4).max(5),
  fretRange: z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() }).strict(), handedness: z.enum(["right", "left"]), rhythmPreset: z.literal("even"), singingReferenceMode: singingModeSchema, maxAttempts: z.number().int().positive(),
}).strict();
const exerciseSchema: z.ZodType<PracticeExercise> = z.object({
  id: z.string().min(1), version: z.literal(1), generatorVersion: z.string().min(1), seed: z.string().min(1), mode: z.literal("degree"), source: z.object({ kind: z.literal("generated") }).strict(),
  tonalContext: z.object({ key: z.string().min(1), scale: z.enum(["major", "minor"]) }).strict(), tempo: z.number().finite().positive(), meter: z.object({ numerator: z.literal(4), denominator: z.literal(4) }).strict(),
  targetEvents: z.array(targetEventSchema).min(1).max(6), difficulty: difficultySchema, hints: z.array(z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), kind: z.enum(["tonal-context", "note-count-contour", "degree-sequence", "note-names-fretboard"]) }).strict()),
  singingReference: z.object({ mode: singingModeSchema, resolvedOctaveShift: z.union([z.literal(0), z.literal(1), z.literal(2)]), events: z.array(targetEventSchema) }).strict(), generatorSnapshot: snapshotSchema,
}).strict();
const ratingSchema = z.enum(["again", "hard", "good", "easy"]);
const attemptSchema: z.ZodType<PracticeAttempt> = z.object({
  id: z.string().min(1), exerciseId: z.string().min(1), sessionId: z.string().min(1), startedAt: z.string().datetime(), completedAt: z.string().datetime().optional(), listenCount: z.number().int().nonnegative(),
  hintLevel: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), singSkipped: z.boolean(), singGateCompleted: z.boolean(), responseLatencyMs: z.number().finite().nonnegative().optional(), rating: ratingSchema.optional(),
  mainIssue: z.enum(["pitch", "rhythm", "duration", "recall", "fretboard"]).optional(), independentSuccess: z.boolean(), transferOfAttemptId: z.string().min(1).optional(), reviewQueueClaimId: z.string().min(1).optional(), exerciseSnapshot: exerciseSchema,
}).strict();
const settingsSchema: z.ZodType<PracticeSettings> = z.object({ version: z.literal(1), singEnabled: z.boolean(), singingReferenceMode: singingModeSchema, stringCount: z.union([z.literal(4), z.literal(5)]), handedness: z.enum(["right", "left"]), fretRange: z.object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() }).strict(), sessionTargetCount: z.number().int().positive().max(100) }).strict();
const sessionSchema: z.ZodType<PracticeSession> = z.object({ id: z.string().min(1), startedAt: z.string().datetime(), completedAt: z.string().datetime().optional(), targetCount: z.number().int().positive(), completedCount: z.number().int().nonnegative(), mode: z.literal("degree"), attemptIds: z.array(z.string().min(1)), abandoned: z.boolean() }).strict();
const queueSchema: z.ZodType<ReviewQueueItem> = z.object({
  exerciseId: z.string().min(1), dueAt: z.string().datetime(), reason: z.enum(["again", "hard", "good", "easy", "transfer"]), difficultyAdjustment: z.union([z.literal(-1), z.literal(0), z.literal(1)]), sourceAttemptId: z.string().min(1), stableOrder: z.number().int(),
  schedule: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("current-session-offset"), questionsLater: z.union([z.literal(2), z.literal(3)]), tempoMultiplier: z.literal(1) }).strict(),
    z.object({ kind: z.literal("session-boundary"), position: z.literal("tail-or-next-head"), tempoMultiplier: z.literal(0.9) }).strict(),
    z.object({ kind: z.literal("variation"), timing: z.literal("next-session-or-next-day"), variation: z.literal("different-key"), tempoMultiplier: z.literal(1) }).strict(),
    z.object({ kind: z.literal("spaced-transfer"), intervalDays: z.literal(3), preferTransfer: z.literal(true), tempoMultiplier: z.literal(1) }).strict(),
  ]), claim: z.object({ id: z.string().min(1), sessionId: z.string().min(1), claimedAt: z.string().datetime(), exercise: exerciseSchema }).strict().optional(),
}).strict();

const chordContextHistoryEntrySchema: z.ZodType<ChordContextHistoryEntry> = z.object({
  id: z.string().min(1).max(200),
  version: z.literal(1),
  completedAt: z.string().datetime(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("generated"), safeLabel: z.literal("Generated progression") }).strict(),
    z.object({ kind: z.literal("vault"), safeLabel: z.string().min(1).max(160), reference: z.object({ ideaId: z.string().min(1).max(200), blockId: z.string().min(1).max(200) }).strict() }).strict(),
  ]),
  snapshotSignature: z.string().regex(/^[a-f0-9]{8,128}$/),
  section: z.object({ id: z.string().min(1).max(200), startBar: z.number().int().positive(), endBar: z.number().int().positive(), lengthBeats: z.union([z.literal(4), z.literal(8)]) }).strict(),
  originalBpm: z.number().finite().min(30).max(240),
  effectiveBpm: z.number().finite().min(30).max(240),
  listenMode: z.enum(["bass-only", "chords-only", "bass-and-chords", "bass-chords-and-metronome"]),
  playMode: z.enum(["chords-only", "chords-and-metronome", "metronome-only", "no-accompaniment"]),
  metronomeUsed: z.boolean(),
  recordCompareUsed: z.boolean(),
  retainedTakeReference: z.string().min(1).max(200).optional(),
}).strict();

export interface PracticeFileV1 { readonly app: "loopvault-practice"; readonly fileVersion: 1; readonly revision: number; readonly settings: PracticeSettings; readonly exercises: readonly PracticeExercise[]; readonly attempts: readonly PracticeAttempt[]; readonly sessions: readonly PracticeSession[]; readonly reviewQueue: readonly ReviewQueueItem[]; readonly rhythmAttempts: readonly RhythmPracticeAttempt[]; readonly rhythmSessions: readonly RhythmPracticeSession[]; readonly chordContextHistory: readonly ChordContextHistoryEntry[]; readonly updatedAt: string; }
export interface PracticeQuarantine { readonly collection: "attempts"; readonly index: number; readonly issue: "invalid-schema" | "independent-success-mismatch" | "invalid-transfer-reference"; }
export interface PracticeRecoveryMetadata { readonly kind: "invalid-json" | "invalid-schema" | "retained-corrupt"; readonly corruptPath: string; readonly backups: readonly PracticeBackupMetadata[]; }
export interface PracticeLoadResult { readonly file: PracticeFileV1; readonly quarantine: readonly PracticeQuarantine[]; readonly created: boolean; readonly recovery?: PracticeRecoveryMetadata; }
const envelopeSchema = z.object({ app: z.literal("loopvault-practice"), fileVersion: z.literal(1), revision: z.number().int().nonnegative(), settings: settingsSchema, exercises: z.array(exerciseSchema), attempts: z.array(z.unknown()), sessions: z.array(sessionSchema), reviewQueue: z.array(queueSchema), rhythmAttempts: z.array(rhythmAttemptSchema).optional().default([]), rhythmSessions: z.array(rhythmSessionSchema).optional().default([]), chordContextHistory: z.array(chordContextHistoryEntrySchema).optional().default([]), updatedAt: z.string().datetime() }).strict();

export interface PracticeStoredDocument { readonly contents: string; readonly revision: number; readonly token: string; }
export interface PracticeBackupMetadata { readonly name: string; readonly revision: number; readonly token: string; }
export interface PracticeStorage {
  readCommitted(): Promise<PracticeStoredDocument | undefined>;
  listRecoveryArtifacts(): Promise<readonly string[]>;
  commit(contents: string, timestampToken: string, expectedRevision?: number, expectedToken?: string): Promise<number>;
  quarantineCommitted(timestampToken: string, expectedToken: string): Promise<string>;
  listBackups(): Promise<readonly PracticeBackupMetadata[]>;
  readBackup(name: string): Promise<PracticeStoredDocument>;
  restoreBackup(name: string, backupToken: string, expectedRevision?: number, expectedToken?: string): Promise<PracticeStoredDocument>;
}
export class PracticeRepositoryError extends Error { constructor(readonly kind: "future-version" | "invalid-data" | "write-failed" | "recovery-unknown", message: string, readonly cause?: unknown) { super(message); this.name = "PracticeRepositoryError"; } }

export class JsonPracticeRepository {
  private operation = Promise.resolve();
  private currentRevision: number | undefined;
  private currentToken: string | undefined;
  private futureVersion?: number;
  private recoveryRequired?: PracticeRecoveryMetadata;
  private recoveryUnknown = false;
  constructor(private readonly storage: PracticeStorage, private readonly now: () => Date = () => new Date()) {}
  load(): Promise<PracticeLoadResult> { return this.serialize(async () => {
    const raw = await this.storage.readCommitted();
    if (raw === undefined) {
      this.currentRevision = undefined; this.currentToken = undefined; this.futureVersion = undefined;
      let artifacts: readonly string[];
      try { artifacts = await this.storage.listRecoveryArtifacts(); }
      catch (error) {
        this.recoveryUnknown = true;
        throw new PracticeRepositoryError("recovery-unknown", "Practice recovery artifacts could not be checked. Practice remains unavailable to prevent data loss.", error);
      }
      this.recoveryUnknown = false;
      if (artifacts.length > 0 && !this.recoveryRequired) {
        this.recoveryRequired = { kind: "retained-corrupt", corruptPath: artifacts[0], backups: [] };
      }
      if (this.recoveryRequired) {
        this.recoveryRequired = { ...this.recoveryRequired, backups: await this.bestEffortValidatedRecoveryBackups() };
        return { file: createEmptyPracticeFile(this.now()), quarantine: [], created: false, recovery: this.recoveryRequired };
      }
      return { file: createEmptyPracticeFile(this.now()), quarantine: [], created: true };
    }
    this.currentRevision = raw.revision;
    this.currentToken = raw.token;
    let parsed: unknown;
    try { parsed = JSON.parse(raw.contents); } catch {
      return this.quarantineWholeFile("invalid-json", raw);
    }
    if (isRecord(parsed) && typeof parsed.fileVersion === "number" && parsed.fileVersion > 1) {
      this.recoveryUnknown = false;
      this.futureVersion = parsed.fileVersion;
      throw new PracticeRepositoryError("future-version", `Practice fileVersion ${parsed.fileVersion} is newer than this app supports. Practice is read-only until this app is updated.`);
    }
    this.futureVersion = undefined;
    const envelope = envelopeSchema.safeParse(parsed);
    if (!envelope.success || envelope.data.revision !== raw.revision || raw.revision < 1) {
      return this.quarantineWholeFile("invalid-schema", raw);
    }
    const quarantine: PracticeQuarantine[] = []; const attempts: PracticeAttempt[] = [];
    const rawAttemptIds = envelope.data.attempts.map((candidate) => isRecord(candidate) && typeof candidate.id === "string" ? candidate.id : undefined).filter((id): id is string => Boolean(id));
    if (new Set(rawAttemptIds).size !== rawAttemptIds.length) {
      return this.quarantineWholeFile("invalid-schema", raw);
    }
    envelope.data.attempts.forEach((candidate, index) => {
      const result = attemptSchema.safeParse(candidate);
      if (!result.success) { quarantine.push({ collection: "attempts", index, issue: "invalid-schema" }); return; }
      if (!isAttemptSemanticallyValid(result.data)) { quarantine.push({ collection: "attempts", index, issue: "invalid-schema" }); return; }
      if (result.data.independentSuccess !== deriveIndependentSuccess(result.data)) { quarantine.push({ collection: "attempts", index, issue: "independent-success-mismatch" }); return; }
      if (result.data.transferOfAttemptId && !isValidTransferReference(result.data, attempts)) { quarantine.push({ collection: "attempts", index, issue: "invalid-transfer-reference" }); return; }
      attempts.push(result.data);
    });
    const validAttemptIds = new Set(attempts.map(({ id }) => id));
    const persistedQueue = envelope.data.reviewQueue.filter((item) => validAttemptIds.has(item.sourceAttemptId));
    const referencedExerciseIds = new Set(attempts.map(({ exerciseId }) => exerciseId));
    const exercises = quarantine.length > 0 ? envelope.data.exercises.filter(({ id }) => referencedExerciseIds.has(id)) : envelope.data.exercises;
    const sessions = normalizeLoadedSessions(envelope.data.sessions, attempts, quarantine.length > 0);
    if (!sessions || !isExerciseIndexValid(exercises, attempts)) {
      return this.quarantineWholeFile("invalid-schema", raw);
    }
    const reviewQueue = quarantine.length > 0 ? repairQueueAfterQuarantine(persistedQueue, attempts, sessions) : persistedQueue;
    if (!reviewQueue || !isValidPendingQueue(reviewQueue, attempts, sessions)) {
      return this.quarantineWholeFile("invalid-schema", raw);
    }
    this.currentRevision = raw.revision;
    this.recoveryUnknown = false;
    this.recoveryRequired = undefined;
    return { file: freezeFile({ ...envelope.data, exercises, attempts, sessions, reviewQueue }), quarantine: Object.freeze(quarantine), created: false };
  }); }
  save(file: PracticeFileV1): Promise<PracticeFileV1> { return this.serialize(async () => {
    this.assertNormalWritable();
    const nextRevision = (this.currentRevision ?? 0) + 1;
    const canonical = validatePracticeFile({ ...file, revision: nextRevision });
    const contents = `${JSON.stringify(canonical, null, 2)}\n`;
    try {
      const committed = await this.storage.commit(contents, timestampToken(this.now()), this.currentRevision, this.currentToken);
      if (committed !== nextRevision) throw new Error("Practice storage returned an unexpected revision.");
      this.currentRevision = committed;
      this.currentToken = documentToken(contents);
      return canonical;
    } catch (error) { throw new PracticeRepositoryError("write-failed", "Practice progress could not be saved. Your current review remains available.", error); }
  }); }
  listBackups(): Promise<readonly PracticeBackupMetadata[]> { return this.serialize(() => this.storage.listBackups()); }
  async restoreBackup(name: string): Promise<PracticeLoadResult> {
    await this.serialize(async () => {
      this.assertWritable();
      if (!this.recoveryRequired) throw new PracticeRepositoryError("invalid-data", "Practice backup restore is available only while recovery is required.");
      const candidate = await this.storage.readBackup(name);
      parseStrictStoredFile(candidate);
      const restored = await this.storage.restoreBackup(name, candidate.token, this.currentRevision, this.currentToken);
      this.currentRevision = restored.revision;
      this.currentToken = restored.token;
      this.recoveryRequired = undefined;
    });
    return this.load();
  }
  startFresh(): Promise<PracticeLoadResult> { return this.serialize(async () => {
    this.assertWritable();
    if (!this.recoveryRequired || this.currentToken !== undefined) throw new PracticeRepositoryError("invalid-data", "Start Fresh is available only after a corrupt Practice file has been safely retained.");
    const empty = createEmptyPracticeFile(this.now());
    const canonical = validatePracticeFile({ ...empty, revision: 1 });
    const contents = `${JSON.stringify(canonical, null, 2)}\n`;
    const revision = await this.storage.commit(contents, timestampToken(this.now()), undefined, undefined);
    if (revision !== 1) throw new PracticeRepositoryError("write-failed", "Practice storage returned an unexpected revision.");
    this.currentRevision = revision; this.currentToken = documentToken(contents); this.recoveryRequired = undefined;
    return { file: canonical, quarantine: [], created: true };
  }); }
  private serialize<T>(operation: () => Promise<T>): Promise<T> { const next = this.operation.then(operation, operation); this.operation = next.then(() => undefined, () => undefined); return next; }
  private assertWritable(): void {
    if (this.futureVersion !== undefined) throw new PracticeRepositoryError("future-version", `Practice fileVersion ${this.futureVersion} is newer than this app supports. The canonical file is read-only.`);
    if (this.recoveryUnknown) throw new PracticeRepositoryError("recovery-unknown", "Practice recovery state is unknown. Writes remain disabled to prevent data loss.");
  }
  private assertNormalWritable(): void {
    this.assertWritable();
    if (this.recoveryRequired) throw new PracticeRepositoryError("invalid-data", "Practice recovery must be resolved before progress can be saved.");
  }
  private async quarantineWholeFile(kind: PracticeRecoveryMetadata["kind"], raw: PracticeStoredDocument): Promise<PracticeLoadResult> {
    const corruptPath = await this.storage.quarantineCommitted(timestampToken(this.now()), raw.token);
    this.currentRevision = undefined; this.currentToken = undefined;
    this.recoveryUnknown = false;
    this.recoveryRequired = { kind, corruptPath, backups: [] };
    this.recoveryRequired = { ...this.recoveryRequired, backups: await this.bestEffortValidatedRecoveryBackups() };
    return { file: createEmptyPracticeFile(this.now()), quarantine: [], created: false, recovery: this.recoveryRequired };
  }
  private async bestEffortValidatedRecoveryBackups(): Promise<readonly PracticeBackupMetadata[]> {
    try { return await this.validatedRecoveryBackups(); }
    catch { return []; }
  }
  private async validatedRecoveryBackups(): Promise<readonly PracticeBackupMetadata[]> {
    const candidates = await this.storage.listBackups();
    const validated = await Promise.all(candidates.map(async (metadata) => {
      try { parseStrictStoredFile(await this.storage.readBackup(metadata.name)); return metadata; }
      catch { return undefined; }
    }));
    return validated.filter((candidate): candidate is PracticeBackupMetadata => candidate !== undefined);
  }
}

export function createEmptyPracticeFile(now: Date): PracticeFileV1 { return freezeFile({ app: "loopvault-practice", fileVersion: 1, revision: 0, settings: { version: 1, singEnabled: true, singingReferenceMode: "auto", stringCount: 4, handedness: "right", fretRange: { min: 0, max: 12 }, sessionTargetCount: 8 }, exercises: [], attempts: [], sessions: [], reviewQueue: [], rhythmAttempts: [], rhythmSessions: [], chordContextHistory: [], updatedAt: now.toISOString() }); }
export function addChordContextHistoryEntry(file: PracticeFileV1, entry: ChordContextHistoryEntry): PracticeFileV1 {
  if (file.chordContextHistory.some(({ id }) => id === entry.id)) {
    throw new PracticeRepositoryError("invalid-data", "Chord Context History entry " + entry.id + " has already been saved.");
  }
  return validatePracticeFile({
    ...file,
    chordContextHistory: [...file.chordContextHistory, entry],
    updatedAt: entry.completedAt,
  });
}
export function addCompletedAttempt(file: PracticeFileV1, attempt: PracticeAttempt): PracticeFileV1 {
  if (!attempt.completedAt || !attempt.rating) throw new PracticeRepositoryError("invalid-data", "Only completed, self-rated attempts can be saved.");
  if (file.attempts.some(({ id }) => id === attempt.id)) throw new PracticeRepositoryError("invalid-data", `Attempt ${attempt.id} has already been saved.`);
  if (attempt.independentSuccess !== deriveIndependentSuccess(attempt)) throw new PracticeRepositoryError("invalid-data", "Attempt independentSuccess is not canonical.");
  if (attempt.transferOfAttemptId && !isValidTransferReference(attempt, file.attempts)) throw new PracticeRepositoryError("invalid-data", "Transfer source must be an earlier completed Good/Easy attempt in this exercise lineage.");
  const existing = file.sessions.find(({ id }) => id === attempt.sessionId);
  if (existing?.abandoned || existing?.completedAt || (existing && existing.completedCount >= existing.targetCount)) throw new PracticeRepositoryError("invalid-data", "Completed or abandoned Practice sessions cannot accept attempts.");
  const acknowledgedQueue = acknowledgeQueueClaim(file.reviewQueue, attempt, file.attempts);
  const exercises = file.exercises.some(({ id }) => id === attempt.exerciseId) ? file.exercises : [...file.exercises, attempt.exerciseSnapshot];
  const attempts = [...file.attempts, attempt];
  const session: PracticeSession = existing ? { ...existing, completedCount: existing.completedCount + 1, completedAt: existing.completedCount + 1 >= existing.targetCount ? attempt.completedAt : undefined, attemptIds: [...existing.attemptIds, attempt.id] } : { id: attempt.sessionId, startedAt: attempt.startedAt, targetCount: file.settings.sessionTargetCount, completedCount: 1, mode: "degree", attemptIds: [attempt.id], abandoned: false };
  const sessions = [...file.sessions.filter(({ id }) => id !== session.id), session]; const newQueue = deriveReviewQueue([attempt], attempt.completedAt)[0];
  const reviewQueue = [...acknowledgedQueue, newQueue].sort(compareQueue);
  return validatePracticeFile({ ...file, exercises, attempts, sessions, reviewQueue, updatedAt: attempt.completedAt });
}
export function addCompletedRhythmAttempt(file: PracticeFileV1, attempt: RhythmPracticeAttempt): PracticeFileV1 {
  if (file.rhythmAttempts.some(({ id }) => id === attempt.id)) throw new PracticeRepositoryError("invalid-data", `Rhythm attempt ${attempt.id} has already been saved.`);
  if (!isCanonicalRhythmAttempt(attempt) || attempt.independentSuccess !== rhythmIndependentSuccess(attempt)) throw new PracticeRepositoryError("invalid-data", "Rhythm attempt failed canonical validation.");
  if (attempt.transferOfAttemptId && !isValidRhythmTransferReference(attempt, file.rhythmAttempts)) throw new PracticeRepositoryError("invalid-data", "Rhythm transfer source must be an earlier completed Good/Easy attempt with a changed tempo or start position.");
  const existing = file.rhythmSessions.find(({ id }) => id === attempt.sessionId);
  if (existing?.abandoned || existing?.completedAt || (existing && existing.completedCount >= existing.targetCount)) throw new PracticeRepositoryError("invalid-data", "Completed or abandoned Rhythm sessions cannot accept attempts.");
  const rhythmAttempts = [...file.rhythmAttempts, attempt];
  const rhythmSession: RhythmPracticeSession = existing ? { ...existing, completedCount: existing.completedCount + 1, completedAt: existing.completedCount + 1 >= existing.targetCount ? attempt.completedAt : undefined, attemptIds: [...existing.attemptIds, attempt.id] } : { id: attempt.sessionId, startedAt: attempt.startedAt, targetCount: file.settings.sessionTargetCount, completedCount: 1, mode: "rhythm", attemptIds: [attempt.id], abandoned: false };
  const rhythmSessions = [...file.rhythmSessions.filter(({ id }) => id !== rhythmSession.id), rhythmSession];
  return validatePracticeFile({ ...file, rhythmAttempts, rhythmSessions, updatedAt: attempt.completedAt });
}
export function validatePracticeFile(file: PracticeFileV1): PracticeFileV1 {
  const parsed = envelopeSchema.safeParse(file); if (!parsed.success) throw new PracticeRepositoryError("invalid-data", "Practice file failed strict schema validation.", parsed.error);
  const attempts = parsed.data.attempts.map((candidate, index) => { const attempt = attemptSchema.parse(candidate); if (!isAttemptSemanticallyValid(attempt)) throw new PracticeRepositoryError("invalid-data", `Attempt ${index} failed semantic validation.`); if (attempt.independentSuccess !== deriveIndependentSuccess(attempt)) throw new PracticeRepositoryError("invalid-data", `Attempt ${index} independentSuccess is not canonical.`); return attempt; });
  attempts.forEach((attempt, index) => { if (attempt.transferOfAttemptId && !isValidTransferReference(attempt, attempts.slice(0, index))) throw new PracticeRepositoryError("invalid-data", `Attempt ${attempt.id} has an invalid transfer reference.`); });
  if (new Set(attempts.map(({ id }) => id)).size !== attempts.length) throw new PracticeRepositoryError("invalid-data", "Practice attempt IDs must be unique.");
  if (!isExerciseIndexValid(parsed.data.exercises, attempts)) throw new PracticeRepositoryError("invalid-data", "Practice exercise index is inconsistent.");
  const sessions = normalizeLoadedSessions(parsed.data.sessions, attempts, false);
  if (!sessions) throw new PracticeRepositoryError("invalid-data", "Practice session references are inconsistent.");
  if (!isValidPendingQueue(parsed.data.reviewQueue, attempts, sessions)) throw new PracticeRepositoryError("invalid-data", "Practice review queue is not canonical.");
  const rhythmAttempts = parsed.data.rhythmAttempts;
  rhythmAttempts.forEach((attempt, index) => {
    if (!isCanonicalRhythmAttempt(attempt) || attempt.independentSuccess !== rhythmIndependentSuccess(attempt)) throw new PracticeRepositoryError("invalid-data", `Rhythm attempt ${index} failed canonical validation.`);
    if (attempt.transferOfAttemptId && !isValidRhythmTransferReference(attempt, rhythmAttempts.slice(0, index))) throw new PracticeRepositoryError("invalid-data", `Rhythm attempt ${attempt.id} has an invalid transfer reference.`);
  });
  if (new Set(rhythmAttempts.map(({ id }) => id)).size !== rhythmAttempts.length) throw new PracticeRepositoryError("invalid-data", "Rhythm attempt IDs must be unique.");
  const rhythmSessions = normalizeRhythmSessions(parsed.data.rhythmSessions, rhythmAttempts);
  if (!rhythmSessions) throw new PracticeRepositoryError("invalid-data", "Rhythm session references are inconsistent.");
  const chordContextHistory = parsed.data.chordContextHistory;
  if (new Set(chordContextHistory.map(({ id }) => id)).size !== chordContextHistory.length) throw new PracticeRepositoryError("invalid-data", "Chord Context History entry IDs must be unique.");
  if (chordContextHistory.some((entry) => entry.section.endBar < entry.section.startBar)) throw new PracticeRepositoryError("invalid-data", "Chord Context History section bounds are invalid.");
  return freezeFile({ ...parsed.data, attempts, rhythmAttempts, rhythmSessions, chordContextHistory });
}
function withoutClaim(item: ReviewQueueItem): ReviewQueueItem { const { claim: _claim, ...base } = item; return base; }
function isValidPendingQueue(queue: readonly ReviewQueueItem[], attempts: readonly PracticeAttempt[], sessions: readonly PracticeSession[]): boolean {
  const replayed = replayReviewQueue(attempts);
  if (!replayed) return false;
  const persistedByKey = new Map(queue.map((item) => [queueKey(item), item]));
  if (persistedByKey.size !== queue.length || persistedByKey.size !== replayed.size) return false;
  const canonicalOrder = [...replayed.values()].sort(compareQueue).map(queueKey);
  if (JSON.stringify(queue.map(queueKey)) !== JSON.stringify(canonicalOrder)) return false;
  for (const [key, expected] of replayed) {
    const persisted = persistedByKey.get(key);
    if (!persisted || JSON.stringify(withoutClaim(persisted)) !== JSON.stringify(expected)) return false;
    if (persisted.claim) {
      const source = attempts.find(({ id }) => id === persisted.sourceAttemptId);
      const session = sessions.find(({ id }) => id === persisted.claim?.sessionId);
      if (!source || !session || session.abandoned || Boolean(session.completedAt) || session.completedCount >= session.targetCount || !isValidQueueClaim(persisted, source)) return false;
    }
  }
  return true;
}
function repairQueueAfterQuarantine(persisted: readonly ReviewQueueItem[], attempts: readonly PracticeAttempt[], sessions: readonly PracticeSession[]): readonly ReviewQueueItem[] | undefined {
  const replayed = replayReviewQueue(attempts);
  if (!replayed) return undefined;
  const persistedClaims = new Map(persisted.filter(({ claim }) => Boolean(claim)).map((item) => [queueKey(item), item]));
  return [...replayed.values()].map((item) => {
    const claimed = persistedClaims.get(queueKey(item));
    if (!claimed?.claim || JSON.stringify(withoutClaim(claimed)) !== JSON.stringify(item)) return item;
    const source = attempts.find(({ id }) => id === claimed.sourceAttemptId);
    const session = sessions.find(({ id }) => id === claimed.claim?.sessionId);
    return source && session && !session.abandoned && !session.completedAt && session.completedCount < session.targetCount && isValidQueueClaim(claimed, source)
      ? claimed
      : item;
  }).sort(compareQueue);
}
function isValidQueueClaim(item: ReviewQueueItem, source: PracticeAttempt): boolean {
  const claim = item.claim;
  if (!claim || claim.id !== `claim-v1:${item.sourceAttemptId}:${item.reason}` || !isExerciseSemanticallyValid(claim.exercise)) return false;
  const from = source.exerciseSnapshot;
  const changedKey = item.schedule.kind === "variation" || item.schedule.kind === "spaced-transfer";
  const keys = ["C", "G", "D", "A", "E", "F", "Bb"];
  const key = changedKey ? keys.find((candidate) => candidate !== from.tonalContext.key) ?? from.tonalContext.key : from.tonalContext.key;
  const expected = generateDegreeExercise({
    ...from.generatorSnapshot,
    key,
    tempo: Math.max(30, Math.round(from.tempo * item.schedule.tempoMultiplier)),
    seed: `review-v1:${source.id}:${item.reason}`,
  });
  return expected.ok && JSON.stringify(claim.exercise) === JSON.stringify(expected.exercise);
}
function replayReviewQueue(attempts: readonly PracticeAttempt[]): Map<string, ReviewQueueItem> | undefined {
  const pending = new Map<string, ReviewQueueItem>();
  for (const attempt of attempts) {
    if (!attempt.completedAt || !attempt.rating) return undefined;
    if (attempt.reviewQueueClaimId) {
      const entry = [...pending.entries()].find(([, item]) => claimId(item) === attempt.reviewQueueClaimId);
      if (!entry || !isExactClaimAttempt(entry[1], attempt, attempts)) return undefined;
      pending.delete(entry[0]);
    }
    const item = deriveReviewQueue([attempt], attempt.completedAt)[0];
    const key = queueKey(item);
    if (pending.has(key)) return undefined;
    pending.set(key, item);
  }
  return pending;
}
function acknowledgeQueueClaim(queue: readonly ReviewQueueItem[], attempt: PracticeAttempt, prior: readonly PracticeAttempt[]): readonly ReviewQueueItem[] {
  if (!attempt.reviewQueueClaimId) return queue;
  const claimed = queue.find((item) => item.claim?.id === attempt.reviewQueueClaimId);
  if (!claimed?.claim || claimed.claim.sessionId !== attempt.sessionId || !isExactClaimAttempt(claimed, attempt, prior)) {
    throw new PracticeRepositoryError("invalid-data", "Practice review claim is missing or does not match its exact exercise lineage.");
  }
  return queue.filter((item) => queueKey(item) !== queueKey(claimed));
}
function isExactClaimAttempt(item: ReviewQueueItem, attempt: PracticeAttempt, prior: readonly PracticeAttempt[]): boolean {
  const source = prior.find(({ id }) => id === item.sourceAttemptId);
  if (!source || claimId(item) !== attempt.reviewQueueClaimId) return false;
  const expectedExercise = regenerateQueueExercise(item, source);
  if (!expectedExercise || JSON.stringify(expectedExercise) !== JSON.stringify(attempt.exerciseSnapshot)) return false;
  return item.schedule.kind === "spaced-transfer"
    ? attempt.transferOfAttemptId === source.id
    : attempt.transferOfAttemptId === undefined;
}
function regenerateQueueExercise(item: ReviewQueueItem, source: PracticeAttempt): PracticeExercise | undefined {
  const original = source.exerciseSnapshot.generatorSnapshot;
  const keys = ["C", "G", "D", "A", "E", "F", "Bb"];
  const key = item.schedule.kind === "variation" || item.schedule.kind === "spaced-transfer"
    ? keys.find((candidate) => candidate !== original.key) ?? original.key : original.key;
  const result = generateDegreeExercise({
    ...original,
    key,
    tempo: Math.max(30, Math.round(original.tempo * item.schedule.tempoMultiplier)),
    seed: `review-v1:${source.id}:${item.reason}`,
  });
  return result.ok ? result.exercise : undefined;
}
function queueKey(item: ReviewQueueItem): string { return `${item.sourceAttemptId}:${item.reason}`; }
function claimId(item: ReviewQueueItem): string { return `claim-v1:${item.sourceAttemptId}:${item.reason}`; }
function compareQueue(left: ReviewQueueItem, right: ReviewQueueItem): number {
  return left.dueAt.localeCompare(right.dueAt) || left.stableOrder - right.stableOrder || left.exerciseId.localeCompare(right.exerciseId) || left.sourceAttemptId.localeCompare(right.sourceAttemptId);
}
function normalizeLoadedSessions(sessions: readonly PracticeSession[], attempts: readonly PracticeAttempt[], allowRepair: boolean): readonly PracticeSession[] | undefined {
  if (new Set(sessions.map(({ id }) => id)).size !== sessions.length) return undefined;
  const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const assigned = new Set<string>(); const normalized: PracticeSession[] = [];
  for (const session of sessions) {
    if (new Set(session.attemptIds).size !== session.attemptIds.length) return undefined;
    const validIds = session.attemptIds.filter((id) => attemptById.get(id)?.sessionId === session.id);
    if (!allowRepair && validIds.length !== session.attemptIds.length) return undefined;
    if (validIds.some((id) => assigned.has(id))) return undefined;
    validIds.forEach((id) => assigned.add(id));
    const completedCount = validIds.length;
    const isComplete = completedCount >= session.targetCount;
    if (!allowRepair && session.completedCount !== completedCount) return undefined;
    if (!allowRepair && !session.abandoned && isComplete !== Boolean(session.completedAt)) return undefined;
    if (!allowRepair && session.abandoned && !session.completedAt) return undefined;
    const completedDates = validIds.map((id) => attemptById.get(id)?.completedAt).filter((value): value is string => Boolean(value));
    const lastCompletedAt = completedDates[completedDates.length - 1];
    normalized.push({ ...session, attemptIds: validIds, completedCount, completedAt: isComplete ? lastCompletedAt : session.abandoned ? session.completedAt : undefined });
  }
  if (attempts.some((attempt) => !assigned.has(attempt.id))) return undefined;
  return Object.freeze(normalized);
}
function normalizeRhythmSessions(sessions: readonly RhythmPracticeSession[], attempts: readonly RhythmPracticeAttempt[]): readonly RhythmPracticeSession[] | undefined {
  if (new Set(sessions.map(({ id }) => id)).size !== sessions.length) return undefined;
  const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt])); const assigned = new Set<string>();
  for (const session of sessions) {
    if (new Set(session.attemptIds).size !== session.attemptIds.length || session.completedCount !== session.attemptIds.length) return undefined;
    if (session.attemptIds.some((id) => attemptById.get(id)?.sessionId !== session.id || assigned.has(id))) return undefined;
    session.attemptIds.forEach((id) => assigned.add(id)); const complete = session.completedCount >= session.targetCount;
    if ((!session.abandoned && complete !== Boolean(session.completedAt)) || (session.abandoned && !session.completedAt)) return undefined;
  }
  return attempts.every((attempt) => assigned.has(attempt.id)) ? Object.freeze([...sessions]) : undefined;
}
function isValidRhythmTransferReference(attempt: RhythmPracticeAttempt, prior: readonly RhythmPracticeAttempt[]): boolean {
  const source = prior.find(({ id }) => id === attempt.transferOfAttemptId);
  if (!source || (source.rating !== "good" && source.rating !== "easy")) return false;
  const from = source.exerciseSnapshot.generatorSnapshot; const to = attempt.exerciseSnapshot.generatorSnapshot;
  return from.vocabularyId === to.vocabularyId && from.meter.numerator === to.meter.numerator && from.meter.denominator === to.meter.denominator && (from.tempo !== to.tempo || from.startPositionBeats !== to.startPositionBeats);
}
function isExerciseIndexValid(exercises: readonly PracticeExercise[], attempts: readonly PracticeAttempt[]): boolean {
  if (new Set(exercises.map(({ id }) => id)).size !== exercises.length) return false;
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const referenced = new Set(attempts.map(({ exerciseId }) => exerciseId));
  return referenced.size === exercises.length && attempts.every((attempt) => {
    const indexed = byId.get(attempt.exerciseId);
    return indexed !== undefined && JSON.stringify(indexed) === JSON.stringify(attempt.exerciseSnapshot);
  });
}
function isAttemptSemanticallyValid(attempt: PracticeAttempt): boolean {
  const exercise = attempt.exerciseSnapshot;
  if (attempt.exerciseId !== exercise.id || !attempt.completedAt || !attempt.rating) return false;
  return isExerciseSemanticallyValid(exercise);
}
function isExerciseSemanticallyValid(exercise: PracticeExercise): boolean {
  const generated = generateDegreeExercise(exercise.generatorSnapshot);
  return generated.ok && JSON.stringify(exercise) === JSON.stringify(generated.exercise);
}
function isValidTransferReference(attempt: PracticeAttempt, prior: readonly PracticeAttempt[]): boolean {
  const source = prior.find(({ id }) => id === attempt.transferOfAttemptId);
  if (!source?.completedAt || (source.rating !== "good" && source.rating !== "easy")) return false;
  const from = source.exerciseSnapshot; const to = attempt.exerciseSnapshot;
  return from.id !== to.id && from.tonalContext.key !== to.tonalContext.key
    && JSON.stringify(from.generatorSnapshot.degreeSequence) === JSON.stringify(to.generatorSnapshot.degreeSequence)
    && from.targetEvents.length === to.targetEvents.length
    && from.targetEvents.every((event, index) => {
      const target = to.targetEvents[index];
      return JSON.stringify(event.degree) === JSON.stringify(target.degree) && event.startBeat === target.startBeat && event.durationBeats === target.durationBeats;
    });
}
function timestampToken(date: Date): string { return date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15); }
function documentToken(contents: string): string { return `sha256-${sha256Hex(new TextEncoder().encode(contents))}`; }
function parseStrictStoredFile(document: PracticeStoredDocument): PracticeFileV1 {
  let parsed: unknown;
  try { parsed = JSON.parse(document.contents); }
  catch (error) { throw new PracticeRepositoryError("invalid-data", "Selected Practice backup is not valid JSON.", error); }
  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success || envelope.data.revision !== document.revision || document.revision < 1 || document.token !== documentToken(document.contents)) {
    throw new PracticeRepositoryError("invalid-data", "Selected Practice backup failed strict envelope validation.", envelope.success ? undefined : envelope.error);
  }
  return validatePracticeFile(envelope.data as PracticeFileV1);
}
function freezeFile(file: PracticeFileV1): PracticeFileV1 { return Object.freeze(file); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object"; }
