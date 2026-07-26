import { voiceChordForPreview } from "../chordVoicing";
import type { ChordTimelineItem } from "../types";
import { resolveVoicingForUse } from "../voicing";
import type { ManualCandidateDraft } from "./manualDraft";
import { draftToCandidate } from "./manualDraftEditing";
import { timelineRangeBeats } from "./manualRange";

/**
 * What a draft sounds like, and where each voicing came from.
 *
 * The rule itself is the product's existing one: `resolveVoicingForUse` prefers
 * the voicing captured from the MIDI and falls back to a generated one when the
 * stored notes no longer fit the chord. Replacing a chord is exactly when they
 * stop fitting, so a user who edits a block and hears the old voicing would be
 * auditioning a chord they no longer have. Nothing new is decided here; what is
 * added is the ability to say which of the two happened, so the screen can tell
 * the user rather than leave them guessing why it sounds different.
 */

export type DraftVoicingOrigin = "source" | "generated";

export interface DraftVoicingSummary {
  origins: DraftVoicingOrigin[];
  sourceCount: number;
  generatedCount: number;
  /** True when the block still plays entirely as it was captured. */
  allFromSource: boolean;
  /** True when at least one chord fell back, which editing is the usual cause of. */
  anyGenerated: boolean;
}

/**
 * The events a preview plays.
 *
 * Deliberately the same list `draftToCandidate` hands the editor and the save
 * path, so what is heard before saving and what is stored afterwards cannot
 * drift apart.
 */
export function draftPreviewTimeline(draft: ManualCandidateDraft): ChordTimelineItem[] {
  return draftToCandidate(draft).chords;
}

export function draftSourcePreviewTimeline(draft: ManualCandidateDraft): ChordTimelineItem[] {
  const { startBeat } = timelineRangeBeats(draft.selectedRange, draft.beatsPerBar);
  return draft.originalEvents.map((event, index) => {
    const absolute = startBeat + event.relativeStartBeat;
    return {
      ...event.source,
      eventId: event.sourceEventId ?? `${draft.draftId}:source:${index}`,
      bar: Math.floor(absolute / draft.beatsPerBar) + 1,
      beat: (absolute % draft.beatsPerBar) + 1,
      durationBeats: event.durationBeats,
      chord: event.source.chord,
      alternatives: event.source.alternatives.map((alternative) => ({
        ...alternative,
        chord: { ...alternative.chord, tensions: [...alternative.chord.tensions] },
      })),
      warnings: [...event.source.warnings],
    };
  });
}

export function draftHasMidiSourcePreview(draft: ManualCandidateDraft): boolean {
  return draftSourcePreviewTimeline(draft).some(
    (item) => Boolean(item.voicingMemory?.sourceVoicing?.midiNotes.length),
  );
}

export function draftVoicingSummary(draft: ManualCandidateDraft): DraftVoicingSummary {
  const origins = draftPreviewTimeline(draft).map((item): DraftVoicingOrigin => {
    const resolved = resolveVoicingForUse(
      item.chord,
      item.voicingMemory,
      voiceChordForPreview(item.chord).notes,
    );
    return resolved.origin === "generated" ? "generated" : "source";
  });

  const generatedCount = origins.filter((origin) => origin === "generated").length;
  return {
    origins,
    sourceCount: origins.length - generatedCount,
    generatedCount,
    allFromSource: origins.length > 0 && generatedCount === 0,
    anyGenerated: generatedCount > 0,
  };
}
