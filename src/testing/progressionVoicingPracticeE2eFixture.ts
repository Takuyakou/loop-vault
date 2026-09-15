import type {
  ProgressionVoicingPracticeSnapshots,
  ProgressionVoicingPracticeSnapshot,
  ProgressionVoicingSelection,
  ResolveProgressionPracticeVoicingsOptions,
} from "../domain/progressionVoicingPractice";

export interface ProgressionVoicingPracticeE2eFixture {
  readonly snapshots: ProgressionVoicingPracticeSnapshots;
  readonly initialSelection: ProgressionVoicingSelection;
  readonly resolutionOptions?: ResolveProgressionPracticeVoicingsOptions;
}

/** Deterministic, privacy-safe fixture compiled only by the Playwright runner. */
export function progressionVoicingPracticeE2eFixture(search: string): ProgressionVoicingPracticeE2eFixture {
  const status = new URLSearchParams(search).get("p527Status");
  if (status === "unavailable") {
    return oneSelection("custom", snapshot("custom", "maj7", false));
  }
  if (status === "unsupported") {
    return oneSelection("basic-full", snapshot("basic-full", "dim", false));
  }
  if (status === "generation-error") {
    return {
      ...oneSelection("left-hand", snapshot("left-hand", "maj7", false)),
      resolutionOptions: { maxLeftHandSpanSemitones: 0, maxRightHandSpanSemitones: 0 },
    };
  }
  if (status === "both-hands") {
    return oneSelection("source-midi", snapshot("source-midi", "maj7", true, true));
  }
  if (status === "both-hands-long") {
    return oneSelection("source-midi", snapshot("source-midi", "maj7", true, true, 12));
  }
  return oneSelection("source-midi", snapshot("source-midi", "maj7", true));
}

function oneSelection(
  selection: ProgressionVoicingSelection,
  value: ProgressionVoicingPracticeSnapshot,
): ProgressionVoicingPracticeE2eFixture {
  return { snapshots: { [selection]: value }, initialSelection: selection };
}

function snapshot(
  selection: ProgressionVoicingSelection,
  quality: "maj7" | "dim",
  includeVoicing: boolean,
  includeBassRole = false,
  eventCount = 2,
): ProgressionVoicingPracticeSnapshot {
  const mySelection = selection === "source-midi" || selection === "custom";
  const firstLabel = quality === "dim" ? "Cdim" : "Cmaj7";
  const secondLabel = quality === "dim" ? "Ddim" : "Dm7";
  return Object.freeze({
    version: 1,
    fingerprint: `p527-e2e-${selection}-${quality}`,
    source: { kind: "vault" as const, reference: { ideaId: "e2e-idea", blockId: "e2e-block" } },
    selection,
    key: "C major",
    bpm: 96,
    meter: { numerator: 4 as const, denominator: 4 as const },
    lengthBeats: eventCount * 2,
    spans: Object.freeze(Array.from({ length: eventCount }, (_, eventIndex) => ({
      kind: "chord" as const,
      eventIndex,
      startBeat: eventIndex * 2,
      durationBeats: 2,
    }))),
    events: Object.freeze(Array.from({ length: eventCount }, (_, eventIndex) => {
      const first = eventIndex % 2 === 0;
      const bassNote = first ? 48 : 50;
      return Object.freeze({
        id: `e2e-event-${eventIndex + 1}`,
        startBeat: eventIndex * 2,
        durationBeats: 2,
        chord: first
          ? Object.freeze({ root: 0, quality, tensions: Object.freeze([]), label: firstLabel })
          : Object.freeze({
              root: 2,
              quality: quality === "dim" ? "dim" : "min7",
              tensions: Object.freeze([]),
              label: secondLabel,
            }),
        ...(mySelection && includeVoicing
          ? { voicing: Object.freeze({
              kind: selection as "source-midi" | "custom",
              midiNotes: Object.freeze(first ? [48, 55, 59] : [50, 57, 60]),
              ...(includeBassRole ? { bassNote } : {}),
            }) }
          : {}),
      });
    })),
  });
}
