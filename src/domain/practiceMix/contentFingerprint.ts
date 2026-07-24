import type { PracticeTargetPlan } from "../practiceTransposition";
import type { SavedProgressionBlock } from "../types";
import { normalizedChordKey } from "../voicing";
import type { GenerateStyleVoicingOptions } from "../voicingPractice";
import type { MixSessionConfig } from "./types";

export function mixSnapshotContentFingerprint(
  block: SavedProgressionBlock,
  effectiveKeySignature: string | undefined,
  config: MixSessionConfig,
  targetPlan: PracticeTargetPlan,
  styleOptions?: GenerateStyleVoicingOptions,
): string {
  const usesSavedVoicing = config.targetSource.type === "resolved-voicing";
  const generatedOptions = usesSavedVoicing
    ? null
    : {
        maxLeftHandSpanSemitones:
          styleOptions?.maxLeftHandSpanSemitones ?? null,
        maxRightHandSpanSemitones:
          styleOptions?.maxRightHandSpanSemitones ?? null,
        allowUnsupportedFallback:
          styleOptions?.allowUnsupportedFallback
          ?? config.allowUnsupportedFallback,
      };
  const payload = JSON.stringify({
    events: block.chords.map((event) => ({
      eventId: event.eventId ?? null,
      chord: normalizedChordKey(event.chord),
      bar: event.bar,
      beat: event.beat,
      durationBeats: event.durationBeats,
    })),
    effectiveMidiNotes: targetPlan.events.map((event) => ({
      eventId: event.eventId,
      midiNotes: [...event.midiNotes],
    })),
    key: effectiveKeySignature ?? block.detectedKey ?? null,
    bpm: block.bpm ?? null,
    timeSignature: block.timeSignature ?? null,
    targetSource: config.targetSource.type === "style"
      ? {
          type: config.targetSource.type,
          styleId: config.targetSource.styleId,
          rootlessVariantPolicy:
            config.targetSource.rootlessVariantPolicy ?? null,
        }
      : { type: config.targetSource.type },
    leniency: config.leniency,
    styleMatchMode: usesSavedVoicing
      ? null
      : config.styleMatchMode ?? "exact-pitch",
    generatedOptions,
  });
  return `mix-content-v1-${fnv1a(payload)}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
