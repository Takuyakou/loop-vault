/** One-time research-only synthetic holdout seal. Never print or commit answer rows. */
import { createHash, randomInt } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { formatChordSymbol, parseChordLabel } from "../../src/domain/chords";
import { temporalGoldCases, validateTemporalGoldCase, type TemporalGoldCase } from "./temporalGold";
const shifts=[-5,-3,2,4,7] as const;
function transposeLabel(label:string,shift:number):string {
 const parsed=parseChordLabel(label);if(!parsed)throw new Error("Unparseable authored Gold label.");
 const pc=(value:number)=>(value+shift+12)%12;
 return formatChordSymbol({...parsed,root:pc(parsed.root),...(parsed.bass===undefined?{}:{bass:pc(parsed.bass)})});
}
function transpose(input:TemporalGoldCase,shift:number):TemporalGoldCase {
 const result:TemporalGoldCase={...input,notes:input.notes.map(n=>({...n,pitch:n.pitch+shift})),harmonicSpans:input.harmonicSpans.map(h=>({...h,identity:transposeLabel(h.identity,shift)})),voicingSpans:input.voicingSpans.map(v=>({...v,targetMidi:v.targetMidi.map(n=>n+shift)}))};
 const issues=validateTemporalGoldCase(result);if(issues.length)throw new Error("Invalid generated holdout case: "+issues.join(","));return result;
}
const target=process.argv[2];if(!target)throw new Error("Ignored-local target path required.");
const cases=temporalGoldCases.flatMap(entry=>[0,1].map(()=>transpose(entry,shifts[randomInt(shifts.length)]!)));
const payload=JSON.stringify({version:"p7-sealed-synthetic-v1",cases});
await mkdir(dirname(target),{recursive:true});await writeFile(target,payload,{flag:"wx"});
process.stdout.write(JSON.stringify({version:"p7-sealed-synthetic-v1",categories:temporalGoldCases.length,cases:cases.length,sha256:createHash("sha256").update(payload).digest("hex")})+"\n");
