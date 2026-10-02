import { describe, expect, it } from "vitest";
import { buildScenarioMidi, p10Scenario } from "../../testing/p10SyntheticSongs";
import { analyzeScenario } from "../../testing/p10SyntheticCapture";
import { buildCorrectionModel } from "../../domain/correction/correctionModel";
import { reviewThresholds } from "../../domain/correction/reviewThresholds";
import { cardLabel, cardSize, followScrollLeft, overlaps, playheadBeatAt, timelineFrom, visibleBeatRange, zoomScrollLeft } from "./workspaceGeometry";
import { createTimelineVoicingPlaybackPlan } from "../../domain/voicing";
import type { ChordTimelineItem } from "../../domain/types";

describe("workspace geometry (P10.0-05)", () => {
  it("draws the visible beats plus one view each side, clamped at both ends", () => {
    // 16 bars of 4/4 in 640px → 10px a beat; the view shows 64 beats.
    expect(visibleBeatRange(0, 640, 10, 1200)).toEqual({ from: 0, to: 128 });
    expect(visibleBeatRange(6400, 640, 10, 1200)).toEqual({ from: 576, to: 768 });
    // End: the last view, nothing past the song.
    expect(visibleBeatRange(11360, 640, 10, 1200)).toEqual({ from: 1072, to: 1200 });
    // Zoomed in (4 bars = 16 beats in 640px): a narrower range.
    expect(visibleBeatRange(4000, 640, 40, 1200)).toEqual({ from: 84, to: 132 });
    // Before the first layout: everything.
    expect(visibleBeatRange(0, 0, 10, 1200)).toEqual({ from: 0, to: 1200 });
    expect(overlaps(127, 4, { from: 0, to: 128 })).toBe(true);
    expect(overlaps(128, 4, { from: 0, to: 128 })).toBe(false);
  });

  it("follows past 80% and puts the playhead at 20%", () => {
    expect(followScrollLeft(50, 0, 640, 10)).toBeUndefined(); // x = 500 ≤ 512
    expect(followScrollLeft(52, 0, 640, 10)).toBe(392); // x = 520 > 512 → 520 − 128
    expect(followScrollLeft(10, 400, 640, 10)).toBe(0); // behind the view: jump back
  });

  it("puts the playhead on the beat the song has reached (P10.0-07)", () => {
    expect(playheadBeatAt(1000, 1000, 120, 0)).toBe(0);
    expect(playheadBeatAt(1500, 1000, 120, 0)).toBe(1); // half a second at 120 BPM
    expect(playheadBeatAt(3000, 1000, 90, 4)).toBe(7); // starts at the first card
    expect(playheadBeatAt(900, 1000, 120, 2)).toBe(2); // never before the start
    // Every frame is a new position: 60 frames in a second give 60 different values.
    const positions = new Set(Array.from({ length: 60 }, (_, frame) => playheadBeatAt(1000 + frame * 16.7, 1000, 96, 0)));
    expect(positions.size).toBe(60);
  });

  it("keeps the beat under the pointer when zooming", () => {
    const beat = (300 + 200) / 10; // scrollLeft 300, pointer at 200px, 10px a beat
    const next = zoomScrollLeft(beat, 200, 12.5);
    expect((next + 200) / 12.5).toBeCloseTo(beat);
    expect(zoomScrollLeft(2, 200, 12.5)).toBe(0);
  });

  it("shows only the root when a name does not fit, never a cut name", () => {
    expect(cardSize(13)).toBe("bare");
    expect(cardSize(14)).toBe("tiny");
    expect(cardSize(39)).toBe("tiny");
    expect(cardSize(71)).toBe("narrow");
    expect(cardLabel("Fmaj7", 200)).toBe("Fmaj7");
    expect(cardLabel("Fmaj7", 30)).toBe("F");
    expect(cardLabel("Bbm7b5", 50)).toBe("Bb");
    expect(cardLabel("C#dim7", 30)).toBe("C#");
    expect(cardLabel("Fmaj7", 10)).toBe("");
    // From 14px a root letter shows (P10.0-06); a root with an accidental needs more.
    expect(cardLabel("Fmaj7", 14)).toBe("F");
    expect(cardLabel("F#m7", 14)).toBe("");
    expect(cardLabel("F#m7", 22)).toBe("F#");
    expect(cardLabel("Fmaj7", 60)).not.toContain("·");
  });

  it("builds the 300-bar, 5,000-note song in well under a second", () => {
    expect(buildScenarioMidi(p10Scenario("long-300-5k")).byteLength).toBeGreaterThan(0);
    const input = analyzeScenario(p10Scenario("long-300-5k"));
    expect(input.sourceData.notes).toHaveLength(5000);
    const t0 = performance.now();
    const model = buildCorrectionModel(input, reviewThresholds);
    const ms = performance.now() - t0;
    console.log(`P10.0-05 CorrectionModel 300 bars / 5,000 notes: ${model.cards.length} cards, ${model.notes.length} fragments, ${ms.toFixed(1)}ms`);
    expect(model.cards.length).toBeGreaterThan(250);
    expect(ms).toBeLessThan(1000);
  });
});

describe("playback from the selected card (P10.1)", () => {
  const { result } = analyzeScenario(p10Scenario("plain-8"));
  const timeline = result.fullTimeline;
  const notesOf = (items: readonly ChordTimelineItem[]) => {
    const plan = createTimelineVoicingPlaybackPlan(items, "capture-full");
    return plan.timeline.map((item) => ({ chord: item.chord.label, notes: plan.explicitMidiNotesByEventId[item.eventId!] ?? null }));
  };

  it("is the whole song when nothing is selected", () => {
    expect(timelineFrom(timeline, undefined, 4)).toEqual(timeline);
    expect(notesOf(timelineFrom(timeline, undefined, 4))).toEqual(notesOf(timeline));
  });

  it("starts at the selected card and plays the same notes, in the same order, as the whole song from there", () => {
    const from = timelineFrom(timeline, 8, 4); // bar 3
    expect(from[0]).toMatchObject({ bar: 3, beat: 1 });
    expect(from).toHaveLength(timeline.length - 2);
    expect(notesOf(from)).toEqual(notesOf(timeline).slice(2));
  });

  it("clips a chord sounding at the start beat to begin there (the gap closes)", () => {
    const from = timelineFrom(timeline, 10, 4); // the middle of bar 3
    expect(from[0]).toMatchObject({ bar: 3, beat: 3, durationBeats: 2, chord: timeline[2]!.chord });
    expect(notesOf(from)[0]!.notes).toEqual(notesOf(timeline)[2]!.notes);
    expect(timelineFrom(timeline, 32, 4)).toEqual([]);
  });
});
