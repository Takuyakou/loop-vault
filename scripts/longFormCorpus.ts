import { createHash } from "node:crypto";
import { writeMidi } from "midi-file";
import type { MidiEvent } from "midi-file";

/**
 * Long-form Corpus v1.1 generator.
 *
 * Synthetic Gold Corpus v1 answered where the pipeline loses a candidate, but
 * 32 of its 48 files are 8 to 32 bars. The failure the user actually reported —
 * a one-chord vamp taking the top of the list — needs a repeat count that only a
 * long song produces: on a 16-bar file the same vamp cannot recur four times
 * with 100 bars of other material around it. Every file here is 96 to 192 bars.
 *
 * Generation is deterministic: same seed, same bytes. The gold is what the
 * generator intended, recorded before anything is measured.
 */

export const PPQ = 480;
export const BEATS_PER_BAR = 4;

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Chord shapes, by the intervals that define them. */
const SHAPES = {
  maj: { intervals: [0, 4, 7], suffix: "" },
  min: { intervals: [0, 3, 7], suffix: "m" },
  maj7: { intervals: [0, 4, 7, 11], suffix: "maj7" },
  min7: { intervals: [0, 3, 7, 10], suffix: "m7" },
  dom7: { intervals: [0, 4, 7, 10], suffix: "7" },
  maj9: { intervals: [0, 4, 7, 11, 14], suffix: "maj9" },
  min9: { intervals: [0, 3, 7, 10, 14], suffix: "m9" },
  dom9: { intervals: [0, 4, 7, 10, 14], suffix: "9" },
  min11: { intervals: [0, 3, 7, 10, 14, 17], suffix: "m11" },
  dom13: { intervals: [0, 4, 7, 10, 14, 21], suffix: "13" },
  sus4: { intervals: [0, 5, 7], suffix: "sus4" },
  add9: { intervals: [0, 4, 7, 14], suffix: "add9" },
  six: { intervals: [0, 4, 7, 9], suffix: "6" },
  min7b5: { intervals: [0, 3, 6, 10], suffix: "m7b5" },
} as const;

export type ShapeName = keyof typeof SHAPES;

export interface ChordSpec {
  rootPc: number;
  shape: ShapeName;
  /** Pitch class in the bass when it is not the root. */
  bassPc?: number;
  /** Readings the corpus also accepts, written by the generator not measured. */
  acceptableAlternatives?: string[];
}

export interface RealisedChord {
  label: string;
  rootPc: number;
  bassPc: number;
  /** Bass note first, then the upper voices ascending. */
  notes: number[];
  pitchClasses: number[];
  acceptableAlternatives: string[];
}

function nameOf(pitchClass: number, preferSharp: boolean): string {
  const normalised = ((pitchClass % 12) + 12) % 12;
  return preferSharp ? SHARP_NAMES[normalised] : NOTE_NAMES[normalised];
}

/**
 * Turns a chord spec into notes.
 *
 * Upper voices ascend from C4 so a shape is never accidentally voiced as its own
 * inversion, and the bass sits in the C2 octave. Both choices only matter to make
 * the intended chord unambiguous in the audio; the label comes from the spec.
 */
export function realise(spec: ChordSpec, preferSharp = false): RealisedChord {
  const shape = SHAPES[spec.shape];
  const bassPc = spec.bassPc ?? spec.rootPc;
  const bass = 36 + (((bassPc % 12) + 12) % 12);

  let previous = 59;
  const upper = shape.intervals.map((interval) => {
    let note = 60 + (((spec.rootPc + interval) % 12) + 12) % 12;
    while (note <= previous) note += 12;
    previous = note;
    return note;
  });

  const rootName = nameOf(spec.rootPc, preferSharp);
  const label = bassPc === spec.rootPc
    ? `${rootName}${shape.suffix}`
    : `${rootName}${shape.suffix}/${nameOf(bassPc, preferSharp)}`;

  const notes = [bass, ...upper];
  return {
    label,
    rootPc: ((spec.rootPc % 12) + 12) % 12,
    bassPc: ((bassPc % 12) + 12) % 12,
    notes,
    pitchClasses: [...new Set(notes.map((note) => note % 12))].sort((left, right) => left - right),
    acceptableAlternatives: spec.acceptableAlternatives ?? [],
  };
}

