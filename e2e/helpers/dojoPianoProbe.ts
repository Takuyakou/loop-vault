import type {Page} from '@playwright/test';
/** Observe public piano samples + actual WebAudio playback rate; no product hook or mocked audio. */
export async function installDojoPianoProbe(page:Page){
 await page.addInitScript(()=>{
  const encoded=new Map<string,number>(),decoded=new WeakMap<AudioBuffer,number>(),rates=new WeakMap<AudioParam,number>();
  const probe={notes:[] as number[]};Object.assign(window,{__dojoPianoProbe:probe});
  const signature=(data:ArrayBuffer)=>{const bytes=new Uint8Array(data);let h=2166136261;for(let i=0;i<Math.min(bytes.length,256);i++)h=Math.imul(h^bytes[i],16777619);return `${bytes.length}:${h}`;};
  const read=Response.prototype.arrayBuffer;
  Response.prototype.arrayBuffer=async function(){const data=await read.call(this),match=/\/(C[1-7]|A0)(?:-[^/]+)?\.mp3(?:\?|$)/.exec(this.url);if(match)encoded.set(signature(data),match[1]==='A0'?21:(Number(match[1][1])+1)*12);return data;};
  const decode=BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData=function(data,success,failure){const pitch=encoded.get(signature(data));const record=(buffer:AudioBuffer)=>{if(pitch!==undefined)decoded.set(buffer,pitch);};const pending=decode.call(this,data,buffer=>{record(buffer);success?.(buffer);},failure);void pending.then(record,()=>undefined);return pending;};
  const set=AudioParam.prototype.setValueAtTime;
  AudioParam.prototype.setValueAtTime=function(value,time){rates.set(this,value);return set.call(this,value,time);};
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){const root=this.buffer?decoded.get(this.buffer):undefined;if(root!==undefined)probe.notes.push(Math.round(root+12*Math.log2(rates.get(this.playbackRate)??this.playbackRate.value)+(rates.get(this.detune)??this.detune.value)/100));return start.apply(this,args);};
 });
}
export const pianoNotes=(page:Page)=>page.evaluate(()=>(window as typeof window&{__dojoPianoProbe:{notes:number[]}}).__dojoPianoProbe.notes);
