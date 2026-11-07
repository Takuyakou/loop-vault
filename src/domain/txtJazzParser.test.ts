import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatChordSymbol, formatTextChordSymbol, makeChordSymbol, parseChordLabel, parseTextChordLabel } from "./chords";
import { parseExtendedTextChordLabel, parseExtendedTextProgression } from "./extendedTextProgression";
import { TEXT_PROGRESSION_MAX_BARS, TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS, TEXT_PROGRESSION_MAX_TOKENS, parseTextProgression, evaluateTextProgressionCapabilities, confirmedTextProgressionKeyState } from "./textProgression";
import { EXTENDED_TEXT_LIMITS } from "./extendedTextBudgets";
import { normalizeScoreChord, normalizeScoreSource } from "./textScoreTokenizer";
import { normalizedChordKey } from "./voicing/normalizeVoicing";
import { chordIdentityKey, normalizeChordSymbol } from "./chordIdentity";
import { getCanonicalKey } from "./practiceTransposition/keyCatalog";
import { transposeChordSymbol } from "./practiceTransposition/transposeChordSymbol";
import { degreeForChord, preservesRomanNumeral } from "./practiceTransposition/transposeRomanNumerals";
import { chordsEqual } from "./progressionEditing/chordReplacement";
import { parseFastChordEntry } from "./progressionEditing/fastLabelEntry";
import type { ChordQuality, Tension } from "./types";

interface AliasGroup { tokens: string[]; quality: ChordQuality; tensions?: Tension[]; canonical?: string }
const groups: AliasGroup[] = [
  { tokens: ["Cm(maj7)","CmMaj7","Cm(Maj7)","CmM7","Cm(M7)","CmΔ7","Cm(Δ7)","Cm△7","C-maj7","C-(maj7)","C-Δ7","Cmin(maj7)","CminMaj7","Cm（maj7）","Ｃｍ（ｍａｊ７）"], quality: "minMaj7", canonical: "Cm(maj7)" },
  { tokens: ["Cm(maj9)","CmM9","CmΔ9","C-(maj9)"], quality: "minMaj7", tensions: ["9"], canonical: "Cm(maj9)" },
  { tokens: ["Cm7b5","Cm7(b5)","Cø","Cø7","C-7b5","CØ7"], quality: "min7b5" },
  { tokens: ["Cdim7","C°7","Co7","Cº7"], quality: "dim7" },
  { tokens: ["C7b9","C7(b9)"], quality: "dom7", tensions: ["b9"] },
  { tokens: ["C7#9","C7(#9)"], quality: "dom7", tensions: ["#9"] },
  { tokens: ["C7#11","C7(#11)"], quality: "dom7", tensions: ["#11"] },
  { tokens: ["C7b13","C7(b13)"], quality: "dom7", tensions: ["b13"] },
  { tokens: ["C7(b9,#9)","C7（b9，#9）"], quality: "dom7", tensions: ["b9","#9"] },
  { tokens: ["C7(b9,b13)"], quality: "dom7", tensions: ["b9","b13"] },
  { tokens: ["C7(#9,b13)"], quality: "dom7", tensions: ["#9","b13"] },
  { tokens: ["C7(b9,#11)"], quality: "dom7", tensions: ["b9","#11"] },
  { tokens: ["C9","C7(9)"], quality: "dom9" },
  { tokens: ["C13","C7(13)"], quality: "dom13" },
  { tokens: ["C7sus4","C7sus"], quality: "dom7sus4" },
  { tokens: ["C9sus4","C9sus"], quality: "dom7sus4", tensions: ["9"] },
  { tokens: ["C6/9","C69","C6(9)","C6／9"], quality: "sixNine" },
  { tokens: ["Cmaj7","CM7","CΔ7","C△7","CΔ"], quality: "maj7" },
  { tokens: ["Cmaj7#11","Cmaj7(#11)"], quality: "maj7", tensions: ["#11"] },
  { tokens: ["Cm6","Cmi6","Cmin6","C-6"], quality: "min6" },
  { tokens: ["C-","Cmi","Cmin","Cm"], quality: "min" },
  { tokens: ["C-7","Cmi7","Cmin7","Cm7","C−7","C–7"], quality: "min7" },
  { tokens: ["C-9"], quality: "min9" },
  { tokens: ["C+7","C7#5","C7(#5)","Caug7"], quality: "dom7", tensions: ["#5"] },
  { tokens: ["Cdim"], quality: "dim" },
];

