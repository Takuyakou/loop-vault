import { normalizePc } from "../chords";
import { overlapWithSegment } from "./normalize";
import type { OrnamentFeatures } from "./ornaments";
import type { TrackRoleProfile } from "./trackRoles";
import type { NormalizedTimedNote, SegmentRange } from "./types";
import { defaultAnalyzerWeights, noteFeatures, type AnalyzerWeights } from "./weights";

export interface WeightedPitchProfile {
  qualityPcs: number[];
  rootPcs: number[];
  bassPcs: number[];
  topPcs: number[];
  totalWeight: number;
}

export interface CumulativePitchFeatures {
  boundaries: number[];
  qualityPcs: number[][];
  rootPcs: number[][];
  bassPcs: number[][];
  topPcs: number[][];
  onsetPcs: number[][];
}

export function buildWeightedPitchProfile(
  notes: readonly NormalizedTimedNote[], segment: SegmentRange,
  roles: ReadonlyMap<number, TrackRoleProfile>, ornaments: ReadonlyMap<NormalizedTimedNote, OrnamentFeatures>,
  beatsPerBar: number, weights: AnalyzerWeights = defaultAnalyzerWeights,
): WeightedPitchProfile {
  const profile = emptyProfile();
  for (const note of notes) {
    const overlap = overlapWithSegment(note, segment);
    if (overlap.overlapBeats <= 0) continue;
    const role = roles.get(note.trackIndex);
    if (role?.role === "drums") continue;
    const features = noteFeatures({ ...overlap, overlapRatio: 1 }, { beatsPerBar, roleWeight: role?.qualityWeight ?? weights.unknownRoleWeight,
      ornamentPenalty: ornaments.get(note)?.penalty }, weights);
    const additiveWeight = features.finalWeight * overlap.overlapBeats;
    const pc = normalizePc(note.pitch);
    profile.qualityPcs[pc] += additiveWeight;
    profile.rootPcs[pc] += additiveWeight * ((role?.rootWeight ?? 1) / Math.max(0.01, role?.qualityWeight ?? 1));
    if (note.pitch < 55 || role?.role === "bass") profile.bassPcs[pc] += additiveWeight * (role?.rootWeight ?? 1);
    if (note.pitch >= 72 || role?.role === "melody" || role?.role === "lead") profile.topPcs[pc] += additiveWeight;
    profile.totalWeight += additiveWeight;
  }
  return profile;
}

export function buildCumulativePitchFeatures(
  notes: readonly NormalizedTimedNote[], boundaries: readonly number[],
  roles: ReadonlyMap<number, TrackRoleProfile>, ornaments: ReadonlyMap<NormalizedTimedNote, OrnamentFeatures>,
  beatsPerBar: number, weights: AnalyzerWeights = defaultAnalyzerWeights,
): CumulativePitchFeatures {
  const result: CumulativePitchFeatures = {
    boundaries: [...boundaries], qualityPcs: [zeros()], rootPcs: [zeros()], bassPcs: [zeros()], topPcs: [zeros()], onsetPcs: [zeros()],
  };
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const segment = { startBeat: boundaries[index], endBeat: boundaries[index + 1] };
    const profile = buildWeightedPitchProfile(notes, segment, roles, ornaments, beatsPerBar, weights);
    result.qualityPcs.push(add(result.qualityPcs[index], profile.qualityPcs));
    result.rootPcs.push(add(result.rootPcs[index], profile.rootPcs));
    result.bassPcs.push(add(result.bassPcs[index], profile.bassPcs));
    result.topPcs.push(add(result.topPcs[index], profile.topPcs));
    const onset = zeros();
    notes.filter((note) => note.startBeat >= segment.startBeat && note.startBeat < segment.endBeat)
      .forEach((note) => { onset[normalizePc(note.pitch)] += 1; });
    result.onsetPcs.push(add(result.onsetPcs[index], onset));
  }
  return result;
}

export function profileFromCumulative(features: CumulativePitchFeatures, startIndex: number, endIndex: number): WeightedPitchProfile {
  const qualityPcs = subtract(features.qualityPcs[endIndex], features.qualityPcs[startIndex]);
  return {
    qualityPcs,
    rootPcs: subtract(features.rootPcs[endIndex], features.rootPcs[startIndex]),
    bassPcs: subtract(features.bassPcs[endIndex], features.bassPcs[startIndex]),
    topPcs: subtract(features.topPcs[endIndex], features.topPcs[startIndex]),
    totalWeight: qualityPcs.reduce((sum, value) => sum + value, 0),
  };
}

function emptyProfile(): WeightedPitchProfile { return { qualityPcs: zeros(), rootPcs: zeros(), bassPcs: zeros(), topPcs: zeros(), totalWeight: 0 }; }
function zeros(): number[] { return Array(12).fill(0) as number[]; }
function add(left: number[], right: number[]): number[] { return left.map((value, index) => value + right[index]); }
function subtract(left: number[], right: number[]): number[] { return left.map((value, index) => value - right[index]); }
