import { DEFAULT_SETTLE_MS, MAX_SETTLE_MS, MIN_SETTLE_MS, type EarLevel } from "../../domain/earPractice";

export type EarSource = "bank" | "builtin" | "collection";

/** What the choosing screen remembers (per viewer; the next time the same choices are there). */
export interface EarSettings {
  source: EarSource;
  level: EarLevel;
  length: 4 | 8 | 16;
  /** `random` (the default for the bank and the standard progressions), `original` (the saved key of one's own progression), or one of the 12 keys (0…11). */
  tonic: "random" | "original" | number;
  bpm: number;
  /** Show the name of the first chord from the start. */
  showFirstName: boolean;
  /** Sound the chord by itself when its turn comes. */
  autoPlay: boolean;
  /** 「追加の進行も出す」 */
  includeExtra: boolean;
  settleMs: number;
  /** How far the keyboard was moved by hand, in octaves (kept for the next question). */
  octaveShift: number;
  /** A standard progression chosen from the list (`any` = the app chooses). */
  builtinId: string;
  /** A saved progression chosen from the list (`any` = the app chooses). */
  collectionBlockId: string;
  /** Show how well the audio clock and the page clock agree (for checking a machine; off by default). */
  showClock: boolean;
  /** Show the degree and the function on every card from the start (for learning; off by default). */
  showDegrees: boolean;
}

export const DEFAULT_EAR_SETTINGS: EarSettings = {
  source: "bank",
  level: 1,
  length: 4,
  tonic: "random",
  bpm: 90,
  showFirstName: true,
  autoPlay: true,
  includeExtra: true,
  settleMs: DEFAULT_SETTLE_MS,
  octaveShift: 0,
  builtinId: "any",
  collectionBlockId: "any",
  showClock: false,
  showDegrees: false,
};

const KEY = "loop-vault:ear-practice-settings:v1";
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function normalizeEarSettings(value: unknown): EarSettings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<EarSettings>;
  const d = DEFAULT_EAR_SETTINGS;
  const tonic = raw.tonic === "random" || raw.tonic === "original" ? raw.tonic
    : typeof raw.tonic === "number" && Number.isInteger(raw.tonic) && raw.tonic >= 0 && raw.tonic < 12 ? raw.tonic : d.tonic;
  return {
    source: raw.source === "builtin" || raw.source === "collection" || raw.source === "bank" ? raw.source : d.source,
    level: ([1, 2, 3, 4, 5] as const).includes(raw.level as EarLevel) ? (raw.level as EarLevel) : d.level,
    length: raw.length === 8 || raw.length === 16 || raw.length === 4 ? raw.length : d.length,
    tonic,
    bpm: typeof raw.bpm === "number" && Number.isFinite(raw.bpm) ? clamp(Math.round(raw.bpm), 60, 140) : d.bpm,
    showFirstName: typeof raw.showFirstName === "boolean" ? raw.showFirstName : d.showFirstName,
    autoPlay: typeof raw.autoPlay === "boolean" ? raw.autoPlay : d.autoPlay,
    includeExtra: typeof raw.includeExtra === "boolean" ? raw.includeExtra : d.includeExtra,
    settleMs: typeof raw.settleMs === "number" && Number.isFinite(raw.settleMs) ? clamp(Math.round(raw.settleMs), MIN_SETTLE_MS, MAX_SETTLE_MS) : d.settleMs,
    octaveShift: typeof raw.octaveShift === "number" && Number.isInteger(raw.octaveShift) ? clamp(raw.octaveShift, -2, 2) : d.octaveShift,
    builtinId: typeof raw.builtinId === "string" ? raw.builtinId : d.builtinId,
    collectionBlockId: typeof raw.collectionBlockId === "string" ? raw.collectionBlockId : d.collectionBlockId,
    showClock: typeof raw.showClock === "boolean" ? raw.showClock : d.showClock,
    showDegrees: typeof raw.showDegrees === "boolean" ? raw.showDegrees : d.showDegrees,
  };
}

export function loadEarSettings(): EarSettings {
  try {
    const text = globalThis.localStorage?.getItem(KEY);
    return normalizeEarSettings(text ? JSON.parse(text) : undefined);
  } catch {
    return DEFAULT_EAR_SETTINGS;
  }
}

export function saveEarSettings(settings: EarSettings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not being able to remember is not a reason to stop.
  }
}
