import { describe, expect, it } from "vitest";
import { parseTextChordLabel } from "../chords";
import { BrowserPracticeStorage, MemoryPracticeStorage } from "../../features/bass-practice/infra/repository/practiceStorage";
import { ALL_BANK, BENCHMARK, bankProgression } from "./bank";
import { EarRecordRepository } from "./earRecordRepository";
import { EAR_KINDS, earChordKind, earChordRecordSchema, recordsOfSession, type EarChordRecord } from "./earRecords";
import { EarSession } from "./earSession";
import {
  BENCHMARK_CONDITIONS, benchmarkRuns, benchmarkTooSoon, degreeFiguresOf, figuresOf, lastBenchmarks, levelGuide, recentComparison, soundedFiguresOf,
  thisAndLastWeek, weakKinds, weakMoves, weekStartOf, weeklySeries,
} from "./earStats";
import { buildBankQuestion } from "./question";
import { benchmarkQuestion, pickBankQuestion, withManyOfKind } from "./select";
import { bankCandidates } from "./select";

let counter = 0;
/** A record with the plain defaults: a chord of the first level, right at the first try. */
function rec(patch: Partial<EarChordRecord> = {}): EarChordRecord {
  counter += 1;
  return {
    at: "2026-10-14T03:00:00.000Z",
    play: `p${counter}`,
    questionId: `bank:q${counter}`,
    source: "bank",
    level: 1,
    length: 4,
    chordLevel: 1,
    kind: "三和音",
    index: 1,
    given: false,
    manual: false,
    wrongs: 0,
    hint: 0,
    seconds: 2,
    firstAnswerSeconds: 2,
    replays: 0,
    judge: "core",
    ...patch,
  };
}
const many = (count: number, patch: Partial<EarChordRecord> | ((i: number) => Partial<EarChordRecord>) = {}) =>
  Array.from({ length: count }, (_, i) => rec(typeof patch === "function" ? patch(i) : patch));

/** Plays a question to the end with the right answers. `tweak` may spoil a card on the way. */
function finishedSession(tweak?: (session: EarSession, index: number) => void, stopAt = Infinity): EarSession {
  const question = buildBankQuestion(bankProgression("L2-4-01") ?? bankProgression("L1-4-01")!, 0);
  const session = new EarSession({ question, showFirstName: true });
  session.startPlaying();
  for (let i = 0; i < question.chords.length && i < stopAt; i += 1) {
    session.setMeasureStart(0);
    tweak?.(session, i);
    if (!session.current.done) session.answer(question.chords[i]!.notes, 1500);
    session.next();
  }
  return session;
}

describe("記録(コード1つごと)", () => {
  it("最後まで弾いた問題だけが記録される。途中で戻った問題は記録されない", () => {
    const context = { at: new Date("2026-10-14T03:00:00Z"), play: "start" };
    const whole = recordsOfSession(finishedSession(), context);
    expect(whole.length).toBeGreaterThanOrEqual(4);
    expect(whole.every((r) => earChordRecordSchema.safeParse(r).success)).toBe(true);
    expect(recordsOfSession(finishedSession(undefined, 2), context)).toEqual([]);
  });

  it("名前が見えていた1つ目は given、自分で判定は manual(秒数なし)。聴き直し・ヒント・間違いが残る。曲名は入らない", () => {
    const records = recordsOfSession(finishedSession((session, i) => {
      if (i === 1) { session.hint(); session.countListen(); }
      if (i === 2) session.answer([1], 500);
      if (i === 3) session.selfAnswer(true);
    }), { at: new Date("2026-10-14T03:00:00Z"), play: "start" });
    expect(records[0]).toMatchObject({ given: true, manual: false, index: 0 });
    expect(records[0]!.move).toBeUndefined();
    expect(records[1]).toMatchObject({ hint: 1, replays: 1, wrongs: 0 });
    expect(records[1]!.move).toBeTypeOf("number");
    expect(records[2]).toMatchObject({ wrongs: 1 });
    expect(records[3]).toMatchObject({ manual: true });
    expect(records[3]!.seconds).toBeUndefined();
    expect(Object.keys(records[0]!)).not.toContain("name");
    expect(records[0]!.questionId).toMatch(/^bank:/);
  });

  it("コードの種類のまとまり(§3 の表)", () => {
    const kind = (label: string) => earChordKind(parseTextChordLabel(label)!);
    expect(kind("C")).toBe("三和音");
    expect(kind("Am")).toBe("三和音");
    expect(kind("C/E")).toBe("転回形");
    expect(kind("Csus4")).toBe("sus・dim・aug");
    expect(kind("Cdim")).toBe("sus・dim・aug");
    expect(kind("Caug")).toBe("sus・dim・aug");
    expect(kind("Cmaj7")).toBe("maj7・6");
    expect(kind("C6")).toBe("maj7・6");
    expect(kind("Cm7")).toBe("m7・m6");
    expect(kind("Cm6")).toBe("m7・m6");
    expect(kind("G7")).toBe("7");
    expect(kind("G7sus4")).toBe("7");
    expect(kind("Bm7b5")).toBe("m7b5・dim7");
    expect(kind("Bdim7")).toBe("m7b5・dim7");
    expect(kind("Cadd9")).toBe("テンション");
    expect(kind("Cmaj9")).toBe("テンション");
    expect(kind("G13")).toBe("テンション");
    expect(kind("G/F")).toBe("上の構造");
    expect(kind("CmMaj7")).toBe("オルタード");
    expect(kind("G7(b9)")).toBe("オルタード");
    expect(kind("G7alt")).toBe("オルタード");
    expect(EAR_KINDS).toHaveLength(10);
  });
});

