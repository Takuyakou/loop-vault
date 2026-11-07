import { collectVault, type VaultProgression } from "../chordDojo/collect";
import { formatChordSymbol } from "../chords";
import type { ChordSymbol, SongIdea } from "../types";
import { earJudge, type EarJudge } from "./judge";
import { earKeyName, keySpelling, type EarMode } from "./keys";
import { earLevelOf } from "./levels";
import { DEFAULT_EAR_BPM, judgeOfMadeNotes, type EarQuestion, type EarQuestionChord } from "./question";
import { voiceForEar } from "./voicing";

/** A stretch of a saved progression that can be asked: whole bars, from a bar line. */
export interface CollectionSegment {
  /** `collection:<internal block id>:<first bar>` (the internal id only: no name of the song is kept). */
  id: string;
  blockId: string;
  ideaId: string;
  /** Saved progression name, for the screen that chooses (never put in a record). */
  displayName: string;
  /** 1-based, counted from the start of the saved progression. */
  firstBar: number;
  length: number;
  beatsPerBar: number;
  key?: { tonic: number; mode: EarMode };
  chords: Array<{ progressionChord: VaultProgression["chords"][number]; startBeat: number; durationBeats: number }>;
}

export interface CollectionScan {
  segments: CollectionSegment[];
  /** Saved progressions that cannot be asked, by reason (shown on the screen that chooses). */
  unusable: { meter: number; unreadable: number };
}

/** `x/4` with x of 2…12, or no time signature (4/4). Anything else (1/4, 6/8 …) is not asked for now. */
export function usableBeatsPerBar(timeSignature: string | undefined): number | undefined {
  if (timeSignature === undefined) return 4;
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(timeSignature.trim());
  if (!match) return undefined;
  const numerator = Number(match[1]);
  return Number(match[2]) === 4 && numerator >= 2 && numerator <= 12 ? numerator : undefined;
}

