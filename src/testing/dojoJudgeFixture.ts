import {parseChordLabel} from '../domain/chords';
import {normalizedChordKey} from '../domain/voicing';
import {makeIdea} from '../domain/testFactory';
import type {SavedProgressionBlock} from '../domain/types';
import {DOJO_JUDGE_ANSWERS} from './dojoJudgeAnswers';
export {DOJO_JUDGE_ANSWERS} from './dojoJudgeAnswers';
export function dojoJudgeIdeas(bars=14,source:boolean|'mixed'=true){
 const block:SavedProgressionBlock={id:'12000000-0000-4000-8000-000000000801',summaryText:'public authored jazz practice',memo:'公開合成・表示判定一致',tags:['public-synthetic'],capturedAt:'2026-10-14T00:00:00.000Z',analyzerVersion:'synthetic',bpm:120,timeSignature:'4/4',startBar:1,endBar:bars,
 chords:Array.from({length:bars},(_,i)=>{const answer=DOJO_JUDGE_ANSWERS[i%DOJO_JUDGE_ANSWERS.length],chord=parseChordLabel(answer.label)!;return {eventId:`authored-${i}`,bar:i+1,beat:1,durationBeats:4,chord,confidence:1,alternatives:[],warnings:[],...(source&&(source!=='mixed'||i%2===0)?{voicingMemory:{sourceVoicing:{schemaVersion:1 as const,source:'midi-extracted' as const,representation:'simultaneous-voicing' as const,capturedForChordKey:normalizedChordKey(chord),midiNotes:[...answer.notes],userVerified:true}}}:{})};})};
 return [makeIdea({id:'12000000-0000-4000-8000-000000000802',title:'公開合成Jazz進行',bpm:120,progressionBlocks:[block]})];
}
