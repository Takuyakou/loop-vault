import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../../domain/chords";
import { TEXT_PROGRESSION_ANALYZER_VERSION } from "../../domain/textProgression";
import type { ChordTimelineItem, SavedProgressionBlock, SongIdea } from "../../domain/types";
import { progressionSourceKind } from "./progressionFacts";
import { buildVaultRows } from "./vaultLibrary";
import { chordRoles, KEY_BAND, keyCellCounts, keyCellOf, keysInCell, sameMotion, selectedKeyCell } from "./vaultShape";

const chord = (label: string, bar: number): ChordTimelineItem => ({
  bar, beat: 1, durationBeats: 4, confidence: 1, alternatives: [], warnings: [], chord: parseChordLabel(label)!,
});
const block = (id: string, labels: string[], extra: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock => ({
  id, summaryText: "", chords: labels.map((label, index) => chord(label, index + 1)), tags: [],
  capturedAt: "2026-07-15T00:00:00.000Z", analyzerVersion: "test", ...extra,
});
const idea = (id: string, blocks: SavedProgressionBlock[]): SongIdea => ({
  id, title: id, progressionBlocks: blocks, assets: [], tags: [], status: "idea", createdAt: "2026-07-15T00:00:00.000Z", updatedAt: "2026-07-15T00:00:00.000Z",
} as unknown as SongIdea);

describe("P23-10 key band (V1・C3)", () => {
  it("has 12 majors from C and 12 minors from A, round the circle of fifths", () => {
    expect(KEY_BAND.major.map((cell) => cell.label)).toEqual(["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"]);
    expect(KEY_BAND.minor.map((cell) => cell.label)).toEqual(["Am", "Em", "Bm", "F♯m", "C♯m", "G♯m", "D♯m", "B♭m", "Fm", "Cm", "Gm", "Dm"]);
  });

  it("puts every spelling of a key in one cell and leaves keyless progressions out", () => {
    expect(keyCellOf("Eb major")).toBe("major:3");
    expect(keyCellOf("D# major")).toBe("major:3");
    expect(keyCellOf("F# minor")).toBe("minor:6");
    expect(keyCellOf("Am")).toBe("minor:9");
    expect(keyCellOf(undefined)).toBeUndefined();
    expect(keyCellOf("not a key")).toBeUndefined();
    const counts = keyCellCounts(new Map([["Eb major", 2], ["D# major", 1], ["C major", 4], ["", 3]]));
    expect(counts.get("major:3")).toBe(3);
    expect(counts.get("major:0")).toBe(4);
    expect([...counts.keys()].sort()).toEqual(["major:0", "major:3"]);
  });

  it("chooses every saved spelling of the cell, and reads back the one cell chosen", () => {
    expect(keysInCell("major:3", ["Eb major", "D# major", "C major"])).toEqual(["Eb major", "D# major"]);
    expect(selectedKeyCell(["Eb major", "D# major"])).toBe("major:3");
    expect(selectedKeyCell(["Eb major", "C major"])).toBeUndefined();
    expect(selectedKeyCell([])).toBeUndefined();
  });
});

describe("P23-10 role colours (V2・C3)", () => {
  it("gives T / SD / D from the key and nothing without one", () => {
    expect(chordRoles(block("b", ["Dm7", "G7", "Cmaj7"]), "C major")).toEqual(["SD", "D", "T"]);
    expect(chordRoles(block("b", ["Dm7", "G7", "Cmaj7"]), undefined)).toEqual(["", "", ""]);
  });
});

describe("P23-10 same motion (V7)", () => {
  it("finds the progressions with the same degrees in another key, not itself and not keyless ones", () => {
    const rows = buildVaultRows([
      idea("c", [block("c", ["Dm7", "G7", "Cmaj7"], { detectedKey: "C major" })]),
      idea("f", [block("f", ["Gm7", "C7", "Fmaj7"], { detectedKey: "F major" })]),
      idea("other", [block("o", ["Cmaj7", "Am7"], { detectedKey: "C major" })]),
      idea("keyless", [block("k", ["Dm7", "G7", "Cmaj7"])]),
    ]);
    const [c, f] = rows;
    expect(sameMotion(c!, rows).map((row) => row.id)).toEqual(["f:f"]);
    expect(sameMotion(f!, rows).map((row) => row.id)).toEqual(["c:c"]);
    expect(sameMotion(rows[3]!, rows)).toEqual([]);
  });
});

describe("P23-10 V10 text progressions say テキスト", () => {
  it("reads the text parser's analyzer version as well as the extended text source", () => {
    expect(progressionSourceKind(block("t", ["C"], { analyzerVersion: TEXT_PROGRESSION_ANALYZER_VERSION }))).toBe("text");
    expect(progressionSourceKind(block("x", ["C"], { textSource: {} as SavedProgressionBlock["textSource"] }))).toBe("text");
    expect(progressionSourceKind(block("m", ["C"], { analyzerVersion: "phase4-v1" }))).toBe("midi");
    expect(progressionSourceKind(block("l", ["C"], { origin: "live-midi", analyzerVersion: TEXT_PROGRESSION_ANALYZER_VERSION }))).toBe("live-midi");
  });
});
