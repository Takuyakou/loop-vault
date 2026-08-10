import { voiceChordForPreview } from "./chordVoicing";
import type { ChordSymbol, ChordTimelineItem, VoicingSnapshot } from "./types";
import { normalizedChordKey } from "./voicing";
import {
  generateStyleVoicingPlan,
  type GeneratedVoicingStyleId,
} from "./voicingPractice";

export type TextProgressionVoicingStyleId = GeneratedVoicingStyleId;

export const TEXT_PROGRESSION_VOICING_STYLES: readonly TextProgressionVoicingStyleId[] = [
  "generated-close",
  "shell-17",
  "open-17",
  "rootless-ab",
] as const;

export function isTextProgressionVoicingStyleId(
  value: string,
): value is TextProgressionVoicingStyleId {
  return TEXT_PROGRESSION_VOICING_STYLES.includes(value as TextProgressionVoicingStyleId);
}

const TEXT_STYLE_EXTRACTOR_PREFIX = "text-style-v1:";
const TEXT_STYLE_SNAPSHOT_KEYS = new Set([
  "schemaVersion",
  "source",
  "representation",
  "midiNotes",
  "bassNote",
  "capturedForChordKey",
  "capturedForChordLabel",
  "confidence",
  "userVerified",
  "extractorVersion",
]);

export function textProgressionVoicingNotes(
  chord: ChordSymbol,
  styleId: TextProgressionVoicingStyleId,
): number[] | undefined {
  if (styleId === "generated-close") return [...voiceChordForPreview(chord).notes];
  const event: ChordTimelineItem = {
    eventId: "text-style-preview",
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord,
    confidence: 0,
    alternatives: [],
    warnings: [],
  };
  const generated = generateStyleVoicingPlan([event], styleId, {
    maxLeftHandSpanSemitones: 12,
    maxRightHandSpanSemitones: 12,
    allowUnsupportedFallback: false,
  }).events[0]?.allNotes;
  return generated ? [...new Set(generated)].sort((left, right) => left - right) : undefined;
}

export function createTextProgressionStyleSnapshot(
  chord: ChordSymbol,
  styleId: Exclude<TextProgressionVoicingStyleId, "generated-close">,
): VoicingSnapshot | undefined {
  const midiNotes = textProgressionVoicingNotes(chord, styleId);
  if (!midiNotes || midiNotes.length < 2 || midiNotes.length > 10) return undefined;
  return {
    schemaVersion: 1,
    source: "manual",
    representation: "simultaneous-voicing",
    midiNotes,
    bassNote: midiNotes[0],
    capturedForChordKey: normalizedChordKey(chord),
    capturedForChordLabel: chord.label,
    confidence: 1,
    userVerified: true,
    extractorVersion: `${TEXT_STYLE_EXTRACTOR_PREFIX}${styleId}`,
  };
}

export function textProgressionStyleFromSnapshot(
  snapshot: VoicingSnapshot | undefined,
  chord: ChordSymbol,
): Exclude<TextProgressionVoicingStyleId, "generated-close"> | undefined {
  if (
    !snapshot
    || snapshot.schemaVersion !== 1
    || snapshot.source !== "manual"
    || snapshot.representation !== "simultaneous-voicing"
    || snapshot.userVerified !== true
    || snapshot.confidence !== 1
    || snapshot.capturedForChordKey !== normalizedChordKey(chord)
    || snapshot.capturedForChordLabel !== chord.label
    || !snapshot.extractorVersion?.startsWith(TEXT_STYLE_EXTRACTOR_PREFIX)
    || Object.keys(snapshot).some((key) => !TEXT_STYLE_SNAPSHOT_KEYS.has(key))
  ) return undefined;
  const styleId = snapshot.extractorVersion.slice(TEXT_STYLE_EXTRACTOR_PREFIX.length);
  if (styleId !== "shell-17" && styleId !== "open-17" && styleId !== "rootless-ab") {
    return undefined;
  }
  const expected = textProgressionVoicingNotes(chord, styleId);
  return expected && snapshot.bassNote === expected[0] && sameNotes(snapshot.midiNotes, expected)
    ? styleId
    : undefined;
}

export function isTextProgressionStyleSnapshot(
  snapshot: VoicingSnapshot | undefined,
  chord: ChordSymbol,
): boolean {
  return textProgressionStyleFromSnapshot(snapshot, chord) !== undefined;
}

function sameNotes(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((note, index) => note === right[index]);
}
