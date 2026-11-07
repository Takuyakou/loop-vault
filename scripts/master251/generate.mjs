/* global process, console */
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {parseMidi} from 'midi-file';
// Explicit, local task input only. Never copy input provenance or source order to production.
export function extract(packageRoot) {
 const review=JSON.parse(readFileSync(join(packageRoot,'reference/canonical-targets-review.json'),'utf8'));
 const pcs={C:0,Db:1,D:2,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,Ab:8,A:9,Bb:10,B:11};
 const degrees=['ii','V','I'];const targets=[];const audit=[];
 const note=(text)=>{const m=/^([A-G])([b#]?)(-?\d+)$/.exec(text);assert(m,'Invalid marker note');return ({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]+(m[2]==='b'?-1:m[2]==='#'?1:0)+Number(m[3])*12);}; // Source uses DAW C5=60.
 const names=readdirSync(join(packageRoot,'source-midi')).filter(n=>n.endsWith('.mid'));assert.equal(names.length,4);
 for(const name of names){
  const form=/Form([ABCD])/.exec(name)?.[1];assert(form);const midi=parseMidi(readFileSync(join(packageRoot,'source-midi',name)));const ppq=midi.header.ticksPerBeat;assert.equal(ppq,480);
  const events=midi.tracks.flatMap(track=>{let tick=0;return track.map(e=>({...e,tick:tick+=e.deltaTime}));}).sort((a,b)=>a.tick-b.tick);
  const tempos=events.filter(e=>e.type==='setTempo'),meters=events.filter(e=>e.type==='timeSignature');assert(tempos.length&&tempos.every(e=>e.microsecondsPerBeat===750000));assert(meters.length&&meters.every(e=>e.numerator===4&&e.denominator===4));
  const onsets=new Map(),active=new Map();const durations=[];
  for(const e of events){const id=`${e.channel}:${e.noteNumber}`;if(e.type==='noteOn'&&e.velocity>0){assert(!active.has(id));active.set(id,e.tick);const ns=onsets.get(e.tick)??[];ns.push(e.noteNumber);onsets.set(e.tick,ns);}else if(e.type==='noteOff'||e.type==='noteOn'&&!e.velocity){assert(active.has(id));durations.push(e.tick-active.get(id));active.delete(id);}}
  assert.equal(active.size,0);assert.equal(onsets.size,36);assert.equal(durations.length,180);assert(durations.every(t=>t===ppq*2));
  const entries=[...onsets];const keys=new Set();const ref=review.forms[form];assert(ref);const markers=events.filter(e=>e.type==='marker');assert.equal(markers.length,36);
  for(let group=0;group<12;group++){
   let key;const chords=[];
   for(let i=0;i<3;i++){
    const [tick,raw]=entries[group*3+i];assert.equal(tick,(group*8+i*2)*ppq);const notes=[...raw].sort((a,b)=>a-b);assert.equal(new Set(notes).size,5);
    const marker=markers.find(e=>e.tick===tick);assert(marker);const parts=marker.text.split(' | ');const label=parts[1].replace(' major','');key=pcs[label];assert(key!==undefined);const rh=parts[4].replace(/^RH /,'').split(' ').map(note),lh=parts[3].replace(/^LH /,'').split(' ').map(note);
    assert.equal(lh.length,['A','C'].includes(form)?1:2);assert.deepEqual([...lh,...rh].sort((a,b)=>a-b),notes);
    const rc=ref.groups[group].chords[i];assert.equal(ref.groups[group].keyPitchClass,key);assert.equal(rc.degree,degrees[i]);assert.equal(rc.symbol,parts[2]);assert.equal(rc.onsetTick,tick);assert.equal(rc.onsetBeat,tick/ppq);assert.deepEqual(rc.notes,notes);assert.deepEqual(rc.referenceHands.lh,lh);assert.deepEqual(rc.referenceHands.rh,rh);
    chords.push({degree:degrees[i],symbol:parts[2],notes,referenceHands:{lh,rh}});
   }
   assert(!keys.has(key));keys.add(key);targets.push({form,key,bpm:80,beatsPerChord:2,restAfterProgressionBeats:2,chords});
  }
  assert.equal(keys.size,12);const end=events.find(e=>e.type==='endOfTrack')?.tick;assert(end>=96*ppq,'Final rest must exist');audit.push({form,keys:12,onsets:36,notesPerChord:5,bpm:80,meter:'4/4',durationBeats:2,restBeats:2,referenceMatched:36});
 }
 targets.sort((a,b)=>a.form.localeCompare(b.form)||a.key-b.key);assert.equal(targets.length,48);
 return {targets,audit:{forms:audit,totalCells:48,totalChordTargets:144,exactReferenceMatches:144,sourceAuthor:'user',markerOctaveConvention:'DAW C5 = MIDI 60; normalized to exact MIDI numbers'}};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
 const root=process.argv[2];assert(root,'Pass local package directory');const {targets,audit}=extract(root);const out=process.argv[3]??'src/domain/master251/canonical.json';mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(targets,null,2)+'\n');mkdirSync('p12-generated/master251',{recursive:true});writeFileSync('p12-generated/master251/source-audit.json',JSON.stringify(audit,null,2)+'\n');writeFileSync('p12-generated/master251/targets-review.json',JSON.stringify(targets,null,2)+'\n');console.log(JSON.stringify(audit,null,2));
}
