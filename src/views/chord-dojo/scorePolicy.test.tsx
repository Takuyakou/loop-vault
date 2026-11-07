import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {GrandStaff} from './GrandStaff';
import {answerPolicy} from './answerPolicy';
import {targetSnapshot,writtenMidi,spellMidi,snapshotFingerLabels} from '../../domain/chordDojo/targetSnapshot';
import {QUALITIES,composition,symbol} from '../../domain/chordDojo/recipes';
import {TARGETS} from '../../domain/master251/model';
import {parseChordLabel} from '../../domain/chords';
import {dojoFingerings} from './fingering';
import {freezeLessonDisplay} from './lessonFingering';
import {p12ThemeIdeas} from '../../testing/p12ThemeFixture';
import {collectVault,syncVault} from '../../domain/chordDojo/collect';
import {emptyStore} from '../../domain/chordDojo/store';
import {planToday} from '../../domain/chordDojo/planner';
const qualityKeys=QUALITIES.flatMap(q=>Array.from({length:12},(_,key)=>[q,key] as const));
describe('staff pitches are the exact shared target',()=>{
 it.each(qualityKeys)('%s key%s round trips every composition pitch',(q,key)=>{const c=symbol(key,q),notes=composition(key,q).map(n=>48+n),s=targetSnapshot('test',c,notes);expect(s.notes.map(n=>writtenMidi(n.spelling))).toEqual(notes);expect(s.midiNotes).toEqual(notes);});
 it('round trips all MIDI heights and retains duplicates, unknown hands and missing fingers',()=>{const notes=Array.from({length:128},(_,i)=>i);notes.push(60,60);const s=targetSnapshot('range',symbol(0,'maj'),notes);expect(s.notes.map(n=>writtenMidi(n.spelling))).toEqual(notes);expect(new Set(s.notes.map(n=>n.id)).size).toBe(notes.length);expect(s.notes.every(n=>n.hand==='unknown'&&n.finger===undefined)).toBe(true);const html=renderToStaticMarkup(<GrandStaff snapshot={s}/>);expect(html).toContain('運指候補なし');expect(html.match(/data-score-midi=/g)).toHaveLength(notes.length);});
 it('uses written E sharp/B sharp/C flat and slash bass without changing pitches',()=>{for(const [label,midi,step,alter] of [['F#maj7',65,'E',1],['C#maj7',60,'B',1],['Cb',59,'C',-1],['C/E',52,'E',0]] as const){const c={...parseChordLabel(label)!,label};expect(spellMidi(midi,c)).toMatchObject({step,alter});expect(writtenMidi(spellMidi(midi,c))).toBe(midi);}});
 it('preserves all144 canonical chords and uses production hands and fingers',()=>{let count=0;for(const target of TARGETS){const chords=target.chords.map(c=>({chord:parseChordLabel(c.symbol)!,notes:c.notes,referenceHands:c.referenceHands,beats:2})),before=JSON.stringify(target),plans=dojoFingerings(chords);for(const [i,c] of chords.entries()){const s=targetSnapshot('canonical',c.chord,c.notes,plans[i]);expect(s.notes.map(n=>writtenMidi(n.spelling))).toEqual(c.notes);expect(s.notes.filter(n=>n.hand==='left').map(n=>n.midi)).toEqual(c.referenceHands.lh);expect(s.notes.filter(n=>n.hand==='right').map(n=>n.midi)).toEqual(c.referenceHands.rh);count++;}expect(JSON.stringify(target)).toBe(before);}expect(count).toBe(144);});
 it('freezes the same production hand/finger plan for related source voice and final G13',()=>{const now=new Date('2026-10-05T00:00:00Z'),collection=collectVault(p12ThemeIdeas(),now.toISOString()),store=syncVault(emptyStore(now),collection,now.toISOString()),lesson=planToday(store,collection.progressions,now).lesson!,frozen=freezeLessonDisplay(lesson,now.toISOString());const related=frozen.targets.find(t=>t.taskKey==='notes:43,53,59,64,69')!,finish=frozen.targets.find(t=>t.taskKey===frozen.source.key&&t.chordIndex===1)!;expect(related.chord.notes).toEqual(finish.chord.notes);expect(related.chord.referenceHands).toEqual(finish.chord.referenceHands);expect(related.chord.displayFingers).toEqual(finish.chord.displayFingers);expect(freezeLessonDisplay(frozen,'2026-10-06T00:00:00Z')).toBe(frozen);});
 it('keeps both hand finger labels for a doubled physical pitch',()=>{const s=targetSnapshot('unison',symbol(0,'maj'),[60,60],{hands:{left:[60],right:[60]},labels:new Map([[60,'L1/R5']])});expect(s.notes.map(n=>n.hand)).toEqual(['left','right']);expect(snapshotFingerLabels(s)?.get(60)).toBe('左1/右5');});
 it('conceals the entire score drawing and accessibility answer when no snapshot is passed',()=>{const html=renderToStaticMarkup(<GrandStaff/>);expect(html).not.toContain('<svg');expect(html).not.toContain('data-score-midi');expect(html).not.toContain('data-target-id');});
});
describe('one answer policy',()=>{
 it.each(['recall','tempo','mixed','composition'])('hides dojo %s unless introduction or explicit current hint',stage=>{expect(answerPolicy({kind:'dojo',stage,active:true}).answer).toBe(false);expect(answerPolicy({kind:'dojo',stage,active:true,hint:true}).answer).toBe(true);});
 it.each(['see','memorize'])('shows dojo %s',stage=>expect(answerPolicy({kind:'dojo',stage,active:true}).answer).toBe(true));
 it.each(['learn','recall','tempo','mixed'])('handles Master %s and always clears inactive targets',stage=>{expect(answerPolicy({kind:'master',stage,active:true}).answer).toBe(stage==='learn');expect(answerPolicy({kind:'master',stage,active:false,hint:true,feedback:'wrong'}).answer).toBe(false);});
 it('never auto opens ongoing Tempo wrong feedback and reveals only current explicit hints',()=>{expect(answerPolicy({kind:'dojo',stage:'tempo',active:true,tempoRunning:true,feedback:'wrong'})).toEqual({answer:false,theme:false});expect(answerPolicy({kind:'dojo',stage:'tempo',active:true,tempoRunning:true,hint:true})).toEqual({answer:true,theme:false});});
});

