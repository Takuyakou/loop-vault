import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { DojoChord } from "./builtins";
import {
  advanceGuidedStage,
  buildGuidedLesson,
  currentGuidedCard,
  endGuidedSession,
  guidedAnswerVisible,
  guidedAssistanceLabel,
  guidedCardAnswerVisible,
  guidedMaterialsVisible,
  guidedStageResultText,
  guidedTicket,
  hintGuided,
  markGuidedHint,
  markGuidedListenPlayed,
  markGuidedSelfConfirmed,
  rearmGuidedInput,
  recordGuidedCard,
  recordGuidedTempoCard,
  retryGuidedRound,
  skipGuidedTempo,
  startGuidedSession,
  type GuidedLessonInput,
  type GuidedSession,
} from "./guidedPractice";
import type { ChordSymbol } from "../types";

/**
 * P23-35 S1: the guide's pure layer. Every card below is an independent fixture — chords and MIDI
 * notes are written by hand, and the expectations are the hand-written notes, not a product
 * function's output recalculated at test time.
 */
const chord = (label: string): ChordSymbol => {
  const parsed = parseChordLabel(label);
  if (!parsed) throw new Error(`fixture chord did not parse: ${label}`);
  return parsed;
};

const cards = (items: readonly [string, number[], number][]): DojoChord[] =>
  items.map(([label, notes, beats]) => ({ chord: chord(label), notes, beats }));

const CMaj = cards([["C", [60, 64, 67], 4], ["Am7", [57, 60, 64, 67], 4], ["F", [53, 57, 60], 4]]);
const long = cards([
  ["C", [60, 64, 67], 4],
  ["Am7", [57, 60, 64, 67], 4],
  ["Dm7", [50, 53, 57, 60], 4],
  ["G7", [55, 59, 62, 65], 4],
  ["Cmaj7", [48, 52, 55, 59], 4],
  ["A7", [57, 61, 64, 67], 4],
]);

function lesson(overrides: Partial<GuidedLessonInput> = {}) {
  const result = buildGuidedLesson({
    sourceKey: "builtin:p12-3-major", chords: CMaj, name: "C の 3 コード", bpm: 80, id: "guide-1", ...overrides,
  });
  if (!result.ok) throw new Error(`fixture lesson rejected: ${result.reason}`);
  return result.lesson;
}

function reasonOf(input: Partial<GuidedLessonInput>) {
  const result = buildGuidedLesson({
    sourceKey: "builtin:p12-3-major", chords: CMaj, name: "x", bpm: 80, id: "r", ...input,
  });
  return result.ok ? "accepted" : result.reason;
}

/** Advances until the wanted stage; the session always starts at ①. */
function atStage(stage: "listen" | "see" | "recall" | "tempo" | "apply", id = "session-1", target = lesson()): GuidedSession {
  let session = startGuidedSession(target, id);
  while (session.stage !== stage) session = advanceGuidedStage(session);
  return session;
}

function judged(session: GuidedSession, ok = true) {
  const ticket = guidedTicket(session);
  if (!ticket) throw new Error(`no ticket in stage ${session.stage}`);
  const result = recordGuidedCard(session, ticket, ok, ok ? "合いました" : "まだ合っていません");
  if (!result.accepted) throw new Error(`fixture result refused: ${result.reason}`);
  return result.session;
}

function passed(session: GuidedSession) {
  let next = session;
  while (next.status !== "roundComplete") next = judged(next);
  return next;
}

