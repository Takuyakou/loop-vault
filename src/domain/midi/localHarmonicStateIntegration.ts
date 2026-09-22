import {
  estimateP526LocalHarmonicStateShadow,
  type P526LocalEvidenceCell,
  type P526LocalHarmonicStateShadowResult,
  type P526LocalHarmonicStateShadowSupported,
} from "./harmonicState/localHarmonicStateShadow";
import { beatsPerBar as beatsPerBarOfMeter } from "./timing";
import {
  estimateP524BassLane,
  estimateP524HarmonicRhythm,
  type P524ShadowNote,
} from "./harmonicState/shadowEvidence";
import {
  markHarmonicStateTimelineApplied,
  prepareHarmonicStateAnalyzerOptions,
} from "./harmonicStateConsolidation";
import { parseMidi } from "./parser";
import type { AnalyzeMidiOptions, MidiSongData, TimedNote, VoiceRole } from "./types";
import { selectChordEvidenceNotes, voiceId } from "./voices";

const localHarmonicStateTimelineApplied = Symbol("p526-local-harmonic-state-timeline-applied");
type AppliedAnalyzeMidiOptions = AnalyzeMidiOptions & { [localHarmonicStateTimelineApplied]?: true };

export const localHarmonicStateConsolidationFeatureFlag = "enableLocalHarmonicStateConsolidation" as const;
export const localHarmonicStateConsolidationAnalyzerVersion = "phase4-symbolic-v1+p526-local-harmonic-state-v1";

export interface LocalHarmonicStateAnalyzerPreparation {
  readonly applied: boolean;
  readonly options: AnalyzeMidiOptions;
  readonly reason:
    | "flag-off"
    | "applied"
    | "unsupported-analyzer-mode"
    | "unsupported-meter"
    | "legacy-fallback"
    | "invalid-input";
  readonly fallbackReason?: string;
  readonly diagnostics?: {
    readonly projectionSource: "global-retained" | "local-derived";
    readonly globalQuarterBeats: 1 | 2 | 4 | 8 | "unknown";
    readonly localPeriods: readonly (1 | 2 | 4 | 8)[];
    readonly stateCount: number;
    readonly inputNotes: number;
    readonly indexedBeatCells: number;
    readonly noteCellAssignments: number;
    readonly candidateEvaluations: number;
  };
}

interface ProductionInput {
  readonly input: {
    readonly notes: readonly P524ShadowNote[];
    readonly meter: readonly [4, 4];
    readonly totalBeats: number;
  };
  readonly data: MidiSongData;
}

interface CellBuildResult {
  readonly cells: readonly P526LocalEvidenceCell[];
  readonly noteCellAssignments: number;
}

/**
 * Literal-true-only P5.26 production seam. It consumes raw note/role evidence,
 * never a rendered chord identity. Every unsupported or ambiguous case returns
 * the caller's exact options object for legacy analysis.
 */
