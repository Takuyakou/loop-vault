import { describeBlockMemo } from "../../views/captureLabels";
import type { ChordSymbol, ChordTimelineItem, SavedProgressionBlock, VoicingSnapshot } from '../types';
import { beatsPerBar } from '../midi/timing';
import { normalizedChordKey, resolveTimelineItemVoicing } from '../voicing';
import { generateStyleVoicingPlan } from '../voicingPractice/optimizeProgression';
import { createEditableProgression } from '../progressionEditing/editableProgression';
import { deleteEditableChordWithMode, type DeleteChordMode } from '../progressionEditing/contextActions';
import { chooseName } from '../correction/cardEdits';
import { type CorrectionModel, type CorrectionNote, type CorrectionCard } from '../correction/correctionModel';
import { type EditResult, unchanged } from '../correction/edits';
import { reviewThresholds } from '../correction/reviewThresholds';
import type { SaveRange } from '../correction/saveCandidate';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const MINIMUM_NOTES_MESSAGE = '最後の2音は外せません（無音にするなら「消す ▾」）';
export const usedNotes = (model: CorrectionModel, id: string) => [...new Set(model.notes.filter(n => n.cardId === id && n.used).map(n => n.pitch))].sort((a,b) => a-b);
const at = (card: CorrectionCard) => ({bar:card.bar,beat:card.beat,durationBeats:card.duration});

/** Session adapter only. The saved block remains the source of every unchanged field. */
export function progressionToWorkspace(block: SavedProgressionBlock): CorrectionModel {
  const meter = beatsPerBar(block.timeSignature);
  const cards: CorrectionCard[] = block.chords.map((item,i) => ({
    id:item.eventId ?? `saved-${i}`, start:(item.bar-1)*meter+item.beat-1,
    duration:item.durationBeats,bar:item.bar,beat:item.beat,name:item.chord,
    nameSource:'typed', alternatives:item.alternatives.map(a=>a.chord), timelineIndex:i,
    reviewReasons:[],reviewed:true,attacks:1,edited:false,
  }));
  const notes: CorrectionNote[] = cards.flatMap((card,i) => {
    const pitches=card.name.label==='N.C.'?[]:resolveTimelineItemVoicing(block.chords[i]!,Boolean(block.textSource)).midiNotes;
    return pitches.map((pitch,j) => ({id:`saved-note-${i}-${j}@${card.id}`,sourceNoteId:`saved-note-${i}-${j}`,
      provenance:'SOURCE',cardId:card.id,pitch,start:card.start,duration:card.duration,
      continuesFromBefore:false,used:true,roleHint:pitch===Math.min(...pitches)?'bass':'harmony'}));
  });
  return {cards,notes,segments:[],suggestions:[],pitchRange:{low:Math.max(0,Math.min(48,...notes.map(n=>n.pitch))-3),high:Math.min(127,Math.max(72,...notes.map(n=>n.pitch))+3)},
    totalBeats:Math.max(meter,block.sourceEndBeat??0,...cards.map(c=>c.start+c.duration)),bpm:block.bpm,timeSignature:block.timeSignature,
    thresholdsVersion:'saved-progression',seq:0,context:{thresholds:reviewThresholds,meter,savedProgression:true,
      sourceNotes:notes.map(n=>({id:n.sourceNoteId!,pitch:n.pitch,start:n.start,end:n.start+n.duration,roleHint:n.roleHint})),
      melodyVoiceIds:[],melodyVoiceLabel:'',percussionPitches:[],pitchCounts:{}}};
}

function manualSnapshot(pitches: number[], chord: ChordSymbol): VoicingSnapshot {
  if (pitches.length<2 || pitches.length>10) throw new Error('鳴らす音は2〜10音にしてください');
  return {schemaVersion:1,source:'manual',representation:'simultaneous-voicing',midiNotes:pitches,
    bassNote:pitches[0],capturedForChordKey:normalizedChordKey(chord),capturedForChordLabel:chord.label,userVerified:true};
}

