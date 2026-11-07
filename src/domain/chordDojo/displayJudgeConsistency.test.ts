import {describe,it,expect} from 'vitest';
import {DOJO_JUDGE_ANSWERS,dojoJudgeIdeas} from '../../testing/dojoJudgeFixture';
import {collectVault,syncVault} from './collect';
import {emptyStore,type Task} from './store';
import {targetFor} from './session';
import {judgeChord,requiredCount,ChordEntry} from './judging';
import {planToday} from './planner';
import {parseChordLabel} from '../chords';
import {voiceChordForPreview} from '../chordVoicing';
import {progressionTarget} from './progressionTarget';
const now=new Date('2026-10-14T00:00:00.000Z'),at=now.toISOString();
function prepared(bars=14,source=true){
 const ideas=dojoJudgeIdeas(bars,source),collection=collectVault(ideas,at),p=collection.progressions[0],store=syncVault(emptyStore(now),collection,at);
 const task:Task={kind:'progression',key:p.key,roots:[0],review:false,seconds:120};
 store.today={date:'2026-10-14',tasks:[task],cursor:{taskIndex:0,stage:'see',keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0};
 return {ideas,collection,p,store,task};
}
describe('independent displayed-note / judge contract',()=>{
 for(const stage of ['see','recall','tempo'] as const)it(`all authored saved jazz answers are playable without hidden tones in ${stage}`,()=>{
  const {ideas,collection,p,store,task}=prepared(),before=JSON.stringify(ideas);store.today!.cursor.stage=stage;
  DOJO_JUDGE_ANSWERS.forEach((answer,i)=>{store.today!.cursor.chordIndex=i;const t=targetFor(store,task,collection.progressions).target;
   expect(t.notes).toEqual(answer.notes);expect(p.chords[i].notes).toEqual(answer.notes);expect(t.judge).toBe('exact');expect(judgeChord(t,answer.notes).ok).toBe(true);expect(requiredCount(t)).toBe(answer.notes.length);
   const entry=new ChordEntry(requiredCount(t),60);answer.notes.forEach((n,j)=>entry.event(0,n,true,j));expect(judgeChord(t,entry.poll(100)!.notes).ok).toBe(true);
   expect(judgeChord(t,answer.notes.slice(1)).ok).toBe(false);expect(judgeChord(t,[...answer.notes,85]).ok).toBe(false);expect(judgeChord(t,answer.notes.map(n=>n+12)).ok).toBe(false);
  });expect(JSON.stringify(ideas)).toBe(before);
 });
 it('reproduces hidden D in the old Bm11 core path, but saved-note practice must not request it',()=>{
  const {store,task,collection}=prepared();store.today!.cursor.chordIndex=2;const t=targetFor(store,task,collection.progressions).target;
  expect(t.chord).toMatchObject({root:11,quality:'min11',tensions:[]});expect(t.chord.bass).toBeUndefined();
  expect(judgeChord({...t,judge:'core'},DOJO_JUDGE_ANSWERS[2].notes)).toEqual({ok:false,message:'D がありません'});
  expect(judgeChord(t,DOJO_JUDGE_ANSWERS[2].notes)).toEqual({ok:true,message:'合いました'});
  expect(judgeChord(t,[59,69,76,78])).toEqual({ok:false,message:'D♭ がありません'});
 });
 it('generated composition guide explicitly contains the mandatory D, and composition/builtin policy remains intact',()=>{
  const chord=parseChordLabel('Bm11')!,notes=voiceChordForPreview(chord).notes;
  expect(notes).toEqual([47,57,61,62,64,66]);expect(judgeChord({chord,notes,judge:'core'},notes).ok).toBe(true);
  expect(judgeChord({chord,notes,judge:'core'},[47,57,61,64,66]).message).toBe('D がありません');
 });
 for(const bars of [8,16,32,66])it(`judges the independently authored second-half answers of ${bars} bars without rewriting source`,()=>{
  const {store,task,collection}=prepared(bars);
  for(let i=Math.floor(bars/2);i<bars;i++){store.today!.cursor.chordIndex=i;expect(judgeChord(targetFor(store,task,collection.progressions).target,DOJO_JUDGE_ANSWERS[i%14].notes).ok).toBe(true);}
 });
 it('uses saved-note policy for frozen final/secondary/legacy tasks as well as ordinary lists',()=>{
  const {store,task,collection}=prepared();store.today=planToday({...store,today:undefined},collection.progressions,now,{preferredKey:task.key});
  store.today.cursor={taskIndex:store.today.tasks.findIndex(t=>t.key===task.key),stage:'see',keyIndex:0,chordIndex:2,answerSeen:false,hints:[],tempoResults:[]};
  expect(targetFor(store,task,collection.progressions).target.judge).toBe('exact');
  store.today.lesson!.source.key='builtin:i-v-vi-iv:1';expect(targetFor(store,task,collection.progressions).target.judge).toBe('exact');
  store.today.legacyTargets=store.today.lesson!.targets;delete store.today.lesson;expect(targetFor(store,task,collection.progressions).target.judge).toBe('exact');
 });
 it('keeps legacy frozen answers playable without inventing source provenance, while normal generated guides stay core',()=>{
  const {store,task,collection}=prepared();store.today=planToday({...store,today:undefined},collection.progressions,now,{preferredKey:task.key});
  store.today.cursor={...store.today.cursor,stage:'see',taskIndex:store.today.tasks.findIndex(t=>t.key===task.key),chordIndex:2};
  store.today.legacyTargets=store.today.lesson!.targets.map(t=>{const chord={...t.chord};delete chord.source;return {...t,chord};});delete store.today.lesson;
  const before=JSON.stringify(store.today.legacyTargets),t=targetFor(store,task,collection.progressions).target;
  expect(t.judge).toBe('exact');expect(judgeChord(t,[59,69,73,76,78]).ok).toBe(true);expect(judgeChord(t,[59,69,76,78]).ok).toBe(false);expect(judgeChord(t,[59,69,73,76,78,85]).ok).toBe(false);
  expect(JSON.stringify(store.today.legacyTargets)).toBe(before);
  const chord=parseChordLabel('Bm11')!,event={chord,notes:[47,57,61,62,64,66],beats:4};
  expect(progressionTarget(event,task.key).judge).toBe('core');expect(progressionTarget({...event,notes:[59,69,73,76,78]},'builtin:i-v-vi-iv:1').judge).toBe('core');
 });
});
