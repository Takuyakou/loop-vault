import { createStore, type StoreApi } from "zustand/vanilla";
import { z } from "zod";
import { BUILTINS, builtinDisplayName } from "../../domain/chordDojo/builtins";
import { JAZZ_PROGRESSIONS_GROUP_NAME, jazzItemOf } from "../../domain/chordDojo/jazzProgressions";
import { ORIGINAL_GROUP_NAME, ORIGINAL_IDS, originalTitle, originalTonicOf } from "../../domain/chordDojo/originalPractice";
import { CURRICULUM, NAMES, PRESETS, SUFFIX, shapeKey } from "../../domain/chordDojo/recipes";
import { DRILL_KEY_NAMES, drillSetById } from "../../domain/chordDojo/voicingDrill";

/**
 * P20: the last practices the player actually started, for 「続きから」. This is a small setting of this PC only
 * (`loop-vault:dojo-recent:v1`), never a practice record: the Dojo, Jazz, Original, Ear and drill files are only read.
 * A practice is identified by its kind and a stable id (not its display name), so renaming an item keeps it; one
 * invalid entry is dropped without losing the others.
 */
export const DOJO_RECENT_KEY = "loop-vault:dojo-recent:v1";
export const DOJO_RECENT_VERSION = 1;
export const DOJO_RECENT_MAX = 3;

export const DOJO_RECENT_KINDS = ["standard", "jazz", "original", "master", "ear", "drill", "saved", "voicing", "shape", "today"] as const;
export type DojoRecentKind = (typeof DOJO_RECENT_KINDS)[number];

export interface DojoMasterChoice {
  readonly kind: "learning" | "review" | "mixed";
  readonly form: "A" | "B" | "C" | "D";
  readonly scope?: "all" | "A" | "B" | "C" | "D";
}

export interface DojoRecentEntry {
  readonly kind: DojoRecentKind;
  readonly id: string;
  /** The key (0-11) for the twelve-key practices; Original Practice keeps its shift (−6…+5). */
  readonly key?: number;
  readonly stage?: "see" | "recall";
  readonly random?: boolean;
  readonly master?: DojoMasterChoice;
  readonly at: string;
}

const masterSchema = z.object({
  kind: z.enum(["learning", "review", "mixed"]),
  form: z.enum(["A", "B", "C", "D"]),
  scope: z.enum(["all", "A", "B", "C", "D"]).optional(),
}).strict();

export const dojoRecentEntrySchema = z.object({
  kind: z.enum(DOJO_RECENT_KINDS),
  id: z.string().min(1).max(160),
  key: z.number().int().optional(),
  stage: z.enum(["see", "recall"]).optional(),
  random: z.boolean().optional(),
  master: masterSchema.optional(),
  at: z.string().datetime(),
}).strict().superRefine((entry, context) => {
  const invalid = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message, path: ["kind"] });
  if (entry.kind === "standard" || entry.kind === "jazz" || entry.kind === "drill") {
    if (entry.key === undefined || entry.key < 0 || entry.key > 11) invalid("a twelve-key practice needs key 0-11");
  }
  if (entry.kind === "original") {
    if (entry.key === undefined || entry.key < -6 || entry.key > 5) invalid("Original Practice needs a shift −6…+5");
  }
  if (entry.kind === "jazz" || entry.kind === "drill") {
    if (!entry.stage) invalid("this practice needs its stage");
  }
  if (entry.kind === "master" && !entry.master) invalid("Master needs its choice");
});

const envelopeSchema = z.object({ version: z.literal(DOJO_RECENT_VERSION), entries: z.array(z.unknown()) }).strict();

export interface DojoRecentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaultStorage = (): DojoRecentStorage | undefined => {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
};

/** The entries that can be read: each validated on its own, newest first, one per kind+id, at most three. */
export function readDojoRecent(storage: DojoRecentStorage | undefined = defaultStorage()): DojoRecentEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(DOJO_RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : envelopeSchema.safeParse(parsed).success ? (parsed as { entries: unknown[] }).entries : [];
    const entries: DojoRecentEntry[] = [];
    for (const item of list) {
      const valid = dojoRecentEntrySchema.safeParse(item);
      if (valid.success) entries.push(valid.data);
    }
    return dedupe(entries);
  } catch {
    return [];
  }
}

