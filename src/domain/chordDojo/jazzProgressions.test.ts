import {readdirSync,readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe,expect,it} from 'vitest';
import {parseTextChordLabel} from '../chords';
import {builtinIds} from '../earPractice';
import {ALL_BANK} from '../earPractice/bank';
import {HeldCardJudge} from '../practice/heldCardJudge';
import {listenBeat} from './listenPosition';
import {NAMES,pc} from './recipes';
import {judgeChord} from './judging';
import {snapshotFingerLabels,targetSnapshot,writtenMidi} from './targetSnapshot';
import raw from './jazzProgressions.json';
import {
  JAZZ_PROGRESSIONS_IDS,JAZZ_PROGRESSIONS_ITEMS,buildJazzProgression,isJazzProgressionId,jazzCardSnapshot,jazzItemOf,jazzMainOf,jazzListenNotes,jazzListenPlan,JAZZ_LISTEN_LENGTH_RATIO,JAZZ_LISTEN_VELOCITY,
  parseWrittenName,writtenLabel,writtenPitch,type JazzCard,
} from './jazzProgressions';

interface RawEvent{index:number;label:string;parseLabel:string;display:string;keyContext:string;expectedPitches:number[];expectedNames:string[];leftHand:string[];rightHand:string[];
 fingers:{left:Record<string,number>;right:Record<string,number>};heldFromPrevious:string[];struck:{name:string;pitch:number;hand:string;finger:number}[]}
interface RawProgression{id:string;key:string;tonic:number;events:RawEvent[]}
const data=raw as unknown as {note:string;items:{no:number;id:string;title:string;progressions:string[]}[];progressions:(RawProgression&{item:number;main:boolean;title:string;focus:string;variantLabel:string|null})[]};
const all=JAZZ_PROGRESSIONS_IDS.map(buildJazzProgression);
const cards=all.flatMap(p=>p.cards.map((c,i)=>({p,c,i,where:`${p.id} #${i+1} ${c.display}`})));
const pcs=(c:JazzCard,root=c.chord.root)=>new Set(c.expected.map(n=>pc(n-root)));
const find=(id:string,i:number)=>buildJazzProgression(id).cards[i]!;
const rawEvent=(id:string,i:number)=>data.progressions.find(x=>x.id===id)!.events[i]!;

