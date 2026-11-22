import { isTauri } from "@tauri-apps/api/core";
import { BaseDirectory, exists, mkdir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { COURSE_BANK_VERSION, COURSE_PAIR_ID, COURSE_POLICY_VERSION, courseItemById } from "./bank";
import { appendCourseTrial, expectedIdsFor } from "./review";
import {
  COURSE_STORE_SCHEMA,
  COURSE_STORE_VERSION,
  type ActiveAttempt,
  type CourseStore,
  type CourseTrial,
  type CourseTrialResult,
} from "./types";

/**
 * P23-40 dedicated course store. It never touches the ordinary Dojo, ear, Original, Bass or Vault
 * records; the only key/path it reads or writes is the frozen guided-course one.
 *
 * Native layout (frozen in P23-39 v3 §6): AppData/loopvault/guided-course-v1.json, envelope
 * {"app":"loopvault-guided-course","fileVersion":1,...}; a `.tmp` file is renamed over the data file so
 * a failed write never leaves a partially written store. Corrupt data is quarantined and left unreadable
 * (never re-initialised). The store is not part of the backup/export flows.
 */
export const COURSE_BROWSER_KEY = "loop-vault:guided-course-v1:data";
export const COURSE_BROWSER_TEMP_KEY = "loop-vault:guided-course-v1:tmp";
export const COURSE_BROWSER_CORRUPT_PREFIX = "loop-vault:guided-course-v1:corrupt:";
export const COURSE_DIR = "loopvault";
export const COURSE_FILE = "guided-course-v1.json";
export const COURSE_TEMP_FILE = "guided-course-v1.json.tmp";
export const COURSE_ENVELOPE_APP = "loopvault-guided-course";
export const COURSE_FILE_VERSION = 1;

export interface CourseStorageAdapter {
  read(): Promise<string | undefined>;
  write(contents: string): Promise<void>;
  quarantine(): Promise<string | undefined>;
}

interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class BrowserCourseStorage implements CourseStorageAdapter {
  constructor(private readonly storage: KeyValueStorage) {}

  async read(): Promise<string | undefined> {
    return this.storage.getItem(COURSE_BROWSER_KEY) ?? undefined;
  }

  async write(contents: string): Promise<void> {
    try {
      this.storage.setItem(COURSE_BROWSER_TEMP_KEY, contents);
      this.storage.setItem(COURSE_BROWSER_KEY, contents);
    } finally {
      try { this.storage.removeItem(COURSE_BROWSER_TEMP_KEY); } catch { /* the committed key is authoritative */ }
    }
  }

  async quarantine(): Promise<string | undefined> {
    const contents = this.storage.getItem(COURSE_BROWSER_KEY);
    if (contents === null) return undefined;
    const name = `${COURSE_BROWSER_CORRUPT_PREFIX}${timestampToken(new Date())}`;
    this.storage.setItem(name, contents);
    this.storage.removeItem(COURSE_BROWSER_KEY);
    return name;
  }
}

export class TauriCourseStorage implements CourseStorageAdapter {
  private readonly appData = { baseDir: BaseDirectory.AppData };

  async read(): Promise<string | undefined> {
    const path = `${COURSE_DIR}/${COURSE_FILE}`;
    return (await exists(path, this.appData)) ? readTextFile(path, this.appData) : undefined;
  }

  async write(contents: string): Promise<void> {
    const directory = COURSE_DIR;
    const temp = `${directory}/${COURSE_TEMP_FILE}`;
    const data = `${directory}/${COURSE_FILE}`;
    await mkdir(directory, { ...this.appData, recursive: true });
    await writeTextFile(temp, contents, this.appData);
    try {
      await rename(temp, data, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
    } catch (error) {
      try { await remove(temp, this.appData); } catch { /* the data file is unchanged */ }
      throw error;
    }
  }

  async quarantine(): Promise<string | undefined> {
    const data = `${COURSE_DIR}/${COURSE_FILE}`;
    if (!(await exists(data, this.appData))) return undefined;
    const name = `${COURSE_DIR}/guided-course-v1.corrupt-${timestampToken(new Date())}.json`;
    await rename(data, name, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
    return name;
  }
}

/** The runtime adapter. The browser key is also the fallback when the app runs in a plain browser. */
export function createCourseStorage(): CourseStorageAdapter {
  if (isTauri()) return new TauriCourseStorage();
  return new BrowserCourseStorage(window.localStorage);
}

export function createCourseStore(): CourseStore {
  return {
    schema: COURSE_STORE_SCHEMA,
    version: COURSE_STORE_VERSION,
    bankVersion: COURSE_BANK_VERSION,
    policyVersion: COURSE_POLICY_VERSION,
    pairId: COURSE_PAIR_ID,
    trials: [],
  };
}

const RESULT_VALUES: readonly CourseTrialResult[] = ["correct", "wrong", "incomplete", "no-input", "invalid"];
const INVALID_REASONS = ["disconnected", "prepare-failed", "clock-jump", "capability", "stall", "hidden"] as const;
const FORBIDDEN_KEY = /(audio|raw|device|usb|port|username|base64|midiStream|path)/i;

export type CourseLoad =
  | { readonly kind: "empty"; readonly store: CourseStore }
  | { readonly kind: "ok"; readonly store: CourseStore }
  | { readonly kind: "unreadable"; readonly reason: string };

export class CourseRepository {
  constructor(private readonly storage: CourseStorageAdapter) {}

  async load(): Promise<CourseLoad> {
    const contents = await this.storage.read();
    if (contents === undefined) return { kind: "empty", store: createCourseStore() };
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      return { kind: "unreadable", reason: "保存データを読めません。元のデータは残しています" };
    }
    const validated = validateCourseStore(parsed);
    if (!validated.ok) return { kind: "unreadable", reason: validated.reason };
    return { kind: "ok", store: validated.store };
  }

  async save(store: CourseStore): Promise<void> {
    const validated = validateCourseStore(store);
    if (!validated.ok) throw new Error(validated.reason);
    const envelope = {
      app: COURSE_ENVELOPE_APP,
      fileVersion: COURSE_FILE_VERSION,
      ...validated.store,
    };
    await this.storage.write(`${JSON.stringify(envelope, null, 2)}\n`);
  }

  async appendTrial(store: CourseStore, trial: CourseTrial): Promise<CourseStore> {
    const next = appendCourseTrial(store, trial);
    if (next !== store) await this.save(next);
    return next;
  }

  async quarantine(): Promise<string | undefined> {
    return this.storage.quarantine();
  }
}

/** A test double that keeps the exact bytes and can fail the next read/write/quarantine. */
export class MemoryCourseStorage implements CourseStorageAdapter {
  committed?: string;
  readonly artifacts = new Map<string, string>();
  readonly operations: string[] = [];
  failRead = false;
  failWrite = false;
  failQuarantine = false;

  async read(): Promise<string | undefined> {
    this.operations.push("read");
    if (this.failRead) throw new Error("injected read failure");
    return this.committed;
  }

  async write(contents: string): Promise<void> {
    this.operations.push("write");
    if (this.failWrite) throw new Error("injected write failure");
    this.committed = contents;
  }

  async quarantine(): Promise<string | undefined> {
    this.operations.push("quarantine");
    if (this.failQuarantine) throw new Error("injected quarantine failure");
    if (this.committed === undefined) return undefined;
    const name = `loopvault/guided-course-v1.corrupt-${timestampToken(new Date())}.json`;
    this.artifacts.set(name, this.committed);
    this.committed = undefined;
    return name;
  }
}

export type CourseValidation = { readonly ok: true; readonly store: CourseStore } | { readonly ok: false; readonly reason: string };

export function validateCourseStore(value: unknown): CourseValidation {
  if (typeof value !== "object" || value === null) return { ok: false, reason: "保存データがオブジェクトではありません" };
  const candidate = value as Partial<CourseStore> & { app?: unknown; fileVersion?: unknown };
  if (candidate.app !== undefined && candidate.app !== COURSE_ENVELOPE_APP) return { ok: false, reason: "保存元アプリが違います" };
  if (candidate.fileVersion !== undefined && candidate.fileVersion !== COURSE_FILE_VERSION) return { ok: false, reason: "未知のファイル版です" };
  if (candidate.schema !== COURSE_STORE_SCHEMA) return { ok: false, reason: "schema が違います" };
  if (candidate.version !== COURSE_STORE_VERSION) return { ok: false, reason: "未知の版です" };
  if (candidate.bankVersion !== COURSE_BANK_VERSION || candidate.policyVersion !== COURSE_POLICY_VERSION || candidate.pairId !== COURSE_PAIR_ID) {
    return { ok: false, reason: "version pair が凍結版と一致しません。合格は移行しません" };
  }
  if (!Array.isArray(candidate.trials)) return { ok: false, reason: "trials が配列ではありません" };
  const ids = new Set<string>();
  for (const trial of candidate.trials as CourseTrial[]) {
    const problem = validateTrial(trial);
    if (problem !== undefined) return { ok: false, reason: problem };
    if (ids.has(trial.trialId)) return { ok: false, reason: "試行 id が重複しています" };
    ids.add(trial.trialId);
  }
  if (candidate.active !== undefined) {
    const problem = validateActive(candidate.active);
    if (problem !== undefined) return { ok: false, reason: problem };
  }
  if (candidate.rounds !== undefined) {
    if (typeof candidate.rounds !== "object" || candidate.rounds === null) return { ok: false, reason: "周回の記録が不正です" };
    for (const [key, value] of Object.entries(candidate.rounds)) {
      if (key !== "1" && key !== "2" && key !== "3") return { ok: false, reason: "周回のレベルが不正です" };
      if (typeof value !== "object" || value === null || !isIsoDate((value as { startedAt?: unknown }).startedAt)) {
        return { ok: false, reason: "周回の開始日時が不正です" };
      }
    }
  }
  return { ok: true, store: candidate as CourseStore };
}

function validateTrial(trial: CourseTrial): string | undefined {
  if (typeof trial !== "object" || trial === null) return "試行がオブジェクトではありません";
  if (typeof trial.trialId !== "string" || trial.trialId.length === 0 || trial.trialId.length > 256) return "試行 id が不正です";
  if (typeof trial.attemptId !== "string" || trial.attemptId.length === 0) return "attempt id が不正です";
  if (trial.block !== "sameDay" && trial.block !== "delay") return "試行の block が不正です";
  if (trial.level !== 1 && trial.level !== 2 && trial.level !== 3) return "レベルの範囲外です";
  const item = courseItemById(trial.itemId);
  if (item === undefined) return "凍結 bank にない課題です";
  if (item.level !== trial.level || item.quality !== trial.quality || item.root !== trial.root) return "課題の quality/root/level が一致しません";
  if (!RESULT_VALUES.includes(trial.result)) return "結果が不正です";
  if (trial.result === "invalid" && !(INVALID_REASONS as readonly string[]).includes(String(trial.invalidReason))) return "無効試行には理由が必要です";
  if (trial.result !== "invalid" && trial.invalidReason !== undefined) return "通常の試行に無効理由があります";
  if (!Array.isArray(trial.sealedNotes) || trial.sealedNotes.some((note) => !Number.isInteger(note) || note < 0 || note > 127)) return "採取音の範囲外です";
  if (trial.speedMs !== undefined && (!Number.isFinite(trial.speedMs) || trial.speedMs < 0)) return "速度が不正です";
  if (!isIsoDate(trial.startedAt) || !isIsoDate(trial.sealedAt)) return "日時が不正です";
  if (trial.hintUsed && trial.midiConfirmed) return "ヒントありの確認を独立合格として保存できません";
  for (const key of Object.keys(trial)) if (FORBIDDEN_KEY.test(key)) return "保存禁止の項目があります";
  const expected = expectedIdsFor(trial.level, trial.block);
  if (!expected.includes(trial.itemId)) return "評価 set にない課題です";
  return undefined;
}

function validateActive(active: ActiveAttempt): string | undefined {
  if (active.level !== 1 && active.level !== 2 && active.level !== 3) return "active のレベルが不正です";
  if (active.block !== "sameDay" && active.block !== "delay") return "active の block が不正です";
  if (typeof active.attemptId !== "string" || active.attemptId.length === 0) return "active の attempt id が不正です";
  if (!isIsoDate(active.startedAt)) return "active の開始時刻が不正です";
  if (active.mode !== "midi" && active.mode !== "self") return "active の mode が不正です";
  return undefined;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function createCourseTrial(input: {
  readonly attempt: ActiveAttempt;
  readonly itemId: string;
  readonly quality: string;
  readonly root: number;
  readonly result: CourseTrialResult;
  readonly invalidReason?: CourseTrial["invalidReason"];
  readonly sealedNotes: readonly number[];
  readonly speedMs?: number;
  readonly hintUsed?: boolean;
  readonly selfConfirmed?: boolean;
  readonly midiConfirmed?: boolean;
  readonly startedAt: string;
  readonly sealedAt: string;
}): CourseTrial {
  return {
    trialId: `${input.attempt.attemptId}:${input.itemId}`,
    attemptId: input.attempt.attemptId,
    block: input.attempt.block,
    itemId: input.itemId,
    level: input.attempt.level,
    quality: input.quality,
    root: input.root,
    result: input.result,
    ...(input.invalidReason === undefined ? {} : { invalidReason: input.invalidReason }),
    sealedNotes: [...input.sealedNotes],
    ...(input.speedMs === undefined ? {} : { speedMs: input.speedMs }),
    hintUsed: input.hintUsed ?? false,
    selfConfirmed: input.selfConfirmed ?? false,
    midiConfirmed: input.midiConfirmed ?? input.attempt.mode === "midi",
    startedAt: input.startedAt,
    sealedAt: input.sealedAt,
  };
}

function timestampToken(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}