function dedupe(entries: readonly DojoRecentEntry[]): DojoRecentEntry[] {
  const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at));
  const seen = new Set<string>();
  const kept: DojoRecentEntry[] = [];
  for (const entry of sorted) {
    const identity = `${entry.kind}:${entry.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    kept.push(entry);
    if (kept.length >= DOJO_RECENT_MAX) break;
  }
  return kept;
}

const write = (storage: DojoRecentStorage | undefined, entries: readonly DojoRecentEntry[]) => {
  if (!storage) return;
  try { storage.setItem(DOJO_RECENT_KEY, JSON.stringify({ version: DOJO_RECENT_VERSION, entries })); } catch { /* the screen goes on without it */ }
};

export type DojoRecentInput = Omit<DojoRecentEntry, "at"> & { readonly at?: string };

export interface DojoRecentState {
  readonly entries: readonly DojoRecentEntry[];
  /** Adds (or moves to the top) the practice that just started its first card. */
  remember(entry: DojoRecentInput): void;
  /** Test/screen seam: reread the storage (for another tab or a reset). */
  reload(): void;
}

export function createDojoRecentStore(storage: DojoRecentStorage | undefined = defaultStorage()): StoreApi<DojoRecentState> {
  return createStore<DojoRecentState>((set) => ({
    entries: readDojoRecent(storage),
    remember(input) {
      const parsed = dojoRecentEntrySchema.safeParse({ ...input, at: input.at ?? new Date().toISOString() });
      if (!parsed.success) return;
      const entries = dedupe([parsed.data, ...readDojoRecent(storage)]);
      write(storage, entries);
      set({ entries });
    },
    reload() { set({ entries: readDojoRecent(storage) }); },
  }));
}

/** P22-03 §1: the words the Chord Dojo home and the Home both use for a remembered practice. */
export const DOJO_STAGE_LABEL: Record<"see" | "recall", string> = { see: "① 見て弾く", recall: "② 覚えて弾く" };
const DOJO_MODE_LABEL: Record<NonNullable<DojoRecentEntry["master"]>["kind"], string> = { learning: "学習", review: "復習", mixed: "Mixed Test" };

/** 今日 / 昨日 / N日前 */
export function relativeDayLabel(at: string, now: number = Date.now()): string {
  const days = Math.max(0, Math.floor((now - Date.parse(at)) / 86_400_000));
  return days === 0 ? "今日" : days === 1 ? "昨日" : `${days}日前`;
}

function shapeName(key: string): string | undefined {
  const shape = CURRICULUM.find((entry) => shapeKey(entry.quality, entry.preset, entry.bass) === key);
  if (!shape) return undefined;
  const quality = shape.quality === "maj" ? "メジャー" : shape.quality === "min" ? "マイナー" : SUFFIX[shape.quality] ?? shape.quality;
  return `${quality}・${PRESETS[shape.preset ?? "basic"]}`;
}

export interface DojoRecentLabelContext {
  /** The Vault progressions (`自分の進行`): a saved practice is only usable while its progression is there. */
  readonly progressions?: readonly { readonly key: string; readonly name: string }[];
  /** The symbol of a registered sound (登録した音), when the caller can read the Dojo file. */
  readonly voicingSymbol?: (id: string) => string | undefined;
}

export interface DojoRecentLabels {
  readonly practice: string;
  readonly item?: string;
  readonly stage?: string;
  readonly key?: string;
  /** False when the practice itself is gone (a deleted progression, an unknown id): the practice cannot open. */
  readonly exists: boolean;
}

/** The words of one remembered practice (the same labels the Chord Dojo home shows). */
export function dojoRecentLabels(entry: DojoRecentEntry, context: DojoRecentLabelContext = {}): DojoRecentLabels {
  const keyName = entry.key !== undefined && entry.kind !== "original" ? NAMES[entry.key] : undefined;
  switch (entry.kind) {
    case "standard": {
      const builtin = BUILTINS.find((item) => item.id === entry.id);
      return { practice: "定番の進行", ...(builtin ? { item: builtinDisplayName(builtin) } : {}), ...(keyName !== undefined ? { key: keyName } : {}), exists: Boolean(builtin) };
    }
    case "jazz": {
      const item = jazzItemOf(entry.id);
      return { practice: JAZZ_PROGRESSIONS_GROUP_NAME, ...(item ? { item: item.title } : {}), ...(entry.stage ? { stage: DOJO_STAGE_LABEL[entry.stage] } : {}), ...(keyName !== undefined ? { key: keyName } : {}), exists: Boolean(item) };
    }
    case "original":
      return { practice: ORIGINAL_GROUP_NAME, ...(ORIGINAL_IDS.includes(entry.id) ? { item: originalTitle(entry.id) } : {}), ...(entry.key !== undefined ? { key: NAMES[originalTonicOf(entry.key)] } : {}), exists: ORIGINAL_IDS.includes(entry.id) };
    case "master":
      return { practice: "2-5-1 Master", ...(entry.master ? { item: `Form ${entry.master.form}・${DOJO_MODE_LABEL[entry.master.kind]}` } : {}), exists: true };
    case "ear":
      return { practice: "耳で弾く", exists: true };
    case "drill": {
      const set = drillSetById(entry.id);
      return { practice: "ボイシングドリル", ...(set ? { item: set.name } : {}), ...(entry.stage ? { stage: DOJO_STAGE_LABEL[entry.stage] } : {}), ...(entry.key !== undefined ? { key: DRILL_KEY_NAMES[entry.key] } : {}), exists: Boolean(set) };
    }
    case "saved": {
      const progression = context.progressions?.find((item) => item.key === entry.id);
      return { practice: "自分の進行", ...(progression ? { item: progression.name } : {}), exists: Boolean(progression) };
    }
    case "voicing": {
      const label = context.voicingSymbol?.(entry.id);
      return { practice: "登録した音", ...(label ? { item: label } : {}), exists: Boolean(label) };
    }
    case "shape": {
      const label = shapeName(entry.id);
      return { practice: "コードの型", ...(label ? { item: label } : {}), exists: Boolean(label) };
    }
    case "today":
      return { practice: "今日のおまかせ", exists: true };
  }
}

/** The title the Chord Dojo home's 「続きから」 uses: `Chord Dojo・② 覚えて弾く・E♭`. */
export const dojoRecentTitle = (labels: Pick<DojoRecentLabels, "practice" | "stage" | "key">): string =>
  [labels.practice, labels.stage, labels.key].filter(Boolean).join("・");

/** The line under it: `王道進行・昨日`. */
export const dojoRecentSubtitle = (labels: Pick<DojoRecentLabels, "item">, at: string, now: number = Date.now()): string =>
  [labels.item, relativeDayLabel(at, now)].filter(Boolean).join("・");

export const dojoRecentStore = createDojoRecentStore();
export const rememberRecent = (entry: DojoRecentInput) => dojoRecentStore.getState().remember(entry);