describe('Jazz Progressions: the data',()=>{
 it('1: 12 items, 21 progressions, 56 cards; ids are unique; every item has one main progression (its first)',()=>{
  expect(JAZZ_PROGRESSIONS_ITEMS).toHaveLength(12);expect(all).toHaveLength(21);expect(cards).toHaveLength(56);
  expect(new Set(JAZZ_PROGRESSIONS_IDS).size).toBe(21);expect(new Set(JAZZ_PROGRESSIONS_ITEMS.map(i=>i.id)).size).toBe(12);
  for(const item of JAZZ_PROGRESSIONS_ITEMS){
   const mains=all.filter(p=>p.item===item.no&&p.main);
   expect(mains.map(p=>p.id),item.id).toEqual([jazzMainOf(item)]);
   expect(item.progressions.every(id=>buildJazzProgression(id).item===item.no)).toBe(true);
   expect(item.progressions.every(id=>jazzItemOf(id)===item)).toBe(true);
  }
  expect(all.every(p=>p.tempoBpm===72&&p.cards.every(c=>c.durationBeats===4))).toBe(true);
  expect(isJazzProgressionId('jazz-progressions-009-b')).toBe(true);expect(isJazzProgressionId('ii-v-i-major')).toBe(false);
 });
 it('the note of the data says what the voicings are',()=>{expect(data.note).toContain('元の演奏の書き起こしではない');});
 it.each(cards)('2: $where is read by the chord-name reader as the chord written',({c,i,p})=>{
  const e=rawEvent(p.id,i);
  const chord=parseTextChordLabel(e.parseLabel);expect(chord,e.parseLabel).toBeTruthy();
  expect(c.chord).toEqual(chord);
  // the display (with ♭ ♯) names the same root and quality, except where the reader cannot take the display (below)
  const shown=parseTextChordLabel(e.display);
  if(shown&&e.display!=='A13(9)'){expect(shown.root).toBe(chord!.root);expect(shown.quality).toBe(chord!.quality);}
  expect(c.label).toBe(e.display);
 });
 it('2: where the display cannot be read as it is written, the data says what to read (parseLabel)',()=>{
  const different=cards.filter(({p,i})=>{const e=rawEvent(p.id,i);return JSON.stringify(parseTextChordLabel(e.display))!==JSON.stringify(parseTextChordLabel(e.parseLabel));});
  expect(different.map(x=>x.where)).toEqual(['jazz-progressions-005-a #2 A13(9)','jazz-progressions-011 #2 Dm6/9','jazz-progressions-012 #3 Dm6/9']);
  // Dm6/9 is not read from its display; its parseLabel Dm6(9) is read as D minor 6 with the 9
  expect(parseTextChordLabel('Dm6/9')).toBeNull();
  expect(find('jazz-progressions-011',1).chord).toMatchObject({root:2,quality:'min6',tensions:['9']});
  expect(find('jazz-progressions-011',1).display).toBe('Dm6/9');
 });
 it.each(cards)('3: $where passes judgeChord (core and shape) with exactly its pitches',({c})=>{
  for(const judge of ['core','shape'] as const){
   const verdict=judgeChord({notes:c.expected,chord:c.chord,judge,bass:'self'},c.expected);
   expect(verdict.ok,`${judge}: ${verdict.message}`).toBe(true);
  }
 });
 it.each(cards)('4: $where has its lowest note in the left hand as the root, hands apart, within C2..C6',({c})=>{
  const lowest=Math.min(...c.expected);
  expect(c.left).toContain(lowest);expect(pc(lowest)).toBe(c.chord.root);
  expect(Math.max(...c.left)).toBeLessThan(Math.min(...c.right));
  expect(lowest).toBeGreaterThanOrEqual(36);expect(Math.max(...c.expected)).toBeLessThanOrEqual(84);
 });
 it.each(cards)('5: $where: left and right are the expected names, and every name has the pitch it says (𝄪 is two up)',({c,p,i})=>{
  const e=rawEvent(p.id,i);
  expect([...e.leftHand,...e.rightHand].sort()).toEqual([...e.expectedNames].sort());
  expect([...c.left,...c.right].sort((a,b)=>a-b)).toEqual([...c.expected].sort((a,b)=>a-b));
  e.expectedNames.forEach((name,k)=>expect(writtenPitch(parseWrittenName(name)),name).toBe(e.expectedPitches[k]));
 });
 it.each(cards)('6: $where: fingers run 5 to 1 up the left hand and 1 to 5 up the right hand',({c,p,i})=>{
  const e=rawEvent(p.id,i);
  const left=e.leftHand.map(n=>e.fingers.left[n]!),right=e.rightHand.map(n=>e.fingers.right[n]!);
  expect(left.every((f,k)=>k===0||f<left[k-1]!)).toBe(true);expect(right.every((f,k)=>k===0||f>right[k-1]!)).toBe(true);
  expect(c.labels.size).toBe(c.expected.length);
 });
 it('7: struck + held = expected; the first card holds nothing; a held note is held by the same finger of the same hand, on the same key',()=>{
  for(const p of all){
   p.cards.forEach((c,i)=>{
    const where=`${p.id} #${i+1}`;
    expect([...c.struck,...c.carried].sort((a,b)=>a-b),where).toEqual([...c.expected].sort((a,b)=>a-b));
    if(i===0)expect(c.carried,where).toEqual([]);
    else{
     const before=p.cards[i-1]!;
     for(const n of c.carried){
      expect(before.labels.get(n),`${where} ${c.names.get(n)}`).toBe(c.labels.get(n));
      expect(c.labels.get(n)!.startsWith(c.left.includes(n)?'L':'R')).toBe(true);
     }
    }
   });
  }
  // A♭3 to G♯3 (item 7) is one key, spelled differently
  const fm=find('jazz-progressions-007',0),em=find('jazz-progressions-007',1);
  expect(fm.names.get(56)).toBe('A♭3');expect(em.names.get(56)).toBe('G♯3');expect(em.carried).toContain(56);
 });
 it('8: every progression played through with HeldCardJudge passes every card and ends the lap; what is held and what is struck both count; extra notes do not',()=>{
  for(const p of all){
   const judge=new HeldCardJudge();let played=0;
   p.cards.forEach((c,i)=>{
    judge.startCard();
    if(i>0)for(const n of judge.heldNotes())if(!c.carried.includes(n))judge.noteOff(n);
    expect(judge.judge(c.expected,c.struck).ok,`${p.id} #${i+1} before playing`).toBe(false);
    for(const n of [...c.struck,84,30])judge.noteOn(n);
    expect(judge.judge(c.expected,c.struck).ok,`${p.id} #${i+1} with extra notes`).toBe(true);
    played=i+1;
   });
   expect(played).toBe(p.cards.length);
   // the next lap starts at card 1: what is still held from the last card is not enough for it
   judge.startCard();expect(judge.judge(p.cards[0]!.expected,p.cards[0]!.struck).ok).toBe(false);
  }
  // 001: the right hand of B♭13 is held from Fm9; letting a held note go is not a pass, and neither is pressing the struck notes alone
  const p=buildJazzProgression('jazz-progressions-001'),a=p.cards[0]!,b=p.cards[1]!;
  const judge=new HeldCardJudge();for(const n of a.expected)judge.noteOn(n);
  judge.startCard();for(const n of a.left)judge.noteOff(n);for(const n of b.struck)judge.noteOn(n);
  expect(b.carried.length).toBeGreaterThan(0);expect(judge.judge(b.expected,b.struck).ok).toBe(true);
  judge.noteOff(b.carried[0]!);expect(judge.judge(b.expected,b.struck).ok).toBe(false);
  judge.noteOn(b.carried[0]!);expect(judge.judge(b.expected,b.struck).ok).toBe(true);
  judge.startCard();expect(judge.judge(b.expected,b.struck).ok).toBe(false);
 });
 it('9: titles, focus, items and the note have no address, no name of a source and no time',()=>{
  const text=[data.note,...data.items.map(i=>i.title),...data.progressions.flatMap(p=>[p.title,p.focus,p.variantLabel??''])].join('\n');
  expect(text).not.toMatch(/https?:|youtube|youtu\.be|動画|\b\d{1,2}:\d{2}\b/i);
  expect(JSON.stringify(raw)).not.toMatch(/https?:|youtube|youtu\.be|動画/i);
 });
 it('9a: similar names are not mixed up (judged by the notes)',()=>{
  const d69=find('jazz-progressions-006',2);expect(d69.display).toBe('D6/9');expect(pcs(d69).has(11)).toBe(false);expect(pcs(d69).has(9)).toBe(true);
  const e7=find('jazz-progressions-006',1);expect(e7.display).toBe('E♭7(9)');expect(pcs(e7).has(10)).toBe(true);expect(pcs(e7).has(11)).toBe(false);
  for(const [id,i] of [['jazz-progressions-007',1],['jazz-progressions-009',1]] as const){const em=find(id,i);expect(em.display).toBe('Emaj9');expect(pcs(em).has(11)).toBe(true);expect(pcs(em).has(10)).toBe(false);}
  for(const [id,i] of [['jazz-progressions-003',1],['jazz-progressions-006-a',1]] as const){const a=find(id,i);expect(a.display).toBe('A7(♭13)');expect(a.chord.root).toBe(9);expect(pcs(a).has(8)).toBe(true);expect([...a.names.values()]).toContain('F4');}
  const flat9=find('jazz-progressions-005',1),nine=find('jazz-progressions-005-a',1);
  expect(flat9.display).toBe('A13(♭9)');expect([...flat9.names.values()]).toContain('B♭3');expect(pcs(flat9).has(1)).toBe(true);expect(pcs(flat9).has(2)).toBe(false);
  expect(nine.display).toBe('A13(9)');expect([...nine.names.values()]).toContain('B3');expect(pcs(nine).has(2)).toBe(true);expect(pcs(nine).has(1)).toBe(false);
  const tenCards=buildJazzProgression('jazz-progressions-010').cards,last=tenCards[tenCards.length-1]!;expect(last.display).toBe('E♭');expect([...pcs(last)].sort((a,b)=>a-b)).toEqual([0,4,7]);expect(last.chord.quality).toBe('maj');
  for(const [id,i] of [['jazz-progressions-011',1],['jazz-progressions-012',2]] as const){const m=find(id,i);expect(m.display).toBe('Dm6/9');expect([...m.names.values()]).toContain('B3');expect(pcs(m).has(9)).toBe(true);expect(pcs(m).has(8)).toBe(false);}
  const nineCards=buildJazzProgression('jazz-progressions-009').cards,last9=nineCards[nineCards.length-1]!;expect(last9.display).toBe('Cmaj9');expect(pcs(last9).has(11)).toBe(true);expect(pcs(last9).has(2)).toBe(true);
  for(const id of ['jazz-progressions-004','jazz-progressions-004-a']){const p=buildJazzProgression(id);expect(p.cards.some(c=>['Dmaj9','D6/9','Dmaj7'].includes(c.display))).toBe(false);}
  const sus=find('jazz-progressions-004',0),thirteen=find('jazz-progressions-004',1);
  expect(sus.display).toBe('Asus(11)13');expect(thirteen.display).toBe('A13');expect(pcs(sus).has(5)).toBe(true);expect(pcs(sus).has(4)).toBe(false);expect(pcs(thirteen).has(4)).toBe(true);expect(pcs(thirteen).has(5)).toBe(false);
 });
 it('9b: only the second half of item 9 reads its degrees in Em; every other card reads in the key of its progression',()=>{
  for(const {p,c,i} of cards){
   const inEm=p.id==='jazz-progressions-009'&&i>=2;
   expect(c.keyContext,`${p.id} #${i+1}`).toBe(inEm?'Em':p.key);
  }
  expect(buildJazzProgression('jazz-progressions-009-b').key).toBe('Em');
 });
});

