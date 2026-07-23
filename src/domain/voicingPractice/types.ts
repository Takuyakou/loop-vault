import type {
  ChordSymbol,
  ChordTimelineItem,
} from "../types";

export type VoicingStyleId =
  | "shell-17"
  | "open-17"
  | "rootless-ab";

export type GeneratedVoicingStyleId =
  | "generated-close"
  | VoicingStyleId;

export type PracticeTargetSource =
  | {
      type: "resolved-voicing";
    }
  | {
      type: "generated-close";
    }
  | {
      type: "style";
      styleId: VoicingStyleId;
      rootlessVariantPolicy?: "auto";
    };

export type StyleVoicingWarning =
  | "unsupported-chord"
  | "fallback-close"
  | "span-reduced"
  | "optional-tone-omitted"
  | "added-neutral-color"
  | "low-interval-adjusted";

export interface GeneratedStyleVoicing {
  eventId: string;
  chordKey: string;
  styleId: GeneratedVoicingStyleId;
  generatorVersion: number;
  leftHandNotes: number[];
  rightHandNotes: number[];
  allNotes: number[];
  variant?: string;
  requiredIntervals: string[];
  addedColorIntervals: string[];
  omittedIntervals: string[];
  warnings: StyleVoicingWarning[];
}

export interface GeneratedStyleVoicingPlan {
  progressionFingerprint: string;
  styleId: GeneratedVoicingStyleId;
  generatorVersion: number;
  events: GeneratedStyleVoicing[];
  unsupportedEvents: {
    eventId: string;
    chordLabel: string;
    reason: string;
  }[];
}

export interface VoicingPracticePreferences {
  maxLeftHandSpanSemitones: 12 | 14 | 16;
  maxRightHandSpanSemitones: 12 | 14 | 16;
  allowGlobalOctaveShift: boolean;
}

export interface StyleCompatibility {
  supported: boolean;
  reason?: string;
  fallbackStyleId?: "generated-close";
}

export interface StyleTonePolicy {
  requiredIntervals: string[];
  preferredIntervals: string[];
  droppableIntervals: string[];
  forbiddenIntervals: string[];
}

export interface GenerateStyleVoicingOptions {
  maxLeftHandSpanSemitones: number;
  maxRightHandSpanSemitones: number;
  allowUnsupportedFallback: boolean;
}

export type StyleVoicingMatchMode =
  | "exact-pitch"
  | "pitch-class";

export interface ExactPitchMatchOptions {
  allowGlobalOctaveShift: boolean;
  octaveShiftCandidates: readonly number[];
}

export interface ChordToneDescriptor {
  interval: number;
  label: string;
  pitchClass: number;
  explicit: boolean;
}

export type SavedChordEvent = ChordTimelineItem;

export interface StyleCatalogEntry {
  id: VoicingStyleId;
  labelKey: VoicingStyleId;
  supports(chord: ChordSymbol): boolean;
}
