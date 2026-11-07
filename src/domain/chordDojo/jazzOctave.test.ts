import {describe,expect,it} from 'vitest';
import {HeldCardJudge} from '../practice/heldCardJudge';
import {answerKeyboardRange} from '../../views/chord-dojo/keyboardRange';
import {JAZZ_PROGRESSIONS_IDS,jazzCardSnapshot,jazzListenNotes,raiseJazzProgression,transposeJazzProgression,writtenPitch} from './jazzProgressions';

const TONICS=Array.from({length:12},(_,t)=>t);
const all=JAZZ_PROGRESSIONS_IDS.flatMap(id=>TONICS.map(t=>({where:`${id} in item key ${t}`,base:transposeJazzProgression(id,t)})));
const octaveOf=(name:string)=>Number(/(-?\d+)$/.exec(name)![1]);
const spelling=(name:string)=>name.replace(/-?\d+$/,'');
const up=(pitches:readonly number[])=>pitches.map(p=>p+12);

describe('one octave up (+1): the result of the transposition, 12 semitones higher',()=>{
  it('is the same progression with every note 12 higher: hands, fingers, kept and struck notes, spelling and timing all as they were',()=>{
    expect(JAZZ_PROGRESSIONS_IDS).toHaveLength(21);
    for(const {where,base} of all){
      const high=raiseJazzProgression(base,1);
      expect(high.cards).toHaveLength(base.cards.length);
      expect(high.shift).toBe(base.shift+12);expect(high.key).toBe(base.key);expect(high.tonic).toBe(base.tonic);expect(high.degrees).toEqual(base.degrees);
      base.cards.forEach((c,i)=>{
        const h=high.cards[i]!,at=`${where} #${i+1}`;
        expect(h.expected,at).toEqual(up(c.expected));expect(h.struck,at).toEqual(up(c.struck));expect(h.carried,at).toEqual(up(c.carried));
        expect(h.left,at).toEqual(up(c.left));expect(h.right,at).toEqual(up(c.right));
        expect([...h.labels],at).toEqual([...c.labels].map(([p,l])=>[p+12,l]));              // the same finger on the same note
        expect(h.offsets,at).toEqual(c.offsets.map(o=>({...o,pitch:o.pitch+12})));
        expect([h.display,h.degree,h.keyContext,h.startBeat,h.durationBeats,h.chord],at).toEqual([c.display,c.degree,c.keyContext,c.startBeat,c.durationBeats,c.chord]);
        for(const [pitch,name] of c.names){
          const raised=h.names.get(pitch+12)!;
          expect(spelling(raised),at).toBe(spelling(name));expect(octaveOf(raised),at).toBe(octaveOf(name)+1);   // only the octave number moves
          const w=h.written.get(pitch+12)!,was=c.written.get(pitch)!;
          expect([w.step,w.alter,w.octave],at).toEqual([was.step,was.alter,was.octave+1]);
          expect(writtenPitch(w),at).toBe(pitch+12);
        }
        expect(h.leftNames,at).toEqual(c.leftNames.map(n=>spelling(n)+(octaveOf(n)+1)));
        expect(h.rightNames,at).toEqual(c.rightNames.map(n=>spelling(n)+(octaveOf(n)+1)));
        // what the staff and the keyboard draw
        const was=jazzCardSnapshot(base,i),now=jazzCardSnapshot(high,i);
        expect(now.midiNotes,at).toEqual(up(was.midiNotes));
        now.notes.forEach((n,k)=>{const o=was.notes[k]!;expect([n.midi,n.hand,n.finger,n.spelling.step,n.spelling.alter,n.spelling.octave],at).toEqual([o.midi+12,o.hand,o.finger,o.spelling.step,o.spelling.alter,o.spelling.octave+1]);});
      });
    }
  });
  it('can be played through with HeldCardJudge at +1: kept notes kept, struck notes pressed again, extra notes ignored',()=>{
    for(const {where,base} of all){
      const high=raiseJazzProgression(base,1),judge=new HeldCardJudge();
      high.cards.forEach((c,i)=>{
        judge.startCard();
        if(i>0)for(const n of judge.heldNotes())if(!c.carried.includes(n))judge.noteOff(n);
        expect(judge.judge(c.expected,c.struck).ok,`${where} #${i+1} before`).toBe(false);
        for(const n of [...c.struck,100])judge.noteOn(n);
        expect(judge.judge(c.expected,c.struck).ok,`${where} #${i+1}`).toBe(true);
      });
      // the notes of the standard octave do not count at +1 (the judging is on the raised notes)
      const standard=new HeldCardJudge();standard.startCard();for(const n of base.cards[0]!.expected)standard.noteOn(n);
      expect(standard.judge(high.cards[0]!.expected,high.cards[0]!.struck).ok,`${where} standard notes at +1`).toBe(false);
    }
  });
  it('the listening plays the raised notes at the same times, and 0 is the progression itself',()=>{
    for(const {base} of all.slice(0,40)){
      const high=raiseJazzProgression(base,1),a=jazzListenNotes(base),b=jazzListenNotes(high);
      expect(b).toEqual(a.map(n=>({...n,pitch:n.pitch+12})));
      expect(raiseJazzProgression(base,0)).toBe(base);expect(raiseJazzProgression(base,1)).toBe(high);
    }
    const p=all[5]!.base;expect(raiseJazzProgression(raiseJazzProgression(p,1),1).cards.map(c=>c.expected)).toEqual(raiseJazzProgression(p,2).cards.map(c=>c.expected));
    expect(()=>raiseJazzProgression(p,0.5)).toThrow();
  });
  it('the keyboard range opens to hold the raised notes (some go past C6)',()=>{
    let past=0;
    for(const {where,base} of all)for(const c of raiseJazzProgression(base,1).cards){
      const range=answerKeyboardRange(c.expected,true);
      expect(range.minMidiNote,where).toBeLessThanOrEqual(Math.min(...c.expected));expect(range.maxMidiNote,where).toBeGreaterThanOrEqual(Math.max(...c.expected));
      if(Math.max(...c.expected)>84)past+=1;
    }
    expect(past).toBeGreaterThan(0);
  });
  it('the transposition and the data are not touched: the standard progression is the same after raising',()=>{
    const base=transposeJazzProgression('jazz-progressions-001',3),before=JSON.stringify([...base.cards.map(c=>[c.expected,c.struck,c.left,c.right,[...c.labels]])]);
    raiseJazzProgression(base,1);
    expect(JSON.stringify([...base.cards.map(c=>[c.expected,c.struck,c.left,c.right,[...c.labels]])])).toBe(before);
    expect(transposeJazzProgression('jazz-progressions-001',3)).toBe(base);
  });
});