export function workspaceToProgression(base: SavedProgressionBlock, model: CorrectionModel): SavedProgressionBlock {
  const original=progressionToWorkspace(base);
  const chords=model.cards.map(card=>{
    const old=base.chords[card.timelineIndex];
    const originalCard=original.cards[card.timelineIndex];
    const pitches=usedNotes(model,card.id);
    const changedSound=!originalCard || !equal(pitches,usedNotes(original,originalCard.id));
    const changedName=!old || !equal(card.name,old.chord);
    const {eventId:_event, ...fallback}=old ?? {bar:card.bar,beat:card.beat,durationBeats:card.duration,chord:card.name,alternatives:[],confidence:1,warnings:[]};
    const entry:ChordTimelineItem={...(originalCard?.id===card.id?old:fallback),...at(card),chord:card.name};
    if (originalCard?.id!==card.id) entry.eventId=card.id;
    // Silence uses the existing N.C. identity; never manufacture an invalid empty snapshot.
    const memory=model.progressionVoicingMemories && card.id in model.progressionVoicingMemories ? model.progressionVoicingMemories[card.id] : old?.voicingMemory;
    if(model.progressionVoicingMemories && card.id in model.progressionVoicingMemories && equal(pitches,resolveTimelineItemVoicing({...entry,voicingMemory:memory},Boolean(base.textSource)).midiNotes)) {entry.voicingMemory=memory;return entry;}
    if (card.name.label==='N.C.') return entry;
    if (changedSound || changedName) entry.voicingMemory={...memory,
      practiceVoicingOverride:manualSnapshot(pitches,card.name),playbackChoice:'CUSTOM'};
    return entry;
  });
  const contentChanged=!equal(chords,base.chords);
  const timingChanged=!equal(chords.map(({bar,beat,durationBeats})=>({bar,beat,durationBeats})),base.chords.map(({bar,beat,durationBeats})=>({bar,beat,durationBeats})));
  return {...base,...(contentChanged?{chords,summaryText:chords.map(c=>c.chord.label).join(' - '),userEdited:true}:{}),
    ...(model.tempo!==undefined?{bpm:model.tempo}:{}),
    ...(model.progressionMemo!==undefined?{memo:model.progressionMemo}:{}),
    ...(model.progressionTags?{tags:model.progressionTags,suppressedAutoTags:model.progressionSuppressedAutoTags ?? base.suppressedAutoTags}:{}),
    ...(timingChanged?{...(base.sourceStartBeat===undefined?{}:{sourceStartBeat:base.sourceStartBeat+(model.cards[0]?.start??0)-(original.cards[0]?.start??0)}),...(base.sourceEndBeat===undefined?{}:{sourceEndBeat:base.sourceEndBeat+model.totalBeats-original.totalBeats}),startBar:model.cards[0]?.bar,endBar:Math.ceil(model.totalBeats/model.context.meter),lengthBars:Math.ceil((model.totalBeats-(model.cards[0]?.start??0))/model.context.meter)}:{})};
}

export function progressionChanges(base: SavedProgressionBlock, model: CorrectionModel): Partial<SavedProgressionBlock> {
  const next=workspaceToProgression(base,model);
  return Object.fromEntries(Object.entries(next).filter(([k,v])=>k!=='sourceBassline'&&!equal(v,base[k as keyof SavedProgressionBlock])));
}

/** Reject the whole gesture atomically when it would leave fewer than two pitches. */
export function guardProgressionNotes(result: EditResult): EditResult {
  if (!result.changed || !result.model.context.savedProgression) return result;
  const invalid=result.model.cards.some(c=>c.name.label!=='N.C.'&&usedNotes(result.model,c.id).length<2);
  return invalid ? {...result,changed:false,message:MINIMUM_NOTES_MESSAGE} : result;
}