describe('Jazz Progressions: how a card is written',()=>{
 it('names: b is ♭, # is ♯, x is 𝄪; the pitch of a written note is what is sounded',()=>{
  expect(writtenLabel(parseWrittenName('Ab3'))).toBe('A♭3');expect(writtenLabel(parseWrittenName('F#4'))).toBe('F♯4');expect(writtenLabel(parseWrittenName('Fx3'))).toBe('F𝄪3');
  expect(writtenLabel(parseWrittenName('Cb4'))).toBe('C♭4');expect(writtenPitch(parseWrittenName('Cb4'))).toBe(59);expect(writtenPitch(parseWrittenName('Fx3'))).toBe(55);
  expect(()=>parseWrittenName('H4')).toThrow();
  // the app's own note names (flats only) would write C♭4 as B3: that is why the names of the data are used
  expect(`${NAMES[pc(59)]}${Math.floor(59/12)-1}`).toBe('B3');
 });
 it('a card shows its notes as the data writes them, with their fingers',()=>{
  const d=find('jazz-progressions-009',0);
  expect(d.leftNames).toEqual(['D♯2','A♯2']);expect(d.rightNames).toEqual(['F𝄪3','C♯4','E𝄪4']);expect(d.display).toBe('D♯7(♯9)');
  expect(find('jazz-progressions-010',1).rightNames[0]).toBe('C♭4');
  expect(find('jazz-progressions-001',0).labels.get(41)).toBe('L5');expect(find('jazz-progressions-001',0).labels.get(67)).toBe('R5');
 });
 it('the snapshot for the staff and keyboard has the spelling and the fingers of the data for every note of all 56 cards',()=>{
  for(const p of all)p.cards.forEach((c,i)=>{
   const s=jazzCardSnapshot(p,i);
   expect(s.midiNotes).toEqual(c.expected);expect(s.chordSymbol).toBe(c.display);expect(s.keyContext).toBe(c.keyContext);
   for(const n of s.notes){
    expect(writtenMidi(n.spelling)).toBe(n.midi);expect(c.written.get(n.midi)).toEqual(n.spelling);
    expect(n.hand).toBe(c.left.includes(n.midi)?'left':'right');
    expect(`${n.hand==='left'?'L':'R'}${n.finger}`).toBe(c.labels.get(n.midi));
   }
   const fingers=snapshotFingerLabels(s)!;
   for(const [midi,label] of c.labels)expect(fingers.get(midi)).toBe(label.replace('L','左').replace('R','右'));
  });
  // the cards the reader of the app spells differently: D7(♯9) has F (not E♯), D♯7(♯9) F𝄪 and E𝄪, D♭7 C♭
  const spell=(id:string,i:number)=>jazzCardSnapshot(buildJazzProgression(id),i).notes.map(n=>`${n.spelling.step}${['♭♭','♭','','♯','𝄪'][n.spelling.alter+2]}${n.spelling.octave}`);
  expect(spell('jazz-progressions-008',0)).toContain('F4');expect(spell('jazz-progressions-009',0)).toEqual(['D♯2','A♯2','F𝄪3','C♯4','E𝄪4']);expect(spell('jazz-progressions-010',1)).toContain('C♭4');
  const card=find('jazz-progressions-009',0);
  const spelled=(notes:readonly {spelling:{step:string;alter:number}}[])=>notes.map(n=>n.spelling.step+n.spelling.alter);
  expect(spelled(targetSnapshot('x',card.chord,card.expected,undefined,'G♯m').notes)).not.toEqual(spelled(jazzCardSnapshot(buildJazzProgression('jazz-progressions-009'),0).notes));
 });
 it('the listening plan is at the tempo that is chosen: at 120 the notes sound twice as fast as at 60, and the seek bar runs over the same beats',()=>{
  const p=buildJazzProgression('jazz-progressions-001'),slow=jazzListenPlan(p,60),fast=jazzListenPlan(p,120);
  expect(fast.bpm).toBe(120);expect(slow.bpm).toBe(60);
  expect(fast.notes).toEqual(slow.notes);expect(fast.totalBeats).toBe(slow.totalBeats);
  // seconds of the end of the last card, and of every note: half at 120
  expect(fast.totalBeats*60/fast.bpm).toBeCloseTo(slow.totalBeats*60/slow.bpm/2,10);
  fast.notes.forEach((n,i)=>expect(n.startBeat*60/fast.bpm).toBeCloseTo(slow.notes[i]!.startBeat*60/slow.bpm/2,10));
  // the seek bar reads the same tempo: after one second it is two beats in at 120, one at 60
  expect(listenBeat(11,10,fast.bpm)).toBeCloseTo(2,10);expect(listenBeat(11,10,slow.bpm)).toBeCloseTo(1,10);
 });
 it('the whole progression for listening: every card sounds all its notes again, as loud as one card alone, with no long silence between cards',()=>{
  for(const p of all){
   const notes=jazzListenNotes(p),beatLength=60/p.tempoBpm;
   expect(notes).toHaveLength(p.cards.reduce((n,c)=>n+c.expected.length,0));
   p.cards.forEach((c,i)=>{
    const mine=notes.filter(n=>n.startBeat===c.startBeat);
    expect(mine.map(n=>n.pitch).sort((a,b)=>a-b),`${p.id} #${i+1}`).toEqual([...c.expected].sort((a,b)=>a-b));
    for(const n of mine){expect(n.velocity).toBe(JAZZ_LISTEN_VELOCITY);expect(n.durationBeats).toBeCloseTo(c.durationBeats*JAZZ_LISTEN_LENGTH_RATIO,10);}
    // the room before the next card is a tenth of the card: far under half a beat
    if(i<p.cards.length-1){const gapBeats=p.cards[i+1]!.startBeat-(c.startBeat+mine[0]!.durationBeats);expect(gapBeats*beatLength).toBeLessThan(beatLength/2);expect(gapBeats).toBeGreaterThanOrEqual(0);}
   });
  }
  // 001: B♭13 sounds the right hand that is kept down (A♭3 C4 G4) again with the left hand
  const p=buildJazzProgression('jazz-progressions-001'),second=jazzListenNotes(p).filter(n=>n.startBeat===p.cards[1]!.startBeat).map(n=>n.pitch);
  for(const kept of p.cards[1]!.carried)expect(second).toContain(kept);
  expect(p.cards[1]!.carried.length).toBe(3);
  // the strength is the one a card has when it is played alone (previewChord: 0.72)
  expect(JAZZ_LISTEN_VELOCITY).toBe(0.72);
 });
});

