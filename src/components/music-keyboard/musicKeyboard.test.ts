import { describe, expect, it } from "vitest";
import {
  BLACK_KEY_HEIGHT,
  BLACK_KEY_WIDTH,
  computePracticeKeyboardRange,
  createKeyboardDisplayState,
  createPianoKeyboardGeometry,
  DEFAULT_PRACTICE_KEYBOARD_RANGE,
  formatCLabel,
  formatMidiNoteForDisplay,
  KEYBOARD_HEIGHT,
  midiNoteToKeyboardGeometry,
  notesOutsideKeyboardRange,
  pianoKeyVisualState,
  WHITE_KEY_WIDTH,
} from ".";

describe("music keyboard note display", () => {
  it("uses the FL Studio octave convention", () => {
    expect(formatMidiNoteForDisplay(48)).toBe("C4");
    expect(formatMidiNoteForDisplay(60)).toBe("C5");
    expect(formatMidiNoteForDisplay(72)).toBe("C6");
    expect(formatMidiNoteForDisplay(46, "fl-studio", "flat")).toBe("Bb3");
    expect(formatMidiNoteForDisplay(46, "fl-studio", "sharp")).toBe("A#3");
  });

  it("returns labels for C keys only", () => {
    expect(formatCLabel(60)).toBe("C5");
    expect(formatCLabel(61)).toBeUndefined();
  });
});

describe("music keyboard range", () => {
  it("uses a four-octave fallback when no guide exists", () => {
    expect(computePracticeKeyboardRange([])).toEqual(DEFAULT_PRACTICE_KEYBOARD_RANGE);
  });

  it("snaps ordinary guide ranges to C and keeps a four-to-five octave span", () => {
    const range = computePracticeKeyboardRange([[46, 60, 62, 65, 67]]);

    expect(range.minMidiNote % 12).toBe(0);
    expect(range.maxMidiNote % 12).toBe(0);
    expect(range.maxMidiNote - range.minMidiNote).toBeGreaterThanOrEqual(48);
    expect(range.maxMidiNote - range.minMidiNote).toBeLessThanOrEqual(60);
    expect(range.minMidiNote).toBeLessThanOrEqual(46);
    expect(range.maxMidiNote).toBeGreaterThanOrEqual(67);
  });

  it("caps very wide and edge ranges at valid MIDI notes", () => {
    const wide = computePracticeKeyboardRange([[12, 115]]);
    const high = computePracticeKeyboardRange([[124, 127]]);

    expect(wide.maxMidiNote - wide.minMidiNote).toBe(60);
    expect(high.maxMidiNote).toBe(127);
    expect(high.minMidiNote).toBeGreaterThanOrEqual(0);
  });

  it("reports unique notes outside the fixed range", () => {
    expect(notesOutsideKeyboardRange([24, 24, 48, 96], { minMidiNote: 36, maxMidiNote: 84 }))
      .toEqual({ below: [24], above: [96] });
  });
});

describe("music keyboard geometry", () => {
  it("draws real white and black key proportions for one octave", () => {
    const geometry = createPianoKeyboardGeometry({ minMidiNote: 60, maxMidiNote: 72 });

    expect(geometry.whiteKeyCount).toBe(8);
    expect(geometry.blackKeyCount).toBe(5);
    expect(geometry.height).toBe(KEYBOARD_HEIGHT);
    expect(geometry.keys.filter((key) => key.black).every((key) => (
      key.width === BLACK_KEY_WIDTH && key.height === BLACK_KEY_HEIGHT
    ))).toBe(true);
    expect(geometry.keys.filter((key) => !key.black).every((key) => (
      key.width === WHITE_KEY_WIDTH && key.height === KEYBOARD_HEIGHT
    ))).toBe(true);
  });

  it("places black keys over the expected white-key boundaries", () => {
    const range = { minMidiNote: 60, maxMidiNote: 72 };
    const cSharp = midiNoteToKeyboardGeometry(61, range);
    const dSharp = midiNoteToKeyboardGeometry(63, range);
    const fSharp = midiNoteToKeyboardGeometry(66, range);

    expect(cSharp?.x).toBe(WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2);
    expect(dSharp?.x).toBe(WHITE_KEY_WIDTH * 2 - BLACK_KEY_WIDTH / 2);
    expect(fSharp?.x).toBe(WHITE_KEY_WIDTH * 4 - BLACK_KEY_WIDTH / 2);
  });

  it("keeps a stable positive viewBox for partial octaves", () => {
    const geometry = createPianoKeyboardGeometry({ minMidiNote: 61, maxMidiNote: 70 });

    expect(geometry.width).toBeGreaterThan(0);
    expect(Math.min(...geometry.keys.map((key) => key.x))).toBe(0);
    expect(geometry.keys.every((key) => key.x + key.width <= geometry.width)).toBe(true);
  });
});

describe("music keyboard visual state", () => {
  const input = {
    guideNotes: new Set([60, 64, 67, 72]),
    heldNotes: new Set([60, 61, 65]),
    sustainedNotes: new Set([64, 67]),
    allowedPitchClasses: new Set([0, 4, 7]),
  };

  it("applies foreign, overlap, guide, and sustain precedence", () => {
    expect(pianoKeyVisualState(61, input)).toBe("held-foreign");
    expect(pianoKeyVisualState(60, input)).toBe("guide-and-held");
    expect(pianoKeyVisualState(65, input)).toBe("held-foreign");
    expect(pianoKeyVisualState(64, input)).toBe("guide-and-sustained");
    expect(pianoKeyVisualState(67, input)).toBe("guide-and-sustained");
    expect(pianoKeyVisualState(72, input)).toBe("guide");
    expect(pianoKeyVisualState(62, input)).toBe("idle");
  });

  it("creates unique absolute-note display state using existing pitch-class requirements", () => {
    expect(createKeyboardDisplayState(
      [72, 60, 61, 60],
      [64, 64],
      [60, 64, 67],
      [0, 4, 7],
    )).toEqual({
      heldNotes: [60, 61, 72],
      sustainedNotes: [64],
      guideNotes: [60, 64, 67],
      foreignHeldNotes: [61],
    });
  });
});
