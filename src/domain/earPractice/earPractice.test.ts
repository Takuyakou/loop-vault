import { describe, expect, it } from "vitest";
import { BUILTINS, buildBuiltin } from "../chordDojo/builtins";
import { judgeChord } from "../chordDojo/judging";
import { parseTextChordLabel } from "../chords";
import type { ChordSymbol, SavedProgressionBlock, SongIdea } from "../types";
import {
  ALL_BANK, BENCHMARK, CORE_BANK, EXTRA_BANK, benchmarkEntry, bankCandidates, bankCounts, benchmarkQuestion,
  buildBankQuestion, buildBuiltinQuestion, buildCollectionQuestion, chordFromDegreeToken, earChordLevel, earJudge,
  earKeyName, earLevelOf, pickBankQuestion, questionLevel, randomTonic, scanCollection, voiceForEar,
  type EarQuestionChord,
} from "./index";
import { parseDegreeToken } from "./degrees";

const KEYS = Array.from({ length: 12 }, (_, tonic) => tonic);
const tokensOf = (bars: string[][]) => bars.flat();
const pc = (value: number) => ((value % 12) + 12) % 12;

// ---- 1. the data -----------------------------------------------------------------------------

describe("出題用の進行のデータ", () => {
  it("has the 60 progressions and the 357 added ones (304 + the 53 of P16-05), with distinct ids and fixed display numbers", () => {
    expect(CORE_BANK).toHaveLength(60);
    expect(EXTRA_BANK).toHaveLength(357);
    const ids = ALL_BANK.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(417);
    expect(CORE_BANK.every((entry) => /^L[1-5]-(4|8|16)-\d\d$/.test(entry.id))).toBe(true);
    expect(EXTRA_BANK.every((entry) => /^X[1-5]-(4|8|16)-\d{3}$/.test(entry.id))).toBe(true);
    const numbers = ALL_BANK.map((entry) => entry.displayNumber);
    expect(new Set(numbers).size).toBe(417);
    expect(CORE_BANK.map((entry) => entry.displayNumber).sort((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(Math.min(...EXTRA_BANK.map((entry) => entry.displayNumber))).toBe(101);
    expect(Math.max(...EXTRA_BANK.map((entry) => entry.displayNumber))).toBe(457);
    // the numbers of the first 364 did not move: the 304 keep 101…404, and the 53 are 405…457
    expect(EXTRA_BANK.slice(0, 304).map((entry) => entry.displayNumber)).toEqual(EXTRA_BANK.slice(0, 304).map((entry) => entry.displayNumber).sort((a, b) => a - b));
    expect(Math.max(...EXTRA_BANK.slice(0, 304).map((entry) => entry.displayNumber))).toBe(404);
    expect(EXTRA_BANK.slice(304).map((entry) => entry.displayNumber).sort((a, b) => a - b)).toEqual(Array.from({ length: 53 }, (_, i) => 405 + i));
  });

  it("has the number of added progressions per level and length that the instruction says", () => {
    const count = (level: number, length: number) => EXTRA_BANK.filter((entry) => entry.level === level && entry.length === length).length;
    expect([1, 2, 3, 4, 5].map((level) => [count(level, 4), count(level, 8), count(level, 16)])).toEqual([[31, 8, 6], [15, 8, 6], [57, 48, 6], [19, 65, 6], [7, 69, 6]]);
    expect(EXTRA_BANK.some((entry) => entry.length === 16)).toBe(true);
  });

  it("6: every level has 12 or more progressions of 4 bars and of 8 bars, and 8 or more of 16 bars (with the added ones on); the first 60 are still there with them off", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      for (const [length, least] of [[4, 12], [8, 12], [16, 8]] as const) {
        expect(bankCandidates({ level, length, includeExtra: true }).length, `level ${level}, ${length} bars`).toBeGreaterThanOrEqual(least);
        // the 60 alone are always enough to ask something
        expect(bankCandidates({ level, length, includeExtra: false }).length, `level ${level}, ${length} bars (60 only)`).toBeGreaterThan(0);
      }
    }
  });

  it("each progression has `length` bars of one or two chords, and the level the rule computes", () => {
    for (const entry of ALL_BANK) {
      expect(entry.bars, entry.id).toHaveLength(entry.length);
      expect(entry.bars.every((bar) => bar.length >= 1 && bar.length <= 2), entry.id).toBe(true);
      for (const tonic of [0, 3, 6, 9]) {
        const question = buildBankQuestion(entry, tonic);
        expect(questionLevel(question), `${entry.id} in ${earKeyName(tonic, entry.mode)}`).toBe(entry.level);
      }
    }
  });

  it("reads every chord of every progression in the 12 keys, and the bass of 6/9 chords is split off correctly", () => {
    let sixNineWithBass = 0;
    for (const entry of ALL_BANK) {
      for (const token of tokensOf(entry.bars)) {
        for (const tonic of KEYS) {
          const symbol = chordFromDegreeToken(token, tonic, entry.mode);
          expect(Number.isInteger(symbol.root)).toBe(true);
        }
        const parsed = parseDegreeToken(token);
        if (parsed.suffix === "6/9" && parsed.bass) {
          sixNineWithBass += 1;
          for (const tonic of KEYS) {
            const symbol = chordFromDegreeToken(token, tonic, entry.mode);
            expect(symbol.quality, token).toBe("sixNine");
            expect(symbol.bass, token).toBeDefined();
          }
        }
      }
    }
    expect(sixNineWithBass).toBeGreaterThan(0);
  });

  it("splits a degree token into degree, suffix and bass (a slash before a degree is a bass, 6/9 is not)", () => {
    expect(parseDegreeToken("bVIImaj7")).toMatchObject({ accidental: -1, degree: 7, suffix: "maj7" });
    expect(parseDegreeToken("I/III")).toMatchObject({ degree: 1, suffix: "", bass: { degree: 3, accidental: 0 } });
    expect(parseDegreeToken("I6/9")).toMatchObject({ suffix: "6/9" });
    expect(parseDegreeToken("I6/9").bass).toBeUndefined();
    expect(parseDegreeToken("IV6/9/V")).toMatchObject({ degree: 4, suffix: "6/9", bass: { degree: 5 } });
    expect(parseDegreeToken("bVI6/9/bVII")).toMatchObject({ accidental: -1, suffix: "6/9", bass: { accidental: -1, degree: 7 } });
    expect(parseDegreeToken("V7(b9)")).toMatchObject({ suffix: "7(b9)" });
  });
});

// ---- 2. keys and spelling ----------------------------------------------------------------------

describe("キーと綴り", () => {
  it("names the 12 keys", () => {
    expect(KEYS.map((tonic) => earKeyName(tonic, "major"))).toEqual(["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]);
    expect(KEYS.map((tonic) => earKeyName(tonic, "minor"))).toEqual(["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"]);
  });

  it("spells the letter from the degree number and the ♯/♭ from the pitch (old expectations, still true under the P16-spelling-fix rule)", () => {
    const label = (token: string, tonic: number, mode: "major" | "minor") => chordFromDegreeToken(token, tonic, mode).label;
    // D major: ♭VI is B♭, not A♯; the natural degrees follow the sharp key
    expect(label("bVImaj7", 2, "major")).toBe("Bbmaj7");
    expect(label("bIIImaj7", 7, "major")).toBe("Bbmaj7");
    expect(label("bVImaj7", 7, "major")).toBe("Ebmaj7");
    expect(label("V7", 2, "major")).toBe("A7");
    expect(label("IV", 6, "major")).toBe("B");
    expect(label("V", 6, "major")).toBe("C#");
    expect(label("I", 1, "major")).toBe("Db");
    expect(label("#IVm7b5", 0, "major")).toBe("F#m7b5");
    // minor keys count the degrees from their own tonic
    expect(label("Im", 2, "minor")).toBe("Dm");
    expect(label("bIII", 2, "minor")).toBe("F");
    expect(label("bVI", 2, "minor")).toBe("Bb");
    expect(label("bVII", 7, "minor")).toBe("F");
    expect(label("bVI", 7, "minor")).toBe("Eb");
    expect(label("IVm", 3, "minor")).toBe("Abm");
    expect(label("Im", 3, "minor")).toBe("Ebm");
    expect(label("Im", 11, "minor")).toBe("Bm");
    expect(label("V", 11, "minor")).toBe("F#");
    // a slash chord keeps the bass the degree names
    expect(label("I/III", 1, "major")).toBe("Db/F");
    expect(label("V/IV", 0, "major")).toBe("G/F");
  });

  it("reads a degree in a key as the pitch class the key says", () => {
    expect(chordFromDegreeToken("V7", 5, "major").root).toBe(0);
    expect(chordFromDegreeToken("bVII", 0, "minor").root).toBe(10);
    expect(chordFromDegreeToken("I/III", 0, "major").bass).toBe(4);
  });
});

// ---- 3. what is sounded ------------------------------------------------------------------------

function allQuestions() {
  const questions: Array<{ where: string; chord: EarQuestionChord }> = [];
  for (const entry of ALL_BANK) {
    for (const tonic of KEYS) {
      for (const chord of buildBankQuestion(entry, tonic).chords) questions.push({ where: `${entry.id}@${tonic}`, chord });
    }
  }
  for (const builtin of BUILTINS) {
    for (const key of KEYS) {
      const question = buildBuiltinQuestion(builtin.id, key);
      for (const chord of question?.chords ?? []) questions.push({ where: `builtin:${builtin.id}@${key}`, chord });
    }
  }
  return questions;
}

describe("鳴らす音", () => {
  it("2a: every note set that is sounded passes the judgement of its own chord (bank, added and standard progressions, 12 keys)", () => {
    const failures: string[] = [];
    let checked = 0;
    for (const { where, chord } of allQuestions()) {
      checked += 1;
      const verdict = earJudge({ symbol: chord.symbol, judge: chord.judge, notes: chord.notes }, chord.notes);
      if (!verdict.ok) failures.push(`${where} ${chord.label} [${chord.notes}] ${chord.judge}: ${verdict.message}`);
    }
    expect(checked).toBeGreaterThan(20000);
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it("2a': what is judged by judgeChord(core) itself passes it, except 7alt (judged as a set of note names)", () => {
    const failures: string[] = [];
    for (const { where, chord } of allQuestions()) {
      if (chord.judge !== "core") { expect(chord.symbol.altered, where).toBe(true); continue; }
      const verdict = judgeChord({ chord: chord.symbol, notes: chord.notes, judge: "core", bass: "self" }, chord.notes);
      if (!verdict.ok) failures.push(`${where} ${chord.label} ${verdict.message}`);
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  /** A table written apart from the code that voices (and from the judge): semitones above the root. */
  const TABLE: Array<{ test: (symbol: ChordSymbol) => boolean; must: number[]; forbid: number[]; alterations?: { of: number[]; atLeast: number } }> = [
    { test: (s) => s.quality === "maj" && !s.tensions.length, must: [4, 7], forbid: [] },
    { test: (s) => s.quality === "min" && !s.tensions.length, must: [3, 7], forbid: [] },
    { test: (s) => s.quality === "sus2", must: [2, 7], forbid: [3, 4] },
    { test: (s) => s.quality === "sus4", must: [5, 7], forbid: [3, 4] },
    { test: (s) => s.quality === "dim", must: [3, 6], forbid: [7] },
    { test: (s) => s.quality === "aug", must: [4, 8], forbid: [7] },
    { test: (s) => s.quality === "six", must: [4, 9], forbid: [10, 11] },
    { test: (s) => s.quality === "min6", must: [3, 9], forbid: [10, 11] },
    { test: (s) => s.quality === "maj7" && !s.tensions.length, must: [4, 11], forbid: [] },
    { test: (s) => s.quality === "min7", must: [3, 10], forbid: [] },
    { test: (s) => s.quality === "dom7" && !s.tensions.length && !s.altered, must: [4, 10], forbid: [] },
    { test: (s) => s.quality === "min7b5", must: [3, 6, 10], forbid: [7] },
    { test: (s) => s.quality === "dim7", must: [3, 6, 9], forbid: [7] },
    { test: (s) => s.quality === "dom7sus4", must: [5, 10], forbid: [3, 4] },
    { test: (s) => s.quality === "add9", must: [4, 2], forbid: [10, 11] },
    { test: (s) => s.quality === "maj9", must: [4, 11, 2], forbid: [] },
    { test: (s) => s.quality === "min9", must: [3, 10, 2], forbid: [] },
    { test: (s) => s.quality === "dom9", must: [4, 10, 2], forbid: [] },
    { test: (s) => s.quality === "min11", must: [3, 10, 5], forbid: [] },
    { test: (s) => s.quality === "dom13", must: [4, 10, 9], forbid: [5] },
    { test: (s) => s.quality === "sixNine", must: [4, 9, 2], forbid: [10, 11] },
    { test: (s) => s.quality === "dom7" && s.tensions.join() === "b9", must: [4, 10, 1], forbid: [2] },
    { test: (s) => s.quality === "dom7" && s.tensions.join() === "#9", must: [4, 10, 3], forbid: [2] },
    { test: (s) => s.quality === "dom7" && s.tensions.join() === "b13", must: [4, 10, 8], forbid: [7] },
    { test: (s) => s.quality === "dom7" && s.tensions.join() === "#11", must: [4, 10, 6], forbid: [7] },
    { test: (s) => s.quality === "maj7" && s.tensions.join() === "#11", must: [4, 11, 6], forbid: [5] },
    { test: (s) => Boolean(s.altered), must: [4, 10], forbid: [2, 9, 7], alterations: { of: [1, 3, 6, 8], atLeast: 2 } },
    { test: (s) => s.quality === "minMaj7", must: [3, 11], forbid: [10] },
  ];

  it("2b: every note set that is sounded matches the content table (what a chord name means), apart from the judge", () => {
    const failures: string[] = [];
    const unknown = new Set<string>();
    for (const { where, chord } of allQuestions()) {
      const symbol = chord.symbol;
      const rows = TABLE.filter((row) => row.test(symbol));
      if (!rows.length) { unknown.add(`${symbol.quality}[${symbol.tensions}]${symbol.altered ? "alt" : ""}`); continue; }
      const slash = symbol.bass !== undefined && symbol.bass !== symbol.root;
      // the written bass of a slash chord is the bass, not a tone of the chord above it: only the notes above it are held to the table
      const above = new Set(chord.notes.map((note) => pc(note - symbol.root)));
      const upperOnly = new Set(chord.notes.slice(1).map((note) => pc(note - symbol.root)));
      for (const row of rows) {
        const lacking = row.must.filter((interval) => !above.has(interval));
        const present = row.forbid.filter((interval) => (slash ? upperOnly : above).has(interval));
        const altered = row.alterations ? row.alterations.of.filter((interval) => above.has(interval)).length : 99;
        if (lacking.length || present.length || altered < (row.alterations?.atLeast ?? 0)) {
          failures.push(`${where} ${chord.label} [${chord.notes}] lacks ${lacking} has-forbidden ${present} alterations ${altered}`);
        }
      }
      // a slash chord: the written bass is the lowest note
      expect(pc(chord.notes[0]!), `${where} ${chord.label}`).toBe(symbol.bass ?? symbol.root);
    }
    expect(failures.slice(0, 10)).toEqual([]);
    // chords of the standard progressions that the table has no row for (e.g. aug7) are only listed, never silently passed
    expect([...unknown].sort()).toEqual([]);
  });

  it("3: the bass is the lowest note (C2…B2), the next note is at least an octave above it, and everything stays in a listening range", () => {
    for (const { where, chord } of allQuestions()) {
      const [bass, ...upper] = chord.notes;
      expect(bass, where).toBeGreaterThanOrEqual(36);
      expect(bass, where).toBeLessThanOrEqual(47);
      expect(Math.min(...upper) - bass!, `${where} ${chord.label}`).toBeGreaterThanOrEqual(12);
      expect(Math.max(...chord.notes), `${where} ${chord.label}`).toBeLessThanOrEqual(88);
      expect(upper, where).toEqual([...upper].sort((a, b) => a - b));
      expect(new Set(chord.notes).size, where).toBe(chord.notes.length);
    }
  });

  it("voices 7alt as the 3rd, ♭7th, ♭9 and ♭13 above the bass (G7alt: G2 | B3 F4 A♭4 E♭5), without the 5th, 9th or 13th", () => {
    const symbol = chordFromDegreeToken("V7alt", 0, "major");
    expect(symbol.altered).toBe(true);
    expect(voiceForEar(symbol)).toEqual([43, 59, 65, 68, 75]);
  });

  it("leaves the perfect 5th out of 7(#11) and 7(b13) (and out of 7alt), and keeps it in an ordinary 7", () => {
    const has = (token: string, interval: number) => {
      const symbol = chordFromDegreeToken(token, 0, "major");
      return voiceForEar(symbol).some((note) => pc(note - symbol.root) === interval);
    };
    expect(has("V7(#11)", 7)).toBe(false);
    expect(has("V7(b13)", 7)).toBe(false);
    expect(has("V7", 7)).toBe(true);
    expect(has("Imaj7(#11)", 7)).toBe(true);
  });

  it("puts the root above an inverted bass (C/E: E | C G), and every note above a bass that is not a chord tone (G/F: F | G B D)", () => {
    expect(voiceForEar(chordFromDegreeToken("I/III", 0, "major"))).toEqual([40, 60, 67]);
    const outside = voiceForEar(chordFromDegreeToken("V/IV", 0, "major"));
    expect(outside[0]).toBe(41);
    expect(outside.slice(1).map(pc)).toEqual([7, 11, 2]);
  });
});

// ---- 4. the judgement --------------------------------------------------------------------------

describe("判定(この練習の)", () => {
  const symbolOf = (label: string) => parseTextChordLabel(label)!;

  it("judges 7alt as a set of note names: the same names, nothing else, the bass lowest", () => {
    const symbol = chordFromDegreeToken("V7alt", 0, "major");
    const target = { symbol, judge: "pitchset" as const, notes: voiceForEar(symbol) };
    expect(earJudge(target, [43, 59, 65, 68, 75]).ok).toBe(true);
    // any height
    expect(earJudge(target, [31, 71, 77, 80, 63]).ok).toBe(true);
    // a missing alteration, an extra note, the wrong bass
    expect(earJudge(target, [43, 59, 65, 68]).message).toContain("がありません");
    expect(earJudge(target, [43, 59, 65, 68, 75, 62]).message).toContain("余分な音");
    expect(earJudge(target, [47, 55, 65, 68, 75, 59]).ok).toBe(false);
    // judgeChord(core) cannot pass 7alt at all: that is why it is judged this way
    expect(judgeChord({ chord: symbol, notes: target.notes, judge: "core", bass: "self" }, target.notes).ok).toBe(false);
  });

  it("requires the major 7th of mMaj7 on top of core, and does not touch other chords", () => {
    const symbol = symbolOf("CmMaj7");
    const target = { symbol, judge: "core" as const, notes: [36, 63, 67, 71] };
    expect(earJudge(target, [36, 63, 67, 71]).ok).toBe(true);
    expect(earJudge(target, [36, 63, 67]).ok).toBe(false);
    expect(earJudge(target, [36, 63]).message).toBe("長7度(B)がありません");
    // judgeChord(core) alone would have let the root and the minor 3rd through
    expect(judgeChord({ chord: symbol, notes: target.notes, judge: "core", bass: "self" }, [36, 63]).ok).toBe(true);
    const minor = symbolOf("Cm");
    expect(earJudge({ symbol: minor, judge: "core", notes: [36, 63, 67] }, [36, 63]).ok).toBe(true);
  });

  it("judges notes of a saved song by their names, the lowest name and nothing else (the height is not asked)", () => {
    const symbol = symbolOf("Am11");
    const saved = [33, 52, 55, 62, 67];
    const target = { symbol, judge: "sounded" as const, notes: saved };
    expect(earJudge(target, saved).ok).toBe(true);
    expect(earJudge(target, [45, 64, 67, 74, 79]).ok).toBe(true);
    expect(earJudge(target, [40, 57, 64, 67, 74]).message).toContain("一番下");
    expect(earJudge(target, [33, 52, 55]).ok).toBe(false);
  });
});

// ---- 5. levels ---------------------------------------------------------------------------------

describe("レベルの判定", () => {
  const level = (label: string, key?: { tonic: number; mode: "major" | "minor" }) => earChordLevel(parseTextChordLabel(label)!, key);
  const C = { tonic: 0, mode: "major" as const };

  it("follows the table of the plan", () => {
    expect(level("C", C)).toBe(1);
    expect(level("Am", C)).toBe(1);
    expect(level("Bdim", C)).toBe(2);
    expect(level("C/E", C)).toBe(2);
    expect(level("G/F", C)).toBe(4);
    expect(level("Fm", C)).toBe(2);
    expect(level("Bb", C)).toBe(2);
    expect(level("Gsus4", C)).toBe(2);
    expect(level("Dm7", C)).toBe(3);
    expect(level("Cm6", C)).toBe(3);
    expect(level("Cadd9", C)).toBe(4);
    expect(level("G13", C)).toBe(4);
    expect(level("C6/9", C)).toBe(4);
    expect(level("G7(b9)", C)).toBe(5);
    expect(level("Fmaj7(#11)", C)).toBe(5);
    expect(level("CmMaj7", C)).toBe(5);
    expect(level("G7alt", C)).toBe(5);
  });

  it("puts a triad of an unknown key at 2 (it is not assumed to belong to the key)", () => {
    expect(level("C")).toBe(2);
    expect(level("C", C)).toBe(1);
  });

  it("knows the minor key's own triads", () => {
    const A = { tonic: 9, mode: "minor" as const };
    expect(level("Am", A)).toBe(1);
    expect(level("F", A)).toBe(1);
    expect(level("E", A)).toBe(1);
    expect(level("Em", A)).toBe(1);
    expect(level("D", A)).toBe(2);
  });

  it("a progression is as hard as its hardest chord", () => {
    expect(earLevelOf([parseTextChordLabel("C")!, parseTextChordLabel("G7(b9)")!], C)).toBe(5);
  });

  it("sorts the standard progressions with the same rule (by chord symbol, whatever the label looks like)", () => {
    const levels = BUILTINS.map((builtin) => {
      const built = buildBuiltin(builtin.id, 0);
      return earLevelOf(built.chords.map((chord) => chord.chord), { tonic: 0, mode: builtin.mode });
    });
    expect(levels.every((value) => value >= 1 && value <= 5)).toBe(true);
    expect(levels.some((value) => value >= 3)).toBe(true);
  });
});

// ---- 6. choosing -------------------------------------------------------------------------------

describe("出題の選び方", () => {
  const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  it("chooses from the 417 and, with 「追加の進行も出す」 off, only from the 60", () => {
    expect(bankCounts({ includeExtra: true })).toEqual({ total: 417, extra: 357 });
    expect(bankCounts({ includeExtra: false })).toEqual({ total: 60, extra: 0 });
    expect(bankCounts({ includeExtra: true, level: 5, length: 8 }).total).toBe(4 + 69);
    const on = bankCandidates({ level: 3, length: 8, includeExtra: true });
    const off = bankCandidates({ level: 3, length: 8, includeExtra: false });
    expect(on.length).toBe(4 + 48);
    expect(off.length).toBe(4);
    const random = seeded(7);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const question = pickBankQuestion({ level: 3, length: 8, includeExtra: false, random });
      seen.add(question!.id);
      expect(question!.id.startsWith("bank:L3-8-")).toBe(true);
    }
    expect(seen.size).toBe(4);
    expect(pickBankQuestion({ level: 3, length: 8, includeExtra: true, random })).toBeDefined();
  });

  it("for 16 bars there are 10 of the 60 and 30 added ones; with the added ones off, the 10", () => {
    expect(bankCounts({ includeExtra: true, length: 16 })).toEqual({ total: 40, extra: 30 });
    expect(bankCounts({ includeExtra: false, length: 16 })).toEqual({ total: 10, extra: 0 });
  });

  it("never plays in the same key twice in a row, and keeps away from the last ten questions", () => {
    const random = seeded(11);
    let previous: number | undefined;
    const recent: string[] = [];
    for (let i = 0; i < 80; i += 1) {
      const question = pickBankQuestion({ level: 2, length: 4, includeExtra: true, recentIds: recent, previousTonic: previous, random })!;
      expect(question.tonic).not.toBe(previous);
      expect(recent.slice(-10)).not.toContain(question.id);
      previous = question.tonic;
      recent.push(question.id);
    }
    expect(randomTonic(() => 0.5, 5)).not.toBe(5);
  });

  it("5b: a benchmark problem is not asked in its benchmark key in ordinary practice", () => {
    const random = seeded(3);
    for (const [level, entries] of Object.entries(BENCHMARK)) {
      for (const entry of entries) {
        const progression = ALL_BANK.find((candidate) => candidate.id === entry.id)!;
        expect(progression.level).toBe(Number(level));
        for (let i = 0; i < 300; i += 1) {
          const question = pickBankQuestion({ level: progression.level, length: 4, includeExtra: false, random });
          if (question && question.id === `bank:${entry.id}`) expect(question.tonic).not.toBe(entry.tonic);
        }
        // a fixed key asked for explicitly is refused too
        const fixed = pickBankQuestion({ level: progression.level, length: 4, includeExtra: false, tonic: entry.tonic, random });
        expect(fixed?.id).not.toBe(`bank:${entry.id}`);
      }
    }
  });

  it("the benchmark questions are fixed: the problem, the key and the notes", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      const first = benchmarkQuestion(level, 0)!;
      const again = benchmarkQuestion(level, 0)!;
      expect(first).toEqual(again);
      expect(first.tonic).toBe(benchmarkEntry(first.id.replace("bank:", ""))!.tonic);
      expect(first.length).toBe(4);
    }
    expect(benchmarkQuestion(5, 2)!.chords.some((chord) => chord.judge === "pitchset")).toBe(true);
  });

  it("gives the question the number to show instead of the name, and keeps the name for the result screen", () => {
    const question = pickBankQuestion({ level: 3, length: 4, includeExtra: false, random: seeded(1) })!;
    expect(question.displayNumber).toBeGreaterThan(0);
    expect(typeof question.name).toBe("string");
    expect(question.chords.length).toBeGreaterThanOrEqual(4);
    expect(question.chords[0]!.startBeat).toBe(0);
    const last = question.chords[question.chords.length - 1]!;
    expect(last.startBeat + last.durationBeats).toBe(16);
  });
});

// ---- 7. standard progressions and the saved ones -------------------------------------------------

describe("定番の進行", () => {
  it("is built with buildBuiltin in any of the 12 keys and sounded the way this practice sounds chords", () => {
    const question = buildBuiltinQuestion(BUILTINS[0]!.id, 4)!;
    expect(question.source).toBe("builtin");
    expect(question.tonic).toBe(4);
    expect(question.chords.every((chord) => chord.notes[0]! >= 36 && chord.notes[0]! <= 47)).toBe(true);
    expect(buildBuiltinQuestion("no-such-progression", 0)).toBeUndefined();
  });

  it("cuts a long progression at a bar line", () => {
    const long = BUILTINS.find((entry) => entry.chords.reduce((n, c) => n + c.beats, 0) / 4 > 8)!;
    const part = buildBuiltinQuestion(long.id, 0, { length: 4, fromBar: 1 })!;
    expect(part.length).toBe(4);
    expect(part.chords.reduce((sum, chord) => sum + chord.durationBeats, 0)).toBe(16);
  });
});

const at = "2026-10-04T00:00:00.000Z";
type Event = { bar: number; beat: number; dur: number; chord: ChordSymbol; notes?: number[] };
const sym = (label: string) => parseTextChordLabel(label)!;
function block(id: string, events: Event[], extra: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock {
  return {
    id, summaryText: "", tags: [], capturedAt: at, analyzerVersion: "synthetic",
    chords: events.map((event, index) => ({
      eventId: `${id}-${index}`, confidence: 1, alternatives: [], warnings: [], bar: event.bar, beat: event.beat,
      durationBeats: event.dur, chord: event.chord,
      ...(event.notes ? { voicingMemory: { practiceVoicingOverride: { schemaVersion: 1, source: "manual", representation: "simultaneous-voicing", capturedForChordKey: "x", midiNotes: event.notes } } } : {}),
    })) as SavedProgressionBlock["chords"],
    ...extra,
  };
}
const ideaOf = (blocks: SavedProgressionBlock[], key = "C major") => ({ id: "i", title: "合成", key, progressionBlocks: blocks } as unknown as SongIdea);
const eightBars = (notesOf?: (label: string) => number[] | undefined, dur = 4): Event[] =>
  ["C", "Am", "Dm7", "G7", "C", "Am", "Dm7", "G7"].map((label, index) => ({ bar: index + 1, beat: 1, dur, chord: sym(label), notes: notesOf?.(label) }));

describe("自分の進行", () => {
  it("cuts stretches of whole bars from a bar line, 4 and 8 bars from 8 bars", () => {
    const scan = scanCollection([ideaOf([block("b1", eightBars())])]);
    const fours = scan.segments.filter((segment) => segment.length === 4).map((segment) => segment.firstBar);
    expect(fours).toEqual([1, 2, 3, 4, 5]);
    expect(scan.segments.filter((segment) => segment.length === 8).map((segment) => segment.firstBar)).toEqual([1]);
    expect(scan.segments.some((segment) => segment.length === 16)).toBe(false);
    expect(scan.unusable).toEqual({ meter: 0, unreadable: 0 });
  });

  it("does not ask a progression whose meter is 1/4 or an eighth-note meter, and counts it instead of changing it", () => {
    const blocks = [
      block("ok", eightBars(undefined, 3), { timeSignature: "3/4" }),
      block("one", eightBars(), { timeSignature: "1/4" }),
      block("eighths", eightBars(), { timeSignature: "6/8" }),
      block("none", eightBars()),
    ];
    const scan = scanCollection([ideaOf(blocks)]);
    expect(scan.unusable.meter).toBe(2);
    const ids = new Set(scan.segments.map((segment) => segment.blockId));
    expect(ids.has("ok")).toBe(true);
    expect(ids.has("none")).toBe(true);
    expect(ids.has("one")).toBe(false);
    expect(ids.has("eighths")).toBe(false);
    expect(blocks[1]!.timeSignature).toBe("1/4");
  });

  it("5a: saved notes that do not pass core are judged `sounded`, and the notes sounded are the saved ones (not replaced)", () => {
    // Am7 saved as A2 C4 E4 (no 7th): core wants the 7th; C major saved well: core
    const saved: Record<string, number[]> = { C: [36, 55, 60, 64], Am: [45, 60, 64] };
    const scan = scanCollection([ideaOf([block("b1", eightBars((label) => saved[label]))])]);
    const segment = scan.segments.find((entry) => entry.length === 4 && entry.firstBar === 1)!;
    const question = buildCollectionQuestion(segment);
    expect(question.source).toBe("collection");
    expect(question.id).toBe("collection:b1:1");
    const [c, am, dm7, g7] = question.chords;
    expect(c!.notes).toEqual([36, 55, 60, 64]);
    expect(c!.judge).toBe("core");
    expect(am!.notes).toEqual([45, 60, 64]);
    expect(am!.judge).toBe("core");
    // a chord with no saved notes is sounded the way the practice sounds chords
    expect(dm7!.notes).toEqual(voiceForEar(sym("Dm7")));
    expect(g7!.judge).toBe("core");
    const bad = buildCollectionQuestion(scanCollection([ideaOf([block("b2", [
      { bar: 1, beat: 1, dur: 4, chord: sym("Am11"), notes: [45, 60, 64, 67] },
      { bar: 2, beat: 1, dur: 4, chord: sym("C"), notes: [36, 55, 60, 64] },
      { bar: 3, beat: 1, dur: 4, chord: sym("Dm7"), notes: [38, 53, 57, 60] },
      { bar: 4, beat: 1, dur: 4, chord: sym("G7"), notes: [43, 53, 59] },
    ])])]).segments[0]!);
    expect(bad.chords[0]!.judge).toBe("sounded");
    expect(bad.chords[0]!.notes).toEqual([45, 60, 64, 67]);
    expect(earJudge({ symbol: bad.chords[0]!.symbol, judge: "sounded", notes: bad.chords[0]!.notes }, [57, 72, 76, 79]).ok).toBe(true);
    expect(bad.chords.every((chord) => earJudge({ symbol: chord.symbol, judge: chord.judge, notes: chord.notes }, chord.notes).ok)).toBe(true);
  });

  it("moves the saved notes by the same amount as the chords when the key is changed, keeping their shape", () => {
    const scan = scanCollection([ideaOf([block("b1", eightBars((label) => ({ C: [36, 55, 60, 64], Am: [45, 60, 64] } as Record<string, number[]>)[label]))])]);
    const segment = scan.segments.find((entry) => entry.length === 4 && entry.firstBar === 1)!;
    const original = buildCollectionQuestion(segment);
    const moved = buildCollectionQuestion(segment, { tonic: 7 });
    expect(moved.tonic).toBe(7);
    expect(moved.keyName).toBe("G");
    moved.chords.slice(0, 2).forEach((chord, index) => {
      const before = original.chords[index]!;
      expect(chord.notes.map((note) => note - chord.notes[0]!)).toEqual(before.notes.map((note) => note - before.notes[0]!));
      expect(chord.symbol.root).toBe((before.symbol.root + 7) % 12);
    });
    expect(moved.chords[0]!.label).toBe("G");
    expect(moved.chords[1]!.label).toBe("Em");
  });

  it("does not put the name of a song in the question", () => {
    const scan = scanCollection([ideaOf([block("b1", eightBars())])]);
    const question = buildCollectionQuestion(scan.segments[0]!);
    expect(JSON.stringify(question)).not.toContain("合成");
    expect(question.name).toBeUndefined();
  });
});
