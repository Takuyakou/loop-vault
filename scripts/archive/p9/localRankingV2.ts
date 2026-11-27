/** P9.5 research-only factorized local ranking. No Gold, decoder or Product state is read. */
import { generateCandidates, type Candidate } from "../p7/candidateRepresentations";
import type { HarmonicIdentity } from "../p7/harmonicTruth";
import type { RankingNote } from "./rankingAuthoredGold";
export type RankingPolicy = "OLD" | "PITCH_BASS" | "FACTOR_NO_CONTEXT" | "FACTOR_CONTEXT";
export interface RankingFeatures {
  pitch: number; bass: number; voiceRole: number; duration: number;
  boundary: number; definingTension: number; nctPenalty: number;
  vocabularyPrior: number; localContext: number;
}
export interface RankedCandidate { identity: HarmonicIdentity; baseScore: number; score: number; features: RankingFeatures }
const pc = (value: number) => (value % 12 + 12) % 12;
const template: Record<string, number[]> = {
  maj:[0,4,7], min:[0,3,7], dim:[0,3,6], aug:[0,4,8], maj7:[0,4,7,11],
  min7:[0,3,7,10], dom7:[0,4,7,10], min7b5:[0,3,6,10], dim7:[0,3,6,9],
  six:[0,4,7,9], min6:[0,3,7,9], sixNine:[0,2,4,7,9], sus2:[0,2,7],
  sus4:[0,5,7], dom7sus4:[0,5,7,10], add9:[0,2,4,7], maj9:[0,2,4,7,11],
  min9:[0,2,3,7,10], dom9:[0,2,4,7,10], min11:[0,2,3,5,7,10], dom13:[0,2,4,7,10,9],
};
const factorDegree: Record<string, number> = { "b9":1, "9":2, "#9":3, "11":5,
  "#11":6, "b13":8, "13":9, "6":9 };
