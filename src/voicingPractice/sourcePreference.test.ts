import { describe, expect, it } from "vitest";
import { availableVoicingSource, preferenceId, rememberVoicingSource, restoreVoicingSource, savedDuplicatesSource, sourceCoverage, VOICING_SOURCE_PREFERENCE_KEY } from "./sourcePreference";
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


describe("P11 effective saved/source deduplication", () => {
  function matching(): ProgressionVoicingPracticeSnapshots {
    const original = snapshots()["source-midi"]!;
    return { ...snapshots(), saved: { ...original, selection: "saved", events: original.events.map(event => ({
      ...event, playbackChoice: "SOURCE", voicing: { kind: "saved", savedSource: "source-midi", midiNotes: [59, 48, 52] },
    })) } };
  }
  it("collapses complete exact source provenance, restores old saved preference to source without changing data", () => {
    const source = matching(); const before = JSON.stringify(source); const store = storage();
    expect(savedDuplicatesSource(source)).toBe(true);
    expect(restoreVoicingSource(source, "saved", store)).toBe("source-midi");
    rememberVoicingSource(source, "saved", store);
    expect(restoreVoicingSource(source, "basic-full", store)).toBe("source-midi");
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each(["corrected", "partial", "generated", "unknown", "text", "octave", "timing"])("does not collapse %s", reason => {
    const source = matching(); const saved = source.saved!; const event = saved.events[0]!;
    const changed = { ...event, ...(reason === "custom" ? { playbackChoice: "CUSTOM" as const } : {}),
      ...(reason === "generated" ? { playbackChoice: "GENERATED" as const } : {}),
      ...(reason === "timing" ? { startBeat: 1 } : {}),
      voicing: reason === "partial" ? undefined : { ...event.voicing!,
        ...(reason === "unknown" ? { savedSource: undefined } : {}),
        ...(reason === "corrected" ? { midiNotes: [48, 52, 60] } : {}),
        ...(reason === "octave" ? { midiNotes: [60, 64, 71] } : {}) },
    };
    expect(savedDuplicatesSource({ ...source, saved: { ...saved, ...(reason === "text" ? { textDerivedPolicyId: "text-defining-basic-full-v1" as const } : {}), events: [changed] } })).toBe(false);
  });
  it("compares effective custom notes too, without rewriting CUSTOM intent", () => {
    const source = matching(); const event = source.saved!.events[0]!;
    const changed = { ...event, playbackChoice: "CUSTOM" as const, voicing: { ...event.voicing!, savedSource: "custom" as const } };
    expect(savedDuplicatesSource({ ...source, saved: { ...source.saved!, events: [changed] } })).toBe(true);
    expect(changed.playbackChoice).toBe("CUSTOM");
  });
  it("retains saved if even one later card is changed or missing", () => {
    const source = matching(); const event = source["source-midi"]!.events[0]!;
    const saved = source.saved!.events[0]!;
    const two = { ...source, "source-midi": { ...source["source-midi"]!, events: [event, { ...event, id: "2" }] },
      saved: { ...source.saved!, events: [saved, { ...saved, id: "2", voicing: { ...saved.voicing!, midiNotes: [48, 52, 60] } }] } };
    expect(savedDuplicatesSource(two)).toBe(false);
  });
});


describe("P11 unavailable source recovery", () => {
  it.each(["saved", "source-midi", "custom"] as const)("recovers persisted and initial unavailable %s without changing snapshots", missing => {
    const source = snapshots(false); const store = storage(); const before = JSON.stringify(source);
    rememberVoicingSource(source, missing, store);
    expect(restoreVoicingSource(source, missing, store)).toBe("basic-full");
    expect(JSON.stringify(source)).toBe(before);
  });
  it("prefers complete Saved, Source, Custom, then generated; preserves usable partial choices", () => {
    const source = snapshots()["source-midi"]!;
    const saved = { ...source, selection: "saved" as const, events: source.events.map(event => ({ ...event, voicing: { kind: "saved" as const, savedSource: "custom" as const, midiNotes: [60, 64, 67] } })) };
    const custom = { ...source, selection: "custom" as const, events: source.events.map(event => ({ ...event, voicing: { kind: "custom" as const, midiNotes: [60, 64, 67] } })) };
    expect(availableVoicingSource({ ...snapshots(), saved, custom }, "left-hand")).toBe("saved");
    expect(availableVoicingSource({ ...snapshots(), custom }, "left-hand")).toBe("source-midi");
    expect(availableVoicingSource({ ...snapshots(false), custom }, "left-hand")).toBe("custom");
    const partial = { ...source, events: [...source.events, { ...source.events[0]!, id: "2", voicing: undefined }] };
    expect(availableVoicingSource({ ...snapshots(), "source-midi": partial, saved }, "source-midi")).toBe("source-midi");
    expect(sourceCoverage({ "source-midi": partial }, "source-midi")).toEqual({ available: 1, total: 2 });
  });
});
