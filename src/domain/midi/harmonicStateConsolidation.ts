import {
  consolidateP524PerformanceFragments,
  type P524ConsolidationSupported,
} from "./harmonicState/fragmentConsolidator";
import { parseMidi } from "./parser";
import type { AnalyzeMidiOptions, MidiSongData, TimedNote, VoiceRole } from "./types";
import { selectChordEvidenceNotes, voiceId } from "./voices";

const harmonicStateTimelineApplied = Symbol("p524-harmonic-state-timeline-applied");
type AppliedAnalyzeMidiOptions = AnalyzeMidiOptions & { [harmonicStateTimelineApplied]?: true };
export const harmonicStateConsolidationFeatureFlag = "enableHarmonicStateConsolidation" as const;
export const harmonicStateConsolidationAnalyzerVersion = "phase4-symbolic-v1+p524-harmonic-state-v1";

export interface HarmonicStateAnalyzerPreparation {
  readonly applied: boolean;
  readonly operations?: {
    readonly inputNotes: number;
    readonly tracksIndexed: number;
    readonly trackLookups: number;
  };
  readonly options: AnalyzeMidiOptions;
  readonly reason:
    | "flag-off"
    | "applied"
    | "unsupported-analyzer-mode"
    | "unsupported-meter"
    | "legacy-fallback"
    | "invalid-input";
}

/**
 * The rollback seam is deliberately local: OFF and unsupported modes return
 * the caller's exact options object before MIDI parsing or allocation.
 */
export function prepareHarmonicStateAnalyzerOptions(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions,
): HarmonicStateAnalyzerPreparation {
  if (options.enableHarmonicStateConsolidation !== true) {
    return { applied: false, options, reason: "flag-off" };
  }
  const mode = options.mode ?? "phase4-v1";
  if (mode !== "phase4-v1"
    || options.accuracyFirst?.enableAccuracyCandidateUnion === true) {
    return { applied: false, options, reason: "unsupported-analyzer-mode" };
  }

  try {
    const data = options.preparedData ?? parseMidi(bytes);
    if (data.timeSignature !== "4/4") {
      return { applied: false, options, reason: "unsupported-meter" };
    }
    const productionInput = buildProductionShadowInput(data, options);
    if (productionInput === undefined) return { applied: false, options, reason: "invalid-input" };
    const consolidated = consolidateP524PerformanceFragments(productionInput.input);
    if (consolidated.status !== "supported" || consolidated.legacyFallback) {
      return { applied: false, options, reason: "legacy-fallback" };
    }
    const harmonicRhythm = consolidated.harmonicRhythm;
    if (typeof harmonicRhythm !== "number") {
      return { applied: false, options, reason: "legacy-fallback" };
    }
    const preparedData = projectHarmonicStatesForAnalysis(data, consolidated);
    if (preparedData === undefined) return { applied: false, options, reason: "invalid-input" };
    const beatsPerWindow = Math.min(options.beatsPerWindow ?? 2, harmonicRhythm) as 1 | 2 | 4;
    return {
      applied: true,
      operations: productionInput.operations,
      options: {
        ...options,
        beatsPerWindow,
        preparedData,
        [harmonicStateTimelineApplied]: true,
      } as AppliedAnalyzeMidiOptions,
      reason: "applied",
    };
  } catch {
    return { applied: false, options, reason: "invalid-input" };
  }
}

/** Marks a prepared derived-state timeline for exact boundary preservation. */
export function markHarmonicStateTimelineApplied(options: AnalyzeMidiOptions): AnalyzeMidiOptions {
  return { ...options, [harmonicStateTimelineApplied]: true } as AppliedAnalyzeMidiOptions;
}

export function hasAppliedHarmonicStateTimeline(options: AnalyzeMidiOptions): boolean {
  return (options as AppliedAnalyzeMidiOptions)[harmonicStateTimelineApplied] === true;
}

interface ProductionShadowInputBuild {
  readonly input: {
    readonly notes: readonly {
      readonly id: string;
      readonly pitch: number;
      readonly startBeat: number;
      readonly durationBeats: number;
      readonly velocity: number;
      readonly rolePrior: "bass" | "upper" | "unknown";
    }[];
    readonly meter: readonly [4, 4];
    readonly totalBeats: number;
  };
  readonly operations: {
    readonly inputNotes: number;
    readonly tracksIndexed: number;
    readonly trackLookups: number;
  };
}