describe("P23-35 S1: the frozen lesson", () => {
  it("keeps the written notes, beats, order and both positions", () => {
    const frozen = lesson();
    expect(frozen.cards.map((card) => card.chord.label)).toEqual(["C", "Am7", "F"]);
    expect(frozen.cards.map((card) => card.notes)).toEqual([[60, 64, 67], [57, 60, 64, 67], [53, 57, 60]]);
    expect(frozen.cards.map((card) => card.beats)).toEqual([4, 4, 4]);
    expect(frozen.cards.map((card) => card.index)).toEqual([0, 1, 2]);
    expect(frozen.cards.map((card) => card.sourceIndex)).toEqual([0, 1, 2]);
    expect(frozen.totalCards).toBe(3);
    expect(frozen.rangeLabel).toBe("");
    expect(frozen.tempoAvailable).toBe(true);
  });

  it("takes 2–4 consecutive cards and keeps the material position apart from the session position", () => {
    const frozen = lesson({ chords: long, range: { start: 1, end: 4 } });
    expect(frozen.cards.map((card) => card.chord.label)).toEqual(["Am7", "Dm7", "G7", "Cmaj7"]);
    expect(frozen.cards.map((card) => card.index)).toEqual([0, 1, 2, 3]);
    expect(frozen.cards.map((card) => card.sourceIndex)).toEqual([1, 2, 3, 4]);
    expect(frozen.rangeLabel).toBe("2〜5 / 全6コード");
  });

  it("keeps the first four cards when the material is longer and no range is given", () => {
    const frozen = lesson({ chords: long });
    expect(frozen.cards).toHaveLength(4);
    expect(frozen.rangeLabel).toBe("1〜4 / 全6コード");
  });

  it("refuses one card, five cards and broken notes", () => {
    expect(reasonOf({ chords: CMaj.slice(0, 1) })).toContain("2 コード以上");
    expect(reasonOf({ chords: long, range: { start: 0, end: 4 } })).toContain("2〜4");
    expect(reasonOf({ chords: [{ chord: chord("C"), notes: [], beats: 4 }, ...CMaj.slice(1)] })).toContain("ガイドで使えません");
    expect(reasonOf({ chords: [{ chord: chord("C"), notes: [60, 61.5, 67], beats: 4 }, ...CMaj.slice(1)] })).toContain("ガイドで使えません");
    expect(reasonOf({ bpm: 0 })).toContain("テンポ");
    expect(reasonOf({ bpm: Number.NaN })).toContain("テンポ");
  });

  it("validates an explicit range instead of silently clamping it", () => {
    expect(reasonOf({ chords: long, range: { start: -1, end: 2 } })).toContain("外に出ています");
    expect(reasonOf({ chords: long, range: { start: 0, end: 9 } })).toContain("外に出ています");
    expect(reasonOf({ chords: long, range: { start: 2.5, end: 4 } })).toContain("コード番号");
    expect(reasonOf({ chords: long, range: { start: Number.NaN, end: 2 } })).toContain("コード番号");
    expect(reasonOf({ chords: long, range: { start: 3, end: 1 } })).toContain("始まりは終わりより前");
    // A five-card range is refused, never cut down to four.
    expect(reasonOf({ chords: long, range: { start: 0, end: 4 } })).toContain("2〜4");
  });

  it("refuses a built-in whose written notes are not its own answer", () => {
    expect(reasonOf({ chords: [{ chord: chord("C"), notes: [60, 61, 62], beats: 4 }, ...CMaj.slice(1)] }))
      .toContain("ガイドで使えません");
  });

  it("keeps a saved voicing with an omission or a slash chord by its own pitches, as exact", () => {
    const occurrence = (eventId: string, source: "saved" | "source-midi" | "custom") => ({
      ideaId: "idea-1", blockId: "block-1", eventId, source, voicingKey: "notes:" + eventId,
    });
    const saved = lesson({
      sourceKey: "vault:p10-1",
      chords: [
        { chord: chord("C"), notes: [60, 64], beats: 4, source: occurrence("e1", "saved") },
        { chord: chord("C/E"), notes: [52, 60, 64, 67], beats: 3, source: occurrence("e2", "source-midi") },
      ],
      range: { start: 0, end: 1 },
    });
    expect(saved.cards.map((card) => [...card.target.notes])).toEqual([[60, 64], [52, 60, 64, 67]]);
    expect(saved.cards.map((card) => card.target.judge)).toEqual(["exact", "exact"]);
    expect(saved.cards.map((card) => card.event.source?.source)).toEqual(["saved", "source-midi"]);
    expect(saved.cards.map((card) => card.beats)).toEqual([4, 3]);
  });

  it("keeps the saved occurrence (event.source) so the exact contract is the production one", () => {
    const source = {
      ideaId: "idea-1", blockId: "block-1", eventId: "event-1",
      source: "saved" as const, voicingKey: "notes:60,64,67",
    };
    const frozen = lesson({ sourceKey: "vault:p10-2", chords: [{ chord: chord("C"), notes: [60, 64, 67], beats: 4, source }, ...CMaj.slice(1)] });
    expect(frozen.cards[0]!.target.judge).toBe("exact");
    expect(frozen.cards[0]!.event.source).toEqual(source);
  });

  it("keeps the frozen hand / finger display plan", () => {
    const hands = { lh: [48], rh: [60, 64] };
    const fingers = [{ midi: 48, hand: "left" as const, finger: 5 }, { midi: 60, hand: "right" as const, finger: 1 }];
    const frozen = lesson({ chords: [{ chord: chord("C"), notes: [48, 60, 64], beats: 4, referenceHands: hands, displayFingers: fingers }, ...CMaj.slice(1)] });
    expect(frozen.cards[0]!.event.referenceHands).toEqual(hands);
    expect(frozen.cards[0]!.event.displayFingers).toEqual(fingers);
    expect(frozen.cards[0]!.notes).toEqual([48, 60, 64]);
  });

  it("is a copy: editing the material afterwards cannot reach the lesson or its targets", () => {
    const material = cards([["C", [60, 64, 67], 4], ["Am7", [57, 60, 64, 67], 4], ["F", [53, 57, 60], 4]]);
    const frozen = lesson({ chords: material });
    const snapshot = JSON.stringify(frozen.cards);
    material[0]!.notes.push(72);
    material[1]!.notes.length = 0;
    material[2]!.beats = 99;
    material[0]!.chord.label = "X";
    expect(JSON.stringify(frozen.cards)).toBe(snapshot);
    expect(frozen.cards.map((card) => [...card.notes])).toEqual([[60, 64, 67], [57, 60, 64, 67], [53, 57, 60]]);
    expect(frozen.cards.map((card) => [...card.target.notes])).toEqual([[60, 64, 67], [57, 60, 64, 67], [53, 57, 60]]);
    expect(frozen.cards[2]!.beats).toBe(4);
  });
});

