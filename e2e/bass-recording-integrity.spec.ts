import {test,expect} from "@playwright/test";
import type {BassAnalysis} from "../src/features/bass-practice/midi/analysis";
import {syntheticMicrophone,openSyntheticBass,recordSyntheticBass} from "./helpers/bass-ui";

test("synthetic permission and cancelled capture cannot reserve another context",async({page})=>{
 await syntheticMicrophone(page);await openSyntheticBass(page);
 const state=await page.evaluate(async()=>{
  const Native=AudioContext,probe=await navigator.mediaDevices.getUserMedia({audio:true});
  const permissionUnchanged=AudioContext===Native;probe.getTracks().forEach(track=>track.stop());
  const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:2,echoCancellation:false}});
  const reserved=AudioContext;
  const other=new AudioContext({sampleRate:48000});
  const optionsPreserved=other.sampleRate===48000&&AudioContext===reserved;await other.close();
  stream.getTracks().forEach(track=>track.stop());
  const w=window as typeof window&{bassSyntheticShares:number;bassSyntheticPending:boolean};
  return {permissionUnchanged,optionsPreserved,restored:AudioContext===Native,pending:w.bassSyntheticPending,shares:w.bassSyntheticShares};
 });
 expect(state).toEqual({permissionUnchanged:true,optionsPreserved:true,restored:true,pending:false,shares:0});
});

// Observes only this public synthetic recording. Nothing is added to production UI/code.
for(const width of [1920,1366])for(const mistakes of [false,true])test(`synthetic recording preserves four attacks ${width} ${mistakes?"mistakes":"clean"}`,async({page})=>{
 await page.setViewportSize({width,height:1080});await syntheticMicrophone(page,mistakes);await openSyntheticBass(page);
 await page.evaluate(()=>{
  const state={starts:0,chunks:[] as number[],decode:[] as {rate:number;length:number}[],workerInputs:0,pcm:[] as number[],pcmLength:0,rate:0,result:undefined as BassAnalysis|undefined};
  (window as typeof window&{__bassDiag:typeof state}).__bassDiag=state;
  const Recorder=window.MediaRecorder;
  window.MediaRecorder=class extends Recorder{override start(timeslice?:number){state.starts++;this.addEventListener("dataavailable",e=>state.chunks.push(e.data.size));super.start(timeslice);}};
  const decode=BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData=async function(bytes:ArrayBuffer,success?:DecodeSuccessCallback,failure?:DecodeErrorCallback){try{const audio=await decode.call(this,bytes);state.decode.push({rate:audio.sampleRate,length:audio.length});success?.(audio);return audio;}catch(error){failure?.(error as DOMException);throw error;}};
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker{
   constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.addEventListener("message",e=>{if(e.data.result)state.result=e.data.result;});}
   override postMessage(message:unknown,options?:Transferable[]|StructuredSerializeOptions){const m=message as {pcm?:Float32Array;sampleRate?:number};if(m.pcm){state.workerInputs++;state.pcm=Array.from(m.pcm);state.pcmLength=m.pcm.length;state.rate=m.sampleRate!;}if(Array.isArray(options))super.postMessage(message,options);else super.postMessage(message,options);}
  };
 });
 await recordSyntheticBass(page);
 const d=await page.evaluate(()=>(window as typeof window&{__bassDiag:{starts:number;chunks:number[];decode:{rate:number;length:number}[];workerInputs:number;pcm:number[];pcmLength:number;rate:number;result?:BassAnalysis}}).__bassDiag);
 const clock=await page.evaluate(()=>{const w=window as typeof window&{bassSyntheticShares:number;bassSyntheticSourceMatches:boolean[];bassSyntheticPending:boolean};return {shares:w.bassSyntheticShares,matches:w.bassSyntheticSourceMatches,pending:w.bassSyntheticPending};});
 expect(clock).toEqual({shares:1,matches:[true],pending:false});
 expect(d.starts).toBe(1);expect(d.chunks.length).toBeGreaterThan(0);expect(d.chunks.every(n=>n>0)).toBe(true);expect(d.workerInputs).toBe(1);
 expect(d.decode.filter(x=>x.rate===d.rate&&x.length===d.pcmLength)).toHaveLength(1);
 const result=d.result!;expect(result).toBeDefined();
 const notes=[...result.marks.flatMap(m=>m.played?[m.played]:[]),...result.extras].sort((a,b)=>a.onsetMs-b.onsetMs);
 expect(notes.map(n=>n.pitch)).toEqual(mistakes?[28,34,28,36]:[28,33,38,28]);
 const times=mistakes?[0,500,1500,2500]:[0,500,1000,1500];notes.forEach((note,i)=>{expect(Math.abs(note.onsetMs-times[i])).toBeLessThanOrEqual(70);expect(note.offsetMs).toBeGreaterThan(note.onsetMs);});
 // Check the recorded waveform independently of the product pitch detector.
 // Hysteresis ignores tiny lossy-codec zero-crossing ripples; the authored
 // sine period must remain intact in each note's steady portion.
 const first=d.pcm.findIndex(x=>Math.abs(x)>.03),pitches=mistakes?[28,34,28,36]:[28,33,38,28];
 expect(first).toBeGreaterThanOrEqual(0);
 for(let n=0;n<pitches.length;n++){
  const edges:number[]=[];let armed=false;
  const start=first+Math.round((times[n]+30)*d.rate/1000),end=first+Math.round((times[n]+220)*d.rate/1000);
  for(let i=start;i<end;i++){if(d.pcm[i]<-.03)armed=true;else if(armed&&d.pcm[i]>.03){edges.push(i);armed=false;}}
  expect(edges.length).toBeGreaterThanOrEqual(4);
  const period=1000/(440*2**((pitches[n]-69)/12));
  for(let i=1;i<edges.length;i++)expect(Math.abs((edges[i]-edges[i-1])*1000/d.rate-period),`authored note ${n} period`).toBeLessThan(2);
 }
 expect(result.counts).toEqual(mistakes?{correct:2,wrongPitch:1,timing:0,missed:1,extra:1,total:4}:{correct:4,wrongPitch:0,timing:0,missed:0,extra:0,total:4});
 if (mistakes) await expect(page.getByTestId("midi-bass-result")).toContainText("余分な音 1");
 else await expect(page.getByTestId("midi-bass-result")).not.toContainText("余分な音");
});
