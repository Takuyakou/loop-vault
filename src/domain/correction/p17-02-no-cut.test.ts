import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { buildCorrectionModel, type CorrectionModel } from "./correctionModel";
import { chooseName, cutBars, splitCard } from "./cardEdits";
import { buildSaveCandidate } from "./saveCandidate";
import { reviewThresholds } from "./reviewThresholds";
import { buildCorrectionEvents } from "../midi/feedback";
import { buildProgressionSaveFeedbackEvent } from "../midi/analysisFeedback";
import { buildLabelCorrectionLogs } from "../midi/labelCorrectionLog";
import { toSavedProgressionBlock } from "../../store/vaultStore";
import golden from "./p17-02-no-cut.golden.json";

/**
 * P17-02 Master parity: with nothing cut, saving must produce exactly what the
 * capture produced before the bar-cut work (captured from master `ca8ff752`, whose
 * save path is unchanged by P17-01). Covers the Vault block, the Correction Log,
 * the correction events and the save feedback for the songs the unit/e2e tests use.
 */

const pick = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function snapshot(id: string, transform?: (model: CorrectionModel) => CorrectionModel) {
  const input = analyzeScenario(p10Scenario(id));
  let model = buildCorrectionModel(input, reviewThresholds);
  if (transform) model = transform(model);
  const range = { startBar: 1, endBar: Math.ceil(model.totalBeats / model.context.meter) };
  const saved = buildSaveCandidate(model, range, input.result.fullTimeline);
  if (!saved.ok) throw new Error(JSON.stringify(saved.problems));
  let n = 0;
  const block = toSavedProgressionBlock(saved.candidate, input.result, {
    idFactory: () => `id-${++n}`,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    sourceData: input.sourceData,
    sourceVoices: input.sourceVoices,
  }, { userEdited: saved.userEdited });
  const editSources = saved.editable.slots.map((slot) => slot.editSource);
  const quick = saved.editable.slots.map((slot) => slot.quickCandidateSelection);
  const events = buildCorrectionEvents(saved.original, saved.candidate, input.result, editSources, quick);
  const feedback = buildProgressionSaveFeedbackEvent(saved.original, saved.candidate, input.result, editSources, {
    occurredAt: "2026-01-01T00:00:00.000Z", userEdited: saved.userEdited, userVerified: false,
  });
  const logs = buildLabelCorrectionLogs(saved.original, saved.editable, input.result, {
    analyzerMode: "phase4-v1", occurredAt: "2026-01-01T00:00:00.000Z",
  });
  return pick({
    id,
    cards: model.cards.length,
    totalBeats: model.totalBeats,
    saved: {
      userEdited: saved.userEdited,
      candidate: saved.candidate.chords.map((item) => ({
        label: item.chord.label, bar: item.bar, beat: item.beat, durationBeats: item.durationBeats,
        midiNotes: item.voicingMemory?.sourceVoicing?.midiNotes ?? null,
        source: item.voicingMemory?.sourceVoicing?.source ?? null,
        playbackChoice: item.voicingMemory?.playbackChoice ?? null,
        practice: item.voicingMemory?.practiceVoicingOverride?.midiNotes ?? null,
      })),
      original: saved.original.chords.map((item) => ({ label: item.chord.label, bar: item.bar, beat: item.beat, durationBeats: item.durationBeats })),
      editable: saved.editable.slots.map((slot) => ({ id: slot.id, position: slot.position, original: slot.originalChord.label, current: slot.currentChord.label, edited: Boolean(slot.edited), editSource: slot.editSource ?? null })),
    },
    block: {
      sourceStartBeat: block.sourceStartBeat ?? null,
      sourceEndBeat: block.sourceEndBeat ?? null,
      startBar: block.startBar ?? null,
      endBar: block.endBar ?? null,
      lengthBars: block.lengthBars ?? null,
      userEdited: block.userEdited ?? null,
      chords: block.chords.map((item) => ({
        label: item.chord.label, bar: item.bar, beat: item.beat, durationBeats: item.durationBeats,
        midiNotes: item.voicingMemory?.sourceVoicing?.midiNotes ?? null,
        source: item.voicingMemory?.sourceVoicing?.source ?? null,
        playbackChoice: item.voicingMemory?.playbackChoice ?? null,
        practice: item.voicingMemory?.practiceVoicingOverride?.midiNotes ?? null,
      })),
    },
    logs: logs.map((log) => ({ detected: log.detectedLabel, saved: log.finalSavedLabel, editType: log.editType, fingerprint: log.eventFingerprint, noteHash: log.noteSnapshotHash })),
    events: events.map((event) => ({ segment: event.segment, detected: event.detected.primary, corrected: event.corrected, method: event.editMethod })),
    feedback: feedback ? { range: feedback.range, decisions: feedback.decisions, savedEventCount: feedback.savedEventCount } : null,
  });
}

describe("P17-02 no-cut parity with master (ca8ff752)", () => {
  it("saves the block, the log, the correction events and the feedback exactly as before", () => {
    const out = [
      snapshot("plain-8"),
      snapshot("plain-8", (model) => chooseName(model, model.cards[1]!.id, { ...model.cards[1]!.name, label: "Am7" } as never, "typed").model),
      snapshot("melody-track-8", (model) => {
        const split = splitCard(model, model.cards[2]!.id);
        if (!split.changed) throw new Error("split did not run");
        return chooseName(split.model, split.model.cards[3]!.id, { ...split.model.cards[3]!.name, label: "Fmaj7" } as never, "typed").model;
      }),
    ];
    expect(out).toEqual(golden);
  });

  it("reports no cut and leaves the original position to the old formula", () => {
    const input = analyzeScenario(p10Scenario("plain-8"));
    const model = buildCorrectionModel(input, reviewThresholds);
    const saved = buildSaveCandidate(model, { startBar: 1, endBar: 8 }, input.result.fullTimeline);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.removedBars).toEqual([]);
    expect(saved.crossesCut).toBe(false);
    expect(saved.sourceBars).toEqual({ startBar: 1, endBar: 8 });
  });

  it("keeps `original` on the screen bars after a cut (the detected side is the card's bar)", () => {
    const input = analyzeScenario(p10Scenario("plain-8"));
    const model = buildCorrectionModel(input, reviewThresholds);
    const cut = cutBars(model, 2).model;
    const saved = buildSaveCandidate(cut, { startBar: 1, endBar: 7 }, input.result.fullTimeline);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.original.chords.map((item) => [item.bar, item.beat])).toEqual(
      cut.cards.map((card) => [card.bar, card.beat]),
    );
  });
});