describe("成績の数え方", () => {
  it("given・manual は成績から外れ、ヒントを見たコードは秒数から外れる", () => {
    const records = [
      rec({ given: true, seconds: 100 }), rec({ manual: true, seconds: undefined }),
      rec({ seconds: 1 }), rec({ seconds: 3 }), rec({ seconds: 5 }),
      rec({ hint: 1, seconds: 90 }), rec({ wrongs: 1, seconds: 7 }),
    ];
    const f = figuresOf(records);
    expect(f.chords).toBe(7);
    expect(f.measured).toBe(5);
    expect(f.firstTry).toBe(3);
    expect(f.firstTryRate).toBeCloseTo(0.6);
    expect(f.noHintRate).toBeCloseTo(0.8);
    // the seconds: hint 0 only (1, 3, 5, 7), the median of four
    expect(f.medianSec).toBe(4);
    expect(f.few).toBe(true);
  });

  it("聴き直しの平均と「聴き直しなしで一発」", () => {
    const f = figuresOf([rec({ replays: 0 }), rec({ replays: 2 }), rec({ replays: 1, wrongs: 1 }), rec({ replays: 0, hint: 1 })]);
    expect(f.replayAvg).toBeCloseTo(0.75);
    expect(f.firstTry).toBe(2);
    expect(f.cleanFirstTry).toBe(1);
    expect(f.cleanRate).toBeCloseTo(0.25);
  });

  it("鳴った音で判定(sounded)は主な成績から外れ、別に数える。pitchset は主な成績に入る", () => {
    const records = [rec({ judge: "sounded" }), rec({ judge: "sounded", wrongs: 1 }), rec({ judge: "pitchset" }), rec({ judge: "core", wrongs: 2 })];
    expect(figuresOf(records).measured).toBe(2);
    expect(figuresOf(records).firstTry).toBe(1);
    expect(soundedFiguresOf(records)).toMatchObject({ chords: 2, firstTry: 1, firstTryRate: 0.5 });
  });

  it("10コード未満は「まだ少ない」", () => {
    expect(figuresOf(many(9)).few).toBe(true);
    expect(figuresOf(many(10)).few).toBe(false);
  });
});

