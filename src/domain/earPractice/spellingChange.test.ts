import { describe, expect, it } from "vitest";
import { formatChordSymbol, parseTextChordLabel } from "../chords";
import { ALL_BANK } from "./bank";
import { degreePitchClass, parseDegreeToken, type DegreeToken } from "./degrees";
import { earKeyName, keySpelling, type EarMode } from "./keys";
import { earChordLevel } from "./levels";
import { chordFromDegreeToken, degreeName } from "./spelling";
import { voiceForEar } from "./voicing";

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];

/** What the app wrote before this change (flats for a ♭ degree, sharps for a ♯ one, otherwise the key's habit). */
function oldChord(token: string, tonic: number, mode: EarMode) {
  const parsed: DegreeToken = parseDegreeToken(token);
  const spelling = parsed.accidental !== 0 ? (parsed.accidental < 0 ? "flat" : "sharp")
    : parsed.bass && parsed.bass.accidental !== 0 ? (parsed.bass.accidental < 0 ? "flat" : "sharp") : keySpelling(tonic, mode);
  const names = spelling === "flat" ? FLAT : SHARP;
  const root = names[degreePitchClass(tonic, parsed)]!;
  const bass = parsed.bass ? names[degreePitchClass(tonic, parsed.bass)]! : undefined;
  const symbol = parseTextChordLabel(`${root}${parsed.suffix}${bass ? `/${bass}` : ""}`)!;
  return { ...symbol, label: formatChordSymbol(symbol, { accidentalPreference: spelling }) };
}

/** Every chord of every progression of the data, in each of the 12 keys of its mode. */
const ALL: Array<{ id: string; token: string; tonic: number; mode: EarMode }> = ALL_BANK.flatMap((entry) =>
  entry.bars.flat().flatMap((token) => Array.from({ length: 12 }, (_, tonic) => ({ id: entry.id, token, tonic, mode: entry.mode }))));

const rootOf = (label: string) => /^[A-G][#b]?/.exec(label)![0];
const bassOf = (label: string) => /\/([A-G][#b]?)$/.exec(label)?.[1];
const parts = (name: string) => ({ letter: name[0]!, alter: name.length === 1 ? 0 : name[1] === "#" ? 1 : -1 });

describe("コード名の綴り(P16-spelling-fix): 度数から文字、高さから ♯/♭", () => {
  const label = (token: string, tonic: number, mode: EarMode) => chordFromDegreeToken(token, tonic, mode).label;

  it("決定書の表の7つ", () => {
    expect(label("V/VII", 2, "minor")).toBe("A/C#"); // D minor
    expect(label("VIIdim7", 2, "minor")).toBe("C#dim7");
    expect(label("Im/bIII", 6, "minor")).toBe("F#m/A"); // F♯m
    expect(label("bVII", 8, "minor")).toBe("F#"); // G♯m
    expect(label("bVI", 3, "minor")).toBe("B"); // E♭m: C♭ is B
    expect(label("IIm/bII", 11, "major")).toBe("C#m/C"); // B major
    expect(label("VII7", 6, "major")).toBe("F7"); // F♯ major: E♯ is F
  });

  it("本文の例: C♯m の Im7/bVII は C♯m7/B、G マイナーの V7/VII は D7/F♯", () => {
    expect(label("Im7/bVII", 1, "minor")).toBe("C#m7/B");
    expect(label("V7/VII", 7, "minor")).toBe("D7/F#");
  });

  it("全部のコード × 12のキー: 根音とベースの文字が「主音の文字 + 度数」と一致する(E♯・B♯・C♭・F♭・重い記号を置き換えたものを除く)。そういう名前は残らない", () => {
    const mismatches: string[] = [];
    let replaced = 0;
    for (const { id, token, tonic, mode } of ALL) {
      const parsed = parseDegreeToken(token);
      const chord = chordFromDegreeToken(token, tonic, mode);
      const tonicLetter = LETTERS.indexOf(earKeyName(tonic, mode)[0]!);
      const check = (name: string, ref: { degree: number; accidental: number }, what: string) => {
        expect(name).toMatch(/^[A-G][#b]?$/);
        const { letter, alter } = parts(name);
        const expectedLetter = LETTERS[(tonicLetter + ref.degree - 1) % 7]!;
        let expectedAlter = degreePitchClass(tonic, ref as never) - NATURAL[LETTERS.indexOf(expectedLetter)]!;
        if (expectedAlter > 6) expectedAlter -= 12;
        if (expectedAlter < -6) expectedAlter += 12;
        const heavy = Math.abs(expectedAlter) >= 2 || (expectedAlter === 1 && "EB".includes(expectedLetter)) || (expectedAlter === -1 && "CF".includes(expectedLetter));
        if (heavy) { replaced += 1; return; }
        if (letter !== expectedLetter || alter !== expectedAlter) mismatches.push(`${id} ${token} in ${earKeyName(tonic, mode)} ${what}: ${name} (wanted ${expectedLetter}${expectedAlter})`);
      };
      check(rootOf(chord.label), parsed, "root");
      if (parsed.bass) check(bassOf(chord.label)!, parsed.bass, "bass");
      // no name that is E#, B#, Cb, Fb or a double sign is left
      for (const name of [rootOf(chord.label), bassOf(chord.label)].filter((value): value is string => value !== undefined)) {
        expect(["E#", "B#", "Cb", "Fb"]).not.toContain(name);
      }
      expect(chord.label).not.toMatch(/##|bb|𝄪|𝄫|x/);
      // the name is the pitch it should be
      expect(chord.root).toBe(degreePitchClass(tonic, parsed));
    }
    expect(mismatches).toEqual([]);
    expect(replaced).toBeGreaterThan(0);
  });

  it("マイナーキーの主和音(Im とその分数・テンション付き)の根音が、キー名の主音と同じ綴り(F♯m で G♭m が出ない)", () => {
    for (let tonic = 0; tonic < 12; tonic += 1) {
      const key = earKeyName(tonic, "minor").slice(0, -1);
      for (const token of ["Im", "Im7", "Im9", "Im/bIII", "Im7/bVII", "Im6"]) {
        expect(rootOf(label(token, tonic, "minor")), `${token} in ${key}m`).toBe(key);
      }
      expect(degreeName(tonic, "minor", { accidental: 0, degree: 1 })).toBe(key);
    }
    // the same for a major key
    for (let tonic = 0; tonic < 12; tonic += 1) {
      for (const token of ["I", "Imaj7", "I6", "I7"]) expect(rootOf(label(token, tonic, "major"))).toBe(earKeyName(tonic, "major"));
    }
  });

  it("綴りが変わっても、コードの高さ・種類・テンション・ベース・レベル・鳴らす音は同じ。変わるのは名前の文字だけ", () => {
    let changed = 0;
    const changedIds = new Set<string>();
    for (const { id, token, tonic, mode } of ALL) {
      const before = oldChord(token, tonic, mode);
      const after = chordFromDegreeToken(token, tonic, mode);
      const { label: beforeLabel, ...beforeRest } = before;
      const { label: afterLabel, ...afterRest } = after;
      expect(afterRest).toEqual(beforeRest);
      expect(earChordLevel(after, { tonic, mode })).toBe(earChordLevel(before, { tonic, mode }));
      expect(voiceForEar(after)).toEqual(voiceForEar(before));
      if (beforeLabel !== afterLabel) {
        changed += 1;
        changedIds.add(id);
      }
    }
    expect(changed).toBeGreaterThan(0);
  });
});
