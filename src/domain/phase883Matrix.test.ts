import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExtendedTextChordLabel, parseExtendedTextProgression } from "./extendedTextProgression";
import { extendedTextPlaybackNotes } from "./extendedTextPlayback";
import { extendedTextSaveData } from "./extendedTextSave";
import { resolveTimelineItemVoicing } from "./voicing/resolveVoicing";

const fixture = JSON.parse(readFileSync(
  new URL("../../docs/phase8.8.3/product-supported-matrix.json", import.meta.url), "utf8",
)) as {
  corpusId: string;
  sourceMatrixSha256: string;
  sourceProductCommit: string;
  theoryPolicyId: string;
  rowManifestSha256: string;
  rows: Array<{ rowId: string; familyId: string; writtenLabel: string; baselineClasses: string[] }>;
};
const pcSet = (notes: readonly number[]) => new Set(notes.map(note => note % 12));

describe("P8.8.3 permanent Product-supported corpus", () => {
  it("has the pinned R provenance, row manifest, and 624 exact Product-supported rows", () => {
    const serializedRows = fixture.rows.map(row => JSON.stringify(row)).join("\n") + "\n";
    // The full fixture rows contain expected pitch classes and reasons, so hash
    // the untyped loaded rows rather than the narrowed TypeScript view.
    const hash = createHash("sha256").update(serializedRows).digest("hex");
    expect(hash).toBe("188d20de2f8e24ace39cfd616458a70ff7c2452959977ca4178d6de151edfbcc");
    expect(fixture.rowManifestSha256).toBe(hash);
    expect(fixture.sourceMatrixSha256).toBe("5255ebb8525735ada1918ad99d2a056d225300a85b6b0d9f82acd44d8b9966b0");
    expect(fixture.sourceProductCommit).toBe("c618479b88ccc44f1d749ec30416058fa27d1e23");
    expect(fixture.corpusId).toBe("p8.8.3-product-supported-r-v1");
    expect(fixture.theoryPolicyId).toBe("p8.8.3-r-literal-degree-v1");
    expect(fixture.rows).toHaveLength(624);
    expect(new Set(fixture.rows.map(row => row.rowId)).size).toBe(624);
    expect(new Set(fixture.rows.map(row => row.familyId)).size).toBe(14);
    expect(fixture.rows.filter(row => row.baselineClasses.includes("F"))).toHaveLength(0);
  });

  it.each([
    ["F13", [5, 9, 3, 2]],
    ["Dm11", [2, 5, 0, 7]],
    ["Am9/C", [9, 0, 7, 11]],
    ["B7(#9,#5)", [11, 3, 9, 2, 7]],
    ["Db7(#9)", [1, 5, 11, 4]],
    ["E7(b9)", [4, 8, 2, 5]],
    ["C7(b9,#11,b13)", [0, 4, 10, 1, 6, 8]],
  ] as const)("preserves explicitly written defining tones for %s", (label, required) => {
    const result = parseExtendedTextProgression(`| ${label} |`);
    expect(result.canConvert).toBe(true);
    const preview = extendedTextPlaybackNotes(result).map(note => note.pitch);
    const saved = extendedTextSaveData(result).chords[0]!;
    const vault = resolveTimelineItemVoicing(saved, true).midiNotes;
    for (const pc of required) {
      expect(pcSet(preview).has(pc)).toBe(true);
      expect(pcSet(vault).has(pc)).toBe(true);
    }
    expect(vault).toEqual(preview);
    if (label === "Am9/C") expect(preview[0]! % 12).toBe(0);
  });

  it.each(["Cm9", "F#9", "Eb7(#9)", "BbM7", "Bm7", "Em9", "Fm9"])(
    "accepts the direct regression label %s without silent fallback", label => {
      expect(parseExtendedTextChordLabel(label)).toBeDefined();
      expect(parseExtendedTextProgression(`| ${label} |`).canConvert).toBe(true);
    },
  );

  it.each(["C(#13)", "C7(#13)", "C(omit1)"])(
    "rejects unsupported composites %s", label => {
      expect(parseExtendedTextChordLabel(label)).toBeUndefined();
      expect(parseExtendedTextProgression(`| ${label} |`).canConvert).toBe(false);
    },
  );
});
