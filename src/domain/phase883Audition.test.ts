import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExtendedTextProgression } from "./extendedTextProgression";
import { extendedTextPlaybackNotes } from "./extendedTextPlayback";
import { extendedTextSaveData } from "./extendedTextSave";
import { resolveTimelineItemVoicing, resolveTimelineVoicings } from "./voicing/resolveVoicing";
import { TEXT_CHORD_TONES_POLICY_ID, voiceTextChordForAudition } from "./textChordTones";

interface FrozenRow {
  rowId: string;
  writtenLabel: string;
  expectedRequiredPitchClasses: number[];
  expectedProhibitedPitchClasses: number[];
  expectedBassPitchClass: number | null;
}
const rows = (JSON.parse(readFileSync(
  new URL("../../docs/phase8.8.3/product-supported-matrix.json", import.meta.url), "utf8",
)) as { rows: FrozenRow[] }).rows;
const pcs = (notes: readonly number[]) => [...new Set(notes.map(note => note % 12))];

describe("P8.8.3 text confirmation audition", () => {
  it("keeps all defining tones from Preview through text-card save/reload for the frozen corpus", () => {
    const errors: string[] = [];
    for (const row of rows) {
      const parsed = parseExtendedTextProgression(`| ${row.writtenLabel} |`);
      if (!parsed.canConvert) { errors.push(`${row.rowId}: parse ${parsed.state}`); continue; }
      const preview = extendedTextPlaybackNotes(parsed).map(note => note.pitch);
      const saved = extendedTextSaveData(parsed);
      const reloaded = JSON.parse(JSON.stringify(saved.chords[0]));
      const vault = resolveTimelineItemVoicing(reloaded, true).midiNotes;
      const whole = resolveTimelineVoicings([{ ...reloaded, eventId: row.rowId }], true)[row.rowId];
      const pitchClasses = pcs(preview);
      const missing = row.expectedRequiredPitchClasses.filter(pc => !pitchClasses.includes(pc));
      const prohibited = row.expectedProhibitedPitchClasses.filter(pc => pitchClasses.includes(pc));
      if (missing.length || prohibited.length || preview.join(",") !== vault.join(",") || preview.join(",") !== whole?.join(",")
        || new Set(preview).size !== preview.length
        || row.expectedBassPitchClass !== null && preview[0]! % 12 !== row.expectedBassPitchClass) {
        errors.push(`${row.rowId}: missing=${missing} prohibited=${prohibited} preview/vault=${preview.join(",") === vault.join(",")}`);
      }
    }
    expect(errors.slice(0, 20), `${errors.length} text audition mismatches`).toEqual([]);
    expect(TEXT_CHORD_TONES_POLICY_ID).toBe("text-chord-tones-v1");
  });

  it("is context-free and uses slash bass as the lowest note", () => {
    const parsed = parseExtendedTextProgression("| Am9/C Dm11 Am9/C |");
    expect(parsed.canConvert).toBe(true);
    const first = voiceTextChordForAudition(parsed.harmonicSpans[0]!.chord);
    const last = voiceTextChordForAudition(parsed.harmonicSpans[2]!.chord);
    expect(first).toEqual(last);
    expect(first[0]).toBe(Math.min(...first));
    expect(first[0]! % 12).toBe(0);
  });
});
