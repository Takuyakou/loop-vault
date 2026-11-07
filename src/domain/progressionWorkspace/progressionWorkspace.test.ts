import { normalizedChordKey } from '../voicing';
import { makeIdea } from '../testFactory';
import { buildProgressionVoicingPracticeHandoffFromVault } from '../progressionVoicingPractice';
import { describe,it,expect } from 'vitest';
import { parseChordLabel } from '../chords';
import type { SavedProgressionBlock } from '../types';
import { addNote,deleteNotes,movePitch } from '../correction/edits';
import { splitCard,mergeWithNext,moveBoundary } from '../correction/cardEdits';
import { isValidVoicingSnapshot,resolveTimelineItemVoicing } from '../voicing';
import { progressionToWorkspace,workspaceToProgression,progressionChanges,usedNotes,replaceProgressionName,guardProgressionNotes,deleteProgressionCard,progressionVersion,editProgressionMemo,splitProgressionMemo,progressionChangeCount,resetProgressionCard } from './progressionWorkspace';
export function block():SavedProgressionBlock{return {id:'test',summaryText:'Original spacing',chords:['C','F','G'].map((label,i)=>({eventId:`event-${i}`,bar:7+i,beat:1,durationBeats:4,chord:parseChordLabel(label)!,confidence:0.91,alternatives:[],warnings:['synthetic-warning']})),memo:'ambiguous-bass; 区切り7（7〜9小節）; 自由メモ',tags:['test'],bpm:93.5,detectedKey:'C',timeSignature:'4/4',capturedAt:'2026-10-04T00:00:00.000Z',analyzerVersion:'synthetic',sourceFingerprint:'kept',pinned:true,userVerified:true};}
describe('saved progression workspace adapter',()=>{
 it('retains every field and absent fields through an untouched round trip',()=>{for(const b of [block(),{...block(),chords:block().chords.map(c=>({...c,chord:{...c.chord,label:'N.C.'}}))}, {...block(),chords:Array.from({length:70},(_,i)=>({...block().chords[0]!,eventId:`e${i}`,bar:i+1}))}]){expect(workspaceToProgression(b,progressionToWorkspace(b))).toEqual(b);expect(progressionChanges(b,progressionToWorkspace(b))).toEqual({});}});
 it('keeps source MIDI when excluding, moving and adding notes; playback survives save',()=>{const b=block();b.chords[0]!.voicingMemory={sourceVoicing:{schemaVersion:1,source:'midi-extracted',representation:'simultaneous-voicing',midiNotes:[48,60,64,67],capturedForChordKey:'0:maj:-:-',userVerified:true},playbackChoice:'SOURCE'};
 let m=progressionToWorkspace(b);m=deleteNotes(m,[m.notes.find(n=>n.cardId==='event-0')!.id]).model;m=movePitch(m,[m.notes.find(n=>n.cardId==='event-0'&&n.used)!.id],1).model;m=addNote(m,'event-0',75).model;
 const next=workspaceToProgression(b,m);expect(next.chords[0]!.voicingMemory!.sourceVoicing).toEqual(b.chords[0]!.voicingMemory!.sourceVoicing);expect(resolveTimelineItemVoicing(next.chords[0]!).midiNotes).toEqual(usedNotes(m,'event-0'));expect(isValidVoicingSnapshot(next.chords[0]!.voicingMemory!.practiceVoicingOverride!)).toBe(true);
 });
 it('rejects gestures leaving one note and permits two',()=>{const m=progressionToWorkspace(block());const n=m.notes.filter(n=>n.cardId==='event-0');expect(guardProgressionNotes(deleteNotes(m,n.slice(0,-1).map(n=>n.id))).changed).toBe(false);expect(guardProgressionNotes(deleteNotes(m,n.slice(0,-2).map(n=>n.id))).changed).toBe(true);});
 it('aligns notes on rename only when enabled and retains human names across note edits',()=>{const m=progressionToWorkspace(block());const name=parseChordLabel('Dm7')!;const off=replaceProgressionName(m,'event-0',name,false).model;expect(usedNotes(off,'event-0')).toEqual(usedNotes(m,'event-0'));expect(usedNotes(replaceProgressionName(m,'event-0',name,true).model,'event-0')).not.toEqual(usedNotes(m,'event-0'));const moved=movePitch(off,[off.notes[0]!.id],1).model;expect(moved.cards[0]!.name.label).toBe('Dm7');});
 it('splits 2 beats into two 1-beat cards and rejects shorter spans; merge and boundary use shared edits',()=>{let m=progressionToWorkspace(block());m.cards[0]!.duration=2;expect(splitCard(m,'event-0').changed).toBe(true);m.cards[0]!.duration=1;expect(splitCard(m,'event-0').changed).toBe(false);m=progressionToWorkspace(block());expect(mergeWithNext(m,'event-0').model.cards).toHaveLength(2);expect(moveBoundary(m,'event-0',m.cards[0]!.start+0.5).changed).toBe(false);expect(moveBoundary(m,'event-0',m.cards[0]!.start+3).changed).toBe(true);});
 it('uses all four existing delete modes including first, last and sole card',()=>{const b=block();for(const mode of ['extend-previous','extend-next','close-gap','replace-no-chord'] as const){const m=progressionToWorkspace(b);const next=deleteProgressionCard(b,m,'event-0',mode);expect(next.changed).toBe(true);expect(next.model.cards).toHaveLength(mode==='replace-no-chord'?3:2);}const one={...b,chords:[b.chords[0]!]};expect(deleteProgressionCard(one,progressionToWorkspace(one),'event-0','extend-previous').changed).toBe(false);expect(deleteProgressionCard(one,progressionToWorkspace(one),'event-0','replace-no-chord').model.cards[0]!.name.label).toBe('N.C.');});
 it('versions do not mutate the original and range versions retain source bar coordinates',()=>{const b=block();const original=structuredClone(b);const v=progressionVersion(b,progressionToWorkspace(b),'区切り7（別の版 1）',{startBar:8,endBar:8});expect(v.chords).toHaveLength(1);expect(v.chords[0]!.bar).toBe(8);expect(b).toEqual(original);});
 it('free memo edits keep name and warning codes',()=>{const memo=block().memo;const changed=editProgressionMemo(memo,{free:'新しいメモ'});expect(splitProgressionMemo(changed)).toEqual({name:'区切り7（7〜9小節）',free:'新しいメモ',codes:['ambiguous-bass']});});
});

