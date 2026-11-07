import { describe, expect, it } from "vitest";
import { parseTextChordLabel } from "../chords";
import { createAudioToPerformance, median, type OutputTimestampSource } from "./earClock";
import { DEFAULT_SETTLE_MS, EarAnswerTaker, answerSpecOf, type EarAnswer } from "./earEntry";
import { EarSession } from "./earSession";
import { buildBankQuestion } from "./question";
import { ALL_BANK, bankProgression } from "./bank";
import { voiceForEar } from "./voicing";
import type { EarJudge } from "./judge";

const sym = (label: string) => parseTextChordLabel(label)!;
const specOf = (label: string, judge: EarJudge = "core") => {
  const symbol = sym(label);
  return answerSpecOf({ symbol, judge, notes: voiceForEar(symbol) });
};

// ---- answers --------------------------------------------------------------------------------------

type Key = { t: number; note: number; on: boolean; ch?: number };
/** Plays a list of key events into a taker, polling every 5 ms, and returns the first answer. */
function run(label: string, keys: Key[], options: { settleMs?: number; keysDownAtStart?: number; endAt?: number } = {}): EarAnswer | undefined {
  const taker = new EarAnswerTaker(specOf(label), options.settleMs ?? DEFAULT_SETTLE_MS, options.keysDownAtStart ?? 0);
  const events = [...keys].sort((a, b) => a.t - b.t);
  let next = 0;
  for (let at = 0; at <= (options.endAt ?? 4000); at += 5) {
    while (next < events.length && events[next]!.t <= at) {
      const key = events[next]!;
      next += 1;
      if (key.on) taker.press(key.ch ?? 0, key.note, key.t);
      else taker.release(key.ch ?? 0, key.note, key.t);
    }
    const answer = taker.poll(at);
    if (answer) return answer;
  }
  return undefined;
}

const down = (notes: number[], gap: number, start = 0): Key[] => notes.map((note, index) => ({ t: start + index * gap, note, on: true }));

