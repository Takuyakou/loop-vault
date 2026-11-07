import {targetFor} from './session';
import {progressionInRange} from './recordScope';
import {occurrenceChord} from './occurrenceChord';
import {chordPitchClasses} from '../chordVoicing';
import {BUILTINS,buildBuiltin,keyLabel,type DojoChord} from './builtins';
import {CURRICULUM,QUALITIES,composition,recipeNotes,shapeKey,symbol,pc,type Quality} from './recipes';
import {weakKeys} from './progress';
import {dateKey,emptyItem,type DojoStore,type Task} from './store';
import type {VaultProgression} from './collect';
import type {ThemeLesson} from './lessonModel';
import {snapshotRevision} from './targetSnapshot';
export interface PlanningOptions {preferredKey?:string;standardKey?:number;forceNew?:boolean;replaceLegacy?:boolean;budgetSeconds?:number;reviewLimit?:number;}
const history=(item:ReturnType<typeof emptyItem>|undefined)=>Boolean(item&&(item.state!=='new'||item.recent.length));
const feasible=(chords:readonly DojoChord[])=>chords.length>0&&chords.every(c=>Number.isFinite(c.beats)&&c.beats>0&&c.notes.length>0&&c.notes.every(n=>Number.isInteger(n)&&n>=0&&n<=127)&&new Set(c.notes).size===c.notes.length);
export const progressionEstimate=(chords:readonly DojoChord[],bpm:number)=>Math.ceil(chords.reduce((n,c)=>n+c.beats,0)*60/bpm*3+60);
/** Match structured intervals and quality, never chord-name substrings or a collapsed 7th/9th. */
export function themeQuality(chord:DojoChord['chord']):Quality|undefined {
 if(!QUALITIES.includes(chord.quality as Quality))return;
 const actual=[...new Set(chordPitchClasses(chord).map(n=>pc(n-chord.root)))].sort((a,b)=>a-b).join(',');
 return QUALITIES.find(q=>[...new Set(composition(0,q))].sort((a,b)=>a-b).join(',')===actual);
}
const initialCursor=(store:DojoStore,task?:Task,date=dateKey(new Date()))=>({taskIndex:0,stage:task?.kind==='composition'?'composition' as const:task?.kind==='shape'&&!store.knownQualities[task.quality!]&&!task.review?'composition' as const:task?.kind==='progression'&&task.review&&store.progressions[task.key]?.provisionalAt&&dateKey(new Date(store.progressions[task.key].provisionalAt!))<date?'tempo' as const:task?.review?'recall' as const:'see' as const,keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]});
/** The theme lesson keeps the saved-range unit (≤8 saved bars); the saved list practises the whole block. */
const bounded=(p:VaultProgression)=>{
 const start=p.range?.startBar??1,limit=start+7,meter=p.beatsPerBar;
 const occupiedEnd=meter&&p.chordBeatRanges
  ?Math.ceil(Math.max(...p.chordBeatRanges.filter(span=>span.start<limit*meter).map(span=>span.end))/meter)
  :Math.max(...p.chordBars.filter(bar=>bar<=limit));
 const endBar=Math.min(p.range?.endBar??Math.max(...p.chordBars),limit,occupiedEnd);
 const range={index:1,startBar:start,endBar};
 if(p.range&&endBar===p.range.endBar)return {chords:p.chords,range:p.range,rangeLabel:p.rangeLabel??'保存した範囲',name:p.name};
 const scope=`練習範囲1（保存内${start}〜${endBar}小節）`;
 return {chords:progressionInRange(p,range),range,rangeLabel:scope,name:`${p.sourceName??p.name}｜${scope}`};
};
export function planToday(store:DojoStore,progressions:VaultProgression[],now:Date,options:PlanningOptions={}):NonNullable<DojoStore['today']>{
 const date=dateKey(now),at=now.toISOString(),prior=store.today;
 if(prior?.lesson&&!prior.finished&&prior.startedAt)return structuredClone(prior);
 if(prior?.lesson&&prior.date===date&&!options.forceNew)return structuredClone(prior);
 if(prior&&!prior.lesson&&!prior.finished&&!options.replaceLegacy){const next=structuredClone(prior);next.legacyOriginalTasks??=structuredClone(next.tasks);next.legacyResumeTask??=next.cursor.taskIndex;next.tasks=next.tasks.slice(0,next.legacyResumeTask+1);
  if(!next.legacyTargets){next.legacyTargets=[];const task=next.tasks[next.cursor.taskIndex];if(task){for(let keyIndex=0;keyIndex<task.roots.length;keyIndex++)for(const composition of (task.kind==='shape'?[false,true]:[task.kind==='composition'])){const copy=structuredClone(store);copy.today=structuredClone(next);copy.today.cursor={...next.cursor,keyIndex,chordIndex:0,stage:composition?'composition':'see'};const target=targetFor(copy,task,progressions);const chords=task.kind==='progression'?target.chords:[{chord:target.target.chord,notes:[...target.target.notes],beats:4}];for(const [chordIndex,chord] of chords.entries())if(chord.notes.length)next.legacyTargets.push({taskKey:task.key,keyIndex,chordIndex,composition,targetId:`legacy:${task.key}:${keyIndex}:${chordIndex}:${composition}`,revision:snapshotRevision(chord),chord:structuredClone(chord)});}}}
  return next;}
 const budget=Math.max(0,options.budgetSeconds??store.settings.lessonPolicy?.budgetSeconds??900),reviewLimit=Math.max(0,Math.min(6,options.reviewLimit??store.settings.lessonPolicy?.reviewLimit??6));
 const used=new Set(store.reviewJournal?.date===date?store.reviewJournal.keys:[]);
 if(prior?.date===date&&prior.startedAt)for(const task of prior.tasks.filter(t=>t.review))used.add(task.kind+':'+task.key);
 const availableReviews=Math.max(0,reviewLimit-used.size),tasks:Task[]=[],skips:ThemeLesson['skips']=[];
 const skip=(unit:string,reason:string)=>skips.push({unit:unit.slice(0,256),reason});
 const seeded=(key:string)=>parseInt(snapshotRevision(date+':'+store.startedAt+':'+key),16);
 const standardKey=options.standardKey??0;
 const candidates:{key:string;root:number;chords:DojoChord[];source:ThemeLesson["source"];pinned:boolean;range?:VaultProgression['range']}[]=[...progressions.map(p=>{const b=bounded(p);return {key:p.key,root:0,chords:b.chords,range:b.range,source:{kind:'vault' as const,key:p.key,identity:p.key,name:b.name,keyContext:p.keyContext,rangeLabel:b.rangeLabel,range:b.range,ideaId:p.ideaId,blockId:p.blockId},pinned:p.pinned};}),...BUILTINS.filter(b=>b.todayPool).map(b=>{const key=`builtin:${b.id}:${b.version}`,root=options.standardKey!==undefined?pc(options.standardKey):store.progressions[key]?.state==='passed'?weakKeys(store.progressions[key],1,seeded(key))[0]:standardKey,actual=buildBuiltin(b.id,root);return {key,root,chords:actual.chords,source:{kind:'builtin' as const,key,identity:key,name:b.title?`${b.title}（${b.name}）`:b.name,keyContext:b.mode==='minor'?keyLabel(root,'minor'):symbol(root,'maj').label,rangeLabel:`1〜${actual.chords.length}番目`,presetId:b.id,presetVersion:b.version,pointText:actual.pointText},pinned:false};})];
 const usable=candidates.filter(c=>{if(!feasible(c.chords)){skip(c.source.name,'安全に判定できる目標音がありません');return false;}if(progressionEstimate(c.chords,store.settings.progBpm)>budget){skip(c.source.name,'最後の進行の目安が計画の予算を超えます');return false;}if(history(store.progressions[c.key])&&(availableReviews===0||used.has('progression:'+c.key))){skip(c.source.name,'今日の確認枠を使い終えています');return false;}return true;});
 const due=(key:string)=>store.progressions[key]?.nextCheckAt??'9999';
 const weak=(key:string)=>store.progressions[key]?.recent.slice(-1)[0]?.ok===false?1:0;
 usable.sort((a,b)=>Number(b.key===options.preferredKey)-Number(a.key===options.preferredKey)||Number(b.source.kind==='vault')-Number(a.source.kind==='vault')||Number(b.pinned)-Number(a.pinned)||Number(Boolean(store.progressions[b.key]?.wanted))-Number(Boolean(store.progressions[a.key]?.wanted))||due(a.key).localeCompare(due(b.key))||weak(b.key)-weak(a.key)||Number(history(store.progressions[a.key]))-Number(history(store.progressions[b.key]))||(a.source.blockId&&a.source.blockId===b.source.blockId?(a.source.range?.index??1)-(b.source.range?.index??1):0)||(a.source.kind==='builtin'&&b.source.kind==='builtin'?Number(b.key.includes('i-v-vi-iv'))-Number(a.key.includes('i-v-vi-iv')):0)||seeded(a.key)-seeded(b.key));
 const theme=usable[0],finish:Task|undefined=theme?{kind:'progression',key:theme.key,review:history(store.progressions[theme.key]),roots:[theme.root],seconds:progressionEstimate(theme.chords,store.settings.progBpm),...(theme.range?{range:{startBar:theme.range.startBar,endBar:theme.range.endBar}}:{})}:undefined;
 // Reserve the final progression and its common review slot BEFORE adding anything else.
 let seconds=finish?.seconds??0,reviews=finish?.review?1:0;const related:ThemeLesson['related']=[];
 const add=(task:Task)=>{if(tasks.some(t=>t.key===task.key)||task.key===finish?.key){skip(task.key,'同じ練習は計画内で一度だけです');return false;}if(task.review&&(reviews>=availableReviews||used.has(task.kind+':'+task.key))){skip(task.key,'今日の確認枠');return false;}if(seconds+task.seconds>budget){skip(task.key,'最後の進行を残すため、この計画の時間枠から外しました');return false;}tasks.push(task);seconds+=task.seconds;if(task.review)reviews++;return true;};
 const taskFor=(kind:'shape'|'voicing'|'progression',key:string):Task|undefined=>{
  if(kind==='shape'){const entry=CURRICULUM.find(c=>shapeKey(c.quality,c.preset,c.bass)===key);return entry?{kind,key,review:true,...entry,roots:weakKeys(store.shapes[key]??emptyItem(),4,seeded(key)),seconds:60}:undefined;}
  if(kind==='voicing')return store.voicings[key]?.occurrences.length?{kind,key,review:true,roots:[0],seconds:40}:undefined;
  const c=candidates.find(c=>c.key===key);return c&&feasible(c.chords)?{kind,key,review:true,roots:[c.source.kind==='builtin'?weakKeys(store.progressions[key]??emptyItem(),1,seeded(key))[0]:0],seconds:progressionEstimate(c.chords,store.settings.progBpm),...(c.range?{range:{startBar:c.range.startBar,endBar:c.range.endBar}}:{})}:undefined;
 };
 const all=[...Object.entries(store.shapes).map(([key,value])=>({kind:'shape' as const,key,value})),...Object.entries(store.voicings).map(([key,value])=>({kind:'voicing' as const,key,value})),...Object.entries(store.progressions).filter(([,v])=>!v.missingSince).map(([key,value])=>({kind:'progression' as const,key,value}))];
 const wanted=all.filter(i=>i.value.wanted&&(!i.value.recent.length||Date.parse(at)-Date.parse(i.value.recent.slice(-1)[0].at)>=7*86400000)).sort((a,b)=>(a.value.recent.slice(-1)[0]?.at??'').localeCompare(b.value.recent.slice(-1)[0]?.at??''))[0];
 if(wanted){const t=taskFor(wanted.kind,wanted.key);if(t)add(t);}
 const compositionRecall=Object.entries(store.knownQualities).filter(([,v])=>v.nextRecallAt<=at).sort((a,b)=>a[1].nextRecallAt.localeCompare(b[1].nextRecallAt))[0];
 if(compositionRecall)add({kind:'composition',key:compositionRecall[0],quality:compositionRecall[0],review:true,roots:[0],seconds:30});
 for(const i of all.filter(i=>i.value.nextCheckAt&&i.value.nextCheckAt<=at||i.value.state==='new'&&i.value.recent.length).sort((a,b)=>(a.value.nextCheckAt??'').localeCompare(b.value.nextCheckAt??''))){const t=taskFor(i.kind,i.key);if(t)add(t);}
 if(theme){
  for(const [index,chord] of theme.chords.entries()){
   const quality=themeQuality(chord.chord);if(!quality){skip(chord.chord.label,'この種類・テンション・省略に一致する基本の型はありません');continue;}
   const key=shapeKey(quality),existing=related.find(r=>r.kind==='shape'&&r.taskKey===key);if(existing){existing.chordIndices.push(index);continue;}
   if(tasks.some(t=>t.key===key)){skip(chord.chord.label,'関連する型は今日の確認で扱います');continue;}
   if(history(store.shapes[key])){skip(chord.chord.label,'関連する基本の型は既習です');continue;}
   const entry=CURRICULUM.find(c=>c.quality===quality&&c.preset==='basic'&&c.bass==='self');
   if(entry&&add({kind:'shape',key,review:false,...entry,roots:weakKeys(store.shapes[key]??emptyItem(),3,seeded(key)),seconds:60}))related.push({taskKey:key,kind:'shape',chordIndices:[index]});
  }
  for(const [index,chord] of theme.chords.entries()){
   const source=chord.source;if(!source){skip(chord.chord.label,'この範囲には保存した音がありません');continue;}
   const key=source.voicingKey,voice=store.voicings[key];
   const proven=voice?.notes.join(',')===chord.notes.join(',')&&voice.occurrences.some(o=>o.progressionId===source.blockId&&o.chordId===source.eventId&&o.source===source.source&&(!o.ideaId||o.ideaId===source.ideaId));
   if(!proven){skip(chord.chord.label,'保存音と元イベントの対応を確認できません');continue;}
   const existing=related.find(r=>r.kind==='voicing'&&r.taskKey===key);if(existing){existing.chordIndices.push(index);continue;}
   if(tasks.some(t=>t.key===key)){skip(chord.chord.label,'この保存音は今日の確認で扱います');continue;}
   if(history(voice)){skip(chord.chord.label,'この保存音は既習です');continue;}
   if(add({kind:'voicing',key,review:false,roots:[0],seconds:40}))related.push({taskKey:key,kind:'voicing',chordIndices:[index]});
  }
 }
 if(finish)tasks.push(finish);
 let lesson:ThemeLesson|undefined;
 if(theme&&finish){lesson={version:1,lessonId:`lesson:${date}:${snapshotRevision(theme.source.identity+":"+theme.source.keyContext)}`,revision:snapshotRevision(theme.chords),source:theme.source,chords:structuredClone(theme.chords),targets:[],related,skips,budget:{limitSeconds:budget,estimatedSeconds:seconds,finishSeconds:finish.seconds,reviewLimit,previousReviews:used.size,reservedFinishReview:finish.review}};
  for(const task of tasks){let variants:{chords:DojoChord[];keyIndex:number;composition:boolean}[]=[];
   if(task.kind==='shape'){variants=task.roots.map((root,keyIndex)=>({chords:[{chord:symbol(root,task.quality as Quality),notes:recipeNotes(root,task.quality as Quality,task.preset,task.bass)??[],beats:4}],keyIndex,composition:false}));if(!store.knownQualities[task.quality!])variants.push({chords:[{chord:symbol(0,task.quality as Quality),notes:composition(0,task.quality as Quality).map(n=>60+n),beats:4}],keyIndex:0,composition:true});}
   else if(task.kind==='composition')variants=[{chords:[{chord:symbol(0,task.quality as Quality),notes:composition(0,task.quality as Quality).map(n=>60+n),beats:4}],keyIndex:0,composition:true}];
   else if(task.kind==='voicing'){const link=related.find(r=>r.taskKey===task.key),v=store.voicings[task.key],h=v?.occurrences.slice(-1)[0]?.harmony,chord=h?occurrenceChord(h):undefined;const actual=link?theme.chords[link.chordIndices[0]]:chord?{chord,notes:v.notes,beats:4}:undefined;if(actual)variants=[{chords:[structuredClone(actual)],keyIndex:0,composition:false}];}
   else variants=[{chords:task.key===finish.key?theme.chords:task.key.startsWith('builtin:')?buildBuiltin(task.key.split(':')[1],task.roots[0]).chords:candidates.find(p=>p.key===task.key)?.chords??[],keyIndex:0,composition:false}];
   for(const v of variants)for(const [chordIndex,chord] of v.chords.entries())if(chord.notes.length)lesson.targets.push({taskKey:task.key,keyIndex:v.keyIndex,chordIndex,composition:v.composition,targetId:`${task.key}:${v.keyIndex}:${chordIndex}:${Number(v.composition)}`,revision:snapshotRevision(chord),chord:structuredClone(chord)});
  }
 }
 return {date,tasks,cursor:initialCursor(store,tasks[0],date),finished:tasks.length===0,added:[],matched:0,...(lesson?{lesson}:{planningSkips:skips})};
}
