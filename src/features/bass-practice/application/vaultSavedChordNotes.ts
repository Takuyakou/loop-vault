import type { ChordSymbol, SongIdea } from '../../../domain/types';
import { normalizedChordKey, resolveTimelineItemVoicing } from '../../../domain/voicing';
import type { ChordContextSnapshot } from '../domain/chordContextSnapshot';

export type SavedChordNotes = Readonly<Record<string, readonly number[]>>;
const EMPTY_NOTES: SavedChordNotes = Object.freeze({});

/** Current-Vault session projection only: no changes to snapshots or Practice history. */
export function resolveVaultSavedChordNotes(ideas: readonly SongIdea[], snapshot: ChordContextSnapshot): SavedChordNotes {
  if (snapshot.source.kind !== 'vault') return EMPTY_NOTES;
  const reference = snapshot.source.reference;
  const block = ideas.find(idea => idea.id === reference.ideaId)?.progressionBlocks?.find(block => block.id === reference.blockId);
  if (!block) return EMPTY_NOTES;
  const selected: Record<string, readonly number[]> = {};
  for (const chord of snapshot.section.chords) {
    const absolute = (snapshot.section.startBar - 1) * 4 + chord.startBeat;
    const symbol: ChordSymbol = { ...chord, tensions: [...chord.tensions] };
    const item = block.chords.find(item => (item.bar - 1) * 4 + item.beat - 1 === absolute
      && item.durationBeats === chord.durationBeats && normalizedChordKey({...item.chord, omissions: undefined}) === normalizedChordKey(symbol));
    if (!item) continue;
    const memory = item.voicingMemory;
    if (memory?.playbackChoice !== 'CUSTOM' && memory?.practiceVoicingOverride?.source !== 'manual'
      && memory?.practiceVoicingOverride?.source !== 'live-played') continue;
    const resolved = resolveTimelineItemVoicing(item, Boolean(block.textSource));
    if (resolved.origin === 'practice-override') selected[chord.id] = Object.freeze([...resolved.midiNotes]);
  }
  return Object.freeze(selected);
}
