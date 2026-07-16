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
  bar: number;
  beat: number;
  durationBeats: number;
  chord: ChordSymbol;
  confidence: number;
  alternatives: { chord: ChordSymbol; confidence: number }[];
  warnings: string[];
}

export interface SavedProgressionBlock {
  id: string;
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
  capturedAt: string;
  analyzerVersion: string;
  sourceAnalyzerVersion?: string;
  sourceWeightsVersion?: string;
  userEdited?: boolean;
  userVerified?: boolean;
}

export interface ProgressionBlockCandidate {
  id: string;
  startBar: number;
  endBar: number;
  lengthBars: 4 | 8 | 16;
  chords: ChordTimelineItem[];
  summaryText: string;
  confidence: number;
  repeatCount?: number;
  labels: string[];
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
