import { describe, expect, it } from "vitest";

import type { MidiSongData } from "../../src/domain/midi/types";
import {
  buildLocalSourceExcerpts,
  buildLocalStateEvidence,
  renderLocalSourceOnly,
} from "./localGroundTruthPacket";

const source: MidiSongData = {
  notes: [
    { pitch: 48, startTick: 48, durationTick: 192, velocity: 90, trackIndex: 0 },
    { pitch: 60, startTick: 192, durationTick: 96, velocity: 80, trackIndex: 1 },
    { pitch: 64, startTick: 288, durationTick: 96, velocity: 80, trackIndex: 1 },
  ],
  ticksPerBeat: 96,
  totalBars: 4,
  tracks: [],
  controlChanges: [],
};

describe("P5.40-00 source-only local-state packet", () => {
  it("keeps each target to one beat with crossing-note and context evidence", () => {
    const before = structuredClone(source);
    const first = buildLocalStateEvidence(source, 2, "FC-SAFETY-03-L0");
    const second = buildLocalStateEvidence(source, 3, "FC-SAFETY-03-L1");
    expect(first.targetDurationBeats).toBe(1);
    expect(first.notes.find((note) => note.midiPitch === 48)).toMatchObject({
      onsetBeats: -1, durationBeats: 1.5, carriedIntoContext: true,
    });
    expect(first.slices.find((slice) => slice.relativeBeat === 0)?.lowestMidiPitch).toBe(48);
    expect(second.slices.find((slice) => slice.relativeBeat === 0)?.attackCount).toBe(1);
    expect(source).toEqual(before);
  });

  it("renders and exports only source evidence, no candidate identity, origin, or score", () => {
    const region = buildLocalStateEvidence(source, 2, "FC-SAFETY-03-L0");
    const html = renderLocalSourceOnly([region]);
    expect(html).toContain("Target beat: 0–1");
    expect(html).toContain("MIDI pitch");
    expect(html).not.toMatch(/candidate (?:score|rank)|production label|model-a|shadow label/i);
    const excerpts = buildLocalSourceExcerpts([region], 120);
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0].bytes.length).toBeGreaterThan(0);
  });

  it("is deterministic and rejects empty or invalid local targets", () => {
    expect(buildLocalStateEvidence(source, 2, "FC-SAFETY-03-L0"))
      .toEqual(buildLocalStateEvidence(source, 2, "FC-SAFETY-03-L0"));
    expect(() => buildLocalStateEvidence(source, -1, "FC-SAFETY-03-L0"))
      .toThrow("Invalid local state boundary");
    expect(() => buildLocalStateEvidence(source, 8, "FC-SAFETY-03-L0"))
      .toThrow("Local state has no source evidence");
  });
});