/** One bar of harmony, or a rest. */
export interface BarPlan {
  /** Chords in this bar with their beat offsets and lengths, in beats. */
  chords: Array<{ spec: ChordSpec; startBeatInBar: number; durationBeats: number }>;
}

export function bar(spec: ChordSpec): BarPlan {
  return { chords: [{ spec, startBeatInBar: 0, durationBeats: BEATS_PER_BAR }] };
}

export function halfBars(first: ChordSpec, second: ChordSpec): BarPlan {
  return {
    chords: [
      { spec: first, startBeatInBar: 0, durationBeats: 2 },
      { spec: second, startBeatInBar: 2, durationBeats: 2 },
    ],
  };
}

export function rest(): BarPlan {
  return { chords: [] };
}

/** Held for `bars` bars as a single event. */
export function held(spec: ChordSpec, bars: number): BarPlan[] {
  return [
    { chords: [{ spec, startBeatInBar: 0, durationBeats: bars * BEATS_PER_BAR }] },
    ...Array.from({ length: bars - 1 }, () => ({ chords: [] as BarPlan["chords"] })),
  ];
}

export type StressFeature =
  | "all-channel-zero"
  | "track-reorder"
  | "fragmented-notes"
  | "humanized-timing"
  | "overlap-notes"
  | "dense-melody"
  | "voice-duplicate"
  | "walking-bass"
  | "rootless-harmony"
  | "arpeggiated-harmony"
  | "ghost-notes"
  | "different-voicing-per-occurrence"
  | "section-instrumentation-change";

export interface GoldEventOut {
  eventIndex: number;
  startBeatAbsolute: number;
  durationBeats: number;
  startBar: number;
  startBeatInBar: number;
  endBeatAbsolute: number;
  primary: string;
  acceptableAlternatives: string[];
  rootPitchClass: number;
  bassPitchClass: number;
  intendedVoicingMidi: number[];
  bassMidi: number;
  pitchClasses: number[];
  confidence: "high" | "medium";
  sectionId: string | null;
}

export interface ScenarioPlan {
  scenarioId: string;
  title: string;
  description: string;
  bpm: number;
  split: "dev" | "validation" | "holdout-v2";
  tags: string[];
  stressFeatures: StressFeature[];
  boundaryToleranceBeats: number;
  expectedInvariants: string[];
  sections: Array<{ id: string; startBar: number; endBar: number }>;
  expectedBlocks: Array<{
    id: string;
    start_bar: number;
    end_bar: number;
    block_type: "progression" | "vamp" | "fragment";
    usefulness: "must-show" | "secondary" | "exclude-from-main";
    pattern_id: string;
    expected_main_lane: boolean;
    rank_constraint: "top3" | "top10" | "after-progressions" | "other";
    notes: string;
  }>;
  expectedPatterns: Array<{
    pattern_id: string;
    normalized_description: string;
    expected_card_count: number;
    occurrences: Array<{ startBar: number; endBar: number }>;
    merge_policy: "merge" | "separate";
    notes: string;
  }>;
  bars: BarPlan[];
  /** Optional per-occurrence voicing shift, applied to bars in the given ranges. */
  voicingShifts?: Array<{ startBar: number; endBar: number; semitoneShift: number }>;
}

/** Deterministic generator so a fixture is reproducible from its seed alone. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

interface RawNote {
  startTick: number;
  durationTick: number;
  pitch: number;
  velocity: number;
  track: number;
  channel: number;
}

const TRACK_BASS = 0;
const TRACK_HARMONY = 1;
const TRACK_MELODY = 2;
const TRACK_DRUMS = 3;

/**
 * Builds the note list and the gold events together.
 *
 * They come from one pass so the labels can never drift from the audio: an event
 * is written at the same moment its notes are.
 */
