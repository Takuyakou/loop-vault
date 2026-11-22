/**
 * P23-39 §4: the course store boundary. A course trial is an explicit outcome handed from the session-only
 * engine (P23-35/38) to this store; the store never writes the normal Dojo records, and a past session
 * success is never migrated into a course pass.
 *
 * Frozen rules:
 * - schema/version/bankVersion/policyVersion/pairId must match; an unknown version is rejected, never
 *   silently migrated.
 * - a trial id is idempotent: the same id with identical content is a no-op; different content is a conflict.
 * - the stored evidence is the sealed notes, the result, the timestamps, the version pair and the hint /
 *   self / MIDI flags. No audio, no raw MIDI stream, no device id, no OS path.
 * - self-confirmation and MIDI confirmation are separate booleans; self never sets midi.
 * - corrupted or unknown data is rejected and left for the caller to keep in memory (no silent reset).
 */
export const COURSE_STORE_SCHEMA = "loopvault-guided-course";
export const COURSE_STORE_VERSION = 1;

/**
 * The physical location is frozen here (P23-39 v2), not deferred to P23-40:
 * - browser: `loop-vault:guided-course-v1:data` (the same `loop-vault:<namespace>-v1:data` shape as the
 *   Dojo, ear-practice and Original-practice stores);
 * - native: the `loopvault` app-data directory, file `guided-course-v1.json`, envelope
 *   `{"app":"loopvault-guided-course","fileVersion":1,...}`;
 * - the store is not part of the existing backup/export flows (it holds no audio and no raw MIDI).
 *
 * `fileVersion` stays 1: v2 only changed the *contract pair* the store must match, not the record shape.
 */
export const COURSE_STORE_BROWSER_KEY = "loop-vault:guided-course-v1:data";
export const COURSE_STORE_DIR = "loopvault";
export const COURSE_STORE_FILE = "guided-course-v1.json";
export const COURSE_STORE_ENVELOPE_APP = "loopvault-guided-course";
export const COURSE_STORE_FILE_VERSION = 1;

export type TrialResult = "correct" | "wrong" | "incomplete" | "no-input" | "invalid";
export type InvalidReason = "disconnected" | "prepare-failed" | "clock-jump" | "capability";

export interface TrialRecord {
  readonly trialId: string;
  readonly itemId: string;
  readonly level: 1 | 2 | 3;
  readonly quality: string;
  readonly root: number;
  readonly result: TrialResult;
  readonly invalidReason?: InvalidReason;
  readonly sealedNotes: readonly number[];
  readonly speedMs?: number;
  readonly hintUsed: boolean;
  readonly selfConfirmed: boolean;
  readonly midiConfirmed: boolean;
  readonly startedAt: string;
  readonly sealedAt: string;
}

export interface CourseStore {
  readonly schema: typeof COURSE_STORE_SCHEMA;
  readonly version: typeof COURSE_STORE_VERSION;
  readonly bankVersion: string;
  readonly policyVersion: string;
  readonly pairId: string;
  readonly trials: readonly TrialRecord[];
}

const FORBIDDEN_KEY = /(audio|raw|device|usb|port|username|base64|midiStream|path)/i;

export function createStore(pair: { bankVersion: string; policyVersion: string; pairId: string }): CourseStore {
  return {
    schema: COURSE_STORE_SCHEMA,
    version: COURSE_STORE_VERSION,
    bankVersion: pair.bankVersion,
    policyVersion: pair.policyVersion,
    pairId: pair.pairId,
    trials: [],
  };
}

export type ApplyResult =
  | { readonly ok: true; readonly store: CourseStore; readonly applied: boolean }
  | { readonly ok: false; readonly reason: string };

function validTrial(trial: TrialRecord): string | undefined {
  if (!trial.trialId || trial.trialId.length > 128) return "試行 id が不正です";
  if (!trial.itemId || trial.itemId.length > 128) return "課題 id が不正です";
  if (trial.level !== 1 && trial.level !== 2 && trial.level !== 3) return "レベルの範囲外です";
  if (!Number.isInteger(trial.root) || trial.root < 0 || trial.root > 11) return "根音の範囲外です";
  if (!trial.quality || trial.quality.length > 32) return "quality が不正です";
  if (trial.result === "invalid" && !trial.invalidReason) return "無効試行には理由が必要です";
  if (trial.result !== "invalid" && trial.invalidReason !== undefined) return "通常の試行に無効理由があります";
  if (trial.sealedNotes.some((note) => !Number.isInteger(note) || note < 0 || note > 127)) return "採取音の範囲外です";
  if (trial.speedMs !== undefined && (!Number.isFinite(trial.speedMs) || trial.speedMs < 0)) return "速度が不正です";
  if (!/^\d{4}-\d{2}-\d{2}T/.test(trial.startedAt) || !/^\d{4}-\d{2}-\d{2}T/.test(trial.sealedAt)) return "日時が不正です";
  for (const key of Object.keys(trial)) if (FORBIDDEN_KEY.test(key)) return "保存禁止の項目があります";
  if (trial.hintUsed && trial.midiConfirmed) {
    // A hint-assisted correct trial may be stored, but it must not claim independent confirmation.
    return "ヒントありの確認を独立合格として保存できません";
  }
  return undefined;
}

export function applyTrial(store: CourseStore, trial: TrialRecord): ApplyResult {
  if (store.schema !== COURSE_STORE_SCHEMA || store.version !== COURSE_STORE_VERSION) return { ok: false, reason: "未知の保存形式です" };
  if (!pairConsistent(store)) return { ok: false, reason: "version pair が一致しません" };
  const problem = validTrial(trial);
  if (problem) return { ok: false, reason: problem };
  const existing = store.trials.find((entry) => entry.trialId === trial.trialId);
  if (existing) {
    const same = JSON.stringify(existing) === JSON.stringify(trial);
    return same ? { ok: true, store, applied: false } : { ok: false, reason: "同じ試行 id の内容が違います" };
  }
  return { ok: true, store: { ...store, trials: [...store.trials, trial] }, applied: true };
}

function pairConsistent(store: CourseStore): boolean {
  return Boolean(store.bankVersion)
    && Boolean(store.policyVersion)
    && store.pairId === `${store.bankVersion}+${store.policyVersion}`;
}

export function validateStore(value: unknown): { ok: true; store: CourseStore } | { ok: false; reason: string } {
  if (typeof value !== "object" || value === null) return { ok: false, reason: "保存データがオブジェクトではありません" };
  const candidate = value as Partial<CourseStore>;
  if (candidate.schema !== COURSE_STORE_SCHEMA) return { ok: false, reason: "schema が違います" };
  if (candidate.version !== COURSE_STORE_VERSION) return { ok: false, reason: "未知の version です" };
  if (!candidate.bankVersion || !candidate.policyVersion || !candidate.pairId) return { ok: false, reason: "version pair がありません" };
  if (candidate.pairId !== `${candidate.bankVersion}+${candidate.policyVersion}`) return { ok: false, reason: "version pair が一致しません" };
  if (!Array.isArray(candidate.trials)) return { ok: false, reason: "trials が配列ではありません" };
  const ids = new Set<string>();
  for (const trial of candidate.trials as TrialRecord[]) {
    const problem = validTrial(trial);
    if (problem) return { ok: false, reason: problem };
    if (ids.has(trial.trialId)) return { ok: false, reason: "試行 id が重複しています" };
    ids.add(trial.trialId);
  }
  return { ok: true, store: candidate as CourseStore };
}