describe("週の集計(月曜始まり・日本時間)", () => {
  // 2026-10-19 is a Monday: its 0:00 in Japan is 2026-10-18T15:00:00Z
  it("月曜0時(日本時間)の前後で週が分かれる", () => {
    expect(weekStartOf("2026-10-18T14:59:59.999Z")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-18T15:00:00.000Z")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-12T00:00:00+09:00")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-11T23:59:59+09:00")).toBe("2026-10-05");
  });

  it("今週と先週", () => {
    const now = new Date("2026-10-21T03:00:00Z"); // Wednesday
    const records = [
      ...many(10, { at: "2026-10-18T14:00:00Z" }), // Sunday 23:00 JST: last week
      ...many(4, { at: "2026-10-18T15:00:00Z", wrongs: 1 }), // Monday 0:00 JST: this week
      ...many(6, { at: "2026-10-20T03:00:00Z" }),
    ];
    const { thisWeek, lastWeek } = thisAndLastWeek(records, now);
    expect(lastWeek.weekStart).toBe("2026-10-12");
    expect(lastWeek.figures.measured).toBe(10);
    expect(thisWeek.weekStart).toBe("2026-10-19");
    expect(thisWeek.figures.measured).toBe(10);
    expect(thisWeek.figures.firstTry).toBe(6);
  });

  it("12週・レベルで絞れる・10未満の週は few", () => {
    const now = new Date("2026-10-21T03:00:00Z");
    const records = [...many(12, { at: "2026-10-01T03:00:00Z", level: 2 }), ...many(3, { at: "2026-10-20T03:00:00Z", level: 1 })];
    const series = weeklySeries(records, now);
    expect(series).toHaveLength(12);
    expect(series[series.length - 1]!.weekStart).toBe("2026-10-19");
    expect(series[0]!.weekStart).toBe("2026-08-03");
    expect(series[series.length - 1]!.figures.few).toBe(true);
    expect(weeklySeries(records, now, 2).reduce((sum, week) => sum + week.figures.measured, 0)).toBe(12);
    expect(weeklySeries(records, now, 3).every((week) => week.figures.measured === 0)).toBe(true);
  });
});

describe("苦手", () => {
  it("数が8未満のまとまりは出ない。低い順に3つ", () => {
    const group = (kind: string, count: number, wrongs: number) => many(count, (i) => ({ kind, wrongs: i < wrongs ? 1 : 0 }));
    const records = [
      ...group("7", 10, 6), // 40 %
      ...group("m7・m6", 10, 3), // 70 %
      ...group("三和音", 10, 1), // 90 %
      ...group("転回形", 8, 4), // 50 %
      ...group("テンション", 7, 7), // 0 %, but only 7 chords
      ...group("オルタード", 20, 10), // 50 %, more chords than 転回形
    ];
    const weak = weakKinds(records);
    expect(weak.map((w) => w.name)).toEqual(["7", "オルタード", "転回形"]);
    expect(weak[0]!.firstTryRate).toBeCloseTo(0.4);
    expect(weakKinds(group("7", 7, 7))).toEqual([]);
  });

  it("given・manual・sounded は数えない / コードの動きは出題用の進行だけ", () => {
    const records = [
      ...many(8, { move: 5, wrongs: 1 }),
      ...many(8, { move: 7, source: "builtin", wrongs: 1 }),
      ...many(8, { move: 2 }),
      ...many(20, { move: 9, judge: "sounded", wrongs: 1 }),
    ];
    const moves = weakMoves(records);
    expect(moves.map((m) => m.name)).toEqual(["4度上", "全音上"]);
    expect(weakKinds(many(20, { kind: "7", given: true }))).toEqual([]);
  });
});

