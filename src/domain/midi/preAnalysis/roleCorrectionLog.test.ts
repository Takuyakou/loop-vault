import { describe, expect, it } from "vitest";
import {
  buildRoleCorrectionLogEvents,
  readRoleCorrectionLogJsonl,
  roleCorrectionLogEventSchema,
} from "./roleCorrectionLog";
import type { AnalysisSession } from "./types";

describe("Phase 5.1 role correction log", () => {
  it("records only bounded anonymous Voice statistics after analysis", () => {
    const events = buildRoleCorrectionLogEvents(
      session(),
      "2026-07-29T12:00:00.000Z",
    );

    expect(events).toHaveLength(1);
    expect(roleCorrectionLogEventSchema.safeParse(events[0]).success).toBe(true);
    expect(events[0]).toMatchObject({
      autoRole: "melody-weak",
      assignedRole: "harmony",
      manuallyChanged: true,
      analyzeExecuted: true,
    });
    const serialized = JSON.stringify(events);
    for (const forbidden of [
      "private-song.mid",
      "Lead / secret title",
      "C:\\",
      "bytes",
      "notes",
      "sourceId",
      "trackName",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("drops malformed or extra-field JSONL records", () => {
    const event = buildRoleCorrectionLogEvents(
      session(),
      "2026-07-29T12:00:00.000Z",
    )[0];
    const result = readRoleCorrectionLogJsonl([
      JSON.stringify(event),
      JSON.stringify({ ...event, fileName: "forbidden.mid" }),
      "{broken",
    ].join("\n"));

    expect(result.events).toEqual([event]);
    expect(result.invalidLineCount).toBe(2);
  });
});

function session(): AnalysisSession {
  return {
    id: "runtime-session",
    masterSourceId: "private-source",
    sources: [{
      id: "private-source",
      displayName: "private-song.mid",
      smfType: 1,
      ppq: 480,
      durationBeats: 16,
      tempoMap: [{ beat: 0, bpm: 100 }],
      timeSignatures: [{
        beat: 0,
        numerator: 4,
        denominator: 4,
      }],
      bytes: new Uint8Array([77, 84, 104, 100]),
      visible: true,
      muted: false,
    }],
    voices: [{
      id: "private-source:0:0",
      sourceId: "private-source",
      trackIndex: 0,
      channel: 0,
      programNumbers: [80],
      dominantProgram: 80,
      gmProgramName: "Lead 1",
      trackName: "Lead / secret title",
      displayName: "Lead / secret title",
      hasProgramChanges: false,
      isDrum: false,
      noteCount: 32,
      minPitch: 60,
      maxPitch: 84,
      averageDurationBeats: 0.5,
      averagePolyphony: 1,
      autoRole: "melody-weak",
      autoRoleConfidence: 0.72,
      assignedRole: "harmony",
      included: true,
      visible: true,
      muted: false,
      solo: false,
    }],
    notes: [{
      sourceId: "private-source",
      voiceId: "private-source:0:0",
      trackIndex: 0,
      channel: 0,
      pitch: 72,
      velocity: 0.8,
      startBeat: 0,
      durationBeats: 0.5,
    }],
    controlChanges: [],
    preset: "custom",
    warnings: [],
  };
}
