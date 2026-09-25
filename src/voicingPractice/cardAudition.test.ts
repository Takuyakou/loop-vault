import { describe, expect, it } from "vitest";
import {
  resolveProgressionPracticeVoicings,
  type ProgressionPracticeEvent,
  type ProgressionVoicingPracticeSnapshot,
  type ProgressionVoicingSelection,
} from "../domain/progressionVoicingPractice";
import { cardAuditionResolution } from "./cardAudition";

const event: ProgressionPracticeEvent = {
  id: "card", startBeat: 0, durationBeats: 4,
  chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
};

function plan(selection: ProgressionVoicingSelection, notes?: readonly number[]) {
  const snapshot: ProgressionVoicingPracticeSnapshot = {
    version: 1, fingerprint: `audition-${selection}`,
    source: { kind: "vault", reference: { ideaId: "public", blockId: "card" } },
    selection, bpm: 120, meter: { numerator: 4, denominator: 4 }, lengthBeats: 4,
    spans: [{ kind: "chord", startBeat: 0, durationBeats: 4, eventIndex: 0 }],
    events: [{ ...event, ...(notes && (selection === "source-midi" || selection === "custom")
      ? { voicing: { kind: selection, midiNotes: notes } } : {}) }],
  };
  return resolveProgressionPracticeVoicings(snapshot);
}

describe("saved card audition intent", () => {
  const plans = {
    source: plan("source-midi", [48, 55, 59]),
    custom: plan("custom", [43, 52, 59]),
    generated: plan("basic-full"),
  };

  it("uses exact source and custom notes and generated notes for their saved choices", () => {
    expect(cardAuditionResolution({ ...event, playbackChoice: "SOURCE" }, 0, plans)?.status).toBe("SUPPORTED");
    expect(cardAuditionResolution({ ...event, playbackChoice: "SOURCE" }, 0, plans)?.voicing?.midiNotes).toEqual([48, 55, 59]);
    expect(cardAuditionResolution({ ...event, playbackChoice: "CUSTOM" }, 0, plans)?.voicing?.midiNotes).toEqual([43, 52, 59]);
    expect(cardAuditionResolution({ ...event, playbackChoice: "GENERATED" }, 0, plans)?.voicing?.origin).toBe("basic-full");
  });

  it("uses the legacy automatic order and avoids low-confidence source", () => {
    expect(cardAuditionResolution(event, 0, plans)?.voicing?.midiNotes).toEqual([43, 52, 59]);
    expect(cardAuditionResolution({ ...event, sourceNeedsReview: true }, 0, { source: plans.source, generated: plans.generated })?.voicing?.origin)
      .toBe("basic-full");
  });

  it("falls back from unavailable explicit source to generated", () => {
    expect(cardAuditionResolution({ ...event, playbackChoice: "SOURCE" }, 0, { generated: plans.generated })?.voicing?.origin)
      .toBe("basic-full");
  });
});