describe("レベルの目安", () => {
  const good = (count: number, progressions: number, patch: Partial<EarChordRecord> = {}) =>
    many(count, (i) => ({ level: 3, questionId: `bank:p${i % progressions}`, at: `2026-10-${String(1 + Math.floor(i / 4)).padStart(2, "0")}T03:00:00Z`, index: i % 4, seconds: 4, ...patch }));

  it("基準ちょうど(40コード・5進行・80%・4秒)で出る", () => {
    const records = good(40, 5).map((r, i) => (i % 5 === 0 ? { ...r, wrongs: 1 } : r)); // 32 of 40 = 80 %
    const guide = levelGuide(records, 3);
    expect(guide).toMatchObject({ chords: 40, progressions: 5, state: "stable", needChords: 0, needProgressions: 0 });
    expect(guide.firstTryRate).toBeCloseTo(0.8);
    expect(guide.medianSec).toBe(4);
  });

  it("どれか1つ足りないと出ない", () => {
    const base = good(40, 5).map((r, i) => (i % 5 === 0 ? { ...r, wrongs: 1 } : r));
    expect(levelGuide(base.slice(1), 3).state).not.toBe("stable"); // 39 chords
    expect(levelGuide(good(40, 4).map((r, i) => (i % 5 === 0 ? { ...r, wrongs: 1 } : r)), 3).state).not.toBe("stable"); // 4 progressions
    expect(levelGuide(good(40, 5).map((r, i) => (i % 4 === 0 ? { ...r, wrongs: 1 } : r)), 3).state).toBe("enough"); // 75 %
    expect(levelGuide(good(40, 5, { seconds: 4.1 }), 3).state).toBe("enough"); // median over 4 s
    expect(levelGuide(good(40, 5, { seconds: 4.1 }), 3).state).not.toBe("stable");
  });

  it("数が足りないが基準を満たしているときは「順調」と残りの数。足りなくて基準も満たさないときは何も言わない", () => {
    expect(levelGuide(good(25, 3), 3)).toMatchObject({ state: "on-track", needChords: 15, needProgressions: 2 });
    expect(levelGuide(good(25, 3, { wrongs: 1 }), 3).state).toBe("none");
    expect(levelGuide([], 3)).toMatchObject({ state: "none", chords: 0, needChords: 40, needProgressions: 5 });
  });

  it("目安は直近40コードで見る(昔の失敗は効かない)", () => {
    const old = good(20, 5, { wrongs: 1, at: "2026-09-01T03:00:00Z" });
    const recent = good(40, 5, { at: "2026-10-10T03:00:00Z" });
    expect(levelGuide([...old, ...recent], 3).state).toBe("stable");
  });
});

describe("腕試し", () => {
  it("各レベルに固定の4問があり、固定のキーで出る。条件は固定", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(BENCHMARK[level]).toHaveLength(BENCHMARK_CONDITIONS.questions);
      BENCHMARK[level].forEach((entry, index) => {
        const first = benchmarkQuestion(level, index, BENCHMARK_CONDITIONS.bpm)!;
        const second = benchmarkQuestion(level, index, BENCHMARK_CONDITIONS.bpm)!;
        expect(first.tonic).toBe(entry.tonic);
        expect(first.id).toBe(`bank:${entry.id}`);
        expect(first.bpm).toBe(90);
        expect(first.length).toBe(4);
        expect(first.chords.map((c) => [c.label, c.notes])).toEqual(second.chords.map((c) => [c.label, c.notes]));
      });
    }
  });

  it("ふだんの練習では腕試しの問題を腕試しのキーで出さない", () => {
    for (const level of [1, 2, 3] as const) {
      for (const entry of BENCHMARK[level]) {
        for (let i = 0; i < 60; i += 1) {
          const question = pickBankQuestion({ level, length: 4, includeExtra: true, random: Math.random });
          if (question?.id === `bank:${entry.id}`) expect(question.tonic).not.toBe(entry.tonic);
        }
      }
    }
  });

  const run = (id: string, level: 1 | 2 | 3 | 4 | 5, at: string, patch: Partial<EarChordRecord> = {}, questions = 4) =>
    Array.from({ length: questions }, (_, q) => Array.from({ length: 4 }, (_, i) => rec({ run: id, benchmark: level, level, at, questionId: `bank:b${q}`, index: i, ...patch }))).flat();

  it("前回の腕試しと並ぶ。聴き直しなしで一発・ヒント・聴き直しの合計", () => {
    const records = [
      ...run("r1", 2, "2026-09-01T03:00:00Z", { wrongs: 1, replays: 1 }),
      ...run("r2", 2, "2026-10-10T03:00:00Z", { replays: 1, hint: 1 }),
      ...run("x", 3, "2026-10-11T03:00:00Z"),
    ];
    const { last, before } = lastBenchmarks(records, 2);
    expect(last!.run).toBe("r2");
    expect(before!.run).toBe("r1");
    expect(last!.hints).toBe(16);
    expect(last!.replays).toBe(16);
    expect(before!.figures.firstTryRate).toBe(0);
    expect(lastBenchmarks(records, 4)).toEqual({ last: undefined, before: undefined });
  });

  it("途中までの腕試しは結果に出ない", () => {
    expect(benchmarkRuns(run("half", 1, "2026-10-10T03:00:00Z", {}, 2))).toEqual([]);
    expect(benchmarkRuns(run("whole", 1, "2026-10-10T03:00:00Z"))).toHaveLength(1);
  });

  it("前回から7日たっていないと案内が出る(止めはしない)", () => {
    const records = run("r1", 2, "2026-10-10T03:00:00Z");
    expect(benchmarkTooSoon(records, 2, new Date("2026-10-16T03:00:00Z"))).toBe(true);
    expect(benchmarkTooSoon(records, 2, new Date("2026-10-17T03:00:00Z"))).toBe(false);
    expect(benchmarkTooSoon(records, 3, new Date("2026-10-11T03:00:00Z"))).toBe(false);
  });

  it("結果画面の比べ:同じレベル・長さの直近10問(この問題を除く)。足りなければある分", () => {
    const play = (id: string, at: string, patch: Partial<EarChordRecord> = {}) => Array.from({ length: 4 }, (_, i) => rec({ play: id, at, index: i, ...patch }));
    const records = [
      ...Array.from({ length: 12 }, (_, n) => play(`old${n}`, `2026-10-${String(1 + n).padStart(2, "0")}T03:00:00Z`, n < 2 ? { wrongs: 1 } : {})).flat(),
      ...play("other-level", "2026-10-14T03:00:00Z", { level: 2 }),
      ...play("other-length", "2026-10-14T03:00:00Z", { length: 8 }),
      ...play("now", "2026-10-15T03:00:00Z", { wrongs: 1 }),
    ];
    const compared = recentComparison(records, { level: 1, length: 4, excludePlay: "now" });
    expect(compared.plays).toBe(10);
    // the 10 newest of the 12 old ones: the two with mistakes are the oldest and fall out
    expect(compared.figures.firstTryRate).toBe(1);
    expect(recentComparison(records.slice(0, 8), { level: 1, length: 4, excludePlay: "now" }).plays).toBe(2);
    expect(recentComparison([], { level: 1, length: 4, excludePlay: "now" }).plays).toBe(0);
  });
});

