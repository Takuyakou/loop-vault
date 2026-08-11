import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { parseMidi } from "../../src/domain/midi/parser";
import {
  classifyNoteTextureFeatureSet,
  p5211NoteTextureClassifierVersion,
} from "../../src/domain/midi/noteTextureClassifier";
import {
  extractNoteTextureFeatures,
  type NoteTextureInput,
} from "../../src/domain/midi/noteTextureFeatures";
import { voiceId } from "../../src/domain/midi/voices";
import { parseLocalRegistry } from "./auditMixedVoiceBaseline";
import {
  evaluateP5211NoteRolePredictions,
  generateP5211DenseBenchmarkFixture,
  generateP5211SyntheticNoteRoleFixtures,
  type P5211NoteRole,
} from "./noteRoleFixtures";
import {
  decideP5211ShadowPromotion,
  type P5211OfficialChordSafetyMetrics,
} from "./promotionContract";

const officialBaseline: P5211OfficialChordSafetyMetrics = {
  rootAtOne: 0.581897,
  qualityAtOne: 0.610453,
  exactAtOne: 0.136853,
  boundaryPrecision: 0.765475,
  boundaryRecall: 0.900864,
};

async function main(): Promise<void> {
  const codeCandidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const fixtures = generateP5211SyntheticNoteRoleFixtures();
  const classifyFixtures = (): Record<string, P5211NoteRole> => Object.fromEntries(fixtures.flatMap((fixture) => {
    const features = extractNoteTextureFeatures(fixture.notes.map((note) => ({
      id: note.id,
      pitch: note.pitch,
      startBeat: note.startBeat,
      endBeat: note.startBeat + note.durationBeats,
    })));
    return classifyNoteTextureFeatureSet(features).map((entry) => [entry.noteId, entry.candidateClass]);
  }));
  const firstPredictions = classifyFixtures();
  const deterministic = JSON.stringify(firstPredictions) === JSON.stringify(classifyFixtures());
  const metrics = evaluateP5211NoteRolePredictions(fixtures, firstPredictions);
  const official = await officialMetricsForCurrentCandidate(codeCandidateCommit);
  const benchmark = await benchmarkShadow();
  const productionImportCount = await countProductionClassifierImports(resolve("src"));
  const promotion = decideP5211ShadowPromotion({
    noteMetrics: metrics,
    deterministic,
    officialBaseline,
    officialCandidate: official,
    benchmark,
    productionOutputsUnchanged: productionImportCount === 0,
  });
  const classCounts = Object.values(firstPredictions).reduce<Record<P5211NoteRole, number>>((counts, role) => {
    counts[role] += 1;
    return counts;
  }, { harmonic: 0, "melody-like": 0, uncertain: 0 });
  const artifact = {
    schemaVersion: 1,
    kind: "p5211-stage02-note-texture-shadow-evaluation",
    codeCandidateCommit,
    classifierVersion: p5211NoteTextureClassifierVersion,
    deterministic,
    productionImportCount,
    fixtureCount: fixtures.length,
    classCounts,
    metrics,
    official,
    benchmark,
    promotion,
    privacy: { rawNotesPersisted: false, sourcePathPersisted: false, sourceTitlePersisted: false },
  } as const;
  if (promotion.status !== "pass-to-integration") throw new Error("shadow promotion gate failed");
  const output = resolve(".local-evaluation/p5211/shadow/stage02-evaluation.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(output.replace(/\.json$/u, ".md"), renderMarkdown(artifact), "utf8");
  process.stdout.write(`P5.21.1 Stage02 shadow: decision=${promotion.status}; fixtures=${fixtures.length}; deterministic=${deterministic}; output=ignored-local.\n`);
}

async function benchmarkShadow(): Promise<{ medianRatio: number; maximumSampleMs: number; timedOut: boolean }> {

  const synthetic = generateP5211DenseBenchmarkFixture(64).map((note) => ({
    id: note.id,
    pitch: note.pitch,
    startBeat: note.startBeat,
    endBeat: note.startBeat + note.durationBeats,
  }));
  const real = await anonymousRealVoices();
  const syntheticBaseline = measure(() => extractNoteTextureFeatures(synthetic));
  const realBaseline = measure(() => real.flatMap((notes) => [...extractNoteTextureFeatures(notes)]));
  const syntheticTiming = measure(() => classifyNoteTextureFeatureSet(extractNoteTextureFeatures(synthetic)));
  const realTiming = measure(() => real.flatMap((notes) => [
    ...classifyNoteTextureFeatureSet(extractNoteTextureFeatures(notes)),
  ]));
  const maximumSampleMs = Math.max(syntheticTiming.maximumMs, realTiming.maximumMs);
  return {
    medianRatio: Number(Math.max(
      syntheticTiming.medianMs / syntheticBaseline.medianMs,
      realTiming.medianMs / realBaseline.medianMs,
    ).toFixed(6)),
    maximumSampleMs,
    timedOut: maximumSampleMs > 2_000,
  };
}

async function anonymousRealVoices(): Promise<readonly (readonly NoteTextureInput[])[]> {
  const registryPath = resolve(".local-evaluation/p5211/registry.json");
  const registry = parseLocalRegistry(JSON.parse(await readFile(registryPath, "utf8")));
  const entry = registry.fixtures[0];
  const bytes = new Uint8Array(await readFile(resolve(dirname(registryPath), entry.relativePath)));
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("local fixture integrity failed");
  const grouped = new Map<string, NoteTextureInput[]>();
  for (const [index, note] of normalizeNotes(parseMidi(bytes)).entries()) {
    if (note.channel === undefined || note.channel === 9) continue;
    const id = voiceId(note.trackIndex, note.channel);
    grouped.set(id, [...(grouped.get(id) ?? []), {
      id: `local-${index}`,
      pitch: note.pitch,
      startBeat: note.startBeat,
      endBeat: note.sustainedEndBeat,
    }]);
  }
  return [...grouped.values()];
}

async function officialMetricsForCurrentCandidate(commit: string): Promise<P5211OfficialChordSafetyMetrics> {
  const value = JSON.parse(await readFile(resolve(
    ".local-evaluation/p521-role-v2-shadow/official-safety-stage02/attestation.json",
  ), "utf8")) as {
    codeCandidateCommit?: unknown;
    report?: { fullCleanCaseCount?: unknown; fullDirtyCaseCount?: unknown };
    official?: { deterministic?: unknown; metrics?: Record<string, unknown> };
  };
  const metrics = value.official?.metrics;
  if (value.codeCandidateCommit !== commit
    || value.report?.fullCleanCaseCount !== 100
    || value.report?.fullDirtyCaseCount !== 1_100
    || value.official?.deterministic !== true
    || !metrics) {
    throw new Error("official attestation is stale or invalid");
  }
  const result = {
    rootAtOne: metrics.rootAt1,
    qualityAtOne: metrics.qualityAt1,
    exactAtOne: metrics.exactAt1,
    boundaryPrecision: metrics.boundaryPrecision,
    boundaryRecall: metrics.boundaryRecall,
  };
  if (!Object.values(result).every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error("official metrics are invalid");
  }
  return result as P5211OfficialChordSafetyMetrics;
}

async function countProductionClassifierImports(root: string): Promise<number> {
  let count = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) count += await countProductionClassifierImports(path);
    else if ((extname(entry.name) === ".ts" || extname(entry.name) === ".tsx")
      && !entry.name.endsWith(".test.ts")
      && !entry.name.endsWith(".test.tsx")
      && entry.name !== "noteTextureClassifier.ts") {
      const source = await readFile(path, "utf8");
      if (source.includes("noteTextureClassifier")) count += 1;
    }
  }
  return count;
}

