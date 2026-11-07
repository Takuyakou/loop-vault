import { describe, expect, it } from 'vitest';
import { parseChordLabel } from '../../../domain/chords';
import { makeIdea } from '../../../domain/testFactory';
import { normalizedChordKey } from '../../../domain/voicing';
import { buildGeneratedChordContextSnapshot, buildVaultChordContextSnapshot } from '../domain/chordContextSnapshot';
import type { SavedProgressionBlock } from '../../../domain/types';
import { resolveVaultSavedChordNotes } from './vaultSavedChordNotes';
function fixture() {
  const chord = parseChordLabel('C')!;
  const block: SavedProgressionBlock = { id: 'saved-block', chords: [{ chord, bar: 7, beat: 1, durationBeats: 4,
    confidence: 1, alternatives: [], warnings: [], voicingMemory: { playbackChoice: 'CUSTOM',
      sourceVoicing: {schemaVersion: 1, source: 'midi-extracted', representation: 'simultaneous-voicing', midiNotes: [48,60,64,67], capturedForChordKey: normalizedChordKey(chord), userVerified: true},
      practiceVoicingOverride: {schemaVersion: 1, source: 'manual', representation: 'simultaneous-voicing', midiNotes: [36,73,85], capturedForChordKey: normalizedChordKey(chord), userVerified: true} } }],
    tags: [], summaryText: 'C', bpm: 120, detectedKey: 'C major', timeSignature: '4/4', capturedAt: '2026-10-04T00:00:00.000Z', analyzerVersion: 'synthetic' };
  const idea = makeIdea({id: 'saved-idea', progressionBlocks: [block]});
  const result = buildVaultChordContextSnapshot({sourceReference: {ideaId: idea.id, blockId: block.id}, block});
  if (!result.ok) throw new Error(result.error.message);
  return {idea, block, snapshot: result.snapshot};
}
describe('transient saved Bass chord notes', () => {
  it('preserves edited MIDI octaves and source/snapshot fields without mutation', () => {
    const {idea, block, snapshot} = fixture(); const before = structuredClone({idea, snapshot});
    const notes = resolveVaultSavedChordNotes([idea], snapshot); expect(notes['chord:0']).toEqual([36,73,85]);
    expect(Object.isFrozen(notes['chord:0'])).toBe(true); expect({idea,snapshot}).toEqual(before);
    expect(block.chords[0]!.voicingMemory!.sourceVoicing!.midiNotes).toEqual([48,60,64,67]);
  });
  it('uses the current saved notes even when harmonic snapshot signature stays unchanged', () => {
    const {idea, block, snapshot} = fixture(); block.chords[0]!.voicingMemory!.practiceVoicingOverride!.midiNotes = [64,67];
    expect(resolveVaultSavedChordNotes([idea],snapshot)['chord:0']).toEqual([64,67]);
  });
  it('omits generated/source choices and stale or deleted Vault cards', () => {
    const {idea,block,snapshot}=fixture();
    for(const choice of ['GENERATED','SOURCE'] as const){block.chords[0]!.voicingMemory!.playbackChoice=choice;expect(resolveVaultSavedChordNotes([idea],snapshot)).toEqual({});}
    block.chords[0]!.voicingMemory!.playbackChoice='CUSTOM';block.chords[0]!.chord=parseChordLabel('Dm7')!;expect(resolveVaultSavedChordNotes([idea],snapshot)).toEqual({});block.chords[0]!.chord=parseChordLabel('C')!;block.chords[0]!.bar=8;expect(resolveVaultSavedChordNotes([idea],snapshot)).toEqual({});
    expect(resolveVaultSavedChordNotes([],snapshot)).toEqual({});
    const generated=buildGeneratedChordContextSnapshot({key:'C major',bpm:120,chords:snapshot.section.chords});
    if(!generated.ok)throw new Error(generated.error.message);expect(resolveVaultSavedChordNotes([idea],generated.snapshot)).toEqual({});
  });
  it('holds manual notes after a name-only change and retains the same MIDI on reload', () => {
    const {idea,block}=fixture();block.chords[0]!.chord=parseChordLabel('Dm7')!;
    const snapshot=buildVaultChordContextSnapshot({sourceReference:{ideaId:idea.id,blockId:block.id},block});
    if(!snapshot.ok)throw new Error(snapshot.error.message);
    expect(resolveVaultSavedChordNotes(JSON.parse(JSON.stringify([idea])),snapshot.snapshot)['chord:0']).toEqual([36,73,85]);
  });
});

it('keeps manual pitches when the stored chord has an omission not represented by the harmonic snapshot',()=>{
 const {idea,block}=fixture();block.chords[0]!.chord={...block.chords[0]!.chord,omissions:['5']};
 const snapshot=buildVaultChordContextSnapshot({sourceReference:{ideaId:idea.id,blockId:block.id},block});
 if(!snapshot.ok)throw new Error(snapshot.error.message);expect(resolveVaultSavedChordNotes([idea],snapshot.snapshot)['chord:0']).toEqual([36,73,85]);
});
