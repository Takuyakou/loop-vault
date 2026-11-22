import {
  createDrillLapClock,
  drillDistracted,
  drillShapeMatches,
  noteFirstPress,
  passCard,
  type DrillJudgeCard,
  type DrillLapClock,
} from "./voicingDrill";

/**
 * P19 ボイシングドリル: the round of one screen, as a pure value. The screen feeds the MIDI events in (only the keys
 * that are held; the pedal is not counted) and reads the card to pass, the milliseconds of the cards, the 迷った
 * marks and whether the round may be recorded.
 *
 * The rules (spec §3):
 * - the lowest held key is the root, the rest is the right hand's shape at any octave, exactly as many keys, the right
 *   hand above the left, and no other key held;
 * - the shape is judged when a key goes down *and* when it comes up (letting go of an extra key may complete it);
 * - at least one of the keys held now must have been pressed after this card began, so a shape carried from the
 *   previous card never passes by itself;
 * - one MIDI event advances at most one card;
 * - a press whose pitch class is not in the card marks the card as 迷った (octaves do not matter; it is recorded, the
 *   card is not failed).
 *
 * The clock (§4) starts at the first key pressed after 始める; a repeated lap starts at the instant the previous lap's
 * last card passed. The screen discards the round (back to before 始める) when the key, the set or the stage changes or
 * MIDI goes away; this module only knows how to build the next value.
 */
export type DrillRoundPhase = "idle" | "waiting-release" | "ready" | "running" | "finished";

export interface DrillRound {
  readonly phase: DrillRoundPhase;
  /** The card that is being played; on a finished round, the last card. */
  readonly index: number;
  readonly clock: DrillLapClock;
  /** The milliseconds of the cards that have passed in this lap. */
  readonly cardMs: readonly number[];
  /** The cards of this lap that were marked 迷った. */
  readonly marks: readonly number[];
  readonly hinted: boolean;
  readonly held: readonly number[];
  /** The keys pressed since this card began (the round of a repeated lap begins empty). */
  readonly pressedSinceCard: readonly number[];
  /** When the last card passed (the next lap starts here). */
  readonly finishedAt?: number;
}

export interface DrillEventResult {
  readonly round: DrillRound;
  readonly passed: boolean;
  readonly distracted: boolean;
}

const sorted = (values: Iterable<number>) => [...new Set(values)].sort((a, b) => a - b);

export const idleDrillRound = (): DrillRound => ({
  phase: "idle",
  index: 0,
  clock: createDrillLapClock(),
  cardMs: [],
  marks: [],
  hinted: false,
  held: [],
  pressedSinceCard: [],
});

/** 始める: with keys held, the round waits until they are all let go; otherwise the first press starts the clock. */
export function prepareDrillRound(held: Iterable<number>): DrillRound {
  const keys = sorted(held);
  return { ...idleDrillRound(), phase: keys.length ? "waiting-release" : "ready", held: keys };
}

/** After 始める: every key let go, so the next press starts the clock. */
export function releaseDrillKeys(round: DrillRound, held: Iterable<number>): DrillRound {
  if (round.phase !== "waiting-release") return round;
  const keys = sorted(held);
  return keys.length ? { ...round, held: keys } : { ...round, phase: "ready", held: [] };
}

/** ヒントを見た: the lap goes on but is not recorded. */
export const markDrillHint = (round: DrillRound): DrillRound => (round.hinted ? round : { ...round, hinted: true });

/** A repeated lap: it starts at the instant the previous lap's last card passed, on the key that is now on the screen. */
export const beginDrillLap = (round: DrillRound, at: number): DrillRound => ({
  ...round,
  phase: "running",
  index: 0,
  clock: { startedAt: at, lastCardAt: at },
  cardMs: [],
  marks: [],
  hinted: false,
  pressedSinceCard: [],
  finishedAt: undefined,
});

/** Without MIDI the lap is not timed: it starts at card 1, and 「弾けた」 advances it. */
export const beginManualDrillRound = (): DrillRound => ({ ...idleDrillRound(), phase: "running" });

/** 「弾けた」 on a round without MIDI: one card on, no milliseconds. */
export function advanceDrillCard(round: DrillRound, cardCount: number, at: number): DrillRound {
  if (round.phase !== "running") return round;
  return round.index + 1 >= cardCount
    ? { ...round, phase: "finished", pressedSinceCard: [], finishedAt: at }
    : { ...round, index: round.index + 1, pressedSinceCard: [] };
}

