import { normalizedChordKey } from "../voicing";
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

interface PathState {
  cost: number;
  path: StyleVoicingCandidate[];
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
      events: progression.map(adaptGeneratedCloseVoicing),
      unsupportedEvents: [],
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
    if (options.allowUnsupportedFallback) {
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

export function optimizeCandidateGroups(
  candidateGroups: readonly StyleVoicingCandidate[][],
): StyleVoicingCandidate[] {
  if (candidateGroups.length === 0) return [];
  let states = candidateGroups[0].map((candidate) => ({
    cost: styleVoicingStartCost(candidate),
    path: [candidate],
  }));

  for (let groupIndex = 1; groupIndex < candidateGroups.length; groupIndex += 1) {
    const group = candidateGroups[groupIndex];
    states = group.map((candidate) => {
      const paths = states.map((state) => ({
        cost: state.cost + styleVoicingTransitionCost(last(state.path), candidate),
        path: [...state.path, candidate],
      }));
      return paths.sort(comparePathState)[0];
    });
  }
  return states.sort(comparePathState)[0]?.path ?? [];
}

function toGeneratedVoicing(
  event: SavedChordEvent,
  index: number,
  candidate: StyleVoicingCandidate,
): GeneratedStyleVoicing {
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

function comparePathState(left: PathState, right: PathState): number {
  return left.cost - right.cost || comparePaths(left.path, right.path);
}

function comparePaths(
  left: readonly StyleVoicingCandidate[],
  right: readonly StyleVoicingCandidate[],
): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftCandidate = left[index];
    const rightCandidate = right[index];
    if (!leftCandidate) return -1;
    if (!rightCandidate) return 1;
    const difference = compareCandidate(leftCandidate, rightCandidate);
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
