import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateFingeringCandidates } from "../../src/domain/progressionFingering";
import { handPositionCostModel } from "../../src/domain/handPositionFingering";
import type { ProgressionVoicingPracticeSnapshot } from "../../src/domain/progressionVoicingPractice";
import { rankPracticeHandFingerings } from "../../src/voicingPractice/rankPracticeFingerings";
import { largeCases, type Case } from "../p11-12/fixtures";
import { COMMON_TONE_BASE, commonToneCostModel } from "./commonTone";
import { aggregate, inputs, measure, runtime, solveArm, type ComparableArm } from "./comparisonMetrics";

if (!process.argv.includes("--execute-frozen")) throw Error("Explicit --execute-frozen required; reserved run is one-shot");
const directory = ".local-evaluation/p11-13/reserved-final";
mkdirSync(directory, { recursive: true });
if (existsSync(`${directory}/started.json`) || existsSync(`${directory}/comparison.json`)) throw Error("Reserved confirmation already started; never rerun");
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const devFile = ".local-evaluation/p11-13/common-tone/comparison.json";
const devBytes = readFileSync(devFile);
type Stats = ReturnType<typeof aggregate>;
type ArchivedArm = { name: string; stats: Stats; retained: number; casewise: ReturnType<typeof casewise>; families: { shape: string; cases: number; result: Stats; regressionCases: number }[]; time: { changes: number; direction: boolean }; context: { changed: number; total: number }; anchors: Stats };
const dev = JSON.parse(devBytes.toString("utf8")) as { selectedGamma: number; decision: string; provenance: { manifestSHA: string; codeCommit: string; sourceManifest: { file: string; sha256: string }[] }; results: ArchivedArm[] };
if (dev.selectedGamma !== 1 || dev.decision !== "COMMON_TONE_USEFUL") throw Error("Dev freeze mismatch");
for (const s of dev.provenance.sourceManifest) if (sha(readFileSync(s.file)) !== s.sha256) throw Error(`Frozen source changed: ${s.file}`);
const oldFile = ".local-evaluation/p11-13/comparison.json";
const oldBytes = readFileSync(oldFile);
const prior = JSON.parse(oldBytes.toString("utf8")) as { codeCommit: string; policy: unknown; results: { evaluation?: { cases: number } }[] };
const reserved = largeCases().filter(c => {
  const offset = Number(c.id.match(/-(\d+)-ioi/)?.[1]); return offset >= 6 && offset <= 11;
});
if (reserved.length !== 1080 || new Set(reserved.map(c => c.id)).size !== 1080) throw Error("Reserved manifest mismatch");
const families = ["white", "black", "cluster", "wide", "inversion", "open"];
const first = (shape: string, hand?: string) => {
  const c = reserved.filter(c => c.shape === shape && c.notes[0]!.length >= 2 && (!hand || c.hand === hand))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)[0];
  if (!c) throw Error("Representative fixture missing"); return c;
};
const representatives = [...families.map(f => first(f)), ...["cluster", "inversion", "open"].map(f => first(f, "right"))];
const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const sourceFiles = [...dev.provenance.sourceManifest.map(v => v.file), "scripts/p11-13/reservedEvaluation.ts", "scripts/p11-13/RESERVED-EVALUATION-CONTRACT.md"];
const provenance = {
  corpusId: "p11-13-public-synthetic-v1", corpusVersion: 1, split: "reserved-offsets6..11",
  manifestSHA: sha(JSON.stringify(reserved)), codeCommit: head, scoringContract: "p11-13-properties-v1", metricVersion: "common-tone-followup-v1",
  policyId: "e1t-inverse-lambda2-common-tone-gamma1-v1", boundarySource: "authored-onsets", identitySource: "authored-or-absent-fixed",
  snapshotSource: "public-authored-notes", handSource: "fixed-input-hand",
  dev: { file: devFile, sha256: sha(devBytes), manifestSHA: dev.provenance.manifestSHA, codeCommit: dev.provenance.codeCommit },
  priorReservedExposure: { codeCommit: prior.codeCommit, policy: prior.policy, reservedCases: prior.results[0]?.evaluation?.cases ?? 0, artifactSHA: sha(oldBytes) },
  sourceManifest: sourceFiles.map(file => ({ file, sha256: sha(readFileSync(file)) })),
};
writeFileSync(`${directory}/started.json`, JSON.stringify({ provenance, representativeIds: representatives.map(c => c.id), status: "STARTED_DO_NOT_RERUN" }, null, 2), { flag: "wx" });

