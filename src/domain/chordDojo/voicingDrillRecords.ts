import { isTauri } from '@tauri-apps/api/core';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { z } from 'zod';
import { BrowserPracticeStorage, TauriPracticeStorage } from '../../features/bass-practice/infra/repository/practiceStorage';
import type { PracticeStorage, PracticeStoredDocument } from '../../features/bass-practice/infra/repository/practiceRepository';

/**
 * P19 ボイシングドリルの記録: its own file (namespace `voicing-drill`), grouped by set → content revision → key →
 * ① 見て弾く / ② 覚えて弾く. The Dojo record, Jazz Progressions and Original Practice are never touched, and an older
 * app never opens this file. Each content revision keeps the C cards it was timed with, so an old record still says
 * which cards its milliseconds belonged to.
 */
export const VOICING_DRILL_APP = 'loopvault-voicing-drill';
export const VOICING_DRILL_NAMESPACE = 'voicing-drill';
export const VOICING_DRILL_FILE = 'voicing-drill-v1.json';
export const MAX_DRILL_CARDS = 64;

const cardSchema = z.object({
  id: z.string().min(1).max(8),
  label: z.string().min(1).max(40),
  degree: z.string().min(1).max(40),
  form: z.union([z.literal('A'), z.literal('B'), z.null()]),
  left: z.array(z.number().int().min(0).max(127)).length(1),
  right: z.array(z.number().int().min(0).max(127)).min(3).max(4),
}).strict();

const lapSchema = z.object({
  totalMs: z.number().int().min(0).max(86_400_000),
  cardMs: z.array(z.number().int().min(0).max(3_600_000)).max(MAX_DRILL_CARDS),
  at: z.string().datetime(),
}).strict();
const entrySchema = z.object({
  laps: z.number().int().min(0).max(1_000_000),
  best: lapSchema.optional(),
  last: lapSchema.extend({ marks: z.array(z.number().int().min(0).max(MAX_DRILL_CARDS - 1)).max(MAX_DRILL_CARDS) }).optional(),
}).strict();
const keyEntrySchema = z.object({ see: entrySchema.optional(), recall: entrySchema.optional() }).strict();
const revisionSchema = z.object({
  cards: z.array(cardSchema).min(1).max(MAX_DRILL_CARDS),
  keys: z.record(z.string().regex(/^(?:[0-9]|1[01])$/), keyEntrySchema),
}).strict();

export const voicingDrillRecordsSchema = z.object({
  app: z.literal(VOICING_DRILL_APP),
  fileVersion: z.literal(1),
  version: z.literal(1),
  revision: z.number().int().positive(),
  sets: z.record(z.string().min(1).max(40), z.record(z.string().min(1).max(64), revisionSchema)),
  operations: z.array(z.string().min(1).max(128)).max(10_000),
}).strict();
export type VoicingDrillRecords = z.infer<typeof voicingDrillRecordsSchema>;
export type DrillStageKey = 'see' | 'recall';
export type DrillRecordCard = z.infer<typeof cardSchema>;

export const emptyDrillRecords = (): VoicingDrillRecords => ({
  app: VOICING_DRILL_APP, fileVersion: 1, version: 1, revision: 1, sets: {}, operations: [],
});

export interface DrillCardsRevision {
  readonly revision: string;
  readonly cards: readonly DrillRecordCard[];
}

/**
 * Reads the file and drops only the entries whose timing no longer matches their cards (the whole file is kept, and the
 * dropped places are reported).
 */
