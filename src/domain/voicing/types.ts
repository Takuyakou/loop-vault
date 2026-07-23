import type {
  ChordSymbol,
  ChordVoicingMemory,
  VoicingRepresentation,
  VoicingSnapshot,
} from "../types";
import type { TimedNote, Voice } from "../midi/types";

export type VoicingCompatibility = "compatible" | "stale" | "invalid";

export interface VoicingResolveOptions {
  autoUseConfidence?: number;
}

export interface ResolvedVoicing {
  midiNotes: number[];
  origin: "practice-override" | "source-verified" | "source-auto" | "generated";
  representation?: VoicingRepresentation;
}

export interface VoicingExtractionInput {
  chord: ChordSymbol;
  segment: {
    startBeat: number;
    endBeat: number;
  };
  notes: readonly TimedNote[];
  ticksPerBeat: number;
  voices?: readonly Voice[];
}

export interface ChordCoverageResult {
  requiredCoverage: number;
  optionalCoverage: number;
  foreignToneWeight: number;
  bassMatches: boolean;
}

export interface VoicingExtractionResult {
  snapshot?: VoicingSnapshot;
  status: "usable" | "review" | "not-found";
  reasons: string[];
}

export interface VoicingCandidate {
  midiNotes: number[];
  bassNote?: number;
  representation: VoicingRepresentation;
  durationBeats: number;
  onsetBeat: number;
  roleScore: number;
}

export type { ChordVoicingMemory, VoicingSnapshot };
