import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExtendedTextChordLabel } from "./extendedTextProgression";
import { chordPitchClasses } from "./chordVoicing";
import { parseChordLabel } from "./chords";

interface FrozenRow {
  rowId: string;
  writtenLabel: string;
  expectedRequiredPitchClasses: number[];
  expectedProhibitedPitchClasses: number[];
  expectedBassPitchClass: number | null;
}
const fixture = JSON.parse(readFileSync(
  new URL("../../docs/phase8.8.3/product-supported-matrix.json", import.meta.url), "utf8",
)) as { rows: FrozenRow[] };

describe("P8.8.3 Product-supported text semantics", () => {
  it("preserves every defining degree and rejects every prohibited degree in all frozen rows", () => {
    const errors: string[] = [];
    for (const row of fixture.rows) {
      const chord = parseExtendedTextChordLabel(row.writtenLabel);
      if (!chord) { errors.push(`${row.rowId}: rejected`); continue; }
      const pcs = chordPitchClasses(chord);
      const missing = row.expectedRequiredPitchClasses.filter(pc => !pcs.includes(pc));
      const prohibited = row.expectedProhibitedPitchClasses.filter(pc => pcs.includes(pc));
      const bass = row.expectedBassPitchClass;
      if (missing.length || prohibited.length || bass !== null && chord.bass !== bass) {
        errors.push(`${row.rowId}: missing=${missing} prohibited=${prohibited} bass=${chord.bass}`);
      }
    }
    expect(errors.slice(0, 20), `${errors.length} semantic mismatches`).toEqual([]);
  });

  it("does not alter the Product/MIDI legacy parser", () => {
    expect(parseChordLabel("C11o")).toMatchObject({ quality: "dim", tensions: ["11"] });
    expect(parseChordLabel("C7(#9,13)")?.quality).toBe("dom13");
  });
});
