import {ProgressionVoicingTransport} from '../../practice/ProgressionVoicingTransport';
import {buildProgressionVoicingPracticeSnapshot} from '../../domain/progressionVoicingPractice/snapshot';
import {resolveProgressionPracticeVoicings} from '../../domain/progressionVoicingPractice/voicingResolution';
import {normalizedChordKey} from '../../domain/voicing';
import type {DojoChord} from '../../domain/chordDojo/builtins';
import type {SavedProgressionBlock} from '../../domain/types';
/** Reuse the existing musical clock, with reference sound disabled during recall.
 * The plan itself (snapshot + voicings) is separated from the transport so a caller can ask whether
 * this material can run on the existing clock without creating a player. */
export function tempoPlanData(chords:readonly DojoChord[],bpm:number){
 let beat=0;const id='12000000-0000-4000-8000-000000000001';
 const block:SavedProgressionBlock={id,summaryText:'',bpm,timeSignature:'4/4',capturedAt:'2026-10-04T00:00:00.000Z',tags:[],analyzerVersion:'chord-dojo',chords:chords.map((c,i)=>{const start=beat;beat+=c.beats;return {eventId:'dojo-'+i,bar:Math.floor(start/4)+1,beat:start%4+1,durationBeats:c.beats,chord:c.chord,confidence:1,alternatives:[],warnings:[],voicingMemory:{practiceVoicingOverride:{schemaVersion:1,source:'manual',representation:'simultaneous-voicing',midiNotes:c.notes,capturedForChordKey:normalizedChordKey(c.chord)}}};})};
 const result=buildProgressionVoicingPracticeSnapshot({block,sourceReference:{ideaId:'12000000-0000-4000-8000-000000000002',blockId:id},selection:'custom'});
 if(!result.ok)throw new Error('この進行はテンポでの練習に対応していません。');
 return {snapshot:result.snapshot,plan:resolveProgressionPracticeVoicings(result.snapshot)};
}

export function tempoPlan(chords:readonly DojoChord[],bpm:number){
 return {...tempoPlanData(chords,bpm),transport:new ProgressionVoicingTransport(true)};
}

/** Whether the existing clock can play this material at all (the same check `tempoPlan` makes). */
export function canUseTempo(chords:readonly DojoChord[],bpm:number):boolean{
 try{tempoPlanData(chords,bpm);return true;}catch{return false;}
}
