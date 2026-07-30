import { describe, expect, test } from "vitest";
import {
  DEFAULT_MIDI_EXPORT_FEATURE_ENABLED,
  isProgressionMidiExportEnabled,
  MIDI_EXPORT_FEATURE_STORAGE_KEY,
} from "./featureFlag";

function storage(value: string | null) {
  return {
    getItem: (key: string) =>
      key === MIDI_EXPORT_FEATURE_STORAGE_KEY ? value : null,
  };
}

describe("progression MIDI export feature flag", () => {
  test("is enabled by default after the release gates pass", () => {
    expect(DEFAULT_MIDI_EXPORT_FEATURE_ENABLED).toBe(true);
    expect(isProgressionMidiExportEnabled(storage(null))).toBe(true);
  });

  test("supports an explicit local override for verification and rollback", () => {
    expect(isProgressionMidiExportEnabled(storage("true"))).toBe(true);
    expect(isProgressionMidiExportEnabled(storage("false"))).toBe(false);
    expect(isProgressionMidiExportEnabled(storage("invalid"))).toBe(true);
  });
});
