import { describe, expect, it } from "vitest";
import { preferenceId, rememberVoicingSource, restoreVoicingSource, sourceCoverage, VOICING_SOURCE_PREFERENCE_KEY } from "./sourcePreference";
import type { ProgressionVoicingPracticeSnapshots } from "../domain/progressionVoicingPractice/types";

function snapshots(available = true): ProgressionVoicingPracticeSnapshots {
  const base = { version: 1 as const, fingerprint: "public", source: { kind: "vault" as const, reference: { ideaId: "idea", blockId: "block" } },
    bpm: 100, meter: { numerator: 4, denominator: 4 as const }, lengthBeats: 4,
    spans: [{ kind: "chord" as const, startBeat: 0, durationBeats: 4, eventIndex: 0 }],
    events: [{ id: "1", startBeat: 0, durationBeats: 4, chord: { root: 0, quality: "maj7" as const, tensions: [], label: "Cmaj7" },
      ...(available ? { voicing: { kind: "source-midi" as const, midiNotes: [48, 52, 59] } } : {}) }] };
  return { "source-midi": { ...base, selection: "source-midi" }, "basic-full": { ...base, selection: "basic-full" } };
}
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
describe("P11 source preferences", () => {
  it("restores a usable source and rejects a disappeared source without changing persisted notes", () => {
    const store = storage(); const source = snapshots(); const before = JSON.stringify(source);
    rememberVoicingSource(source, "source-midi", store);
    expect(restoreVoicingSource(source, "basic-full", store)).toBe("source-midi");
    expect(restoreVoicingSource(snapshots(false), "basic-full", store)).toBe("basic-full");
    expect(sourceCoverage(source, "source-midi")).toEqual({ available: 1, total: 1 });
    expect(sourceCoverage(source, "custom")).toEqual({ available: 0, total: 1 });
    expect(JSON.stringify(source)).toBe(before);
    expect(store.getItem(VOICING_SOURCE_PREFERENCE_KEY)).not.toContain("midiNotes");
    expect(preferenceId(source)).toBe('["idea","block"]');
  });
  it("keeps preferences bounded and fails safely for corrupt or blocked storage", () => {
    const store = storage(); store.setItem(VOICING_SOURCE_PREFERENCE_KEY, "bad json");
    expect(restoreVoicingSource(snapshots(), "basic-full", store)).toBe("basic-full");
    expect(() => rememberVoicingSource(snapshots(), "basic-full", store)).not.toThrow();
    const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(restoreVoicingSource(snapshots(), "basic-full", blocked)).toBe("basic-full");
    expect(() => rememberVoicingSource(snapshots(), "source-midi", blocked)).not.toThrow();
  });
});
