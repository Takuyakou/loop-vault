import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {BUILTINS,BUILTIN_GROUPS,buildBuiltin,builtinDisplayName,keyLabel,placeBassBelow} from './builtins';
import {judgeChord} from './judging';
import {planToday} from './planner';
import {emptyStore} from './store';

/** P12.3 §2・§3: 25 progressions × 12 keys against the reference data, and the bass is always below the upper notes. */
interface ExpectedKey {key:number;keyLabel:string;pointIsTheory:boolean;chords:{label:string;notes:number[];beats:number}[]}
interface Expected {title:string|null;name:string;group:string;mode:string;layer:string;judge:string;degrees:string[];fullDegrees:string[];keys:ExpectedKey[]}
const expected=JSON.parse(readFileSync(new URL('../../../docs/phase12.3/contracts/P12.3-builtins-expected.json',import.meta.url),'utf-8')) as {count:number;builtins:Record<string,Expected>};
const ids=Object.keys(expected.builtins);

describe('P12.3 builtins match the reference data',()=>{
 it('has the 25 expected progressions with their metadata',()=>{
  expect(expected.count).toBe(25);
  // P12.4-02 appended more progressions; these 25 stay exactly as they were, and stay first.
  expect(BUILTINS.slice(0,25).map(b=>b.id).sort()).toEqual([...ids].sort());
  for(const b of BUILTINS.slice(0,25)){const e=expected.builtins[b.id];
   expect(b.name).toBe(e.name);expect(b.title??null).toBe(e.title);expect(b.group).toBe(e.group);expect(b.mode).toBe(e.mode);expect(b.layer).toBe(e.layer);expect(b.judge).toBe(e.judge);
   expect(b.fullDegrees).toEqual(e.fullDegrees);
   expect(builtinDisplayName(b)).toBe(e.title??e.name);}
 });
 it('matches every chord name, note, beat, pointIsTheory and key label: 25 × 12 = 300',()=>{
  let compared=0;
  for(const id of ids){const e=expected.builtins[id];expect(e.keys).toHaveLength(12);
   for(const k of e.keys){const built=buildBuiltin(id,k.key);
    expect(keyLabel(k.key,e.mode as 'major'|'minor')).toBe(k.keyLabel);
    expect(built.pointIsTheory,`${id} k${k.key} pointIsTheory`).toBe(k.pointIsTheory);
    expect(built.chords.map(c=>({label:c.chord.label,notes:c.notes,beats:c.beats})),`${id} k${k.key}`).toEqual(k.chords);
    compared++;}}
  expect(compared).toBe(300);
 });
 it('keeps degree = name.split and the upper notes within 55–84',()=>{
  for(const p of BUILTINS)for(let k=0;k<12;k++){expect(p.chords.map(c=>c.degree)).toEqual(p.name.split('–'));
   const b=buildBuiltin(p.id,k);expect(b.chords.every(c=>c.notes.slice(1).every(n=>n>=55&&n<=84))).toBe(true);}
 });
});

describe('P12.3 the bass is below every upper note, and the shown answer is accepted',()=>{
 it('has the bass strictly below, no repeated note, and judgeChord accepts the answer: every chord of every key',()=>{
  for(const p of BUILTINS)for(let k=0;k<12;k++){const b=buildBuiltin(p.id,k);
   for(const c of b.chords){const [bass,...upper]=c.notes;
    expect(bass<Math.min(...upper),`${p.id} k${k} ${c.chord.label} ${c.notes}`).toBe(true);
    expect(new Set(c.notes).size).toBe(c.notes.length);
    expect(judgeChord({notes:c.notes,chord:c.chord,judge:b.judge,bass:'self'},c.notes).ok,`${p.id} k${k} ${c.chord.label}`).toBe(true);}}
 });
 it('placeBassBelow lowers the bass by octaves only until it is below, and never moves the upper notes',()=>{
  expect(placeBassBelow([59,57,62,66])).toEqual([47,57,62,66]);
  expect(placeBassBelow([57,57,61,64])).toEqual([45,57,61,64]);
  expect(placeBassBelow([48,60,64,67])).toEqual([48,60,64,67]);
  expect(placeBassBelow([60,60,64,67])).toEqual([48,60,64,67]);
 });
 it('the A-key ii–V–I first answer plays Bm7 with B2 as the bass (before/05 reversed)',()=>{
  expect(buildBuiltin('ii-v-i-major',9).chords[0].notes).toEqual([47,57,62,66]);
 });
});

describe('P12.3 the list is grouped as in appendix B',()=>{
 it('lists 25 ids once each, grouped 6·6·4·5·4 in the given order',()=>{
  // P12.4-02 appended four groups after these five; the five are unchanged.
  const original=BUILTIN_GROUPS.slice(0,5);
  expect(original.map(g=>g.ids.length)).toEqual([6,6,4,5,4]);
  expect(original.map(g=>g.name)).toEqual(['基本','J-POP','ジャズ・ボサ','ネオソウル・Lo-fi','マイナー']);
  expect(BUILTIN_GROUPS[0].ids).toEqual(['ii-v-i-major','i-v-vi-iv','circle','iii-vi-ii-v-i','i-vi7-ii-v','iv-iii-ii-i']);
  expect(BUILTIN_GROUPS[4].ids).toEqual(['ii-v-i-minor','aeolian','minor-cadence','andalusian']);
  const all=original.flatMap(g=>g.ids);expect(all).toHaveLength(25);expect(new Set(all).size).toBe(25);expect(new Set(all)).toEqual(new Set(ids));
 });
 it('names the key with an m for minor progressions',()=>{
  expect(keyLabel(3,'major')).toBe('E♭');expect(keyLabel(9,'minor')).toBe('Am');expect(keyLabel(0,'minor')).toBe('Cm');
 });
});

describe('P12.3 theme name and key name',()=>{
 const now=new Date('2026-10-04T00:00:00.000Z');
 const plan=(options:Parameters<typeof planToday>[3]={})=>planToday(emptyStore(now),[],now,{forceNew:true,replaceLegacy:true,...options}).lesson!.source;
 it('a first-time person still gets I–V–vi–IV as the first theme, with the plain name',()=>{
  const source=plan();expect(source.presetId).toBe('i-v-vi-iv');expect(source.name).toBe('I–V–vi–IV');expect(source.keyContext).toBe('C');
 });
 it('a progression with a title is named 「title（name）」',()=>{
  expect(plan({preferredKey:'builtin:ouudou:1'}).name).toBe('王道進行（IVmaj7–V7–iii7–vi7）');
  expect(plan({preferredKey:'builtin:ii-v-i-major:1'}).name).toBe('ii–V–I');
 });
 it('a minor progression names its key with an m; a major one stays as before',()=>{
  expect(plan({preferredKey:'builtin:aeolian:1',standardKey:0}).keyContext).toBe('Cm');
  expect(plan({preferredKey:'builtin:aeolian:1',standardKey:3}).keyContext).toBe('E♭m');
  expect(plan({preferredKey:'builtin:ouudou:1',standardKey:3}).keyContext).toBe('E♭');
 });
});
