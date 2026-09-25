import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import type { ChordTimelineItem, SavedProgressionBlock, VoicingSnapshot } from "../types";
import { normalizedChordKey, VOICING_AUTO_USE_CONFIDENCE } from "../voicing";
import {
  buildProgressionPracticeClockSchedule,
  buildProgressionVoicingPracticeSnapshot,
  createProgressionPracticeClockState,
  progressionPracticeBeatAtTick,
  PROGRESSION_VOICING_PRACTICE_PPQ,
  progressionPracticeTicksAtBeat,
  progressionEventTransportBeat,
  projectProgressionPracticeClock,
  reduceProgressionPracticeClock,
} from ".";

describe("P5.27 detached practice snapshot", () => {
  it("keeps source meters 1/4 through 12/4 with a separate four-beat PracticeGroup", () => {
    for (let numerator = 1; numerator <= 12; numerator += 1) {
      const block = { ...progression([event(1, 1, numerator, 0)]), timeSignature: `${numerator}/4` };
      const result = buildProgressionVoicingPracticeSnapshot({
        sourceReference: { ideaId: "idea-1", blockId: block.id }, block, selection: "source-midi",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.snapshot.meter).toEqual({ numerator, denominator: 4 });
      expect(result.snapshot.practiceGroupBeats).toBe(4);
      expect(result.snapshot.lengthBeats).toBe(numerator);
      expect(result.snapshot.events[0]).toMatchObject({ startBeat: 0, durationBeats: numerator });
    }
  });

  it("accepts exactly 256 PracticeGroups and rejects the 257th without shortening source timing", () => {
    const build = (beats: number) => {
      const block = progression([event(1, 1, beats, 0)]);
      block.bpm = 120;
      return buildProgressionVoicingPracticeSnapshot({
        sourceReference: { ideaId: "idea-1", blockId: block.id }, block, selection: "source-midi",
      });
    };
    const accepted = build(1024);
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.snapshot).toMatchObject({ lengthBeats: 1024, practiceGroupBeats: 4 });
    expect(build(1028)).toMatchObject({ ok: false, error: { code: "practice-capacity" } });
  });

  it("owns a strict allowlist of canonical facts and the selected exact Source pitches only", () => {
    const block = progression([event(18, 1, 4, 0, "maj7", [48, 55, 59])]);
    Object.assign(block, {
      sourceFileName: "private.mid",
      sourceFingerprint: "private-source",
      memo: "private memo",
      tags: ["private-tag"],
      rawMidi: [1, 2, 3],
      deviceId: "device-private",
      score: 99,
    });
    block.chords[0]!.voicingMemory!.practiceVoicingOverride = voicing(
      block.chords[0]!, [52, 59, 64], "live-played",
    );

    const result = buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea-1", blockId: "block-1" },
      block,
      selection: "source-midi",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { snapshot } = result;
    expect(snapshot).toEqual({
      version: 1,
      fingerprint: snapshot.fingerprint,
      spans: [{ kind: "chord", eventIndex: 0, startBeat: 0, durationBeats: 4 }],
      source: { kind: "vault", reference: { ideaId: "idea-1", blockId: "block-1" } },
      selection: "source-midi",
      key: "C major",
      bpm: 80,
      meter: { numerator: 4, denominator: 4 },
      practiceGroupBeats: 4,
      lengthBeats: 4,
      events: [{
        id: "event-1",
        startBeat: 0,
        durationBeats: 4,
        chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
        voicing: { kind: "source-midi", midiNotes: [48, 55, 59], bassNote: 48 },
      }],
    });
    expect([...collectKeys(snapshot)].sort()).toEqual([
      "bassNote", "blockId", "bpm", "chord", "denominator", "durationBeats", "eventIndex", "events",
      "fingerprint", "id", "ideaId", "key", "kind", "label", "lengthBeats", "meter",
      "midiNotes", "numerator", "practiceGroupBeats", "quality", "reference", "root", "selection", "source",
      "spans", "startBeat", "tensions", "version", "voicing",
    ]);
    const serialized = JSON.stringify(snapshot);
    for (const forbidden of [
      "summaryText", "tags", "capturedAt", "analyzerVersion", "confidence", "userVerified",
      "sourceFileName", "sourceFingerprint", "private.mid", "private-source", "private memo",
      "private-tag", "rawMidi", "deviceId", "score", "capturedForChordKey", "representation",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    block.chords[0]!.durationBeats = 4;
    block.chords[0]!.voicingMemory!.sourceVoicing!.midiNotes[0] = 1;
    expect(snapshot.events[0]?.durationBeats).toBe(4);
    expect(snapshot.events[0]?.voicing?.midiNotes).toEqual([48, 55, 59]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.events)).toBe(true);
    expect(Object.isFrozen(snapshot.events[0]?.voicing?.midiNotes)).toBe(true);
  });

  it("uses compatible exact Source on explicit selection without substituting Custom or generated voicing", () => {
    const source = (overrides: Partial<VoicingSnapshot>) => {
      const block = progression([event(1, 1, 4, 0, "maj7", [48, 55, 59])]);
      Object.assign(block.chords[0]!.voicingMemory!.sourceVoicing!, overrides);
      block.chords[0]!.voicingMemory!.practiceVoicingOverride = voicing(
        block.chords[0]!, [52, 59, 64], "live-played",
      );
      const result = buildProgressionVoicingPracticeSnapshot({
        sourceReference: { ideaId: "idea-1", blockId: block.id }, block, selection: "source-midi",
      });
      if (!result.ok) throw new Error(result.error.message);
      return result.snapshot.events[0]?.voicing;
    };
    expect(source({ userVerified: true, confidence: 0 })).toEqual({
      kind: "source-midi", midiNotes: [48, 55, 59], bassNote: 48,
    });
    expect(source({ userVerified: false, confidence: VOICING_AUTO_USE_CONFIDENCE })).toEqual({
      kind: "source-midi", midiNotes: [48, 55, 59], bassNote: 48,
    });
    expect(source({ userVerified: false, confidence: VOICING_AUTO_USE_CONFIDENCE - 0.01 })).toEqual({
      kind: "source-midi", midiNotes: [48, 55, 59], bassNote: 48,
    });
    expect(source({ representation: "aggregated-note-set", userVerified: true })).toBeUndefined();
    expect(source({ source: "manual", userVerified: true })).toBeUndefined();
    expect(source({ capturedForChordKey: "stale", userVerified: true })).toBeUndefined();
    expect(source({ midiNotes: [48], bassNote: 48, userVerified: true })).toBeUndefined();
  });

  it("copies only the explicitly selected compatible Custom pitches", () => {
    const block = progression([event(1, 1, 4, 0, "maj7", [48, 55, 59])]);
    block.chords[0]!.voicingMemory!.practiceVoicingOverride = voicing(
      block.chords[0]!, [52, 59, 64], "live-played",
    );
    const result = buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea-1", blockId: block.id }, block, selection: "custom",
    });
    expect(result.ok && result.snapshot.events[0]?.voicing).toEqual({
      kind: "custom", midiNotes: [52, 59, 64], bassNote: 52,
    });
  });

  it("preserves E-major sharp-family labels while keeping numeric chord identity unchanged", () => {
    const sharpDominant = event(1, 1, 1, 8, "dom7");
    sharpDominant.chord = { ...makeChordSymbol(8, "dom7", ["b13"]), label: "G#7(b13)" };
    const slash = event(1, 2, 1, 4, "maj");
    slash.chord = { ...makeChordSymbol(4, "maj", [], 8), label: "E/G#" };
    const flatNine = event(1, 3, 2, 1, "dom7");
    flatNine.chord = { ...makeChordSymbol(1, "dom7", ["b9"]), label: "C#7(b9)" };
    const block = progression([sharpDominant, slash, flatNine]);
    block.detectedKey = "E major";

    const result = buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea-1", blockId: block.id },
      block,
      selection: "basic-full",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.events.map(({ chord }) => chord.label))
      .toEqual(["G#7(b13)", "E/G#", "C#7(b9)"]);
    expect(result.snapshot.events.map(({ chord }) => ({
      root: chord.root,
      bass: chord.bass,
      tensions: chord.tensions,
    }))).toEqual([
      { root: 8, bass: undefined, tensions: ["b13"] },
      { root: 4, bass: 8, tensions: [] },
      { root: 1, bass: undefined, tensions: ["b9"] },
    ]);
  });

  it("preserves validated non-diatonic saved spelling and canonicalizes unsafe labels", () => {
    const flatDominant = event(1, 1, 1, 10, "dom7");
    flatDominant.chord = { ...makeChordSymbol(10, "dom7"), label: "Bb7" };
    const flatSlash = event(1, 2, 1, 4, "maj");
    flatSlash.chord = { ...makeChordSymbol(4, "maj", [], 10), label: "E/Bb" };
    const malformed = event(1, 3, 1, 8, "dom7");
    malformed.chord = { ...makeChordSymbol(8, "dom7"), label: "not-a-chord" };
    const mismatched = event(1, 4, 1, 8, "dom7");
    mismatched.chord = { ...makeChordSymbol(8, "dom7"), label: "Cmaj7" };
    const block = progression([flatDominant, flatSlash, malformed, mismatched]);
    block.detectedKey = "E major";

    const result = buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea-1", blockId: block.id },
      block,
      selection: "basic-full",
    });
    expect(result.ok && result.snapshot.events.map(({ chord }) => chord.label))
      .toEqual(["Bb7", "E/Bb", "Ab7", "Ab7"]);
  });

  it("keeps the legacy context-free spelling when no key is saved", () => {
    const chordEvent = event(1, 1, 4, 8, "dom7");
    const block = progression([chordEvent]);
    block.detectedKey = undefined;
    const result = buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea-1", blockId: block.id },
      block,
      selection: "basic-full",
    });
    expect(result.ok && result.snapshot.events[0]?.chord)
      .toMatchObject({ root: 8, label: "Ab7" });
  });

  it("fails closed for unsafe references, discontinuous timing, and unsupported meter", () => {
    const valid = progression([event(1, 1, 2, 0), event(1, 4, 1, 5)]);
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "D:/private", blockId: valid.id }, block: valid, selection: "basic-shell",
    })).toMatchObject({ ok: false, error: { code: "invalid-reference" } });
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea", blockId: "different-block" }, block: valid, selection: "basic-shell",
    })).toMatchObject({ ok: false, error: { code: "invalid-reference" } });
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea", blockId: valid.id }, block: valid, selection: "basic-shell",
    })).toMatchObject({ ok: false, error: { code: "invalid-timing" } });
    const simultaneous = progression([event(1, 1, 1, 0), event(1, 1, 1, 5)]);
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea", blockId: simultaneous.id },
      block: simultaneous,
      selection: "basic-shell",
    })).toMatchObject({ ok: false, error: { code: "invalid-timing" } });
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea", blockId: "block" },
      block: { ...progression([event(1, 1, 4, 0)]), id: "block", timeSignature: "5/8" },
      selection: "basic-shell",
    })).toMatchObject({ ok: false, error: { code: "unsupported-meter" } });
  });

  it("accepts BPM boundaries and rejects missing, zero, NaN, and out-of-range BPM", () => {
    const buildAt = (bpm: number | undefined) => {
      const block = progression([event(1, 1, 4, 0)]);
      block.bpm = bpm;
      return buildProgressionVoicingPracticeSnapshot({
        sourceReference: { ideaId: "idea", blockId: block.id }, block, selection: "basic-shell",
      });
    };
    expect(buildAt(30).ok).toBe(true);
    expect(buildAt(240).ok).toBe(true);
    for (const bpm of [undefined, 0, Number.NaN, 29, 241]) {
      expect(buildAt(bpm)).toMatchObject({ ok: false, error: { code: "invalid-bpm" } });
    }
  });

  it("rejects empty and structurally invalid progression events", () => {
    const empty = progression([]);
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea", blockId: empty.id }, block: empty, selection: "basic-shell",
    })).toMatchObject({ ok: false, error: { code: "empty-progression" } });
    const invalid = progression([event(1, 1, 4, 0)]);
    invalid.chords[0]!.chord.root = 12;
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea", blockId: invalid.id }, block: invalid, selection: "basic-shell",
    })).toMatchObject({ ok: false, error: { code: "invalid-chord" } });

    const hugeDuration = progression([event(1, 1, 1e300, 0)]);
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea", blockId: hugeDuration.id },
      block: hugeDuration,
      selection: "basic-shell",
    })).toMatchObject({ ok: false, error: { code: "invalid-timing" } });

    const unsafeBar = progression([event(Number.MAX_SAFE_INTEGER + 1, 1, 4, 0)]);
    expect(buildProgressionVoicingPracticeSnapshot({
      sourceReference: { ideaId: "idea", blockId: unsafeBar.id },
      block: unsafeBar,
      selection: "basic-shell",
    })).toMatchObject({ ok: false, error: { code: "invalid-timing" } });

    const largeSafeBeat = Math.floor(
      Number.MAX_SAFE_INTEGER / PROGRESSION_VOICING_PRACTICE_PPQ,
    ) - 1;
    expect(progressionPracticeBeatAtTick(progressionPracticeTicksAtBeat(largeSafeBeat)))
      .toBe(largeSafeBeat);
    expect(() => progressionPracticeTicksAtBeat(largeSafeBeat + 2)).toThrow(RangeError);
  });

  it("is deterministic for equivalent owned inputs", () => {
    const first = snapshotFrom(progression([event(1, 1, 2, 0), event(1, 3, 2, 7)]));
    const second = snapshotFrom(structuredClone(progression([event(1, 1, 2, 0), event(1, 3, 2, 7)])));
    expect(second).toEqual(first);
    expect(second.fingerprint).toBe(first.fingerprint);
  });
});