export function realiseScenario(plan: ScenarioPlan, variant: "clean" | "stress") {
  const stress = variant === "stress" ? new Set(plan.stressFeatures) : new Set<StressFeature>();
  const random = makeRandom(
    [...plan.scenarioId].reduce((sum, character) => sum * 31 + character.charCodeAt(0), 7)
    + (variant === "stress" ? 977 : 0),
  );

  const notes: RawNote[] = [];
  const events: GoldEventOut[] = [];
  const sectionOf = (barNumber: number) => plan.sections.find(
    (section) => barNumber >= section.startBar && barNumber <= section.endBar,
  )?.id ?? null;

  const shiftFor = (barNumber: number) => (stress.has("different-voicing-per-occurrence")
    ? plan.voicingShifts?.find(
      (shift) => barNumber >= shift.startBar && barNumber <= shift.endBar,
    )?.semitoneShift ?? 0
    : 0);

  plan.bars.forEach((barPlan, index) => {
    const barNumber = index + 1;
    const barStartBeat = index * BEATS_PER_BAR;

    for (const entry of barPlan.chords) {
      const chord = realise(entry.spec);
      const startBeat = barStartBeat + entry.startBeatInBar;
      const startTick = Math.round(startBeat * PPQ);
      const lengthTick = Math.round(entry.durationBeats * PPQ);
      const shift = shiftFor(barNumber);

      events.push({
        eventIndex: events.length,
        startBeatAbsolute: startBeat,
        durationBeats: entry.durationBeats,
        startBar: barNumber,
        startBeatInBar: entry.startBeatInBar + 1,
        endBeatAbsolute: startBeat + entry.durationBeats,
        primary: chord.label,
        acceptableAlternatives: chord.acceptableAlternatives,
        rootPitchClass: chord.rootPc,
        bassPitchClass: chord.bassPc,
        intendedVoicingMidi: chord.notes,
        bassMidi: chord.notes[0],
        pitchClasses: chord.pitchClasses,
        confidence: chord.bassPc === chord.rootPc ? "high" : "medium",
        sectionId: sectionOf(barNumber),
      });

      // Bass. A walking line keeps the same pitch class on the downbeat so the
      // chord's bass is still stated; only the notes between it move.
      const bassPitch = chord.notes[0];
      if (stress.has("walking-bass")) {
        const steps = Math.max(1, Math.round(entry.durationBeats));
        for (let step = 0; step < steps; step += 1) {
          const offset = step === 0 ? 0 : [3, 5, 7, 2][step % 4];
          notes.push({
            startTick: startTick + step * PPQ,
            durationTick: Math.round(PPQ * 0.9),
            pitch: bassPitch + offset,
            velocity: 96,
            track: TRACK_BASS,
            channel: 1,
          });
        }
      } else {
        notes.push({
          startTick,
          durationTick: lengthTick,
          pitch: bassPitch,
          velocity: 96,
          track: TRACK_BASS,
          channel: 1,
        });
      }

      // Harmony. `rootless-harmony` drops the root from the upper voicing, which
      // is what a jazz player does and what the detector has to survive.
      let upper = chord.notes.slice(1).map((note) => note + shift);
      if (stress.has("rootless-harmony") && upper.length > 2) {
        upper = upper.filter((note) => note % 12 !== chord.rootPc);
      }

      if (stress.has("arpeggiated-harmony")) {
        const perNote = entry.durationBeats / Math.max(1, upper.length);
        upper.forEach((pitch, position) => {
          notes.push({
            startTick: startTick + Math.round(position * perNote * PPQ),
            durationTick: Math.round(perNote * PPQ * 0.9),
            pitch,
            velocity: 88,
            track: TRACK_HARMONY,
            channel: 0,
          });
        });
      } else if (stress.has("fragmented-notes")) {
        // Extraction fragments a held chord into repeated short notes.
        const pieces = Math.max(2, Math.round(entry.durationBeats * 2));
        for (let piece = 0; piece < pieces; piece += 1) {
          for (const pitch of upper) {
            notes.push({
              startTick: startTick + Math.round((piece * entry.durationBeats / pieces) * PPQ),
              durationTick: Math.round((entry.durationBeats / pieces) * PPQ * 0.75),
              pitch,
              velocity: 84,
              track: TRACK_HARMONY,
              channel: 0,
            });
          }
        }
      } else {
        for (const pitch of upper) {
          const jitter = stress.has("humanized-timing") ? Math.round((random() - 0.5) * PPQ * 0.12) : 0;
          const stretch = stress.has("overlap-notes") ? Math.round(PPQ * 0.3) : 0;
          notes.push({
            startTick: Math.max(0, startTick + jitter),
            durationTick: lengthTick + stretch,
            pitch,
            velocity: 88,
            track: TRACK_HARMONY,
            channel: 0,
          });
        }
      }

      if (stress.has("voice-duplicate")) {
        for (const pitch of upper) {
          notes.push({
            startTick,
            durationTick: lengthTick,
            pitch: pitch + 12,
            velocity: 64,
            track: TRACK_HARMONY,
            channel: 0,
          });
        }
      }

      if (stress.has("dense-melody")) {
        // Eighth notes drawn from the chord plus one passing tone, so the melody
        // is dense without inventing a different harmony.
        const eighths = Math.round(entry.durationBeats * 2);
        for (let step = 0; step < eighths; step += 1) {
          const pool = [...chord.pitchClasses, (chord.rootPc + 1) % 12];
          const pitchClass = pool[Math.floor(random() * pool.length)];
          notes.push({
            startTick: startTick + Math.round(step * PPQ * 0.5),
            durationTick: Math.round(PPQ * 0.45),
            pitch: 79 + ((pitchClass - 79 % 12 + 24) % 12),
            velocity: 72,
            track: TRACK_MELODY,
            channel: 2,
          });
        }
      }

      if (stress.has("ghost-notes")) {
        notes.push({
          startTick: startTick + Math.round(PPQ * 0.25),
          durationTick: Math.round(PPQ * 0.1),
          pitch: chord.notes[1] + 1,
          velocity: 12,
          track: TRACK_HARMONY,
          channel: 0,
        });
      }
    }

    // A drum pulse on every bar, so a rest bar is silent harmonically without
    // being silent in the file — the case that separates "no harmony" from
    // "nothing at all".
    for (let beat = 0; beat < BEATS_PER_BAR; beat += 1) {
      notes.push({
        startTick: Math.round((barStartBeat + beat) * PPQ),
        durationTick: Math.round(PPQ * 0.25),
        pitch: beat % 2 === 0 ? 36 : 38,
        velocity: 100,
        track: TRACK_DRUMS,
        channel: 9,
      });
    }
  });

  return { notes, events, stress };
}

