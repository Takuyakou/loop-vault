import { judgeChord, type Target } from "./judging";
import { progressionTarget } from "./progressionTarget";
import type { DojoChord } from "./builtins";
import type { ChordSymbol } from "../types";

/**
 * P23-35: a session-only guide over the existing Chord Dojo materials.
 *
 * It never touches `DojoStore.today` / `cursor` / `taskResults` / `matched` or any record store:
 * everything lives in the `GuidedSession` value below, and the normal engine (`advance`,
 * `applyAttempt`, laps, recent) is not called from this path.
 *
 * Two rules the reviewer asked for are carried by the types themselves:
 *  - the lesson is a deep copy (nothing of the material is shared with the session), and
 *  - every judged result carries the `(sessionId, epoch, attemptId, cardIndex, stage)` it was
 *    collected under, and is consumed once, only while all five still match.
 */
export type GuidedStage = "listen" | "see" | "recall" | "tempo" | "apply";
export type GuidedCardResult = "pending" | "judged" | "missed";
export type GuidedStatus = "idle" | "listening" | "playing" | "feedback" | "roundComplete" | "ended";

export const GUIDE_STAGES: readonly GuidedStage[] = ["listen", "see", "recall", "tempo", "apply"];
const JUDGED_STAGES: readonly GuidedStage[] = ["see", "recall", "tempo"];

export interface GuidedCard {
  /** Position inside the session (0…3). */
  readonly index: number;
  /** Position inside the material (the range's start … end): never lost by the copy. */
  readonly sourceIndex: number;
  /** The material chord event, deep-copied: identity, notes, beats, degree, key context, source
   * occurrence and the frozen hand/finger display plan all stay attached. */
  readonly event: DojoChord;
  /** `event.chord` (the written symbol). */
  readonly chord: ChordSymbol;
  readonly notes: readonly number[];
  readonly beats: number;
  readonly target: Target;
}

export interface GuidedLesson {
  readonly id: string;
  readonly sourceKey: string;
  readonly name: string;
  readonly bpm: number;
  readonly cards: readonly GuidedCard[];
  readonly totalCards: number;
  readonly rangeLabel: string;
  readonly keyLabel?: string;
  /** ④: the material's own tempo plan decides. The adapter asks `tempoPlanData` at build time and
   * passes the answer; nothing here invents a timing model. */
  readonly tempoAvailable: boolean;
}

export type GuidedBuildResult =
  | { readonly ok: true; readonly lesson: GuidedLesson }
  | { readonly ok: false; readonly reason: string };

export interface GuidedLessonInput {
  /** The Dojo task key the material came from (`builtin:…` / `vault:…`). */
  readonly sourceKey: string;
  readonly chords: readonly DojoChord[];
  readonly name: string;
  readonly bpm: number;
  readonly keyLabel?: string;
  /** Card indices, inclusive. Omitted = the first cards. An explicit range is validated, never clamped. */
  readonly range?: { readonly start: number; readonly end: number };
  /** The most cards a guide keeps (2–4). */
  readonly maxCards?: number;
  readonly id: string;
  readonly tempoAvailable?: boolean;
}

const MIN_CARDS = 2;
const MAX_CARDS = 4;
const BROKEN_MATERIAL = "この教材はガイドで使えません。通常の練習をご利用ください";

/** Absolute card positions of the lesson, or a reason. No silent clamping. */
function resolveRange(total: number, maxCards: number, range?: { readonly start: number; readonly end: number }):
  { readonly ok: true; readonly start: number; readonly end: number } | { readonly ok: false; readonly reason: string } {
  if (range === undefined) {
    const start = 0;
    const end = Math.min(start + maxCards - 1, total - 1);
    return { ok: true, start, end };
  }
  const { start, end } = range;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return { ok: false, reason: "範囲はコード番号で選んでください" };
  if (start < 0 || end < 0 || start > total - 1 || end > total - 1) return { ok: false, reason: "範囲がこの教材の外に出ています" };
  if (start > end) return { ok: false, reason: "始まりは終わりより前にしてください" };
  return { ok: true, start, end };
}

function frozenChord(chord: DojoChord): DojoChord {
  // `readonly` is a compile-time promise only: copy the nested arrays so a later edit of the
  // material (Vault re-collect, an in-place `notes.sort`, …) cannot reach the lesson.
  const copy = structuredClone(chord) as DojoChord;
  copy.notes = [...chord.notes];
  return copy;
}

