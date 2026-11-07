import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import golden from './__fixtures__/originalPractice.golden.json';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {parseMidi} from '../midi/parser';
import raw from './originalPractice.json';

/**
 * P12.5-02 test 1: originalPractice.json agrees with the player's own MIDI (bars 1–4).
 * The MIDI files are not in the repository. Set ORIGINAL_PRACTICE_MIDI_DIR to the folder that holds them;
 * without it this test is skipped (and shows as skipped in the result).
 */
const dir=process.env.ORIGINAL_PRACTICE_MIDI_DIR;
const have=Boolean(dir&&existsSync(dir));
const FILES:Record<string,RegExp>={'op-traditional-passing':/^01_/i,'op-modern-passing':/^02_/i};
interface Event{startBeat:number;durationBeats:number;expectedPitches:number[];struck:{pitch:number}[]}

describe.skipIf(!have)('originalPractice.json against the original MIDI',()=>{
 for(const progression of (raw as unknown as {progressions:{id:string;events:Event[]}[]}).progressions){
  it(`${progression.id}: expected, struck and held-over notes match bars 1–4`,()=>{
   const name=readdirSync(dir!).find(f=>/\.mid$/i.test(f)&&FILES[progression.id]!.test(f));
   expect(name,'the MIDI file of this progression').toBeDefined();
   const bytes=readFileSync(join(dir!,name!));
   const fixture=golden.progressions.find(p=>p.id===progression.id)!;
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sourceSha256);
   const midi=parseMidi(new Uint8Array(bytes));
   const facts=midi.notes.map(n=>({pitch:n.pitch,startBeat:n.startTick/midi.ticksPerBeat,endBeat:(n.startTick+n.durationTick)/midi.ticksPerBeat,velocity:Math.round(n.velocity*127)}));
   const sort=(ns:typeof facts)=>[...ns].sort((a,b)=>a.startBeat-b.startBeat||a.pitch-b.pitch||a.endBeat-b.endBeat);
   expect(sort(facts)).toEqual(sort(fixture.sourceNotes.map(({pitch,startBeat,endBeat,velocity})=>({pitch,startBeat,endBeat,velocity}))));
   const perBeat=midi.ticksPerBeat;
   const notes=midi.notes.map(n=>({pitch:n.pitch,start:n.startTick/perBeat,end:(n.startTick+n.durationTick)/perBeat}));
   const slack=0.15; // the chord is spread over about a tenth of a beat
   for(const e of progression.events){
    const s=e.startBeat,end=e.startBeat+e.durationBeats;
    const struck=notes.filter(n=>n.start>=s-0.05&&n.start<end-0.05).map(n=>n.pitch);
    const held=notes.filter(n=>n.start<s-0.05&&n.end>s+slack).map(n=>n.pitch);
    expect([...new Set(struck)].sort((a,b)=>a-b),`struck at beat ${s}`).toEqual(e.struck.map(x=>x.pitch).sort((a,b)=>a-b));
    expect([...new Set([...struck,...held])].sort((a,b)=>a-b),`expected at beat ${s}`).toEqual([...e.expectedPitches].sort((a,b)=>a-b));
   }
  });
 }
});
