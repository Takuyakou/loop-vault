/** Public 10-minute repeated-chord research runtime; offline ranking only. */
import { performance } from "node:perf_hooks";
import { rankLocal, sourceCandidates, type RankingPolicy } from "./localRankingV2";
const source=[48,55,60,64].map((pitch)=>({pitch,onset:0,duration:1,track:0,velocity:80}));
const beats=1200;
const rows=[];
for(const policy of ["OLD","PITCH_BASS","FACTOR_NO_CONTEXT","FACTOR_CONTEXT"] as RankingPolicy[]){
  const candidates=sourceCandidates(source);
  const started=performance.now();let peakHeapMiB=0,selected=0;
  for(let beat=0;beat<beats;beat++){
    const result=rankLocal(source,candidates,policy);
    selected+=result.candidates.length;
    if(beat%100===0)peakHeapMiB=Math.max(peakHeapMiB,process.memoryUsage().heapUsed/1048576);
  }
  rows.push({policy,beats,candidateEvaluations:selected,
    elapsedMs:Math.round((performance.now()-started)*100)/100,
    peakSampledHeapMiB:Math.round(peakHeapMiB*100)/100});
}
process.stdout.write(JSON.stringify({schemaVersion:1,corpusId:"p9-public-repeated-chord-1-4",
  scope:"offline local ranking with one fixed source window; excludes candidate generation, analyzer, Vault and UI",
  rows},null,2)+"\n");
