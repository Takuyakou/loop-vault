import type { ChordTimelineItem, MidiProgressionAnalysis } from "../types";
import type { MidiSongData, Voice } from "../midi/types";
import { beatsPerBar } from "../midi/timing";
import { extractVoicing } from "./extractVoicing";
import { filterRelativeSupportMelodyContamination } from "./relativeSupportMelodyFilter";

export const phase5MelodyFilterOptions = {
  minimumRoleConfidence: 0.65,
  minimumSupportPitchCount: 1,
  minimumCoverageRatio: 0.25,
  minimumSupportBeats: 0.2,
} as const;

/**
 * Source voicing shared by the capture preview and the save path.
 *
 * Before this existed, a candidate was auditioned with a generated voicing and
 * only picked up the original MIDI voicing once it was saved, so the chord the
 * user chose was not the chord they had heard. Both paths now call the same
 * function, which is what keeps the two identical.
 */
export const sourceVoicingExtractorVersion = "phase4-source-voicing-v1";

export interface SourceVoicingContext {
  analysis: MidiProgressionAnalysis | undefined;
  sourceData: MidiSongData | undefined;
  sourceVoices: Voice[] | undefined;
  accuracyFirst?: {
    melodyContaminationFilter?: boolean;
  };
}

/**
 * Cache key per event.
 *
 * Includes the analysed file, the exact sounding range, the chord being voiced
 * and the extractor version, so editing a chord invalidates its entry instead of
 * replaying the voicing of the chord it replaced.
 */
export function sourceVoicingCacheKey(
  item: Pick<ChordTimelineItem, "bar" | "beat" | "durationBeats" | "chord">,
  fingerprint: string | undefined,
): string {
  return [
    fingerprint ?? "no-fingerprint",
    item.bar,
    item.beat,
    item.durationBeats,
    item.chord.root,
    item.chord.quality,
    item.chord.bass ?? "-",
    sourceVoicingExtractorVersion,
  ].join("|");
}

export function attachSourceVoicing<T extends ChordTimelineItem>(
  item: T,
  context: SourceVoicingContext,
  cache?: Map<string, ChordTimelineItem["voicingMemory"]>,
): T {
  const { analysis, sourceData, sourceVoices } = context;
  if (!analysis || !sourceData) return item;

  const key = cache ? sourceVoicingCacheKey(item, analysis.sourceFingerprint) : undefined;
  if (key && cache?.has(key)) {
    const cached = cache.get(key);
    return cached ? { ...item, voicingMemory: { ...item.voicingMemory, ...cached } } : item;
  }

  const meter = beatsPerBar(analysis.timeSignature);
  const startBeat = (item.bar - 1) * meter + item.beat - 1;
  const extractionInput = {
    chord: item.chord,
    segment: { startBeat, endBeat: startBeat + item.durationBeats },
    notes: sourceData.notes,
    ticksPerBeat: sourceData.ticksPerBeat,
    voices: sourceVoices,
  };
  const filteredNotes = context.accuracyFirst?.melodyContaminationFilter
    ? filterRelativeSupportMelodyContamination(
        extractionInput,
        phase5MelodyFilterOptions,
      ).notes
    : extractionInput.notes;
  const result = extractVoicing({ ...extractionInput, notes: filteredNotes });

  if (!result.snapshot) {
    if (key) cache?.set(key, undefined);
    return item;
  }

  const voicingMemory = { ...item.voicingMemory, sourceVoicing: result.snapshot };
  if (key) cache?.set(key, voicingMemory);
  return { ...item, voicingMemory };
}

export function attachSourceVoicings<T extends ChordTimelineItem>(
  items: readonly T[],
  context: SourceVoicingContext,
  cache?: Map<string, ChordTimelineItem["voicingMemory"]>,
): T[] {
  return items.map((item) => attachSourceVoicing(item, context, cache));
}

/** Whether an event will actually play from the original MIDI. */
export function hasSourceVoicing(item: ChordTimelineItem): boolean {
  return item.voicingMemory?.sourceVoicing !== undefined;
}