export function buildGuidedLesson(input: GuidedLessonInput): GuidedBuildResult {
  const total = input.chords.length;
  if (total < MIN_CARDS) return { ok: false, reason: "この教材は 2 コード以上でガイドできます" };
  if (input.maxCards !== undefined && (!Number.isInteger(input.maxCards) || input.maxCards < MIN_CARDS)) {
    return { ok: false, reason: "ガイドのコード数が正しくありません" };
  }
  if (!Number.isFinite(input.bpm) || input.bpm <= 0) return { ok: false, reason: "テンポが正しくありません" };
  const range = resolveRange(total, Math.min(MAX_CARDS, input.maxCards ?? MAX_CARDS), input.range);
  if (!range.ok) return { ok: false, reason: range.reason };
  const count = range.end - range.start + 1;
  if (count < MIN_CARDS || count > MAX_CARDS) return { ok: false, reason: "ガイドは 2〜4 コードの連続した範囲でだけ始められます" };

  const cards: GuidedCard[] = [];
  for (let sourceIndex = range.start; sourceIndex <= range.end; sourceIndex += 1) {
    const source = input.chords[sourceIndex]!;
    if (!source.notes.length || source.notes.some((note) => !Number.isInteger(note) || note < 0 || note > 127)
      || !Number.isFinite(source.beats) || source.beats <= 0) {
      return { ok: false, reason: BROKEN_MATERIAL };
    }
    const chord = frozenChord(source);
    const notes = [...chord.notes];
    const target = progressionTarget({ ...chord, notes }, input.sourceKey);
    // The answer shown is the saved/source pitch set; it must pass the same judge the guide uses.
    if (!judgeChord(target, target.notes).ok) return { ok: false, reason: BROKEN_MATERIAL };
    cards.push({ index: cards.length, sourceIndex, event: chord, chord: chord.chord, notes, beats: chord.beats, target });
  }
  return {
    ok: true,
    lesson: {
      id: input.id,
      sourceKey: input.sourceKey,
      name: input.name,
      bpm: input.bpm,
      cards,
      totalCards: total,
      rangeLabel: range.start > 0 || range.end < total - 1 ? `${range.start + 1}〜${range.end + 1} / 全${total}コード` : "",
      ...(input.keyLabel === undefined ? {} : { keyLabel: input.keyLabel }),
      tempoAvailable: input.tempoAvailable ?? true,
    },
  };
}

export type GuidedOutcomeResult = "done" | "unconfirmed" | "skipped";

export interface GuidedStageOutcome {
  readonly stage: GuidedStage;
  readonly result: GuidedOutcomeResult;
  /** The hint was used somewhere in this stage's round (③/⑤). */
  readonly hintUsed: boolean;
  /** The player confirmed the round themselves (⑤ and the manual fallback). */
  readonly selfConfirmed: boolean;
}

/** One round of one stage, kept when 「もう一度」 starts the next round. */
export interface GuidedRoundRecord {
  readonly stage: GuidedStage;
  readonly attemptId: number;
  readonly results: readonly GuidedCardResult[];
  readonly hintUsed: boolean;
  readonly selfConfirmed: boolean;
}

export interface GuidedSession {
  readonly id: string;
  readonly lesson: GuidedLesson;
  readonly stage: GuidedStage;
  readonly stageIndex: number;
  readonly cardIndex: number;
  readonly attemptId: number;
  /** Bumped on every stage/round/reconnect boundary: a late judge or audio callback carrying an
   * older epoch is ignored instead of moving the new stage. */
  readonly epoch: number;
  readonly status: GuidedStatus;
  readonly cardResults: readonly GuidedCardResult[];
  /** Round facts. `hintUsed` is the round's assistance; `hintCard` is the card whose answer is open
   * right now. They are separate, so taking a hint and confirming by oneself are both remembered. */
  readonly hintUsed: boolean;
  readonly hintCard: number | null;
  readonly selfConfirmed: boolean;
  /** ① was listened to the end (a stopped playback is not 取り組み済み). */
  readonly listenPlayed: boolean;
  /** ④ could not run with the existing clock for this material. */
  readonly tempoSkipped: boolean;
  readonly outcomes: readonly GuidedStageOutcome[];
  readonly rounds: readonly GuidedRoundRecord[];
  readonly history: readonly string[];
}

function emptyRound(lesson: GuidedLesson): { cardResults: GuidedCardResult[]; hintUsed: boolean; hintCard: null; selfConfirmed: boolean; listenPlayed: boolean } {
  return { cardResults: lesson.cards.map(() => "pending" as const), hintUsed: false, hintCard: null, selfConfirmed: false, listenPlayed: false };
}