export function prepareLocalHarmonicStateAnalyzerOptions(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions,
): LocalHarmonicStateAnalyzerPreparation {
  if (options.enableLocalHarmonicStateConsolidation !== true) {
    return { applied: false, options, reason: "flag-off" };
  }
  const mode = options.mode ?? "phase4-v1";
  if (mode !== "phase4-v1" || options.accuracyFirst?.enableAccuracyCandidateUnion === true) {
    return { applied: false, options, reason: "unsupported-analyzer-mode" };
  }

  try {
    const production = buildProductionInput(bytes, options);
    if (production === undefined) return { applied: false, options, reason: "invalid-input" };
    if (production.data.timeSignature !== "4/4") {
      return { applied: false, options, reason: "unsupported-meter" };
    }
    const bassLane = estimateP524BassLane(production.input);
    const global = estimateP524HarmonicRhythm(production.input, bassLane);
    const cellBuild = buildBeatCells(production.input.notes, production.input.totalBeats);
    if (cellBuild === undefined) return { applied: false, options, reason: "invalid-input" };
    const local = estimateP526LocalHarmonicStateShadow({
      meter: [4, 4],
      totalBeats: production.input.totalBeats,
      cells: cellBuild.cells,
      globalHarmonicRhythm: global.status === "supported"
        ? { status: "supported", quarterBeats: global.quarterBeats }
        : { status: "unknown", quarterBeats: "unknown" },
    });
    if (global.status === "supported" && global.quarterBeats !== "unknown") {
      const globalQuarterBeats = global.quarterBeats;
      const retained = prepareHarmonicStateAnalyzerOptions(bytes, {
        ...options,
        enableHarmonicStateConsolidation: true,
      });
      const preparedData = retained.options.preparedData;
      const localAlignedWithGlobal = local.status === "supported"
        && local.bars.every((bar) => bar.quarterBeats === global.quarterBeats);
      const localStructuralOverride = localAlignedWithGlobal && preparedData !== undefined
        && projectedStateCount(preparedData) < local.states.length
        && local.boundaries.some((boundary) => boundary.beat % 4 !== 0
          && boundary.decision === "split-structural-change"
          && boundary.evidence.includes("persistent-bass-change"));
      if (retained.applied && preparedData !== undefined && !localStructuralOverride) {
        const localPeriods = Array.from({ length: production.data.totalBars }, () => globalQuarterBeats);
        return {
          applied: true,
          options: {
            ...retained.options,
            [localHarmonicStateTimelineApplied]: true,
          } as AppliedAnalyzeMidiOptions,
          reason: "applied",
          diagnostics: {
            projectionSource: "global-retained",
            globalQuarterBeats: global.quarterBeats,
            localPeriods,
            stateCount: projectedStateCount(preparedData),
            inputNotes: production.input.notes.length,
            indexedBeatCells: cellBuild.cells.length,
            noteCellAssignments: cellBuild.noteCellAssignments,
            candidateEvaluations: local.status === "supported" ? local.operations.candidateEvaluations : 0,
          },
        };
      }
    }
    if (local.status !== "supported" || local.legacyFallback) {
      return { applied: false, options, reason: "legacy-fallback", fallbackReason: local.reason };
    }
    const preparedData = projectLocalStates(production.data, local);
    if (preparedData === undefined) return { applied: false, options, reason: "invalid-input" };
    const localPeriods = local.bars.map((bar) => bar.quarterBeats)
      .filter((period): period is 1 | 2 | 4 | 8 => period !== "unknown");
    const finestPeriod = localPeriods.reduce<1 | 2 | 4>((minimum, period) => (
      Math.min(minimum, period, 4) as 1 | 2 | 4
    ), 4);
    const beatsPerWindow = Math.min(options.beatsPerWindow ?? 2, finestPeriod) as 1 | 2 | 4;
    return {
      applied: true,
      options: {
        ...markHarmonicStateTimelineApplied({
          ...options,
          beatsPerWindow,
          preparedData,
        }),
        [localHarmonicStateTimelineApplied]: true,
      } as AppliedAnalyzeMidiOptions,
      reason: "applied",
      diagnostics: {
        projectionSource: "local-derived",
        globalQuarterBeats: global.status === "supported" ? global.quarterBeats : "unknown",
        localPeriods,
        stateCount: local.states.length,
        inputNotes: production.input.notes.length,
        indexedBeatCells: cellBuild.cells.length,
        noteCellAssignments: cellBuild.noteCellAssignments,
        candidateEvaluations: local.operations.candidateEvaluations,
      },
    };
  } catch {
    return { applied: false, options, reason: "invalid-input" };
  }
}

export function hasAppliedLocalHarmonicStateTimeline(options: AnalyzeMidiOptions): boolean {
  return (options as AppliedAnalyzeMidiOptions)[localHarmonicStateTimelineApplied] === true;
}

export interface LocalHarmonicStateShadowProbe {
  readonly applied: boolean;
  readonly reason: string;
  readonly beatsPerBar: number;
  readonly totalBeats: number;
  readonly result?: P526LocalHarmonicStateShadowResult;
}

/**
 * P5.37-01 TEST / SHADOW-ONLY seam. It runs the (now meter-parameterized) local
 * harmonic-state estimator on the real production evidence with an explicit
 * `beatsPerBar` and the 4/4 gate bypassed, so the shadow can evaluate non-4/4
 * material. It is NEVER called by `analyzeMidi` / any production/runtime path, so
 * production runtime behavior is unchanged; it exists only for P5.37 shadow
 * evaluation and tests. It does not mutate source notes/meter.
 */
