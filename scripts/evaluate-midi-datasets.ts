import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { argv, cwd, stdout } from "node:process";
import { evaluateAnalyzer } from "../src/domain/midi/evaluation/evaluate";
import { adaptChordDripManifest, type ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import { analyzeMidi as analyzeLegacy } from "../src/domain/midi/legacy";
import { analyzeMidiLegacyBoundaryRerank } from "../src/domain/midi/legacyBoundaryReranker";

const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const realDir = resolve(cwd(), valueOf("--real-dir") ?? ".local-evaluation/real-midi");
const outputDir = resolve(cwd(), "artifacts/midi-dataset-evaluation");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;
const definitions = adaptChordDripManifest(manifest);
const syntheticCases = await Promise.all(definitions.map(async (definition) => ({
  definition,
  bytes: new Uint8Array(await readFile(resolve(dirname(manifestPath), definition.midiPath))),
})));
const syntheticLegacy = evaluateAnalyzer(syntheticCases, analyzeLegacy, {
  analyzerMode: "legacy", analyzerVersion: "legacy-v1", datasetId: manifest.recipeSha256,
});
const syntheticRerank = evaluateAnalyzer(syntheticCases, analyzeMidiLegacyBoundaryRerank, {
  analyzerMode: "legacy-boundary-rerank", analyzerVersion: "legacy-boundary-rerank-v1", datasetId: manifest.recipeSha256,
});
const realMidiPaths = await midiFiles(realDir);
const realWorld = {
  datasetKind: "real-world-unlabeled",
  status: realMidiPaths.length ? "evaluated" : "not-provided",
  fileCount: realMidiPaths.length,
  legacySegments: 0,
  rerankSegments: 0,
  boundaryMismatchFiles: 0,
  changedPrimaryChords: 0,
  missingLegacyCandidate: 0,
  determinismFailures: 0,
  legacyElapsedMs: 0,
  rerankElapsedMs: 0,
};
for (const path of realMidiPaths) {
  const bytes = new Uint8Array(await readFile(path));
  const legacyStart = performance.now();
  const legacy = analyzeLegacy(bytes);
  realWorld.legacyElapsedMs += performance.now() - legacyStart;
  const rerankStart = performance.now();
  const rerank = analyzeMidiLegacyBoundaryRerank(bytes);
  realWorld.rerankElapsedMs += performance.now() - rerankStart;
  const repeated = analyzeMidiLegacyBoundaryRerank(bytes);
  realWorld.legacySegments += legacy.fullTimeline.length;
  realWorld.rerankSegments += rerank.fullTimeline.length;
  if (JSON.stringify(legacy.fullTimeline.map(position)) !== JSON.stringify(rerank.fullTimeline.map(position))) realWorld.boundaryMismatchFiles += 1;
  if (JSON.stringify(rerank) !== JSON.stringify(repeated)) realWorld.determinismFailures += 1;
  rerank.fullTimeline.forEach((item, index) => {
    const legacyLabel = legacy.fullTimeline[index]?.chord.label;
    if (legacyLabel && item.chord.label !== legacyLabel) realWorld.changedPrimaryChords += 1;
    if (legacyLabel && item.chord.label !== legacyLabel && !item.alternatives.some((entry) => entry.chord.label === legacyLabel)) realWorld.missingLegacyCandidate += 1;
  });
}

const result = {
  schemaVersion: 1,
  synthetic: { datasetKind: "synthetic-labeled", baseline: syntheticLegacy.metrics, reranker: syntheticRerank.metrics },
  realWorld,
};
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(result, null, 2)}\n`);
await writeFile(resolve(outputDir, "summary.md"), markdown(result), "utf8");
stdout.write(`Synthetic ${syntheticCases.length} cases; real-world ${realMidiPaths.length} files (${realWorld.status})\n`);

function position(item: { bar: number; beat: number; durationBeats: number }) {
  return { bar: item.bar, beat: item.beat, durationBeats: item.durationBeats };
}

async function midiFiles(root: string): Promise<string[]> {
  try {
    if (!(await stat(root)).isDirectory()) return [];
  } catch {
    return [];
  }
  const entries = await readdir(root, { recursive: true });
  return entries.map((entry) => resolve(root, entry.toString()))
    .filter((path) => [".mid", ".midi"].includes(extname(path).toLowerCase()))
    .sort();
}

function markdown(report: typeof result): string {
  const base = report.synthetic.baseline;
  const rerank = report.synthetic.reranker;
  return `# MIDI Dataset Evaluation\n\n## Synthetic labeled\n\n| Metric | Legacy | Reranker |\n|---|---:|---:|\n| Root | ${pct(base.rootAccuracy)} | ${pct(rerank.rootAccuracy)} |\n| Quality | ${pct(base.qualityAccuracy)} | ${pct(rerank.qualityAccuracy)} |\n| Exact | ${pct(base.exactAccuracy)} | ${pct(rerank.exactAccuracy)} |\n| Top-3 | ${pct(base.top3Accuracy)} | ${pct(rerank.top3Accuracy)} |\n| Corrections | ${base.correctionCost} | ${rerank.correctionCost} |\n\n## Real-world unlabeled\n\n- Status: ${report.realWorld.status}\n- Files: ${report.realWorld.fileCount}\n- Boundary mismatch files: ${report.realWorld.boundaryMismatchFiles}\n- Changed primary chords: ${report.realWorld.changedPrimaryChords}\n- Missing legacy candidates: ${report.realWorld.missingLegacyCandidate}\n- Determinism failures: ${report.realWorld.determinismFailures}\n- Legacy elapsed: ${report.realWorld.legacyElapsedMs.toFixed(1)}ms\n- Reranker elapsed: ${report.realWorld.rerankElapsedMs.toFixed(1)}ms\n`;
}

function pct(value: number): string { return `${(value * 100).toFixed(2)}%`; }
function valueOf(name: string): string | undefined {
  const equals = argv.find((entry) => entry.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
