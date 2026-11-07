import { z } from "zod";
import type { ChordSymbol } from "../types";
import { earChordPitchClasses } from "./chordTones";
import type { EarCard, EarSession } from "./earSession";
import { earChordLevel, type EarLevel } from "./levels";
import type { EarQuestion } from "./question";

/** The groups of chord kinds the weak points are found by (Stage 03 §3). */
export const EAR_KINDS = ["三和音", "転回形", "sus・dim・aug", "maj7・6", "m7・m6", "7", "m7b5・dim7", "テンション", "上の構造", "オルタード"] as const;
export type EarKind = (typeof EAR_KINDS)[number];

/** The group a chord belongs to. Decided from the symbol, never from the label. */
export function earChordKind(symbol: ChordSymbol): EarKind {
  const tensions = symbol.tensions;
  if (symbol.altered || symbol.quality === "minMaj7"
    || tensions.some((tension) => tension === "b9" || tension === "#9" || tension === "b13" || tension === "#11")) {
    return "オルタード";
  }
  if (symbol.bass !== undefined && symbol.bass !== symbol.root) {
    return earChordPitchClasses(symbol).includes(symbol.bass) ? "転回形" : "上の構造";
  }
  switch (symbol.quality) {
    case "maj": case "min": return tensions.length ? "テンション" : "三和音";
    case "sus2": case "sus4": case "dim": case "aug": case "power": return "sus・dim・aug";
    case "maj7": case "six": case "sixNine": return tensions.length ? "テンション" : "maj7・6";
    case "min7": case "min6": return tensions.length ? "テンション" : "m7・m6";
    case "dom7": case "dom7sus4": return tensions.length && !tensions.every((tension) => tension === "#5") ? "テンション" : "7";
    case "min7b5": case "dim7": return "m7b5・dim7";
    default: return "テンション";
  }
}

const level = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

/** One chord of one question played to the end (Stage 03 §1). No song or file names are kept. */
export const earChordRecordSchema = z.object({
  at: z.string().datetime(),
  /** One id for every chord of one run through a question. */
  play: z.string().min(1).max(64),
  /** One id for the four questions of one benchmark. */
  run: z.string().min(1).max(64).optional(),
  questionId: z.string().min(1).max(120),
  source: z.enum(["bank", "builtin", "collection"]),
  benchmark: level.optional(),
  level,
  /** Bars of the question (the result screen compares with questions of the same length). */
  length: z.number().int().min(1).max(64),
  chordLevel: level,
  kind: z.string().min(1).max(40),
  move: z.number().int().min(0).max(11).optional(),
  index: z.number().int().min(0).max(255),
  given: z.boolean(),
  manual: z.boolean(),
  wrongs: z.number().int().min(0).max(10_000),
  hint: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  seconds: z.number().finite().min(0).max(36_000).optional(),
  firstAnswerSeconds: z.number().finite().min(0).max(36_000).optional(),
  replays: z.number().int().min(0).max(10_000),
  judge: z.enum(["core", "pitchset", "sounded"]),
  /** The degree and the function were on the card before the answer (the 「最初から見せる」 setting): kept out of the main figures. */
  degreeShown: z.literal(true).optional(),
}).strict();
export type EarChordRecord = z.infer<typeof earChordRecordSchema>;

export interface EarRecordContext {
  /** When the question was finished. */
  at: Date;
  /** The id of this run through the question (the time it started). */
  play: string;
  /** Set for a benchmark: its level and the id of its run. */
  benchmark?: { level: EarLevel; run: string };
}

const rootMove = (from: ChordSymbol, to: ChordSymbol) => (((to.root - from.root) % 12) + 12) % 12;

function recordOf(question: EarQuestion, card: EarCard, context: EarRecordContext, at: Date): EarChordRecord {
  const chord = question.chords[card.index]!;
  const previous = card.index > 0 ? question.chords[card.index - 1]!.symbol : undefined;
  return {
    at: at.toISOString(),
    play: context.play,
    ...(context.benchmark ? { run: context.benchmark.run, benchmark: context.benchmark.level } : {}),
    questionId: question.id,
    source: question.source,
    level: question.level,
    length: question.length,
    chordLevel: earChordLevel(chord.symbol, { tonic: question.tonic, mode: question.mode }),
    kind: earChordKind(chord.symbol),
    ...(previous ? { move: rootMove(previous, chord.symbol) } : {}),
    index: card.index,
    given: card.shownFromStart,
    manual: card.self,
    wrongs: card.mistakes,
    hint: card.hint,
    ...(card.sec !== undefined && !card.self ? { seconds: card.sec } : {}),
    ...(card.firstAnswerSec !== undefined && !card.self ? { firstAnswerSeconds: card.firstAnswerSec } : {}),
    replays: card.listens,
    judge: chord.judge,
    ...(card.degreeShown ? { degreeShown: true as const } : {}),
  };
}

/**
 * The records of a question played to the end: one per chord. A question left half way gives none
 * (the run is only recorded once every card is done).
 */
export function recordsOfSession(session: EarSession, context: EarRecordContext): EarChordRecord[] {
  if (!session.cards.every((card) => card.done)) return [];
  return session.cards.map((card) => recordOf(session.question, card, context, context.at));
}

/** A step in the root, named from the player's side (a fifth up is the way a dominant resolves down a fourth). */
export const EAR_MOVE_NAMES: readonly string[] = [
  "同じルート", "半音上", "全音上", "短3度上", "長3度上", "4度上", "トライトーン", "5度上", "長3度下", "短3度下", "全音下", "半音下",
];