/** Mirrors the frozen P8.6 candidate factorization; source observations only. */
export function p86Factors(candidate: Pick<Candidate,"root"|"quality">, pitches: readonly number[]): string[] {
  const relative = new Set(pitches.map((pitch) => pc(pitch - candidate.root)));
  const factors: string[] = [];
  if (!relative.has(0)) factors.push("no-root");
  const third = candidate.quality.includes("min") || candidate.quality.includes("dim") ? 3 : 4;
  if (relative.has(third)) factors.push(third === 3 ? "b3" : "3");
  if (relative.has(7)) factors.push("5");
  else if (!["dim", "aug"].some((word) => candidate.quality.includes(word))) factors.push("no5");
  if (relative.has(10)) factors.push("b7");
  if (relative.has(11)) factors.push("7");
  if (relative.has(1)) factors.push("b9");
  if (relative.has(2)) factors.push("9");
  if (relative.has(5)) factors.push("11");
  if (relative.has(6)) factors.push("#11");
  if (relative.has(8)) factors.push("b13");
  if (relative.has(9)) factors.push(candidate.quality === "six" || candidate.quality === "min6" ? "6" : "13");
  return factors;
}
export function sourceCandidates(source: readonly RankingNote[]): Candidate[] {
  const pitches = [...new Set(source.map((note) => note.pitch))].sort((a,b) => a-b);
  return generateCandidates(pitches, "shortcut-factorized");
}
function features(row: Candidate, source: readonly RankingNote[], previous?: HarmonicIdentity): RankingFeatures {
  const expected = new Set((template[row.quality] ?? []).map((interval) => pc(row.root + interval)));
  const pcs = new Set(source.map((note) => pc(note.pitch)));
  const overlap = (note: RankingNote) => Math.max(0, Math.min(1, note.onset + note.duration) - Math.max(0, note.onset));
  const weight = (note: RankingNote) => overlap(note) * Math.max(0.1, Math.min(1, note.velocity / 100));
  const total = source.reduce((sum,note) => sum + weight(note), 0) || 1;
  const supported = source.filter((note) => expected.has(pc(note.pitch))).reduce((sum,note) => sum + weight(note),0);
  const lowest = source.reduce((best,note) => note.pitch < best.pitch ? note : best, source[0]!);
  const bass = row.root === pc(lowest.pitch) ? 1 : expected.has(pc(lowest.pitch)) ? 0.4 : 0;
  const trackStats = new Map<number, number[]>();
  for (const note of source) { const notes=trackStats.get(note.track) ?? []; notes.push(note.pitch); trackStats.set(note.track,notes); }
  const orderedTracks = [...trackStats].sort((a,b) => Math.min(...a[1]) - Math.min(...b[1]));
  const bassTrack = orderedTracks.length > 1 ? orderedTracks[0]?.[0] : undefined;
  const bassTrackNotes = source.filter((note) => note.track === bassTrack && overlap(note) >= 0.25);
  const voiceRole = bassTrackNotes.length ? bassTrackNotes.filter((note) => expected.has(pc(note.pitch))).length / bassTrackNotes.length : 0;
  const onsets = source.filter((note) => Math.abs(note.onset) < 0.01);
  const boundaryConfidence = Math.min(1, onsets.length / 3);
  const boundary = boundaryConfidence * (onsets.some((note) => pc(note.pitch) === row.root) ? 1 : 0);
  const definingDegrees = row.quality.includes("min") || row.quality.includes("dim") ? [3] :
    row.quality.includes("sus") ? [row.quality.includes("sus2") ? 2 : 5] : [4];
  if (row.quality.includes("7") || ["dom9","dom13","min9","min11","maj9"].includes(row.quality))
    definingDegrees.push(row.quality.startsWith("maj") ? 11 : 10);
  const definingTension = definingDegrees.filter((degree) => pcs.has(pc(row.root + degree))).length / definingDegrees.length;
  const tensionFactors = p86Factors(row, source.map((note) => note.pitch)).filter((factor) => factorDegree[factor] !== undefined);
  const nctPenalty = tensionFactors.length ? tensionFactors.filter((factor) => {
    const pitchClass = pc(row.root + factorDegree[factor]!);
    const support = source.filter((note) => pc(note.pitch) === pitchClass).reduce((sum,note) => sum + overlap(note),0);
    return support < 0.25;
  }).length / tensionFactors.length : 0;
  const vocabularyPrior = ["maj","min","maj7","min7","dom7","sus2","sus4"].includes(row.quality) ? 1 : 0;
  const samePrevious = previous && previous.root === row.root && previous.quality === row.quality;
  const localContext = samePrevious && boundaryConfidence < 0.67 ? 1 : 0;
  return { pitch: row.score, bass, voiceRole, duration: supported / total,
    boundary, definingTension, nctPenalty, vocabularyPrior, localContext };
}
const weights: Record<RankingPolicy, Omit<RankingFeatures,"pitch">> = {
  OLD: {bass:0,voiceRole:0,duration:0,boundary:0,definingTension:0,nctPenalty:0,vocabularyPrior:0,localContext:0},
  PITCH_BASS: {bass:0.12,voiceRole:0,duration:0,boundary:0,definingTension:0,nctPenalty:0,vocabularyPrior:0,localContext:0},
  FACTOR_NO_CONTEXT: {bass:0.08,voiceRole:0.08,duration:0.22,boundary:0.07,definingTension:0.18,nctPenalty:-0.18,vocabularyPrior:0.04,localContext:0},
  FACTOR_CONTEXT: {bass:0.08,voiceRole:0.08,duration:0.22,boundary:0.07,definingTension:0.18,nctPenalty:-0.18,vocabularyPrior:0.04,localContext:0.04},
};
export function rankLocal(source: readonly RankingNote[], rows: readonly Candidate[], policy: RankingPolicy,
  previous?: HarmonicIdentity): { candidates: RankedCandidate[]; margin: number | null; unknown: boolean } {
  if (!source.length) return { candidates: [], margin: null, unknown: true };
  const weightsForPolicy = weights[policy];
  const candidates = rows.map((row, index) => {
    const f = features(row, source, previous);
    const score = policy === "OLD" ? row.score : row.score +
      (Object.keys(weightsForPolicy) as Array<keyof typeof weightsForPolicy>)
        .reduce((sum, name) => sum + weightsForPolicy[name] * f[name], 0);
    return { identity: {root:row.root,quality:row.quality,bass:row.bass,
      factors:p86Factors(row,source.map((note)=>note.pitch))}, baseScore:row.score,
      score, features:f, originalIndex:index };
  }).sort((a,b) => b.score-a.score || a.originalIndex-b.originalIndex)
    .map((row) => ({ identity: row.identity, baseScore: row.baseScore, score: row.score, features: row.features }));
  const margin = candidates.length > 1 ? candidates[0]!.score-candidates[1]!.score : null;
  // Sparse observations cannot support a stable triadic identity; keep candidates for review.
  const sparse = new Set(source.map((note) => pc(note.pitch))).size < 3;
  return { candidates, margin, unknown: candidates.length === 0 || (policy !== "OLD" && sparse) };
}