describe("答えの決め方(earEntry)", () => {
  // Cmaj7: the names C E B are needed; G is allowed (the 5th is optional).
  const CMAJ7 = [48, 52, 55, 59];

  it("is the same answer however slowly the chord is built (100, 200 and 400 ms apart), from the bottom or from the top", () => {
    for (const gap of [0, 100, 200, 400]) {
      for (const order of [CMAJ7, [...CMAJ7].reverse(), [52, 59, 48, 55]]) {
        const answer = run("Cmaj7", down(order, gap));
        expect(answer, `gap ${gap} order ${order}`).toBeDefined();
        expect(answer!.reason).toBe("complete");
        // what is down when the keys settle: all the required names, and the 5th if it came in time
        expect([48, 52, 59].every((note) => answer!.notes.includes(note))).toBe(true);
        expect(answer!.notes.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("does not judge while the keys that are down are all names of the answer and it is not complete yet", () => {
    // C, E, G are all names of Cmaj7; B comes 2 seconds later
    expect(run("Cmaj7", [...down([48, 52, 55], 100), { t: 2000, note: 59, on: true }], { endAt: 1900 })).toBeUndefined();
    const late = run("Cmaj7", [...down([48, 52, 55], 100), { t: 2000, note: 59, on: true }]);
    expect(late?.reason).toBe("complete");
    expect(late?.notes).toEqual(CMAJ7);
  });

  it("counts note names: C2 C3 E3 is two names, not three", () => {
    const answer = run("Cmaj7", [...down([36, 48, 52], 5), { t: 105, note: 59, on: true }]);
    expect(answer?.notes).toEqual([36, 48, 52, 59]);
    expect(answer?.reason).toBe("complete");
  });

  it("is an answer when a name that is not in the answer goes down and the keys stay for 300 ms", () => {
    const answer = run("Cmaj7", down([48, 52, 54], 0));
    expect(answer?.reason).toBe("foreign");
    expect(answer?.notes).toEqual([48, 52, 54]);
    expect(answer!.judgedAt - answer!.completedAt).toBeGreaterThanOrEqual(DEFAULT_SETTLE_MS);
  });

  it("is not a mistake when a wrong key is let go before the keys settle (a quick correction)", () => {
    const answer = run("Cmaj7", [
      { t: 0, note: 48, on: true }, { t: 0, note: 52, on: true }, { t: 0, note: 54, on: true },
      { t: 150, note: 54, on: false }, { t: 200, note: 59, on: true },
    ]);
    expect(answer?.reason).toBe("complete");
    expect(answer?.notes).toEqual([48, 52, 59]);
  });

  it("is one mistake when the wrong key has settled and is corrected afterwards", () => {
    const taker = new EarAnswerTaker(specOf("Cmaj7"), DEFAULT_SETTLE_MS);
    for (const note of [48, 52, 54]) taker.press(0, note, 0);
    expect(taker.poll(299)).toBeUndefined();
    const first = taker.poll(300);
    expect(first?.reason).toBe("foreign");
    // the answer is taken once
    expect(taker.poll(400)).toBeUndefined();
  });

  it("takes the keys that were down when all are let go, if two names or more had been down (a short stab counts)", () => {
    const stab = run("Cmaj7", [...down([48, 52, 59], 0), ...[48, 52, 59].map((note) => ({ t: 120, note, on: false }))]);
    expect(stab?.reason).toBe("released");
    expect(stab?.notes).toEqual([48, 52, 59]);
    const half = run("Cmaj7", [...down([48, 52], 50), { t: 400, note: 48, on: false }, { t: 410, note: 52, on: false }]);
    expect(half?.reason).toBe("released");
    expect(half?.notes).toEqual([48, 52]);
  });

  it("does not answer for one key only (pressed and held, or pressed and let go)", () => {
    expect(run("Cmaj7", [{ t: 0, note: 48, on: true }])).toBeUndefined();
    expect(run("Cmaj7", [{ t: 0, note: 48, on: true }, { t: 100, note: 48, on: false }])).toBeUndefined();
    // two keys of the same name are one name
    expect(run("Cmaj7", [{ t: 0, note: 48, on: true }, { t: 0, note: 60, on: true }, { t: 100, note: 48, on: false }, { t: 100, note: 60, on: false }])).toBeUndefined();
  });

  it("does not look at the pedal: only note on and note off count (a key that is let go is not down)", () => {
    const taker = new EarAnswerTaker(specOf("Cmaj7"), DEFAULT_SETTLE_MS);
    taker.press(0, 55, 0);
    taker.release(0, 55, 50); // the pedal may keep it sounding: the taker does not know
    for (const note of [48, 52, 59]) taker.press(0, note, 100);
    expect(taker.poll(1000)?.notes).toEqual([48, 52, 59]);
  });

  it("does not answer with the previous chord still held: it starts again from the moment all keys are up", () => {
    const answer = run("Cmaj7", [
      // the keys of the previous chord are still down when the card comes
      { t: 100, note: 53, on: true }, // pressed on top of them: ignored
      { t: 500, note: 53, on: false }, { t: 500, note: 57, on: false }, { t: 500, note: 60, on: false },
      ...down([48, 52, 59], 0, 800),
    ], { keysDownAtStart: 3 });
    expect(answer?.notes).toEqual([48, 52, 59]);
    expect(answer!.completedAt).toBe(800);
  });

  it("measures to the last key that went down, not to the end of the wait", () => {
    const answer = run("Cmaj7", down(CMAJ7, 100, 1000));
    expect(answer!.completedAt).toBe(1300);
    expect(answer!.judgedAt).toBeGreaterThanOrEqual(1600);
  });

  it("takes the settle time from the setting (150〜600 ms)", () => {
    const quick = run("Cmaj7", down(CMAJ7, 0), { settleMs: 150 });
    const slow = run("Cmaj7", down(CMAJ7, 0), { settleMs: 600 });
    expect(quick!.judgedAt).toBeLessThan(slow!.judgedAt);
  });

  it("asks for the names of the notes that were sounded for `pitchset` and `sounded`", () => {
    const symbol = sym("G7alt");
    const notes = [43, 59, 65, 68, 75];
    const spec = answerSpecOf({ symbol, judge: "pitchset", notes });
    expect([...spec.required].sort((a, b) => a - b)).toEqual([3, 5, 7, 8, 11]);
    expect([...spec.allowed].sort((a, b) => a - b)).toEqual([3, 5, 7, 8, 11]);
  });

  it("allows the 5th to be left out or added, and the written bass, for `core`; and needs the major 7th for mMaj7", () => {
    const major = answerSpecOf({ symbol: sym("C"), judge: "core", notes: [36, 52, 55] });
    expect([...major.required].sort((a, b) => a - b)).toEqual([0, 4]);
    expect(major.allowed.has(7)).toBe(true);
    const outside = answerSpecOf({ symbol: sym("G/F"), judge: "core", notes: [41, 55, 59, 62] });
    expect(outside.allowed.has(5)).toBe(true);
    const minMaj = answerSpecOf({ symbol: sym("CmMaj7"), judge: "core", notes: [36, 63, 67, 71] });
    expect(minMaj.required.has(11)).toBe(true);
  });
});

// ---- the clock ------------------------------------------------------------------------------------

describe("時刻(earClock)", () => {
  const source = (base: number, jitter: number[] = [], outputLatency = 0): OutputTimestampSource => {
    let call = 0;
    let context = 10;
    return {
      currentTime: 10,
      outputLatency,
      getOutputTimestamp() {
        context += 0.02;
        const extra = jitter[call++] ?? 0;
        return { contextTime: context, performanceTime: base + context * 1000 + extra };
      },
    };
  };
  const noWait = () => Promise.resolve();

  it("turns an audio time into a performance time with the median of several readings (a late reading does not count)", async () => {
    const clock = await createAudioToPerformance(source(5000, [0, 90, 0, 0, 0]), { wait: noWait });
    // base 5000 ms: a context time of 12 s is 17000 ms
    expect(Math.abs(clock.toPerformanceMs(12) - 17000)).toBeLessThanOrEqual(1);
    expect(clock.spreadMs).toBeGreaterThanOrEqual(90);
    expect(clock.samples).toBe(5);
  });

  it("does not depend on where the two clocks start (the origins differ by seconds)", async () => {
    for (const base of [0.5, 322, 5000, 600000]) {
      const clock = await createAudioToPerformance(source(base), { wait: noWait });
      expect(Math.abs(clock.toPerformanceMs(30) - (base + 30000))).toBeLessThanOrEqual(1);
    }
  });

  it("adds the output latency", async () => {
    const clock = await createAudioToPerformance(source(0, [], 0.04), { wait: noWait });
    expect(Math.abs(clock.toPerformanceMs(1) - 1040)).toBeLessThanOrEqual(1);
    expect(clock.outputLatencyMs).toBe(40);
  });

  it("falls back to comparing the clocks right now when the browser gives no usable pair", async () => {
    const clock = await createAudioToPerformance({ currentTime: 3 }, { wait: noWait, performanceNow: () => 8000 });
    expect(clock.toPerformanceMs(5)).toBeCloseTo(8000 + 2000, 5);
  });

  it("median of an even and an odd count", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

// ---- the session ------------------------------------------------------------------------------------

describe("練習の状態(earSession)", () => {
  const question = () => buildBankQuestion(bankProgression("L3-4-01")!, 3); // Dm7 G7 Cmaj7 Cmaj7 in E♭: Fm7 B♭7 E♭maj7 E♭maj7
  const play = (session: EarSession, index: number) => session.question.chords[index]!.notes;

  it("starts listening; playing starts on 「弾き始める」; the first card's name is shown only by the setting", () => {
    const shown = new EarSession({ question: question(), showFirstName: true });
    const hidden = new EarSession({ question: question(), showFirstName: false });
    expect(shown.phase).toBe("listen");
    expect(shown.nameVisible(0)).toBe(true);
    expect(shown.nameVisible(1)).toBe(false);
    expect(hidden.nameVisible(0)).toBe(false);
    shown.startPlaying();
    expect(shown.phase).toBe("play");
    // answers are not taken while listening
    expect(hidden.answer(play(hidden, 0), 1000).ok).toBe(false);
    expect(hidden.cards[0]!.attempts).toHaveLength(0);
  });

  it("goes to the next card on a right answer, and stays (with a retry mark) on a wrong one", () => {
    const session = new EarSession({ question: question(), showFirstName: false });
    session.startPlaying();
    session.setMeasureStart(1000);
    const wrong = session.answer([40, 44, 47], 3000);
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toContain("余分な音");
    expect(session.index).toBe(0);
    expect(session.cards[0]!.mistakes).toBe(1);
    expect(session.marks(session.cards[0]!)).toEqual(["retry"]);
    const right = session.answer(play(session, 0), 3500);
    expect(right.ok).toBe(true);
    expect(session.cards[0]!.sec).toBeCloseTo(2.5, 5);
    expect(session.cards[0]!.firstAnswerSec).toBeCloseTo(2, 5);
    expect(session.marks(session.cards[0]!)).toEqual(["retry"]);
    session.next();
    expect(session.index).toBe(1);
  });

  it("marks ✓ for the first try with no hint, and 名 / 鍵 for the hints (they may be on a card with △)", () => {
    const session = new EarSession({ question: question(), showFirstName: false });
    session.startPlaying();
    session.setMeasureStart(0);
    session.answer(play(session, 0), 1000);
    expect(session.marks(session.cards[0]!)).toEqual(["ok"]);
    session.next();
    expect(session.hint()).toBe(1);
    expect(session.nameVisible(1)).toBe(true);
    session.answer([40], 100);
    expect(session.hint()).toBe(2);
    expect(session.answerOnKeyboard).toBe(true);
    expect(session.hint()).toBe(2);
    session.answer(play(session, 1), 4000);
    expect(session.marks(session.cards[1]!)).toEqual(["retry", "name", "key"]);
    expect(session.answerOnKeyboard).toBe(false);
  });

  it("does not move on after a hint until the chord is played right", () => {
    const session = new EarSession({ question: question(), showFirstName: false });
    session.startPlaying();
    session.hint();
    session.hint();
    session.next();
    expect(session.index).toBe(0);
    expect(session.cards[0]!.done).toBe(false);
  });

  it("listening again leaves no mark and does not move the position", () => {
    const session = new EarSession({ question: question(), showFirstName: false });
    session.startPlaying();
    const before = JSON.stringify(session.cards);
    session.countListen();
    session.countListen();
    expect(session.listens).toBe(2);
    expect(session.index).toBe(0);
    expect(session.cards[0]!.listens).toBe(2);
    expect(JSON.stringify(session.cards.map((card) => ({ ...card, listens: 0 })))).toBe(JSON.stringify(JSON.parse(before).map((card: object) => ({ ...card, listens: 0 }))));
    expect(session.marks(session.cards[0]!)).toEqual([]);
  });

  it("measures from the start of measuring, and a listen does not stop the clock", () => {
    const session = new EarSession({ question: question(), showFirstName: false });
    session.startPlaying();
    session.setMeasureStart(10_000);
    session.countListen();
    session.countListen();
    session.answer(play(session, 0), 12_400);
    expect(session.cards[0]!.sec).toBeCloseTo(2.4, 5);
    // an answer while the chord still sounds is not negative
    session.next();
    session.setMeasureStart(20_000);
    session.answer(play(session, 1), 19_000);
    expect(session.cards[1]!.sec).toBe(0);
  });

  it("finishes after the last chord and gives the summary: first tries without the card shown from the start, the median, the hints", () => {
    const session = new EarSession({ question: question(), showFirstName: true });
    session.startPlaying();
    const seconds = [9, 2, 4, 3];
    session.cards.forEach((_, index) => {
      session.setMeasureStart(0);
      if (index === 2) session.answer([40], 100); // one mistake
      if (index === 3) { session.hint(); }
      const result = session.answer(play(session, index), seconds[index]! * 1000);
      expect(result.ok).toBe(true);
      expect(result.finished).toBe(index === 3);
      session.next();
    });
    expect(session.phase).toBe("result");
    const summary = session.summary();
    // card 0 was shown from the start: not counted. Of cards 1, 2, 3: only card 1 was right first time with no hint.
    expect(summary.counted).toBe(3);
    expect(summary.firstTry).toBe(1);
    expect(summary.medianSec).toBe(3); // 2, 4, 3 → 3
    expect(summary.hints).toBe(1);
    expect(session.marks(session.cards[0]!)).toEqual([]);
  });

  it("judges by itself without a MIDI keyboard, and keeps those chords out of the figures", () => {
    const session = new EarSession({ question: question(), showFirstName: false });
    session.startPlaying();
    expect(session.selfAnswer(false).finished).toBe(false);
    expect(session.cards[0]!.mistakes).toBe(1);
    session.selfAnswer(true);
    session.next();
    expect(session.index).toBe(1);
    expect(session.cards[0]!.self).toBe(true);
    for (let index = 1; index < 4; index += 1) { session.selfAnswer(true); session.next(); }
    expect(session.phase).toBe("result");
    expect(session.summary().counted).toBe(0);
    expect(session.summary().medianSec).toBeUndefined();
  });

  it("works for every bank progression: the notes it plays are accepted as the answer", () => {
    for (const entry of ALL_BANK.filter((candidate, index) => index % 7 === 0)) {
      const session = new EarSession({ question: buildBankQuestion(entry, 5), showFirstName: false });
      session.startPlaying();
      session.setMeasureStart(0);
      for (let index = 0; index < session.cards.length; index += 1) {
        expect(session.answer(session.question.chords[index]!.notes, 100 * (index + 1)).ok, `${entry.id} ${index}`).toBe(true);
        session.next();
      }
      expect(session.phase).toBe("result");
    }
  });
});

describe("結果の譜面のために、合ったときの音を持つ", () => {
  it("合った答えの鍵だけを(低い順に)持つ。間違いは持たない。記録の形には入らない", () => {
    const question = buildBankQuestion(bankProgression("L1-4-01")!, 0);
    const session = new EarSession({ question, showFirstName: false });
    session.startPlaying();
    session.setMeasureStart(0);
    session.answer([1, 2], 500);
    expect(session.cards[0]!.playedNotes).toBeUndefined();
    const right = [...question.chords[0]!.notes].reverse().map((note) => note + 12);
    session.answer(right, 1500);
    expect(session.cards[0]!.playedNotes).toEqual([...right].sort((a, b) => a - b));
    expect(session.cards[0]!.done).toBe(true);
  });
});

describe("P16-06: カードを押して聴いたときの数え方", () => {
  const fresh = () => {
    const session = new EarSession({ question: buildBankQuestion(bankProgression("L1-8-01")!, 0), showFirstName: false });
    session.startPlaying();
    return session;
  };

  it("今のカードは「今のコードを聴く」と同じ。先のカードはそのカードに数える。済んだカードと、1周聴く段階は数えない。今のカードは動かない", () => {
    const session = fresh();
    session.countCardListen(0);
    expect(session.cards[0]!.listens).toBe(1);
    expect(session.listens).toBe(1);
    session.countCardListen(3);
    expect(session.cards[3]!.listens).toBe(1);
    expect(session.cards[0]!.listens).toBe(1);
    expect(session.listens).toBe(2);
    expect(session.index).toBe(0);
    session.setMeasureStart(0);
    session.answer(session.question.chords[0]!.notes, 1000);
    session.next();
    session.countCardListen(0); // already answered
    expect(session.cards[0]!.listens).toBe(1);
    expect(session.listens).toBe(2);
    expect(session.index).toBe(1);
    const listening = new EarSession({ question: session.question, showFirstName: false });
    listening.countCardListen(2);
    expect(listening.cards[2]!.listens).toBe(0);
  });

  it("度数を見せた印は、まだ答えていないカードだけに付く(答えたカードには付かない)", () => {
    const session = fresh();
    session.setMeasureStart(0);
    session.answer(session.question.chords[0]!.notes, 1000);
    session.next();
    session.markDegreesShown();
    expect(session.cards.map((card) => card.degreeShown === true).slice(0, 4)).toEqual([false, true, true, true]);
  });
});
