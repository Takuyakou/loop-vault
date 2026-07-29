export type PreAnalysisVoiceRole =
  | "harmony"
  | "bass"
  | "melody-weak"
  | "exclude";

export type PreAnalysisSelectionPreset =
  | "auto"
  | "harmony-bass"
  | "accompaniment-only"
  | "all-pitched"
  | "custom";

export interface PreAnalysisTempoPoint {
  beat: number;
  bpm: number;
}

export interface PreAnalysisTimeSignaturePoint {
  beat: number;
  numerator: number;
  denominator: number;
}

export interface PreAnalysisMidiSource {
  id: string;
  displayName: string;
  smfType: 0 | 1 | 2;
  ppq: number;
  durationBeats: number;
  tempoMap: PreAnalysisTempoPoint[];
  timeSignatures: PreAnalysisTimeSignaturePoint[];
}

export interface PreAnalysisVoice {
  id: string;
  sourceId: string;
  trackIndex: number;
  channel: number;
  programNumbers: number[];
  dominantProgram?: number;
  gmProgramName?: string;
  trackName?: string;
  displayName: string;
  hasProgramChanges: boolean;
  isDrum: boolean;
  noteCount: number;
  minPitch?: number;
  maxPitch?: number;
  averageDurationBeats?: number;
  averagePolyphony?: number;
  autoRole: PreAnalysisVoiceRole;
  autoRoleConfidence: number;
  assignedRole: PreAnalysisVoiceRole;
  included: boolean;
  visible: boolean;
  muted: boolean;
  solo: boolean;
}

export interface PreAnalysisNote {
  sourceId: string;
  voiceId: string;
  trackIndex: number;
  channel: number;
  pitch: number;
  velocity: number;
  startBeat: number;
  durationBeats: number;
  program?: number;
  programExplicit?: boolean;
}

export interface PreAnalysisControlChange {
  sourceId: string;
  voiceId: string;
  trackIndex: number;
  channel: number;
  number: number;
  beat: number;
  value: number;
}

export interface PreAnalysisSourceScan {
  source: PreAnalysisMidiSource;
  voices: PreAnalysisVoice[];
  notes: PreAnalysisNote[];
  controlChanges: PreAnalysisControlChange[];
}

export type AnalysisSessionWarningCode =
  | "tempo-map-mismatch"
  | "time-signature-mismatch"
  | "duration-mismatch"
  | "start-position-mismatch"
  | "exact-duplicate"
  | "near-duplicate";

export interface AnalysisSessionWarning {
  code: AnalysisSessionWarningCode;
  sourceIds: string[];
  voiceIds?: string[];
}

export interface AnalysisSessionSource extends PreAnalysisMidiSource {
  bytes: Uint8Array;
  visible: boolean;
  muted: boolean;
}

export interface AnalysisSessionVoice extends PreAnalysisVoice {
  duplicateOf?: string;
  duplicateKind?: "exact";
}

export interface AnalysisSession {
  id: string;
  masterSourceId: string;
  sources: AnalysisSessionSource[];
  voices: AnalysisSessionVoice[];
  notes: PreAnalysisNote[];
  controlChanges: PreAnalysisControlChange[];
  preset: PreAnalysisSelectionPreset;
  warnings: AnalysisSessionWarning[];
  latestSourceId?: string;
}

export type MidiIntakeIssueCode =
  | "invalid-midi"
  | "unsupported-format"
  | "empty-midi";

export interface MidiIntakeIssue {
  inputIndex: number;
  code: MidiIntakeIssueCode;
  message: string;
}

export interface MidiSourceInput {
  bytes: Uint8Array;
  displayName: string;
  sourceId?: string;
}

export interface AnalysisSessionIntakeResult {
  session?: AnalysisSession;
  issues: MidiIntakeIssue[];
}
