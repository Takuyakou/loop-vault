import { describe, expect, it } from "vitest";
import {
  LEGATO_GAP_BEATS, detectExtractionProfile, prepareMidiForAnalysis, repairLegato,
} from "./extractionProfile";
import { defaultPresenceThreshold, evaluateQualityEvidence } from "./qualityEvidence";
import type { MidiSongData, TimedNote } from "./types";

const ticksPerBeat = 480;

function note(
  pitch: number, startBeat: number, lengthBeats: number,
  trackIndex = 0, channel = 0,
): TimedNote {
  return {
    pitch,
    startTick: Math.round(startBeat * ticksPerBeat),
    durationTick: Math.round(lengthBeats * ticksPerBeat),
    velocity: 0.8,
    trackIndex,
    channel,
  };
}

function song(notes: TimedNote[], names: string[]): MidiSongData {
  return {
    notes,
    ticksPerBeat,
    totalBars: 8,
    timeSignature: "4/4",
    tracks: names.map((name, index) => ({ index, name })),
    controlChanges: [],
  };
}

/** A stem-separated export: one channel, stem names, fragmented sustains. */
function extractedSong(): MidiSongData {
  const notes: TimedNote[] = [];
  // Pad: a held chord chopped into sixteenths.
  for (let step = 0; step < 32; step += 1) {
    for (const pitch of [60, 64, 67]) {
      notes.push(note(pitch, step * 0.25, 0.24, 1));
    }
  }
  for (let beat = 0; beat < 8; beat += 1) notes.push(note(72 + (beat % 3), beat, 0.2, 2));
  for (let beat = 0; beat < 8; beat += 2) notes.push(note(36, beat, 0.9, 3));
  for (let step = 0; step < 16; step += 1) notes.push(note(42, step * 0.5, 0.05, 0, 9));
  return song(notes, ["drums", "synth_pad", "synth_lead", "electric_bass"]);
}

/** Hand-written MIDI: several channels, ordinary names, sustained notes. */
function authoredSong(): MidiSongData {
  const notes: TimedNote[] = [];
  for (let bar = 0; bar < 8; bar += 1) {
    for (const pitch of [60, 64, 67]) notes.push(note(pitch, bar * 4, 4, 0, 0));
    notes.push(note(48, bar * 4, 4, 1, 1));
    notes.push(note(72, bar * 4, 2, 2, 2));
  }
  return song(notes, ["Chords", "Bass line", "Top line"]);
}

describe("extraction profile detection", () => {
  it("fires on a stem-separated export", () => {
    const profile = detectExtractionProfile(extractedSong());
    expect(profile).not.toBeNull();
    expect(profile!.reasons).toContain("all-pitched-tracks-on-one-channel");
    expect(profile!.reasons).toContain("stem-style-track-names");
    expect(profile!.reasons).toContain("high-short-note-ratio");
    expect(profile!.reasons).toContain("stem-style-role-separation");
  });

  it("does not fire on hand-written MIDI", () => {
    expect(detectExtractionProfile(authoredSong())).toBeNull();
  });

  it("does not fire on stem names alone", () => {
    // Named like stems but multi-channel and sustained: ordinary MIDI.
    const notes: TimedNote[] = [];
    for (let bar = 0; bar < 8; bar += 1) {
      for (const pitch of [60, 64, 67]) notes.push(note(pitch, bar * 4, 4, 1, 0));
      notes.push(note(36, bar * 4, 4, 3, 1));
      notes.push(note(72, bar * 4, 4, 2, 2));
    }
    expect(detectExtractionProfile(
      song(notes, ["drums", "synth_pad", "synth_lead", "electric_bass"]),
    )).toBeNull();
  });

  it("does not fire on a single channel alone", () => {
    const notes: TimedNote[] = [];
    for (let bar = 0; bar < 8; bar += 1) {
      for (const pitch of [60, 64, 67]) notes.push(note(pitch, bar * 4, 4, 0, 0));
    }
    expect(detectExtractionProfile(song(notes, ["Piano"]))).toBeNull();
  });

  it("returns nothing for a percussion-only file", () => {
    const notes = Array.from({ length: 16 }, (_, step) => note(42, step * 0.5, 0.05, 0, 9));
    expect(detectExtractionProfile(song(notes, ["drums"]))).toBeNull();
  });
});

