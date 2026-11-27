import { normalizedChordKey } from "../voicing";
import { supportsLegacyGeneratedChord } from "../textChordConsumerCapabilities";
import {
  compareCandidate,
  type StyleVoicingCandidate,
} from "./candidateTools";
import { adaptGeneratedCloseVoicing, STYLE_VOICING_GENERATOR_VERSION } from "./closeAdapter";
import { getStyleCompatibility } from "./compatibility";
import { generateStyleCandidates } from "./generateCandidates";
import {
  styleVoicingStartCost,
  styleVoicingTransitionCost,
} from "./transitionCost";
import type {
  GeneratedStyleVoicing,
  GeneratedStyleVoicingPlan,
  GenerateStyleVoicingOptions,
  SavedChordEvent,
  VoicingStyleId,
} from "./types";

interface PathState<T> {
  cost: number;
  path: T[];
}

export function generateStyleVoicingPlan(
  progression: readonly SavedChordEvent[],
  styleId: "generated-close" | VoicingStyleId,
  options: GenerateStyleVoicingOptions,
): GeneratedStyleVoicingPlan {
  const fingerprint = styleProgressionFingerprint(progression);
  if (styleId === "generated-close") {
    return {
      progressionFingerprint: fingerprint,
      styleId,
      generatorVersion: STYLE_VOICING_GENERATOR_VERSION,
      events: progression.flatMap((event, index) => supportsLegacyGeneratedChord(event.chord)
        ? [adaptGeneratedCloseVoicing(event, index)] : []),
      unsupportedEvents: progression.flatMap((event, index) => supportsLegacyGeneratedChord(event.chord)
        ? [] : [{ eventId: event.eventId ?? `style-event-${index}`, chordLabel: event.chord.label,
          reason: "このコード分類の生成規則は未対応です。" }]),
    };
  }

  const unsupportedEvents: GeneratedStyleVoicingPlan["unsupportedEvents"] = [];
  const candidateGroups: StyleVoicingCandidate[][] = [];
  const eventIndexes: number[] = [];

  progression.forEach((event, index) => {
    const eventId = event.eventId ?? `style-event-${index}`;
    const compatibility = getStyleCompatibility(event.chord, styleId);
    const candidates = compatibility.supported
      ? generateStyleCandidates(event.chord, styleId, options)
      : [];
    if (candidates.length > 0) {
      candidateGroups.push(candidates);
      eventIndexes.push(index);
      return;
    }
    unsupportedEvents.push({
      eventId,
      chordLabel: event.chord.label,
      reason: compatibility.reason ?? "現在のspanでは候補を生成できません。",
    });
    if (options.allowUnsupportedFallback && supportsLegacyGeneratedChord(event.chord)) {
      const fallback = adaptGeneratedCloseVoicing(event, index);
      candidateGroups.push([{
        ...fallback,
        warnings: ["fallback-close"],
      }]);
      eventIndexes.push(index);
    }
  });

  const optimized = optimizeCandidateGroups(candidateGroups);
  const byEventIndex = new Map<number, GeneratedStyleVoicing>();
  eventIndexes.forEach((eventIndex, optimizedIndex) => {
    const candidate = optimized[optimizedIndex];
    const event = progression[eventIndex];
    if (!candidate || !event) return;
    byEventIndex.set(eventIndex, toGeneratedVoicing(event, eventIndex, candidate));
  });

  return {
    progressionFingerprint: fingerprint,
    styleId,
    generatorVersion: STYLE_VOICING_GENERATOR_VERSION,
    events: [...byEventIndex.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, event]) => event),
    unsupportedEvents,
  };
}

/** P25-02 K6: the costs the cyclic optimizer uses. Callers that pass nothing keep today's costs. */
export interface CandidateOptimizationCosts<T> {
  readonly start: (candidate: T) => number;
  readonly transition: (previous: T, current: T) => number;
  readonly compare: (left: T, right: T) => number;
}