export function parseDrillRecords(raw: string): { ok: true; file: VoicingDrillRecords; rejected: string[] } | { ok: false; error: string } {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { ok: false, error: 'not JSON' }; }
  if (!value || typeof value !== 'object') return { ok: false, error: 'not an object' };
  const envelope = value as { fileVersion?: unknown; version?: unknown };
  if ((typeof envelope.fileVersion === 'number' && envelope.fileVersion > 1) || (typeof envelope.version === 'number' && envelope.version > 1)) {
    return { ok: false, error: 'future version' };
  }
  const parsed = voicingDrillRecordsSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: 'invalid shape' };
  const rejected: string[] = [];
  const sets: VoicingDrillRecords['sets'] = {};
  for (const [setId, revisions] of Object.entries(parsed.data.sets)) {
    sets[setId] = {};
    for (const [setRevision, revision] of Object.entries(revisions)) {
      const keys: typeof revision.keys = {};
      for (const [key, keyEntry] of Object.entries(revision.keys)) {
        const next: typeof keyEntry = {};
        for (const stage of ['see', 'recall'] as const) {
          const entry = keyEntry[stage];
          if (!entry) continue;
          if (!entry.best && !entry.last) continue;
          const lengths = [entry.best?.cardMs.length, entry.last?.cardMs.length].filter((length): length is number => length !== undefined);
          const marks = entry.last?.marks ?? [];
          const marksFit = marks.every((mark) => mark < revision.cards.length);
          const timing = entry.best?.totalMs === undefined || entry.best.cardMs.reduce((sum, ms) => sum + ms, 0) === entry.best.totalMs;
          const lastTiming = entry.last === undefined || entry.last.cardMs.reduce((sum, ms) => sum + ms, 0) === entry.last.totalMs;
          if (lengths.some((length) => length !== revision.cards.length) || !marksFit || !timing || !lastTiming) {
            rejected.push(`${setId}/${setRevision}/${key}/${stage}`);
            continue;
          }
          next[stage] = entry;
        }
        if (next.see || next.recall) keys[key] = next;
      }
      if (Object.keys(keys).length) sets[setId]![setRevision] = { cards: revision.cards, keys };
    }
  }
  return { ok: true, file: { ...parsed.data, sets }, rejected };
}

/** The lap to keep as the best: the smaller total, ties keeping the first. */
const better = (a: { totalMs: number } | undefined, b: { totalMs: number } | undefined) =>
  a === undefined ? b : b === undefined ? a : b.totalMs < a.totalMs ? b : a;

const timestampToken = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

