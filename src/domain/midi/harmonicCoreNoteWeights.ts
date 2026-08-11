import {
  classifyNoteTextureFeatureSet,
  type NoteTextureClassification,
} from "./noteTextureClassifier";
import { extractNoteTextureFeatures } from "./noteTextureFeatures";
import type { NormalizedTimedNote, VoiceRole } from "./types";
import type { VoiceRoleProfile } from "./voiceProfiles";
import { voiceId } from "./voices";

const eligibleRoles = new Set<VoiceRole>(["harmony", "pad", "mixed"]);

export interface HarmonicCoreNoteWeightSummary {
  readonly eligibleVoiceCount: number;
  readonly weightedNoteCount: number;
  readonly classCounts: Readonly<Record<NoteTextureClassification["candidateClass"], number>>;
}

export interface HarmonicCoreNoteWeights {
  readonly multipliers: ReadonlyMap<NormalizedTimedNote, number>;
  readonly summary: HarmonicCoreNoteWeightSummary;
}

/** Builds transient note weights without mutating or persisting MIDI events. */
export function buildHarmonicCoreNoteWeights(
  notes: readonly NormalizedTimedNote[],
  roles: ReadonlyMap<string, VoiceRoleProfile>,
): HarmonicCoreNoteWeights {
  const grouped = new Map<string, Array<{ note: NormalizedTimedNote; id: string }>>();
  for (const [index, note] of notes.entries()) {
    if (note.channel === undefined || note.channel === 9) continue;
    const id = voiceId(note.trackIndex, note.channel);
    const role = roles.get(id)?.inference.role;
    if (!role || !eligibleRoles.has(role)) continue;
    const entries = grouped.get(id);
    const entry = { note, id: `note-${index}` };
    if (entries) entries.push(entry);
    else grouped.set(id, [entry]);
  }
  const multipliers = new Map<NormalizedTimedNote, number>();
  const classCounts: Record<NoteTextureClassification["candidateClass"], number> = {
    harmonic: 0,
    "melody-like": 0,
    uncertain: 0,
  };
  for (const entries of grouped.values()) {
    const byId = new Map(entries.map((entry) => [entry.id, entry.note]));
    const features = extractNoteTextureFeatures(entries.map((entry) => ({
      id: entry.id,
      pitch: entry.note.pitch,
      startBeat: entry.note.startBeat,
      endBeat: entry.note.sustainedEndBeat,
    })));
    for (const classification of classifyNoteTextureFeatureSet(features)) {
      const note = byId.get(classification.noteId);
      if (!note) throw new Error("Harmonic Core note mapping failed");
      if (!(classification.proposedMultiplier > 0)) throw new Error("Harmonic Core multiplier must be non-zero");
      multipliers.set(note, classification.proposedMultiplier);
      classCounts[classification.candidateClass] += 1;
    }
  }
  return {
    multipliers,
    summary: {
      eligibleVoiceCount: grouped.size,
      weightedNoteCount: multipliers.size,
      classCounts,
    },
  };
}
