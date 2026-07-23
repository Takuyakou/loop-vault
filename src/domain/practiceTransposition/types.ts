import type {
  ChordSymbol,
  ChordTimelineItem,
  ChordVoicingMemory,
} from "../types";

export type SupportedPracticeMode = "major" | "minor";
export type AccidentalPreference = "sharp" | "flat";
export type PracticeKeyLanguage = "ja" | "en";

export interface KeySignature {
  readonly tonicPitchClass: number;
  readonly mode: SupportedPracticeMode;
  readonly canonicalName: string;
  readonly accidentalPreference: AccidentalPreference;
  readonly labels: Readonly<Record<PracticeKeyLanguage, string>>;
}

export interface PracticeProgressionReference {
  readonly ideaId: string;
  readonly blockId: string;
}

export interface TranspositionPracticeInput {
  sourceKey: KeySignature;
  sourceMode: SupportedPracticeMode;
  events: readonly ChordTimelineItem[];
  targetTonicPitchClass: number;
  sourceReference: PracticeProgressionReference;
}

export interface TransposedPracticeEvent extends Omit<
  ChordTimelineItem,
  "eventId" | "chord" | "voicingMemory"
> {
  eventId: string;
  sourceEventId: string;
  chord: ChordSymbol;
  romanNumeral: string;
  sourceVoicingMemory?: ChordVoicingMemory;
}

export interface TransposedPracticeProgression {
  sourceKey: KeySignature;
  targetKey: KeySignature;
  semitoneShift: number;
  events: TransposedPracticeEvent[];
}

export interface KeyBagState {
  remaining: number[];
  completed: number[];
  seed: number;
}

export interface KeyBagSelection {
  keyPitchClass?: number;
  nextState: KeyBagState;
}
