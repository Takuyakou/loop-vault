import type { BlockQualityComponents } from "./midi/blockQuality";
import type { CandidatePattern } from "./midi/occurrence";
import type { CandidateCatalog } from "./midi/candidateCatalog";
import type { RecommendationResult } from "./midi/candidateRecommendation";
import type { Section } from "./midi/sections";
import type { CandidateChordEvent, CandidateChordStats } from "./midi/candidateBlock";
import type { ProgressionPracticeProgress } from "./practice/types";

export type Status =
  | "idea"
  | "loop"
  | "arrange"
  | "mix"
  | "done"
  | "hold"
  | "abandoned";

export type AssetType = "midi" | "audio" | "flp" | "other";
export type AppLanguage = "ja" | "en";

export interface StatusHistoryEntry {
  status: Status;
  at: string;
  reason?: string;
}

export type ChordQuality =
  | "maj" | "min" | "dim" | "aug" | "maj7" | "min7" | "dom7" | "min7b5" | "dim7"
  | "maj9" | "min9" | "dom9" | "min11" | "dom13" | "sus2" | "sus4" | "dom7sus4"
  | "add9" | "six" | "min6" | "sixNine";
export type Tension = "9" | "b9" | "#9" | "11" | "#11" | "13" | "b13";

export interface ChordSymbol {
  root: number;
  quality: ChordQuality;
  tensions: Tension[];
  bass?: number;
  label: string;
}

export interface ChordTimelineItem {
  eventId?: string;
  bar: number;
  beat: number;
  durationBeats: number;
  chord: ChordSymbol;
  confidence: number;
  alternatives: { chord: ChordSymbol; confidence: number }[];
  warnings: string[];
  voicingMemory?: ChordVoicingMemory;
}

export type VoicingSource =
  | "midi-extracted"
  | "live-played"
  | "chord-drip"
  | "manual";

export type VoicingRepresentation =
  | "simultaneous-voicing"
  | "aggregated-note-set";

export interface VoicingSnapshot {
  schemaVersion: 1;
  source: VoicingSource;
  representation: VoicingRepresentation;
  midiNotes: number[];
  bassNote?: number;
  capturedForChordKey: string;
  capturedForChordLabel?: string;
  confidence?: number;
  userVerified?: boolean;
  extractorVersion?: string;
}

export interface ChordVoicingMemory {
  sourceVoicing?: VoicingSnapshot;
  practiceVoicingOverride?: VoicingSnapshot;
}

export interface SuppressedAutoTag {
  tagId: string;
  taxonomyVersion: number;
}

export interface SavedProgressionBlock {
  id: string;
  origin?: "live-midi";
  confidence?: number;
  pinned?: boolean;
  sourceAssetId?: string;
  sourceFileName?: string;
  sourceFingerprint?: string;
  sourceStartBeat?: number;
  sourceEndBeat?: number;
  startBar?: number;
  endBar?: number;
  lengthBars?: number;
  summaryText: string;
  chords: ChordTimelineItem[];
  detectedKey?: string;
  bpm?: number;
  timeSignature?: string;
  memo?: string;
  tags: string[];
  suppressedAutoTags?: SuppressedAutoTag[];
  capturedAt: string;
  analyzerVersion: string;
  sourceAnalyzerVersion?: string;
  sourceWeightsVersion?: string;
  userEdited?: boolean;
  userVerified?: boolean;
  practice?: ProgressionPracticeProgress;
}

export interface ProgressionBlockCandidate {
  id: string;
  startBar: number;
  endBar: number;
  lengthBars: 2 | 4 | 8 | 16;
  /** Timeline events starting inside the block. Kept for existing consumers. */
  chords: ChordTimelineItem[];
  /**
   * Every timeline event overlapping the block, with block-relative timing.
   * This is the candidate's real content: it keeps both chords of a two-chord
   * bar and the full length of a chord sustained across bars.
   */
  events?: CandidateChordEvent[];
  stats?: CandidateChordStats;
  /** Dedup and repeat identity, built from structure rather than display text. */
  structuredSignature?: string;
  summaryText: string;
  confidence: number;
  selectionScore?: number;
  /** Non-persistent score breakdown, for diagnostics. */
  quality?: BlockQualityComponents;
  repeatCount?: number;
  labels: string[];
  /**
   * Which lane the candidate belongs in.
   *
   * Non-persistent and presentational. A vamp is a musical shape, not a weak
   * progression, so it gets its own lane rather than being hidden or scored down;
   * a fragment stays out of the main lane unless nothing else exists.
   */
  kind?: "progression" | "vamp" | "fragment";
  warnings: string[];
}

export interface MidiProgressionAnalysis {
  sourceAssetId?: string;
  fileName?: string;
  sourceFingerprint?: string;
  totalBars: number;
  bpm?: number;
  timeSignature?: string;
  detectedKey?: string;
  fullTimeline: ChordTimelineItem[];
  blockCandidates: ProgressionBlockCandidate[];
  /**
   * Every appearance of each progression, grouped by shape. Non-persistent:
   * it exists so the UI can offer the other positions of a progression instead
   * of hiding them behind one representative.
   */
  candidatePatterns?: CandidatePattern[];
  /**
   * Every valid pattern, whether or not it was recommended. Non-persistent.
   *
   * `blockCandidates` is a ranked shortlist and always has been; anything it left
   * out used to be gone. The catalog is the full inventory the shortlist points
   * into, so a progression that ranks poorly is still reachable.
   */
  candidateCatalog?: CandidateCatalog;
  /**
   * Which catalog patterns to show first, and why. Non-persistent.
   *
   * The count is dynamic: one eligible pattern yields one recommendation, and
   * none yields an empty list rather than a padded one.
   */
  candidateRecommendation?: RecommendationResult;
  /** Estimated section ranges, numbered rather than named. */
  sections?: Section[];
  analyzedAt: string;
  analyzerVersion: string;
}

export interface SongIdea {
  id: string;
  title: string;
  bpm?: number;
  key?: string;
  genre?: string;
  moods: string[];
  status: Status;
  prevStatus?: Status;
  nextAction: {
    text: string;
    updatedAt: string;
  };
  chordMemo: string;
  references: { title: string; url?: string; memo?: string }[];
  assets: {
    id: string;
    type: AssetType;
    path?: string;
    memo?: string;
    missing?: boolean;
  }[];
  chordDrip?: unknown;
  progressionBlocks?: SavedProgressionBlock[];
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface VaultFile {
  app: "loopvault";
  fileVersion: 1;
  settings: { monthlyGoal: number; language: AppLanguage; showRomanNumerals?: boolean };
  ideas: SongIdea[];
}
