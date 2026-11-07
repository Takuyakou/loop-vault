import {p12ThemeIdeas} from './p12ThemeFixture';
import {dojoLongIdeas} from './dojoLongFixture';
import {dojoJudgeIdeas} from './dojoJudgeFixture';
import {parseExtendedTextProgression} from '../domain/extendedTextProgression';
import {extendedTextSaveData} from '../domain/extendedTextSave';
import {parseChordLabel} from '../domain/chords';
import {normalizedChordKey} from '../domain/voicing';
import {makeIdea} from '../domain/testFactory';
import type {SavedProgressionBlock,SongIdea} from '../domain/types';
/** Synthetic data only. Loaded by App solely in fixture-enabled browser builds. */
export function p104Ideas(long=false,text=false):SongIdea[]{
 if(new URLSearchParams(globalThis.location?.search??'').get('p104')==='judge')return dojoJudgeIdeas();
 if(new URLSearchParams(globalThis.location?.search??'').get('p104')==='judge-mixed')return dojoJudgeIdeas(14,'mixed');
 if(new URLSearchParams(globalThis.location?.search??'').get('p104')==='judge-generated')return dojoJudgeIdeas(14,false);
 if(new URLSearchParams(globalThis.location?.search??'').get('p104')==='judge-long')return dojoJudgeIdeas(66);
 if(new URLSearchParams(globalThis.location?.search??'').get('p104')==='dojo-long')return dojoLongIdeas();
 if(new URLSearchParams(globalThis.location?.search??'').get('p104')==='theme')return p12ThemeIdeas();
 const labels=['C','F','G','Am'];
 const b:SavedProgressionBlock={id:'10400000-0000-4000-8000-000000000001',summaryText:'C - F - G - Am',startBar:long?1:25,endBar:long?70:32,lengthBars:long?70:8,timeSignature:'4/4',bpm:240,detectedKey:'C major',tags:['public-fixture'],memo:long?'区切り1（1〜70小節）; 長い進行':'ambiguous-bass; 区切り7（25〜32小節）; 自由メモ',capturedAt:'2026-10-04T00:00:00.000Z',analyzerVersion:'synthetic',sourceFingerprint:'p104-public-source',userVerified:true,
 chords:Array.from({length:long?70:8},(_,i)=>{const chord=parseChordLabel(labels[i%4]!)!;const pitches=[[48,60,64,67],[53,60,65,69],[43,59,62,67],[45,60,64,69]][i%4]!;return {eventId:`p104-${i}`,bar:(long?1:25)+i,beat:1,durationBeats:4,chord,confidence:1,alternatives:[{chord:parseChordLabel('Dm7')!,confidence:0.8}],warnings:[],voicingMemory:{sourceVoicing:{schemaVersion:1,source:'midi-extracted',representation:'simultaneous-voicing',midiNotes:pitches,bassNote:pitches[0],capturedForChordKey:normalizedChordKey(chord),userVerified:true},playbackChoice:'SOURCE'}};})};
 if(text){const data=extendedTextSaveData(parseExtendedTextProgression('| C % | F | G | Am |'));Object.assign(b,{chords:data.chords.map((card,i)=>({...card,eventId:`p104-${i}`})),textSource:data.textSource,sourceStartBeat:0,sourceEndBeat:data.scoreLengthBeats,startBar:1,endBar:4,lengthBars:4,memo:'区切り1（1〜4小節）; 合成テキスト'});}
 const second:SavedProgressionBlock={...b,id:'10400000-0000-4000-8000-000000000002',memo:'区切り8（33〜40小節）; 第二進行',startBar:33,endBar:40,lengthBars:8,chords:b.chords.slice(0,8).map((c,i)=>({...c,eventId:`other-${i}`,bar:33+i}))};
 return [makeIdea({id:'10400000-0000-4000-8000-000000000003',title:'P10.4 合成曲',key:'C major',bpm:240,progressionBlocks:[b,second]})];
}