describe('clefs anchor the written staff pitches',()=>{it('bass dots enclose the F3 line and treble E4/bass G2 use their bottom lines',()=>{const html=renderToStaticMarkup(<GrandStaff snapshot={targetSnapshot('anchors',symbol(0,'maj'),[43,53,64])}/>);const bass=html.match(/<g data-score-clef="bass" transform="translate\(0 (-?\d+)\)">(.*?)<\/g>/)!,shift=Number(bass[1]),dots=[...bass[2].matchAll(/<circle[^>]*cy="([^"]+)"/g)].map(n=>Number(n[1])+shift),noteY=(midi:number)=>Number(html.match(new RegExp('data-score-midi="'+midi+'".*?<ellipse[^>]*cy="([^"]+)"'))![1]),f=noteY(53);expect(dots).toEqual([f-6,f+6]);expect(noteY(43)).toBe(208);expect(noteY(64)).toBe(104);expect(html).toContain('y1="'+f+'" y2="'+f+'"');});});


describe('compact practice staff keeps pitch anchors and readable notation',()=>{
 it('moves the bass staff with its clef without changing E4, pitches or finger text',()=>{
  const html=renderToStaticMarkup(<GrandStaff compact snapshot={targetSnapshot('anchors',symbol(0,'maj'),[43,53,64])}/>);
  const bass=html.match(/<g data-score-clef="bass" transform="translate\(0 (-?\d+)\)">(.*?)<\/g>/)!,shift=Number(bass[1]);
  const dots=[...bass[2].matchAll(/<circle[^>]*cy="([^"]+)"/g)].map(n=>Number(n[1])+shift);
  const noteY=(midi:number)=>Number(html.match(new RegExp('data-score-midi="'+midi+'".*?<ellipse[^>]*cy="([^"]+)"'))![1]);
  expect(dots).toEqual([noteY(53)-6,noteY(53)+6]);expect(noteY(43)).toBe(168);expect(noteY(64)).toBe(104);
  expect(html.match(/data-score-midi=/g)).toHaveLength(3);expect(html).toContain('rx="8" ry="5.5"');expect(html).toContain('aria-label="譜面のスクロール"');
 });
 it('keeps the entire compact answer out of hidden DOM and accessibility names',()=>{
  const html=renderToStaticMarkup(<GrandStaff compact/>);expect(html).not.toContain('<svg');expect(html).not.toContain('data-score-midi');expect(html).not.toContain('data-score-finger');
 });
});
