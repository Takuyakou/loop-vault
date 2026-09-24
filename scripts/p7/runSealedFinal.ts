import { evaluateFinalCohort,loadSealedFiles } from "./sealedFinal";
const [input,marker]=process.argv.slice(-2);if(!input||!marker)throw new Error("Ignored-local input and one-shot marker required.");
process.stdout.write(JSON.stringify(evaluateFinalCohort(await loadSealedFiles(input,marker)),null,2)+"\n");
