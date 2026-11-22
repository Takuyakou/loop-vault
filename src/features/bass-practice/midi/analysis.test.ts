import { describe, expect, test } from "vitest";
import { compareBassNotes, estimateBassPitch, extractPlayedBass } from "./analysis";
import { emptyMidiBassLibrary } from "./model";
const settings={...emptyMidiBassLibrary().settings,autoLatencyCorrection:false};
describe("post-record bass analysis",()=>{
 test("recognizes four/five-string fundamentals without target-guided pitch",()=>{for(const pitch of [23,24,28,33,38,43,55,64]){const frame=Float32Array.from({length:2048},(_,i)=>.2*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*i/48000));expect(estimateBassPitch(frame,48000)).toBe(pitch);}});
 test("silence and clipping never create a graded attempt",()=>{expect(()=>extractPlayedBass(new Float32Array(48000),48000)).toThrow("音が入っていません");expect(()=>extractPlayedBass(new Float32Array(48000).fill(1),48000)).toThrow("音が割れています");});
 test("one-to-one pairing covers pitch, early/late, missing and extra",()=>{const target=[28,33,38,43,40].map((pitch,i)=>({pitch,startBeat:i,durationBeats:.5,velocity:.8}));const played=[{pitch:28,onsetMs:0,offsetMs:100},{pitch:34,onsetMs:500,offsetMs:600},{pitch:38,onsetMs:900,offsetMs:1000},{pitch:43,onsetMs:1600,offsetMs:1700},{pitch:50,onsetMs:2400,offsetMs:2450}];const result=compareBassNotes(target,120,played,settings);expect(result.marks.map(m=>m.kind)).toEqual(["ok","pitch","early","late","miss"]);expect(result.extras).toHaveLength(1);expect(result.counts).toEqual({correct:1,wrongPitch:1,timing:2,missed:1,extra:1,total:5});});
 test("device offset and octave allowance are explicit, bounded settings",()=>{const target=[28,33,38].map((pitch,i)=>({pitch,startBeat:i,durationBeats:.5,velocity:.8}));const played=target.map(n=>({pitch:n.pitch+12,onsetMs:n.startBeat*500+280,offsetMs:n.startBeat*500+400}));const result=compareBassNotes(target,120,played,{...settings,autoLatencyCorrection:true},40);expect(result.counts.correct).toBe(3);expect(result.latencyCorrectionMs).toBe(-240);expect(compareBassNotes(target,120,played,{...settings,octaveCountsAsCorrect:false},280).counts.wrongPitch).toBe(3);});
});

// P23-62: the Echo practices pass their own pitch rule (rhythm judges timing only).
describe("P23-62 pitchRule",()=>{
 const target=[28,33,38,43].map((pitch,i)=>({pitch,startBeat:i,durationBeats:.5,velocity:.8}));
 const playedAt=(pitch:(target:number,i:number)=>number)=>target.map((note,i)=>({pitch:pitch(note.pitch,i),onsetMs:i*500,offsetMs:i*500+120}));
 test("ignore matches on timing alone, whatever the notes",()=>{const result=compareBassNotes(target,120,playedAt(()=>60),{...settings,pitchRule:"ignore"});expect(result.counts.correct).toBe(4);expect(result.counts.wrongPitch).toBe(0);});
 test("octave accepts the same pitch class and rejects one semitone",()=>{expect(compareBassNotes(target,120,playedAt(pitch=>pitch+12),{...settings,pitchRule:"octave"}).counts.correct).toBe(4);expect(compareBassNotes(target,120,playedAt(pitch=>pitch+1),{...settings,pitchRule:"octave"}).counts.wrongPitch).toBe(4);});
 test("exact rejects the octave",()=>{const result=compareBassNotes(target,120,playedAt(pitch=>pitch+12),{...settings,pitchRule:"exact"});expect(result.counts.wrongPitch).toBe(4);expect(result.counts.correct).toBe(0);});
 test("without a pitchRule the octaveCountsAsCorrect setting decides",()=>{expect(compareBassNotes(target,120,playedAt(pitch=>pitch+12),{...settings,octaveCountsAsCorrect:true}).counts.correct).toBe(4);expect(compareBassNotes(target,120,playedAt(pitch=>pitch+12),{...settings,octaveCountsAsCorrect:false}).counts.wrongPitch).toBe(4);});
});

test("a short unstable attack does not invent a second note or move the sustained note onset",()=>{for(const prefixMs of [10,15,20]){const rate=48000,pcm=new Float32Array(rate/2);for(let i=0;i<rate*.3;i++){const pitch=i<rate*prefixMs/1000?25:33;pcm[i]=.25*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*i/rate);}const played=extractPlayedBass(pcm,rate);expect(played).toHaveLength(1);expect(played[0].pitch).toBe(33);expect(played[0].onsetMs).toBe(0);}});

test("short separated notes retain real pitch changes and extra notes at both WebAudio rates",()=>{
 for(const rate of [44100,48000])for(const duration of [.04,.06,.08,.125,.25]){
  const pitches=duration<.06?[28,33,38,36]:[23,28,33,38,36],pcm=new Float32Array(Math.ceil(rate*pitches.length*(duration+.1)));
  pitches.forEach((pitch,n)=>{const start=Math.round(n*(duration+.1)*rate),len=Math.round(duration*rate);for(let i=0;i<len;i++)pcm[start+i]=.25*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*i/rate)*Math.min(1,i/(rate*.002),(len-i)/(rate*.002));});
  expect(extractPlayedBass(pcm,rate).map(n=>n.pitch),`${rate} / ${duration}`).toEqual(pitches);
 }
});

test("legato pitch changes remain real events with bounded onset error",()=>{
 for(const rate of [44100,48000])for(const duration of [.125,.25]){
  const pitches=[28,33,34,28],pcm=new Float32Array(Math.ceil(rate*(pitches.length*duration+.2)));
  pitches.forEach((pitch,n)=>{const start=Math.round(n*duration*rate),len=Math.round(duration*rate);for(let i=0;i<len;i++)pcm[start+i]=.25*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*i/rate);});
  const played=extractPlayedBass(pcm,rate);expect(played.map(n=>n.pitch)).toEqual(pitches);
  played.forEach((note,i)=>expect(Math.abs(note.onsetMs-i*duration*1000)).toBeLessThanOrEqual(70));
 }
});

test("brief low notes in legato and at the recording end are not lost",()=>{
 for(const rate of [44100,48000])for(const low of [23,28])for(const duration of [.06,.08])for(const tail of [false,true]){
  const pitches=tail?[33,low,38]:[33,low],durations=tail?[.3,duration,.3]:[.3,duration];
  const pcm=new Float32Array(Math.round(rate*durations.reduce((a,b)=>a+b,0)));let offset=0;
  pitches.forEach((pitch,n)=>{const len=Math.round(durations[n]*rate);for(let i=0;i<len&&offset+i<pcm.length;i++)pcm[offset+i]=.25*Math.sin(2*Math.PI*440*2**((pitch-69)/12)*i/rate);offset+=len;});
  const played=extractPlayedBass(pcm,rate);expect(played.map(n=>n.pitch)).toEqual(pitches);
  let time=0;played.forEach((note,i)=>{expect(Math.abs(note.onsetMs-time*1000)).toBeLessThanOrEqual(70);time+=durations[i];});
 }
});