export function estimateLocalHarmonicStatesForShadow(
  bytes: Uint8Array,
  shadow: { readonly beatsPerBar?: number; readonly neutralizeBarPositionPrior?: boolean; readonly preparedData?: MidiSongData } = {},
): LocalHarmonicStateShadowProbe {
  const production = buildProductionInput(bytes, shadow.preparedData ? { preparedData: shadow.preparedData } : {});
  if (production === undefined) return { applied: false, reason: "invalid-input", beatsPerBar: 0, totalBeats: 0 };
  const beatsPerBar = shadow.beatsPerBar ?? beatsPerBarOfMeter(production.data.timeSignature);
  const totalBeats = production.data.totalBars * beatsPerBar;
  const cellBuild = buildBeatCells(production.input.notes, totalBeats);
  if (cellBuild === undefined) return { applied: false, reason: "invalid-input", beatsPerBar, totalBeats };
  const result = estimateP526LocalHarmonicStateShadow(
    { meter: [beatsPerBar, 4], totalBeats, cells: cellBuild.cells, globalHarmonicRhythm: { status: "unknown", quarterBeats: "unknown" } },
    { beatsPerBar, neutralizeBarPositionPrior: shadow.neutralizeBarPositionPrior ?? false, allowNonQuadrupleMeter: true },
  );
  return {
    applied: result.status === "supported",
    reason: result.status === "supported" ? "applied" : result.reason,
    beatsPerBar,
    totalBeats,
    result,
  };
}

function buildProductionInput(bytes: Uint8Array, options: AnalyzeMidiOptions): ProductionInput | undefined {
  const data = options.preparedData ?? parseMidi(bytes);
  if (!Number.isFinite(data.ticksPerBeat) || data.ticksPerBeat <= 0
    || !Number.isInteger(data.totalBars) || data.totalBars <= 0 || data.totalBars > 4_096) return undefined;
  const roleByVoice = rolePriorByVoice(options);
  const roleHintByTrack = new Map(data.tracks.map((track) => [track.index, track.roleHint]));
  const notes = selectChordEvidenceNotes(data.notes).map((note, index) => ({
    id: productionNoteId(note, index),
    pitch: note.pitch,
    startBeat: note.startTick / data.ticksPerBeat,
    durationBeats: note.durationTick / data.ticksPerBeat,
    velocity: note.velocity,
    rolePrior: rolePriorForNote(note, roleByVoice, roleHintByTrack),
  })).sort(compareShadowNotes);
  return { input: { notes, meter: [4, 4], totalBeats: data.totalBars * 4 }, data };
}