function buildProductionShadowInput(
  data: MidiSongData,
  options: AnalyzeMidiOptions,
): ProductionShadowInputBuild | undefined {
  if (!Number.isFinite(data.ticksPerBeat) || data.ticksPerBeat <= 0
    || !Number.isInteger(data.totalBars) || data.totalBars <= 0) return undefined;
  const roleByVoice = rolePriorByVoice(options);
  const roleHintByTrack = new Map(data.tracks.map((track) => [track.index, track.roleHint]));
  const notes = selectChordEvidenceNotes(data.notes).map((note, index) => ({
    id: productionNoteId(note, index),
    pitch: note.pitch,
    startBeat: note.startTick / data.ticksPerBeat,
    durationBeats: note.durationTick / data.ticksPerBeat,
    velocity: note.velocity,
    rolePrior: rolePriorForNote(note, roleByVoice, roleHintByTrack),
  }));
  return {
    input: { notes, meter: [4, 4], totalBeats: data.totalBars * 4 },
    operations: {
      inputNotes: notes.length,
      tracksIndexed: data.tracks.length,
      trackLookups: notes.length,
    },
  };
}

function rolePriorByVoice(options: AnalyzeMidiOptions): ReadonlyMap<string, VoiceRole> {
  const analysisInput = options.analysisInput;
  if (analysisInput === undefined) return new Map();
  return new Map(analysisInput.voices.map((voice) => [
    voice.id,
    analysisInput.roleOverrides[voice.id] ?? voice.inferredRole,
  ]));
}

function rolePriorForNote(
  note: TimedNote,
  roleByVoice: ReadonlyMap<string, VoiceRole>,
  roleHintByTrack: ReadonlyMap<number, MidiSongData["tracks"][number]["roleHint"]>,
): "bass" | "upper" | "unknown" {
  const voiceRole = note.channel === undefined
    ? undefined
    : roleByVoice.get(voiceId(note.trackIndex, note.channel));
  const role = voiceRole ?? roleHintByTrack.get(note.trackIndex);
  return role === "bass"
    ? "bass"
    : role === "harmony" || role === "melody" || role === "pad"
      ? "upper"
      : "unknown";
}

function productionNoteId(note: TimedNote, index: number): string {
  return [
    note.startTick,
    note.startTick + note.durationTick,
    note.pitch,
    note.trackIndex,
    note.channel ?? -1,
    index,
  ].join(":");
}

function projectHarmonicStatesForAnalysis(
  data: MidiSongData,
  consolidated: P524ConsolidationSupported,
): MidiSongData | undefined {
  const evidenceNotes = selectChordEvidenceNotes(data.notes);
  const bassTemplate = [...evidenceNotes].sort(compareBassTemplate)[0];
  const upperTemplate = [...evidenceNotes].sort(compareUpperTemplate)[0];
  if (bassTemplate === undefined || upperTemplate === undefined) return undefined;

  const stableBassPitchClasses = stableBassPitchClassesByState(consolidated);
  const projected: TimedNote[] = [];
  for (let stateIndex = 0; stateIndex < consolidated.states.length; stateIndex += 1) {
    const state = consolidated.states[stateIndex];
    const startTick = exactTick(state.startBeat, data.ticksPerBeat);
    const endTick = exactTick(state.endBeat, data.ticksPerBeat);
    if (startTick === undefined || endTick === undefined || endTick <= startTick) return undefined;
    const stableBassPitchClass = stableBassPitchClasses[stateIndex];
    for (const pitchClass of state.pitchClasses) {
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
  projected.sort((left, right) => left.startTick - right.startTick
    || left.pitch - right.pitch
    || left.trackIndex - right.trackIndex
    || (left.channel ?? -1) - (right.channel ?? -1));
  return { ...data, notes: projected };
}

function stableBassPitchClassesByState(
  consolidated: P524ConsolidationSupported,
): readonly (number | undefined)[] {
  const pitchClasses = Array.from(
    { length: consolidated.states.length },
    () => new Set<number>(),
  );
  for (const fragment of consolidated.fragments) {
    if (fragment.bassPitchClass !== undefined) {
      pitchClasses[fragment.assignedStateIndex]?.add(fragment.bassPitchClass);
    }
  }
  return pitchClasses.map((values) => values.size === 1 ? [...values][0] : undefined);
}

function pitchForRegister(pitchClass: number, registerFloor: number): number {
  return registerFloor + ((pitchClass - normalizePitchClass(registerFloor) + 12) % 12);
}

function compareBassTemplate(left: TimedNote, right: TimedNote): number {
  return left.pitch - right.pitch
    || left.trackIndex - right.trackIndex
    || (left.channel ?? -1) - (right.channel ?? -1)
    || left.startTick - right.startTick;
}

function compareUpperTemplate(left: TimedNote, right: TimedNote): number {
  return right.pitch - left.pitch
    || left.trackIndex - right.trackIndex
    || (left.channel ?? -1) - (right.channel ?? -1)
    || left.startTick - right.startTick;
}

function exactTick(beat: number, ticksPerBeat: number): number | undefined {
  const tick = beat * ticksPerBeat;
  return Number.isSafeInteger(tick) && tick >= 0 ? tick : undefined;
}


function normalizePitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}
