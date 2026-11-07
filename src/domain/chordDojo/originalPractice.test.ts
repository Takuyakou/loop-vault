import {describe,expect,it} from 'vitest';
import {HeldCardJudge} from '../practice/heldCardJudge';
import {BUILTINS,DEFS,buildBuiltin} from './builtins';
import {judgeChord} from './judging';
import {ORIGINAL_IDS,ORIGINAL_SHIFTS,buildOriginal,originalShiftOf,originalTonicOf,pickOriginalShift} from './originalPractice';
import {planToday} from './planner';
import {emptyItem,emptyStore,itemSchema} from './store';
import raw from './originalPractice.json';

const ID='op-traditional-passing',MODERN='op-modern-passing';
const press=(j:HeldCardJudge,ns:readonly number[])=>ns.forEach(n=>j.noteOn(n));
const ok=(j:HeldCardJudge,c:{expected:number[];struck:number[]})=>j.judge(c.expected,c.struck).ok;
const cards=buildOriginal(ID).cards,[fm,bb4,bb9,eb1,eb2]=cards;
const modern=buildOriginal(MODERN).cards;

describe('Original Practice data',()=>{
 it('has the two progressions, six cards each, 4 bars at 72 bpm, in the order of the plan',()=>{
  expect(ORIGINAL_IDS).toEqual([ID,MODERN]);
  for(const id of ORIGINAL_IDS){const p=buildOriginal(id);expect(p.cards).toHaveLength(6);expect(p.bars).toBe(4);expect(p.tempoBpm).toBe(72);}
  expect(cards.map(c=>c.label)).toEqual(['Fm11','B♭7sus4','B♭9','E♭maj9','E♭maj9','Edim7']);
  expect(modern.map(c=>c.label)).toEqual(['Fm11','B♭7sus4','B♭9','E♭maj9','E♭maj9','Cadd2/E']);
  expect(cards.map(c=>c.degree)).toEqual(['ii11','V7sus4','V9','Imaj9','Imaj9','♯idim7']);
 });
 it('expects exactly what was struck plus what may stay held, and the hands cover the card',()=>{
  for(const id of ORIGINAL_IDS)buildOriginal(id).cards.forEach((c,i,all)=>{
   expect([...new Set([...c.struck,...c.carried])].sort((a,b)=>a-b)).toEqual(c.expected);
   expect([...c.left,...c.right].sort((a,b)=>a-b)).toEqual(c.expected);
   for(const n of c.carried)expect(all[i-1]!.expected).toContain(n);
  });
  expect(bb9!.carried).toEqual([46,53]);expect(bb9!.struck).toEqual([56,60,62,65]);
  expect(eb2!.carried).toEqual([]);expect(eb2!.struck).toEqual([39,55,58,62,65]);
 });
 it('uses the pitches of the JSON as they are (expectedPitches is the reference)',()=>{
  const events=(raw as {progressions:{id:string;events:{expectedPitches:number[]}[]}[]}).progressions.find(p=>p.id===ID)!.events;
  expect(cards.map(c=>c.expected)).toEqual(events.map(e=>e.expectedPitches));
 });
 it('names the last card of the modern one Cadd2/E with the bass E and the same notes as Cadd9/E',()=>{
  const c=modern[5]!;expect(c.chord).toMatchObject({root:0,bass:4,quality:'add9',label:'Cadd2/E'});expect(c.expected).toEqual([40,55,60,62,64,67]);
 });
});