const TRACK_NAMES = ["bass", "harmony", "melody", "drums"];

export function encodeMidi(
  plan: ScenarioPlan,
  notes: readonly RawNote[],
  stress: ReadonlySet<StressFeature>,
): Uint8Array {
  const usedTracks = [...new Set(notes.map((note) => note.track))].sort((left, right) => left - right);
  const order = stress.has("track-reorder") ? [...usedTracks].reverse() : usedTracks;

  const tracks: MidiEvent[][] = [];

  // Conductor track: tempo and meter only.
  const microsecondsPerBeat = Math.round(60_000_000 / plan.bpm);
  tracks.push([
    { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat } as MidiEvent,
    {
      deltaTime: 0,
      meta: true,
      type: "timeSignature",
      numerator: 4,
      denominator: 4,
      metronome: 24,
      thirtyseconds: 8,
    } as MidiEvent,
    { deltaTime: 0, meta: true, type: "endOfTrack" } as MidiEvent,
  ]);

  for (const trackIndex of order) {
    const trackNotes = notes.filter((note) => note.track === trackIndex);
    // Drums keep channel 9 whatever else happens: collapsing them onto channel 0
    // would turn percussion into harmony, which is a different scenario.
    const channel = trackIndex === TRACK_DRUMS
      ? 9
      : (stress.has("all-channel-zero") ? 0 : trackNotes[0]?.channel ?? 0);

    const points: Array<{ tick: number; event: MidiEvent }> = [];
    for (const note of trackNotes) {
      points.push({
        tick: note.startTick,
        event: { deltaTime: 0, type: "noteOn", channel, noteNumber: note.pitch, velocity: note.velocity } as MidiEvent,
      });
      points.push({
        tick: note.startTick + note.durationTick,
        event: { deltaTime: 0, type: "noteOff", channel, noteNumber: note.pitch, velocity: 0 } as MidiEvent,
      });
    }
    points.sort((left, right) => left.tick - right.tick
      || (left.event.type === "noteOff" ? -1 : 1) - (right.event.type === "noteOff" ? -1 : 1));

    const track: MidiEvent[] = [
      { deltaTime: 0, meta: true, type: "trackName", text: TRACK_NAMES[trackIndex] } as MidiEvent,
    ];
    let previousTick = 0;
    for (const point of points) {
      track.push({ ...point.event, deltaTime: point.tick - previousTick });
      previousTick = point.tick;
    }
    track.push({ deltaTime: 0, meta: true, type: "endOfTrack" } as MidiEvent);
    tracks.push(track);
  }

  return Uint8Array.from(writeMidi({
    header: { format: 1, numTracks: tracks.length, ticksPerBeat: PPQ },
    tracks,
  }));
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