export function startGuidedSession(lesson: GuidedLesson, id: string): GuidedSession {
  return {
    id,
    lesson,
    stage: "listen",
    stageIndex: 1,
    cardIndex: 0,
    attemptId: 1,
    epoch: 1,
    status: "idle",
    ...emptyRound(lesson),
    tempoSkipped: false,
    outcomes: [],
    rounds: [],
    history: [],
  };
}

/** 「もう一度、思い出すから」: a fresh session that starts directly at the chosen stage. */
export function restartGuidedSession(lesson: GuidedLesson, id: string, stage: GuidedStage): GuidedSession {
  const base = startGuidedSession(lesson, id);
  return { ...base, stage, stageIndex: GUIDE_STAGES.indexOf(stage) + 1 };
}

export function currentGuidedCard(session: GuidedSession): GuidedCard {
  return session.lesson.cards[Math.min(session.cardIndex, session.lesson.cards.length - 1)]!;
}

/** What the view must capture when it starts collecting one card's input. */
export interface GuidedCardTicket {
  readonly sessionId: string;
  readonly epoch: number;
  readonly attemptId: number;
  readonly cardIndex: number;
  readonly stage: GuidedStage;
}

/** The ticket for the current card, or `undefined` when this stage must not judge at all. */
export function guidedTicket(session: GuidedSession): GuidedCardTicket | undefined {
  if (session.status === "ended" || session.status === "roundComplete") return undefined;
  if (!JUDGED_STAGES.includes(session.stage)) return undefined;
  return {
    sessionId: session.id,
    epoch: session.epoch,
    attemptId: session.attemptId,
    cardIndex: session.cardIndex,
    stage: session.stage,
  };
}

export type GuidedRejectReason = "ended" | "not-judging" | "stale-session" | "stale-attempt" | "already-judged";

export type GuidedRecordResult =
  | { readonly accepted: true; readonly session: GuidedSession; readonly complete: boolean }
  | { readonly accepted: false; readonly reason: GuidedRejectReason; readonly session: GuidedSession };

/**
 * Consumes one judged attempt. It is applied only when the ticket still describes this session's
 * current stage/round/card, and a card's success is consumed exactly once. A late result from an
 * older session with the same epoch number is refused by `sessionId`.
 */
export function recordGuidedCard(
  session: GuidedSession,
  ticket: GuidedCardTicket,
  ok: boolean,
  message: string,
): GuidedRecordResult {
  if (session.status === "ended") return { accepted: false, reason: "ended", session };
  if (!JUDGED_STAGES.includes(session.stage) || session.status === "roundComplete") {
    return { accepted: false, reason: "not-judging", session };
  }
  if (ticket.sessionId !== session.id) return { accepted: false, reason: "stale-session", session };
  if (ticket.stage !== session.stage) return { accepted: false, reason: "stale-attempt", session };
  if (ticket.epoch !== session.epoch || ticket.attemptId !== session.attemptId || ticket.cardIndex !== session.cardIndex) {
    return { accepted: false, reason: "stale-attempt", session };
  }
  if (session.cardResults[ticket.cardIndex] === "judged") return { accepted: false, reason: "already-judged", session };

  const results = [...session.cardResults];
  results[ticket.cardIndex] = ok ? "judged" : "missed";
  const complete = results.every((result) => result === "judged");
  const nextIndex = ok && !complete ? Math.min(ticket.cardIndex + 1, session.lesson.cards.length - 1) : ticket.cardIndex;
  const next: GuidedSession = {
    ...session,
    cardResults: results,
    status: complete ? "roundComplete" : "feedback",
    cardIndex: nextIndex,
    // Every consumed attempt moves the ticket: a duplicate callback of the same attempt cannot pass twice.
    attemptId: session.attemptId + 1,
    // The answer opened by a hint belongs to the card it was asked for; the next card hides it again.
    hintCard: nextIndex === ticket.cardIndex ? session.hintCard : null,
    history: [...session.history, ...(ok ? [message] : [])],
  };
  return { accepted: true, session: next, complete };
}

/**
 * ④ つなげて弾く: the musical clock asks about one card at a time and the round moves on whatever
 * the answer was. The ticket rule is the same, so a late boundary of an older round cannot write.
 */