export function replaceProgressionName(model: CorrectionModel,id:string,name:ChordSymbol,align:boolean): EditResult {
  const result=chooseName(model,id,name,'typed');
  if (!result.changed || !align) return result;
  const index=model.cards.findIndex(c=>c.id===id);
  const previous=model.cards[index-1];
  const plan=generateStyleVoicingPlan([
    ...(previous?[{...at(previous),chord:previous.name,eventId:previous.id,confidence:1,alternatives:[],warnings:[]}]:[]),
    {...at(model.cards[index]!),chord:name,eventId:id,confidence:1,alternatives:[],warnings:[]}], 'open-17',
    {maxLeftHandSpanSemitones:16,maxRightHandSpanSemitones:16,allowUnsupportedFallback:true});
  const pitches=name.label==='N.C.'?[]:plan.events[plan.events.length-1]!.allNotes;
  const card=result.model.cards[index]!;
  const seq=model.seq+1;
  const added:CorrectionNote[]=pitches.map((pitch,i)=>({id:`generated-${seq}-${i}`,provenance:'MANUAL_ADDED',sourceNoteId:null,cardId:id,pitch,start:card.start,duration:card.duration,continuesFromBefore:false,used:true,roleHint:i===0?'bass':'harmony'}));
  return {...result,model:{...result.model,seq,cards:result.model.cards.map(c=>c.id===id?{...c,edited:true}:c),notes:[...result.model.notes.map(n=>n.cardId===id?{...n,used:false}:n),...added]}};
}

/** Uses the existing four delete modes; no third deletion implementation. */
export function deleteProgressionCard(base:SavedProgressionBlock,model:CorrectionModel,id:string,mode:DeleteChordMode):EditResult {
  const block=workspaceToProgression(base,model);
  block.chords=block.chords.map((c,i)=>({...c,eventId:model.cards[i]!.id}));
  const editable=createEditableProgression(block,model.context.meter);
  const i=editable.slots.findIndex(c=>c.id===id);
  if(i<0) return unchanged(model);
  if(mode==='extend-previous'&&i===0&&editable.slots.length>1) mode='extend-next';
  if(mode==='extend-next'&&i===editable.slots.length-1&&i>0) mode='extend-previous';
  const next=deleteEditableChordWithMode(editable,id,mode);
  if(next===editable) return unchanged(model,'最後のカードは無音にするだけです');
  const cards=next.slots.map(slot=>{
    const old=model.cards.find(c=>c.id===slot.id)!;
    return {...old,...slot.position,start:(slot.position.bar-1)*model.context.meter+slot.position.beat-1,duration:slot.position.durationBeats,name:slot.currentChord,nameSource:'typed' as const};
  });
  const notes=cards.flatMap(c=>model.notes.filter(n=>n.cardId===c.id).map(n=>({...n,start:c.start,duration:c.duration,used:c.name.label==='N.C.'?false:n.used})));
  return {changed:true,label:'カードを消した',kind:'delete',model:{...model,cards,notes,totalBeats:model.totalBeats+Math.max(...cards.map(c=>c.start+c.duration))-Math.max(...model.cards.map(c=>c.start+c.duration))}};
}

export function changedProgressionCards(base:SavedProgressionBlock,model:CorrectionModel):CorrectionCard[] {
  const original=progressionToWorkspace(base);
  return model.cards.filter(c=>{const b=original.cards.find(b=>b.id===c.id);return !b||!equal(at(b),at(c))||!equal(b.name,c.name)||!equal(usedNotes(original,b.id),usedNotes(model,c.id)) || (model.progressionVoicingMemories && c.id in model.progressionVoicingMemories && !equal(model.progressionVoicingMemories[c.id],base.chords[b.timelineIndex]?.voicingMemory));});
}

export function resetProgressionCard(base:SavedProgressionBlock,model:CorrectionModel,id:string):EditResult {
  const original=progressionToWorkspace(base);const saved=original.cards.find(c=>c.id===id);const now=model.cards.find(c=>c.id===id);
  if(!saved||!now) return unchanged(model);
  // Existing saved-card reset restores content while structural edits stay in history.
  const restored={...saved,start:now.start,duration:now.duration,bar:now.bar,beat:now.beat};
  const pitches=original.notes.filter(n=>n.cardId===id);
  const memories=Object.fromEntries(Object.entries(model.progressionVoicingMemories??{}).filter(([key])=>key!==id));
  return {changed:true,kind:'name',label:'このカードを元に戻した',model:{...model,progressionVoicingMemories:memories,cards:model.cards.map(c=>c.id===id?restored:c),notes:[...model.notes.filter(n=>n.cardId!==id),...pitches.map(n=>({...n,start:now.start,duration:now.duration}))]}};
}