describe("TXT-JAZZ text-only symbol contract", () => {
  it("checks all 103 independently specified Stage 00 inputs without replacing existing quality types", () => {
    const audit = JSON.parse(readFileSync(new URL("../../docs/txt-jazz/evidence/parser-current-tokens.json",import.meta.url),"utf8")) as {
      rows: { token:string; expected:{root?:number;quality?:string;tensions?:Tension[];alt?:boolean;bass?:number|null;reject?:boolean;preserveExisting?:boolean} }[]
    };
    expect(audit.rows).toHaveLength(103);
    const qualityNames: Record<string,ChordQuality> = {minor:"min",m7:"min7",m9:"min9",m6:"min6",m7b5:"min7b5"};
    for (const {token,expected} of audit.rows) {
      const normal = parseTextProgression(`| ${token} |`);
      const extended = parseExtendedTextProgression(`| ${token} |`);
      expect(normal.canConvert,token).toBe(!expected.reject);
      expect(extended.canConvert,token).toBe(!expected.reject);
      if (expected.reject) continue;
      let quality: ChordQuality = expected.preserveExisting ? "dim" : qualityNames[expected.quality!] ?? expected.quality as ChordQuality;
      let tensions = expected.tensions ?? [];
      // The accepted contract retains these existing rich-quality types.
      if (quality === "dom7" && tensions.join() === "9") {quality="dom9";tensions=[];}
      if (quality === "dom7" && tensions.join() === "13") {quality="dom13";tensions=[];}
      if (quality === "six" && tensions.join() === "9") {quality="sixNine";tensions=[];}
      for (const chord of [normal.events[0]?.chord,extended.harmonicSpans[0]?.chord]) {
        expect(chord,token).toMatchObject({root:expected.root ?? 0,quality});
        // Stage 00's independent table lists tensions as a set; exact persisted
        // order is covered separately by the frozen-output replay and alias tests.
        expect(chord?.tensions.slice().sort(),token).toEqual(tensions.slice().sort());
        expect(chord?.altered,token).toBe(expected.alt ? true : undefined);
        expect(chord?.bass,token).toBe(expected.bass ?? undefined);
      }
    }
  });
  for (const group of groups) for (const token of group.tokens) {
    it(`reads ${token} with the same structural meaning in both dialects`, () => {
      const normal = parseTextProgression(`| ${token} |`);
      const extended = parseExtendedTextProgression(`| ${token} |`);
      expect(normal.canConvert).toBe(true);
      expect(extended.canConvert).toBe(true);
      const expected = { root: 0, quality: group.quality, tensions: group.tensions ?? [] };
      for (const chord of [normal.events[0]?.chord, extended.harmonicSpans[0]?.chord, parseTextChordLabel(token)]) {
        expect(chord).toMatchObject(expected);
        expect(chord?.bass).toBeUndefined();
        expect(chord?.altered).toBeUndefined();
        if (group.canonical) expect(chord?.label).toBe(group.canonical);
      }
      expect(normal.events[0]?.chord.label).toBe(group.canonical ?? formatTextChordSymbol({ ...expected, label: "" }));
      // Extended's existing raw-spelling contract is intentionally retained.
      expect(extended.harmonicSpans[0]?.chord.label).toBe(group.canonical ?? normalizeScoreChord(token));
    });
  }
  for (const token of ["G7alt", "G7(alt)", "Galt", "Ｇ７ａｌｔ"]) {
    it(`retains ${token} as classification rather than explicit tensions`, () => {
      for (const chord of [parseTextChordLabel(token), parseExtendedTextChordLabel(token), parseTextProgression(`| ${token} |`).events[0]?.chord]) {
        expect(chord).toEqual({ root: 7, quality: "dom7", tensions: [], altered: true, label: "G7alt" });
      }
    });
  }
  it("retains slash bass, explicit alterations, unicode roots, and all manual synthetic vocabulary", () => {
    const cases = [
      ["Cm(maj7)/G",0,"minMaj7",[],7,"Cm(maj7)/G"],
      ["G7alt/B",7,"dom7",[],11,"G7alt/B"],
      ["G7(b9,#9,b13)",7,"dom7",["b9","#9","b13"],undefined,"G7(b9,#9,b13)"],
      ["G7(#9,b13)",7,"dom7",["#9","b13"],undefined,"G7(#9,b13)"],
      ["G7(b9,#11)",7,"dom7",["b9","#11"],undefined,"G7(b9,#11)"],
      ["G7(b9,b13)",7,"dom7",["b9","b13"],undefined,"G7(b9,b13)"],
      ["B♭7",10,"dom7",[],undefined,"Bb7"], ["Ｂ♭７",10,"dom7",[],undefined,"Bb7"],
      ["G♭7♯9",6,"dom7",["#9"],undefined,"F#7(#9)"],
      ["Dm7b5",2,"min7b5",[],undefined,"Dm7b5"], ["Fm7",5,"min7",[],undefined,"Fm7"],
      ["E♭maj7",3,"maj7",[],undefined,"Ebmaj7"], ["A♭maj7",8,"maj7",[],undefined,"Abmaj7"],
      ["E♭13",3,"dom13",[],undefined,"Eb13"], ["B♭maj7",10,"maj7",[],undefined,"Bbmaj7"],
    ] as const;
    for (const [token, root, quality, tensions, bass, label] of cases) {
      for (const parsed of [parseTextProgression(`| ${token} |`).events[0]?.chord, parseExtendedTextProgression(`| ${token} |`).harmonicSpans[0]?.chord]) {
        expect(parsed, token).toMatchObject({ root, quality, tensions });
        expect(parsed?.bass).toBe(bass);
        expect(parsed?.altered).toBe(token.includes("alt") ? true : undefined);
      }
      expect(parseTextChordLabel(token)?.label).toBe(label);
    }
  });
  it("normalizes idempotently without changing case, 6/9 or UTF-16 offsets", () => {
    for (const token of ["Ｂ♭７", "G♭7♯9", "C−7", "C–7", "Cm（maj7）", "Ｃｍ（ｍａｊ７）", "C6／9", "CØ7", "Cº7", "C△7", "CmΔ7", "CM7", "Cm7"]) {
      const normalized = normalizeScoreSource(token);
      expect(normalizeScoreSource(normalized)).toBe(normalized);
      expect(normalized.length).toBe(token.length);
    }
    expect(normalizeScoreSource("CM7 Cm7 C6/9")).toBe("CM7 Cm7 C6/9");
    const source = "| Ｃｍ（ｍａｊ７） | G7alt |";
    const parsed = parseTextProgression(source);
    expect(parsed.canConvert).toBe(true);
    for (const event of parsed.events) expect(source.slice(event.range.start,event.range.end)).toBe(event.raw);
  });
  it("rejects unknown and split-alt tokens at original source positions without partial saves", () => {
    for (const token of ["Cm/maj7", "G7 alt", "D/C7", "G7alt(b9)", "G7alt(omit5)"]) {
      const source = `| Cmaj7 | ${token} |`;
      const normal = parseTextProgression(source);
      const extended = parseExtendedTextProgression(source);
      expect(normal.canConvert, token).toBe(false);
      expect(extended.canConvert, token).toBe(false);
      expect(normal.diagnostics.some(d => d.range.start >= 9 && d.range.end > d.range.start)).toBe(true);
      expect(extended.diagnostics.some(d => d.span.start >= 9 && d.span.end > d.span.start)).toBe(true);
    }
  });
  it("keeps legacy MIDI vocabulary and display unchanged", () => {
    for (const token of ["G7alt", "Cm(maj7)", "Cø7", "C°7", "C+7", "Cmi6"]) expect(parseChordLabel(token)).toBeNull();
    expect(formatChordSymbol(makeChordSymbol(0,"minMaj7"))).toBe("CmMaj7");
    expect(formatChordSymbol(makeChordSymbol(0,"minMaj7",["9"]))).toBe("CmMaj7(9)");
    expect(parseChordLabel("Cdim")?.quality).toBe("dim");
    expect(parseFastChordEntry("G7alt")?.altered).toBe(true);
    expect(parseFastChordEntry("CM7")?.quality).toBe("maj7");
    expect(parseFastChordEntry("ii7","C major")?.quality).toBe("min7");
  });
  it("distinguishes alt in every shared identity while retaining old identity strings", () => {
    const alt = parseTextChordLabel("G7alt")!;
    const dom = makeChordSymbol(7,"dom7");
    const explicit = parseTextChordLabel("G7(b9,#9,b13)")!;
    expect(normalizedChordKey(dom)).toBe("7:dom7:-:-");
    expect(normalizedChordKey(alt)).toBe("7:dom7:-:-:alt");
    expect(new Set([alt,dom,explicit].map(normalizedChordKey)).size).toBe(3);
    expect(chordIdentityKey(normalizeChordSymbol(dom))).toBe("7|major|minor7|||-");
    expect(chordIdentityKey(normalizeChordSymbol(alt))).not.toBe(chordIdentityKey(normalizeChordSymbol(dom)));
    expect(chordsEqual(alt,dom)).toBe(false);
  });
  it("preserves classification, canonical text spelling, and degree identity in all twelve keys", () => {
    const sourceKey = getCanonicalKey(0,"major");
    for (const token of ["G7alt", "G7alt/B", "G7(b9,b13)", "Cm(maj7)", "Cm(maj9)"]) {
      const source = parseTextChordLabel(token)!;
      for (let pc = 0; pc < 12; pc += 1) {
        const targetKey = getCanonicalKey(pc,"major");
        const target = transposeChordSymbol(source,sourceKey,targetKey);
        expect(target.altered).toBe(source.altered);
        expect(target.tensions).toEqual(source.tensions);
        expect(target.root).toBe((source.root + pc) % 12);
        expect(target.bass).toBe(source.bass === undefined ? undefined : (source.bass + pc) % 12);
        expect(parseTextChordLabel(target.label)).toMatchObject({ root: target.root, quality: target.quality, tensions: target.tensions });
        expect(parseTextChordLabel(target.label)?.altered).toBe(source.altered);
        expect(preservesRomanNumeral(source,sourceKey,target,targetKey)).toBe(true);
        if (source.altered) expect(degreeForChord(target,targetKey)?.label).toContain("alt");
      }
    }
  });
  it("retains current independent intake budgets and refuses alt at Context-dependent entrances", () => {
    expect([TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS,TEXT_PROGRESSION_MAX_BARS,TEXT_PROGRESSION_MAX_TOKENS]).toEqual([8192,32,128]);
    expect(EXTENDED_TEXT_LIMITS).toMatchObject({maxInputCodeUnits:65536,maxBars:256});
    expect(parseTextProgression("|"+Array(32).fill("G7alt").join("|")+"|").canConvert).toBe(true);
    expect(parseTextProgression("|"+Array(33).fill("G7alt").join("|")+"|").canConvert).toBe(false);
    expect(parseExtendedTextProgression("|"+Array(256).fill("G7alt").join("|")+"|").canConvert).toBe(true);
    expect(parseExtendedTextProgression("|"+Array(257).fill("G7alt").join("|")+"|").canConvert).toBe(false);
    const result = parseTextProgression("| G7alt |",{keyState:confirmedTextProgressionKeyState("C major")});
    const capabilities = evaluateTextProgressionCapabilities({ result, bpm:120, rootMotionNoteCount:2 });
    for (const name of ["chord-context","bass-practice","root-motion"]) expect(capabilities.find(c => c.name === name)?.status).toBe("unsupported");
  });
});