function buildBeatCells(notes: readonly P524ShadowNote[], totalBeats: number): CellBuildResult | undefined {
  if (!Number.isInteger(totalBeats) || totalBeats <= 0 || totalBeats > 16_384) return undefined;
  const upperDirect = matrix(12, totalBeats);
  const upperFullDifference = matrix(12, totalBeats + 1);
  const bassDirect = matrix(12, totalBeats);
  const bassFullDifference = matrix(12, totalBeats + 1);
  const allMetricTotal = new Float64Array(totalBeats);
  const allMetricCount = new Uint32Array(totalBeats);
  const bassMetricTotal = new Float64Array(totalBeats);
  const bassMetricCount = new Uint32Array(totalBeats);
  const onsetSlots = Array.from({ length: totalBeats }, () => new Set<number>());
  let noteCellAssignments = 0;

  for (const note of notes) {
    const startBeat = note.startBeat;
    const endBeat = note.startBeat + note.durationBeats;
    if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat) || startBeat < 0
      || endBeat <= startBeat || endBeat > totalBeats || !Number.isFinite(note.velocity)
      || note.velocity < 0 || note.velocity > 1) return undefined;
    const cellIndex = Math.min(totalBeats - 1, Math.floor(startBeat));
    const bass = note.rolePrior === "bass" || (note.rolePrior !== "upper" && note.pitch < 48);
    const upper = note.rolePrior === "upper" || (note.rolePrior !== "bass" && note.pitch >= 48);
    const metric = metricStrength(startBeat);
    allMetricTotal[cellIndex] += metric;
    allMetricCount[cellIndex] += 1;
    onsetSlots[cellIndex].add(startBeat);
    if (bass) {
      bassMetricTotal[cellIndex] += metric;
      bassMetricCount[cellIndex] += 1;
      noteCellAssignments += applyInterval(
        bassDirect[normalizePitchClass(note.pitch)]!, bassFullDifference[normalizePitchClass(note.pitch)]!,
        startBeat, endBeat, note.velocity / 0.8,
      );
    }
    if (upper) {
      noteCellAssignments += applyInterval(
        upperDirect[normalizePitchClass(note.pitch)]!, upperFullDifference[normalizePitchClass(note.pitch)]!,
        startBeat, endBeat, 1,
      );
    }
  }

  const upperCoverage = sweepCoverage(upperDirect, upperFullDifference, totalBeats);
  const bassCoverage = sweepCoverage(bassDirect, bassFullDifference, totalBeats);
  const cells = Array.from({ length: totalBeats }, (_, index): P526LocalEvidenceCell => {
    const upperPitchClasses = Array.from({ length: 12 }, (_unused, pitchClass) => pitchClass)
      .filter((pitchClass) => upperCoverage[pitchClass]![index]! >= 0.5);
    const upperPersistence = upperPitchClasses.length === 0 ? 0 : mean(
      upperPitchClasses.map((pitchClass) => Math.min(1, upperCoverage[pitchClass]![index]!)),
    );
    const bassRanked = Array.from({ length: 12 }, (_unused, pitchClass) => ({
      pitchClass, support: bassCoverage[pitchClass]![index]!,
    })).filter((entry) => entry.support > 0)
      .sort((left, right) => right.support - left.support || left.pitchClass - right.pitchClass);
    const bass = bassRanked[0];
    const metricTotal = bassMetricCount[index]! > 0 ? bassMetricTotal[index]! : allMetricTotal[index]!;
    const metricCount = bassMetricCount[index]! > 0 ? bassMetricCount[index]! : allMetricCount[index]!;
    return {
      startBeat: index,
      endBeat: index + 1,
      upperPitchClasses,
      ...(bass === undefined ? {} : { bassPitchClass: bass.pitchClass }),
      upperPersistence,
      bassPersistence: Math.min(1, bass?.support ?? 0),
      normalizedBeatStrength: metricCount === 0 ? 0 : metricTotal / metricCount,
      pitchClassSupport: upperPersistence,
      temporalContinuity: upperPersistence,
      localRhythmSupport: Math.min(1, onsetSlots[index]!.size),
    };
  });
  return { cells, noteCellAssignments };
}

function projectLocalStates(data: MidiSongData, local: P526LocalHarmonicStateShadowSupported): MidiSongData | undefined {
  const evidenceNotes = selectChordEvidenceNotes(data.notes);
  const bassTemplate = [...evidenceNotes].sort(compareBassTemplate)[0];
  const upperTemplate = [...evidenceNotes].sort(compareUpperTemplate)[0];
  if (bassTemplate === undefined || upperTemplate === undefined) return undefined;
  const projected: TimedNote[] = [];
  for (const state of local.states) {
    const startTick = exactTick(state.startBeat, data.ticksPerBeat);
    const endTick = exactTick(state.endBeat, data.ticksPerBeat);
    if (startTick === undefined || endTick === undefined || endTick <= startTick) return undefined;
    const pitchClasses = uniqueSorted([...state.upperPitchClasses, ...state.structuralBassPitchClasses]);
    const stableBassPitchClass = state.structuralBassPitchClasses.length === 1
      ? state.structuralBassPitchClasses[0] : undefined;
    for (const pitchClass of pitchClasses) {
      const useBassTemplate = pitchClass === stableBassPitchClass;
      const template = useBassTemplate ? bassTemplate : upperTemplate;
      projected.push({
        ...template,
        pitch: pitchForRegister(pitchClass, useBassTemplate ? 36 : 60),
        startTick,
        durationTick: endTick - startTick,
      });
    }
  }
  if (projected.length === 0) return undefined;
  projected.sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch
    || left.trackIndex - right.trackIndex || (left.channel ?? -1) - (right.channel ?? -1));
  return { ...data, notes: projected };
}

