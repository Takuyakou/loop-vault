import { harmonyFiles } from "./tier1Harness";
import { evaluateHarmonicExamples, evaluateRepresentations } from "./candidateRepresentations";
function arg(n:string){const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];}
const split=arg("--split")??"dev",corpus=arg("--corpus");if(split!=="dev"&&split!=="validation")throw new Error("Only dev/validation allowed.");if(!corpus)throw new Error("--corpus required.");
process.stdout.write(JSON.stringify({group:"harmonic-synthetic",modes:evaluateHarmonicExamples()})+"\n");process.stdout.write(JSON.stringify({group:"harmony-"+split,modes:evaluateRepresentations(await harmonyFiles(corpus,split))})+"\n");
