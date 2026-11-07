import { buildPracticeChordRequirements } from "../practice/chordRequirements";
import type { ChordSymbol } from "../types";
import type { EarJudge } from "./judge";

const pitchClass = (value: number) => ((value % 12) + 12) % 12;

/** The note names an answer may and must contain. */
export interface AnswerSpec {
  /** All of these have to be played. */
  required: ReadonlySet<number>;
  /** Nothing else may be played. */
  allowed: ReadonlySet<number>;
}

/**
 * What a chord asks for, as note names. `core` follows the app's own requirements (the 5th may be left
 * out; the written bass is allowed; mMaj7 also needs its major 7th). `pitchset` and `sounded` ask for
 * exactly the names of the notes that were sounded.
 */
export function answerSpecOf(chord: { symbol: ChordSymbol; judge: EarJudge; notes: readonly number[] }): AnswerSpec {
  if (chord.judge !== "core") {
    const names = new Set(chord.notes.map(pitchClass));
    return { required: names, allowed: names };
  }
  const requirements = buildPracticeChordRequirements(chord.symbol, "normal");
  const required = new Set(requirements.requiredPitchClasses.map(pitchClass));
  const allowed = new Set([...requirements.allowedPitchClasses, chord.symbol.bass ?? chord.symbol.root].map(pitchClass));
  if (chord.symbol.quality === "minMaj7") {
    const seventh = pitchClass(chord.symbol.root + 11);
    required.add(seventh);
    allowed.add(seventh);
  }
  return { required, allowed };
}

export type EarAnswerReason = "complete" | "foreign" | "released";

export interface EarAnswer {
  /** The keys that were down, lowest first. */
  notes: number[];
  /** When the last key of this answer went down: the time the seconds are measured to (the wait for the answer to settle is not in it). */
  completedAt: number;
  /** When the answer was taken. */
  judgedAt: number;
  reason: EarAnswerReason;
}

export const DEFAULT_SETTLE_MS = 300;
export const MIN_SETTLE_MS = 150;
export const MAX_SETTLE_MS = 600;

/**
 * Takes "one answer" out of the keys that go down and up (P16-00 decisions §3). It looks at the keys, not at
 * the pedal, and counts note names (the same name in another octave is one).
 *
 *  - While the keys that are down are all names of the answer and the answer is not complete yet, nothing is
 *    judged, however long it takes (one note at a time, from the top, slowly: still on the way).
 *  - It is an answer when the names are complete, or a name that is not in the answer has gone down, and the
 *    keys that are down have not changed for `settleMs`.
 *  - When all keys are up, and two or more names had been down, the keys that were down are the answer
 *    (a missing name is one mistake). One key only is not an answer.
 *  - Keys that were already down when the card came (the previous chord, still held) are not an answer: the
 *    taker starts again from the moment all keys are up.
 *
 * Times are in one clock (milliseconds) chosen by the caller.
 */
export class EarAnswerTaker {
  private readonly held = new Map<string, number>();
  private gated: boolean;
  private lastChangeAt = Number.NEGATIVE_INFINITY;
  private lastPressAt = Number.NEGATIVE_INFINITY;
  private lastPressNotes: number[] = [];
  private pending: EarAnswer | undefined;
  private taken = false;

  constructor(
    private readonly spec: AnswerSpec,
    private readonly settleMs = DEFAULT_SETTLE_MS,
    keysDownNow: number = 0,
  ) {
    this.gated = keysDownNow > 0;
  }

  press(channel: number, note: number, at: number): void {
    if (this.taken) return;
    if (this.gated) return;
    this.held.set(`${channel}:${note}`, note);
    this.lastChangeAt = at;
    this.lastPressAt = at;
    this.lastPressNotes = this.sortedNotes();
  }

  release(channel: number, note: number, at: number): void {
    if (this.taken) return;
    this.held.delete(`${channel}:${note}`);
    if (this.gated) {
      if (!this.held.size) this.gated = false;
      return;
    }
    this.lastChangeAt = at;
    if (this.held.size) return;
    // All keys are up: what was played is the answer, if it was more than one name.
    if (new Set(this.lastPressNotes.map(pitchClass)).size >= 2) {
      this.pending = { notes: this.lastPressNotes, completedAt: this.lastPressAt, judgedAt: at, reason: "released" };
    }
    this.lastPressNotes = [];
  }

  /** Call often (every 10 ms or so). Returns the answer once, when there is one. */
  poll(at: number): EarAnswer | undefined {
    if (this.taken) return undefined;
    if (this.pending) {
      this.taken = true;
      return this.pending;
    }
    if (this.gated || !this.held.size) return undefined;
    const names = new Set([...this.held.values()].map(pitchClass));
    const foreign = [...names].some((name) => !this.spec.allowed.has(name));
    const complete = [...this.spec.required].every((name) => names.has(name));
    if (!foreign && !complete) return undefined; // on the way
    if (at - this.lastChangeAt < this.settleMs) return undefined;
    this.taken = true;
    return { notes: this.sortedNotes(), completedAt: this.lastPressAt, judgedAt: at, reason: foreign ? "foreign" : "complete" };
  }

  private sortedNotes(): number[] {
    return [...new Set(this.held.values())].sort((a, b) => a - b);
  }
}