function casewise(rows: ReturnType<typeof measure>[], baseline: ReturnType<typeof measure>[]) {
  return rows.reduce((v, r, i) => {
    const delta = r.reassigned - baseline[i]!.reassigned;
    v[delta < 0 ? "improved" : delta > 0 ? "regressed" : "equal"]++;
    if (delta > 0) v.added += delta; if (delta < 0) v.removed -= delta;
    return v;
  }, { improved: 0, regressed: 0, equal: 0, added: 0, removed: 0 });
}
function timeControls(arm: ComparableArm) {
  const probes = (["left", "right"] as const).flatMap(hand => {
    const base = hand === "left" ? 42 : 66;
    const single: Case = { id: `${hand}-reserved-single`, hand, notes: [0, 2, 4, 5].map(v => [base + v]), bpm: 120, ioiBeats: 1, shape: "single-time" };
    return [{ c: single, seconds: [0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16] },
      ...["cluster", "open", "inversion"].map(shape => ({ c: reserved.find(c => c.id === `${hand}-2-${shape}-6-ioi1`)!, seconds: [0.125, 0.25, 0.5, 1, 2, 4] }))];
  });
  return probes.map(({ c, seconds }) => {
    const rows = seconds.map(s => measure({ ...c, ioiBeats: s * c.bpm / 60 }, arm));
    return { id: c.id, rows, changes: rows.slice(1).filter((r, i) => JSON.stringify(r.selected) !== JSON.stringify(rows[i]!.selected)).length,
      direction: rows.slice(1).every((r, i) => r.preferred <= rows[i]!.preferred + 1e-9 && r.movement >= rows[i]!.movement - 1e-9) };
  });
}
function context(arm: ComparableArm) {
  let changed = 0;
  for (const hand of ["left", "right"] as const) for (let step = 1; step <= 7; step++) {
    const base = hand === "left" ? 42 : 66;
    const c: Case = { id: `${hand}-reserved-context`, hand, notes: [[base], [base + 2], [base + 4]], bpm: 120, ioiBeats: 0.25, shape: "context" };
    const a = measure(c, arm), b = measure({ ...c, notes: [[base + step], [base + 2], [base + 4 - step]] }, arm);
    if (a.selected[1]!.join() !== b.selected[1]!.join()) changed++;
  }
  return { changed, total: 14 };
}
function rangeControls(arm: ComparableArm) {
  return representatives.map(c => {
    const snapshot: ProgressionVoicingPracticeSnapshot = {
      version: 1, fingerprint: c.id, source: { kind: "vault", reference: { ideaId: "public-reserved", blockId: c.id } },
      selection: "source-midi", bpm: c.bpm, meter: { numerator: 4, denominator: 4 }, lengthBeats: c.notes.length * c.ioiBeats,
      events: c.notes.map((notes, i) => ({ id: `${c.id}-${i}`, startBeat: i * c.ioiBeats, durationBeats: c.ioiBeats,
        chord: { root: 0, quality: "maj", tensions: [], label: "C" }, voicing: { kind: "source-midi", midiNotes: notes } })),
      spans: c.notes.map((_, i) => ({ kind: "chord", eventIndex: i, startBeat: i * c.ioiBeats, durationBeats: c.ioiBeats })),
    };
    const hands = c.notes.map(notes => ({ left: c.hand === "left" ? notes : [], right: c.hand === "right" ? notes : [] }));
    const options = arm === "CURRENT" ? {} : { costModel: "costModel" in arm ? arm.costModel : handPositionCostModel(arm) };
    const before = JSON.stringify({ snapshot, hands });
    const solve = (range?: { start: number; end: number }) => rankPracticeHandFingerings({ ...snapshot, ...(range ? { range } : {}) }, hands, "source-midi", c.hand, undefined, options);
    const result = solve();
    return { id: c.id, invariant: [ { start: 0, end: 0 }, { start: 1, end: c.notes.length - 1 } ].every(range => JSON.stringify(solve(range)) === JSON.stringify(result)),
      immutable: before === JSON.stringify({ snapshot, hands }) };
  });
}
const arms: [string, ComparableArm][] = [["CURRENT", "CURRENT"], ["E1-T", COMMON_TONE_BASE], ["CT=1", { costModel: commonToneCostModel(1) }]];
const anchorMaps = reserved.map(c => new Map(inputs(c).flatMap(e => {
  const g = generateFingeringCandidates(e); return g.status === "supported" ? [[e.id, { signature: g.signature, fingers: g.candidates[g.candidates.length - 1]!.fingers }] as const] : [];
})));
const raw = arms.map(([name, arm]) => {
  console.log(`Reserved arm ${name} started`);
  const rows = reserved.map(c => measure(c, arm));
  const handsUnchanged = reserved.filter(c => {
    const events = inputs(c), before = JSON.stringify(events);
    const result = solveArm(events, arm, { loopDurationSeconds: c.notes.length * c.ioiBeats * 60 / c.bpm });
    return before === JSON.stringify(events) && result.every(r => r.status === "supported" && r.signature.startsWith(c.hand === "left" ? "L:" : "R:") && events.every(e => e.hand === c.hand));
  }).length;
  return { name, rows, stats: aggregate(rows), handsUnchanged,
    anchors: aggregate(reserved.map((c, i) => measure(c, arm, anchorMaps[i]))),
    time: timeControls(arm), context: context(arm), range: rangeControls(arm),
    representative: representatives.map(c => measure(c, arm)), runtime: runtime(arm) };
});
const current = raw[0]!, plain = raw[1]!;
const results = raw.map(r => ({ ...r, retained: r.stats.common - r.stats.reassigned,
  casewise: casewise(r.rows, current.rows),
  selectedChangedEvents: { vsCurrent: r.rows.reduce((n, row, i) => n + row.selected.filter((f, e) => f.join() !== current.rows[i]!.selected[e]!.join()).length, 0),
    vsLambda2: r.rows.reduce((n, row, i) => n + row.selected.filter((f, e) => f.join() !== plain.rows[i]!.selected[e]!.join()).length, 0) },
  families: families.map(shape => {
    const indexes = reserved.flatMap((c, i) => c.shape === shape ? [i] : []);
    const rows = indexes.map(i => r.rows[i]!); const base = indexes.map(i => current.rows[i]!);
    return { shape, stats: aggregate(rows), casewise: casewise(rows, base), newRegressionCases: indexes.filter(i => plain.rows[i]!.reassigned <= current.rows[i]!.reassigned && r.rows[i]!.reassigned > current.rows[i]!.reassigned).length };
  }) }));