describe('Jazz Progressions are not in the ear practice',()=>{
 const walk=(dir:URL):string[]=>readdirSync(dir).flatMap(name=>{const url=new URL(name,dir);return statSync(url).isDirectory()?walk(new URL(`${name}/`,dir)):[fileURLToPath(url)];});
 it('10: no question of the ear practice comes from them (standard progressions, the bank), and no source of the ear practice refers to them',()=>{
  expect(builtinIds().filter(isJazzProgressionId)).toEqual([]);
  expect(ALL_BANK.map(b=>b.id).filter(isJazzProgressionId)).toEqual([]);
  const files=[...walk(new URL('../earPractice/',import.meta.url)),...walk(new URL('../../views/ear-practice/',import.meta.url))].filter(f=>/\.(ts|tsx|json)$/.test(f)&&!/\.test\./.test(f));
  expect(files.length).toBeGreaterThan(10);
  for(const f of files)expect(readFileSync(f,'utf8'),f).not.toMatch(/jazzProgressions|jazzRecords|JAZZ_PROGRESSIONS|jazz-progressions/);
 });
 it('and they are not among the standard progressions of the Dojo',async()=>{
  const {BUILTINS}=await import('./builtins');
  expect(BUILTINS.map(b=>b.id).filter(isJazzProgressionId)).toEqual([]);
 });
});