describe("P23-35 S1: one result, one ticket", () => {
  it("starts at ① with nothing judged and no ticket to judge with", () => {
    const session = startGuidedSession(lesson(), "s1");
    expect(session.stage).toBe("listen");
    expect(session.stageIndex).toBe(1);
    expect(session.cardResults).toEqual(["pending", "pending", "pending"]);
    expect(session.hintUsed).toBe(false);
    expect(session.selfConfirmed).toBe(false);
    expect(guidedAnswerVisible(session)).toBe(true);
    expect(guidedTicket(session)).toBeUndefined();
  });

  it("never applies a judged result in ①, even with a fabricated ticket", () => {
    const session = startGuidedSession(lesson(), "s2");
    const result = recordGuidedCard(session, {
      sessionId: session.id, epoch: session.epoch, attemptId: session.attemptId, cardIndex: 0, stage: "listen",
    }, true, "x");
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.reason).toBe("not-judging");
    expect(result.session.cardResults).toEqual(["pending", "pending", "pending"]);
  });

  it("walks ② card by card and completes only when every card passed", () => {
    let session = atStage("see");
    expect(guidedTicket(session)?.stage).toBe("see");
    session = judged(session, false);
    expect(session.cardIndex).toBe(0);
    expect(session.cardResults[0]).toBe("missed");
    session = judged(session);
    expect(session.cardIndex).toBe(1);
    session = passed(session);
    expect(session.status).toBe("roundComplete");
    expect(session.cardResults).toEqual(["judged", "judged", "judged"]);
    expect(guidedTicket(session)).toBeUndefined();
  });

  it("consumes one card's success exactly once (an old callback cannot pass again)", () => {
    const session = atStage("see");
    const first = guidedTicket(session)!;
    const applied = recordGuidedCard(session, first, true, "合いました");
    expect(applied.accepted).toBe(true);
    // The very same ticket, delivered twice by a slow callback.
    const again = recordGuidedCard(applied.session, first, true, "合いました");
    expect(again.accepted).toBe(false);
    if (!again.accepted) expect(again.reason).toBe("stale-attempt");
    expect(again.session.cardResults).toEqual(["judged", "pending", "pending"]);
    expect(again.session.cardIndex).toBe(1);
  });

  it("refuses a judged result captured for the card before (old card)", () => {
    let session = atStage("see");
    const old = guidedTicket(session)!;
    session = judged(session);
    const late = recordGuidedCard(session, old, true, "合いました");
    expect(late.accepted).toBe(false);
    if (!late.accepted) expect(late.reason).toBe("stale-attempt");
  });

  it("refuses a judged result from the round before もう一度 (old round)", () => {
    let session = atStage("recall");
    const old = guidedTicket(session)!;
    session = judged(session);
    session = retryGuidedRound(session);
    const late = recordGuidedCard(session, old, true, "合いました");
    expect(late.accepted).toBe(false);
    expect(late.session.cardResults).toEqual(["pending", "pending", "pending"]);
  });

  it("refuses a judged result from the stage before (old stage)", () => {
    let session = atStage("see");
    const old = guidedTicket(session)!;
    session = advanceGuidedStage(session);
    const late = recordGuidedCard(session, old, true, "合いました");
    expect(late.accepted).toBe(false);
    if (!late.accepted) expect(late.reason).toBe("stale-attempt");
  });

  it("refuses a judged result after 終了 (and after the session ends by itself)", () => {
    let session = atStage("see");
    const old = guidedTicket(session)!;
    session = endGuidedSession(session);
    expect(recordGuidedCard(session, old, true, "合いました").accepted).toBe(false);
    let finished = startGuidedSession(lesson(), "s-end");
    for (let index = 0; index < 5; index += 1) finished = advanceGuidedStage(finished);
    expect(finished.status).toBe("ended");
    const late = recordGuidedCard(finished, { ...old, sessionId: finished.id, epoch: finished.epoch }, true, "x");
    expect(late.accepted).toBe(false);
    if (!late.accepted) expect(late.reason).toBe("ended");
  });

  it("refuses a result of an older session even when both epochs are the same number", () => {
    const first = atStage("see", "session-a");
    const second = atStage("see", "session-b");
    expect(first.epoch).toBe(second.epoch);
    expect(first.id).not.toBe(second.id);
    const old = guidedTicket(first)!;
    const late = recordGuidedCard(second, old, true, "合いました");
    expect(late.accepted).toBe(false);
    if (!late.accepted) expect(late.reason).toBe("stale-session");
    expect(late.session.cardResults).toEqual(["pending", "pending", "pending"]);
  });

  it("refuses input collected before a MIDI reconnect until a fresh attempt starts", () => {
    let session = atStage("recall");
    const before = guidedTicket(session)!;
    session = rearmGuidedInput(session);
    expect(recordGuidedCard(session, before, true, "合いました").accepted).toBe(false);
    // The fresh ticket of the same card is accepted.
    expect(guidedTicket(session)?.cardIndex).toBe(before.cardIndex);
    expect(recordGuidedCard(session, guidedTicket(session)!, true, "合いました").accepted).toBe(true);
  });

  it("judges ④ as well, with the same ticket rule", () => {
    const session = atStage("tempo");
    expect(guidedTicket(session)?.stage).toBe("tempo");
    expect(judged(session).cardResults[0]).toBe("judged");
  });

  it("④ moves on after every attempted card, right or wrong, and ends after the lap", () => {
    let session = atStage("tempo");
    const first = guidedTicket(session)!;
    const wrong = recordGuidedTempoCard(session, first, false);
    expect(wrong.accepted).toBe(true);
    session = wrong.session;
    expect(session.cardResults).toEqual(["missed", "pending", "pending"]);
    expect(session.cardIndex).toBe(1);
    // The boundary before cannot write again.
    expect(recordGuidedTempoCard(session, first, true).accepted).toBe(false);

    const second = recordGuidedTempoCard(session, guidedTicket(session)!, true);
    expect(second.accepted).toBe(true);
    session = second.session;
    expect(session.cardIndex).toBe(2);

    const last = recordGuidedTempoCard(session, guidedTicket(session)!, true);
    expect(last.accepted).toBe(true);
    if (!last.accepted) throw new Error(last.reason);
    expect(last.complete).toBe(true);
    expect(last.session.status).toBe("roundComplete");
    expect(last.session.cardResults).toEqual(["missed", "judged", "judged"]);
  });
});

