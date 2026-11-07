import type {ThemeLesson} from './lessonModel';
import {isPartialProgression,progressionInRange} from './recordScope';
import {occurrenceChord} from './occurrenceChord';
import {buildBuiltin,builtinDisplayName,type DojoChord} from './builtins';
import type {VaultProgression} from './collect';
import {composition,recipeNotes,symbol,type Quality} from './recipes';
import {applyAttempt,recallQuality,speedLimit} from './progress';
import {afterDays,dateKey,emptyItem,type DojoStore,type Task} from './store';
import type {Target} from './judging';
import {progressionTarget} from './progressionTarget';
export function targetFor(store:DojoStore,task:Task,progressions:VaultProgression[]):{target:Target;chords:DojoChord[];name:string;pointText?:string;frozen?:ThemeLesson["targets"][number]}{
 const cursor=store.today!.cursor,lesson=store.today!.lesson,frozen=(lesson?.targets??store.today!.legacyTargets)?.find(t=>t.taskKey===task.key&&t.keyIndex===cursor.keyIndex&&t.chordIndex===cursor.chordIndex&&t.composition===(task.kind==='composition'||cursor.stage==='composition'));
 if(frozen){const chord=frozen.chord,chords=task.kind==='progression'?(lesson?.targets??store.today!.legacyTargets??[]).filter(t=>t.taskKey===task.key&&!t.composition).sort((a,b)=>a.chordIndex-b.chordIndex).map(t=>t.chord):[];const builtin=task.key.startsWith('builtin:')?buildBuiltin(task.key.split(':')[1],task.roots[cursor.keyIndex]):undefined;const visible=cursor.stage==='see'||cursor.stage==='memorize';return {target:task.kind==='progression'?progressionTarget(chord,task.key):{chord:chord.chord,notes:chord.notes,judge:frozen.composition?'composition':task.kind==='shape'?'shape':task.kind==='voicing'?'exact':builtin?.judge==='shape'?'shape':'core',bass:task.bass??'self'},chords,name:task.kind==='progression'?(visible?task.key===lesson?.source.key?lesson!.source.name:(builtin?builtinDisplayName(builtin):undefined)??progressions.find(p=>p.key===task.key)?.name??'確認する進行':`進行の確認（${chords.length}コード）`):chord.chord.label,pointText:task.key===lesson?.source.key?lesson!.source.pointText:builtin?.pointText,frozen};}
 const root=cursor.stage==='composition'&&task.kind==='shape'?0:task.roots[cursor.keyIndex]??0;
 if(task.kind==='composition'||cursor.stage==='composition'){const q=task.quality as Quality;const chord=symbol(root,q);return {target:{chord,notes:composition(root,q).map(n=>60+n),judge:'composition'},chords:[],name:chord.label};}
 if(task.kind==='shape'){const q=task.quality as Quality;const chord=symbol(root,q);return {target:{chord,notes:recipeNotes(root,q,task.preset,task.bass)??[],judge:'shape',bass:task.bass},chords:[],name:chord.label};}
 if(task.kind==='voicing'){const v=store.voicings[task.key],h=v?.occurrences[v.occurrences.length-1]?.harmony,restored=h?occurrenceChord(h):undefined;const chord=restored??(h?{...symbol(h.root,h.quality as Quality),bass:h.bass,label:h.symbol}:symbol(0,'maj'));return {target:{chord,notes:restored?v?.notes??[]:[],judge:'exact'},chords:[],name:chord.label};}
 const builtin=task.key.startsWith('builtin:')?buildBuiltin(task.key.split(':')[1],root):undefined;
 const vault=progressions.find(p=>p.key===task.key),range=task.kind==='progression'?task.range:undefined;let chords=builtin?.chords??vault?.chords??[];if(vault&&range)chords=progressionInRange(vault,range);
 const c=chords[cursor.chordIndex]??chords[0]??{chord:symbol(0,'maj'),notes:[],beats:4};return {target:progressionTarget(c,task.key),chords,name:(builtin?builtinDisplayName(builtin):undefined)??(cursor.stage==='recall'||cursor.stage==='tempo'?vault?.hiddenName??'保存した進行':vault?.name??'進行'),pointText:builtin?.pointText};
}
export function resetCursor(store:DojoStore,index:number){const t=store.today!.tasks[index];store.today!.cursor={taskIndex:index,stage:t?.kind==='composition'?'composition':t?.kind==='shape'&&!store.knownQualities[t.quality!]&&!t.review?'composition':t?.kind==='progression'&&t.review&&store.progressions[t.key]?.provisionalAt&&dateKey(new Date(store.progressions[t.key].provisionalAt!))<store.today!.date?'tempo':t?.review?'recall':'see',keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]};}
export function advance(store:DojoStore,options:{ok:boolean;self:boolean;at:string;sec?:number;recordedTempo?:boolean},progressions:VaultProgression[]):DojoStore{
 const next=structuredClone(store),today=next.today!,c=today.cursor,t=today.tasks[c.taskIndex];if(!t)return next;
 const results=today.taskResults??=[];let summary=results.find(r=>r.taskIndex===c.taskIndex);if(!summary){summary={taskIndex:c.taskIndex,attempts:0,matches:0,selfChecks:0,answerChecks:0,completed:false,skipped:false,lastStage:c.stage,lastAt:options.at};results.push(summary);}if(!options.recordedTempo){summary.attempts++;summary.matches+=Number(options.ok);summary.selfChecks+=Number(options.self);summary.answerChecks+=Number(c.answerSeen);summary.lastStage=c.stage;summary.lastResult=options.ok;summary.lastAt=options.at;}
 const finish=()=>{summary.completed=true;c.taskIndex++;if(c.taskIndex>=today.tasks.length)today.finished=true;else resetCursor(next,c.taskIndex);};
 const section=isPartialProgression(next,t,progressions);
 if(!options.ok){if(t.kind==='composition'){next.knownQualities[t.quality!]=recallQuality(next,t.quality!,false,options.at);}else if((c.stage==='recall'||c.stage==='tempo')&&!section){const map=t.kind==='shape'?next.shapes:t.kind==='voicing'?next.voicings:next.progressions;const item=map[t.key]??emptyItem();map[t.key]={...item,...applyAttempt(item,t.kind,{...options,key:t.roots[c.keyIndex]??0,stage:c.stage,answerSeen:c.answerSeen,limit:speedLimit(next)},next.settings.reviewDays)};}return next;}
 if(!options.recordedTempo)today.matched++;
 if(c.stage==='composition'){
  next.knownQualities[t.quality!]=t.kind==='composition'?recallQuality(next,t.quality!,true,options.at):{at:options.at,nextRecallAt:afterDays(options.at,7),recallStep:0};if(t.kind==='composition')finish();else c.stage='see';return next;
 }
 if(t.kind==='progression'&&c.stage!=='tempo'){
  const count=targetFor(next,t,progressions).chords.length;
  c.chordIndex++;
  if(c.retryRange){const pos=c.retryRange.indexOf(c.chordIndex-1);c.chordIndex=c.retryRange[pos+1]??count;}
  if(c.chordIndex<count)return next;
  c.chordIndex=0;
  if(c.stage==='see'){c.stage='memorize';return next;}
  // P12.5-01: a pass with a hint is not a clear, and it does not send the player back to memorize or to a retry range:
  // the same key simply goes round again (the record is the same as before: nothing is written for a hinted pass).
  if(c.hints.length){c.hints=[];c.answerSeen=false;delete c.retryRange;return next;}
  if(c.retryRange){delete c.retryRange;c.stage='memorize';return next;}
 }else if(c.stage==='see'){c.stage='recall';c.keyIndex=0;c.answerSeen=false;return next;}
 if(t.kind==='composition')return next;
 if(c.stage==='recall'||c.stage==='tempo'){
  if(!section){const map=t.kind==='shape'?next.shapes:t.kind==='voicing'?next.voicings:next.progressions;const item=map[t.key]??emptyItem();const old=item.state;
  const updated=applyAttempt(item,t.kind,{...options,key:t.roots[c.keyIndex]??0,stage:c.stage,answerSeen:c.answerSeen,limit:speedLimit(next)},next.settings.reviewDays);map[t.key]={...item,...updated};
  if(updated.state!==old&&updated.state!=='new'&&!today.added.includes(t.key))today.added.push(t.key);}
  if(!options.self&&(c.answerSeen||t.kind!=='progression'&&options.sec!==undefined&&options.sec>speedLimit(next))){c.answerSeen=false;return next;}
  if(t.kind==='shape'&&c.keyIndex+1<t.roots.length){c.keyIndex++;c.answerSeen=false;return next;}
  finish();
 }
 return next;
}

