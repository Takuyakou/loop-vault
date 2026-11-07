import { ALL_BANK, CORE_BANK, bankProgression, benchmarkEntry, BENCHMARK, type BankProgression } from "./bank";
import { earChordKind, type EarKind } from "./earRecords";
import type { EarLevel } from "./levels";
import { buildBankQuestion, DEFAULT_EAR_BPM, type EarQuestion } from "./question";

/** How many of the latest questions are kept out of the next choice. */
export const RECENT_QUESTIONS = 10;

export interface BankChoice {
  level: EarLevel;
  length: 4 | 8 | 16;
  /** Include the added progressions (the setting 「追加の進行も出す」, on by default). */
  includeExtra: boolean;
}

/** The progressions that can be asked with this choice. */
export function bankCandidates(choice: BankChoice): BankProgression[] {
  return (choice.includeExtra ? ALL_BANK : CORE_BANK)
    .filter((entry) => entry.level === choice.level && entry.length === choice.length);
}

/** For the screen that chooses: how many there are (e.g. 「出題用の進行 364(追加 304 を含む)」). */
export function bankCounts(choice: Pick<BankChoice, "includeExtra"> & Partial<Pick<BankChoice, "level" | "length">>) {
  const pool = choice.includeExtra ? ALL_BANK : CORE_BANK;
  const matching = pool.filter((entry) =>
    (choice.level === undefined || entry.level === choice.level)
    && (choice.length === undefined || entry.length === choice.length));
  return { total: matching.length, extra: matching.filter((entry) => entry.set === "extra").length };
}

export interface PickOptions extends BankChoice {
  /** `random` (the default) picks one of the 12 keys that is not the last one; a number plays in that key. */
  tonic?: number | "random";
  /** Ids of the questions asked lately, newest last (`bank:L3-4-01` or `L3-4-01`). */
  recentIds?: readonly string[];
  previousTonic?: number;
  /** A number in [0, 1). */
  random?: () => number;
  bpm?: number;
  /** Practice a weak point: only progressions with many chords of this kind (Stage 03 §4.3). */
  kind?: EarKind;
}

const kindCounts = new Map<string, number>();
/** How many chords of a kind a progression has (the kind does not depend on the key). */
function chordsOfKind(entry: BankProgression, kind: EarKind): number {
  const cached = kindCounts.get(`${entry.id}|${kind}`);
  if (cached !== undefined) return cached;
  const count = buildBankQuestion(entry, 0).chords.filter((chord) => earChordKind(chord.symbol) === kind).length;
  kindCounts.set(`${entry.id}|${kind}`, count);
  return count;
}

/** The progressions with a kind of chord, keeping the ones that have at least half as many as the richest. */
export function withManyOfKind(entries: readonly BankProgression[], kind: EarKind): BankProgression[] {
  const most = Math.max(0, ...entries.map((entry) => chordsOfKind(entry, kind)));
  return most === 0 ? [] : entries.filter((entry) => chordsOfKind(entry, kind) >= Math.ceil(most / 2));
}

const bareId = (id: string) => id.replace(/^bank:/, "");

/**
 * One question from the bank. Not one of the last ten asked (unless there is nothing else), and a benchmark
 * problem is never asked in the key it is always benchmarked in (so the benchmark stays a fresh comparison).
 * `undefined` when nothing fits.
 */
export function pickBankQuestion(options: PickOptions): EarQuestion | undefined {
  const random = options.random ?? Math.random;
  const tonicChoice = options.tonic ?? "random";
  const recent = new Set((options.recentIds ?? []).slice(-RECENT_QUESTIONS).map(bareId));
  const allowed = (entry: BankProgression, tonic: number) => benchmarkEntry(entry.id)?.tonic !== tonic;
  const candidates = (options.kind ? withManyOfKind(bankCandidates(options), options.kind) : bankCandidates(options)).filter((entry) =>
    tonicChoice === "random" || allowed(entry, tonicChoice));
  if (!candidates.length) return undefined;
  const fresh = candidates.filter((entry) => !recent.has(entry.id));
  const last = (options.recentIds ?? []).length ? bareId(options.recentIds![options.recentIds!.length - 1]!) : undefined;
  const pool = fresh.length ? fresh : candidates.filter((entry) => entry.id !== last).length
    ? candidates.filter((entry) => entry.id !== last)
    : candidates;
  const entry = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
  const tonic = tonicChoice === "random" ? randomTonic(random, options.previousTonic, benchmarkEntry(entry.id)?.tonic) : tonicChoice;
  return buildBankQuestion(entry, tonic, options.bpm ?? DEFAULT_EAR_BPM);
}

/** A key of the 12, not the previous one (and not `avoid`). */
export function randomTonic(random: () => number, previous?: number, avoid?: number): number {
  const keys = Array.from({ length: 12 }, (_, index) => index).filter((key) => key !== previous && key !== avoid);
  return keys[Math.min(keys.length - 1, Math.floor(random() * keys.length))]!;
}

/** 腕試し: the fixed question number `index` (0…3) of a level, in its fixed key. */
export function benchmarkQuestion(level: EarLevel, index: number, bpm = DEFAULT_EAR_BPM): EarQuestion | undefined {
  const entry = BENCHMARK[level]?.[index];
  const progression = entry && bankProgression(entry.id);
  return entry && progression ? buildBankQuestion(progression, entry.tonic, bpm) : undefined;
}
