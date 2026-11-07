import type { RecordingTake } from "../recording/application/ports";
import type { MidiBassNote, MidiBassSettings } from "./model";
import type { BassAnalysis } from "./analysis";
/** The recorder already routes the selected interface channel into a mono stream. */
export async function analyzeMidiBassRecording(take:RecordingTake,target:readonly MidiBassNote[],bpm:number,settings:MidiBassSettings,signal:AbortSignal):Promise<BassAnalysis> {
  const context=new AudioContext();let audio:AudioBuffer;
  try{const bytes=take.data instanceof Blob?await take.data.arrayBuffer():take.data.slice().buffer as ArrayBuffer;audio=await context.decodeAudioData(bytes);}finally{await context.close();}
  if(signal.aborted)throw new Error("判定を取り消しました");
  const pcm=audio.getChannelData(audio.numberOfChannels===1||take.metadata.resolvedChannel!=="right"?0:1).slice();
  if(audio.numberOfChannels>1&&take.metadata.resolvedChannel==="mono-sum"){const right=audio.getChannelData(1);for(let i=0;i<pcm.length;i++)pcm[i]=(pcm[i]+right[i])/2;}
  return new Promise((resolve,reject)=>{const worker=new Worker(new URL("./analysisWorker.ts",import.meta.url),{type:"module"});let done=false;const cleanup=()=>{done=true;worker.terminate();signal.removeEventListener("abort",abort);clearTimeout(timeout);};const abort=()=>{if(done)return;cleanup();reject(new Error("判定を取り消しました"));};const timeout=setTimeout(()=>{if(!done){cleanup();reject(new Error("判定の処理時間が上限を超えました。"));}},20000);signal.addEventListener("abort",abort);worker.onmessage=e=>{cleanup();if(e.data.error)reject(new Error(e.data.error));else resolve(e.data.result as BassAnalysis);};worker.onerror=()=>{cleanup();reject(new Error("録音を判定できませんでした。"));};worker.postMessage({pcm,sampleRate:audio.sampleRate,target,bpm,settings,startOffsetMs:take.metadata.startOffsetMs},[pcm.buffer]);});
}
