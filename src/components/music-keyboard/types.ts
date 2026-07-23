export type KeyboardOctaveConvention = "fl-studio";

export type NoteAccidentalStyle = "sharp" | "flat";
export type PianoGuideHand = "left" | "right";

export interface KeyboardRange {
  minMidiNote: number;
  maxMidiNote: number;
}

export interface PianoKeyGeometry {
  note: number;
  black: boolean;
  x: number;
  width: number;
  height: number;
}

export interface PianoKeyboardGeometry {
  keys: PianoKeyGeometry[];
  width: number;
  height: number;
  whiteKeyCount: number;
  blackKeyCount: number;
}

export type PianoKeyVisualState =
  | "idle"
  | "guide"
  | "held-correct"
  | "held-foreign"
  | "sustained"
  | "guide-and-held"
  | "guide-and-sustained";

export interface KeyboardDisplayState {
  heldNotes: number[];
  sustainedNotes: number[];
  guideNotes: number[];
  foreignHeldNotes: number[];
}

export interface KeyboardOutsideNotes {
  below: number[];
  above: number[];
}
