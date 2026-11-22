import { isTauri } from "@tauri-apps/api/core";
import { BaseDirectory, exists, mkdir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { ADVANCED_LEVELS } from "./levels";
import {
  ADVANCED_BANK_VERSION,
  ADVANCED_STORE_SCHEMA,
  ADVANCED_STORE_VERSION,
  type AdvancedAttempt,
  type AdvancedBlock,
  type AdvancedCourseLevel,
  type AdvancedResult,
  type AdvancedStep,
  type AdvancedStore,
  type AdvancedTrial,
} from "./types";

/**
 * P23-45 advanced course store. It is deliberately separate from the frozen P23-40 Lv1–3 store
 * (`loop-vault:guided-course-v1:data` / `loopvault/guided-course-v1.json`): reading or writing the
 * advanced file can never rewrite the basic course's ids, pass rules or mid-attempt position.
 *
 * Native layout: AppData/loopvault/guided-course-advanced-v1.json, envelope
 * {"app":"loopvault-guided-course-advanced","fileVersion":1,...}; a `.tmp` file is renamed over the
 * data file. Unreadable data is quarantined and left unreadable — never re-initialised. A different
 * `bankVersion` is *not* treated as corrupt: the evidence is kept and only re-read by the bank.
 */
export const ADVANCED_BROWSER_KEY = "loop-vault:guided-course-advanced-v1:data";
export const ADVANCED_BROWSER_TEMP = "loop-vault:guided-course-advanced-v1:tmp";
export const ADVANCED_BROWSER_CORRUPT_PREFIX = "loop-vault:guided-course-advanced-v1:corrupt:";
export const ADVANCED_DIR = "loopvault";
export const ADVANCED_FILE = "guided-course-advanced-v1.json";
export const ADVANCED_TEMP_FILE = "guided-course-advanced-v1.json.tmp";
export const ADVANCED_ENVELOPE_APP = "loopvault-guided-course-advanced";
export const ADVANCED_FILE_VERSION = 1;

export interface AdvancedStorage {
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

export class BrowserAdvancedStorage implements AdvancedStorage {
  constructor(private readonly storage: KeyValueStorage) {}

  async read(): Promise<string | undefined> {
    return this.storage.getItem(ADVANCED_BROWSER_KEY) ?? undefined;
  }

  async write(contents: string): Promise<void> {
    try {
      this.storage.setItem(ADVANCED_BROWSER_TEMP, contents);
      this.storage.setItem(ADVANCED_BROWSER_KEY, contents);
    } finally {
      try { this.storage.removeItem(ADVANCED_BROWSER_TEMP); } catch { /* the committed key is authoritative */ }
    }
  }

  async quarantine(): Promise<string | undefined> {
    const contents = this.storage.getItem(ADVANCED_BROWSER_KEY);
    if (contents === null) return undefined;
    const name = `${ADVANCED_BROWSER_CORRUPT_PREFIX}${timestampToken(new Date())}`;
    this.storage.setItem(name, contents);
    this.storage.removeItem(ADVANCED_BROWSER_KEY);
    return name;
  }
}

export class TauriAdvancedStorage implements AdvancedStorage {
  private readonly appData = { baseDir: BaseDirectory.AppData };

  async read(): Promise<string | undefined> {
    const path = `${ADVANCED_DIR}/${ADVANCED_FILE}`;
    return (await exists(path, this.appData)) ? readTextFile(path, this.appData) : undefined;
  }

  async write(contents: string): Promise<void> {
    const temp = `${ADVANCED_DIR}/${ADVANCED_TEMP_FILE}`;
    const data = `${ADVANCED_DIR}/${ADVANCED_FILE}`;
    await mkdir(ADVANCED_DIR, { ...this.appData, recursive: true });
    await writeTextFile(temp, contents, this.appData);
    try {
      await rename(temp, data, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
    } catch (error) {
      try { await remove(temp, this.appData); } catch { /* the data file is unchanged */ }
      throw error;
    }
  }

  async quarantine(): Promise<string | undefined> {
    const data = `${ADVANCED_DIR}/${ADVANCED_FILE}`;
    if (!(await exists(data, this.appData))) return undefined;
    const name = `${ADVANCED_DIR}/guided-course-advanced-v1.corrupt-${timestampToken(new Date())}.json`;
    await rename(data, name, { oldPathBaseDir: BaseDirectory.AppData, newPathBaseDir: BaseDirectory.AppData });
    return name;
  }
}

export function createAdvancedStorage(): AdvancedStorage {
  if (isTauri()) return new TauriAdvancedStorage();
  return new BrowserAdvancedStorage(window.localStorage);
}

export function createAdvancedStore(): AdvancedStore {
  return {
    schema: ADVANCED_STORE_SCHEMA,
    version: ADVANCED_STORE_VERSION,
    bankVersion: ADVANCED_BANK_VERSION,
    attempts: [],
    trials: [],
  };
}

const RESULT_VALUES: readonly AdvancedResult[] = ["correct", "wrong", "incomplete", "no-input", "invalid"];
const LEVEL_VALUES: readonly AdvancedCourseLevel[] = ADVANCED_LEVELS.map((spec) => spec.level);
const FORBIDDEN_KEY = /(audio|raw|device|usb|port|username|base64|midiStream|path)/i;

export type AdvancedLoad =
  | { readonly kind: "empty"; readonly store: AdvancedStore }
  | { readonly kind: "ok"; readonly store: AdvancedStore }
  | { readonly kind: "unreadable"; readonly reason: string };

export class AdvancedRepository {
  constructor(private readonly storage: AdvancedStorage) {}

  async load(): Promise<AdvancedLoad> {
    return parseAdvancedStore(await this.storage.read());
  }

  async save(store: AdvancedStore): Promise<void> {
    const validated = validateAdvancedStore(store);
    if (!validated.ok) throw new Error(validated.reason);
    await this.storage.write(`${JSON.stringify({ app: ADVANCED_ENVELOPE_APP, fileVersion: ADVANCED_FILE_VERSION, ...validated.store }, null, 2)}\n`);
  }

  async appendTrial(store: AdvancedStore, trial: AdvancedTrial): Promise<AdvancedStore> {
    const next = appendAdvancedTrial(store, trial);
    if (next !== store) await this.save(next);
    return next;
  }

  async quarantine(): Promise<string | undefined> {
    return this.storage.quarantine();
  }
}

export class MemoryAdvancedStorage implements AdvancedStorage {
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
    const name = `loopvault/guided-course-advanced-v1.corrupt-${timestampToken(new Date())}.json`;
    this.artifacts.set(name, this.committed);
    this.committed = undefined;
    return name;
  }
}

export type AdvancedValidation = { readonly ok: true; readonly store: AdvancedStore } | { readonly ok: false; readonly reason: string };

export function validateAdvancedStore(value: unknown): AdvancedValidation {
  if (typeof value !== "object" || value === null) return { ok: false, reason: "保存データがオブジェクトではありません" };
  const candidate = value as Partial<AdvancedStore> & { app?: unknown; fileVersion?: unknown };
  if (candidate.app !== undefined && candidate.app !== ADVANCED_ENVELOPE_APP) return { ok: false, reason: "保存元アプリが違います" };
  if (candidate.fileVersion !== undefined && candidate.fileVersion !== ADVANCED_FILE_VERSION) return { ok: false, reason: "未知のファイル版です" };
  if (candidate.schema !== ADVANCED_STORE_SCHEMA) return { ok: false, reason: "schema が違います" };
  if (candidate.version !== ADVANCED_STORE_VERSION) return { ok: false, reason: "未知の版です" };
  if (typeof candidate.bankVersion !== "string" || candidate.bankVersion.length === 0) return { ok: false, reason: "教材版がありません" };
  if (!Array.isArray(candidate.attempts)) return { ok: false, reason: "attempts が配列ではありません" };
  if (!Array.isArray(candidate.trials)) return { ok: false, reason: "trials が配列ではありません" };
  const attemptIds = new Set<string>();
  for (const attempt of candidate.attempts as AdvancedAttempt[]) {
    const problem = validateAttempt(attempt, attemptIds);
    if (problem !== undefined) return { ok: false, reason: problem };
  }
  const trialIds = new Set<string>();
  for (const trial of candidate.trials as AdvancedTrial[]) {
    const problem = validateTrial(trial, trialIds);
    if (problem !== undefined) return { ok: false, reason: problem };
  }
  for (const key of ["active", "free"] as const) {
    const id = candidate[key];
    if (id !== undefined && (typeof id !== "string" || !attemptIds.has(id))) return { ok: false, reason: `${key} が試行を指していません` };
  }
  if (candidate.rounds !== undefined) {
    if (typeof candidate.rounds !== "object" || candidate.rounds === null) return { ok: false, reason: "周回の記録が不正です" };
    for (const [key, value] of Object.entries(candidate.rounds)) {
      if (!LEVEL_VALUES.some((level) => String(level) === key)) return { ok: false, reason: "周回のレベルが不正です" };
      if (typeof value !== "object" || value === null || !isIsoDate((value as { startedAt?: unknown }).startedAt)) {
        return { ok: false, reason: "周回の開始日時が不正です" };
      }
    }
  }
  if (candidate.achievements !== undefined) {
    if (!Array.isArray(candidate.achievements)) return { ok: false, reason: "修了実績が配列ではありません" };
    const seen = new Set<string>();
    for (const level of candidate.achievements) {
      if (!LEVEL_VALUES.includes(level) || seen.has(String(level))) return { ok: false, reason: "修了実績のレベルが不正です" };
      seen.add(String(level));
    }
  }
  return { ok: true, store: candidate as AdvancedStore };
}

function validateAttempt(attempt: AdvancedAttempt, ids: Set<string>): string | undefined {
  if (typeof attempt !== "object" || attempt === null) return "試行がオブジェクトではありません";
  if (!LEVEL_VALUES.includes(attempt.level)) return "レベルの範囲外です";
  if (attempt.block !== "sameDay" && attempt.block !== "delay") return "block が不正です";
  if (typeof attempt.setId !== "string" || attempt.setId.length === 0 || attempt.setId.length > 64) return "set id が不正です";
  if (typeof attempt.attemptId !== "string" || attempt.attemptId.length === 0 || attempt.attemptId.length > 128) return "attempt id が不正です";
  if (ids.has(attempt.attemptId)) return "attempt id が重複しています";
  ids.add(attempt.attemptId);
  if (!isIsoDate(attempt.startedAt)) return "開始日時が不正です";
  if (attempt.mode !== "midi" && attempt.mode !== "self") return "mode が不正です";
  if (typeof attempt.practice !== "boolean") return "practice が不正です";
  if (attempt.group !== undefined && (typeof attempt.group !== "string" || attempt.group.length > 64)) return "group が不正です";
  if (!Array.isArray(attempt.itemIds) || attempt.itemIds.length === 0 || attempt.itemIds.length > 200) return "課題リストが不正です";
  const itemIds = new Set<string>();
  for (const id of attempt.itemIds) {
    if (typeof id !== "string" || id.length === 0 || id.length > 128 || itemIds.has(id)) return "課題 id が不正です";
    itemIds.add(id);
  }
  return undefined;
}

function validateTrial(trial: AdvancedTrial, ids: Set<string>): string | undefined {
  if (typeof trial !== "object" || trial === null) return "試行がオブジェクトではありません";
  if (typeof trial.trialId !== "string" || trial.trialId.length === 0 || trial.trialId.length > 256) return "試行 id が不正です";
  if (ids.has(trial.trialId)) return "試行 id が重複しています";
  ids.add(trial.trialId);
  if (typeof trial.attemptId !== "string" || trial.attemptId.length === 0 || trial.attemptId.length > 128) return "attempt id が不正です";
  if (trial.block !== "sameDay" && trial.block !== "delay") return "試行の block が不正です";
  if (typeof trial.setId !== "string" || trial.setId.length === 0 || trial.setId.length > 64) return "試行の set id が不正です";
  if (!LEVEL_VALUES.includes(trial.level)) return "レベルの範囲外です";
  if (typeof trial.itemId !== "string" || trial.itemId.length === 0 || trial.itemId.length > 128) return "課題 id が不正です";
  if (!RESULT_VALUES.includes(trial.result)) return "結果が不正です";
  if (!Array.isArray(trial.steps)) return "段階の記録が不正です";
  for (const step of trial.steps as unknown[]) {
    if (typeof step !== "object" || step === null) return "段階の記録が不正です";
    const record = step as { notes?: unknown; ok?: unknown; speedMs?: unknown };
    if (!Array.isArray(record.notes)) return "段階の記録が不正です";
    if (record.notes.some((note: unknown) => !isNote(note))) return "段階の音が範囲外です";
    if (typeof record.ok !== "boolean") return "段階の判定が不正です";
    if (record.speedMs !== undefined && (typeof record.speedMs !== "number" || !Number.isFinite(record.speedMs) || record.speedMs < 0)) return "段階の速度が不正です";
  }
  if (!Array.isArray(trial.sealedNotes) || trial.sealedNotes.some((note) => !isNote(note))) return "採取音の範囲外です";
  if (trial.bassOk !== undefined && typeof trial.bassOk !== "boolean") return "ベース判定が不正です";
  if (trial.speedMs !== undefined && (!Number.isFinite(trial.speedMs) || trial.speedMs < 0)) return "速度が不正です";
  if (trial.tempoBpm !== undefined && (!Number.isFinite(trial.tempoBpm) || trial.tempoBpm < 30 || trial.tempoBpm > 300)) return "テンポが不正です";
  for (const flag of ["hintUsed", "selfConfirmed", "midiConfirmed", "practice"] as const) {
    if (typeof trial[flag] !== "boolean") return `${flag} が不正です`;
  }
  if (!isIsoDate(trial.startedAt) || !isIsoDate(trial.sealedAt)) return "日時が不正です";
  for (const key of Object.keys(trial)) if (FORBIDDEN_KEY.test(key)) return "保存禁止の項目があります";
  return undefined;
}

function isNote(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 127;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function parseAdvancedStore(raw: string | undefined): AdvancedLoad {
  if (raw === undefined) return { kind: "empty", store: createAdvancedStore() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "unreadable", reason: "保存データを読めません。元のデータは残しています" };
  }
  const validated = validateAdvancedStore(parsed);
  if (!validated.ok) return { kind: "unreadable", reason: validated.reason };
  return { kind: "ok", store: validated.store };
}

export function startAdvancedAttempt(
  store: AdvancedStore,
  input: {
    readonly level: AdvancedCourseLevel;
    readonly block: AdvancedBlock;
    readonly setId: string;
    readonly itemIds: readonly string[];
    readonly group?: string;
    readonly mode?: "midi" | "self";
    readonly practice?: boolean;
  },
  now: Date,
  options: { readonly attemptId?: string } = {},
): AdvancedStore {
  const practice = input.practice ?? false;
  const attemptId = options.attemptId
    ?? `${practice ? "practice" : "official"}-${String(input.level)}-${input.block === "sameDay" ? "d" : "l"}-${now.getTime().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const attempt: AdvancedAttempt = {
    level: input.level,
    block: input.block,
    setId: input.setId,
    attemptId,
    startedAt: now.toISOString(),
    mode: input.mode ?? "midi",
    practice,
    ...(input.group === undefined ? {} : { group: input.group }),
    itemIds: [...input.itemIds],
  };
  return {
    ...store,
    attempts: [...store.attempts, attempt],
    ...(practice ? { free: attemptId } : { active: attemptId }),
  };
}

export function clearAdvancedActive(store: AdvancedStore, kind: "official" | "free" = "official"): AdvancedStore {
  const key = kind === "official" ? "active" : "free";
  if (store[key] === undefined) return store;
  const { [key]: _cleared, ...rest } = store;
  return rest;
}

export function appendAdvancedTrial(store: AdvancedStore, trial: AdvancedTrial): AdvancedStore {
  const existing = store.trials.find((entry) => entry.trialId === trial.trialId);
  if (existing !== undefined) {
    if (JSON.stringify(existing) === JSON.stringify(trial)) return store;
    throw new Error("同じ試行 id の内容が違います");
  }
  return { ...store, trials: [...store.trials, trial] };
}

export function attemptById(store: AdvancedStore, attemptId: string | undefined): AdvancedAttempt | undefined {
  if (attemptId === undefined) return undefined;
  return store.attempts.find((attempt) => attempt.attemptId === attemptId);
}

export function createAdvancedTrial(input: {
  readonly attempt: AdvancedAttempt;
  readonly itemId: string;
  readonly result: AdvancedResult;
  readonly steps?: readonly AdvancedStep[];
  readonly sealedNotes?: readonly number[];
  readonly bassOk?: boolean;
  readonly speedMs?: number;
  readonly tempoBpm?: number;
  readonly hintUsed?: boolean;
  readonly selfConfirmed?: boolean;
  readonly midiConfirmed?: boolean;
  readonly startedAt: string;
  readonly sealedAt: string;
  readonly suffix?: string;
}): AdvancedTrial {
  return {
    trialId: `${input.attempt.attemptId}:${input.itemId}${input.suffix === undefined ? "" : `:${input.suffix}`}`,
    attemptId: input.attempt.attemptId,
    block: input.attempt.block,
    setId: input.attempt.setId,
    itemId: input.itemId,
    level: input.attempt.level,
    result: input.result,
    steps: [...(input.steps ?? [])],
    sealedNotes: [...(input.sealedNotes ?? [])],
    ...(input.bassOk === undefined ? {} : { bassOk: input.bassOk }),
    ...(input.speedMs === undefined ? {} : { speedMs: input.speedMs }),
    ...(input.tempoBpm === undefined ? {} : { tempoBpm: input.tempoBpm }),
    hintUsed: input.hintUsed ?? false,
    selfConfirmed: input.selfConfirmed ?? false,
    midiConfirmed: input.midiConfirmed ?? input.attempt.mode === "midi",
    practice: input.attempt.practice,
    startedAt: input.startedAt,
    sealedAt: input.sealedAt,
  };
}

function timestampToken(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}
