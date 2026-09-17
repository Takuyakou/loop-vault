import { parseChordLabel } from "../domain/chords";
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
    return oneSelection("left-hand", snapshot("left-hand", "dim", false));
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
  if (status === "p533-rules") {
    return {
      snapshots: {
        "source-midi": p533Snapshot("source-midi", true),
        custom: p533Snapshot("custom", true),
        "basic-full": p533Snapshot("basic-full", false),
      },
      initialSelection: "basic-full",
    };
  }
  if (status === "p533-extended-reductions") {
    return oneSelection("basic-full", p533ExtendedReductionSnapshot());
  }
  return oneSelection("source-midi", snapshot("source-midi", "maj7", true));
}

function p533ExtendedReductionSnapshot(): ProgressionVoicingPracticeSnapshot {
  const labels = [
    "Am11", "Bm11", "F#m11", "G13", "A13", "C13", "C13(b9)", "D13(#9)",
  ] as const;
  return Object.freeze({
    version: 1,
    fingerprint: "p533-e2e-extended-reductions",
    source: { kind: "vault" as const, reference: { ideaId: "p533-e2e", blockId: "extended-reductions" } },
    selection: "basic-full" as const,
    key: "A minor",
    bpm: 100,
    meter: { numerator: 4 as const, denominator: 4 as const },
    lengthBeats: labels.length * 4,
    spans: Object.freeze(labels.map((_, eventIndex) => Object.freeze({
      kind: "chord" as const,
      eventIndex,
      startBeat: eventIndex * 4,
      durationBeats: 4,
    }))),
    events: Object.freeze(labels.map((label, index) => {
      const chord = parseChordLabel(label);
      if (!chord) throw new Error(`P5.33 extended reduction fixture did not parse: ${label}`);
      return Object.freeze({
        id: `p533-extended-event-${index + 1}`,
        startBeat: index * 4,
        durationBeats: 4,
        chord: Object.freeze(chord),
      });
    })),
  });
}

function p533Snapshot(
  selection: "source-midi" | "custom" | "basic-full",
  includeVoicing: boolean,
): ProgressionVoicingPracticeSnapshot {
  const labels = [
    "Dmaj7", "Dm7", "C#m7", "Eadd9/F#",
    "C7", "Bm7", "Dadd9/E", "Gmaj9/A",
  ] as const;
  const exactVoicings = [
    [50, 54, 57, 61],
    [50, 53, 57, 60],
    [49, 52, 56, 59],
    [42, 52, 56, 59],
    [48, 52, 55, 58],
    [47, 50, 54, 57],
    [40, 50, 54, 57],
    [45, 55, 59, 62, 66],
  ] as const;
  return Object.freeze({
    version: 1,
    fingerprint: `p533-e2e-${selection}`,
    source: { kind: "vault" as const, reference: { ideaId: "p533-e2e", blockId: "generalized-study" } },
    selection,
    key: "D major",
    bpm: 100,
    meter: { numerator: 4 as const, denominator: 4 as const },
    lengthBeats: labels.length * 4,
    spans: Object.freeze(labels.map((_, eventIndex) => Object.freeze({
      kind: "chord" as const,
      eventIndex,
      startBeat: eventIndex * 4,
      durationBeats: 4,
    }))),
    events: Object.freeze(labels.map((label, index) => {
      const chord = parseChordLabel(label);
      if (!chord) throw new Error(`P5.33 E2E fixture did not parse: ${label}`);
      const notes = exactVoicings[index];
      return Object.freeze({
        id: `p533-event-${index + 1}`,
        startBeat: index * 4,
        durationBeats: 4,
        chord: Object.freeze(chord),
        ...(includeVoicing ? {
          voicing: Object.freeze({
            kind: selection as "source-midi" | "custom",
            midiNotes: Object.freeze([...notes]),
            bassNote: notes[0],
          }),
        } : {}),
      });
    })),
  });
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
