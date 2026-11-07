import {describe,it,expect} from 'vitest';
import {activate,createKeyBag,finish,matchChord,nextKey,pause,resumeSameKey,revealChord,selfJudge,skipKey,startEndless,summarize,switchToSelf,type EndlessResult,type EndlessState} from './endless';

/** P12.3 §8–10: the random-key state machine (pure functions, no storage). */
const ouudou=(seed=1000,manual=false)=>startEndless('ouudou',seed,manual);          // 4 chords
const komuro=(seed=1000,manual=false)=>startEndless('komuro',seed,manual);          // 4 chords
const active=(state:EndlessState,now=0)=>activate(state,now);
const playAll=(state:EndlessState,start:number,step=1000)=>{let s=active(state,start);for(let i=0;i<4;i++)s=matchChord(s,start+step*(i+1));return s;};

describe('key bag',()=>{
 it('contains each of the 12 keys once',()=>{for(const seed of [1,2,99,123456])expect([...createKeyBag(seed)].sort((a,b)=>a-b)).toEqual([0,1,2,3,4,5,6,7,8,9,10,11]);});
 it('is the same order for the same seed, and differs between seeds',()=>{expect(createKeyBag(7)).toEqual(createKeyBag(7));expect(createKeyBag(7)).not.toEqual(createKeyBag(8));});
 it('never starts with the previous key (1000 seeds)',()=>{for(let seed=0;seed<1000;seed++){const first=createKeyBag(seed);const previous=first[11];const next=createKeyBag(seed+1,previous);expect(next[0]).not.toBe(previous);expect([...next].sort((a,b)=>a-b)).toEqual([0,1,2,3,4,5,6,7,8,9,10,11]);}});
 it('swaps the first two when the first would repeat',()=>{const plain=createKeyBag(5);const swapped=createKeyBag(5,plain[0]);expect(swapped[0]).toBe(plain[1]);expect(swapped[1]).toBe(plain[0]);expect(swapped.slice(2)).toEqual(plain.slice(2));});
});

describe('starting and the first key',()=>{
 it('starts at round 1, position 0, ready, with the first key of the seed+1 bag',()=>{
  const s=ouudou(1000);expect(s).toMatchObject({builtinId:'ouudou',seed:1000,round:1,pos:0,chordIndex:0,revealed:[],hinted:false,manual:false,phase:'ready',results:[]});
  expect(s.bag).toEqual(createKeyBag(1001));expect(s.key).toBe(s.bag[0]);
 });
 it('activate moves ready to active once, and records the start time',()=>{const s=active(ouudou(),500);expect(s.phase).toBe('active');expect(s.startedAt).toBe(500);expect(activate(s,900).startedAt).toBe(500);});
});

describe('hints and matching',()=>{
 it('a hint is a reveal at or after the current card in a MIDI session; an earlier card is not',()=>{
  let s=active(ouudou());s=matchChord(s,100);                       // chordIndex 1
  expect(revealChord(s,0).hinted).toBe(false);
  const later=revealChord(s,3);expect(later.hinted).toBe(true);expect(later.revealed).toContain(3);
  expect(revealChord(s,1).hinted).toBe(true);
 });
 it('a reveal in a self-judge session never makes a hint',()=>{const s=active(ouudou(1,true));expect(revealChord(s,0).hinted).toBe(false);expect(revealChord(s,0).revealed).toContain(0);});
 it('matchChord advances the card and shows its name; the last one clears with the seconds',()=>{
  let s=active(ouudou(),1000);s=matchChord(s,1500);expect(s.chordIndex).toBe(1);expect(s.revealed).toContain(0);expect(s.phase).toBe('active');
  s=matchChord(s,2500);s=matchChord(s,3500);s=matchChord(s,5240);
  expect(s.phase).toBe('clear');expect(s.clearedAt).toBe(5240);
  expect(s.results).toEqual([{key:s.key,sec:4.2,hint:false,self:false,skipped:false}]);
 });
 it('a hint or a self-judged key has no seconds',()=>{
  let h=active(ouudou(),0);h=revealChord(h,2);h=playAll(h,0);expect(h.results[0]).toMatchObject({hint:true,self:false,skipped:false});expect(h.results[0].sec).toBeUndefined();
  let m=active(ouudou(1,true),0);for(let i=0;i<4;i++)m=selfJudge(m,true,100*(i+1));expect(m.phase).toBe('clear');expect(m.results[0]).toMatchObject({hint:false,self:true,skipped:false});expect(m.results[0].sec).toBeUndefined();
 });
 it('selfJudge(false) changes nothing',()=>{const s=active(ouudou(1,true));expect(selfJudge(s,false,10)).toEqual(s);});
});