describe("苦手の練習:そのまとまりを多く含む進行", () => {
  it("選ばれる進行は、そのまとまりのコードを入れている", () => {
    const candidates = bankCandidates({ level: 3, length: 4, includeExtra: true });
    const chosen = withManyOfKind(candidates, "7");
    expect(chosen.length).toBeGreaterThan(0);
    expect(chosen.length).toBeLessThanOrEqual(candidates.length);
    for (const entry of chosen) {
      expect(buildBankQuestion(entry, 0).chords.some((c) => earChordKind(c.symbol) === "7")).toBe(true);
    }
    for (let i = 0; i < 20; i += 1) {
      const question = pickBankQuestion({ level: 3, length: 4, includeExtra: true, kind: "7" })!;
      expect(question.chords.some((c) => earChordKind(c.symbol) === "7")).toBe(true);
    }
    expect(pickBankQuestion({ level: 1, length: 4, includeExtra: true, kind: "オルタード" })).toBeUndefined();
  });
});

describe("記録の読み書き", () => {
  const stored = (records: unknown[], extra: Record<string, unknown> = {}) =>
    JSON.stringify({ app: "loopvault-ear-practice", fileVersion: 1, version: 1, revision: 1, records, ...extra });

  it("書いたものが読める。追記しても前の記録は残る", async () => {
    const storage = new MemoryPracticeStorage();
    const repository = new EarRecordRepository(storage);
    expect((await repository.load()).records).toEqual([]);
    await repository.append([rec({ play: "a" })]);
    await repository.append([rec({ play: "b" }), rec({ play: "b", index: 2 })]);
    const again = await new EarRecordRepository(storage).load();
    expect(again.records.map((r) => r.play)).toEqual(["a", "b", "b"]);
    expect(JSON.parse(storage.committed!)).toMatchObject({ app: "loopvault-ear-practice", fileVersion: 1, version: 1, revision: 2 });
  });

  it("壊れた記録は別に保管され、落ちない。直前のバックアップがあれば戻る", async () => {
    const storage = new MemoryPracticeStorage();
    const repository = new EarRecordRepository(storage);
    await repository.append([rec({ play: "a" })]);
    await repository.append([rec({ play: "b" })]);
    storage.committed = "{ this is not json";
    const loaded = await new EarRecordRepository(storage).load();
    expect(loaded.notice).toContain("バックアップ");
    expect(loaded.records.map((r) => r.play)).toEqual(["a"]);
    expect(storage.corrupt.size).toBe(1);
    const empty = new MemoryPracticeStorage();
    empty.committed = "[]";
    const none = await new EarRecordRepository(empty).load();
    expect(none.records).toEqual([]);
    expect(none.notice).toBeDefined();
    expect(empty.corrupt.size).toBe(1);
  });

  it("形に合わない記録だけが読まれず、ほかは残る。新しい版は読むだけで書き換えない", async () => {
    const storage = new MemoryPracticeStorage();
    storage.committed = stored([rec({ play: "a" }), { nonsense: true }, rec({ play: "b", level: 9 as never })]);
    const repository = new EarRecordRepository(storage);
    expect((await repository.load()).records.map((r) => r.play)).toEqual(["a"]);
    const future = new MemoryPracticeStorage();
    future.committed = stored([rec({ play: "a" })], { version: 2 });
    const before = future.committed;
    const reader = new EarRecordRepository(future);
    const loaded = await reader.load();
    expect(loaded).toMatchObject({ readOnly: true });
    expect(loaded.records).toHaveLength(1);
    await expect(reader.append([rec()])).rejects.toThrow();
    expect(future.committed).toBe(before);
  });

  it("Dojo の記録・Bass の記録は変わらない(ブラウザの保存先が別)", async () => {
    const map = new Map<string, string>([["loop-vault:practice-v1:data", "bass"], ["loop-vault:chord-dojo-v1:data", "dojo"], ["vault", "vault"]]);
    const kv = {
      get length() { return map.size; },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    };
    const repository = new EarRecordRepository(new BrowserPracticeStorage(kv, "ear-practice"));
    await repository.append([rec()]);
    await repository.append([rec()]);
    expect(map.get("loop-vault:practice-v1:data")).toBe("bass");
    expect(map.get("loop-vault:chord-dojo-v1:data")).toBe("dojo");
    expect(map.get("vault")).toBe("vault");
    expect(map.has("loop-vault:ear-practice-v1:data")).toBe(true);
    // and the other way: a Dojo envelope is not accepted into the ear records
    await expect(new BrowserPracticeStorage(kv, "ear-practice").commit(JSON.stringify({ app: "loopvault-practice", fileVersion: 2, revision: 3 }), "20261017-100000", 2)).rejects.toThrow();
  });
});

