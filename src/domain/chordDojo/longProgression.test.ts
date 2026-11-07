import {describe,expect,it} from 'vitest';
import {BUILTINS} from './builtins';
import {ALL_KEYS,JAZZ6_KEYS,LONG_CHORDS,barsOf,candidateKeys,choosesOwnKey,isLong,pickKey} from './longProgression';

describe('P12.4-03 which progressions are long',()=>{
 const by=(id:string)=>BUILTINS.find(b=>b.id===id)!;
 it('counts bars from the beats',()=>{
  expect(barsOf(by('ii-v-i-major'))).toBe(3);
  expect(barsOf(by('jb-3625'))).toBe(4);
  expect(barsOf(by('jf-jazz-blues'))).toBe(12);
  expect(barsOf(by('jf-minor-blues'))).toBe(12);
  expect(barsOf(by('jf-rhythm-a'))).toBe(8);
 });
 it('treats 9 chords and more as long (the length of a lap is its chords), and nothing shorter',()=>{
  // P12.5-01: by chord count, in one place. The 8-chord canon is no longer long; the three jazz forms are.
  expect(LONG_CHORDS).toBe(9);
  expect(BUILTINS.filter(isLong).map(b=>b.id).sort()).toEqual(['jf-jazz-blues','jf-minor-blues','jf-rhythm-a']);
  for(const b of BUILTINS.filter(b=>!isLong(b)))expect(b.chords.length,b.id).toBeLessThanOrEqual(8);
  expect(isLong(BUILTINS.find(b=>b.id==='canon')!)).toBe(false);
 });
 it('the jazz forms offer six keys and own their key; the rest use the list key',()=>{
  expect(candidateKeys('jazz6')).toEqual([5,10,3,8,0,7]);
  expect(candidateKeys('all12')).toHaveLength(12);
  expect(BUILTINS.filter(b=>b.practiceKeys==='jazz6').every(b=>choosesOwnKey(b))).toBe(true);
  expect(choosesOwnKey(by('ii-v-i-major'))).toBe(false);
  expect(JAZZ6_KEYS.every(k=>ALL_KEYS.includes(k))).toBe(true);
 });
});

describe('P12.4-03 おまかせ',()=>{
 it('picks a key that has no record yet',()=>{
  const recorded=new Set([5,10,3]);
  for(const r of [0,0.2,0.5,0.99])expect([8,0,7]).toContain(pickKey(JAZZ6_KEYS,recorded,undefined,r));
 });
 it('picks from all of them when every key has a record',()=>{
  const all=new Set(JAZZ6_KEYS);
  const seen=new Set([0,0.2,0.4,0.6,0.8,0.99].map(r=>pickKey(JAZZ6_KEYS,all,undefined,r)));
  expect(seen.size).toBeGreaterThan(1);
  for(const k of seen)expect(JAZZ6_KEYS).toContain(k);
 });
 it('avoids the key just played when there is another choice, and keeps it when it is the only one',()=>{
  for(const r of [0,0.3,0.7,0.99])expect(pickKey(JAZZ6_KEYS,new Set([5,10,3,8]),0,r)).not.toBe(0);
  expect(pickKey(JAZZ6_KEYS,new Set([10,3,8,0,7]),5,0.5)).toBe(5);
  expect(pickKey([7],new Set(),7,0.5)).toBe(7);
 });
 it('only returns keys of the progression',()=>{
  for(const r of [0,0.25,0.5,0.75,0.999])expect(JAZZ6_KEYS).toContain(pickKey(JAZZ6_KEYS,new Set(),undefined,r));
 });
});