/** "C major", "A minor", "Am", "F#" … → tonic and mode. `undefined` when the key is not known. */
export function parseKeyContext(text: string | undefined): { tonic: number; mode: EarMode } | undefined {
  const match = /^\s*([A-G])([#b♯♭]?)\s*(major|minor|maj|min|m)?\b/i.exec(text ?? "");
  if (!match) return undefined;
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]!.toUpperCase() as "C"]!;
  const shift = /[#♯]/.test(match[2]!) ? 1 : /[b♭]/.test(match[2]!) ? -1 : 0;
  const tail = (match[3] ?? "").toLowerCase();
  return { tonic: (natural + shift + 12) % 12, mode: tail === "m" || tail === "min" || tail === "minor" ? "minor" : "major" };
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/**
 * Which stretches of the saved progressions can be asked. A saved progression whose meter is not usable
 * (1/4 …) or whose chords cannot be read is counted in `unusable`, never changed or dropped from the data.
 */
export function scanCollection(ideas: readonly SongIdea[], lengths: readonly number[] = [4, 8, 16]): CollectionScan {
  const blocks = new Map<string, { timeSignature?: string }>();
  for (const idea of ideas) for (const block of idea.progressionBlocks ?? []) blocks.set(block.id, block);
  const result: CollectionScan = { segments: [], unusable: { meter: 0, unreadable: 0 } };
  for (const progression of collectVault([...ideas], "1970-01-01T00:00:00.000Z").progressions) {
    const beatsPerBar = usableBeatsPerBar(blocks.get(progression.blockId)?.timeSignature);
    if (beatsPerBar === undefined) { result.unusable.meter += 1; continue; }
    const ranges = progression.chordBeatRanges;
    if (!ranges || ranges.length !== progression.chords.length) { result.unusable.unreadable += 1; continue; }
    const key = parseKeyContext(progression.keyContext);
    const lastEnd = Math.max(...ranges.map((range) => range.end));
    for (const length of lengths) {
      for (let first = 1; (first - 1 + length) * beatsPerBar <= lastEnd + 1e-6; first += 1) {
        const from = (first - 1) * beatsPerBar;
        const to = from + length * beatsPerBar;
        const inside = progression.chords
          .map((chord, index) => ({ chord, range: ranges[index]! }))
          .filter(({ range }) => range.end > from + 1e-6 && range.start < to - 1e-6);
        // Whole chords only, one after the other, from the first bar line to the last.
        if (!inside.length || !close(inside[0]!.range.start, from) || !close(inside[inside.length - 1]!.range.end, to)) continue;
        if (!inside.every(({ range }, index) => range.start >= from - 1e-6 && range.end <= to + 1e-6
          && (index === 0 || close(range.start, inside[index - 1]!.range.end)))) continue;
        if (!inside.every(({ chord }) => readable(chord.chord))) continue;
        result.segments.push({
          id: `collection:${progression.blockId}:${first}`,
          blockId: progression.blockId,
          ideaId: progression.ideaId,
          displayName: progression.displayName ?? progression.name,
          firstBar: first,
          length,
          beatsPerBar,
          ...(key ? { key } : {}),
          chords: inside.map(({ chord, range }) => ({
            progressionChord: chord,
            startBeat: range.start - from,
            durationBeats: range.end - range.start,
          })),
        });
      }
    }
  }
  return result;
}

const readable = (symbol: ChordSymbol) => Boolean(symbol.label) && Number.isInteger(symbol.root);

const modulo = (value: number) => ((value % 12) + 12) % 12;

/** The notes of a saved chord moved by `shift` semitones (the shape stays the same). */
const shifted = (notes: readonly number[], shift: number) => notes.map((note) => note + shift);

/**
 * A saved stretch as a question. The notes sounded are the notes saved in the song (moved by the same
 * amount as the chords when the key is changed); a chord with no saved notes is sounded the way this practice
 * sounds chords. A chord whose saved notes do not pass `core` is judged `sounded` (the note names as sounded).
 */
export function buildCollectionQuestion(
  segment: CollectionSegment,
  options: { tonic?: number; bpm?: number } = {},
): EarQuestion {
  const original = segment.key?.tonic;
  const mode: EarMode = segment.key?.mode ?? "major";
  const shift = options.tonic === undefined || original === undefined
    ? 0
    : (modulo(options.tonic - original + 6) - 6);
  const tonic = original === undefined ? 0 : modulo(original + shift);
  const spelling = keySpelling(tonic, mode);
  const chords: EarQuestionChord[] = segment.chords.map(({ progressionChord, startBeat, durationBeats }) => {
    const base = progressionChord.chord;
    const symbol: ChordSymbol = shift === 0
      ? base
      : (() => {
        const moved = { ...base, root: modulo(base.root + shift), ...(base.bass === undefined ? {} : { bass: modulo(base.bass + shift) }) };
        return { ...moved, label: formatChordSymbol(moved, { accidentalPreference: spelling }) };
      })();
    const saved = progressionChord.source ? shifted(progressionChord.notes, shift) : undefined;
    const notes = saved ?? voiceForEar(symbol);
    const judge: EarJudge = saved
      ? (earJudge({ symbol, judge: "core", notes }, notes).ok ? "core" : "sounded")
      : judgeOfMadeNotes(symbol);
    return {
      label: symbol.label,
      symbol,
      bar: Math.floor(startBeat / segment.beatsPerBar) + 1,
      startBeat,
      durationBeats,
      notes,
      judge,
    };
  });
  return {
    id: segment.id,
    source: "collection",
    level: earLevelOf(chords.map((chord) => chord.symbol), segment.key ? { tonic, mode } : undefined),
    length: segment.length,
    mode,
    tonic,
    keyName: segment.key ? earKeyName(tonic, mode) : "",
    bpm: options.bpm ?? DEFAULT_EAR_BPM,
    beatsPerBar: segment.beatsPerBar,
    chords,
  };
}