export const drillTotalMs = (round: DrillRound) => round.cardMs.reduce((sum, ms) => sum + ms, 0);

/** The elapsed time of the lap now, from its first key (0 before it is pressed). */
export const drillElapsedMs = (round: DrillRound, now: number) =>
  round.clock.startedAt === null ? 0 : Math.max(0, now - round.clock.startedAt);

/** The elapsed time of the card now, from the previous card (or the lap's first key). */
export const drillCardElapsedMs = (round: DrillRound, now: number) => {
  const from = round.clock.lastCardAt ?? round.clock.startedAt;
  return from === null ? 0 : Math.max(0, now - from);
};

/**
 * One MIDI event (`pitch`, pressed or released, at `at`). `cards` is the cards of this key; `cardCount` decides when
 * the lap is complete. A finished round keeps its last card and ignores further presses.
 */
export function drillEvent(round: DrillRound, cards: readonly DrillJudgeCard[], pitch: number, on: boolean, at: number, heldSnapshot?: readonly number[]): DrillEventResult {
  if (round.phase === "finished") return { round, passed: false, distracted: false };
  const card = cards[round.index];
  const snapshot = heldSnapshot ? sorted(heldSnapshot) : undefined;

  if (round.phase === "idle") {
    const held = snapshot ?? (on ? sorted([...round.held, pitch]) : round.held.filter((value) => value !== pitch));
    return { round: { ...round, held }, passed: false, distracted: false };
  }
  if (round.phase === "waiting-release") {
    const held = snapshot ?? (on ? sorted([...round.held, pitch]) : round.held.filter((value) => value !== pitch));
    return { round: held.length ? { ...round, held } : { ...round, phase: "ready", held }, passed: false, distracted: false };
  }
  if (round.phase === "ready") {
    if (!on) {
      const held = snapshot ?? round.held.filter((value) => value !== pitch);
      return { round: { ...round, held }, passed: false, distracted: false };
    }
    const held = snapshot ?? sorted([...round.held, pitch]);
    let next: DrillRound = {
      ...round,
      phase: "running",
      held,
      pressedSinceCard: sorted([...round.pressedSinceCard, pitch]),
      clock: noteFirstPress(round.clock, at),
    };
    const distracted = Boolean(card && drillDistracted(card, pitch));
    if (distracted && !next.marks.includes(next.index)) next = { ...next, marks: [...next.marks, next.index] };
    return judge(next, cards, at, distracted);
  }

  // running
  const held = snapshot ?? (on ? sorted([...round.held, pitch]) : round.held.filter((value) => value !== pitch));
  let next: DrillRound = on
    ? { ...round, held, pressedSinceCard: sorted([...round.pressedSinceCard, pitch]) }
    : { ...round, held };
  let distracted = false;
  if (on && card) {
    distracted = drillDistracted(card, pitch);
    if (distracted && !next.marks.includes(next.index)) next = { ...next, marks: [...next.marks, next.index] };
  }
  return judge(next, cards, at, distracted);
}

function judge(round: DrillRound, cards: readonly DrillJudgeCard[], at: number, distracted: boolean): DrillEventResult {
  const card = cards[round.index];
  if (!card) return { round, passed: false, distracted };
  const pressedNow = round.held.some((key) => round.pressedSinceCard.includes(key));
  if (!pressedNow || !drillShapeMatches(card, round.held)) return { round, passed: false, distracted };

  const { clock, lastCardMs } = passCard(round.clock, at);
  const cardMs = [...round.cardMs, lastCardMs];
  const finished = round.index + 1 >= cards.length;
  const next: DrillRound = {
    ...round,
    clock,
    cardMs,
    pressedSinceCard: [],
    ...(finished ? { phase: "finished", finishedAt: at } : { index: round.index + 1 }),
  };
  return { round: next, passed: true, distracted };
}

/** Whether this finished lap may be written to the record file: judged by MIDI, and in ② without a hint. */
export const drillLapCounts = (round: DrillRound, stage: "see" | "recall", byMidi: boolean) =>
  byMidi && round.phase === "finished" && round.cardMs.length > 0 && (stage === "see" || !round.hinted);