describe("legato repair", () => {
  it("joins repeated notes of the same pitch within the gap", () => {
    const notes = [note(60, 0, 0.24), note(60, 0.25, 0.24), note(60, 0.5, 0.24)];
    const repaired = repairLegato(notes, ticksPerBeat);
    expect(repaired).toHaveLength(1);
    expect(repaired[0].startTick).toBe(0);
    expect(repaired[0].durationTick).toBe(Math.round(0.74 * ticksPerBeat));
  });

  it("keeps notes separated by a real rest apart", () => {
    const notes = [note(60, 0, 0.5), note(60, 2, 0.5)];
    expect(repairLegato(notes, ticksPerBeat)).toHaveLength(2);
  });

  it("does not join different pitches or different tracks", () => {
    const notes = [note(60, 0, 0.24), note(64, 0.25, 0.24), note(60, 0.25, 0.24, 1)];
    expect(repairLegato(notes, ticksPerBeat)).toHaveLength(3);
  });

  it("uses a sixteenth note as the gap", () => {
    expect(LEGATO_GAP_BEATS).toBe(0.25);
    const justInside = [note(60, 0, 0.1), note(60, 0.25, 0.1)];
    const justOutside = [note(60, 0, 0.1), note(60, 0.4, 0.1)];
    expect(repairLegato(justInside, ticksPerBeat)).toHaveLength(1);
    expect(repairLegato(justOutside, ticksPerBeat)).toHaveLength(2);
  });
});

describe("raw notes are never modified", () => {
  it("leaves the parsed notes untouched while repairing the analysis copy", () => {
    const data = extractedSong();
    const before = JSON.stringify(data.notes);
    const prepared = prepareMidiForAnalysis(data);

    expect(JSON.stringify(data.notes)).toBe(before);
    expect(prepared.rawNotes).toBe(data.notes);
    expect(prepared.analysisNotes.length).toBeLessThan(data.notes.length);
  });

  it("keeps every attack in the raw notes", () => {
    const data = extractedSong();
    const prepared = prepareMidiForAnalysis(data);
    const rawAttacks = prepared.rawNotes.filter((entry) => entry.pitch === 60).length;
    expect(rawAttacks).toBe(32);
  });

  it("passes the notes through unchanged when the profile does not fire", () => {
    const data = authoredSong();
    const prepared = prepareMidiForAnalysis(data);
    expect(prepared.extractionProfile).toBeNull();
    expect(prepared.analysisNotes).toBe(data.notes);
  });
});

describe("presence threshold wiring", () => {
  /** Histogram where the third carries exactly `share` of the total weight. */
  function histogramWithThirdShare(share: number): { histogram: number[]; total: number } {
    const histogram = Array(12).fill(0) as number[];
    histogram[0] = 100 * (1 - share);
    histogram[4] = 100 * share;
    return { histogram, total: 100 };
  }

  it("counts a tone above the threshold and ignores one below it", () => {
    const below = histogramWithThirdShare(0.015);
    const above = histogramWithThirdShare(0.025);
    expect(evaluateQualityEvidence(0, "maj", below.histogram, below.total).coverage).toBe(0);
    expect(evaluateQualityEvidence(0, "maj", above.histogram, above.total).coverage).toBe(1);
  });

  it("moves with an explicit threshold rather than being ignored", () => {
    const { histogram, total } = histogramWithThirdShare(0.02);
    // The parameter is inert on the current corpus, so this checks the wiring
    // directly rather than trusting corpus results to exercise it.
    expect(evaluateQualityEvidence(0, "maj", histogram, total, { presenceThreshold: 0.01 }).coverage)
      .toBe(1);
    expect(evaluateQualityEvidence(0, "maj", histogram, total, { presenceThreshold: 0.05 }).coverage)
      .toBe(0);
  });

  it("uses the documented default", () => {
    expect(defaultPresenceThreshold).toBe(0.02);
  });
});
