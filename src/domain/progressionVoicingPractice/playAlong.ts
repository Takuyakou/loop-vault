/**
 * P25-09 I3: Voicing Loop's play-along judgement, as pure functions. No clock, no screen: the view feeds the
 * audible position, the held / pedal-sustained notes and the time in milliseconds.
 */
import type { ChordSymbol } from "../types";
import { chordMatchSets } from "../voicingShapes";

export type PlayAlongMode = "exact" | "chord";

/** One timeline card as the judgement sees it. `target` is the keyboard guide's notes (no reference bass). */
export interface PlayAlongCard {
  readonly startBeat: number;
  readonly durationBeats: number;
  /** Undefined for a rest or an unusable card (not judged, not counted). */
  readonly target?: readonly number[];
  readonly chord?: ChordSymbol;
}

export type KeyMark = "ok" | "wrong" | "pedal";

export interface NoteJudgement {
  /** Per sounding note: green ●, red ×, or the pedal's own look (a sustained note that is not a target). */
  readonly keys: ReadonlyMap<number, KeyMark>;
  /** Every needed note is sounding and nothing else is. */
  readonly complete: boolean;
}

const pc = (note: number): number => ((note % 12) + 12) % 12;
const SHIFTS = [0, 12, -12, 24, -24] as const;

/** I3-1: the audible beat — the transport's last (beat, audio time) pair moved on to the output time. */
export function audibleBeat(pair: { readonly beat: number; readonly time: number } | undefined, fallbackBeat: number,
  nowAudio: number, outputLatency: number, bpm: number, maxAhead: number): number {
  if (!pair) return fallbackBeat;
  const ahead = (nowAudio - (pair.time - outputLatency)) / (60 / (bpm || 120));
  return pair.beat + Math.min(maxAhead, Math.max(0, ahead));
}

/** The card the audible beat is in (cards are in time order and do not overlap). */
export function cardAtBeat(cards: readonly PlayAlongCard[], beat: number): number {
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards[index]!;
    if (beat >= card.startBeat - 1e-9 && beat < card.startBeat + card.durationBeats - 1e-9) return index;
  }
  return -1;
}

/** I3-2 / I3-3: the grace window at a card's start and end: min(150ms, 25% of the card). */
export function graceMs(card: PlayAlongCard, msPerBeat: number): number {
  return Math.min(150, card.durationBeats * msPerBeat * 0.25);
}

interface JudgeInput {
  readonly mode: PlayAlongMode;
  readonly card: PlayAlongCard;
  readonly held: readonly number[];
  readonly sustained: readonly number[];
  /** I3-2 / I3-3: notes that must not turn red right now (the previous card's or the next card's targets). */
  readonly forgiven?: readonly number[];
}

/**
 * I3-4..6: the notes judged for one card and the colour of each sounding key. A forgiven note that does not
 * belong to this card gets no colour and does not stop the card (I3-2 / I3-3).
 */
export function judgeNotes(input: JudgeInput): NoteJudgement {
  const { card } = input;
  const keys = new Map<number, KeyMark>();
  const target = card.target ?? [];
  if (target.length === 0) return { keys, complete: false };
  const forgiven = new Set(input.forgiven ?? []);
  const held = new Set(input.held);
  if (input.mode === "exact") {
    const inTarget = (note: number) => SHIFTS.some((shift) => target.includes(note - shift));
    // I3-4: a pedal note counts only when it is a target note; otherwise it keeps the pedal look.
    const sounding = [...new Set([...held, ...input.sustained.filter((note) => !held.has(note) && inTarget(note))])];
    const judged = sounding.filter((note) => !(forgiven.has(note) && !inTarget(note)));
    // I3-5: one shift for all notes — the one most notes fit (ties: nearest 0, then lower).
    let best = 0; let bestCount = -1;
    for (const shift of [0, -12, 12, -24, 24]) {
      const count = judged.filter((note) => target.includes(note - shift)).length;
      if (count > bestCount) { best = shift; bestCount = count; }
    }
    for (const note of judged) {
      if (target.includes(note - best)) keys.set(note, "ok");
      else if (!forgiven.has(note)) keys.set(note, "wrong");
    }
    for (const note of input.sustained) if (!keys.has(note) && !held.has(note)) keys.set(note, "pedal");
    const shifted = new Set(target.map((note) => note + best));
    const matched = judged.filter((note) => !(forgiven.has(note) && !shifted.has(note)));
    const complete = matched.length === shifted.size && matched.every((note) => shifted.has(note));
    return { keys, complete };
  }
  const chord = card.chord!;
  const sets = chordMatchSets(chord);
  const allowed = new Set([...sets.allowed, ...target.map(pc)]);
  const sounding = [...new Set([...held, ...input.sustained.filter((note) => !held.has(note) && allowed.has(pc(note)))])];
  const judged = sounding.filter((note) => allowed.has(pc(note)) || !forgiven.has(note));
  for (const note of judged) keys.set(note, allowed.has(pc(note)) ? "ok" : "wrong");
  for (const note of input.sustained) if (!keys.has(note) && !held.has(note)) keys.set(note, "pedal");
  const pcs = new Set(judged.map(pc));
  // I3-6: every needed note, nothing outside 「allowed」 (the chord's notes, safe colours, bass, the card's own notes).
  const complete = judged.length > 0
    && [...sets.required].every((value) => pcs.has(value))
    && (sets.requiredOneOf === undefined || [...sets.requiredOneOf].some((value) => pcs.has(value)))
    && judged.every((note) => allowed.has(pc(note)))
    && (sets.bass === undefined || pc(Math.min(...judged)) === sets.bass);
  return { keys, complete };
}

