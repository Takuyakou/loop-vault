import { describe, expect, it } from "vitest";
import {
  canKeepTake,
  detectOrphans,
  isReadableMetadata,
  MAX_TAKE_DURATION_MS,
  RECORDING_SCHEMA_VERSION,
  TOTAL_QUOTA_BYTES,
  type StoredRecordingMetadata,
} from "./persistence";

const META: StoredRecordingMetadata = {
  recordingId: "rec-1",
  schemaVersion: RECORDING_SCHEMA_VERSION,
  practiceSessionId: "s1",
  exerciseSignature: "degree:x",
  mode: "degree",
  createdAt: "2026-08-05T00:00:00.000Z",
  durationMs: 2_000,
  mimeType: "audio/webm;codecs=opus",
  byteSize: 1_000,
  channelMode: "mono-sum",
  resolvedChannel: "mono-sum",
  inputDeviceName: "Input",
  playedBackBeforeReview: true,
};

describe("take quota", () => {
  it("keeps a take within limits", () => {
    expect(canKeepTake({ durationMs: 2_000, byteSize: 1_000, usedBytes: 0 })).toEqual({ ok: true });
  });

  it("rejects an over-long take without proposing deletion", () => {
    expect(canKeepTake({ durationMs: MAX_TAKE_DURATION_MS + 1, byteSize: 10, usedBytes: 0 }))
      .toEqual({ ok: false, reason: "duration" });
  });

  it("rejects a take that would exceed the total quota", () => {
    expect(canKeepTake({ durationMs: 1_000, byteSize: 100, usedBytes: TOTAL_QUOTA_BYTES }))
      .toEqual({ ok: false, reason: "quota" });
  });

  it("rejects invalid inputs", () => {
    expect(() => canKeepTake({ durationMs: -1, byteSize: 0, usedBytes: 0 })).toThrow(RangeError);
  });
});

describe("metadata readability", () => {
  it("accepts a current-version record", () => {
    expect(isReadableMetadata(META)).toBe(true);
  });

  it("rejects corrupt and future-version records", () => {
    expect(isReadableMetadata({ ...META, schemaVersion: 2 })).toBe(false);
    expect(isReadableMetadata({ nonsense: true })).toBe(false);
    expect(isReadableMetadata(null)).toBe(false);
    expect(isReadableMetadata("{}")).toBe(false);
  });
});

describe("orphan detection", () => {
  it("finds metadata without binary and binary without metadata", () => {
    const report = detectOrphans(["a", "b"], ["b", "c"]);
    expect(report.metadataWithoutBinary).toEqual(["a"]);
    expect(report.binaryWithoutMetadata).toEqual(["c"]);
  });

  it("reports nothing when everything is paired", () => {
    expect(detectOrphans(["a"], ["a"])).toEqual({ metadataWithoutBinary: [], binaryWithoutMetadata: [] });
  });
});
