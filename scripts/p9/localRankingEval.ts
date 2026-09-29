/** Aggregate-only P9.5 public evaluation; no private witness or sealed holdout. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseChordLabel } from "../../src/domain/chords";
import { parseMidi } from "../../src/domain/midi/parser";
import type { HarmonySupportManifest } from "../phase442/harmonySupportCorpus";
import { tier2AuthoredGold } from "./tier2AuthoredGold";
import { scoreTier2 } from "./tier2Scorer";
import { rankingCases, unknownCases, type RankingNote } from "./rankingAuthoredGold";
import { rankLocal, sourceCandidates, type RankingPolicy } from "./localRankingV2";
const split = process.argv[2];
if (split !== "dev" && split !== "validation") throw new Error("Explicit dev or validation split required");
const corpusDir = process.env.P9_PUBLIC_HARMONY_CORPUS;
if (!corpusDir) throw new Error("Public Harmony corpus directory required");
const policies: RankingPolicy[] = ["OLD","PITCH_BASS","FACTOR_NO_CONTEXT","FACTOR_CONTEXT"];
interface Count { events:number; recallFull:number; recallBounded32:number; top3:number;
  top1:number; correctionEvents:number; unknownFlags:number; shortPassingEvents:number;
  shortPassingTop1:number; reviewFlags:number; reviewTruePositive:number; reviewFalsePositive:number; reviewErrors:number; correctMargins:number[]; wrongMargins:number[] }
const blank = (): Count => ({ events:0,recallFull:0,recallBounded32:0,top3:0,top1:0,
  correctionEvents:0,unknownFlags:0,shortPassingEvents:0,shortPassingTop1:0,reviewFlags:0,reviewTruePositive:0,reviewFalsePositive:0,reviewErrors:0,correctMargins:[],wrongMargins:[] });
const counts = Object.fromEntries(policies.map((policy)=>[policy,{ authored:blank(), harmony:blank(), unknown:{
  events:0,correctUnknown:0,wrongResolved:0,reviewFlags:0,reviewTruePositive:0,reviewFalsePositive:0,
  reviewErrors:0 } }])) as Record<RankingPolicy,{authored:Count;harmony:Count;unknown:{
  events:number;correctUnknown:number;wrongResolved:number;reviewFlags:number;reviewTruePositive:number;
  reviewFalsePositive:number;reviewErrors:number}} >;
const byCategory: Record<string,Record<string,{events:number;top1:number;recall:number}>> = {};
const chosen = (notes:readonly RankingNote[],policy:RankingPolicy,previous?:readonly RankingNote[]) => {
  const rows=sourceCandidates(notes);
  const prior=previous?.length ? rankLocal(previous,sourceCandidates(previous),"OLD").candidates[0]?.identity : undefined;
  return rankLocal(notes,rows,policy,prior);
};
function tally(out:Count,result:ReturnType<typeof chosen>,matches:(identity:NonNullable<typeof result.candidates[0]>["identity"])=>boolean,
  category:string) {
  const rows=result.candidates, top=rows[0]; const topIdentityAccepted=!!top&&matches(top.identity);
  const top1=topIdentityAccepted&&!result.unknown;
  out.events++;out.recallFull+=Number(rows.some((row)=>matches(row.identity)));
  out.recallBounded32+=Number(rows.slice(0,32).some((row)=>matches(row.identity)));
  out.top3+=Number(!result.unknown&&rows.slice(0,3).some((row)=>matches(row.identity)));
  out.top1+=Number(top1);out.correctionEvents+=Number(!top1);out.unknownFlags+=Number(result.unknown);
  out.reviewErrors+=Number(!topIdentityAccepted);out.reviewFlags+=Number(result.unknown);
  out.reviewTruePositive+=Number(result.unknown&&!topIdentityAccepted);
  out.reviewFalsePositive+=Number(result.unknown&&topIdentityAccepted);
  if(category==="short-passing"){out.shortPassingEvents++;out.shortPassingTop1+=Number(top1);}
  if(result.margin!==null)(top1?out.correctMargins:out.wrongMargins).push(result.margin);
}
for(const item of rankingCases.filter((row)=>row.split===split)){
  const issues = [] as string[];
  if(!item.gold.harmonic.identities.length) issues.push("identity-empty");
  if(issues.length) throw Error("Authored ranking Gold invalid");
  for(const policy of policies){
    const result=chosen(item.source,policy,item.previousSource);
    tally(counts[policy].authored,result,(identity)=>scoreTier2(item.gold,{identity}).acceptedIdentity,item.category);
    const row=(byCategory[policy]??={})[item.category]??={events:0,top1:0,recall:0};
    row.events++;row.top1+=Number(result.candidates[0]&&!result.unknown&&scoreTier2(item.gold,{identity:result.candidates[0].identity}).acceptedIdentity);
    row.recall+=Number(result.candidates.some((candidate)=>scoreTier2(item.gold,{identity:candidate.identity}).acceptedIdentity));
  }
}
for(const item of tier2AuthoredGold.slice(split==="dev"?0:4,split==="dev"?4:6)){
  const source=item.harmonic.notes.map((pitch)=>({pitch,onset:0,duration:1,track:0,velocity:80}));
  for(const policy of policies)tally(counts[policy].authored,chosen(source,policy),
    (identity)=>scoreTier2(item,{identity}).acceptedIdentity,item.harmonic.category);
}
for(const item of unknownCases.filter((row)=>row.split===split))for(const policy of policies){
  const result=chosen(item.source,policy);const out=counts[policy].unknown;
  out.events++;out.correctUnknown+=Number(result.unknown);out.wrongResolved+=Number(!result.unknown);
  out.reviewErrors++;out.reviewFlags+=Number(result.unknown);out.reviewTruePositive+=Number(result.unknown);
}
const manifest = JSON.parse(await readFile(join(corpusDir,"manifest.json"),"utf8")) as HarmonySupportManifest;
const files = await Promise.all(manifest.files.filter((entry)=>entry.split===split).map(async (entry)=>{
  const bytes=new Uint8Array(await readFile(join(corpusDir,entry.path)));
  if(bytes.length!==entry.byteLength || createHash("sha256").update(bytes).digest("hex")!==entry.sha256)
    throw Error("Public Harmony manifest/source integrity mismatch");
  return {bytes,category:"harmony-support-"+entry.variant,events:entry.events};
}));
for(const file of files){
  const parsed=parseMidi(file.bytes);
  let previous:RankingNote[]|undefined;
  for(const event of file.events){
    const gold=parseChordLabel(event.chordSymbol);
    if(!gold) throw Error("Unparsable public Harmony structural Gold");
    const startTick=event.startBeat*parsed.ticksPerBeat,endTick=event.endBeat*parsed.ticksPerBeat;
    const source=parsed.notes.filter((note)=>note.channel!==9&&note.startTick<endTick&&note.startTick+note.durationTick>startTick)
      .map((note)=>({pitch:note.pitch,onset:(note.startTick-startTick)/parsed.ticksPerBeat,
        duration:note.durationTick/parsed.ticksPerBeat,track:note.trackIndex,velocity:note.velocity}));
    if(!source.length) continue;
    for(const policy of policies){
      const result=chosen(source,policy,previous);
      const match=(identity:NonNullable<typeof result.candidates[0]>["identity"])=>identity.root===gold.root
        &&identity.quality===gold.quality&&identity.bass===(gold.bass??gold.root);
      tally(counts[policy].harmony,result,match,file.category);
      const row=(byCategory[policy]??={})[file.category]??={events:0,top1:0,recall:0};
      row.events++;row.top1+=Number(result.candidates[0]&&!result.unknown&&match(result.candidates[0].identity));
      row.recall+=Number(result.candidates.some((candidate)=>match(candidate.identity)));
    }
    previous=source;
  }
}
const avg=(values:number[])=>values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*10000)/10000:null;
const publicManifestSha=createHash("sha256").update(await readFile(join(corpusDir,"manifest.json"))).digest("hex");
const authoredManifestSha=createHash("sha256").update(JSON.stringify({rankingCases,unknownCases,tier2AuthoredGold})).digest("hex");
const results=Object.fromEntries(policies.map((policy)=>{
  const item=counts[policy],reduce=(count:Count)=>({events:count.events,candidateRecallFull:count.recallFull,
    candidateRecallBounded32:count.recallBounded32,top3:count.top3,top1:count.top1,
    correctionEvents:count.correctionEvents,unknownFlags:count.unknownFlags,
    shortPassingEvents:count.shortPassingEvents,shortPassingTop1:count.shortPassingTop1,
    correctMarginMean:avg(count.correctMargins),wrongMarginMean:avg(count.wrongMargins)});
  const review=item.unknown;
  const flags=review.reviewFlags+item.authored.reviewFlags;
  const truePositive=review.reviewTruePositive+item.authored.reviewTruePositive;
  const falsePositive=review.reviewFalsePositive+item.authored.reviewFalsePositive;
  const errors=review.reviewErrors+item.authored.reviewErrors;
  return [policy,{authored:reduce(item.authored),harmonyStructuralProxy:reduce(item.harmony),
    unknownControls:review,reviewProxy:{ precision:flags?truePositive/flags:null,
      recall:errors?truePositive/errors:null,
      falseAlarmPer100Cards:100*falsePositive/(item.authored.events+review.events) },categories:byCategory[policy]??{}}];
}));
process.stdout.write(JSON.stringify({schemaVersion:1,provenance:{corpusId:"p9.5-public-ranking-mixed-v1",
  corpusVersion:"v1",authoredManifestSha,harmonyManifestSha:publicManifestSha,split,
  codeCommit:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
  policyId:"p9.5-local-ranking-comparison-v1",boundarySource:"AUTHORED_GOLD",
  identitySource:"CANDIDATE_GENERATOR_SOURCE_ONLY",snapshotSource:"RAW_SOURCE_WINDOW",
  scoringContract:"p9.4-tier2-v1+structural-proxy-v1",metricVersion:"p9.5-ranking-v1"},
  availability:{authoredFullTier2:"AVAILABLE",harmonyFullTier2:"UNAVAILABLE_NO_INDEPENDENT_ACCEPTED_SET",
    candidateRendererPlayback:"UNAVAILABLE",humanReviewMetrics:"UNAVAILABLE_REVIEW_PROXY_ONLY"},
  results},null,2)+"\n");
