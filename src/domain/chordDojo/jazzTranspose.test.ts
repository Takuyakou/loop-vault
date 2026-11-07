import {describe,expect,it} from 'vitest';
import {parseTextChordLabel} from '../chords';
import {HeldCardJudge} from '../practice/heldCardJudge';
import {nextKey,startEndless} from './endless';
import {judgeChord} from './judging';
import {jazzBagKey,nextJazzKey,startJazzKeyBag} from './jazzRandomKey';
import {
  JAZZ_PROGRESSIONS_IDS,JAZZ_PROGRESSIONS_ITEMS,buildJazzProgression,jazzCardSnapshot,jazzItemMainTonic,jazzItemOf,jazzListenNotes,jazzMainOf,
  transposeJazzProgression,writtenPitch,type JazzProgression,
} from './jazzProgressions';
import {writtenMidi} from './targetSnapshot';

const TONICS=Array.from({length:12},(_,t)=>t);
const sequences=JAZZ_PROGRESSIONS_IDS.flatMap(id=>TONICS.map(t=>({where:`${id} in item key ${t}`,id,t,p:transposeJazzProgression(id,t)})));

describe('Jazz Progressions in twelve keys (the table itself is checked by jazzTranspose.golden.test.ts)',()=>{
  it('the original key is the data as it is, for every progression',()=>{
    for(const id of JAZZ_PROGRESSIONS_IDS){
      const original=buildJazzProgression(id);
      expect(original.shift).toBe(0);
      expect(original.itemTonic).toBe(jazzItemMainTonic(jazzItemOf(id)!));
      expect(transposeJazzProgression(id,original.itemTonic)).toBe(original);
    }
  });

  it('2: every one of the 672 cards is read as the chord it is named and passes the judge (core and shape)',()=>{
    let cards=0;
    for(const {where,p} of sequences)p.cards.forEach((c,i)=>{
      cards+=1;
      expect(c.chord,`${where} #${i+1}`).toEqual(parseTextChordLabel(c.chord.label));
      for(const judge of ['core','shape'] as const){
        const v=judgeChord({notes:c.expected,chord:c.chord,judge,bass:'self'},c.expected);
        expect(v.ok,`${where} #${i+1} ${c.display} ${judge}: ${v.message}`).toBe(true);
      }
    });
    expect(cards).toBe(672);
  });

  it('3: every one of the 252 can be played through with HeldCardJudge: kept notes kept, struck notes pressed again, extra notes ignored',()=>{
    for(const {where,p} of sequences){
      const judge=new HeldCardJudge();
      p.cards.forEach((c,i)=>{
        judge.startCard();
        if(i>0)for(const n of judge.heldNotes())if(!c.carried.includes(n))judge.noteOff(n);
        expect(judge.judge(c.expected,c.struck).ok,`${where} #${i+1} before`).toBe(false);
        for(const n of [...c.struck,90])judge.noteOn(n);
        expect(judge.judge(c.expected,c.struck).ok,`${where} #${i+1}`).toBe(true);
      });
    }
  });

  it('every written name has the pitch it says; hands apart; the fingers of kept notes are the same from card to card; A1 to E♭5 (33-75)',()=>{
    for(const {where,p} of sequences){
      p.cards.forEach((c,i)=>{
        for(const [pitch,w] of c.written){expect(writtenPitch(w),`${where} #${i+1}`).toBe(pitch);expect(c.names.has(pitch)).toBe(true);}
        expect(Math.max(...c.left)).toBeLessThan(Math.min(...c.right));
        expect(Math.min(...c.expected)).toBeGreaterThanOrEqual(33);
        expect(Math.max(...c.expected)).toBeLessThanOrEqual(75);
        if(i>0)for(const n of c.carried)expect(c.labels.get(n),`${where} #${i+1}`).toBe(p.cards[i-1]!.labels.get(n));
        const s=jazzCardSnapshot(p,i);
        for(const n of s.notes)expect(writtenMidi(n.spelling)).toBe(n.midi);
      });
    }
  });

  it('every version of an item moves by the same interval and octave; a chord that two versions share sounds the same in both',()=>{
    for(const item of JAZZ_PROGRESSIONS_ITEMS)for(const t of TONICS){
      const members=item.progressions.map(id=>transposeJazzProgression(id,t));
      expect(new Set(members.map(m=>m.shift)).size,`${item.id} ${t}`).toBe(1);
      const seen=new Map<string,string>();
      for(const m of members)for(const c of m.cards){
        const k=`${c.display}|${c.degree}|${c.keyContext}`,v=[...c.expected].sort((a,b)=>a-b).join();
        if(seen.has(k))expect(v,`${item.id} ${t} ${c.display}`).toBe(seen.get(k));
        seen.set(k,v);
      }
    }
  });

  it('the key of a version follows the item: 009 second half is Em under G♯m and G♯m under Cm; the item key is what is chosen',()=>{
    const item=jazzItemOf('jazz-progressions-009')!,second='jazz-progressions-009-b';
    expect(transposeJazzProgression(jazzMainOf(item),8).key).toBe('G♯m');
    expect(transposeJazzProgression(second,8).key).toBe('Em');
    expect(transposeJazzProgression(jazzMainOf(item),0).key).toBe('Cm');
    expect(transposeJazzProgression(second,0).key).toBe('G♯m');
    expect(TONICS.map(t=>transposeJazzProgression('jazz-progressions-001',t).key)).toEqual(['C','D♭','D','E♭','E','F','F♯','G','A♭','A','B♭','B']);
    expect(TONICS.map(t=>transposeJazzProgression('jazz-progressions-011',t).key)).toEqual(['Cm','C♯m','Dm','E♭m','Em','Fm','F♯m','Gm','G♯m','Am','B♭m','Bm']);
  });

  it('what is spelled stays right: no E♯ B♯ C♭ F♭ or double-accidental chord roots; 001 in A',()=>{
    for(const {p} of sequences)for(const c of p.cards)expect(c.display).not.toMatch(/^(E♯|B♯|C♭|F♭|[A-G]𝄪|[A-G]𝄫)/);
    const a=transposeJazzProgression('jazz-progressions-001',9);
    expect(a.cards.map(c=>c.display)).toEqual(['Bm9','E13','A6/9']);
  });

  it('listening takes the notes of the key that is on the screen',()=>{
    const p:JazzProgression=transposeJazzProgression('jazz-progressions-001',9),notes=jazzListenNotes(p);
    expect(notes.map(n=>n.pitch).sort((a,b)=>a-b)).toEqual(p.cards.flatMap(c=>c.expected).sort((a,b)=>a-b));
  });
});