export function recordGuidedTempoCard(
  session: GuidedSession,
  ticket: GuidedCardTicket,
  ok: boolean,
): GuidedRecordResult {
  if (session.status === "ended") return { accepted: false, reason: "ended", session };
  if (session.stage !== "tempo" || session.status === "roundComplete") {
    return { accepted: false, reason: "not-judging", session };
  }
  if (ticket.sessionId !== session.id || ticket.stage !== "tempo") return { accepted: false, reason: "stale-session", session };
  if (ticket.epoch !== session.epoch || ticket.attemptId !== session.attemptId || ticket.cardIndex !== session.cardIndex) {
    return { accepted: false, reason: "stale-attempt", session };
  }
  if (session.cardResults[ticket.cardIndex] === "judged") return { accepted: false, reason: "already-judged", session };

  const results = [...session.cardResults];
  results[ticket.cardIndex] = ok ? "judged" : "missed";
  const complete = results.every((result) => result === "judged" || result === "missed");
  return {
    accepted: true,
    complete,
    session: {
      ...session,
      cardResults: results,
      status: complete ? "roundComplete" : "playing",
      cardIndex: Math.min(ticket.cardIndex + 1, session.lesson.cards.length - 1),
      attemptId: session.attemptId + 1,
    },
  };
}

function roundRecord(session: GuidedSession): GuidedRoundRecord {  return {
    stage: session.stage,
    attemptId: session.attemptId,
    results: [...session.cardResults],
    hintUsed: session.hintUsed,
    selfConfirmed: session.selfConfirmed,
  };
}

/** 「もう一度」: the same stage from its first card. The round before it stays in `rounds`. */
export function retryGuidedRound(session: GuidedSession): GuidedSession {
  return {
    ...session,
    ...emptyRound(session.lesson),
    cardIndex: 0,
    attemptId: session.attemptId + 1,
    epoch: session.epoch + 1,
    status: "idle",
    rounds: [...session.rounds, roundRecord(session)],
  };
}

/** 「見本を確認」/「見本を聴く」 in ③ (and ⑤): this round is assisted, and this card's answer is open. */
export function hintGuided(session: GuidedSession): GuidedSession {
  if (session.status === "ended") return session;
  if (session.stage !== "recall" && session.stage !== "apply") return session;
  return { ...session, hintUsed: true, hintCard: session.cardIndex };
}

/** The explicit audition counts as a hint too: it is the same information as 「見本を確認」. */
export function markGuidedHint(session: GuidedSession, cardIndex: number): GuidedSession {
  if (session.status === "ended") return session;
  if (session.stage !== "recall" && session.stage !== "apply") return session;
  return { ...session, hintUsed: true, hintCard: session.cardIndex === cardIndex ? session.cardIndex : session.hintCard };
}

/** 自己確認 (no MIDI, or the player chose to judge themselves). Kept apart from the hint. */
export function markGuidedSelfConfirmed(session: GuidedSession): GuidedSession {
  if (session.status === "ended") return session;
  return session.selfConfirmed ? session : { ...session, selfConfirmed: true };
}

/** ① is 取り組み済み only when the whole range was played to its end. */
export function markGuidedListenPlayed(session: GuidedSession): GuidedSession {
  return session.listenPlayed ? session : { ...session, listenPlayed: true };
}

/** ④ cannot run with the existing clock for this material: say 対象外 and keep going to ⑤. */
export function skipGuidedTempo(session: GuidedSession): GuidedSession {
  return session.tempoSkipped ? session : { ...session, tempoSkipped: true, status: "idle" };
}

/** MIDI disconnected / reconnected: the input from before the change can never count. */
export function rearmGuidedInput(session: GuidedSession): GuidedSession {
  return { ...session, epoch: session.epoch + 1, attemptId: session.attemptId + 1, status: "idle" };
}

export function guidedRoundComplete(session: GuidedSession): boolean {
  return session.status === "roundComplete";
}