export function progressionVersion(base:SavedProgressionBlock,model:CorrectionModel,name:string,range?:SaveRange):SavedProgressionBlock {
  const next=workspaceToProgression(base,model);
  const meter=model.context.meter;
  if(range){next.chords=next.chords.filter(c=>(c.bar-1)*meter+c.beat-1<range.endBar*meter && (c.bar-1)*meter+c.beat-1+c.durationBeats>(range.startBar-1)*meter).map(c=>{
    const start=Math.max((c.bar-1)*meter+c.beat-1,(range.startBar-1)*meter);const end=Math.min((c.bar-1)*meter+c.beat-1+c.durationBeats,range.endBar*meter);
    return {...c,bar:Math.floor(start/meter)+1,beat:start%meter+1,durationBeats:end-start};});
    if(base.sourceStartBeat!==undefined) next.sourceStartBeat=(range.startBar-1)*meter;
    if(base.sourceEndBeat!==undefined) next.sourceEndBeat=range.endBar*meter;
    next.startBar=range.startBar;next.endBar=range.endBar;next.lengthBars=range.endBar-range.startBar+1;next.summaryText=next.chords.map(c=>c.chord.label).join(' - ');
  }
  next.memo=editProgressionMemo(next.memo,{name});return next;
}

const namePattern=/^(?:(?:区切り\d+|進行|曲全体|\d+[〜–-]\d+小節|\d+小節)(?:[（(].*[）)])?|.*[（(](?:\d+[〜–-]\d+小節|\d+小節|別の版 \d+|進行)(?:・別の版 \d+)?[）)])$/;
const codePattern={test:(part:string)=>describeBlockMemo(part)!==part};
export function splitProgressionMemo(memo:string|undefined){
  const parts=(memo??'').split(/;\s*/);const name=parts.find(p=>namePattern.test(p));
  return {name,free:parts.filter(p=>p!==name&&!codePattern.test(p)).join('; '),codes:parts.filter(p=>codePattern.test(p))};
}
export function editProgressionMemo(memo:string|undefined,edit:{name?:string;free?:string}):string {
  const old=splitProgressionMemo(memo);
  return [...old.codes,edit.name!==undefined ? (namePattern.test(edit.name)?edit.name:`${edit.name}（${old.name?.match(/[（(]([^（）()]*)[）)]$/)?.[1]??'進行'}）`) : old.name,edit.free??old.free].filter(p=>p!==undefined&&p!=='').join('; ');
}
export function progressionName(block:SavedProgressionBlock):string {return splitProgressionMemo(block.memo).name??`進行（${block.startBar??block.chords[0]?.bar??1}〜${block.endBar??Math.ceil(Math.max(4,...block.chords.map(c=>(c.bar-1)*beatsPerBar(block.timeSignature)+c.beat-1+c.durationBeats))/beatsPerBar(block.timeSignature))}小節）`;}
export function orderedProgressions(blocks:readonly SavedProgressionBlock[]):SavedProgressionBlock[]{return blocks.map((b,i)=>({b,i,start:Number(splitProgressionMemo(b.memo).name?.match(/[（(](\d+)/)?.[1]??NaN)})).sort((a,b)=>(Number.isFinite(a.start)?a.start:a.i+1)-(Number.isFinite(b.start)?b.start:b.i+1)||a.i-b.i).map(v=>v.b);}

export function progressionChangeCount(base:SavedProgressionBlock,model:CorrectionModel):number {
  const original=progressionToWorkspace(base);
  return changedProgressionCards(base,model).length+original.cards.filter(card=>!model.cards.some(current=>current.id===card.id)).length+
    (model.progressionMemo!==undefined&&!equal(model.progressionMemo,base.memo)?1:0)+
    (model.progressionTags!==undefined&&(!equal(model.progressionTags,base.tags)||!equal(model.progressionSuppressedAutoTags,base.suppressedAutoTags))?1:0)+
    (model.tempo!==undefined&&model.tempo!==(base.bpm??model.bpm)?1:0);
}