describe('the random key is the one of the other standard progressions',()=>{
  it('the keys come in rounds of the twelve, none twice in a round, and the first key of a round is not the key just played',()=>{
    let state=startJazzKeyBag(7);
    const keys=[jazzBagKey(state)];
    for(let i=0;i<35;i+=1){const next=nextJazzKey(state,keys[keys.length-1]!);state=next.state;keys.push(next.key);}
    for(let round=0;round<3;round+=1)expect(new Set(keys.slice(round*12,round*12+12)).size).toBe(12);
    keys.slice(1).forEach((k,i)=>expect(k).not.toBe(keys[i]));
    expect(state.round).toBe(3);
  });

  it('it is the same order as the random key of the other standard progressions for the same seed',()=>{
    for(const seed of [1,42,123456]){
      let endless=startEndless('ii-v-i-major',seed,false),jazz=startJazzKeyBag(seed);
      const a=[endless.key],b=[jazzBagKey(jazz)];
      for(let i=0;i<30;i+=1){
        endless=nextKey(endless,false);a.push(endless.key);
        const n=nextJazzKey(jazz,b[b.length-1]!);jazz=n.state;b.push(n.key);
      }
      expect(b).toEqual(a);
    }
  });

  it('turned on while a key is on the screen, the first key is another one, and the round still has all twelve',()=>{
    for(const current of TONICS){
      let state=startJazzKeyBag(99,current);
      expect(state.pos).toBe(-1);
      const keys:number[]=[];
      let at=current;
      for(let i=0;i<12;i+=1){const n=nextJazzKey(state,at);state=n.state;keys.push(n.key);at=n.key;}
      expect(keys[0]).not.toBe(current);
      expect(new Set(keys).size).toBe(12);
    }
  });
});
