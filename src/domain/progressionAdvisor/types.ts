export type AdvisorStrategy = "close_development" | "contrast" | "experimental";

export interface AdvisorChordEvent {
  bar: number;
  startBeat: number;
  durationBeats: number;
  chord: string;
}

export interface AdvisorReferenceContext {
  title?: string;
  key?: string;
  mode?: string;
  romanNumerals: string[];
  chordLabels: string[];
  tagIds: string[];
  verified: boolean;
}

export interface AdvisorRequest {
  schemaVersion: 1;
  progression: {
    title?: string;
    key?: string;
    mode?: string;
    bpm?: number;
    bars: number;
    timeSignature: string;
    events: AdvisorChordEvent[];
    romanNumerals?: string[];
    manualTagIds: string[];
    derivedTagIds: string[];
    origin?: string;
  };
  instruction?: string;
  output: {
    proposalCount: 3;
    barsPerProposal: 8;
    strategies: ["close_development", "contrast", "experimental"];
  };
  context?: AdvisorReferenceContext[];
}

export interface AdvisorResponse {
  schemaVersion: 1;
  analysis: string;
  suggestions: AdvisorSuggestion[];
  suggestedTagIds: string[];
}

export interface AdvisorSuggestion {
  id: string;
  strategy: AdvisorStrategy;
  label: string;
  intent: string;
  key?: string;
  mode?: string;
  bars: 8;
  timeSignature: "4/4";
  events: AdvisorChordEvent[];
  suggestedTagIds: string[];
}

export interface AdvisorValidationIssue {
  path: string;
  code:
    | "schema"
    | "strategy"
    | "taxonomy"
    | "chord"
    | "timing"
    | "coverage"
    | "duplicate";
  message: string;
}

export type AdvisorValidationResult =
  | { success: true; response: AdvisorResponse }
  | { success: false; issues: AdvisorValidationIssue[] };
