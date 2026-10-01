import { voiceTextChordForAudition } from "./textChordTones";
import { isValidVoicingSnapshot } from "./voicing/normalizeVoicing";
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
  if (styleId === "generated-close") return [...voiceTextChordForAudition(chord)];
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
  styleId: TextProgressionVoicingStyleId,
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
): TextProgressionVoicingStyleId | undefined {
  if (
    !snapshot
    || snapshot.schemaVersion !== 1
    || snapshot.source !== "manual"
    || snapshot.representation !== "simultaneous-voicing"
    || snapshot.userVerified !== true
    || snapshot.confidence !== 1
    || snapshot.capturedForChordKey !== normalizedChordKey(chord)
    || !snapshot.extractorVersion?.startsWith(TEXT_STYLE_EXTRACTOR_PREFIX)
    || !isValidVoicingSnapshot(snapshot)
    || Object.keys(snapshot).some((key) => !TEXT_STYLE_SNAPSHOT_KEYS.has(key))
  ) return undefined;
  const styleId = snapshot.extractorVersion.slice(TEXT_STYLE_EXTRACTOR_PREFIX.length);
  if (!isTextProgressionVoicingStyleId(styleId)) {
    return undefined;
  }
  return styleId;
}

export function isTextProgressionStyleSnapshot(
  snapshot: VoicingSnapshot | undefined,
  chord: ChordSymbol,
): boolean {
  return textProgressionStyleFromSnapshot(snapshot, chord) !== undefined;
}
