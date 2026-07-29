import type { MidiEvent } from "midi-file";
import { writeMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import { analyzeMidi } from "../analysis";
import { inferTrackRoles } from "../legacy";
import {
  addMidiSources,
  createAnalysisSession,
  updateAnalysisSessionVoice,
} from "./analysisSession";
import {
  buildSessionAnalysisRequest,
  isBackwardEquivalentSession,
} from "./analyzerInput";

const phase5Options = {
  mode: "phase4-v1" as const,
  accuracyFirst: {
    bassCompanionCandidates: true,
    melodyContaminationFilter: false,
    enableObservedFlatNineDominantCandidate: true,
    enableAccuracyCandidateUnion: false,
  },
};

describe("Phase 5.1 analyzer input", () => {
  it("keeps the untouched single-source auto path deep-equal to Phase 5", () => {
    const bytes = chordMidi(480, 0, [48, 60, 64, 67]);
    const session = createAnalysisSession([{
      sourceId: "master",
      displayName: "runtime-only.mid",
      bytes,
    }]).session!;
    const request = buildSessionAnalysisRequest(session);

    expect(isBackwardEquivalentSession(session)).toBe(true);
    expect(request.options).toEqual({});
    expect(analyzeMidi(request.bytes, {
      fileName: request.fileName,
      ...phase5Options,
      ...request.options,
    })).toEqual(analyzeMidi(bytes, {
      fileName: "runtime-only.mid",
      ...phase5Options,
    }));
  });

  it("passes only selected voices and explicit manual roles downstream", () => {
    const bytes = multiVoiceMidi(480);
    const initial = createAnalysisSession([{
      sourceId: "master",
      displayName: "parts.mid",
      bytes,
    }]).session!;
    const harmony = initial.voices.find((voice) => voice.channel === 0)!;
    const bass = initial.voices.find((voice) => voice.channel === 1)!;
    const melody = initial.voices.find((voice) => voice.channel === 2)!;
    let changed = updateAnalysisSessionVoice(initial, harmony.id, {
      assignedRole: "harmony",
      included: true,
    });
    changed = updateAnalysisSessionVoice(changed, bass.id, {
      assignedRole: "bass",
      included: true,
    });
    changed = updateAnalysisSessionVoice(changed, melody.id, {
      assignedRole: "exclude",
      included: false,
    });
    changed = { ...changed, preset: "custom" };

    const request = buildSessionAnalysisRequest(changed);

    expect(request.backwardEquivalent).toBe(false);
    expect(request.options.preparedData?.tracks.map((track) =>
      track.roleOverride)).toEqual(["harmony", "bass"]);
    expect(request.options.preparedData?.notes.some((note) =>
      note.channel === 2)).toBe(false);
    expect(request.options.analysisInput?.enabledVoiceIds).toHaveLength(2);
    expect(Object.values(
      request.options.analysisInput?.roleOverrides ?? {},
    )).toEqual(["harmony", "bass"]);
    expect([...inferTrackRoles(request.options.preparedData!).values()])
      .toEqual(["harmony", "bass"]);
    const analysis = analyzeMidi(request.bytes, {
      ...phase5Options,
      ...request.options,
    });
    const serialized = JSON.stringify(analysis);
    expect(serialized).not.toContain("preparedData");
    expect(serialized).not.toContain("analysisInput");
    expect(serialized).not.toContain("parts.mid");
  });

  it("normalizes added source PPQ to the master beat grid", () => {
    const master = chordMidi(480, 0, [60, 64, 67]);
    const added = chordMidi(960, 1, [36]);
    const initial = createAnalysisSession([{
      sourceId: "master",
      displayName: "master.mid",
      bytes: master,
    }]).session!;
    const session = addMidiSources(initial, [{
      sourceId: "bass",
      displayName: "bass.mid",
      bytes: added,
    }]).session!;
    const request = buildSessionAnalysisRequest(session);

    expect(request.options.preparedData?.ticksPerBeat).toBe(480);
    expect(request.options.preparedData?.notes.map((note) => [
      note.startTick,
      note.durationTick,
    ])).toEqual([
      [0, 1920],
      [0, 1920],
      [0, 1920],
      [0, 1920],
    ]);
  });

  it("does not double-count exact duplicate voices", () => {
    const bytes = chordMidi(480, 0, [60, 64, 67]);
    const result = createAnalysisSession([
      { sourceId: "full", displayName: "full.mid", bytes },
      { sourceId: "split", displayName: "split.mid", bytes },
    ]);
    const session = result.session!;
    const request = buildSessionAnalysisRequest(session);

    expect(session.warnings.some((warning) =>
      warning.code === "exact-duplicate")).toBe(true);
    expect(request.selectedVoiceIds).toHaveLength(1);
    expect(request.options.preparedData?.notes).toHaveLength(3);
  });

  it("preserves sustain controls for selected voices", () => {
    const bytes = midi(480, [[
      controlChange(0, 64, 127),
      noteOn(0, 60),
      noteOff(0, 60, 480),
      controlChange(0, 64, 0, 480),
      endOfTrack(),
    ]]);
    const initial = createAnalysisSession([{
      sourceId: "master",
      displayName: "sustain.mid",
      bytes,
    }]).session!;
    const session = { ...initial, preset: "custom" as const };
    const request = buildSessionAnalysisRequest(session);

    expect(request.options.preparedData?.controlChanges).toEqual([
      { trackIndex: 0, channel: 0, number: 64, tick: 0, value: 1 },
      { trackIndex: 0, channel: 0, number: 64, tick: 960, value: 0 },
    ]);
  });

  it("is deterministic for the same session", () => {
    const session = {
      ...createAnalysisSession([{
        sourceId: "master",
        displayName: "same.mid",
        bytes: multiVoiceMidi(480),
      }]).session!,
      preset: "custom" as const,
    };
    expect(buildSessionAnalysisRequest(session))
      .toEqual(buildSessionAnalysisRequest(session));
  });
});

function chordMidi(
  ticksPerBeat: number,
  channel: number,
  pitches: readonly number[],
): Uint8Array {
  const events = pitches.map((pitch) => noteOn(channel, pitch));
  events.push(noteOff(channel, pitches[0], ticksPerBeat * 4));
  pitches.slice(1).forEach((pitch) => events.push(noteOff(channel, pitch)));
  events.push(endOfTrack());
  return midi(ticksPerBeat, [events]);
}

function multiVoiceMidi(ticksPerBeat: number): Uint8Array {
  return midi(ticksPerBeat, [
    [
      ...[60, 64, 67].map((pitch) => noteOn(0, pitch)),
      noteOff(0, 60, ticksPerBeat * 4),
      noteOff(0, 64),
      noteOff(0, 67),
      endOfTrack(),
    ],
    [
      noteOn(1, 36),
      noteOff(1, 36, ticksPerBeat * 4),
      endOfTrack(),
    ],
    [
      noteOn(2, 76),
      noteOff(2, 76, ticksPerBeat),
      noteOn(2, 77),
      noteOff(2, 77, ticksPerBeat),
      noteOn(2, 79),
      noteOff(2, 79, ticksPerBeat),
      noteOn(2, 81),
      noteOff(2, 81, ticksPerBeat),
      endOfTrack(),
    ],
  ]);
}

function midi(ticksPerBeat: number, tracks: MidiEvent[][]): Uint8Array {
  return Uint8Array.from(writeMidi({
    header: {
      format: tracks.length > 1 ? 1 : 0,
      numTracks: tracks.length,
      ticksPerBeat,
    },
    tracks,
  }));
}

function noteOn(
  channel: number,
  noteNumber: number,
  deltaTime = 0,
): MidiEvent {
  return { deltaTime, type: "noteOn", channel, noteNumber, velocity: 100 };
}

function noteOff(
  channel: number,
  noteNumber: number,
  deltaTime = 0,
): MidiEvent {
  return { deltaTime, type: "noteOff", channel, noteNumber, velocity: 0 };
}

function controlChange(
  channel: number,
  controllerType: number,
  value: number,
  deltaTime = 0,
): MidiEvent {
  return {
    deltaTime,
    type: "controller",
    channel,
    controllerType,
    value,
  };
}

function endOfTrack(deltaTime = 0): MidiEvent {
  return { deltaTime, meta: true, type: "endOfTrack" };
}