describe("P5.27 single non-scoring clock", () => {
  it("projects mixed durations from one absolute transport beat", () => {
    const snapshot = snapshotFrom(progression([
      event(1, 1, 2, 0), event(1, 3, 1, 5), event(1, 4, 1, 7), event(2, 1, 4, 9),
    ]));
    let state = createProgressionPracticeClockState(snapshot, { countInBars: 0 });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: 2.5 });
    expect(projectProgressionPracticeClock(snapshot, state)).toMatchObject({
      status: "running",
      currentEventIndex: 1,
      nextEventIndex: 2,
      beatInChord: 1,
      beatsInChord: 1,
      beatInBar: 3,
      chordProgress: 0.5,
      progressionProgress: 0.3125,
      loopCount: 0,
    });
  });

  it("runs one-, two-, and four-chord bars without changing saved durations", () => {
    const matrices = [
      [event(1, 1, 4, 0)],
      [event(1, 1, 2, 0), event(1, 3, 2, 5)],
      [event(1, 1, 1, 0), event(1, 2, 1, 2), event(1, 3, 1, 5), event(1, 4, 1, 7)],
    ];
    expect(matrices.map((events) => {
      const snapshot = snapshotFrom(progression(events));
      let state = createProgressionPracticeClockState(snapshot, { countInBars: 0 });
      state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
      state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: 3.5 });
      return [snapshot.lengthBeats, projectProgressionPracticeClock(snapshot, state).currentEventIndex];
    })).toEqual([[4, 0], [4, 1], [4, 3]]);
  });

  it("applies count-in only before the first pass and loops last-to-first seamlessly", () => {
    const snapshot = snapshotFrom(progression([event(1, 1, 2, 0), event(1, 3, 2, 7)]));
    const schedule = buildProgressionPracticeClockSchedule(snapshot, 1);
    expect(progressionEventTransportBeat(schedule, 0, 0)).toBe(4);
    expect(progressionEventTransportBeat(schedule, 0, 1)).toBe(8);
    expect(progressionEventTransportBeat(schedule, 0, 2)).toBe(12);

    let state = createProgressionPracticeClockState(snapshot, { countInBars: 1 });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: 3 });
    expect(projectProgressionPracticeClock(snapshot, state)).toMatchObject({ inCountIn: true, countInBeat: 4, loopCount: 0 });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: 8 });
    expect(projectProgressionPracticeClock(snapshot, state)).toMatchObject({
      inCountIn: false,
      currentEventIndex: 0,
      nextEventIndex: 1,
      progressionBeat: 0,
      loopCount: 1,
    });
  });

  it("keeps fractional long-loop boundaries consistent without swallowing adjacent positions", () => {
    const snapshot = snapshotFrom(progression([
      event(1, 1, 0.4, 0),
      event(1, 1.4, 0.7, 7),
    ]));
    const countInBeats = 4;
    const completedLoops = 1_000;
    expect(snapshot.lengthBeats).toBe(211 / PROGRESSION_VOICING_PRACTICE_PPQ);
    expect(snapshot.events.map(({ startBeat, durationBeats }) => [
      progressionPracticeTicksAtBeat(startBeat),
      progressionPracticeTicksAtBeat(durationBeats),
    ])).toEqual([[0, 77], [77, 134]]);
    expect(snapshotFrom(progression([
      event(1, 1, 0.4, 0),
      event(1, 1.4, 0.7, 7),
    ]))).toEqual(snapshot);
    const exactBoundary = countInBeats + completedLoops * snapshot.lengthBeats;
    const adjacentDelta = 1e-7;
    const projectAt = (absoluteBeat: number) => {
      let state = createProgressionPracticeClockState(snapshot, { countInBars: 1 });
      state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
      state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat });
      return projectProgressionPracticeClock(snapshot, state);
    };

    const before = projectAt(exactBoundary - adjacentDelta);
    expect(before.loopCount).toBe(completedLoops - 1);
    expect(before.currentEventIndex).toBe(1);
    expect(before.nextEventIndex).toBe(0);
    expect(before.progressionBeat).toBeGreaterThan(snapshot.lengthBeats - adjacentDelta * 2);
    expect(before.progressionBeat).toBeLessThan(snapshot.lengthBeats);
    expect(before.progressionProgress).toBeGreaterThan(0.9999998);
    expect(before.chordProgress).toBeGreaterThan(0.9999997);

    const exact = projectAt(exactBoundary);
    expect(exact).toMatchObject({
      loopCount: completedLoops,
      progressionBeat: 0,
      progressionProgress: 0,
      currentEventIndex: 0,
      nextEventIndex: 1,
      chordProgress: 0,
    });

    const after = projectAt(exactBoundary + adjacentDelta);
    expect(after.loopCount).toBe(completedLoops);
    expect(after.currentEventIndex).toBe(0);
    expect(after.nextEventIndex).toBe(1);
    expect(after.progressionBeat).toBeGreaterThan(0);
    expect(after.progressionBeat).toBeLessThan(adjacentDelta * 2);
    expect(after.progressionProgress).toBeGreaterThan(0);
    expect(after.chordProgress).toBeGreaterThan(0);

    const veryLongBoundary = countInBeats + 1_000_000 * snapshot.lengthBeats;
    expect(projectAt(veryLongBoundary)).toMatchObject({
      loopCount: 1_000_000,
      progressionBeat: 0,
      currentEventIndex: 0,
      nextEventIndex: 1,
    });

    const musicalThirtyMinutes = 30 * 80;
    const longProjection = projectAt(countInBeats + musicalThirtyMinutes);
    expect(longProjection.loopCount).toBe(Math.floor(musicalThirtyMinutes / snapshot.lengthBeats));
    expect(longProjection.progressionBeat).toBeCloseTo(
      musicalThirtyMinutes % snapshot.lengthBeats,
      10,
    );
  });

  it("preserves position across pause/resume and BPM changes, while restart reapplies count-in", () => {
    const snapshot = snapshotFrom(progression([event(1, 1, 4, 0)]));
    let state = createProgressionPracticeClockState(snapshot, { countInBars: 1 });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: 5.5 });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "PAUSE" });
    const paused = projectProgressionPracticeClock(snapshot, state);
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: 20 });
    expect(projectProgressionPracticeClock(snapshot, state)).toEqual(paused);
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SET_BPM", bpm: 122 });
    expect(state.transportBeat).toBe(5.5);
    expect(projectProgressionPracticeClock(snapshot, state).progressionBeat).toBe(1.5);
    state = reduceProgressionPracticeClock(snapshot, state, { type: "RESUME" });
    expect(state.status).toBe("running");
    state = reduceProgressionPracticeClock(snapshot, state, { type: "RESTART" });
    expect(projectProgressionPracticeClock(snapshot, state)).toMatchObject({
      status: "count-in", inCountIn: true, countInBeat: 1, loopCount: 0,
    });
  });

  it("pauses and resumes during count-in without restarting the count-in", () => {
    const snapshot = snapshotFrom(progression([event(1, 1, 4, 0)]));
    let state = createProgressionPracticeClockState(snapshot, { countInBars: 1 });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: 2.25 });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "PAUSE" });
    expect(projectProgressionPracticeClock(snapshot, state)).toMatchObject({
      status: "paused", inCountIn: true, countInBeat: 3,
    });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "RESUME" });
    expect(state).toMatchObject({ status: "count-in", transportBeat: 2.25 });
  });

  it("ignores NaN/backward transport updates and makes no-op transitions idempotent", () => {
    const snapshot = snapshotFrom(progression([event(1, 1, 4, 0)]));
    const ready = createProgressionPracticeClockState(snapshot, { countInBars: 0 });
    expect(reduceProgressionPracticeClock(snapshot, ready, { type: "PAUSE" })).toBe(ready);
    expect(reduceProgressionPracticeClock(snapshot, ready, { type: "RESUME" })).toBe(ready);
    let running = reduceProgressionPracticeClock(snapshot, ready, { type: "START" });
    expect(reduceProgressionPracticeClock(snapshot, running, { type: "START" })).toBe(running);
    running = reduceProgressionPracticeClock(snapshot, running, { type: "SYNC_TRANSPORT", absoluteBeat: 2 });
    expect(reduceProgressionPracticeClock(snapshot, running, { type: "SYNC_TRANSPORT", absoluteBeat: Number.NaN })).toBe(running);
    expect(reduceProgressionPracticeClock(snapshot, running, { type: "SYNC_TRANSPORT", absoluteBeat: -1 })).toBe(running);
    expect(reduceProgressionPracticeClock(snapshot, running, { type: "SYNC_TRANSPORT", absoluteBeat: 1 })).toBe(running);
    expect(reduceProgressionPracticeClock(snapshot, running, { type: "SYNC_TRANSPORT", absoluteBeat: 2 })).toBe(running);
    expect(reduceProgressionPracticeClock(snapshot, running, { type: "SET_BPM", bpm: running.bpm })).toBe(running);
    const paused = reduceProgressionPracticeClock(snapshot, running, { type: "PAUSE" });
    expect(reduceProgressionPracticeClock(snapshot, paused, { type: "PAUSE" })).toBe(paused);
    const stopped = reduceProgressionPracticeClock(snapshot, paused, { type: "STOP" });
    expect(reduceProgressionPracticeClock(snapshot, stopped, { type: "STOP" })).toBe(stopped);
  });

  it("accepts BPM boundaries and rejects invalid runtime BPM updates", () => {
    const snapshot = snapshotFrom(progression([event(1, 1, 4, 0)]));
    let state = createProgressionPracticeClockState(snapshot, { bpm: 30 });
    expect(state.bpm).toBe(30);
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SET_BPM", bpm: 240 });
    expect(state.bpm).toBe(240);
    for (const bpm of [0, Number.NaN, 29, 241]) {
      expect(() => reduceProgressionPracticeClock(snapshot, state, { type: "SET_BPM", bpm })).toThrow(RangeError);
    }
  });

  it("remains running and deterministic through a long constant-memory simulation", () => {
    const snapshot = snapshotFrom(progression([
      event(1, 1, 1, 0), event(1, 2, 1, 2), event(1, 3, 2, 5),
    ]));
    const run = () => {
      let state = createProgressionPracticeClockState(snapshot, { countInBars: 2 });
      state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
      state = reduceProgressionPracticeClock(snapshot, state, {
        type: "SYNC_TRANSPORT", absoluteBeat: 8 + 100_000 * snapshot.lengthBeats + 2.25,
      });
      return projectProgressionPracticeClock(snapshot, state);
    };
    const first = run();
    expect(run()).toEqual(first);
    expect(first).toMatchObject({
      status: "running", currentEventIndex: 2, nextEventIndex: 0,
      progressionBeat: 2.25, loopCount: 100_000,
    });
    expect(Object.keys(first)).not.toEqual(expect.arrayContaining([
      "score", "accuracy", "correct", "success", "streak", "mastery", "performance",
    ]));
  });

  it("projects an exact 30-minute musical run without waiting on wall-clock time", () => {
    const snapshot = snapshotFrom(progression([
      event(1, 1, 1, 0), event(1, 2, 1, 2), event(1, 3, 2, 5),
    ]));
    const bpm = 80;
    const musicalRuntimeMinutes = 30;
    const elapsedBeats = musicalRuntimeMinutes * bpm;
    const expectedLoops = elapsedBeats / snapshot.lengthBeats;
    const run = () => {
      let state = createProgressionPracticeClockState(snapshot, { bpm, countInBars: 0 });
      state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
      state = reduceProgressionPracticeClock(snapshot, state, {
        type: "SYNC_TRANSPORT", absoluteBeat: elapsedBeats,
      });
      return projectProgressionPracticeClock(snapshot, state);
    };

    expect(expectedLoops).toBe(600);
    expect(run()).toEqual(run());
    expect(run()).toMatchObject({
      status: "running",
      loopCount: expectedLoops,
      progressionBeat: 0,
      currentEventIndex: 0,
      nextEventIndex: 1,
    });
  });

  it("keeps a stopped chord anchor through count-in and accepts backward seek explicitly", () => {
    const snapshot = snapshotFrom(progression([event(1, 1, 2, 0), event(1, 3, 2, 2)]));
    let state = createProgressionPracticeClockState(snapshot, { countInBars: 1 });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SEEK", status: "stopped", absoluteBeat: 6, anchorBeat: 2 });
    expect(projectProgressionPracticeClock(snapshot, state).currentEventIndex).toBe(1);
    state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
    expect(projectProgressionPracticeClock(snapshot, state)).toMatchObject({ inCountIn: true, currentEventIndex: 1 });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: 6 });
    expect(projectProgressionPracticeClock(snapshot, state).currentEventIndex).toBe(1);
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SEEK", status: "running", absoluteBeat: 4, anchorBeat: 0 });
    expect(projectProgressionPracticeClock(snapshot, state).currentEventIndex).toBe(0);
    state = reduceProgressionPracticeClock(snapshot, state, { type: "STOP_RESET" });
    expect(projectProgressionPracticeClock(snapshot, state)).toMatchObject({ status: "stopped", currentEventIndex: 0, loopCount: 0 });
  });

  it("stops only on the explicit user stop action", () => {
    const snapshot = snapshotFrom(progression([event(1, 1, 4, 0)]));
    let state = createProgressionPracticeClockState(snapshot, { countInBars: 0 });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "START" });
    state = reduceProgressionPracticeClock(snapshot, state, { type: "SYNC_TRANSPORT", absoluteBeat: 40_000 });
    expect(state.status).toBe("running");
    state = reduceProgressionPracticeClock(snapshot, state, { type: "STOP" });
    expect(state.status).toBe("stopped");
  });
});

