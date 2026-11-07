import {describe,it,expect} from 'vitest';
import {dojoLongIdeas} from '../../testing/dojoLongFixture';
import {collectVault,syncVault} from './collect';
import {emptyItem,emptyStore,DojoRepository,parseDojoStore} from './store';
import {MemoryPracticeStorage} from './storage';
import {planToday} from './planner';
import {advance,skipTask,recordTempoRound,targetFor} from './session';
import {isPartialProgression,progressionInRange,progressionEntriesInRange} from './recordScope';
import {snapshotRevision} from './targetSnapshot';
const now=new Date('2026-10-13T00:00:00.000Z'),at=now.toISOString();
function prepared(bars=32){
 const ideas=dojoLongIdeas().filter(i=>i.progressionBlocks![0].chords.length===bars);
 const collection=collectVault(ideas,at),p=collection.progressions[0],store=syncVault(emptyStore(now),collection,at);
 store.progressions[p.key]={...emptyItem(),state:'passed',passedAt:'2026-10-01T00:00:00.000Z',provisionalAt:'2026-09-30T00:00:00.000Z',nextCheckAt:at,keys:{'0':{bestSec:3,lastSec:4,lastAt:at}},recent:[{at,ok:true,independent:true,sec:4}],wanted:true};
 store.today=planToday(store,collection.progressions,now,{preferredKey:p.key});
 store.today.startedAt=at;store.today.cursor={taskIndex:store.today.tasks.findIndex(t=>t.key===p.key),stage:'recall',keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]};
 return {collection,p,store};
}
describe('long progression final hardening',()=>{
 it('keeps all lengths, event order, fingerprints and original Vault bytes; separates memo warnings from titles',()=>{
  const ideas=dojoLongIdeas(),before=JSON.stringify(ideas),c=collectVault(ideas,at);
  expect(c.progressions.map(p=>p.chords.length)).toEqual([4,8,12,16,24,32,63,66]);
  for(const p of c.progressions)expect(p.chords.map(c=>c.chord.label)).toEqual(Array.from({length:p.chords.length},(_,i)=>i%2?'G':'C'));
  expect(c.progressions[0].displayName).toBe('合成進行 4小節');
  expect(c.progressions[2].displayName).toContain('ユーザー名 ambiguous-bass');
  expect(c.progressions[1].range).toMatchObject({startBar:1,endBar:8});
  expect(c.progressions[1].sourceBarRange).toEqual({startBar:28,endBar:35});
  expect(JSON.stringify(ideas)).toBe(before);
 });
 for(const stage of ['recall','tempo'] as const)for(const ok of [true,false])it(`partial theme ${stage} ${ok?'success':'failure'} preserves entire whole record`,()=>{
  const {store,p,collection}=prepared();store.today!.cursor.stage=stage;
  const before=structuredClone(store.progressions[p.key]);let next=store;
  const count=targetFor(store,store.today!.tasks[store.today!.cursor.taskIndex],collection.progressions).chords.length;
  expect(count).toBe(8);
  if(stage==='tempo')next=recordTempoRound(next,{results:Array(count).fill(ok),self:false,at});
  for(let i=0;i<(stage==='recall'&&ok?count:1);i++)next=advance(next,{ok,self:false,at,recordedTempo:stage==='tempo'},collection.progressions);
  expect(next.progressions[p.key]).toEqual(before);
  expect(next.today!.taskResults!.length).toBeGreaterThan(0);
  expect(next.today!.added).not.toContain(p.key);
 });
 it('partial theme hint, skip, pending-success interruption, and manual section cannot mutate whole mastery',()=>{
  const {store,p,collection}=prepared(),before=structuredClone(store.progressions[p.key]);
  store.today!.cursor.answerSeen=true;store.today!.cursor.hints=[0];
  expect(advance(store,{ok:true,self:true,at},collection.progressions).progressions[p.key]).toEqual(before);
  expect(skipTask(store,at,{self:false},collection.progressions).progressions[p.key]).toEqual(before);
  store.today!.cursor.chordIndex=7;store.today!.cursor.answerSeen=false;store.today!.cursor.hints=[];
  expect(advance(store,{ok:true,self:false,at},collection.progressions).progressions[p.key]).toEqual(before);
  delete store.today!.lesson;store.today!.tasks[store.today!.cursor.taskIndex].range={startBar:1,endBar:1};
  expect(advance(store,{ok:false,self:false,at},collection.progressions).progressions[p.key]).toEqual(before);
  expect(skipTask(store,at,undefined,collection.progressions).progressions[p.key]).toEqual(before);
 });
 it('full theme and full-list practice still update whole mastery; missing source does not authorize writes',()=>{
  const {store,p,collection}=prepared(8),task=store.today!.tasks[store.today!.cursor.taskIndex];
  expect(isPartialProgression(store,task,collection.progressions)).toBe(false);
  expect(isPartialProgression(store,task,[])).toBe(true);
  const before=structuredClone(store.progressions[p.key]);
  expect(advance(store,{ok:false,self:false,at},collection.progressions).progressions[p.key]).not.toEqual(before);
  delete store.today!.lesson;delete task.range;
  expect(isPartialProgression(store,task,collection.progressions)).toBe(false);
 });
 it('freezes a secondary Vault review to the same bounded notes and budget as its task',()=>{
  const ideas=dojoLongIdeas().filter(i=>[4,32].includes(i.progressionBlocks![0].chords.length)),collection=collectVault(ideas,at),s=syncVault(emptyStore(now),collection,at);
  const long=collection.progressions[1];s.progressions[long.key]={...emptyItem(),state:'passed',nextCheckAt:at};
  const today=planToday(s,collection.progressions,now,{preferredKey:collection.progressions[0].key});
  const task=today.tasks.find(t=>t.key===long.key)!;expect(task.review).toBe(true);
  const frozen=today.lesson!.targets.filter(t=>t.taskKey===long.key).map(t=>t.chord);
  expect(frozen).toEqual(progressionInRange(long,task.range));expect(frozen).toHaveLength(8);
 });
 it('compares the frozen theme span instead of falsely flagging an unchanged long source',()=>{
  const {store,p}=prepared();const lesson=store.today!.lesson!;
  expect(snapshotRevision(progressionInRange(p,lesson.source.range))).toBe(lesson.revision);
  p.chords[0].notes=[61];expect(snapshotRevision(progressionInRange(p,lesson.source.range))).not.toBe(lesson.revision);
 });
 it('includes sustained chords in an interior one-bar drill and clips only practice duration; partial extent never updates whole mastery',()=>{
  const ideas=dojoLongIdeas().slice(0,1),block=ideas[0].progressionBlocks![0];
  block.chords=block.chords.slice(0,1);block.chords[0].durationBeats=48;
  const collection=collectVault(ideas,at),p=collection.progressions[0],store=syncVault(emptyStore(now),collection,at);
  store.today=planToday(store,collection.progressions,now,{preferredKey:p.key});
  const task=store.today.tasks.find(t=>t.key===p.key)!;store.today.cursor.taskIndex=store.today.tasks.indexOf(task);
  expect(task.range).toEqual({startBar:1,endBar:8});expect(store.today.lesson!.chords[0].beats).toBe(32);
  expect(isPartialProgression(store,task,collection.progressions)).toBe(true);
  const selected=progressionInRange(p,{startBar:3,endBar:3});
  expect(selected).toEqual([{...p.chords[0],beats:4}]);expect(p.chords[0].beats).toBe(48);
  expect(progressionEntriesInRange(p,{startBar:3,endBar:3}).map(e=>e.bar)).toEqual([3]);
  task.range={startBar:1,endBar:1};store.today.lesson!.targets=store.today.lesson!.targets.filter(t=>t.taskKey===p.key).map(t=>({...t,chord:p.chords[0]}));
  expect(isPartialProgression(store,task,collection.progressions)).toBe(true);
  task.range={startBar:1,endBar:12};expect(isPartialProgression(store,task,collection.progressions)).toBe(false);
 });
 it('does not invent MIDI provenance, drop user-authored warning-like names, or merge distinct unnamed blocks',()=>{
  const ideas=dojoLongIdeas().slice(0,1),block=ideas[0].progressionBlocks![0];delete block.sourceFileName;
  ideas[0].title='ユーザー名 ambiguous-bass';
  ideas[0].progressionBlocks!.push({...block,id:'12000000-0000-4000-8000-000000000909'});
  const ps=collectVault(ideas,at).progressions;
  expect(ps.every(p=>!p.sourceIsMidi)).toBe(true);expect(ps[0].displayName).toContain('ユーザー名 ambiguous-bass');
  expect(ps[0].displayName).not.toEqual(ps[1].displayName);
 });
 it('preserves original section histories with/without missingSince through >30 days and repository reload without promotion',async()=>{
  const {store,p,collection}=prepared(),old=structuredClone(store.progressions[p.key]);
  const k1=p.key+':section:1',k2=p.key+':section:2';store.progressions[k1]=old;store.progressions[k2]={...old,missingSince:'2026-01-01T00:00:00.000Z'};
  const next=syncVault(store,collection,'2027-01-01T00:00:00.000Z');
  expect(next.progressions[k1]).toEqual(old);expect(next.progressions[k2]).toEqual(store.progressions[k2]);expect(next.progressions[p.key]).toEqual(store.progressions[p.key]);
  const repo=new DojoRepository(new MemoryPracticeStorage());await repo.load();await repo.save(next);
  expect((await repo.load()).file.progressions).toEqual(next.progressions);
  expect(parseDojoStore(JSON.stringify(next)).progressions).toEqual(next.progressions);
 });
});
