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
}

export interface PreAnalysisSourceScan {
  source: PreAnalysisMidiSource;
  voices: PreAnalysisVoice[];
  notes: PreAnalysisNote[];
}
