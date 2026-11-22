import { describe, expect, it } from "vitest";
import { BUILTINS, buildBuiltin } from "../chordDojo/builtins";
import { ALL_BANK } from "./bank";
import { degreeFunctionKinds, degreeText, functionKind, questionInfos } from "./degreeFunction";
import { JAZZ_PROGRESSIONS_ITEMS, buildJazzProgression } from "../chordDojo/jazzProgressions";
import { progressionFunctions } from "../harmony/chordFunction";
import { buildBuiltinQuestion } from "./builtinSource";
import type { EarMode } from "./keys";
import { buildBankQuestion } from "./question";
import expected from "./earFunctions.expected.json";

/** The functions of a run of degree tokens in a mode ("" where nothing is shown). */
const functions = (tokens: string[], mode: EarMode) =>
  questionInfos({ chords: tokens.map((degree) => ({ degree })) as never, mode, tonic: 0, keyName: "C" }).map((info) => info?.fn);

describe("度数と機能(P16-06)", () => {
  // §4.2: examples written by hand from theory, applied before anything else. "" = nothing is shown.
  const GOLDEN: Array<[string, EarMode, string[], string[]]> = [
    ["ii–V–I", "major", ["IIm7", "V7", "Imaj7"], ["SD", "D", "T"]],
    ["セカンダリードミナント", "major", ["VI7", "IIm7"], ["D→Ⅱ", "SD"]],
    ["裏コード", "major", ["bII7", "Imaj7"], ["D(裏)", "T"]],
    ["裏コード(テンション付き)", "major", ["bII7(#11)", "Imaj7"], ["D(裏)", "T"]],
    ["サブドミナントマイナー", "major", ["IVm7", "Imaj7"], ["SDm", "T"]],
    ["E♭→Dm7 は裏コードと決めつけない", "major", ["bIII", "IIm7"], ["", "SD"]],
    ["3度の無い 7sus4 は裏コードにしない", "major", ["bII7sus4", "Imaj7"], ["", "T"]],
    ["マイナーの基本", "minor", ["Im", "IVm", "V7", "Im"], ["T", "SD", "D", "T"]],
    ["ナポリの和音は SD", "minor", ["bII", "V7", "Im"], ["SD", "D", "T"]],
    ["経過の dim7(上がる)", "major", ["Imaj7", "#Idim7", "IIm7", "V7"], ["T", "D→Ⅱ", "SD", "D"]],
    ["Ⅳ/Ⅴ は D", "major", ["IIm7", "IV/V", "Imaj7"], ["SD", "D", "T"]],
    ["マイナーの ♭Ⅶ7 → ♭Ⅲ", "minor", ["IVm7", "bVII7", "bIIImaj7"], ["SD", "D→♭Ⅲ", "T"]],
    ["借用の ♭Ⅵ–♭Ⅶ–Ⅰ", "major", ["bVI", "bVII", "I"], ["SDm", "SDm", "T"]],
    ["Ⅰ7 → Ⅳ", "major", ["Imaj7", "I7", "IVmaj7"], ["T", "D→Ⅳ", "SD"]],
    ["最後のコードは次を見ない", "major", ["Imaj7", "VI7"], ["T", ""]],
    ["三和音のセカンダリードミナント", "major", ["III", "VIm"], ["D→Ⅵ", "T"]],
  ];
  for (const [what, mode, tokens, want] of GOLDEN) {
    it(`§4.2 ${what}: ${tokens.join(" → ")}`, () => expect(functions(tokens, mode)).toEqual(want));
  }

  it("§4.2 の注: 何も出さないもの(メジャーの Ⅴm7・Ⅰm9・♭Ⅴmaj9、下がる dim7)", () => {
    expect(functions(["Vm7", "Imaj7"], "major")[0]).toBe("");
    expect(functions(["Im9", "Imaj7"], "major")[0]).toBe("");
    expect(functions(["bVmaj9", "Imaj7"], "major")[0]).toBe("");
    expect(functions(["IIm7", "bIIdim7", "Imaj7"], "major")[1]).toBe("");
  });

  it("1a: 出題用の進行の全コードで、度数の文字と機能が決まりの例(ear-functions.expected.json)と一致する", () => {
    const wanted = new Map(expected.progressions.map((entry) => [entry.id, entry]));
    expect(wanted.size).toBe(ALL_BANK.length);
    const mismatches: string[] = [];
    for (const entry of ALL_BANK) {
      const reference = wanted.get(entry.id)!;
      const infos = questionInfos(buildBankQuestion(entry, 0));
      const tokens = entry.bars.flat();
      expect(infos).toHaveLength(reference.chords.length);
      infos.forEach((info, index) => {
        const want = reference.chords[index]!;
        if (want.token !== tokens[index] || info?.degree !== want.degree || info?.fn !== want.function) {
          mismatches.push(`${entry.id}#${index + 1} ${tokens[index]}: ${info?.degree} / ${info?.fn} (wanted ${want.degree} / ${want.function})`);
        }
      });
    }
    expect(mismatches).toEqual([]);
  });

  it("度数は、キーが違っても同じ(出題用の進行の度数はキーに依らない)", () => {
    const entry = ALL_BANK.find((candidate) => candidate.mode === "minor" && candidate.level >= 3)!;
    const reference = questionInfos(buildBankQuestion(entry, 0));
    for (let tonic = 1; tonic < 12; tonic += 1) expect(questionInfos(buildBankQuestion(entry, tonic))).toEqual(reference);
  });

  it("度数の書き方: ローマ数字は全角、b・# は ♭・♯(度数の前・ベースの前・種類の中)", () => {
    expect(degreeText("IIm7")).toBe("Ⅱm7");
    expect(degreeText("bVII")).toBe("♭Ⅶ");
    expect(degreeText("I/III")).toBe("Ⅰ/Ⅲ");
    expect(degreeText("VI7(b9)")).toBe("Ⅵ7(♭9)");
    expect(degreeText("bII7(#11)")).toBe("♭Ⅱ7(♯11)");
    expect(degreeText("IIm7b5")).toBe("Ⅱm7♭5");
    expect(degreeText("I6/9/II")).toBe("Ⅰ6/9/Ⅱ");
    expect(degreeText("IVmMaj7")).toBe("Ⅳm" + "Maj7");
    expect(degreeText("#Idim7")).toBe("♯Ⅰdim7");
  });

  it("機能の色分け: T・SD・SDm・D(行き先付きと裏コードは D)", () => {
    expect(["T", "SD", "SDm", "D", "D→Ⅱ", "D(裏)", ""].map(functionKind)).toEqual(["T", "SD", "SDm", "D", "D", "D", ""]);
  });

  it("6: 定番の進行は、コード名とキーから度数を計算する(C の Am7 は Ⅵm7、D♭ に移調しても B♭m7 は Ⅵm7)", () => {
    const entry = BUILTINS.find((candidate) => buildBuiltinQuestion(candidate.id, 0)?.chords.some((chord) => chord.label === "Am7"))!;
    expect(entry).toBeDefined();
    const inC = buildBuiltinQuestion(entry.id, 0)!;
    const inDb = buildBuiltinQuestion(entry.id, 1)!;
    const degrees = (question: typeof inC) => questionInfos(question).map((info) => info?.degree);
    expect(degrees(inC)).toEqual(degrees(inDb));
    const at = inC.chords.findIndex((chord) => chord.label === "Am7");
    expect(degrees(inC)[at]).toBe("Ⅵm7");
    expect(inDb.chords[at]!.label).toBe("B♭m7");
    expect(degrees(inDb)[at]).toBe("Ⅵm7");
    // the functions follow the same rules as the bank's
    expect(questionInfos(inC).map((info) => info?.fn)).toEqual(questionInfos(inDb).map((info) => info?.fn));
  });

  it("5: キーが分からない進行には、度数も機能も出ない", () => {
    const entry = BUILTINS[0]!;
    const question = { ...buildBuiltinQuestion(entry.id, 0)!, keyName: "" };
    expect(questionInfos(question).every((info) => info === undefined)).toBe(true);
  });
});

