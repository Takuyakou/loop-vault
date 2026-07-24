import {
  DEFAULT_OCTAVE_SHIFT_CANDIDATES,
  DEFAULT_VOICING_PRACTICE_PREFERENCES,
  generateStyleVoicingPlan,
  matchExactPitch,
  matchPitchClasses,
} from "../voicingPractice";
import type { PracticeMatchEvaluator } from "../practice";
import { buildPracticeChordRequirements } from "../practice";
import { transposeResolvedVoicing } from "./transposeResolvedVoicing";
import type {
  CreatePracticeTargetPlanInput,
  CreatePracticeTargetPlanResult,
  PracticeTargetPlan,
  PracticeTargetPlanEvent,
  PracticeTargetPlanUnsupportedEvent,
} from "./types";

export function createPracticeTargetPlan(
  input: CreatePracticeTargetPlanInput,
): CreatePracticeTargetPlanResult {
  if (input.targetSource.type === "resolved-voicing") {
    return createResolvedTargetPlan(input);
  }
  return {
    ok: true,
    plan: createGeneratedTargetPlan(input),
  };
}

export function createPracticeTargetMatchEvaluator(
  plan: PracticeTargetPlan,
): PracticeMatchEvaluator | undefined {
  if (plan.matchInput.type === "chord-symbol") return undefined;
  const matchInput = {
    ...plan.matchInput,
    exactPitchOptions: {
      ...plan.matchInput.exactPitchOptions,
      octaveShiftCandidates: [
        ...plan.matchInput.exactPitchOptions.octaveShiftCandidates,
      ],
    },
  };
  const targetNotes = plan.events.map((event) => [...event.midiNotes]);
  const readyEvents = plan.events.map((event) => event.ready);

  return (_requirements, input, requiredAttackRevision, eventIndex) => {
    if (!readyEvents[eventIndex]) {
      throw new Error(`Practice target event ${eventIndex} is not ready.`);
    }
    return matchInput.mode === "exact-pitch"
      ? matchExactPitch(
          targetNotes[eventIndex],
          input,
          requiredAttackRevision,
          matchInput.exactPitchOptions,
        )
      : matchPitchClasses(
          targetNotes[eventIndex],
          input,
          requiredAttackRevision,
        );
  };
}

function createResolvedTargetPlan(
  input: CreatePracticeTargetPlanInput,
): CreatePracticeTargetPlanResult {
  const result = transposeResolvedVoicing(input.progression);
  if (!result.ok) return result;
  const byEventId = new Map(
    result.plan.events.map((event) => [event.eventId, event]),
  );
  const events = input.progression.events.map((event): PracticeTargetPlanEvent => {
    const resolved = byEventId.get(event.eventId);
    if (!resolved) {
      throw new Error(`Resolved voicing is missing for event ${event.eventId}.`);
    }
    return {
      eventId: event.eventId,
      sourceEventId: event.sourceEventId,
      chord: cloneChord(event.chord),
      midiNotes: [...resolved.midiNotes],
      leftHandNotes: [],
      rightHandNotes: [],
      ready: true,
      origin: resolved.origin,
      addedColorIntervals: [],
      warnings: [],
      fallback: resolved.generatedFallback,
    };
  });
  return {
    ok: true,
    plan: {
      targetSource: { type: "resolved-voicing" },
      targetKey: cloneKey(input.progression.targetKey),
      events,
      requirements: createTargetRequirements(input),
      explicitMidiNotesByEventId: explicitMidiNotesByEventId(events),
      matchInput: { type: "chord-symbol" },
      handGuideMode: "none",
      unsupportedEvents: [],
      warnings: result.plan.warnings.map(cloneWarning),
      globalOctaveOffset: result.plan.globalOctaveOffset,
    },
  };
}

