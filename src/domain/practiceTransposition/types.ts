import type {
  ChordSymbol,
  ChordTimelineItem,
  ChordVoicingMemory,
} from "../types";
import type { ResolvedVoicing } from "../voicing";
import type {
  PracticeChordRequirements,
  PracticeLeniency,
} from "../practice";
import type {
  ExactPitchMatchOptions,
  GenerateStyleVoicingOptions,
  GeneratedStyleVoicing,
  PracticeTargetSource,
  StyleVoicingMatchMode,
} from "../voicingPractice";

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

export type TransposedResolvedVoicingWarning =
  | {
      type: "generated-fallback";
      eventId: string;
    }
  | {
      type: "large-voicing-jump";
      fromEventId: string;
      toEventId: string;
      semitones: number;
    };

export interface TransposedResolvedVoicingEvent {
  eventId: string;
  sourceMidiNotes: number[];
  midiNotes: number[];
  origin: ResolvedVoicing["origin"];
  generatedFallback: boolean;
}

export interface TransposedResolvedVoicingPlan {
  globalOctaveOffset: number;
  events: TransposedResolvedVoicingEvent[];
  warnings: TransposedResolvedVoicingWarning[];
}

export type TransposedResolvedVoicingResult =
  | {
      ok: true;
      plan: TransposedResolvedVoicingPlan;
    }
  | {
      ok: false;
      reason: "midi-range-unavailable";
      minimumNote: number;
      maximumNote: number;
      allowedMinimum: number;
      allowedMaximum: number;
    };

export type PracticeTargetPlanMatchInput =
  | {
      type: "chord-symbol";
    }
  | {
      type: "voicing";
      mode: StyleVoicingMatchMode;
      exactPitchOptions: ExactPitchMatchOptions;
    };

export interface PracticeTargetPlanEvent {
  eventId: string;
  sourceEventId: string;
  chord: ChordSymbol;
  midiNotes: number[];
  leftHandNotes: number[];
  rightHandNotes: number[];
  ready: boolean;
  origin?: ResolvedVoicing["origin"];
  styleId?: GeneratedStyleVoicing["styleId"];
  variant?: string;
  addedColorIntervals: string[];
  warnings: string[];
  fallback: boolean;
  unsupportedReason?: string;
}

export interface PracticeTargetPlanUnsupportedEvent {
  eventId: string;
  chordLabel: string;
  reason: string;
}

export interface PracticeTargetPlan {
  targetSource: PracticeTargetSource;
  targetKey: KeySignature;
  events: PracticeTargetPlanEvent[];
  requirements: PracticeChordRequirements[];
  explicitMidiNotesByEventId: Record<string, number[]>;
  matchInput: PracticeTargetPlanMatchInput;
  /**
   * Resolved voicings do not contain a stable left/right-hand split.
   * Consumers must use this flag instead of inferring a split from note arrays.
   */
  handGuideMode: "none" | "split";
  unsupportedEvents: PracticeTargetPlanUnsupportedEvent[];
  warnings: TransposedResolvedVoicingWarning[];
  globalOctaveOffset?: number;
}

export interface CreatePracticeTargetPlanInput {
  progression: TransposedPracticeProgression;
  targetSource: PracticeTargetSource;
  leniency: PracticeLeniency;
  styleOptions?: GenerateStyleVoicingOptions;
  styleMatchMode?: StyleVoicingMatchMode;
  exactPitchOptions?: ExactPitchMatchOptions;
}

export type CreatePracticeTargetPlanResult =
  | {
      ok: true;
      plan: PracticeTargetPlan;
    }
  | {
      ok: false;
      reason: "midi-range-unavailable";
      minimumNote: number;
      maximumNote: number;
      allowedMinimum: number;
      allowedMaximum: number;
    };
