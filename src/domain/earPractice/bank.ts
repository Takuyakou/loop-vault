import coreData from "./earProgressions.json";
import extraData from "./earProgressionsExtra.json";
import displayData from "./earDisplayNumbers.json";
import type { EarLevel } from "./levels";
import type { EarMode } from "./keys";

export interface BankProgression {
  id: string;
  level: EarLevel;
  /** Bars: 4, 8 or 16. */
  length: 4 | 8 | 16;
  mode: EarMode;
  /** What the progression is, in words. Shown only on the result screen (it gives the answer away). May be empty. */
  name: string;
  /** One or two chords per bar, as degree tokens (`V7(b9)`, `I/III` …). */
  bars: string[][];
  /** The fixed number shown instead of the name while practising ("耳の課題 037"). */
  displayNumber: number;
  /** The progressions of the first set (benchmark questions are chosen from these) or the added set. */
  set: "core" | "extra";
}

export interface BenchmarkEntry {
  id: string;
  /** The key the benchmark question is always played in. */
  tonic: number;
}

interface RawProgression {
  id: string; level: number; length: number; mode: string; name: string; bars: string[][];
}

const numbers = (displayData as { numbers: Record<string, number> }).numbers;

function load(data: { progressions: RawProgression[] }, set: "core" | "extra"): BankProgression[] {
  return data.progressions.map((raw) => {
    const displayNumber = numbers[raw.id];
    if (displayNumber === undefined) throw new Error(`No display number for ${raw.id}`);
    return {
      id: raw.id,
      level: raw.level as EarLevel,
      length: raw.length as 4 | 8 | 16,
      mode: raw.mode as EarMode,
      name: raw.name,
      bars: raw.bars,
      displayNumber,
      set,
    };
  });
}

export const CORE_BANK: readonly BankProgression[] = load(coreData as unknown as { progressions: RawProgression[] }, "core");
export const EXTRA_BANK: readonly BankProgression[] = load(extraData as unknown as { progressions: RawProgression[] }, "extra");
export const ALL_BANK: readonly BankProgression[] = [...CORE_BANK, ...EXTRA_BANK];

const byId = new Map(ALL_BANK.map((entry) => [entry.id, entry]));
export const bankProgression = (id: string): BankProgression | undefined => byId.get(id);

/** The fixed questions of 腕試し: per level, the problems and the key each is always played in. */
export const BENCHMARK: Readonly<Record<EarLevel, readonly BenchmarkEntry[]>> =
  (coreData as unknown as { benchmark: Record<EarLevel, BenchmarkEntry[]> }).benchmark;

/** The benchmark entry of a progression, if it is one. */
export function benchmarkEntry(id: string): BenchmarkEntry | undefined {
  for (const entries of Object.values(BENCHMARK)) {
    const found = entries.find((entry) => entry.id === id);
    if (found) return found;
  }
  return undefined;
}