function createGeneratedTargetPlan(
  input: CreatePracticeTargetPlanInput,
): PracticeTargetPlan {
  if (input.targetSource.type === "resolved-voicing") {
    throw new Error("Resolved voicing requires the resolved target-plan path.");
  }
  const styleId = input.targetSource.type === "generated-close"
    ? "generated-close"
    : input.targetSource.styleId;
  const generated = generateStyleVoicingPlan(
    input.progression.events,
    styleId,
    input.styleOptions ?? {
      maxLeftHandSpanSemitones:
        DEFAULT_VOICING_PRACTICE_PREFERENCES.maxLeftHandSpanSemitones,
      maxRightHandSpanSemitones:
        DEFAULT_VOICING_PRACTICE_PREFERENCES.maxRightHandSpanSemitones,
      allowUnsupportedFallback: false,
    },
  );
  const generatedByEventId = new Map(
    generated.events.map((event) => [event.eventId, event]),
  );
  const unsupportedByEventId = new Map(
    generated.unsupportedEvents.map((event) => [event.eventId, event]),
  );
  const events = input.progression.events.map((event): PracticeTargetPlanEvent => {
    const voicing = generatedByEventId.get(event.eventId);
    const unsupported = unsupportedByEventId.get(event.eventId);
    return {
      eventId: event.eventId,
      sourceEventId: event.sourceEventId,
      chord: cloneChord(event.chord),
      midiNotes: voicing ? [...voicing.allNotes] : [],
      leftHandNotes: voicing ? [...voicing.leftHandNotes] : [],
      rightHandNotes: voicing ? [...voicing.rightHandNotes] : [],
      ready: Boolean(voicing),
      ...(voicing ? {
        styleId: voicing.styleId,
        ...(voicing.variant ? { variant: voicing.variant } : {}),
      } : {}),
      addedColorIntervals: voicing ? [...voicing.addedColorIntervals] : [],
      warnings: voicing ? [...voicing.warnings] : [],
      fallback: voicing?.warnings.includes("fallback-close") ?? false,
      ...(unsupported ? { unsupportedReason: unsupported.reason } : {}),
    };
  });

  return {
    targetSource: cloneTargetSource(input.targetSource),
    targetKey: cloneKey(input.progression.targetKey),
    events,
    requirements: createTargetRequirements(input),
    explicitMidiNotesByEventId: explicitMidiNotesByEventId(events),
    matchInput: {
      type: "voicing",
      mode: input.styleMatchMode ?? "exact-pitch",
      exactPitchOptions: {
        allowGlobalOctaveShift:
          input.exactPitchOptions?.allowGlobalOctaveShift
          ?? DEFAULT_VOICING_PRACTICE_PREFERENCES.allowGlobalOctaveShift,
        octaveShiftCandidates: [
          ...(input.exactPitchOptions?.octaveShiftCandidates
            ?? DEFAULT_OCTAVE_SHIFT_CANDIDATES),
        ],
      },
    },
    handGuideMode: "split",
    unsupportedEvents: generated.unsupportedEvents.map(
      (event): PracticeTargetPlanUnsupportedEvent => ({ ...event }),
    ),
    warnings: [],
  };
}

function createTargetRequirements(
  input: CreatePracticeTargetPlanInput,
): PracticeTargetPlan["requirements"] {
  return input.progression.events.map((event) => (
    buildPracticeChordRequirements(event.chord, input.leniency)
  ));
}

function explicitMidiNotesByEventId(
  events: readonly PracticeTargetPlanEvent[],
): Record<string, number[]> {
  return Object.fromEntries(
    events
      .filter((event) => event.ready)
      .map((event) => [event.eventId, [...event.midiNotes]]),
  );
}

function cloneTargetSource(
  targetSource: CreatePracticeTargetPlanInput["targetSource"],
): CreatePracticeTargetPlanInput["targetSource"] {
  return targetSource.type === "style"
    ? {
        type: "style",
        styleId: targetSource.styleId,
        ...(targetSource.rootlessVariantPolicy
          ? { rootlessVariantPolicy: targetSource.rootlessVariantPolicy }
          : {}),
      }
    : { type: targetSource.type };
}

function cloneChord(
  chord: CreatePracticeTargetPlanInput["progression"]["events"][number]["chord"],
): CreatePracticeTargetPlanInput["progression"]["events"][number]["chord"] {
  return {
    ...chord,
    tensions: [...chord.tensions],
  };
}

function cloneKey(
  key: CreatePracticeTargetPlanInput["progression"]["targetKey"],
): CreatePracticeTargetPlanInput["progression"]["targetKey"] {
  return {
    ...key,
    labels: { ...key.labels },
  };
}

function cloneWarning(
  warning: PracticeTargetPlan["warnings"][number],
): PracticeTargetPlan["warnings"][number] {
  return { ...warning };
}