/** Own canonical/backups/CAS; never reads or writes another practice file. */
export class VoicingDrillRepository {
  private current?: PracticeStoredDocument;
  private blocked = true;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: PracticeStorage) {}

  async load(): Promise<{ file: VoicingDrillRecords; rejected: string[] }> {
    const raw = await this.storage.readCommitted();
    this.current = raw;
    this.blocked = true;
    if (raw) {
      const parsed = parseDrillRecords(raw.contents);
      if (parsed.ok) {
        this.blocked = false;
        return { file: parsed.file, rejected: parsed.rejected };
      }
      if (parsed.error === 'future version') {
        throw new Error('ボイシングドリルの記録は新しい版の形式です。この記録を保持しています。');
      }
    }
    const [backups, artifacts] = await Promise.all([this.storage.listBackups(), this.storage.listRecoveryArtifacts()]);
    if (!raw && !backups.length && !artifacts.length) {
      this.blocked = false;
      return { file: emptyDrillRecords(), rejected: [] };
    }
    for (const backup of backups) {
      const document = await this.storage.readBackup(backup.name);
      const parsed = parseDrillRecords(document.contents);
      if (!parsed.ok) continue;
      if (raw) await this.storage.quarantineCommitted(timestampToken(), raw.token);
      this.current = undefined;
      const restored = await this.persist(parsed.file);
      this.blocked = false;
      return { file: restored, rejected: parsed.rejected };
    }
    throw new Error('ボイシングドリルの記録を読めません。この記録を保持しています。');
  }

  private async persist(file: VoicingDrillRecords): Promise<VoicingDrillRecords> {
    const next = voicingDrillRecordsSchema.parse({ ...file, revision: (this.current?.revision ?? 0) + 1 });
    await this.storage.commit(JSON.stringify(next, null, 2) + '\n', timestampToken(), this.current?.revision, this.current?.token);
    this.current = await this.storage.readCommitted();
    return next;
  }

  /** Adds one measured lap. The same operation never counts twice. */
  record(input: {
    readonly setId: string; readonly setRevision: string; readonly cards: readonly DrillRecordCard[];
    readonly key: number; readonly stage: DrillStageKey; readonly totalMs: number; readonly cardMs: readonly number[];
    readonly marks: readonly number[]; readonly operation: string; readonly at?: string;
  }): Promise<VoicingDrillRecords> {
    return this.mutate((file) => {
      if (file.operations.includes(input.operation)) return file;
      const at = input.at ?? new Date().toISOString();
      const lap = { totalMs: input.totalMs, cardMs: [...input.cardMs], at };
      const prior = file.sets[input.setId]?.[input.setRevision]?.keys[String(input.key)]?.[input.stage];
      const entry = {
        laps: (prior?.laps ?? 0) + 1,
        best: better(prior?.best, lap),
        last: { ...lap, marks: [...input.marks] },
      };
      return {
        ...file,
        sets: {
          ...file.sets,
          [input.setId]: {
            ...file.sets[input.setId],
            [input.setRevision]: {
              cards: [...input.cards],
              keys: {
                ...file.sets[input.setId]?.[input.setRevision]?.keys,
                [String(input.key)]: { ...file.sets[input.setId]?.[input.setRevision]?.keys[String(input.key)], [input.stage]: entry },
              },
            },
          },
        },
        operations: [...file.operations.slice(-999), input.operation],
      };
    });
  }

  private mutate(update: (file: VoicingDrillRecords) => VoicingDrillRecords): Promise<VoicingDrillRecords> {
    const result = this.queue.then(async () => {
      const { file } = await this.load();
      if (this.blocked) throw new Error('ボイシングドリルの記録の復旧が必要です。');
      const next = update(file);
      if (JSON.stringify(file) === JSON.stringify(next)) return file;
      return this.persist(next);
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
}

let repository: VoicingDrillRepository | undefined;
export const runtimeVoicingDrillRepository = () =>
  repository ??= new VoicingDrillRepository(isTauri()
    ? new TauriPracticeStorage(undefined, VOICING_DRILL_NAMESPACE)
    : new BrowserPracticeStorage(window.localStorage, VOICING_DRILL_NAMESPACE));

/** The record for one set revision and key, or undefined. */
export function drillEntryFor(file: VoicingDrillRecords, setId: string, setRevision: string, key: number, stage: DrillStageKey) {
  return file.sets[setId]?.[setRevision]?.keys[String(key)]?.[stage];
}

export interface DrillRecordInput {
  readonly setId: string;
  readonly setRevision: string;
  readonly cards: readonly DrillRecordCard[];
  readonly key: number;
  readonly stage: DrillStageKey;
  readonly totalMs: number;
  readonly cardMs: readonly number[];
  readonly marks: readonly number[];
  readonly operation: string;
  readonly at?: string;
}

export interface VoicingDrillState {
  readonly file: VoicingDrillRecords;
  readonly ready: boolean;
  readonly error?: string;
  initialize: () => Promise<void>;
  /** Adds one lap; a lap that cannot be saved is kept on the screen until it can be. */
  record: (input: DrillRecordInput) => Promise<void>;
  retry: () => Promise<void>;
}

/** The screen's view of the voicing-drill record: loads once, keeps laps that could not be saved until they can be. */
export function createVoicingDrillStore(
  open: () => VoicingDrillRepository = runtimeVoicingDrillRepository,
  empty: () => VoicingDrillRecords = emptyDrillRecords,
): StoreApi<VoicingDrillState> {
  let loading: Promise<void> | undefined;
  const pending = new Map<string, DrillRecordInput>();
  return createStore<VoicingDrillState>((set, get) => ({
    file: empty(),
    ready: false,
    async initialize() {
      if (get().ready) return;
      loading ??= open().load()
        .then(({ file }) => { set({ file, ready: true, error: undefined }); })
        .catch((error: unknown) => { set({ error: error instanceof Error ? error.message : 'ボイシングドリルの記録を開けません。元の記録を保持しています。' }); })
        .finally(() => { loading = undefined; });
      await loading;
    },
    async record(input) {
      pending.set(input.operation, input);
      await get().retry();
    },
    async retry() {
      await get().initialize();
      if (!get().ready) return;
      for (const [operation, input] of pending) {
        try {
          const file = await open().record(input);
          pending.delete(operation);
          set({ file, error: undefined });
        } catch {
          set({ error: 'ボイシングドリルの記録を保存できません。未保存分はこの画面に保持しています。' });
          return;
        }
      }
    },
  }));
}

export const voicingDrillRecordsStore = createVoicingDrillStore();