describe('P10.4 retained metadata and practice voicings',()=>{
 it('counts a voicing choice change even when its effective notes stay the same',()=>{
  const b=block();const model=progressionToWorkspace(b);const pitches=usedNotes(model,'event-0');
  model.progressionVoicingMemories={'event-0':{playbackChoice:'CUSTOM',practiceVoicingOverride:{schemaVersion:1,source:'manual',representation:'simultaneous-voicing',midiNotes:pitches,capturedForChordKey:normalizedChordKey(b.chords[0]!.chord),userVerified:true}}};
  expect(progressionChangeCount(b,model)).toBe(1);expect(progressionChanges(b,model).chords?.[0]?.voicingMemory?.playbackChoice).toBe('CUSTOM');
 });
 it('preserves unknown memo text while renaming and editing free text',()=>{
  const memo='ambiguous-bass; 区切り7（7–9小節）; verse-2';
  expect(splitProgressionMemo(memo).free).toBe('verse-2');
  const renamed=editProgressionMemo(memo,{name:'サビ'});expect(splitProgressionMemo(renamed).free).toBe('verse-2');expect(splitProgressionMemo(renamed).codes).toEqual(['ambiguous-bass']);
 });
 it('hands the saved manual notes to Voicing Loop while retaining detached source MIDI',()=>{
  const b=block();b.detectedKey='C major';const chord=b.chords[0]!;chord.voicingMemory={playbackChoice:'SOURCE',sourceVoicing:{schemaVersion:1,source:'midi-extracted',representation:'simultaneous-voicing',midiNotes:[48,60,64,67],capturedForChordKey:normalizedChordKey(chord.chord),userVerified:true}};
  const model=progressionToWorkspace(b);const edited=movePitch(model,[model.notes[1]!.id],1).model;const saved=workspaceToProgression(b,edited);
  const idea=makeIdea({progressionBlocks:[saved]});const result=buildProgressionVoicingPracticeHandoffFromVault([idea],{ideaId:idea.id,blockId:saved.id});expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.handoff.snapshots.saved?.events[0]?.voicing?.midiNotes).toEqual(usedNotes(edited,'event-0'));
  expect(saved.chords[0]!.voicingMemory!.sourceVoicing!.midiNotes).toEqual([48,60,64,67]);
 });
});

