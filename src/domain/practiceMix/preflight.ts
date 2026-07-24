import { progressionFingerprint } from "../practice";
import {
  createPracticeTargetPlan,
  getCanonicalKey,
  parseKeySignature,
  transposeProgression,
  type PracticeTargetPlan,
  type TransposedPracticeEvent,
} from "../practiceTransposition";
import type {
  ChordSymbol,
  ChordTimelineItem,
  SavedProgressionBlock,
} from "../types";
import type { GenerateStyleVoicingOptions } from "../voicingPractice";
import { mixSnapshotContentFingerprint } from "./contentFingerprint";
import { progressionReferenceKey } from "./progressionBag";
import type {
  MixPreflightError,
  MixPreflightResult,
  MixProgressionCandidate,
  MixProgressionSnapshot,
  MixSnapshotDrift,
  MixSessionConfig,
} from "./types";

export interface MixPreflightInput {
  readonly config: MixSessionConfig;
  readonly candidates: readonly MixProgressionCandidate[];
  readonly styleOptions?: GenerateStyleVoicingOptions;
}

const chordQualities = new Set([
  "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
  "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
  "add9", "six", "min6", "sixNine",
]);
const tensions = new Set(["9", "b9", "#9", "11", "#11", "13", "b13"]);

export function preflightMixSession(
  input: MixPreflightInput,
): MixPreflightResult {
  const errors: MixPreflightError[] = [];
  if (input.config.references.length < 2 || input.config.references.length > 5) {
    errors.push({
      code: "selection-count",
      detail: `${input.config.references.length}`,
    });
  }

  const requestedKeys = input.config.references.map(progressionReferenceKey);
  const duplicateKeys = requestedKeys.filter(
    (key, index) => requestedKeys.indexOf(key) !== index,
  );
  for (const key of [...new Set(duplicateKeys)]) {
    errors.push({ code: "duplicate-selection", detail: key });
  }

  const candidateByKey = new Map(
    input.candidates.map((candidate) => [
      progressionReferenceKey(candidate.reference),
      candidate,
    ]),
  );
  const snapshots: MixProgressionSnapshot[] = [];

  for (const reference of input.config.references) {
    const candidate = candidateByKey.get(progressionReferenceKey(reference));
    if (!candidate?.block) {
      errors.push({
        code: "missing-block",
        reference,
        title: candidate?.title,
      });
      continue;
    }
    const snapshot = createSnapshot(
      candidate as MixProgressionCandidate & { readonly block: SavedProgressionBlock },
      input,
      errors,
    );
    if (snapshot) snapshots.push(snapshot);
  }

  if (errors.length > 0) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze(errors.map(freezeError)),
    });
  }
  return Object.freeze({
    ok: true,
    snapshots: Object.freeze(snapshots),
  });
}

export function findMixSnapshotDrift(
  snapshots: readonly MixProgressionSnapshot[],
  candidates: readonly MixProgressionCandidate[],
  config: MixSessionConfig,
  styleOptions?: GenerateStyleVoicingOptions,
): readonly MixSnapshotDrift[] {
  const candidateByKey = new Map(
    candidates.map((candidate) => [
      progressionReferenceKey(candidate.reference),
      candidate,
    ]),
  );
  const drift = snapshots.flatMap((snapshot): MixSnapshotDrift[] => {
    const candidate = candidateByKey.get(progressionReferenceKey(snapshot.reference));
    if (!candidate?.block) {
      return [{
        reference: snapshot.reference,
        title: snapshot.title,
        reason: "missing",
      }];
    }
    try {
      const rebuilt = createSnapshot(
        candidate as MixProgressionCandidate & {
          readonly block: SavedProgressionBlock;
        },
        { config, candidates, styleOptions },
        [],
      );
      if (rebuilt?.contentFingerprint === snapshot.contentFingerprint) {
        return [];
      }
    } catch {
      // An unreadable current record cannot be treated as the frozen snapshot.
    }
    return [{
      reference: snapshot.reference,
      title: candidate.title,
      reason: "fingerprint-changed",
    }];
  });
  return Object.freeze(drift.map((item) => Object.freeze({
    ...item,
    reference: Object.freeze({ ...item.reference }),
  })));
}