function rolePriorByVoice(options: AnalyzeMidiOptions): ReadonlyMap<string, VoiceRole> {
  const analysisInput = options.analysisInput;
  if (analysisInput === undefined) return new Map();
  return new Map(analysisInput.voices.map((voice) => [
    voice.id, analysisInput.roleOverrides[voice.id] ?? voice.inferredRole,
  ]));
}

function rolePriorForNote(
  note: TimedNote,
  roleByVoice: ReadonlyMap<string, VoiceRole>,
  roleHintByTrack: ReadonlyMap<number, MidiSongData["tracks"][number]["roleHint"]>,
): "bass" | "upper" | "unknown" {
  const voiceRole = note.channel === undefined ? undefined : roleByVoice.get(voiceId(note.trackIndex, note.channel));
  const role = voiceRole ?? roleHintByTrack.get(note.trackIndex);
  return role === "bass" ? "bass" : role === "harmony" || role === "melody" || role === "pad" ? "upper" : "unknown";
}

function productionNoteId(note: TimedNote, index: number): string {
  return [note.startTick, note.startTick + note.durationTick, note.pitch, note.trackIndex, note.channel ?? -1, index].join(":");
}

function compareShadowNotes(left: P524ShadowNote, right: P524ShadowNote): number {
  return left.startBeat - right.startBeat
    || left.startBeat + left.durationBeats - right.startBeat - right.durationBeats
    || left.pitch - right.pitch || left.velocity - right.velocity || left.id.localeCompare(right.id);
}

function matrix(rows: number, columns: number): Float64Array[] {
  return Array.from({ length: rows }, () => new Float64Array(columns));
}

function applyInterval(
  direct: Float64Array,
  fullDifference: Float64Array,
  startBeat: number,
  endBeat: number,
  weight: number,
): number {
  const first = Math.floor(startBeat);
  const last = Math.min(direct.length - 1, Math.ceil(endBeat) - 1);
  if (first === last) {
    direct[first] += (endBeat - startBeat) * weight;
    return 1;
  }
  direct[first] += (first + 1 - startBeat) * weight;
  direct[last] += (endBeat - last) * weight;
  if (first + 1 < last) {
    fullDifference[first + 1] += weight;
    fullDifference[last] -= weight;
  }
  return last - first + 1;
}

function sweepCoverage(
  direct: readonly Float64Array[],
  fullDifference: readonly Float64Array[],
  cells: number,
): readonly Float64Array[] {
  return direct.map((directRow, pitchClass) => {
    const result = new Float64Array(cells);
    let full = 0;
    for (let cell = 0; cell < cells; cell += 1) {
      full += fullDifference[pitchClass]![cell]!;
      result[cell] = directRow[cell]! + full;
    }
    return result;
  });
}

function metricStrength(beat: number): number {
  return Math.abs(beat - Math.round(beat)) < 1e-9 ? 1 : 0.8;
}

function exactTick(beat: number, ticksPerBeat: number): number | undefined {
  const tick = beat * ticksPerBeat;
  return Number.isSafeInteger(tick) && tick >= 0 ? tick : undefined;
}

function pitchForRegister(pitchClass: number, registerFloor: number): number {
  return registerFloor + ((pitchClass - normalizePitchClass(registerFloor) + 12) % 12);
}

function compareBassTemplate(left: TimedNote, right: TimedNote): number {
  return left.pitch - right.pitch || left.trackIndex - right.trackIndex
    || (left.channel ?? -1) - (right.channel ?? -1) || left.startTick - right.startTick;
}

function compareUpperTemplate(left: TimedNote, right: TimedNote): number {
  return right.pitch - left.pitch || left.trackIndex - right.trackIndex
    || (left.channel ?? -1) - (right.channel ?? -1) || left.startTick - right.startTick;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function projectedStateCount(data: MidiSongData): number {
  return new Set(data.notes.map((note) => (
    `${note.startTick}:${note.startTick + note.durationTick}`
  ))).size;
}

function normalizePitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}
