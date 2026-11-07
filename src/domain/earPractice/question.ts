import type { ChordSymbol } from "../types";
import type { BankProgression } from "./bank";
import { earKeyName, type EarMode } from "./keys";
import { earLevelOf, type EarLevel } from "./levels";
import type { EarJudge } from "./judge";
import { chordFromDegreeToken } from "./spelling";
import { voiceForEar } from "./voicing";

export const DEFAULT_EAR_BPM = 80;
export const EAR_BEATS_PER_BAR = 4;

export interface EarQuestionChord {
  label: string;
  symbol: ChordSymbol;
  /** 1-based bar of the question. */
  bar: number;
  /** From the start of the question, in beats. */
  startBeat: number;
  durationBeats: number;
  /** The notes that are sounded, lowest first. */
  notes: number[];
  judge: EarJudge;
  /** The degree token of a bank progression (kept in the records). */
  degree?: string;
}

export interface EarQuestion {
  /** `bank:L3-4-01`, `builtin:<id>`, `collection:<id>:<first bar>` */
  id: string;
  source: "bank" | "builtin" | "collection";
  level: EarLevel;
  /** Bars. */
  length: number;
  mode: EarMode;
  tonic: number;
  keyName: string;
  bpm: number;
  beatsPerBar: number;
  chords: EarQuestionChord[];
  /** Bank only: the number shown while practising, and the name shown on the result screen (may be empty). */
  displayNumber?: number;
  name?: string;
}

/** The judge of notes this practice made itself: 7alt cannot pass `judgeChord`, so it is judged as a set of note names. */
export const judgeOfMadeNotes = (symbol: ChordSymbol): EarJudge => (symbol.altered ? "pitchset" : "core");

/** A bank progression in a key: the chords, the notes to sound and how each is judged. */
export function buildBankQuestion(
  progression: BankProgression,
  tonic: number,
  bpm = DEFAULT_EAR_BPM,
): EarQuestion {
  const chords: EarQuestionChord[] = [];
  progression.bars.forEach((bar, barIndex) => {
    const each = EAR_BEATS_PER_BAR / bar.length;
    bar.forEach((token, indexInBar) => {
      const symbol = chordFromDegreeToken(token, tonic, progression.mode);
      chords.push({
        label: symbol.label,
        symbol,
        bar: barIndex + 1,
        startBeat: barIndex * EAR_BEATS_PER_BAR + indexInBar * each,
        durationBeats: each,
        notes: voiceForEar(symbol),
        judge: judgeOfMadeNotes(symbol),
        degree: token,
      });
    });
  });
  return {
    id: `bank:${progression.id}`,
    source: "bank",
    level: progression.level,
    length: progression.length,
    mode: progression.mode,
    tonic,
    keyName: earKeyName(tonic, progression.mode),
    bpm,
    beatsPerBar: EAR_BEATS_PER_BAR,
    chords,
    displayNumber: progression.displayNumber,
    name: progression.name,
  };
}

/** The level a question's chords add up to (used by the tests against the level written in the data). */
export const questionLevel = (question: EarQuestion): EarLevel =>
  earLevelOf(question.chords.map((chord) => chord.symbol), { tonic: question.tonic, mode: question.mode });