describe("P22-01 §3: 度数の文字から機能を決める(degreeFunctionKinds)", () => {
  const kinds = (tokens: string[]) => degreeFunctionKinds(tokens, "major").map((entry) => entry.kind);
  const dotted = (tokens: string[]) => degreeFunctionKinds(tokens, "major").map((entry) => entry.borrowedDominant);

  it("メジャーの 5 つの進行", () => {
    expect(kinds(["ii7", "V7", "Imaj7"])).toEqual(["SD", "D", "T"]);
    expect(kinds(["IVmaj7", "V7", "iii7", "vi7"])).toEqual(["SD", "D", "T", "T"]);
    expect(kinds(["IVmaj7", "iv7", "Imaj7"])).toEqual(["SD", "SDm", "T"]);
  });

  it("セカンダリードミナントと裏コードは点線(D のまま)", () => {
    expect(kinds(["Imaj7", "VI7", "ii7", "V7"])).toEqual(["T", "D", "SD", "D"]);
    expect(dotted(["Imaj7", "VI7", "ii7", "V7"])).toEqual([false, true, false, false]);
    expect(kinds(["ii7", "♭II7", "Imaj7"])).toEqual(["SD", "D", "T"]);
    expect(dotted(["ii7", "♭II7", "Imaj7"])).toEqual([false, true, false]);
  });

  it("読めない文字は色なしで、例外を投げない", () => {
    expect(kinds(["???"])).toEqual([""]);
    expect(dotted(["???"])).toEqual([false]);
  });

  it("定番の進行と Jazz の全部で例外を投げず、度数と同じ数の結果を返す", () => {
    for (const builtin of BUILTINS) {
      const result = degreeFunctionKinds(builtin.fullDegrees, builtin.mode);
      expect(result, builtin.id).toHaveLength(builtin.fullDegrees.length);
    }
    for (const item of JAZZ_PROGRESSIONS_ITEMS) {
      for (const id of item.progressions) {
        const progression = buildJazzProgression(id);
        const result = degreeFunctionKinds(progression.degrees, "major");
        expect(result, id).toHaveLength(progression.degrees.length);
      }
    }
  });

  it("定番の進行は、C のキーでコード名から決めた機能と同じになる", () => {
    const mismatches: string[] = [];
    for (const builtin of BUILTINS) {
      const chords = buildBuiltin(builtin.id, 0).chords.map(({ chord }) => ({
        rootPc: chord.root, quality: chord.quality,
        ...(chord.tensions.length ? { tensions: chord.tensions } : {}),
        ...(chord.bass === undefined ? {} : { bassPc: chord.bass }),
      }));
      const fromChords = progressionFunctions(chords, { tonicPc: 0, mode: builtin.mode });
      const fromDegrees = degreeFunctionKinds(builtin.fullDegrees, builtin.mode);
      fromDegrees.forEach((kind, index) => {
        const other = fromChords[index]!;
        if (kind.kind !== other.kind || kind.borrowedDominant !== other.borrowedDominant) {
          mismatches.push(`${builtin.id}#${index + 1} ${builtin.fullDegrees[index]}: 度数 ${kind.kind || "色なし"}/${kind.borrowedDominant} ・ コード ${other.kind || "色なし"}/${other.borrowedDominant}`);
        }
      });
    }
    expect(mismatches).toEqual([]);
  });
});