/** 「次へ」: record this stage's outcome and move on. A skipped or unfinished stage is never "合格". */
export function advanceGuidedStage(session: GuidedSession): GuidedSession {
  const complete = session.status === "roundComplete";
  const skipped = session.stage === "tempo" && (!session.lesson.tempoAvailable || session.tempoSkipped);
  const result: GuidedOutcomeResult = skipped
    ? "skipped"
    : session.stage === "listen"
      ? session.listenPlayed ? "done" : "unconfirmed"
      : session.stage === "apply"
        // 試して終了 is the player's own report that they tried it: recorded, never a skill pass.
        ? session.selfConfirmed ? "done" : "unconfirmed"
        : complete ? "done" : "unconfirmed";
  const outcomes = [...session.outcomes, {
    stage: session.stage,
    result,
    hintUsed: session.hintUsed,
    selfConfirmed: session.selfConfirmed,
  }];
  const rounds = session.cardResults.some((entry) => entry !== "pending") ? [...session.rounds, roundRecord(session)] : session.rounds;
  const nextIndex = session.stageIndex + 1;
  if (nextIndex > GUIDE_STAGES.length) {
    return { ...session, outcomes, rounds, status: "ended", epoch: session.epoch + 1, attemptId: session.attemptId + 1 };
  }
  return {
    ...session,
    stage: GUIDE_STAGES[nextIndex - 1]!,
    stageIndex: nextIndex,
    ...emptyRound(session.lesson),
    cardIndex: 0,
    attemptId: session.attemptId + 1,
    epoch: session.epoch + 1,
    status: "idle",
    outcomes,
    rounds,
  };
}

/** 終了: the old tickets stay dead because both the status and the epoch move. */
export function endGuidedSession(session: GuidedSession): GuidedSession {
  return session.status === "ended" ? session
    : { ...session, status: "ended", epoch: session.epoch + 1, attemptId: session.attemptId + 1 };
}

/** ①/② show the whole answer; ③/④/⑤ hide it. */
export function guidedAnswerVisible(session: GuidedSession): boolean {
  return session.stage === "listen" || session.stage === "see";
}

/** The material's name, the chord list and the degrees are answers too: ③④⑤ keep them hidden. */
export function guidedMaterialsVisible(session: GuidedSession): boolean {
  return session.stage === "listen" || session.stage === "see";
}

/** The current card's answer, per card: a hint in ③/⑤ opens the card it was asked for, not all of them. */
export function guidedCardAnswerVisible(session: GuidedSession, cardIndex: number): boolean {
  if (guidedAnswerVisible(session)) return true;
  return session.hintCard === cardIndex;
}

export function guidedStageLabel(stage: GuidedStage): string {
  return `${GUIDE_STAGE_NUMBER[stage]} ${GUIDE_STAGE_NAME[stage]}`;
}

export function guidedStageInstruction(stage: GuidedStage): string {
  return GUIDE_STAGE_TEXT[stage];
}

/** 「見本なし」 is said only when the round really had no hint and no self-confirmation. */
export function guidedAssistanceLabel(hintUsed: boolean, selfConfirmed: boolean): string {
  if (hintUsed && selfConfirmed) return "補助あり（自己確認）";
  if (selfConfirmed) return "自己確認";
  if (hintUsed) return "補助あり";
  return "見本なし";
}

export function guidedStageResultText(outcome: GuidedStageOutcome): string {
  if (outcome.result === "skipped") return "対象外";
  if (outcome.stage === "listen") return outcome.result === "done" ? "取り組み済み" : "未確認";
  if (outcome.stage === "apply") return outcome.result === "done" ? "試して終了（自己申告）" : "未確認";
  if (outcome.stage === "see") {
    if (outcome.result !== "done") return "未確認";
    // ② is played with the answer on screen: that is not a 見本なし round. A round the player
    // confirmed themselves is said apart from the one the MIDI input judged.
    if (outcome.selfConfirmed && outcome.hintUsed) return "見ながら（補助あり・自己確認）";
    if (outcome.selfConfirmed) return "見ながら（自己確認）";
    return outcome.hintUsed ? "補助あり" : "見ながら";
  }
  if (outcome.result !== "done") return "未確認";
  return guidedAssistanceLabel(outcome.hintUsed, outcome.selfConfirmed);
}

const GUIDE_STAGE_NUMBER: Readonly<Record<GuidedStage, string>> = {
  listen: "①", see: "②", recall: "③", tempo: "④", apply: "⑤",
};
const GUIDE_STAGE_NAME: Readonly<Record<GuidedStage, string>> = {
  listen: "聴く", see: "見て弾く", recall: "思い出す", tempo: "テンポで弾く", apply: "自由に試す",
};
const GUIDE_STAGE_TEXT: Readonly<Record<GuidedStage, string>> = {
  listen: "まず聴いて、ベースか一番上の音を頭の中でなぞってみましょう。",
  see: "表示された音を弾いて、響きと手の形を確かめましょう。",
  recall: "弾く前に響きを思い浮かべてみましょう。迷ったら見本を確認できます。",
  tempo: "無理のない速さで、同じ進行をつなげてみましょう。",
  apply: "まず、画面を見ずに今の進行を弾いてみましょう。次に、一番上の音や終わり方を少し変えて、好きな響きを探してください。",
};
