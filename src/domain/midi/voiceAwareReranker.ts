import { labelFromSymbol, makeChordSymbol } from "../chords";
import type { ChordSymbol, ChordTimelineItem, MidiProgressionAnalysis } from "../types";
import { extractHybridBlocks } from "./blocks";
import {
  chordTemplates,
  scoreChordCandidates,
  scoreStructuredChordCandidate,
  type ChordCandidateScore,
} from "./candidates";
import {
  chooseLegacyBoundaryCandidate,
  defaultLegacyBoundaryRerankerThresholds,
  materializeRerankedTimelineItem,
  type LegacyBoundaryRerankerThresholds,
} from "./legacyBoundaryReranker";
import { analyzeMidi as analyzeMidiLegacy } from "./legacy";
import { normalizeNotes } from "./normalize";
import { extractOrnamentFeatures } from "./ornaments";
import { parseMidi } from "./parser";
import type { WeightedPitchProfile } from "./profiles";
import { beatsPerBar } from "./timing";
import type {
  AnalysisInput,
  AnalyzeMidiOptions,
  VoiceEvidenceProfiles,
} from "./types";
import {
  annotateVoiceRoles,
  buildVoiceFeatureInputs,
} from "./voiceRoles";
import {
  buildVoiceAwarePitchProfile,
  buildVoiceRoleProfiles,
} from "./voiceProfiles";
import { buildVoices, voiceId } from "./voices";
import { defaultAnalyzerWeights, type AnalyzerWeights } from "./weights";

export const voiceAwareRerankerVersion = "voice-aware-rerank-v1";

export interface VoiceAwareRerankerOptions {
  analysisInput?: AnalysisInput;
  thresholds?: LegacyBoundaryRerankerThresholds;
}

export function analyzeMidiVoiceAwareRerank(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions = {},
  rerankerOptions: VoiceAwareRerankerOptions = {},
): MidiProgressionAnalysis {
  const data = parseMidi(bytes);
  const legacy = analyzeMidiLegacy(bytes, options);
  const normalizedNotes = normalizeNotes(data);
  const builtVoices = buildVoices(data);
  const suppliedInput = rerankerOptions.analysisInput ?? options.analysisInput;
  const features = buildVoiceFeatureInputs(builtVoices, normalizedNotes);
  const annotatedVoices = annotateVoiceRoles(
    builtVoices,
    features,
    suppliedInput?.roleOverrides,
  );
  const analysisInput: AnalysisInput = suppliedInput
    ? {
        voices: annotatedVoices,
        enabledVoiceIds: [...suppliedInput.enabledVoiceIds],
        roleOverrides: { ...suppliedInput.roleOverrides },
      }
    : {
        voices: annotatedVoices,
        enabledVoiceIds: annotatedVoices
          .filter((voice) => voice.inferredRole !== "percussion")
          .map((voice) => voice.id),
        roleOverrides: {},
      };
  const enabled = new Set(analysisInput.enabledVoiceIds);
  const evidenceNotes = normalizedNotes.filter(
    (note) => note.channel !== undefined && enabled.has(voiceId(note.trackIndex, note.channel)),
  );
  const weights: AnalyzerWeights = { ...defaultAnalyzerWeights, ...options.weights };
  const roles = buildVoiceRoleProfiles(
    annotatedVoices,
    buildVoiceFeatureInputs(annotatedVoices, normalizedNotes),
    analysisInput.roleOverrides,
  );
  const ornaments = extractOrnamentFeatures(evidenceNotes, weights);
  const barLengthBeats = beatsPerBar(data.timeSignature);
  const thresholds = rerankerOptions.thresholds ?? defaultLegacyBoundaryRerankerThresholds;

  const fullTimeline = evidenceNotes.length === 0
    ? legacy.fullTimeline.map((item) => retainedLegacyItem(item))
    : legacy.fullTimeline.map((item) => {
        const startBeat = (item.bar - 1) * barLengthBeats + item.beat - 1;
        const profile = buildVoiceAwarePitchProfile(
          evidenceNotes,
          { startBeat, endBeat: startBeat + item.durationBeats },
          roles,
          ornaments,
          barLengthBeats,
          weights,
        );
        if (!hasChordEvidence(profile)) return retainedLegacyItem(item);
        const candidates = scoreVoiceAwareChordCandidates(profile);
        const legacyCandidate = scoreVoiceAwareStructuredChordCandidate(profile, item.chord);
        return materializeRerankedTimelineItem(
          item,
          chooseLegacyBoundaryCandidate(legacyCandidate, candidates, thresholds),
          {
            replaced: "voice-aware-reranked",
            retained: "legacy-boundary-retained",
          },
        );
      });

  return {
    ...legacy,
    fullTimeline,
    blockCandidates: extractHybridBlocks(fullTimeline, legacy.totalBars, barLengthBeats),
    analyzerVersion: voiceAwareRerankerVersion,
  };
}