describe("報告で確かめる点(P16-03 追加)", () => {
  const finish = (question: ReturnType<typeof buildBankQuestion>) => {
    const session = new EarSession({ question, showFirstName: true });
    session.startPlaying();
    question.chords.forEach((chord) => {
      session.setMeasureStart(0);
      session.answer(chord.notes, 1500);
      session.next();
    });
    return session;
  };

  it("7alt(pitchset)は記録に pitchset で残り、主な成績に入る。sounded だけが外れる", () => {
    const question = ALL_BANK.map((entry) => buildBankQuestion(entry, 0)).find((q) => q.chords.some((c) => c.symbol.altered))!;
    expect(question).toBeDefined();
    const records = recordsOfSession(finish(question), { at: new Date("2026-10-14T03:00:00Z"), play: "alt" });
    const alt = records.filter((r) => r.judge === "pitchset");
    expect(alt.length).toBeGreaterThan(0);
    const measured = figuresOf(records).measured;
    expect(measured).toBe(records.filter((r) => !r.given).length);
    expect(alt.every((r) => figuresOf([r]).measured === 1)).toBe(true);
    expect(figuresOf([...records, rec({ judge: "sounded" })]).measured).toBe(measured);
    expect(soundedFiguresOf(records).chords).toBe(0);
  });

  it("オルタード: 7alt・mMaj7・括弧のテンション(b9 #9 #11 b13)。6/9 は maj7・6", () => {
    const kind = (label: string) => earChordKind(parseTextChordLabel(label)!);
    for (const label of ["G7alt", "CmMaj7", "G7(b9)", "G7(#9)", "G7(#11)", "G7(b13)", "G7(b9,b13)"]) expect(kind(label), label).toBe("オルタード");
    expect(kind("C6/9")).toBe("maj7・6");
    expect(kind("C69")).toBe("maj7・6");
    expect(kind("Cadd9")).toBe("テンション");
  });

  it("週の区切りは端末の時間帯に左右されない(計算は UTC のみ)", () => {
    const zones = ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Auckland"];
    const original = process.env.TZ;
    try {
      for (const zone of zones) {
        process.env.TZ = zone;
        expect(weekStartOf("2026-10-18T14:59:59Z"), zone).toBe("2026-10-12"); // Sunday 23:59:59 JST
        expect(weekStartOf("2026-10-18T15:00:00Z"), zone).toBe("2026-10-19"); // Monday 0:00 JST
      }
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });

  it("腕試しの問題は、腕試しのキーを指定してもふだんの練習に出ない(Stage 01 の選び方とつながる)", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      for (const entry of BENCHMARK[level]) {
        for (let step = 0; step < 200; step += 1) {
          const question = pickBankQuestion({ level, length: 4, includeExtra: true, tonic: entry.tonic, random: () => step / 200 });
          expect(question === undefined || question.id !== `bank:${entry.id}`, `${entry.id} at ${step}`).toBe(true);
        }
        // and with the key left to chance it is never the benchmark key
        for (let step = 0; step < 200; step += 1) {
          const question = pickBankQuestion({ level, length: 4, includeExtra: true, random: () => step / 200 });
          if (question?.id === `bank:${entry.id}`) expect(question.tonic).not.toBe(entry.tonic);
        }
      }
    }
  });

  it("記録に曲名・ファイル名・進行の名前が入らない(collection は内部 id だけ)。データに無い id でも成績は数えられる", () => {
    const base = buildBankQuestion(bankProgression("L1-4-01")!, 0);
    const question = { ...base, id: "collection:block-123:1", source: "collection" as const, name: "SECRET SONG NAME.mid" };
    const text = JSON.stringify(recordsOfSession(finish(question), { at: new Date("2026-10-14T03:00:00Z"), play: "c" }));
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain(".mid");
    expect(text).toContain("collection:block-123:1");
    // a record whose id is not in the data any more (a removed progression) still counts, and nothing looks it up
    const gone = many(10, { questionId: "bank:L9-9-99" });
    expect(figuresOf(gone).measured).toBe(10);
    expect(levelGuide(gone.map((r) => ({ ...r, level: 2 as const })), 2).progressions).toBe(1);
  });
});

