import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { evaluateAnalyzer } from "../src/domain/midi/evaluation/evaluate";
import { adaptChordDripManifest, type ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import { analyzeMidi as analyzeLegacy } from "../src/domain/midi/legacy";
import { analyzeMidiPhase4 } from "../src/domain/midi/phase4Analyzer";

/**
 * The gate conditions the automated checker marks "checked outside this script":
 * correction cost and determinism.
 */
const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const definitions = adaptChordDripManifest(manifest);
const cases = await Promise.all(definitions.map(async (definition) => ({
  definition,
  bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
})));

const legacy = evaluateAnalyzer(cases, analyzeLegacy, {
  analyzerMode: "legacy", analyzerVersion: "legacy-v1", datasetId: manifest.recipeSha256,
});
const phase4 = evaluateAnalyzer(cases, (bytes) => analyzeMidiPhase4(bytes), {
  analyzerMode: "phase4-v1", analyzerVersion: "phase4-symbolic-v1", datasetId: manifest.recipeSha256,
});

stdout.write("-- correction cost --\n");
stdout.write(`legacy  total ${legacy.metrics.correctionCost}  mean ${legacy.metrics.operationCorrectionCost.mean}  median ${legacy.metrics.operationCorrectionCost.median}\n`);
stdout.write(`phase4  total ${phase4.metrics.correctionCost}  mean ${phase4.metrics.operationCorrectionCost.mean}  median ${phase4.metrics.operationCorrectionCost.median}\n`);
const meanDelta = phase4.metrics.operationCorrectionCost.mean - legacy.metrics.operationCorrectionCost.mean;
stdout.write(`mean delta ${meanDelta >= 0 ? "+" : ""}${meanDelta.toFixed(6)} (gate: no increase beyond 0.02)\n`);
stdout.write(`verdict: ${meanDelta <= 0.02 ? "PASS" : "FAIL"}\n\n`);

stdout.write("-- determinism --\n");
let identical = true;
for (const { bytes } of cases.slice(0, 20)) {
  const first = JSON.stringify(analyzeMidi(bytes, { mode: "phase4-v1" }));
  const second = JSON.stringify(analyzeMidi(bytes, { mode: "phase4-v1" }));
  if (first !== second) identical = false;
}
stdout.write(`20 cases analysed twice: ${identical ? "identical" : "DIFFERENT"}\n`);
stdout.write(`verdict: ${identical ? "PASS" : "FAIL"}\n\n`);

stdout.write("-- legacy untouched --\n");
stdout.write(`legacy root ${(legacy.metrics.rootAccuracy * 100).toFixed(2)}%  quality ${(legacy.metrics.qualityAccuracy * 100).toFixed(2)}%  exact ${(legacy.metrics.exactAccuracy * 100).toFixed(2)}%\n`);