export function skipTask(store:DojoStore,at:string,pendingSuccess?:{self:boolean},progressions:VaultProgression[]=[]):DojoStore{const next=structuredClone(store),today=next.today;if(!today)return next;const t=today.tasks[today.cursor.taskIndex];if(!t)return next;const results=today.taskResults??=[];let summary=results.find(r=>r.taskIndex===today.cursor.taskIndex);if(!summary){summary={taskIndex:today.cursor.taskIndex,attempts:0,matches:0,selfChecks:0,answerChecks:0,completed:false,skipped:false,lastStage:today.cursor.stage,lastAt:at};results.push(summary);}if(pendingSuccess){today.matched++;summary.attempts++;summary.matches++;summary.selfChecks+=Number(pendingSuccess.self);summary.answerChecks+=Number(today.cursor.answerSeen);summary.lastStage=today.cursor.stage;summary.lastResult=true;}summary.skipped=true;summary.completed=false;summary.lastAt=at;if(t.kind!=='composition'&&!isPartialProgression(next,t,progressions)){const map=t.kind==='shape'?next.shapes:t.kind==='voicing'?next.voicings:next.progressions;map[t.key]??=emptyItem();map[t.key].nextCheckAt=new Date(Date.parse(at)+86400000).toISOString();}const i=today.cursor.taskIndex+1;if(i>=today.tasks.length)today.finished=true;else resetCursor(next,i);return next;}

/** Preserve actual per-chord evidence when a tempo round ends, before confirmation or skip. */
export function recordTempoRound(store:DojoStore,options:{results:readonly boolean[];self:boolean;at:string}):DojoStore{
 const next=structuredClone(store),today=next.today;if(!today||today.finished||today.tasks[today.cursor.taskIndex]?.kind!=='progression'||today.cursor.stage!=='tempo'||!options.results.length)return next;
 const results=today.taskResults??=[];let summary=results.find(r=>r.taskIndex===today.cursor.taskIndex);if(!summary){summary={taskIndex:today.cursor.taskIndex,attempts:0,matches:0,selfChecks:0,answerChecks:0,completed:false,skipped:false,lastStage:'tempo',lastAt:options.at};results.push(summary);}
 const matches=options.results.filter(Boolean).length;summary.attempts+=options.results.length;summary.matches+=matches;summary.selfChecks+=options.self?options.results.length:0;summary.answerChecks+=today.cursor.answerSeen?options.results.length:0;summary.lastStage='tempo';summary.lastResult=options.results.every(Boolean);summary.lastAt=options.at;today.matched+=matches;today.cursor.tempoResults=[...options.results];today.cursor.chordIndex=0;return next;
}
