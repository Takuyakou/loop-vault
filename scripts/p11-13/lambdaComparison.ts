import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateFingeringCandidates } from "../../src/domain/progressionFingering";
import type { HandPositionPolicy } from "../../src/domain/handPositionFingering";
import { largeCases, namedCases, type Case } from "../p11-12/fixtures";
import { aggregate, contextSensitivity, inputs, matchedTime, measure, runtime, switchingDiagnostic, type Arm } from "./comparisonMetrics";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const directory = ".local-evaluation/p11-13/lambda-followup";
mkdirSync(directory, { recursive: true });
const archiveBytes = readFileSync(".local-evaluation/p11-13/comparison.json");
const frozenBytes = readFileSync(".local-evaluation/p11-13/frozen-policy.json");
const archive = JSON.parse(archiveBytes.toString("utf8")) as {
  codeCommit: string; baselineSum: ReturnType<typeof aggregate>;
  sweep: { policy: HandPositionPolicy; stats: ReturnType<typeof aggregate> }[];
};
const dev = [...largeCases().filter(c => Number(c.id.match(/-(\d+)-ioi/)?.[1]) < 6), ...namedCases()];
if (dev.length !== 1148) throw Error("Dev manifest composition changed");
const baseline = dev.map(c => measure(c, "CURRENT"));
if (JSON.stringify(aggregate(baseline)) !== JSON.stringify(archive.baselineSum)) {
  throw Error("CURRENT dev aggregate differs from the archived comparison");
}
const representative: Case[] = [
  { id: "slow-bass", hand: "left", notes: [[48], [50], [52], [53]], bpm: 120, ioiBeats: 4, shape: "slow" },
  { id: "fast-bass", hand: "left", notes: [[48], [50], [52], [53]], bpm: 120, ioiBeats: 0.25, shape: "fast" },
  ...["chromatic", "octave", "upper-single-to-3", "3-to-upper-single", "repeat"].map(id => namedCases().find(c => c.id === `left-${id}`)!),
  { id: "inversion", hand: "right", notes: [[60,64,67],[64,67,72],[67,72,76]], bpm: 120, ioiBeats: 1, shape: "inversion", chords: Array.from({length:3},()=>({root:0,quality:"maj",tensions:[],label:"C"})) },
  { id: "loop-boundary", hand: "left", notes: [[43],[50],[48]], bpm: 120, ioiBeats: 1, shape: "wrap" },
];
const savedCase: Case = { id: "anchor", hand: "left", notes: [[48],[50],[52]], bpm: 120, ioiBeats: 0.25, shape: "anchor" };
const savedEvent = inputs(savedCase)[1]!;
const savedGroup = generateFingeringCandidates(savedEvent);
if (savedGroup.status !== "supported") throw Error("Saved control fixture has no candidates");
const savedCurrent = measure(savedCase, "CURRENT");
const savedFingers = savedGroup.candidates.find(c => c.fingers.join() !== savedCurrent.selected[1]!.join())!.fingers;
const savedAnchor = new Map([[savedEvent.id, { signature: savedGroup.signature, fingers: savedFingers }]]);
function summarize(name: string, arm: Arm) {
  const rows = name === "CURRENT" ? baseline : dev.map(c => measure(c, arm));
  const stats = aggregate(rows);
  if (arm !== "CURRENT") {
    const prior = archive.sweep.find(s => s.policy.curve === "inverse" && s.policy.lambda === arm.lambda);
    if (!prior || JSON.stringify(stats) !== JSON.stringify(prior.stats)) throw Error(`Prior dev sweep mismatch: ${name}`);
  }
  const casewise = rows.reduce((counts, row, i) => {
    const difference = row.reassigned - baseline[i]!.reassigned;
    counts[difference < 0 ? "improved" : difference > 0 ? "regressed" : "equal"]++;
    if (difference > 0) counts.added += difference;
    if (difference < 0) counts.removed -= difference;
    return counts;
  }, { improved: 0, regressed: 0, equal: 0, added: 0, removed: 0 });
  const families = [...new Set(dev.map(c => c.shape))].map(shape => {
    const selected = rows.filter((_, i) => dev[i]!.shape === shape);
    const current = baseline.filter((_, i) => dev[i]!.shape === shape);
    return { shape, cases: selected.length, current: aggregate(current), experimental: aggregate(selected),
      regressions: rows.filter((r,i) => dev[i]!.shape === shape && r.reassigned > baseline[i]!.reassigned).length };
  });
  const anchorRows = dev.map(c => {
    const anchors = new Map(inputs(c).flatMap(e => {
      const group = generateFingeringCandidates(e);
      return group.status === "supported" ? [[e.id, { signature: group.signature, fingers: group.candidates[group.candidates.length-1]!.fingers }] as const] : [];
    }));
    return measure(c, arm, anchors);
  });
  const single = [0.125, 0.5, 2].map(seconds => {
    const counts: Record<string, number> = {};
    rows.filter((r,i) => dev[i]!.hand === "left" && r.ioiSeconds === seconds)
      .forEach(r => r.selected.filter(f => f.length === 1).forEach(f => { counts[f[0]!] = (counts[f[0]!] ?? 0) + 1; }));
    return { seconds, counts };
  });
  const before = measure(savedCase, arm);
  const during = measure(savedCase, arm, savedAnchor);
  const saved = { fingers: savedFingers, before, during, changedNeighbors: [0,2].filter(i => before.selected[i]!.join() !== during.selected[i]!.join()).length };
  return { name, policy: arm, stats, casewise, families,
    preferredDistance: rows.reduce((sum,r) => sum + r.preferred, 0),
    changedEvents: rows.reduce((sum,r,i) => sum + r.selected.filter((f,j) => f.join() !== baseline[i]!.selected[j]!.join()).length, 0),
    anchors: aggregate(anchorRows), time: matchedTime(arm), context: contextSensitivity(arm), single,
    saved, representative: representative.map(c => measure(c, arm)),
    switching: arm === "CURRENT" ? null : switchingDiagnostic(arm), runtime: runtime(arm) };
}
const arms = [summarize("CURRENT", "CURRENT"), ...[0.5,1,2,4].map(lambda => summarize(`lambda=${lambda}`, { variant: "E1-T", curve: "inverse", lambda }))];
if (sha(readFileSync(".local-evaluation/p11-13/comparison.json")) !== sha(archiveBytes)
  || sha(readFileSync(".local-evaluation/p11-13/frozen-policy.json")) !== sha(frozenBytes)) throw Error("Original frozen artifacts changed");