it('range versions clip existing playback extents while full no-change retains trailing rests',()=>{
 const b=block();b.detectedKey='C major';b.sourceStartBeat=24;b.sourceEndBeat=40;
 const model=progressionToWorkspace(b);expect(model.totalBeats).toBe(40);expect(workspaceToProgression(b,model)).toEqual(b);
 const range=progressionVersion(b,model,'範囲版',{startBar:8,endBar:8});expect(range.sourceStartBeat).toBe(28);expect(range.sourceEndBeat).toBe(32);
 const idea=makeIdea({progressionBlocks:[range]});const handoff=buildProgressionVoicingPracticeHandoffFromVault([idea],{ideaId:idea.id,blockId:range.id});expect(handoff.ok).toBe(true);if(handoff.ok)expect(handoff.handoff.snapshots.saved?.lengthBeats).toBe(4);
});

it('close-gap deletion shortens existing playback bounds and keeps its trailing rest',()=>{
 const b=block();b.sourceStartBeat=24;b.sourceEndBeat=40;const model=progressionToWorkspace(b);
 const edit=deleteProgressionCard(b,model,'event-1','close-gap');expect(edit.model.totalBeats).toBe(36);
 const saved=workspaceToProgression(b,edit.model);expect(saved.sourceEndBeat).toBe(36);expect(saved.sourceStartBeat).toBe(24);
 expect(saved.chords[saved.chords.length-1]!.bar).toBe(8);expect(saved.chords[saved.chords.length-1]!.durationBeats).toBe(4);
});

it('selected-card reset restores saved content and source choice while retaining structural edits',()=>{
 const b=block();let model=progressionToWorkspace(b);model=replaceProgressionName(model,'event-0',parseChordLabel('Dm7')!,false).model;
 model.progressionVoicingMemories={'event-0':{playbackChoice:'GENERATED'}};
 const reset=resetProgressionCard(b,model,'event-0');expect(reset.changed).toBe(true);expect(progressionChanges(b,reset.model)).toEqual({});
 const merged=mergeWithNext(progressionToWorkspace(b),'event-0').model;const restored=resetProgressionCard(b,merged,'event-0');expect(restored.model.cards[0]!.duration).toBe(8);expect(restored.model.cards[1]).toEqual(merged.cards[1]);
 const overlap=moveBoundary(progressionToWorkspace(b),'event-0',27).model;const resetBoundary=resetProgressionCard(b,overlap,'event-0');expect(resetBoundary.changed).toBe(true);expect(resetBoundary.model.cards[0]!.duration).toBe(3);expect(resetBoundary.model.cards[1]).toEqual(overlap.cards[1]);expect(resetBoundary.model.notes.filter(n=>n.cardId==='event-0').every(n=>n.start===24&&n.duration===3)).toBe(true);
});

it('does not mistake ordinary parenthesized free memo for a progression name',()=>{
 expect(splitProgressionMemo('warm (take 2); verse-2')).toEqual({name:undefined,free:'warm (take 2); verse-2',codes:[]});
 const renamed=editProgressionMemo('区切り7（7–9小節）; warm (take 2)',{name:'サビ (広め)'});
 expect(splitProgressionMemo(renamed)).toEqual({name:'サビ (広め)（7–9小節）',free:'warm (take 2)',codes:[]});
});