describe('Original Practice judging (domain)',()=>{
 it('2: every note newly pressed passes, card by card',()=>{
  const j=new HeldCardJudge();
  for(const c of cards){j.startCard();press(j,c.expected);expect(ok(j,c)).toBe(true);}
 });
 it('3: extra notes above, below and between are ignored',()=>{
  for(const extra of [[84,96],[24,30],[57,61,64]]){const j=new HeldCardJudge();press(j,[...fm!.expected,...extra]);expect(ok(j,fm!)).toBe(true);}
 });
 it('4: one note short does not pass',()=>{
  for(const miss of fm!.expected){const j=new HeldCardJudge();press(j,fm!.expected.filter(n=>n!==miss));expect(ok(j,fm!)).toBe(false);}
 });
 it('5: B♭7sus4 → B♭9 passes with the left hand kept down and the right hand played again',()=>{
  const j=new HeldCardJudge();press(j,bb4!.expected);expect(ok(j,bb4!)).toBe(true);
  j.startCard();expect(ok(j,bb9!)).toBe(false);
  press(j,[60,62,56,65]);expect(ok(j,bb9!)).toBe(true);
  expect(j.heldNotes()).toEqual(expect.arrayContaining([46,53]));
 });
 it('6: B♭7sus4 → B♭9 does not pass with A♭3 and F4 kept down and only C4 D4 played',()=>{
  const j=new HeldCardJudge();press(j,bb4!.expected);j.startCard();press(j,[60,62]);
  expect(ok(j,bb9!)).toBe(false);expect(j.judge(bb9!.expected,bb9!.struck).notStruck).toEqual([56,65]);
 });
 it('7–8: the second E♭maj9 needs all five notes played again (kept down, or one note again, is not enough)',()=>{
  const j=new HeldCardJudge();press(j,eb1!.expected);j.startCard();
  expect(ok(j,eb2!)).toBe(false);
  press(j,[62]);expect(ok(j,eb2!)).toBe(false);
  press(j,[39,55,58]);expect(ok(j,eb2!)).toBe(false);
  press(j,[65]);expect(ok(j,eb2!)).toBe(true);
 });
 it('9: a melody note alone does not pass the second E♭maj9',()=>{
  const j=new HeldCardJudge();press(j,eb1!.expected);j.startCard();press(j,[72,74,67]);
  expect(ok(j,eb2!)).toBe(false);
 });
 it('10: the notes may be played one after another, from the bottom, with no time limit between them',()=>{
  const j=new HeldCardJudge();const seen:boolean[]=[];
  for(const n of fm!.expected){j.noteOn(n);seen.push(ok(j,fm!));}
  expect(seen.slice(0,-1).every(v=>!v)).toBe(true);expect(seen[seen.length-1]).toBe(true);
 });
 it('11: a key that is up does not count while the pedal still sounds it',()=>{
  const j=new HeldCardJudge();press(j,fm!.expected);j.event(0xb0,0,64,127);j.noteOff(fm!.expected[0]!);
  expect(ok(j,fm!)).toBe(false);
 });
 it('12: a chord that passed and is held does not pass the next card at once, for every pair',()=>{
  cards.forEach((c,i)=>{if(i===cards.length-1)return;const j=new HeldCardJudge();press(j,c.expected);j.startCard();expect(ok(j,cards[i+1]!)).toBe(false);});
 });
 it('13: a note-on that comes again without a note-off keeps the key held and needs one note-off',()=>{
  const j=new HeldCardJudge();press(j,fm!.expected);press(j,[fm!.expected[2]!]);expect(ok(j,fm!)).toBe(true);
  j.noteOff(fm!.expected[2]!);expect(ok(j,fm!)).toBe(false);
 });
 it('14: the last card to the first one does not take over the last lap (G4 is in both)',()=>{
  for(const list of [cards,modern]){
   const last=list[5]!,first=list[0]!,j=new HeldCardJudge();press(j,last.expected);expect(ok(j,last)).toBe(true);
   expect(last.expected).toContain(67);expect(first.expected).toContain(67);
   j.startCard();expect(ok(j,first)).toBe(false);
   press(j,[67]);expect(ok(j,first)).toBe(false);
   press(j,first.struck);expect(ok(j,first)).toBe(true);
  }
 });
 it('15: after a disconnect nothing is held and nothing counts as pressed',()=>{
  const j=new HeldCardJudge();press(j,fm!.expected);j.reset();
  expect(j.heldNotes()).toEqual([]);expect(ok(j,fm!)).toBe(false);
 });
});

describe('Original Practice keys',()=>{
 it('17: every note moves by the same number of semitones, in −6…+5',()=>{
  expect(ORIGINAL_SHIFTS).toEqual([-6,-5,-4,-3,-2,-1,0,1,2,3,4,5]);
  for(const id of ORIGINAL_IDS){
   const base=buildOriginal(id,0);
   for(const s of ORIGINAL_SHIFTS){
    buildOriginal(id,s).cards.forEach((c,i)=>{
     const b=base.cards[i]!;
     expect(c.expected).toEqual(b.expected.map(n=>n+s));expect(c.struck).toEqual(b.struck.map(n=>n+s));
     expect(c.chord.root).toBe((((b.chord.root+s)%12)+12)%12);
     expect(c.degree).toBe(b.degree);
    });
   }
  }
  expect(()=>buildOriginal(ID,6)).toThrow();expect(()=>buildOriginal(ID,-7)).toThrow();
 });
 it('maps a key to a shift and back, and the original key is E♭',()=>{
  expect(originalShiftOf(3)).toBe(0);expect(originalTonicOf(0)).toBe(3);
  for(const s of ORIGINAL_SHIFTS)expect(originalShiftOf(originalTonicOf(s))).toBe(s);
  expect(new Set(ORIGINAL_SHIFTS.map(originalTonicOf)).size).toBe(12);
 });
 it('names move with the key',()=>{
  expect(buildOriginal(ID,2).cards.map(c=>c.label)).toEqual(['Gm11','C7sus4','C9','Fmaj9','Fmaj9','F#dim7']);
 });
 it('the random key is never the current key and prefers keys not played yet',()=>{
  for(let r=0;r<1;r+=0.1)expect(pickOriginalShift({},0,r)).not.toBe(0);
  const played:Record<number,number>={};
  for(const s of ORIGINAL_SHIFTS)if(s!==2&&s!==0)played[originalTonicOf(s)]=1;
  expect(pickOriginalShift(played,0,0.99)).toBe(2);
 });
});

describe('Original Practice is not a standard progression',()=>{
 it('19: the judging of the standard progressions is unchanged: an extra note is still wrong',()=>{
  for(const id of ['ii-v-i-major','imaj9-ivmaj9']){
   const b=buildBuiltin(id,0),c=b.chords[0]!,target={notes:c.notes,chord:c.chord,judge:b.judge,bass:'self' as const};
   expect(judgeChord(target,c.notes).ok).toBe(true);
   const r=judgeChord(target,[...c.notes,c.notes[c.notes.length-1]!+1]);
   expect(r.ok).toBe(false);expect(r.message).toContain('余分な音');
  }
 });
 it('20: it is not among the standard progressions, so it is no candidate of the plan of the day',()=>{
  expect(BUILTINS.some(b=>ORIGINAL_IDS.includes(b.id))).toBe(false);
  expect(DEFS.some(d=>ORIGINAL_IDS.includes(d.id))).toBe(false);
  const plan=planToday(emptyStore(),[],new Date());
  expect(JSON.stringify(plan.tasks)).not.toContain('op-');
 });
 it('an existing record without laps is still read as before',()=>{
  const old={state:'provisional',provisionalAt:'2026-09-01T00:00:00.000Z',recent:[],keys:{}};
  expect(itemSchema.parse(old)).toEqual(old);
  expect(emptyItem()).not.toHaveProperty('laps');
 });
});