const files = ["src/domain/progressionFingering.ts", "src/domain/handPositionFingering.ts", "scripts/p11-12/fixtures.ts", "scripts/p11-13/comparisonMetrics.ts", "scripts/p11-13/lambdaComparison.ts", "scripts/p11-13/LAMBDA-FOLLOWUP-CONTRACT.md"];
const output = { schemaVersion: 1, corpusId: "p11-13-public-synthetic-v1", corpusVersion: 1, split: "dev-only",
  manifestSHA: sha(JSON.stringify(dev)), codeCommit: execFileSync("git", ["rev-parse","HEAD"], {encoding:"utf8"}).trim(),
  scoringContract: "p11-13-properties-v1", identitySource: "authored-or-absent-fixed", boundarySource: "authored-onsets",
  snapshotSource: "public-authored-notes", handSource: "fixed-input-hand", candidateGenerator: "unchanged-product-generator",
  priorCommit: archive.codeCommit, priorArtifactSHA: sha(archiveBytes), originalFrozenPolicySHA: sha(frozenBytes),
  sourceManifest: files.map(file => ({file,sha256:sha(readFileSync(file))})), arms };
writeFileSync(`${directory}/comparison.json`, JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify({ codeCommit: output.codeCommit, split: output.split, manifestSHA: output.manifestSHA,
  arms: arms.map(a => ({name:a.name,stats:a.stats,casewise:a.casewise,preferred:a.preferredDistance,changed:a.changedEvents,
    anchorRetained:a.anchors.anchorRetained,anchorTotal:a.anchors.anchorTotal,timeChanges:a.time.changes,context:a.context,runtime:a.runtime})) }));