function measure(run: () => readonly unknown[]): { medianMs: number; maximumMs: number } {
  for (let index = 0; index < 3; index += 1) run();
  const samples = Array.from({ length: 7 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((left, right) => left - right);
  return { medianMs: samples[3] ?? 0, maximumMs: samples[6] ?? 0 };
}

function renderMarkdown(artifact: {
  codeCandidateCommit: string;
  deterministic: boolean;
  fixtureCount: number;
  metrics: ReturnType<typeof evaluateP5211NoteRolePredictions>;
  benchmark: { medianRatio: number; maximumSampleMs: number };
  promotion: { status: string };
}): string {
  return [
    "# P5.21.1 Stage02 Shadow Evaluation",
    "",
    `- Candidate: ${artifact.codeCandidateCommit}`,
    `- Fixtures: ${artifact.fixtureCount}`,
    `- Deterministic: ${artifact.deterministic}`,
    `- Protected retention: ${artifact.metrics.protectedHarmonicRetention}`,
    `- Melody precision/recall: ${artifact.metrics.melodyLikePrecision} / ${artifact.metrics.melodyLikeRecall}`,
    `- Harmonic retention: ${artifact.metrics.harmonicRetention}`,
    `- Uncertain non-suppression: ${artifact.metrics.uncertainNonSuppression}`,
    `- Benchmark median ratio/max ms: ${artifact.benchmark.medianRatio} / ${artifact.benchmark.maximumSampleMs}`,
    `- Decision: ${artifact.promotion.status}`,
    "- Raw notes, source paths, and source titles are omitted.",
    "",
  ].join("\n");
}

void main().catch(() => {
  process.stderr.write("P5.21.1 Stage02 shadow failed: evaluation input or promotion gate failed.\n");
  process.exitCode = 1;
});
