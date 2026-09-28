import type { PreviewSound } from "../audio/chordPreview";
import { playbackController, type PlayingSource } from "../audio/playbackController";
import { voiceChordForPreview } from "../domain/chordVoicing";
import { voiceTextChordForAudition } from "../domain/textChordTones";
import type { SavedProgressionBlock } from "../domain/types";
import { resolveVoicingForUse } from "../domain/voicing";

/**
 * One saved chord auditioned the same way everywhere (Home's 今日のループ and 続きから,
 * Vault rows): the saved voicing first, else the text or preview voicing. Toggles.
 */
export function auditionSavedChord(block: SavedProgressionBlock, index: number, source: PlayingSource, sound: PreviewSound): Promise<void> {
  const event = block.chords[index]!;
  const notes = resolveVoicingForUse(
    event.chord,
    event.voicingMemory,
    block.textSource ? [...voiceTextChordForAudition(event.chord)] : voiceChordForPreview(event.chord).notes,
  ).midiNotes;
  return playbackController.toggle(source, { type: "chord", chord: event.chord, sound, explicitMidiNotes: notes });
}
