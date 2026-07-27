import { readFile, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";

type Condition = "A" | "B" | "C" | "D";
type FirstLossStage =
  | "boundary-derived"
  | "role-derived"
  | "note-selection"
  | "representation-type"
  | "register"
  | "fallback-policy"
  | "stale-policy"
  | "product-policy"
  | "pass";

type FailureCluster =
  | "melody-contamination"
  | "same-track-melody-contamination"
  | "passing-tone-contamination"
  | "sustain-carry"
  | "anticipated-next-chord-contamination"
  | "voice-duplicate"
  | "bass-missing"
  | "bass-over-inclusion"
  | "top-note-missing"
  | "octave-register-error"
  | "simultaneous-frame-wrong"
  | "aggregated-misclassified"
  | "arpeggio-under-collection"
  | "duplicate-across-tracks"
  | "common-tone-hold"
  | "nc-contamination"
  | "fallback-despite-usable-source";

interface EvaluationRow {
  condition: Condition;
  fileId: string;
  scenarioId: string;
  scenarioTitleJa: string;
  variant: "clean" | "stress";
  eventId: string;
  representationType: "simultaneous" | "aggregated" | "hybrid" | "none";
  policy: string;
  goldNotes: number[];
  predictedNotes: number[];
  status: "usable" | "review" | "not-found";
  exact: boolean;
  extraNoteCount: number;
  missingNoteCount: number;
  registerExact: boolean;
  octaveError: boolean;
  representationAccurate: boolean;
  aggregatedAsSimultaneous: boolean;
  melodyLeakCount: number;
  passingToneLeakCount: number;
  sustainCarryLeakCount: number;
  voiceDuplicateLeakCount: number;
  staleAfterEditCorrect?: boolean;
}

interface DetailsFile {
  schemaVersion: number;
  split: string;
  rows: EvaluationRow[];
}

interface ClassifiedEvent {
  key: string;
  fileId: string;
  scenarioId: string;
  scenarioTitleJa: string;
  variant: "clean" | "stress";
  eventId: string;
  firstLossStage: FirstLossStage;
  clusters: FailureCluster[];
  correctionSeverity: number;
  A: Pick<EvaluationRow, "exact" | "status" | "extraNoteCount" | "missingNoteCount">;
  B: Pick<EvaluationRow, "exact" | "status" | "extraNoteCount" | "missingNoteCount">;
  C: Pick<EvaluationRow, "exact" | "status" | "extraNoteCount" | "missingNoteCount">;
  D: Pick<EvaluationRow, "exact" | "status" | "extraNoteCount" | "missingNoteCount">;
}

const devPath = resolve(cwd(), option("--dev")
  ?? ".local-evaluation/phase4.3/ablation-dev-events.json");
const validationPath = option("--validation")
  ? resolve(cwd(), option("--validation")!)
  : undefined;
const output = resolve(cwd(), option("--output")
  ?? "docs/phase4.3/06-voicing-failure-taxonomy.json");
const detailsOutput = resolve(cwd(), option("--details")
  ?? ".local-evaluation/phase4.3/failure-taxonomy-dev-events.json");
const dev = JSON.parse(await readFile(devPath, "utf8")) as DetailsFile;
const validation = validationPath
  ? JSON.parse(await readFile(validationPath, "utf8")) as DetailsFile
  : undefined;

const devEvents = classify(dev.rows);
const validationEvents = validation ? classify(validation.rows) : [];
const devClusters = summarizeClusters(devEvents);
const validationCounts = countClusters(validationEvents);
const rankedClusters = devClusters.map((cluster) => {
  const validationCount = validationCounts.get(cluster.cluster) ?? 0;
  const validationReproducibility = validation
    ? (validationCount > 0 ? 1 : 0.5)
    : null;
  return {
    ...cluster,
    validationEventCount: validation ? validationCount : null,
    validationReproducibility,
    priorityScore: validationReproducibility === null
      ? null
      : rounded(
          cluster.affectedEventCount
          * cluster.meanCorrectionSeverity
          * productImpact(cluster.cluster)
          * validationReproducibility,
        ),
  };
}).sort((left, right) =>
  (right.priorityScore ?? right.affectedEventCount)
    - (left.priorityScore ?? left.affectedEventCount)
  || left.cluster.localeCompare(right.cluster));

const report = {
  schemaVersion: 1,
  rulesVersion: "p43-failure-taxonomy-v1",
  dev: {
    eventCount: devEvents.length,
    firstLossStageCounts: countBy(devEvents.map((event) => event.firstLossStage)),
  },
  validation: validation
    ? {
        eventCount: validationEvents.length,
        firstLossStageCounts: countBy(validationEvents.map((event) => event.firstLossStage)),
      }
    : { status: "not-evaluated" },
  rankedClusters,
  maximumFailureCluster: rankedClusters[0]?.cluster ?? null,
};

await mkdir(dirname(detailsOutput), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(detailsOutput, `${JSON.stringify({
  schemaVersion: 1,
  rulesVersion: report.rulesVersion,
  events: devEvents,
}, null, 2)}\n`, "utf8");
stdout.write(`${JSON.stringify({
  dev: report.dev,
  validation: report.validation,
  rankedClusters: rankedClusters.slice(0, 10),
  maximumFailureCluster: report.maximumFailureCluster,
}, null, 2)}\n`);

function classify(rows: readonly EvaluationRow[]): ClassifiedEvent[] {
  const source = rows.filter((row) => row.policy === "sourceFaithfulMidi");
  const groups = new Map<string, Map<Condition, EvaluationRow>>();
  for (const row of source) {
    const key = `${row.fileId}/${row.eventId}`;
    const conditions = groups.get(key) ?? new Map<Condition, EvaluationRow>();
    conditions.set(row.condition, row);
    groups.set(key, conditions);
  }
  return [...groups.entries()].flatMap(([key, conditions]) => {
    const A = conditions.get("A");
    const B = conditions.get("B");
    const C = conditions.get("C");
    const D = conditions.get("D");
    if (!A || !B || !C || !D) return [];
    return [{
      key,
      fileId: A.fileId,
      scenarioId: A.scenarioId,
      scenarioTitleJa: A.scenarioTitleJa,
      variant: A.variant,
      eventId: A.eventId,
      firstLossStage: firstLoss(A, B, C, D),
      clusters: failureClusters(A, B, C, D),
      correctionSeverity: correctionSeverity(D),
      A: snapshot(A),
      B: snapshot(B),
      C: snapshot(C),
      D: snapshot(D),
    }];
  }).sort((left, right) => left.key.localeCompare(right.key));
}

function firstLoss(
  A: EvaluationRow,
  B: EvaluationRow,
  C: EvaluationRow,
  D: EvaluationRow,
): FirstLossStage {
  if (!A.representationAccurate) return "representation-type";
  if (!A.exact) {
    if (!A.registerExact && A.extraNoteCount === 0 && A.missingNoteCount === 0) return "register";
    return "note-selection";
  }
  if (A.status !== "usable") return "fallback-policy";
  if (A.staleAfterEditCorrect === false) return "stale-policy";
  if (!B.exact || (B.status !== "usable" && A.status === "usable")) return "role-derived";
  if (!C.exact || (C.status !== "usable" && A.status === "usable")) return "boundary-derived";
  if (!D.exact || D.status !== "usable") return "product-policy";
  return "pass";
}

function failureClusters(
  A: EvaluationRow,
  B: EvaluationRow,
  C: EvaluationRow,
  D: EvaluationRow,
): FailureCluster[] {
  const clusters = new Set<FailureCluster>();
  if (D.melodyLeakCount > 0) clusters.add("melody-contamination");
  if (D.scenarioId === "V13" && D.extraNoteCount > 0) clusters.add("same-track-melody-contamination");
  if (D.passingToneLeakCount > 0) clusters.add("passing-tone-contamination");
  if (D.scenarioId === "V15" && D.extraNoteCount > 0) clusters.add("sustain-carry");
  if (D.scenarioId === "V16" && D.extraNoteCount > 0) {
    clusters.add("anticipated-next-chord-contamination");
  }
  if (D.voiceDuplicateLeakCount > 0 || (D.scenarioId === "V23" && D.extraNoteCount > 0)) {
    clusters.add("voice-duplicate");
  }
  if (bassMissing(D)) clusters.add("bass-missing");
  if (bassOverIncluded(D)) clusters.add("bass-over-inclusion");
  if (topMissing(D)) clusters.add("top-note-missing");
  if (D.octaveError) clusters.add("octave-register-error");
  if ((D.representationType === "simultaneous" || D.representationType === "hybrid") && !D.exact) {
    clusters.add("simultaneous-frame-wrong");
  }
  if (D.aggregatedAsSimultaneous) clusters.add("aggregated-misclassified");
  if (D.representationType === "aggregated" && D.missingNoteCount > 0) {
    clusters.add("arpeggio-under-collection");
  }
  if (D.scenarioId === "V11" && !D.exact) clusters.add("duplicate-across-tracks");
  if (D.scenarioId === "V26" && !D.exact) clusters.add("common-tone-hold");
  if (D.scenarioId === "V27" && !D.exact) clusters.add("nc-contamination");
  if (D.exact && D.status !== "usable") clusters.add("fallback-despite-usable-source");
  if (!A.exact && C.exact && D.exact) clusters.delete("simultaneous-frame-wrong");
  return [...clusters].sort();
}

function bassMissing(row: EvaluationRow): boolean {
  if (row.goldNotes.length === 0) return false;
  return !row.predictedNotes.includes(Math.min(...row.goldNotes));
}

function bassOverIncluded(row: EvaluationRow): boolean {
  if (row.goldNotes.length === 0 || row.predictedNotes.length === 0) return false;
  return Math.min(...row.predictedNotes) < Math.min(...row.goldNotes);
}

function topMissing(row: EvaluationRow): boolean {
  if (row.goldNotes.length === 0) return false;
  return !row.predictedNotes.includes(Math.max(...row.goldNotes));
}

function correctionSeverity(row: EvaluationRow): number {
  return rounded(1 + row.missingNoteCount * 1.5 + row.extraNoteCount
    + (row.status === "usable" ? 0 : 1.5)
    + (row.representationAccurate ? 0 : 2));
}

function summarizeClusters(events: readonly ClassifiedEvent[]) {
  const clusters = new Map<FailureCluster, ClassifiedEvent[]>();
  for (const event of events) {
    for (const cluster of event.clusters) {
      const affected = clusters.get(cluster) ?? [];
      affected.push(event);
      clusters.set(cluster, affected);
    }
  }
  return [...clusters.entries()].map(([cluster, affected]) => ({
    cluster,
    affectedEventCount: affected.length,
    affectedFileCount: new Set(affected.map((event) => event.fileId)).size,
    cleanEventCount: affected.filter((event) => event.variant === "clean").length,
    stressEventCount: affected.filter((event) => event.variant === "stress").length,
    meanCorrectionSeverity: rounded(
      affected.reduce((sum, event) => sum + event.correctionSeverity, 0) / affected.length,
    ),
    productImpact: productImpact(cluster),
    examples: affected.slice(0, 5).map((event) => event.key),
  }));
}

function countClusters(events: readonly ClassifiedEvent[]): Map<FailureCluster, number> {
  const result = new Map<FailureCluster, number>();
  for (const event of events) {
    for (const cluster of event.clusters) result.set(cluster, (result.get(cluster) ?? 0) + 1);
  }
  return result;
}

function productImpact(cluster: FailureCluster): number {
  if (cluster === "aggregated-misclassified" || cluster === "arpeggio-under-collection") return 3;
  if (cluster === "fallback-despite-usable-source") return 2.5;
  if (cluster === "bass-missing" || cluster === "top-note-missing") return 2.25;
  if (cluster === "nc-contamination") return 2.5;
  return 2;
}

function snapshot(row: EvaluationRow) {
  return {
    exact: row.exact,
    status: row.status,
    extraNoteCount: row.extraNoteCount,
    missingNoteCount: row.missingNoteCount,
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function option(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
