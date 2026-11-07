import {describe,it,expect} from 'vitest';
import golden from './__fixtures__/originalPractice.golden.json';
import product from './originalPractice.json';
import {buildOriginal,ORIGINAL_SHIFTS} from './originalPractice';
const sorted=(ns:number[])=>[...new Set(ns)].sort((a,b)=>a-b);
describe('independent frozen source Golden always runs without external MIDI',()=>{
 it('covers both progressions and all12 source-authored events exactly',()=>{expect(golden.progressions).toHaveLength(2);expect(golden.progressions.reduce((n,p)=>n+p.events.length,0)).toBe(12);for(const g of golden.progressions){const p=product.progressions.find(p=>p.id===g.id)!;expect(p.events).toEqual(g.events);expect(p.tempoBpm).toBe(g.tempoBpm);expect(p.bars).toBe(g.bars);}});
 for(const g of golden.progressions)it(`${g.id}: raw source timing/velocity/order/held and hands, all transpositions`,()=>{
  for(const [i,e] of g.events.entries()){
   const start=e.startBeat,end=start+e.durationBeats,notes=g.sourceNotes;
   const strikes=notes.filter(n=>n.startBeat>=start-.05&&n.startBeat<end-.05),held=notes.filter(n=>n.startBeat<start-.05&&n.endBeat>start+.15);
   expect(sorted(strikes.map(n=>n.pitch))).toEqual(sorted(e.struck.map(n=>n.pitch)));expect(sorted([...strikes,...held].map(n=>n.pitch))).toEqual(sorted(e.expectedPitches));
   const at=(names:string[])=>names.map(name=>e.expectedPitches[e.expectedNames.indexOf(name)]!);
   expect(sorted(at(e.heldFromPrevious))).toEqual(sorted(held.map(n=>n.pitch)));
   expect(sorted([...at(e.leftHand),...at(e.rightHand)])).toEqual(sorted(e.expectedPitches));
   for(const note of e.struck){const actual=strikes.find(n=>n.pitch===note.pitch)!;expect(Math.abs(actual.startBeat-start-note.offsetBeats)).toBeLessThanOrEqual(1/g.ppq);expect(Math.abs(actual.endBeat-actual.startBeat-note.durationBeats)).toBeLessThanOrEqual(1/g.ppq);expect(actual.velocity).toBe(note.velocity);}
   for(const shift of ORIGINAL_SHIFTS){const c=buildOriginal(g.id,shift).cards[i]!;expect(c.expected).toEqual(e.expectedPitches.map(n=>n+shift));expect(c.struck).toEqual(e.struck.map(n=>n.pitch+shift));expect(c.carried).toEqual(at(e.heldFromPrevious).map(n=>n+shift));expect(c.left).toEqual(at(e.leftHand).map(n=>n+shift));expect(c.right).toEqual(at(e.rightHand).map(n=>n+shift));expect(c.startBeat).toBe(e.startBeat);expect(c.durationBeats).toBe(e.durationBeats);expect(c.offsets).toEqual(e.struck.map(n=>({pitch:n.pitch+shift,offsetBeats:n.offsetBeats,durationBeats:n.durationBeats,velocity:n.velocity})));}
  }
 });
});