const selected = results[2]!, baseline = results[1]!;
const structural = results.every(r => r.stats.candidateEmpty === 0 && r.stats.solverFailure === 0 && r.stats.structuralFailure === 0
  && r.stats.deterministic === reserved.length && r.stats.notesUnchanged === reserved.length && r.stats.candidatesUnchanged === reserved.length && r.handsUnchanged === reserved.length
  && r.anchors.anchorTotal === r.stats.events && r.anchors.anchorRetained === r.anchors.anchorTotal && r.anchors.solverFailure === 0 && r.anchors.structuralFailure === 0
  && r.stats.repeatedChanged === 0 && r.range.every(v => v.invariant && v.immutable));
const time = selected.time.every((v, i) => v.direction && (baseline.time[i]!.changes === 0 || v.changes > 0));
const familyChecks = selected.families.map((f, i) => ({ shape: f.shape, newRegressionCases: f.newRegressionCases,
  extraReassignments: f.stats.reassigned - baseline.families[i]!.stats.reassigned,
  pass: f.newRegressionCases < Math.max(3, Math.ceil(f.stats.cases * 0.05)) && f.stats.reassigned - baseline.families[i]!.stats.reassigned <= Math.max(2, Math.ceil(f.stats.common * 0.05)) }));
const runtimePass = !((selected.runtime.medianMs! >= baseline.runtime.medianMs! * 2 && selected.runtime.medianMs! - baseline.runtime.medianMs! >= 50)
  || (selected.runtime.p95Ms! >= baseline.runtime.p95Ms! * 2 && selected.runtime.p95Ms! - baseline.runtime.p95Ms! >= 100));
const checks = { structural, time, context: selected.context.changed > 0,
  commonTone: selected.stats.reassigned <= baseline.stats.reassigned && selected.casewise.regressed <= baseline.casewise.regressed,
  families: familyChecks.every(f => f.pass), runtime: runtimePass };
if (sha(readFileSync(devFile)) !== sha(devBytes) || sha(readFileSync(oldFile)) !== sha(oldBytes)) throw Error("Archive mutated");
const summary = { schemaVersion: 1, provenance, checks, familyChecks,
  verdict: Object.values(checks).every(Boolean) ? "HOLDOUT_CONFIRMED" : "HOLDOUT_NOT_CONFIRMED",
  absentReservedFamilies: ["1-to-2", "2-to-1", "3-to-1"],
  archivedDev: dev.results.filter(r => ["CURRENT", "E1-T", "CT=1"].includes(r.name)),
  results: results.map(r => ({ ...r, rows: undefined })) };
writeFileSync(`${directory}/comparison.json`, JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
writeFileSync(`${directory}/cases.json`, JSON.stringify({ provenance, cases: reserved.map((c, i) => ({ case: c, arms: raw.map(r => ({ name: r.name, ...r.rows[i] })) })) }, null, 2) + "\n", { flag: "wx" });
writeFileSync(`${directory}/finished.json`, JSON.stringify({ codeCommit: head, verdict: summary.verdict, status: "FINISHED_DO_NOT_RERUN" }, null, 2), { flag: "wx" });
console.log(JSON.stringify({ verdict: summary.verdict, checks, arms: results.map(r => ({ name: r.name, stats: r.stats, retained: r.retained, casewise: r.casewise, selectedChangedEvents: r.selectedChangedEvents, runtime: r.runtime })) }));