function createSnapshot(
  candidate: MixProgressionCandidate & { readonly block: SavedProgressionBlock },
  input: MixPreflightInput,
  errors: MixPreflightError[],
): MixProgressionSnapshot | undefined {
  const { block } = candidate;
  const issueBase = {
    reference: candidate.reference,
    title: candidate.title,
  };
  if (block.chords.length === 0) {
    errors.push({ code: "empty-progression", ...issueBase });
    return undefined;
  }
  if (!block.chords.every(validEvent)) {
    errors.push({ code: "invalid-chord", ...issueBase });
    return undefined;
  }
  if (
    input.config.mode === "flow"
    && block.timeSignature !== "4/4"
  ) {
    errors.push({
      code: "flow-time-signature",
      ...issueBase,
      detail: block.timeSignature ?? "missing",
    });
  }
  if (
    input.config.mode === "flow"
    && !block.chords.every(validFlowTiming)
  ) {
    errors.push({ code: "flow-timing", ...issueBase });
  }

  const keyText = candidate.effectiveKeySignature ?? block.detectedKey;
  const parsedKey = keyText ? parseKeySignature(keyText) : undefined;
  if (input.config.level === 3 && !keyText) {
    errors.push({ code: "missing-key", ...issueBase });
    return undefined;
  }
  if (keyText && !parsedKey) {
    errors.push({
      code: "unsupported-key",
      ...issueBase,
      detail: keyText,
    });
    return undefined;
  }
  const sourceKey = parsedKey ?? getCanonicalKey(0, "major");

  let events: readonly TransposedPracticeEvent[];
  let targetPlan: PracticeTargetPlan;
  try {
    const identity = transposeProgression({
      sourceKey,
      sourceMode: sourceKey.mode,
      events: block.chords,
      targetTonicPitchClass: sourceKey.tonicPitchClass,
      sourceReference: candidate.reference,
    });
    events = identity.events;
    if (
      input.config.level === 3
      && events.some((event) => !event.romanNumeral)
    ) {
      errors.push({ code: "roman-numeral-unavailable", ...issueBase });
      return undefined;
    }
    const targetResult = createPracticeTargetPlan({
      progression: identity,
      targetSource: input.config.targetSource,
      leniency: input.config.leniency,
      styleOptions: input.styleOptions,
      styleMatchMode: input.config.styleMatchMode,
    });
    if (!targetResult.ok) {
      errors.push({
        code: "target-plan-unavailable",
        ...issueBase,
        detail: targetResult.reason,
      });
      return undefined;
    }
    targetPlan = targetResult.plan;
    if (
      targetPlan.unsupportedEvents.length > 0
      && !input.config.allowUnsupportedFallback
    ) {
      errors.push({
        code: "target-plan-unsupported",
        ...issueBase,
        detail: targetPlan.unsupportedEvents
          .map((event) => `${event.chordLabel}: ${event.reason}`)
          .join(", "),
      });
      return undefined;
    }
    if (targetPlan.events.some((event) => !event.ready)) {
      errors.push({
        code: "target-plan-unsupported",
        ...issueBase,
      });
      return undefined;
    }
  } catch (error) {
    errors.push({
      code: "target-plan-unavailable",
      ...issueBase,
      detail: error instanceof Error ? error.message : undefined,
    });
    return undefined;
  }

  let fingerprint: string;
  try {
    fingerprint = progressionFingerprint(block, keyText);
  } catch {
    errors.push({ code: "fingerprint-unavailable", ...issueBase });
    return undefined;
  }

  return deepFreezeSnapshot({
    reference: candidate.reference,
    progressionFingerprint: fingerprint,
    contentFingerprint: mixSnapshotContentFingerprint(
      block,
      keyText,
      input.config,
      targetPlan,
      input.styleOptions,
    ),
    title: candidate.title,
    ...(parsedKey ? { sourceKey: parsedKey } : {}),
    events,
    targetPlan,
  });
}

function validEvent(event: ChordTimelineItem): boolean {
  return validChord(event.chord)
    && Array.isArray(event.alternatives)
    && Array.isArray(event.warnings);
}

function validChord(chord: ChordSymbol): boolean {
  return Number.isInteger(chord.root)
    && chord.root >= 0
    && chord.root <= 11
    && chordQualities.has(chord.quality)
    && Array.isArray(chord.tensions)
    && chord.tensions.every((tension) => tensions.has(tension))
    && typeof chord.label === "string"
    && chord.label.length > 0
    && (
      chord.bass === undefined
      || (Number.isInteger(chord.bass) && chord.bass >= 0 && chord.bass <= 11)
    );
}

function validFlowTiming(event: ChordTimelineItem): boolean {
  return Number.isInteger(event.bar)
    && event.bar >= 1
    && Number.isFinite(event.beat)
    && event.beat >= 1
    && Number.isFinite(event.durationBeats)
    && event.durationBeats > 0;
}

function deepFreezeSnapshot(
  snapshot: MixProgressionSnapshot,
): MixProgressionSnapshot {
  return deepFreeze(structuredClone(snapshot)) as MixProgressionSnapshot;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function freezeError(error: MixPreflightError): MixPreflightError {
  return Object.freeze({
    ...error,
    ...(error.reference
      ? { reference: Object.freeze({ ...error.reference }) }
      : {}),
  });
}
