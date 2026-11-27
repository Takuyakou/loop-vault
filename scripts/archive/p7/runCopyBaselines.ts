import { harmonyFiles, syntheticFiles } from "./tier1Harness";
import { evaluateCopyBaseline } from "./copyBaselines";
function arg(n:string){const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];}
const split=arg("--split")??"dev",corpus=arg("--corpus");if(split!=="dev"&&split!=="validation")throw new Error("Only dev/validation allowed.");if(!corpus)throw new Error("--corpus required.");
for(const [group,files] of [["synthetic",syntheticFiles()],["harmony-"+split,await harmonyFiles(corpus,split)]] as const)for(const arm of ["Copy-Oracle","Copy-Simple","Copy-ProductBoundary"] as const)process.stdout.write(JSON.stringify({group,arm,...evaluateCopyBaseline(files,arm)})+"\n");
