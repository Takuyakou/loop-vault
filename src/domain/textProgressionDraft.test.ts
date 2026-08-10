import { describe, expect, test } from "vitest";
import { parseChordLabel } from "./chords";
import { parseTextProgression } from "./textProgression";
import {
  createTextProgressionDraft,
  textProgressionDraftEditable,
  textProgressionDraftSavePayload,
  textProgressionDraftTimeline,
  textProgressionDraftTitle,
  textProgressionEventKey,
} from "./textProgressionDraft";
import { createTextProgressionStyleSnapshot } from "./textProgressionVoicing";
import { normalizedChordKey } from "./voicing";

function liveOverride(label = "Cmaj7") {
  const chord = parseChordLabel(label);
  if (!chord) throw new Error(`Expected test chord label to parse: ${label}`);
  return {
    schemaVersion: 1 as const,
    source: "live-played" as const,
    representation: "simultaneous-voicing" as const,
    midiNotes: [36, 43, 47, 52],
    bassNote: 36,
    capturedForChordKey: normalizedChordKey(chord),
    capturedForChordLabel: chord.label,
  };
}

describe("Text Progression ManualCandidateDraft bridge", () => {
  test("creates a text-only session Draft without MIDI, analyzer, or candidate provenance", () => {
    const result = parseTextProgression("| Cmaj7 Dm7 |", { confirmedKey: "C major" });
    const draft = createTextProgressionDraft({
      result,
      now: "2026-08-10T00:00:00.000Z",
      draftId: "text-draft",
    });

    expect(draft).toMatchObject({
      draftId: "text-draft",
      source: { type: "text-progression" },
      repairOperations: [{ type: "create-from-text" }],
      beatsPerBar: 4,
      lengthBars: 1,
    });
    expect(draft.sourceTimelineFingerprint).toMatch(/^text-progression-/);
    expect(draft.sourceTimelineFingerprint).not.toMatch(/^tl-/);
    expect(draft.sourceCandidateSnapshot).toBeUndefined();
    expect(JSON.stringify(draft)).not.toContain("sourceAsset");
    expect(JSON.stringify(draft)).not.toContain("sourceFile");
    expect(JSON.stringify(draft)).not.toContain("sourceAnalyzer");
    expect(draft).not.toHaveProperty("origin");
    expect(draft.events.every((event) => !Object.prototype.hasOwnProperty.call(event.source, "origin"))).toBe(true);

    expect(textProgressionDraftTimeline(draft)).toEqual([
      expect.objectContaining({ bar: 1, beat: 1, durationBeats: 2, confidence: 0 }),
      expect.objectContaining({ bar: 1, beat: 3, durationBeats: 2, confidence: 0 }),
    ]);
    expect(textProgressionDraftTimeline(draft).every((event) => event.eventId === undefined)).toBe(true);
  });

  test("keeps the parser's full one-to-twelve bar range out of generic candidates", () => {
    for (const bars of [1, 12]) {
      const result = parseTextProgression(Array.from({ length: bars }, () => "Cmaj7").join(" "));
      const draft = createTextProgressionDraft({ result });
      const editable = textProgressionDraftEditable(draft);

      expect(draft.lengthBars).toBe(bars);
      expect(textProgressionDraftTimeline(draft)).toHaveLength(bars);
      expect(editable.slots).toHaveLength(bars);
      expect(textProgressionDraftTimeline(draft)[bars - 1]).toMatchObject({
        bar: bars,
        beat: 1,
        durationBeats: 4,
      });
      expect(draft).not.toHaveProperty("candidateId");
    }
  });

  test("uses a canonical title seed, preserves an intentional edited title, and falls back when blank", () => {
    const result = parseTextProgression("C-7 G7 C6/9", { confirmedKey: "C major" });
    const draft = createTextProgressionDraft({ result });
    const title = textProgressionDraftTitle(result);
    const edited = textProgressionDraftSavePayload(draft, {
      title: "My rehearsal loop",
      nextAction: "Practice",
      userVerified: true,
      bpm: 120,
      confirmedKey: "C major",
    });
    const fallback = textProgressionDraftSavePayload(draft, {
      title: "   ",
      nextAction: "Practice",
      userVerified: true,
      confirmedKey: "C major",
    });

    expect(title).toContain("Cm7");
    expect(title).not.toContain("C-7");
    expect(title.length).toBeLessThanOrEqual(80);
    expect(edited).toMatchObject({
      title: "My rehearsal loop",
      nextAction: "Practice",
      bpm: 120,
      confirmedKey: "C major",
      userVerified: true,
    });
    expect(fallback.title).toBe(title);
    expect(edited.chords).toHaveLength(3);
    for (const forbidden of ["candidateId", "sourceAsset", "sourceFile", "sourceAnalyzer", "origin"]) {
      expect(Object.prototype.hasOwnProperty.call(edited, forbidden)).toBe(false);
    }
  });

  test("binds only compatible Live MIDI and verified style overrides by post-conversion slot identity", () => {
    const result = parseTextProgression("| Cmaj7 Dm7 |", { confirmedKey: "C major" });
    const practiceOverride = liveOverride();
    const eventKey = textProgressionEventKey(result.events[0]!);
    const draft = createTextProgressionDraft({
      result,
      voicingOverrides: new Map([
        [
          eventKey,
          {
            sourceVoicing: { ...practiceOverride, source: "midi-extracted" },
            practiceVoicingOverride: practiceOverride,
          },
        ],
      ]),
    });

    expect(draft.events[0]?.source.voicingMemory).toEqual({
      practiceVoicingOverride: practiceOverride,
    });
    expect(draft.events[0]?.source.voicingMemory).not.toHaveProperty("sourceVoicing");

    const styleEvent = result.events[1]!;
    const styleOverride = createTextProgressionStyleSnapshot(styleEvent.chord, "shell-17")!;
    const styleDraft = createTextProgressionDraft({
      result,
      voicingOverrides: new Map([[
        textProgressionEventKey(styleEvent),
        { practiceVoicingOverride: styleOverride },
      ]]),
    });
    expect(styleDraft.events[1]?.source.voicingMemory).toEqual({
      practiceVoicingOverride: styleOverride,
    });

    const invalidOverrides = [
      { ...practiceOverride, source: "midi-extracted" as const },
      {
        ...practiceOverride,
        source: "manual" as const,
        extractorVersion: "text-style-v1:shell-17",
        userVerified: true,
      },
      { ...practiceOverride, representation: "aggregated-note-set" as const },
      { ...practiceOverride, capturedForChordKey: "wrong-chord" },
      { ...practiceOverride, midiNotes: [43, 36, 47, 52] },
    ];
    for (const invalid of invalidOverrides) {
      const rejected = createTextProgressionDraft({
        result,
        voicingOverrides: new Map([[eventKey, { practiceVoicingOverride: invalid }]]),
      });
      expect(rejected.events[0]?.source.voicingMemory).toBeUndefined();
    }
  });

  test("rejects invalid parser results before Draft conversion", () => {
    const invalid = parseTextProgression("| C D E |");
    expect(() => createTextProgressionDraft({ result: invalid })).toThrow(
      "A fully valid Text Progression result is required before conversion.",
    );
  });
});