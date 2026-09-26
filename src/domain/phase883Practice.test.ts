import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExtendedTextProgression } from "./extendedTextProgression";
import { extendedTextSaveData } from "./extendedTextSave";
import { buildProgressionVoicingPracticeSnapshot } from "./progressionVoicingPractice/snapshot";
import { resolveProgressionPracticeVoicings } from "./progressionVoicingPractice/voicingResolution";
import type { SavedProgressionBlock } from "./types";

interface FrozenRow {
  rowId: string;
  writtenLabel: string;
  expectedRequiredPitchClasses: number[];
  expectedProhibitedPitchClasses: number[];
}
const rows = (JSON.parse(readFileSync(
  new URL("../../docs/phase8.8.3/product-supported-matrix.json", import.meta.url), "utf8",
)) as { rows: FrozenRow[] }).rows;

function snapshotFor(label: string, textDerived = true) {
  const parsed = parseExtendedTextProgression(`| ${label} |`);
  if (!parsed.canConvert) throw new Error(`Cannot parse ${label}: ${parsed.state}`);
  const data = extendedTextSaveData(parsed);
  const block: SavedProgressionBlock = {
    id: "text-practice", summaryText: data.summaryText, chords: [...data.chords],
    sourceStartBeat: 0, sourceEndBeat: 4, startBar: 1, endBar: 1, lengthBars: 1,
    bpm: 120, timeSignature: "4/4", tags: [], capturedAt: "2000-01-01T00:00:00.000Z",
    analyzerVersion: textDerived ? "text-progression-v1" : "test-midi",
    ...(textDerived ? { textSource: data.textSource } : {}),
  };
  return buildProgressionVoicingPracticeSnapshot({
    sourceReference: { ideaId: "test", blockId: block.id }, block, selection: "basic-full",
  });
}

describe("P8.8.3 text-derived basic-full", () => {
  it("retains every frozen defining pitch class in Generated Voicing Loop", () => {
    const errors: string[] = [];
    for (const row of rows) {
      const built = snapshotFor(row.writtenLabel);
      if (!built.ok) { errors.push(`${row.rowId}: snapshot ${built.error.code}`); continue; }
      const event = resolveProgressionPracticeVoicings(built.snapshot).events[0];
      if (event?.status !== "SUPPORTED") { errors.push(`${row.rowId}: ${event?.status}`); continue; }
      const pcs = [...new Set(event.voicing.midiNotes.map(note => note % 12))];
      const missing = row.expectedRequiredPitchClasses.filter(pc => !pcs.includes(pc));
      const prohibited = row.expectedProhibitedPitchClasses.filter(pc => pcs.includes(pc));
      if (missing.length || prohibited.length || event.voicing.origin !== "basic-full") {
        errors.push(`${row.rowId}: missing=${missing} prohibited=${prohibited}`);
      }
    }
    expect(errors.slice(0, 20), `${errors.length} practice mismatches`).toEqual([]);
  });

  it("marks only text-derived snapshots with the new policy", () => {
    const text = snapshotFor("F13");
    const midi = snapshotFor("F13", false);
    expect(text.ok && text.snapshot.textDerivedPolicyId).toBe("text-defining-basic-full-v1");
    expect(midi.ok && midi.snapshot.textDerivedPolicyId).toBeUndefined();
  });
});