describe("P23-35 S1: what each stage means", () => {
  it("records ① as 取り組み済み only when the playback reached its end", () => {
    const unplayed = advanceGuidedStage(startGuidedSession(lesson(), "l1"));
    expect(unplayed.outcomes[0]).toEqual({ stage: "listen", result: "unconfirmed", hintUsed: false, selfConfirmed: false });
    expect(guidedStageResultText(unplayed.outcomes[0]!)).toBe("未確認");
    const played = advanceGuidedStage(markGuidedListenPlayed(startGuidedSession(lesson(), "l2")));
    expect(played.outcomes[0]).toEqual({ stage: "listen", result: "done", hintUsed: false, selfConfirmed: false });
    expect(guidedStageResultText(played.outcomes[0]!)).toBe("取り組み済み");
  });

  it("a stopped ① playback is not counted as listened (only the finish callback marks it)", () => {
    let session = startGuidedSession(lesson(), "l3");
    session = markGuidedListenPlayed(session);
    expect(advanceGuidedStage(session).outcomes[0]!.result).toBe("done");
    const stopped = startGuidedSession(lesson(), "l4");
    expect(advanceGuidedStage(stopped).outcomes[0]!.result).toBe("unconfirmed");
  });

  it("② with the answer on screen is never reported as 見本なし", () => {
    const session = advanceGuidedStage(passed(atStage("see")));
    expect(session.outcomes[1]).toEqual({ stage: "see", result: "done", hintUsed: false, selfConfirmed: false });
    expect(guidedStageResultText(session.outcomes[1]!)).toBe("見ながら");
  });

  it("② confirmed by the player is said apart from the MIDI-judged round", () => {
    let session = markGuidedSelfConfirmed(atStage("see"));
    session = passed(session);
    session = advanceGuidedStage(session);
    expect(session.outcomes[1]).toEqual({ stage: "see", result: "done", hintUsed: false, selfConfirmed: true });
    expect(guidedStageResultText(session.outcomes[1]!)).toBe("見ながら（自己確認）");
  });

  it("records an unfinished stage as 未確認", () => {
    let session = atStage("see");
    session = judged(session);
    session = advanceGuidedStage(session);
    expect(session.outcomes[1]).toEqual({ stage: "see", result: "unconfirmed", hintUsed: false, selfConfirmed: false });
    expect(guidedStageResultText(session.outcomes[1]!)).toBe("未確認");
  });

  it("⑤ 試して終了 is a self-report, never a pass", () => {
    let session = atStage("apply");
    session = markGuidedSelfConfirmed(session);
    session = advanceGuidedStage(session);
    expect(session.status).toBe("ended");
    expect(session.outcomes[4]).toEqual({ stage: "apply", result: "done", hintUsed: false, selfConfirmed: true });
    expect(guidedStageResultText(session.outcomes[4]!)).toBe("試して終了（自己申告）");
  });

  it("③ keeps the hint to the card it was asked for, and hides it on the next card", () => {
    let session = atStage("recall");
    expect(guidedAnswerVisible(session)).toBe(false);
    expect(guidedMaterialsVisible(session)).toBe(false);
    expect(guidedCardAnswerVisible(session, 0)).toBe(false);
    session = hintGuided(session);
    expect(session.hintUsed).toBe(true);
    expect(guidedCardAnswerVisible(session, 0)).toBe(true);
    expect(guidedCardAnswerVisible(session, 1)).toBe(false);
    session = judged(session);
    expect(session.cardIndex).toBe(1);
    expect(guidedCardAnswerVisible(session, 1)).toBe(false);
    // The round stays assisted, so a later hint is not needed for the next card.
    expect(session.hintUsed).toBe(true);
  });

  it("the explicit audition counts as a hint, and only the current card's answer is opened", () => {
    let session = atStage("recall");
    session = markGuidedHint(session, 1);
    expect(session.hintUsed).toBe(true);
    // Playing another card's sample marks the round assisted but does not open that card's answer.
    expect(guidedCardAnswerVisible(session, 0)).toBe(false);
    expect(guidedCardAnswerVisible(session, 1)).toBe(false);
    // The view calls it for the card on screen; that card's answer is then open.
    session = markGuidedHint(session, 0);
    expect(guidedCardAnswerVisible(session, 0)).toBe(true);
  });

  it("keeps the hint and the self-confirmation as two facts", () => {
    let session = atStage("recall");
    session = hintGuided(session);
    session = markGuidedSelfConfirmed(session);
    expect(session.hintUsed).toBe(true);
    expect(session.selfConfirmed).toBe(true);
    session = passed(session);
    session = advanceGuidedStage(session);
    expect(session.outcomes[2]).toEqual({ stage: "recall", result: "done", hintUsed: true, selfConfirmed: true });
    expect(guidedStageResultText(session.outcomes[2]!)).toBe("補助あり（自己確認）");
    expect(guidedAssistanceLabel(false, false)).toBe("見本なし");
  });

  it("a self-confirmed round without a hint is reported as 自己確認", () => {
    let session = atStage("recall");
    session = markGuidedSelfConfirmed(session);
    session = passed(session);
    session = advanceGuidedStage(session);
    expect(guidedStageResultText(session.outcomes[2]!)).toBe("自己確認");
  });

  it("keeps the earlier round when もう一度 starts a new one", () => {
    let session = atStage("recall");
    session = hintGuided(session);
    session = judged(session);
    session = judged(session, false);
    const retried = retryGuidedRound(session);
    expect(retried.rounds).toHaveLength(1);
    expect(retried.rounds[0]).toEqual({
      stage: "recall", attemptId: session.attemptId,
      results: ["judged", "missed", "pending"], hintUsed: true, selfConfirmed: false,
    });
    expect(retried.cardResults).toEqual(["pending", "pending", "pending"]);
    expect(retried.cardIndex).toBe(0);
    expect(retried.hintUsed).toBe(false);
    expect(retried.hintCard).toBeNull();
    expect(retried.epoch).toBe(session.epoch + 1);
  });

  it("skips ④ only when the adapter says the material cannot run on the existing clock", () => {
    const unsupported = lesson({ tempoAvailable: false });
    let session = advanceGuidedStage(advanceGuidedStage(advanceGuidedStage(startGuidedSession(unsupported, "t1"))));
    expect(session.stage).toBe("tempo");
    session = advanceGuidedStage(session);
    expect(session.outcomes[3]).toEqual({ stage: "tempo", result: "skipped", hintUsed: false, selfConfirmed: false });
    expect(guidedStageResultText(session.outcomes[3]!)).toContain("対象外");
    expect(session.stage).toBe("apply");

    // A material that looked fine but whose plan threw at start is skipped the same way.
    let skipped = atStage("tempo");
    skipped = advanceGuidedStage(skipGuidedTempo(skipped));
    expect(skipped.outcomes[3]!.result).toBe("skipped");
  });

  it("a supported ④ is recorded as done / 補助あり, not as 対象外", () => {
    let session = atStage("tempo");
    session = passed(session);
    session = advanceGuidedStage(session);
    expect(session.outcomes[3]).toEqual({ stage: "tempo", result: "done", hintUsed: false, selfConfirmed: false });
    expect(guidedStageResultText(session.outcomes[3]!)).toBe("見本なし");
  });

  it("ends after ⑤, and 終了 is idempotent", () => {
    let session = atStage("apply");
    expect(guidedAnswerVisible(session)).toBe(false);
    session = advanceGuidedStage(session);
    expect(session.status).toBe("ended");
    expect(session.outcomes).toHaveLength(5);
    expect(endGuidedSession(session)).toBe(session);
  });

  it("never changes the frozen cards while moving between stages and rounds", () => {
    const frozen = lesson();
    let session = startGuidedSession(frozen, "s10");
    const snapshot = JSON.stringify(frozen.cards);
    for (let index = 0; index < 4; index += 1) {
      session = retryGuidedRound(advanceGuidedStage(session));
      expect(JSON.stringify(session.lesson.cards)).toBe(snapshot);
    }
    expect(currentGuidedCard(session).notes).toEqual([60, 64, 67]);
    expect(currentGuidedCard(session).event.source).toBeUndefined();
  });
});