function snapshotFrom(block: SavedProgressionBlock) {
  const result = buildProgressionVoicingPracticeSnapshot({
    sourceReference: { ideaId: "idea-1", blockId: block.id },
    block,
    selection: "basic-full",
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.snapshot;
}

function progression(chords: ChordTimelineItem[]): SavedProgressionBlock {
  return {
    id: "block-1",
    summaryText: "do not retain this user text",
    chords,
    detectedKey: "C major",
    bpm: 80,
    timeSignature: "4/4",
    memo: "do not retain this memo",
    tags: [],
    capturedAt: "2026-01-01T00:00:00.000Z",
    analyzerVersion: "test",
  };
}
function event(
  bar: number,
  beat: number,
  durationBeats: number,
  root: number,
  quality: ChordTimelineItem["chord"]["quality"] = "maj7",
  sourceNotes?: number[],
): ChordTimelineItem {
  const chord = makeChordSymbol(root, quality);
  return {
    bar, beat, durationBeats, chord, confidence: 1, alternatives: [], warnings: [],
    ...(sourceNotes === undefined ? {} : {
      voicingMemory: { sourceVoicing: voicingForChord(chord, sourceNotes, "midi-extracted") },
    }),
  };
}

function voicing(
  eventValue: ChordTimelineItem,
  midiNotes: number[],
  source: VoicingSnapshot["source"],
): VoicingSnapshot {
  return voicingForChord(eventValue.chord, midiNotes, source);
}

function voicingForChord(
  chord: ChordTimelineItem["chord"],
  midiNotes: number[],
  source: VoicingSnapshot["source"],
): VoicingSnapshot {
  return {
    schemaVersion: 1,
    source,
    representation: "simultaneous-voicing",
    midiNotes,
    bassNote: midiNotes[0],
    capturedForChordKey: normalizedChordKey(chord),
    capturedForChordLabel: "free text deliberately stripped",
    confidence: 0.99,
    userVerified: true,
    extractorVersion: "deliberately-stripped",
  };
}

function collectKeys(value: unknown, keys = new Set<string>()): ReadonlySet<string> {
  if (!value || typeof value !== "object") return keys;
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, keys);
    return keys;
  }
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
}
