import { describe, expect, it } from "vitest";
import { generatedExercise } from "../domain/testFixtures";
import {
  degreePhraseDurationMs,
  degreeSingingReferencePlaybackRequest,
  degreeTargetPlaybackRequest,
  targetEventsAsPreviewNotes,
} from "./degreePlayback";

describe("Degree Echo playback requests", () => {
  it("derives bass playback from the canonical target event timeline", () => {
    const exercise = generatedExercise({ seed: "same-audio-events", tempo: 120 });
    const first = degreeTargetPlaybackRequest(exercise);
    const second = degreeTargetPlaybackRequest(structuredClone(exercise));

    expect(first).toEqual(second);
    expect(first).toEqual({
      type: "notes",
      notes: targetEventsAsPreviewNotes(exercise.targetEvents),
      bpm: 120,
      sound: "clean-bass",
    });
    expect(degreePhraseDurationMs(exercise)).toBe(
      Math.max(...exercise.targetEvents.map(
        (event) => event.startBeat + event.durationBeats,
      )) * 500,
    );
  });

  it.each([
    ["original", 0],
    ["octave-1", 12],
    ["octave-2", 24],
  ] as const)("changes only the %s reference octave", (mode, offset) => {
    const exercise = generatedExercise({ seed: `reference-${mode}` });
    const request = degreeSingingReferencePlaybackRequest(exercise, mode);

    expect(request.type).toBe("notes");
    if (request.type !== "notes") throw new Error("Expected note request.");
    expect(request.sound).toBe("singing-reference");
    expect(request.notes).toEqual(exercise.targetEvents.map((event) => ({
      pitch: event.midiNote + offset,
      startBeat: event.startBeat,
      durationBeats: event.durationBeats,
      velocity: event.velocity,
    })));
    expect(exercise.targetEvents).toEqual(generatedExercise({ seed: `reference-${mode}` }).targetEvents);
  });
});