const STYLE_CANDIDATE_COSTS: CandidateOptimizationCosts<StyleVoicingCandidate> = {
  start: styleVoicingStartCost,
  transition: styleVoicingTransitionCost,
  compare: compareCandidate,
};

export function optimizeCandidateGroups(
  candidateGroups: readonly StyleVoicingCandidate[][],
): StyleVoicingCandidate[];
export function optimizeCandidateGroups<T>(
  candidateGroups: readonly (readonly T[])[],
  costs: CandidateOptimizationCosts<T>,
): T[];
export function optimizeCandidateGroups<T>(
  candidateGroups: readonly (readonly T[])[],
  costs: CandidateOptimizationCosts<T> = STYLE_CANDIDATE_COSTS as unknown as CandidateOptimizationCosts<T>,
): T[] {
  const compareStates = (left: PathState<T>, right: PathState<T>): number =>
    left.cost - right.cost || comparePaths(left.path, right.path, costs.compare);
  if (candidateGroups.length === 0) return [];
  if (candidateGroups.length === 1) {
    return candidateGroups[0]!
      .map((candidate) => ({ cost: costs.start(candidate), path: [candidate] }))
      .sort(compareStates)[0]?.path ?? [];
  }

  const completed: PathState<T>[] = [];
  for (const start of candidateGroups[0]!) {
    let states: PathState<T>[] = [{ cost: costs.start(start), path: [start] }];
    for (let groupIndex = 1; groupIndex < candidateGroups.length; groupIndex += 1) {
      states = candidateGroups[groupIndex]!.map((candidate) => {
        const paths = states.map((state) => ({
          cost: state.cost
            + costs.start(candidate)
            + costs.transition(last(state.path), candidate),
          path: [...state.path, candidate],
        }));
        return paths.sort(compareStates)[0]!;
      });
    }
    completed.push(...states.map((state) => ({
      cost: state.cost + costs.transition(last(state.path), start),
      path: state.path,
    })));
  }
  return completed.sort(compareStates)[0]?.path ?? [];
}

/** Selects each generator's deterministic chord-local default without transition cost. */
export function selectChordLocalCandidates(
  candidateGroups: readonly StyleVoicingCandidate[][],
): StyleVoicingCandidate[] {
  return candidateGroups.flatMap((group) => group[0] ? [group[0]] : []);
}

function toGeneratedVoicing(
  event: SavedChordEvent,
  index: number,
  candidate: StyleVoicingCandidate,
): GeneratedStyleVoicing {
  if (candidate.styleId === "lesson-v2") {
    throw new Error("lesson-v2 candidates cannot be persisted as legacy style voicings");
  }
  return {
    eventId: event.eventId ?? `style-event-${index}`,
    chordKey: normalizedChordKey(event.chord),
    styleId: candidate.styleId,
    generatorVersion: STYLE_VOICING_GENERATOR_VERSION,
    leftHandNotes: [...candidate.leftHandNotes],
    rightHandNotes: [...candidate.rightHandNotes],
    allNotes: [...candidate.allNotes],
    variant: candidate.variant,
    requiredIntervals: [...candidate.requiredIntervals],
    addedColorIntervals: [...candidate.addedColorIntervals],
    omittedIntervals: [...candidate.omittedIntervals],
    warnings: [...candidate.warnings],
  };
}

function comparePaths<T>(
  left: readonly T[],
  right: readonly T[],
  compare: (left: T, right: T) => number,
): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCandidate = left[index];
    const rightCandidate = right[index];
    if (leftCandidate === undefined) return -1;
    if (rightCandidate === undefined) return 1;
    const difference = compare(leftCandidate, rightCandidate);
    if (difference !== 0) return difference;
  }
  return 0;
}

function styleProgressionFingerprint(
  progression: readonly SavedChordEvent[],
): string {
  const value = progression.map((event, index) => [
    event.eventId ?? index,
    normalizedChordKey(event.chord),
    event.bar,
    event.beat,
    event.durationBeats,
  ].join(":")).join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `svp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function last<T>(values: readonly T[]): T {
  return values[values.length - 1];
}
