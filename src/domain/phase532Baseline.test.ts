import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PROGRESSION_VOICING_PRACTICE_SNAPSHOT_VERSION,
  resolveProgressionPracticeVoicings,
  type DetachedPracticeVoicing,
  type ProgressionVoicingPracticeSnapshot,
  type ProgressionVoicingSelection,
} from "./progressionVoicingPractice";

const selections = [
  "source-midi", "custom", "basic-shell", "basic-full", "rootless-shell", "full-shell", "left-hand",
] as const satisfies readonly ProgressionVoicingSelection[];

function snapshot(
  selection: ProgressionVoicingSelection,
  voicing?: DetachedPracticeVoicing,
  slash = false,
): ProgressionVoicingPracticeSnapshot {
  return {
    version: PROGRESSION_VOICING_PRACTICE_SNAPSHOT_VERSION,
    fingerprint: `p532-audit-${selection}`,
    source: { kind: "vault", reference: { ideaId: "audit", blockId: "baseline" } },
    selection,
    key: "C major",
    bpm: 100,
    meter: { numerator: 4, denominator: 4 },
    lengthBeats: 4,
    events: [{
      id: "event-1",
      startBeat: 0,
      durationBeats: 4,
      chord: slash
        ? { root: 9, quality: "min11", tensions: [], bass: 11, label: "Am11/B" }
        : { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
      ...(voicing ? { voicing } : {}),
    }],
    spans: [{ kind: "chord", startBeat: 0, durationBeats: 4, eventIndex: 0 }],
  };
}

describe("P5.32 Stage00 integrated baseline", () => {
  it("locks the internal resolver inventory without generated fallback", () => {
    for (const selection of selections) {
      const exact = selection === "source-midi" || selection === "custom"
        ? { kind: selection, midiNotes: [48, 52, 55, 59] } as const
        : undefined;
      const result = resolveProgressionPracticeVoicings(snapshot(selection, exact)).events[0]!;
      expect(result.status, selection).toBe("SUPPORTED");
      if (result.status === "SUPPORTED" && exact) {
        expect(result.voicing.origin).toBe(selection);
        expect(result.voicing.midiNotes).toEqual(exact.midiNotes);
        expect(result.voicing.midiNotes).not.toBe(exact.midiNotes);
      }
    }
  });

  it("keeps approved slash bass separate from Left-hand fingering targets", () => {
    const input = snapshot("left-hand", undefined, true);
    const result = resolveProgressionPracticeVoicings(input).events[0]!;
    expect(result.status).toBe("SUPPORTED");
    if (result.status !== "SUPPORTED") return;
    expect(result.voicing.referenceBassNote).toBeDefined();
    expect(result.voicing.midiNotes).not.toContain(result.voicing.referenceBassNote);
    expect(input.events[0]!.chord).toMatchObject({ label: "Am11/B", bass: 11 });
  });

  it("keeps Source and Custom pitches immutable while resolving metadata", () => {
    for (const kind of ["source-midi", "custom"] as const) {
      const midiNotes = [49, 55, 60, 64];
      const before = [...midiNotes];
      const result = resolveProgressionPracticeVoicings(snapshot(kind, { kind, midiNotes })).events[0]!;
      expect(midiNotes).toEqual(before);
      expect(result.status === "SUPPORTED" && result.voicing.midiNotes).toEqual(before);
    }
  });

  it("loads the supplied guide fixtures as bounded one-hand physical voicings", () => {
    const golden = JSON.parse(readFileSync(
      new URL("../../docs/phase5.32/fixtures/fingering-golden-fixtures.json", import.meta.url),
      "utf8",
    )) as Record<string, Array<{ hand: "right" | "left"; midi: number[]; preferred: number[] }>>;
    const entries = Object.values(golden).flat();
    expect(entries).toHaveLength(10);
    for (const entry of entries) {
      expect(entry.midi).toHaveLength(entry.preferred.length);
      expect(new Set(entry.midi).size).toBe(entry.midi.length);
      expect(entry.midi).toEqual([...entry.midi].sort((a, b) => a - b));
      expect(entry.preferred).toEqual([...entry.preferred].sort((a, b) =>
        entry.hand === "right" ? a - b : b - a));
    }
    expect([1, 2, 3, 4, 5].map((count) => choose(5, count))).toEqual([5, 10, 10, 5, 1]);
  });
});

function choose(total: number, count: number): number {
  let result = 1;
  for (let index = 1; index <= count; index += 1) result = result * (total - index + 1) / index;
  return result;
}
