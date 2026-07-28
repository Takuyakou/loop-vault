import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import {
  createEditableProgression,
  deleteEditableChord,
  replaceEditableChord,
  resetEditableChord,
} from "../progressionEditing";
import type { ProgressionBlockCandidate } from "../types";
import {
  buildLabelCorrectionLogs,
  labelCorrectionDedupKey,
} from "./labelCorrectionLog";

function candidate(): ProgressionBlockCandidate {
  return {
    id: "candidate-1",
    startBar: 1,
    endBar: 1,
    lengthBars: 2,
    confidence: 1,
    labels: [],
    chords: [{
      eventId: "event-1",
      bar: 1,
      beat: 1,
      durationBeats: 4,
      chord: makeChordSymbol(0, "maj7"),
      confidence: 0.9,
      alternatives: [
        { chord: makeChordSymbol(7, "dom7"), confidence: 0.8 },
        { chord: makeChordSymbol(5, "maj7"), confidence: 0.7 },
      ],
      warnings: [],
    }],
    warnings: [],
    summaryText: "Cmaj7",
  };
}

const analysis = {
  sourceFingerprint: "fnv1a32-deadbeef",
  timeSignature: "4/4",
  analyzerVersion: "phase4-v1",
};

describe("Label Correction Log", () => {
  it("records accepted rank1 and selected rank2 without private source data", () => {
    const source = candidate();
    const accepted = buildLabelCorrectionLogs(
      source,
      createEditableProgression(source),
      analysis,
      { occurredAt: "2026-07-28T00:00:00.000Z" },
    );
    expect(accepted[0]).toMatchObject({
      editType: "accepted-rank1",
      selectedCandidateRank: 1,
      staleEdit: false,
      canonicalDiff: {
        rootChanged: false,
        qualityChanged: false,
        seventhChanged: false,
        tensionsAdded: [],
        tensionsRemoved: [],
        bassChanged: false,
      },
    });
    expect(JSON.stringify(accepted[0])).not.toContain("file");
    expect(JSON.stringify(accepted[0])).not.toContain("path");

    const edited = replaceEditableChord(
      createEditableProgression(source),
      "event-1",
      makeChordSymbol(7, "dom7"),
      "alternative",
    );
    const selected = buildLabelCorrectionLogs(source, edited, analysis, {
      occurredAt: "2026-07-28T00:00:00.000Z",
    });
    expect(selected[0]).toMatchObject({
      editType: "selected-rank2",
      selectedCandidateRank: 2,
      canonicalDiff: {
        rootChanged: true,
        qualityChanged: false,
        seventhChanged: true,
      },
    });
  });

  it("identifies manual, reverted, deleted and stale edits", () => {
    const source = candidate();
    const manual = replaceEditableChord(
      createEditableProgression(source),
      "event-1",
      makeChordSymbol(2, "min9"),
      "manual-label",
    );
    expect(buildLabelCorrectionLogs(source, manual, analysis, {
      occurredAt: "2026-07-28T00:00:00.000Z",
      staleEventIds: new Set(["event-1"]),
    })[0]).toMatchObject({ editType: "manual-input", staleEdit: true });

    const changed = replaceEditableChord(
      createEditableProgression(source),
      "event-1",
      makeChordSymbol(7, "dom7"),
      "alternative",
    );
    const reverted = resetEditableChord(changed, "event-1");
    expect(buildLabelCorrectionLogs(source, reverted, analysis, {
      occurredAt: "2026-07-28T00:00:00.000Z",
    })[0].editType).toBe("reverted");

    const deleted = {
      ...deleteEditableChord(createEditableProgression(source), "event-1"),
      slots: [],
    };
    expect(buildLabelCorrectionLogs(source, deleted, analysis, {
      occurredAt: "2026-07-28T00:00:00.000Z",
    })[0]).toMatchObject({ editType: "deleted", finalSavedLabel: "" });
  });

  it("uses a stable privacy-safe dedup key", () => {
    const source = candidate();
    const events = buildLabelCorrectionLogs(
      source,
      createEditableProgression(source),
      analysis,
      { occurredAt: "2026-07-28T00:00:00.000Z" },
    );
    expect(labelCorrectionDedupKey(events[0]))
      .toBe(labelCorrectionDedupKey({ ...events[0], occurredAt: "2027-01-01T00:00:00.000Z" }));
  });
});