export function scoreVoiceAwareChordCandidates(
  profile: VoiceEvidenceProfiles,
  topK = 8,
): ChordCandidateScore[] {
  const bassEvidenceIsEmpty = !profile.bassEvidence.some((value) => value > 0);
  const candidateCount = bassEvidenceIsEmpty ? chordTemplates.length * 12 : topK;
  return normalizeVoiceAwareScores(
    scoreChordCandidates(weightedProfile(profile), undefined, candidateCount),
    profile,
  ).slice(0, topK);
}

export function scoreVoiceAwareStructuredChordCandidate(
  profile: VoiceEvidenceProfiles,
  chord: ChordSymbol,
): ChordCandidateScore {
  return normalizeVoiceAwareScores(
    [scoreStructuredChordCandidate(weightedProfile(profile), chord, undefined)],
    profile,
    chord,
  )[0];
}

function weightedProfile(profile: VoiceEvidenceProfiles): WeightedPitchProfile {
  const qualityPcs = profile.qualityEvidence.map(
    (value, index) => value + profile.tensionEvidence[index] * 0.35,
  );
  return {
    qualityPcs,
    rootPcs: [...profile.rootEvidence],
    bassPcs: [...profile.bassEvidence],
    topPcs: [...profile.tensionEvidence],
    totalWeight: qualityPcs.reduce((sum, value) => sum + value, 0),
  };
}

function normalizeVoiceAwareScores(
  candidates: readonly ChordCandidateScore[],
  profile: VoiceEvidenceProfiles,
  structuredChord?: ChordSymbol,
): ChordCandidateScore[] {
  if (profile.bassEvidence.some((value) => value > 0)) return [...candidates];
  return candidates.map((candidate) => {
    const chord = structuredChord ?? withoutBass(candidate.chord);
    return {
      ...candidate,
      chord,
      bassCompatibilityScore: 0,
      slashCompatibilityScore: 0,
      totalScore: candidate.totalScore
        - candidate.bassCompatibilityScore
        - candidate.slashCompatibilityScore,
      evidence: candidate.evidence.filter((entry) => entry.kind !== "bass"),
    };
  }).sort((left, right) => right.totalScore - left.totalScore
    || left.chord.label.localeCompare(right.chord.label));
}

function withoutBass(chord: ChordSymbol): ChordSymbol {
  const symbol = makeChordSymbol(chord.root, chord.quality, chord.tensions);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

function hasChordEvidence(profile: VoiceEvidenceProfiles): boolean {
  return profile.rootEvidence.some((value) => value > 0)
    || profile.qualityEvidence.some((value) => value > 0)
    || profile.tensionEvidence.some((value) => value > 0);
}

function retainedLegacyItem(item: ChordTimelineItem): ChordTimelineItem {
  return {
    ...item,
    warnings: [...new Set([...item.warnings, "legacy-boundary-retained"])],
  };
}
