import { describe, expect, it } from "vitest";
import { writeMidi, type MidiData } from "midi-file";
import { blankReview, extractSourceFacts, materializeReviewedGold, validateReview } from "./localAnnotation";

function rawOneFour(): Uint8Array {
  const midi: MidiData = {
    header: { format: 1, numTracks: 2, ticksPerBeat: 480 },
    tracks: [
      [
        { deltaTime: 0, type: "timeSignature", numerator: 1, denominator: 4, metronome: 24, thirtyseconds: 8 },
        { deltaTime: 0, type: "setTempo", microsecondsPerBeat: 500000 },
        { deltaTime: 1920, type: "endOfTrack" },
      ],
      [
        { deltaTime: 0, type: "controller", channel: 0, controllerType: 64, value: 127 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 48, velocity: 80 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 55, velocity: 80 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 48, velocity: 0 },
        { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 55, velocity: 0 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 49, velocity: 80 },
        { deltaTime: 240, type: "noteOff", channel: 0, noteNumber: 49, velocity: 0 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 50, velocity: 80 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 50, velocity: 0 },
        { deltaTime: 720, type: "endOfTrack" },
      ],
    ],
  };
  return new Uint8Array(writeMidi(midi));
}

describe("P7 local source-only review", () => {
  it("preserves 1/4, exact ticks, one-beat and half-beat observations without assigning Gold", () => {
    const bytes = rawOneFour();
    const copy = new Uint8Array(bytes);
    const facts = extractSourceFacts(bytes, "local-test-01");
    expect(bytes).toEqual(copy);
    expect(facts.ppq).toBe(480);
    expect(facts.meterEvents).toEqual([{ tick: 0, numerator: 1, denominator: 4, track: 0 }]);
    expect(facts.tempoEvents).toEqual([{ tick: 0, microsecondsPerBeat: 500000, track: 0 }]);
    expect(facts.controllerEvents).toEqual([{ tick: 0, track: 1, channel: 0, controller: 64, value: 127 }]);
    expect(facts.notes.map((note) => [note.pitch, note.onsetTick, note.offsetTick, note.durationTick, note.track, note.channel]))
      .toEqual([[48, 0, 480, 480, 1, 0], [55, 0, 480, 480, 1, 0], [49, 480, 720, 240, 1, 0], [50, 720, 1200, 480, 1, 0]]);
    expect(facts.onsetClusters.map((cluster) => [cluster.tick, cluster.noteIds.length])).toEqual([[0, 2], [480, 1], [720, 1]]);
    const review = blankReview(facts);
    expect(review.status).toBe("draft");
    expect(review.boundaryDecisions.map((entry) => [entry.tick, entry.harmonic, entry.voicing, entry.passingChord]))
      .toEqual([[480, "unknown", "unknown", "unknown"], [720, "unknown", "unknown", "unknown"]]);
    expect(review.harmonicSpans).toEqual([]);
    expect(review.voicingSpans).toEqual([]);
    expect(review.noteDecisions.every((entry) => entry.role === "unknown" && entry.event === "unknown")).toBe(true);
    expect(validateReview(facts, review)).toEqual([]);
    expect(validateReview(facts, { ...review, status: "reviewed" })).toContain("incomplete-review");
  });
  it("materializes only a completed independent review, preserving both short states", () => {
    const facts = extractSourceFacts(rawOneFour(), "local-test-03");
    const draft = blankReview(facts);
    const reviewed = {
      ...draft, status: "reviewed" as const,
      boundaryDecisions: draft.boundaryDecisions.map((decision) => ({
        ...decision, harmonic: "yes" as const, voicing: "yes" as const,
        passingChord: decision.tick === 480 ? "yes" as const : "no" as const,
      })),
      noteDecisions: draft.noteDecisions.map((decision) => ({ ...decision, role: "harmony" as const, event: "none" as const })),
      harmonicSpans: [
        { startTick: 0, endTick: 480, identity: "human-a" },
        { startTick: 480, endTick: 720, identity: "human-b" },
        { startTick: 720, endTick: facts.endTick, identity: "human-c" },
      ],
      voicingSpans: [
        { startTick: 0, endTick: 480, targetNoteIds: ["n000001", "n000002"] },
        { startTick: 480, endTick: 720, targetNoteIds: ["n000003"] },
        { startTick: 720, endTick: facts.endTick, targetNoteIds: ["n000004"] },
      ],
    };
    expect(validateReview(facts, reviewed)).toEqual([]);
    const gold = materializeReviewedGold(facts, reviewed);
    expect(gold.ppq).toBe(480);
    expect(gold.harmonicSpans.map((span) => span.endTick - span.startTick)).toEqual([480, 240, 1200]);
    expect(gold.voicingSpans.map((span) => span.targetMidi)).toEqual([[48, 55], [49], [50]]);
    expect(gold.passingChordBoundaryTicks).toEqual([480]);
  });

  it("rejects review data from another source and fabricated targets", () => {
    const facts = extractSourceFacts(rawOneFour(), "local-test-02");
    const review = blankReview(facts);
    expect(validateReview(facts, { ...review, boundaryDecisions: [] })).toContain("boundary-coverage");
    expect(validateReview(facts, { ...review, sourceSha256: "wrong" })).toContain("source-mismatch");
    expect(validateReview(facts, { ...review, voicingSpans: [{ startTick: 0, endTick: facts.endTick, targetNoteIds: ["n999999"] }] }))
      .toContain("voicing-target");
  });
});
