import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { parseChordLabel } from "../chords";
import type { MidiSongData, Voice } from "../midi/types";
import type { ChordTimelineItem } from "../types";
import { buildCorrectionModel, percussionSuspectPitches, type CorrectionModelInput } from "./correctionModel";
import { chordToneDiff, nameCandidatesFor } from "./nameCandidates";
import { parseReviewThresholds, reviewThresholds } from "./reviewThresholds";

const cache = new Map<string, ReturnType<typeof analyzeScenario>>();
function scenario(id: string) {
  if (!cache.has(id)) cache.set(id, analyzeScenario(p10Scenario(id)));
  return cache.get(id)!;
}
function model(id: string, thresholds = reviewThresholds) {
  return buildCorrectionModel(scenario(id), thresholds);
}
const flagged = (built: ReturnType<typeof model>, kind: string) =>
  built.cards.filter((card) => card.reviewReasons.some((reason) => reason.kind === kind)).length;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe("CorrectionModel (P10.0-02, display only)", () => {
  it.each(["plain-8", "long-64", "long-300"])("has one card per fullTimeline item, same order, span and name (%s)", (id) => {
    const { result } = scenario(id);
    const built = model(id);
    expect(built.cards).toHaveLength(result.fullTimeline.length);
    built.cards.forEach((card, index) => {
      const item = result.fullTimeline[index]!;
      expect(card.timelineIndex).toBe(index);
      expect([card.bar, card.beat, card.duration]).toEqual([item.bar, item.beat, item.durationBeats]);
      expect(card.name.label).toBe(item.chord.label);
      expect(card).toMatchObject({ nameSource: "auto", reviewed: false, attacks: 1 });
    });
  });

  it("marks every sourceVoicing pitch as used and nothing else in the card", () => {
    const { result } = scenario("melody-track-8");
    const built = model("melody-track-8");
    let missing = 0;
    built.cards.forEach((card, index) => {
      const voicing = result.fullTimeline[index]!.voicingMemory?.sourceVoicing?.midiNotes ?? [];
      const mine = built.notes.filter((note) => note.cardId === card.id);
      for (const pitch of voicing) if (!mine.some((note) => note.used && note.pitch === pitch)) missing += 1;
      for (const note of mine) expect(note.used).toBe(voicing.includes(note.pitch));
    });
    expect(missing).toBe(0);
  });

  it("splits a note held across cards into fragments with the same, stable sourceNoteId", () => {
    const first = model("melody-track-8");
    const second = buildCorrectionModel(analyzeScenario(p10Scenario("melody-track-8")), reviewThresholds);
    const held = first.notes.find((note) => note.continuesFromBefore)!;
    expect(held).toBeDefined();
    const pieces = first.notes.filter((note) => note.sourceNoteId === held.sourceNoteId);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(new Set(pieces.map((note) => note.cardId)).size).toBe(pieces.length);
    expect(held.id).toBe(`${held.sourceNoteId}@${held.cardId}`);
    expect(second.notes.map((note) => note.id)).toEqual(first.notes.map((note) => note.id));
  });

  it("works on frozen input and leaves it unchanged", () => {
    const input = scenario("plain-8");
    const before = JSON.stringify(input);
    const frozen = deepFreeze(structuredClone(input)) as CorrectionModelInput;
    expect(() => buildCorrectionModel(frozen, reviewThresholds)).not.toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });

  it("uses segmentSections when it finds two or more, and 8-bar ranges otherwise", () => {
    const pairs = model("repeat-pairs-8");
    expect(pairs.segments.length).toBeGreaterThanOrEqual(2);
    expect(pairs.segments.every((segment) => segment.source === "segmentSections")).toBe(true);
    expect(pairs.segments[0]!.label).toBe("区切り1");

    const long = model("long-64");
    expect(long.segments.every((segment) => segment.source === "fallback-8bar")).toBe(true);
    expect(long.segments.slice(0, 2).map((segment) => segment.label)).toEqual(["1〜8小節", "9〜16小節"]);
    const last = long.segments[long.segments.length - 1]!;
    expect(last.endBar).toBe(Math.round(long.totalBeats / 4));
    expect(last.endBar - last.startBar).toBeLessThan(8);
    // A 4-bar loop repeats, so later 8-bar ranges are the same chords again.
    expect(model("long-300").segments[1]!.repeatGroup).toBe(2);
  });

  it("counts the three review rules exactly as the P10.0-00 audit (docs/phase10.0/evidence)", () => {
    // No melody voice: the proposed rule, as in the audit baseline (3).
    expect(flagged(model("melody-in-piano-8"), "melody")).toBe(3);
    // With a melody voice the song-wide suggestion takes the role-based reasons (spec v2.2 6.5); the
    // held-over top note still flags, so the counts equal the audit's "continued-top" column (3 / 31).
    expect(flagged(model("melody-track-8"), "melody")).toBe(3);
    expect(flagged(model("long-64"), "melody")).toBe(31);
    for (const id of ["plain-8", "hats-in-piano-8", "reattack-8", "repeat-pairs-8", "stabs-8", "long-64"]) {
      expect(flagged(model(id), "percussion"), id).toBe(0);
      expect(flagged(model(id), "same-chord-split"), id).toBe(0);
    }
    // The audit's "either" column for a song without a melody voice.
    const either = parseReviewThresholds({ ...reviewThresholds, melody: { ...reviewThresholds.melody, rule: "either" } });
    expect(flagged(buildCorrectionModel(scenario("melody-in-piano-8"), either), "melody")).toBe(3);
  });

  it("changes the counts when the numbers change", () => {
    const plain = scenario("hats-in-piano-8");
    const beats = plain.sourceData.notes.map((note) => ({ note, start: note.startTick / plain.sourceData.ticksPerBeat, end: (note.startTick + note.durationTick) / plain.sourceData.ticksPerBeat }));
    expect(percussionSuspectPitches(beats, reviewThresholds)).toEqual(new Set([37]));
    const strict = parseReviewThresholds({ ...reviewThresholds, percussion: { ...reviewThresholds.percussion, minRepeatsInSong: 1000 } });
    expect(percussionSuspectPitches(beats, strict).size).toBe(0);
    const heldOnly = parseReviewThresholds({ ...reviewThresholds, melody: { ...reviewThresholds.melody, rule: "melody-role-nonchord" } });
    expect(flagged(buildCorrectionModel(scenario("melody-in-piano-8"), heldOnly), "melody")).toBe(0);
  });

  it("makes one song-wide suggestion for a melody voice", () => {
    const built = model("melody-track-8");
    expect(built.suggestions).toHaveLength(1);
    expect(built.suggestions[0]).toMatchObject({ kind: "melody-voice", voiceLabel: "Lead", cardCount: 12 });
    expect(built.suggestions[0]!.noteIds.length).toBeGreaterThan(0);
    expect(model("melody-in-piano-8").suggestions).toHaveLength(0);
    expect(model("plain-8").suggestions).toHaveLength(0);
  });

  it("offers up to four distinct names and the chord tones that are not played", () => {
    const built = model("plain-8");
    for (const card of built.cards) {
      const names = nameCandidatesFor(card, built.notes.filter((note) => note.cardId === card.id));
      expect(names.length).toBeLessThanOrEqual(4);
      expect(new Set(names.map((name) => name.label)).size).toBe(names.length);
    }
    const g7sus4 = parseChordLabel("G7sus4")!;
    const diff = chordToneDiff(g7sus4, [55, 60, 62].map((pitch) => ({ pitch, used: true })));
    expect(diff.addable).toEqual(["F"]);
    expect(diff.currentTones).toEqual(["C", "D", "G"]);
    expect(nameCandidatesFor({ alternatives: [g7sus4] }, [{ pitch: 60, used: true }, { pitch: 67, used: true }]).map((name) => name.label)).toEqual(["G7sus4"]);
  });

  it("never uses the words 欠落・誤り・間違い", () => {
    for (const id of ["melody-in-piano-8", "melody-track-8", "long-64"]) {
      for (const card of model(id).cards) for (const reason of card.reviewReasons) expect(reason.text).not.toMatch(/欠落|誤り|間違い/);
    }
  });

  it("builds 300 bars in well under two seconds", () => {
    const input = scenario("long-300");
    const started = performance.now();
    const built = buildCorrectionModel(input, reviewThresholds);
    const elapsed = performance.now() - started;
    console.info(`P10.0-02 CorrectionModel 300 bars: ${built.cards.length} cards, ${built.notes.length} notes, ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(2000);
  });

  it("covers an input with a card that has no source voicing", () => {
    const item = { bar: 1, beat: 1, durationBeats: 4, chord: parseChordLabel("C")!, confidence: 1, alternatives: [], warnings: [] } satisfies ChordTimelineItem;
    const data: MidiSongData = { notes: [], ticksPerBeat: 480, totalBars: 1, tracks: [], controlChanges: [] };
    const built = buildCorrectionModel({ result: { fullTimeline: [item], totalBars: 1, bpm: 120, timeSignature: "4/4" }, sourceData: data, sourceVoices: [] as Voice[] }, reviewThresholds);
    expect(built.cards).toHaveLength(1);
    expect(built.notes).toHaveLength(0);
    expect(built.segments.map((segment) => segment.label)).toEqual(["1〜1小節"]);
    expect(built.pitchRange.high - built.pitchRange.low).toBeGreaterThanOrEqual(24);
  });
});