describe("P16-06: 度数と機能を見てから弾いたコード", () => {
  it("degreeShown の記録は、主な成績(一発・秒数・目安・苦手)から外れ、別の小さな欄に数だけ出る", () => {
    const records = [rec(), rec(), rec({ degreeShown: true }), rec({ degreeShown: true, wrongs: 1 }), rec({ given: true, degreeShown: true })];
    expect(figuresOf(records).measured).toBe(2);
    expect(degreeFiguresOf(records)).toMatchObject({ chords: 2, firstTry: 1, firstTryRate: 0.5 });
    // the level guide and the weak points do not see them either
    expect(levelGuide(records.map((r) => ({ ...r, level: 2 as const })), 2).chords).toBe(2);
    expect(weakKinds(many(10, { degreeShown: true, wrongs: 1 }))).toEqual([]);
    expect(earChordRecordSchema.safeParse(rec({ degreeShown: true })).success).toBe(true);
    expect(earChordRecordSchema.safeParse({ ...rec(), degreeShown: false }).success).toBe(false);
  });

  it("カードに度数・機能が見えていたコードだけが、記録に degreeShown: true で残る", () => {
    const question = buildBankQuestion(bankProgression("L1-4-01")!, 0);
    const session = new EarSession({ question, showFirstName: false });
    session.startPlaying();
    question.chords.forEach((chord, index) => {
      session.setMeasureStart(0);
      if (index === 2) session.markDegreesShown(); // from the third card on they were on the screen
      session.answer(chord.notes, 1500);
      session.next();
    });
    const saved = recordsOfSession(session, { at: new Date("2026-10-14T03:00:00Z"), play: "d" });
    expect(saved.map((r) => r.degreeShown === true)).toEqual([false, false, true, true]);
  });
});