describe('next key, skipping, rounds',()=>{
 it('nextKey advances the position and resets the card state',()=>{
  let s=playAll(ouudou(),0);const done=s.key;s=nextKey(s,false);
  expect(s).toMatchObject({pos:1,round:1,chordIndex:0,revealed:[],hinted:false,phase:'ready'});expect(s.key).toBe(s.bag[1]);expect(s.key).not.toBe(done);
  expect(s.results).toHaveLength(1);
 });
 it('skipKey records a skipped result (with the hint and self flags) and moves on',()=>{
  let s=active(ouudou(),0);s=revealChord(s,1);const skipped=s.key;s=skipKey(s);
  expect(s.results).toEqual([{key:skipped,hint:true,self:false,skipped:true}]);expect(s.pos).toBe(1);expect(s.phase).toBe('ready');
 });
 it('twelve keys make a round; the 13th is round 2 position 0 and the keys are all different within a round',()=>{
  let s=ouudou(42);const seen=new Set<number>();
  for(let i=0;i<12;i++){seen.add(s.key);s=nextKey(playAll(s,0),false);}
  expect(seen.size).toBe(12);expect(s.round).toBe(2);expect(s.pos).toBe(0);expect(s.bag).toEqual(createKeyBag(42+2,playAll(ouudou(42),0).bag[11]));
 });
 it('never repeats the same key across the round boundary (1000 seeds)',()=>{
  for(let seed=0;seed<1000;seed++){let s=komuro(seed);let last=-1;for(let i=0;i<13;i++){expect(s.key).not.toBe(last);last=s.key;s=nextKey(s,false);}}
 });
 it('nextKey can change the session between MIDI and self-judge',()=>{expect(nextKey(playAll(ouudou(),0),true).manual).toBe(true);});
});

describe('pause, resume, switch, finish',()=>{
 it('pause stops, resume restarts the same key from the first card, keeping the hint',()=>{
  let s=active(ouudou(),0);s=revealChord(s,3);s=matchChord(s,100);s=pause(s);expect(s.phase).toBe('paused');
  const r=resumeSameKey(s);expect(r).toMatchObject({key:s.key,chordIndex:0,phase:'ready',hinted:true});expect(r.revealed).toContain(3);
 });
 it('switchToSelf makes the session self-judged from the first card',()=>{const s=switchToSelf(pause(matchChord(active(ouudou(),0),10)));expect(s).toMatchObject({manual:true,chordIndex:0,phase:'active'});});
 it('finish moves to the summary',()=>{expect(finish(ouudou()).phase).toBe('summary');});
 it('a clear that was interrupted keeps its clearedAt, so the screen knows to move on',()=>{const s=pause(playAll(ouudou(),0));expect(s.phase).toBe('paused');expect(s.clearedAt).toBeDefined();});
});

describe('summarize',()=>{
 const r=(key:number,over:Partial<EndlessResult>={}):EndlessResult=>({key,hint:false,self:false,skipped:false,...over});
 it('counts cleared, no-hint and the average of the no-hint seconds',()=>{
  const s=summarize([r(0,{sec:3.2}),r(1,{sec:4.8}),r(2,{hint:true}),r(3,{self:true}),r(4,{skipped:true})]);
  expect(s).toMatchObject({cleared:4,noHint:2,avgSec:4});
 });
 it('has no average without a no-hint result',()=>{expect(summarize([r(0,{hint:true})]).avgSec).toBeUndefined();expect(summarize([]).cleared).toBe(0);});
 it('lists at most three slow keys: skipped first, then hinted (not self), then the longest seconds; self rows are left out',()=>{
  const s=summarize([r(0,{sec:9.9}),r(1,{skipped:true}),r(2,{hint:true}),r(3,{sec:5.5}),r(4,{self:true,skipped:true}),r(5,{sec:7.1}),r(6,{self:true})]);
  expect(s.slow.map(x=>x.key)).toEqual([1,2,0]);
 });
});
