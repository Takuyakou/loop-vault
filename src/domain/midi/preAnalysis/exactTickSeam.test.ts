import { writeMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { buildSessionAnalysisRequest } from "./analyzerInput";
import { createAnalysisSession } from "./analysisSession";
import { maxTrackEndTick } from "../rawSmf";
import { lastNoteEndTick, preScanMidiSource } from "./voiceExtraction";

describe("pre-analysis exact tick seam", () => {
  it("carries parser ticks and source PPQ without reconstructing from beat floats", () => {
    const bytes = Uint8Array.from(writeMidi({
      header: { format: 0, numTracks: 1, ticksPerBeat: 7 },
      tracks: [[
        { deltaTime: 1, type: "noteOn", channel: 0, noteNumber: 36, velocity: 64 },
        { deltaTime: 3, type: "noteOff", channel: 0, noteNumber: 36, velocity: 0 },
        { deltaTime: 52, type: "endOfTrack", meta: true },
      ]],
    }));
    const scan = preScanMidiSource(bytes, {
      sourceId: "synthetic-source",
      displayName: "Synthetic",
    });

    expect(scan.source.durationTick).toBe(56);
    expect(scan.source.durationBeats).toBe(4 / 7);
    expect(scan.notes[0]).toMatchObject({
      startTick: 1,
      durationTick: 3,
      ticksPerQuarter: 7,
      startBeat: 1 / 7,
      durationBeats: 3 / 7,
    });
    const intake = createAnalysisSession([
      { bytes, displayName: "Synthetic", sourceId: "synthetic-source" },
      { bytes, displayName: "Synthetic overlay", sourceId: "synthetic-overlay" },
    ]);
    expect(intake.session).toBeDefined();
    expect(buildSessionAnalysisRequest(intake.session!).options.preparedData?.totalBars).toBe(1);
  });
  it("finds the last note end without argument spreading at corpus-scale note counts", () => {
    const notes = Array.from({ length: 250_000 }, (_, index) => ({
      startTick: index,
      durationTick: 1,
    }));
    expect(lastNoteEndTick(notes)).toBe(250_000);
  });
  it("finds the maximum end tick without spreading an untrusted track iterable", () => {
    const manyTrackEnds = Array.from({ length: 250_000 }, (_, index) => index + 1);
    expect(maxTrackEndTick(manyTrackEnds)).toBe(250_000);
  });
});
