import { evaluateGroups, harmonyFiles, syntheticFiles } from "./tier1Harness";
function arg(name: string): string | undefined { const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1]; }
const split=arg("--split")??"dev";
if(split!=="dev"&&split!=="validation") throw new Error("Only dev and validation are available; holdout is reserved.");
const corpus=arg("--corpus");
const groups=[{name:"synthetic",files:syntheticFiles()}];
if(corpus) groups.push({name:"harmony-support-"+split,files:await harmonyFiles(corpus,split)});
process.stdout.write(JSON.stringify(await evaluateGroups(groups),null,2)+"\n");
