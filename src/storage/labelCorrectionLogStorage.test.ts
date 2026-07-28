import { describe, expect, it } from "vitest";
import type { LabelCorrectionLog } from "../domain/midi/labelCorrectionLog";
import { deduplicateLabelCorrectionLogs } from "./labelCorrectionLogStorage";

const event: LabelCorrectionLog = {
  schemaVersion: 1,
  analyzerVersion: "phase4-v1",
  analyzerMode: "phase4-v1",
  eventFingerprint: "fnv1a32-12345678",
  detectedLabel: "Cmaj7",
  displayedCandidates: ["Cmaj7", "G7"],
  finalSavedLabel: "G7",
  editType: "selected-rank2",
  selectedCandidateRank: 2,
  canonicalDiff: {
    rootChanged: true,
    qualityChanged: false,
    seventhChanged: true,
    tensionsAdded: [],
    tensionsRemoved: [],
    bassChanged: false,
  },
  rootConfidence: 0.9,
  noteSnapshotHash: "fnv1a32-87654321",
  occurredAt: "2026-07-28T00:00:00.000Z",
  staleEdit: false,
};

describe("Label Correction Log storage", () => {
  it("prevents duplicate events in existing and incoming JSONL", () => {
    const existing = `${JSON.stringify(event)}\n`;
    expect(deduplicateLabelCorrectionLogs(existing, [
      { ...event, occurredAt: "2026-07-29T00:00:00.000Z" },
    ])).toEqual([]);
    expect(deduplicateLabelCorrectionLogs("", [
      event,
      { ...event, occurredAt: "2026-07-29T00:00:00.000Z" },
    ])).toEqual([event]);
  });

  it("ignores malformed existing lines without losing new events", () => {
    expect(deduplicateLabelCorrectionLogs("{bad json}\n", [event])).toEqual([event]);
  });
});
