import {buildProgressionVoicingPracticeSnapshot} from '../progressionVoicingPractice/snapshot';
import {splitProgressionMemo} from '../progressionWorkspace/progressionWorkspace';
import {progressionFingerprint} from '../practice/progressionFingerprint';
import {degreeOf} from '../harmony/degrees';
import {voiceChordForPreview} from '../chordVoicing';
import type {SavedProgressionBlock,SongIdea} from '../types';
import type {DojoChord} from './builtins';
import {emptyItem,type DojoStore,type Occurrence} from './store';
export interface VaultProgression {key:string;blockId:string;ideaId:string;name:string;displayName?:string;memo?:string;sourceIsMidi?:boolean;beatsPerBar?:number;chordBeatRanges?:{start:number;end:number}[];sourceBarRange?:{startBar:number;endBar:number};keyContext?:string;sourceName?:string;rangeLabel?:string;hiddenName?:string;range?:{index:number;startBar:number;endBar:number};chords:DojoChord[];chordBars:number[];legacyConfirmed:boolean;pinned:boolean;capturedAt:string;}
export function collectVault(ideas:readonly SongIdea[],at:string){
 const voicings:DojoStore['voicings']={};const progressions:VaultProgression[]=[];
 for(const idea of ideas)for(const [blockIndex,block] of (idea.progressionBlocks??[]).entries()){
  const key=vaultKey(block),meter=Number(block.timeSignature?.split('/')[0]??4);
  // Events may retain song coordinates. Labels are relative to the saved extent; group keys stay unchanged.
  const savedStart=block.sourceStartBeat??((block.startBar??Math.min(...block.chords.map(e=>e.bar),Infinity))-1)*meter;
  // Keep the saved block whole: no eight-bar passage split.
  const chords:DojoChord[]=[];const chordBars:number[]=[];let spanStart=Infinity,spanEnd=0;
  for(const [index,event]of block.chords.entries()){
   let chosen:number[]|undefined,chosenSource:DojoChord['source'];
   for(const source of ['saved','source-midi','custom'] as const){
    const isolated:SavedProgressionBlock={...block,bpm:block.bpm??idea.bpm??70,timeSignature:block.timeSignature??'4/4',chords:[{...event,bar:1,beat:1}],sourceStartBeat:undefined,sourceEndBeat:undefined,textSource:undefined};
    const snapshot=buildProgressionVoicingPracticeSnapshot({sourceReference:{ideaId:idea.id,blockId:block.id},block:isolated,selection:source});
    if(!snapshot.ok||!snapshot.snapshot.events[0]?.voicing)continue;
    const notes=[...snapshot.snapshot.events[0].voicing!.midiNotes].sort((a,b)=>a-b);if(!notes.length)continue;
    const noteKey='notes:'+notes.join(',');
    const occurrence:Occurrence={progressionId:block.id,ideaId:idea.id,chordId:event.eventId??`legacy:${event.bar}:${event.beat}:${index}`,source,harmony:{root:event.chord.root,quality:event.chord.quality,...(event.chord.bass===undefined?{}:{bass:event.chord.bass}),symbol:snapshot.snapshot.events[0].chord.label},seenAt:at};
    voicings[noteKey]??={...emptyItem(),notes,occurrences:[]};voicings[noteKey].occurrences.push(occurrence);if(!chosen){chosen=notes;chosenSource={ideaId:idea.id,blockId:block.id,eventId:occurrence.chordId,source,voicingKey:noteKey};}
   }
   const offset=(event.bar-1)*meter+event.beat-1;
   chords.push({source:chosenSource,keyContext:block.detectedKey??idea.key,chord:structuredClone(event.chord),notes:chosen??voiceChordForPreview(event.chord).notes,beats:event.durationBeats,degree:degreeOf(event.chord,block.detectedKey??idea.key)?.label});chordBars.push(Math.floor(Math.max(0,offset-savedStart)/meter)+1);
   spanStart=Math.min(spanStart,offset);spanEnd=Math.max(spanEnd,offset+event.durationBeats);
  }
  if(chords.length){
   const range={index:1,startBar:Math.floor(Math.max(0,spanStart-savedStart)/meter)+1,endBar:Math.max(1,Math.ceil((spanEnd-savedStart)/meter))};
   const memo=splitProgressionMemo(block.memo),savedName=memo.name??memo.free.trim();
   const displayName=savedName||(idea.title?.trim()?`${idea.title.trim()}${(idea.progressionBlocks?.length??0)>1?`・保存進行${blockIndex+1}`:''}`:`保存進行${blockIndex+1}`);
   const sourceName=`${idea.title?.trim()||'保存したアイデア'} / ${savedName?`保存名「${savedName}」`:`保存進行${blockIndex+1}`}`;
   const scope=`保存内${range.startBar}〜${range.endBar}小節`,bars=range.endBar-range.startBar+1;
   progressions.push({key,blockId:block.id,ideaId:idea.id,name:sourceName,displayName,memo:block.memo,sourceIsMidi:!block.textSource&&Boolean(block.sourceAssetId||block.sourceFileName||block.origin==='live-midi'),beatsPerBar:meter,chordBeatRanges:block.chords.map(e=>({start:(e.bar-1)*meter+e.beat-1-savedStart,end:(e.bar-1)*meter+e.beat-1+e.durationBeats-savedStart})),sourceBarRange:{startBar:Math.floor(spanStart/meter)+1,endBar:Math.ceil(spanEnd/meter)},sourceName,rangeLabel:scope,hiddenName:`保存進行${blockIndex+1}（全${bars}小節）`,range,keyContext:block.detectedKey??idea.key,chords,chordBars,legacyConfirmed:Boolean(block.practice?.confirmedLevel),pinned:Boolean(block.pinned),capturedAt:block.capturedAt});
  }
 }
 return {voicings,progressions};
}
export const vaultKey=(block:SavedProgressionBlock)=>`vault:${block.id}:${progressionFingerprint(block)}`;
export function syncVault(store:DojoStore,collection:ReturnType<typeof collectVault>,at:string):DojoStore{
 const next=structuredClone(store);
 for(const [k,v]of Object.entries(collection.voicings)){const previous=next.voicings[k];next.voicings[k]={...v,...(previous??{}),notes:v.notes,occurrences:v.occurrences};}
 for(const [k,v]of Object.entries(next.voicings))if(!collection.voicings[k])v.occurrences=[];
 const active=new Set(collection.progressions.map(p=>p.key));
 for(const p of collection.progressions){if(!next.progressions[p.key])next.progressions[p.key]=emptyItem();}
 for(const [k,v]of Object.entries(next.progressions))if(k.startsWith('vault:')&&!active.has(k)){if(/:section:\d+$/.test(k))continue;v.missingSince??=at;if(new Date(at).getTime()-new Date(v.missingSince).getTime()>30*86400000)delete next.progressions[k];}
 for(const k of active)if(next.progressions[k])delete next.progressions[k].missingSince;
 return next;
}
