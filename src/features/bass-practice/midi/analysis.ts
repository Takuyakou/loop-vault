import type { MidiBassNote, MidiBassSettings, MidiBassAttempt } from "./model";
export interface PlayedBassNote { pitch:number; onsetMs:number; offsetMs:number; }
export interface BassMark { kind:MidiBassAttempt["marks"][number]; targetIndex:number; played?:PlayedBassNote; offsetMs?:number; }
export interface BassAnalysis { marks:BassMark[]; extras:PlayedBassNote[]; counts:MidiBassAttempt["counts"]; meanOffsetMs:number; latencyCorrectionMs:number; }
export class BassAnalysisError extends Error {}
function median(xs:number[]) {const s=[...xs].sort((a,b)=>a-b);return s.length?(s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2:0;}
/** McLeod normalized square difference; decimation bounds work without a dependency. */
export function estimateBassPitch(frame:Float32Array, sampleRate:number):number|undefined {
  const step=Math.max(1,Math.floor(sampleRate/8000)), rate=sampleRate/step, n=Math.floor(frame.length/step); const x=new Float32Array(n);
  let mean=0;for(let i=0;i<n;i++)mean+=frame[i*step];mean/=n;
  let energy=0;for(let i=0;i<n;i++){x[i]=frame[i*step]-mean;energy+=x[i]*x[i];}if(energy/n<1e-7)return;
  const minimum=Math.max(2,Math.floor(rate/450)),maximum=Math.min(n-3,Math.ceil(rate/28));const nsdf=new Float32Array(maximum+2);
  for(let lag=minimum-1;lag<=maximum+1;lag++){let cross=0,norm=0;for(let i=0;i<n-lag;i++){cross+=x[i]*x[i+lag];norm+=x[i]*x[i]+x[i+lag]*x[i+lag];}nsdf[lag]=norm>0?2*cross/norm:0;}
  const peaks:number[]=[];let best=0;
  for(let lag=minimum;lag<=maximum;lag++)if(nsdf[lag]>nsdf[lag-1]&&nsdf[lag]>=nsdf[lag+1]){peaks.push(lag);best=Math.max(best,nsdf[lag]);}
  const lag=peaks.find(p=>nsdf[p]>=Math.max(.7,best*.93));if(lag===undefined)return;
  const y0=nsdf[lag-1],y1=nsdf[lag],y2=nsdf[lag+1],den=y0-2*y1+y2;const refined=lag+(den? .5*(y0-y2)/den:0);
  const frequency=rate/refined;if(frequency<28||frequency>450)return;
  return Math.round(69+12*Math.log2(frequency/440));
}
/** No target notes enter extraction. Only raw mono PCM is inspected. */
export function extractPlayedBass(pcm:Float32Array,sampleRate:number):PlayedBassNote[] {
  if(sampleRate<8000||!Number.isFinite(sampleRate)||pcm.length/sampleRate>61)throw new BassAnalysisError("録音が判定の範囲を超えています。");
  let peak=0,clipped=0;for(const x of pcm){if(!Number.isFinite(x))throw new BassAnalysisError("録音を読み込めませんでした。");peak=Math.max(peak,Math.abs(x));if(Math.abs(x)>=.995)clipped++;}
  if(peak<.003)throw new BassAnalysisError("音が入っていません。入力の機器とチャンネルを確かめてください");
  if(clipped/pcm.length>.03)throw new BassAnalysisError("音が割れています。入力の音量を下げてください");
  const hop=Math.round(sampleRate*256/48000),win=Math.round(sampleRate*2048/48000),energyHop=Math.max(1,Math.round(sampleRate*.005));
  const energy:number[]=[];for(let i=0;i<pcm.length;i+=energyHop){let sum=0;for(let j=i;j<Math.min(pcm.length,i+energyHop);j++)sum+=pcm[j]*pcm[j];energy.push(Math.sqrt(sum/energyHop));}
  const maxEnergy=Math.max(...energy),noise=[...energy].sort((a,b)=>a-b)[Math.floor(energy.length*.1)]??0;const threshold=Math.max(.001,maxEnergy*.035,Math.min(noise*3,maxEnergy*.15));
  const segments:{start:number;end:number}[]=[];let start=-1,quiet=0;
  for(let k=0;k<energy.length;k++){if(energy[k]>threshold){if(start<0)start=k*energyHop;quiet=0;}else if(start>=0){quiet++;if(quiet>=3){segments.push({start,end:Math.max(start,(k-quiet+1)*energyHop)});start=-1;}}}
  if(start>=0)segments.push({start,end:pcm.length});
  const notes:PlayedBassNote[]=[];
  for(const segment of segments){if(segment.end-segment.start<sampleRate*.025)continue;let begin=segment.start;let pitch:number|undefined;let pending:number|undefined;let pendingStart=0,run=0;const observed:number[]=[];
    for(let i=segment.start;i+win<=Math.min(pcm.length,segment.end+win/2);i+=hop){const p=estimateBassPitch(pcm.subarray(i,i+win),sampleRate);if(p===undefined)continue;if(pitch===undefined){pitch=p;observed.push(p);continue;}if(p===pitch){pending=undefined;run=0;observed.push(p);}else {if(pending!==p){pending=p;pendingStart=i;run=1;}else run++;if(run>=3){const boundary=Math.max(begin,pendingStart+win*.35);if(observed.length>=3&&boundary-begin>sampleRate*.025){notes.push({pitch:median(observed),onsetMs:begin/sampleRate*1000,offsetMs:boundary/sampleRate*1000});begin=boundary;}pitch=p;observed.length=0;observed.push(p);pending=undefined;run=0;}}}
    if(pitch!==undefined)notes.push({pitch:median(observed.length?observed:[pitch]),onsetMs:begin/sampleRate*1000,offsetMs:segment.end/sampleRate*1000});
  }
  return notes;
}
export function compareBassNotes(target:readonly MidiBassNote[],bpm:number,played:readonly PlayedBassNote[],settings:MidiBassSettings,startOffsetMs=0):BassAnalysis {
  const times=target.map(n=>n.startBeat*60000/bpm);const equal=(a:number,b:number)=>settings.octaveCountsAsCorrect?(a-b)%12===0:a===b;
  let latency=0;
  if(settings.autoLatencyCorrection){const used=new Set<number>();const shifts:number[]=[];for(let i=0;i<target.length;i++){let best=-1,distance=Infinity;played.forEach((p,j)=>{const d=Math.abs(p.onsetMs-startOffsetMs-times[i]);if(!used.has(j)&&equal(p.pitch,target[i].pitch)&&d<=500&&d<distance){best=j;distance=d;}});if(best>=0){used.add(best);shifts.push(played[best].onsetMs-startOffsetMs-times[i]);}}latency=Math.max(-250,Math.min(250,median(shifts)));}
  const corrected=played.map(n=>({...n,onsetMs:n.onsetMs-startOffsetMs-latency,offsetMs:n.offsetMs-startOffsetMs-latency}));const used=new Set<number>();const marks:BassMark[]=[];
  target.forEach((n,i)=>{let selected=-1,distance=Infinity;corrected.forEach((p,j)=>{const d=Math.abs(p.onsetMs-times[i]);if(!used.has(j)&&d<=settings.timingToleranceMs*2&&d<distance){selected=j;distance=d;}});if(selected<0){marks.push({kind:"miss",targetIndex:i});return;}used.add(selected);const p=corrected[selected],offset=p.onsetMs-times[i];marks.push({kind:!equal(p.pitch,n.pitch)?"pitch":Math.abs(offset)<=settings.timingToleranceMs?"ok":offset<0?"early":"late",targetIndex:i,played:p,offsetMs:offset});});
  const extras=corrected.filter((_,i)=>!used.has(i));const ok=marks.filter(m=>m.kind==="ok");return {marks,extras,counts:{correct:ok.length,wrongPitch:marks.filter(m=>m.kind==="pitch").length,timing:marks.filter(m=>m.kind==="early"||m.kind==="late").length,missed:marks.filter(m=>m.kind==="miss").length,extra:extras.length,total:target.length},meanOffsetMs:ok.length?ok.reduce((n,m)=>n+(m.offsetMs??0),0)/ok.length:0,latencyCorrectionMs:-latency};
}
