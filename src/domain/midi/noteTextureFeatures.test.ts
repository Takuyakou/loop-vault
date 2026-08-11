import { describe, expect, it } from "vitest";
import { generateP5211SyntheticNoteRoleFixtures } from "../../../scripts/p5211/noteRoleFixtures";
import {
  extractNoteTextureFeatures,
  type NoteTextureInput,
} from "./noteTextureFeatures";

describe("P5.21.1 Stage01 note texture features", () => {
  it("measures short independent top notes over a sustained lower bed", () => {
    const fixture = fixtureInput("A");
    const features = extractNoteTextureFeatures(fixture);
    const movingTop = features.filter((entry) => entry.noteId.startsWith("A-n0") && entry.noteId >= "A-n05");
    expect(movingTop).toHaveLength(4);
    for (const entry of movingTop) {
      expect(entry.isLocalTop).toBe(true);
      expect(entry.lowerSupportCount).toBeGreaterThanOrEqual(3);
      expect(entry.lowerSupportCoverage).toBe(1);
      expect(entry.durationRatioToLowerBed).toBeLessThan(0.2);
      expect(entry.onsetIndependence).toBe(1);
      expect(entry.topLineContinuity).toBeGreaterThan(0);
    }
  });

  it("protects aligned sustained tension, inversion, and long extensions", () => {
    for (const id of ["B", "C", "J"] as const) {
      const fixture = generateP5211SyntheticNoteRoleFixtures().find((entry) => entry.id === id);
      if (!fixture) throw new Error(`fixture ${id} missing`);
      const features = new Map(extractNoteTextureFeatures(fixtureInput(id)).map((entry) => [entry.noteId, entry]));
      for (const note of fixture.notes.filter((entry) => entry.protectedHarmonic)) {
        const feature = features.get(note.id);
        expect(feature?.durationRatioToLowerBed).toBe(1);
        expect(feature?.onsetIndependence).toBe(0);
        expect(feature?.sustainedExtensionProtection).toBeGreaterThanOrEqual(0.9);
      }
    }
  });

  it("does not invent lower support for a monophonic melody", () => {
    const features = extractNoteTextureFeatures(fixtureInput("H"));
    expect(features.every((entry) => entry.lowerSupportCount === 0)).toBe(true);
    expect(features.every((entry) => entry.lowerSupportCoverage === 0)).toBe(true);
    expect(features.some((entry) => entry.melodicMotionContinuity > 0)).toBe(true);
  });

  it("treats arpeggio and broken-chord texture as evidence, not a chord-dependent decision", () => {
    for (const id of ["D", "G"] as const) {
      const features = extractNoteTextureFeatures(fixtureInput(id));
      expect(features).toHaveLength(fixtureInput(id).length);
      expect(features.some((entry) => entry.lowerSupportCount > 0)).toBe(true);
      expect(features.every((entry) => Number.isFinite(entry.localTextureStability))).toBe(true);
    }
  });

  it("is deterministic under input permutation and never mutates inputs", () => {
    const input = fixtureInput("A");
    const original = structuredClone(input);
    const forward = extractNoteTextureFeatures(input);
    const reversed = extractNoteTextureFeatures([...input].reverse());
    expect(forward).toEqual(reversed);
    expect(input).toEqual(original);
  });

  it("keeps every normalized feature finite and bounded for deterministic fuzz inputs", () => {
    let seed = 0x521101;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (let sample = 0; sample < 128; sample += 1) {
      const input = Array.from({ length: 1 + Math.floor(random() * 24) }, (_, index) => {
        const startBeat = Math.floor(random() * 16 * 4) / 4;
        return {
          id: `fuzz-${sample}-${index}`,
          pitch: 24 + Math.floor(random() * 84),
          startBeat,
          endBeat: startBeat + 0.125 + Math.floor(random() * 32) / 8,
        };
      });
      const first = extractNoteTextureFeatures(input);
      const second = extractNoteTextureFeatures(input);
      expect(first).toEqual(second);
      for (const entry of first) {
        expect(entry.pitchRank).toBeGreaterThanOrEqual(0);
        expect(entry.pitchRank).toBeLessThanOrEqual(1);
        for (const value of [
          entry.lowerSupportCoverage,
          entry.durationRatioToLowerBed,
          entry.onsetIndependence,
          entry.topLineContinuity,
          entry.melodicMotionContinuity,
          entry.sustainedExtensionProtection,
          entry.localTextureStability,
        ]) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("fails closed on duplicate ids and invalid timing or pitch", () => {
    expect(() => extractNoteTextureFeatures([
      { id: "same", pitch: 60, startBeat: 0, endBeat: 1 },
      { id: "same", pitch: 64, startBeat: 0, endBeat: 1 },
    ])).toThrow("unique");
    expect(() => extractNoteTextureFeatures([{ id: "bad", pitch: Number.NaN, startBeat: 0, endBeat: 1 }]))
      .toThrow("invalid");
    expect(() => extractNoteTextureFeatures([{ id: "bad", pitch: 60, startBeat: 1, endBeat: 1 }]))
      .toThrow("invalid");
  });
});

function fixtureInput(id: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J"): NoteTextureInput[] {
  const fixture = generateP5211SyntheticNoteRoleFixtures().find((entry) => entry.id === id);
  if (!fixture) throw new Error(`fixture ${id} missing`);
  return fixture.notes.map((note) => ({
    id: note.id,
    pitch: note.pitch,
    startBeat: note.startBeat,
    endBeat: note.startBeat + note.durationBeats,
  }));
}