// ---- I3-1..8: the card results across loops ----

export type CardResult = "hit" | "miss";

export interface PlayAlongState {
  readonly loop: number;
  /** This loop's results by card index. */
  readonly results: ReadonlyMap<number, CardResult>;
  /** The previous loop's results, shown faded until the playhead enters the card again (I3-8). */
  readonly previous: ReadonlyMap<number, CardResult>;
  /** The card the audible position is in (-1 before the first). */
  readonly current: number;
  readonly enteredAtMs: number;
  /** A new key press (note-on or a change of the held set) happened since the card was entered. */
  readonly pressedSinceEntry: boolean;
  /** I3-2: a press in the current card's last grace window counts for the next card. */
  readonly earlyForNext: boolean;
  readonly lastHeld: readonly number[];
}

export function createPlayAlongState(): PlayAlongState {
  return { loop: 0, results: new Map(), previous: new Map(), current: -1, enteredAtMs: 0, pressedSinceEntry: false, earlyForNext: false, lastHeld: [] };
}

const judgedCard = (card: PlayAlongCard | undefined) => card?.target !== undefined && card.target.length > 0;

/**
 * I3-1 / I3-7 / I3-8: the audible position moved to card `index` (at `nowMs`) in loop `loop`. The card left
 * behind is settled (`miss` unless it latched `hit`); a new loop moves this loop's results to `previous`.
 */
export function enterCard(state: PlayAlongState, cards: readonly PlayAlongCard[], index: number, loop: number, nowMs: number): PlayAlongState {
  if (index === state.current && loop === state.loop) return state;
  const results = new Map(state.results);
  if (state.current >= 0 && judgedCard(cards[state.current]) && !results.has(state.current)) results.set(state.current, "miss");
  let previous = new Map(state.previous);
  let current = results;
  if (loop !== state.loop) { previous = new Map([...previous, ...results]); current = new Map(); }
  // I3-8: entering a card clears its faded previous mark; it is judged again.
  previous.delete(index);
  current.delete(index);
  return {
    ...state, loop, results: current, previous, current: index, enteredAtMs: nowMs,
    pressedSinceEntry: state.earlyForNext, earlyForNext: false,
  };
}

/** I3-7: pause — the playhead goes back to the current card's head; that card is judged again on resume. */
export function pausePlayAlong(state: PlayAlongState): PlayAlongState {
  const results = new Map(state.results);
  results.delete(state.current);
  return { ...state, results, pressedSinceEntry: false, earlyForNext: false };
}

/** I3-7: stop, restart, a new key / octave / voicing — every result and the note history go. */
export function resetPlayAlong(): PlayAlongState {
  return createPlayAlongState();
}

export interface NotesUpdate {
  readonly state: PlayAlongState;
  readonly judgement: NoteJudgement;
}

/**
 * I3-1..6: the held / sustained notes changed at `nowMs` while the audible position is in `state.current`.
 * `counting` is false during the count-in (colours only, no result).
 */
export function updateNotes(
  state: PlayAlongState,
  cards: readonly PlayAlongCard[],
  input: { readonly mode: PlayAlongMode; readonly held: readonly number[]; readonly sustained: readonly number[];
    readonly nowMs: number; readonly msPerBeat: number; readonly counting: boolean },
): NotesUpdate {
  const card = cards[state.current];
  const empty: NoteJudgement = { keys: new Map(), complete: false };
  if (!card || !judgedCard(card)) return { state: { ...state, lastHeld: input.held }, judgement: empty };
  // A new press is a note-on (a key held now that was not held before); releasing keys is not one.
  const pressed = input.held.some((note) => !state.lastHeld.includes(note));
  const grace = graceMs(card, input.msPerBeat);
  const sinceEntry = input.nowMs - state.enteredAtMs;
  const cardMs = card.durationBeats * input.msPerBeat;
  const inEarly = sinceEntry >= cardMs - grace;
  const previousCard = state.current > 0 ? cards[state.current - 1] : undefined;
  const nextCard = cards[state.current + 1];
  const forgiven = [
    ...(sinceEntry < grace ? previousCard?.target ?? [] : []),
    ...(inEarly ? nextCard?.target ?? [] : []),
  ];
  const judgement = judgeNotes({ mode: input.mode, card, held: input.held, sustained: input.sustained, forgiven });
  let next: PlayAlongState = { ...state, lastHeld: input.held };
  // I3-2: a press in the last grace window is the next card's 「press after entry」.
  if (pressed && inEarly && nextCard && judgedCard(nextCard)) next = { ...next, earlyForNext: true };
  else if (pressed) next = { ...next, pressedSinceEntry: true };
  if (input.counting && judgement.complete && next.pressedSinceEntry && !next.results.has(state.current)) {
    // I3-1 rule 1: a hit latches for the loop.
    next = { ...next, results: new Map(next.results).set(state.current, "hit") };
  }
  return { state: next, judgement };
}

/** I6: this loop's achieved cards over the judged cards (rests and unusable cards out; a range keeps its own cards). */
export function achievement(state: PlayAlongState, cards: readonly PlayAlongCard[], range?: { readonly first: number; readonly last: number }): { readonly hit: number; readonly total: number } {
  let hit = 0; let total = 0;
  cards.forEach((card, index) => {
    if (!judgedCard(card)) return;
    if (range && (index < range.first || index > range.last)) return;
    total += 1;
    if (state.results.get(index) === "hit") hit += 1;
  });
  return { hit, total };
}
