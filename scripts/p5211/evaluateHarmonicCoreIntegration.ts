import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { buildHarmonicCoreNoteWeights } from "../../src/domain/midi/harmonicCoreNoteWeights";
import { classifyNoteTextureFeatureSet } from "../../src/domain/midi/noteTextureClassifier";
import {
  extractNoteTextureFeatures,
  type NoteTextureInput,
} from "../../src/domain/midi/noteTextureFeatures";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { parseMidi } from "../../src/domain/midi/parser";
import {
  analyzeMidiVoiceAwareRerank,
  buildVoiceAwareRoleContext,
} from "../../src/domain/midi/voiceAwareReranker";
import { buildVoices, voiceId } from "../../src/domain/midi/voices";
import {
  auditP5211LocalHarmonicCoreBaseline,
  parseLocalRegistry,
  type P5211LocalHarmonicCoreBaseline,
} from "./auditMixedVoiceBaseline";
import { generateP5211DenseBenchmarkFixture } from "./noteRoleFixtures";

const stage00CodeCandidate = "506ce9bdec624c772fb33ede7d28fa5544ec8bcf";
const maximumMedianRatio = 2;
const maximumSampleMs = 2_000;

interface TimingSummary {
  readonly medianMs: number;
  readonly maximumMs: number;
}

export interface P5211Stage04Artifact {
  readonly schemaVersion: 1;
  readonly kind: "p5211-stage04-harmonic-core-regression";
  readonly codeCandidateCommit: string;
  readonly fixtureId: "p5211-real-001";
  readonly oldBaselineCandidate: typeof stage00CodeCandidate;
  readonly deterministic: boolean;
  readonly oldNew: {
    readonly outputChanged: boolean;
    readonly timelineEventDelta: number;
    readonly blockCandidateDelta: number;
    readonly topologyUnchanged: boolean;
  };
  readonly noteWeights: {
    readonly eligibleVoiceCount: number;
    readonly weightedNoteCount: number;
    readonly classCounts: Readonly<Record<"harmonic" | "melody-like" | "uncertain", number>>;
    readonly minimumMultiplier: number;
  };
  readonly performance: {
    readonly featureClassifierMedianRatio: number;
    readonly fullAnalysis: TimingSummary;
    readonly timedOut: boolean;
  };
  readonly resource: {
    readonly activeHandleMeasurementAvailable: boolean;
    readonly activeHandleDelta: number;
    readonly repeatedAnalysisCount: 20;
    readonly retainedAnalysisCount: 0;
    readonly heapDeltaBytes: number;
    readonly rssDeltaBytes: number;
  };
  readonly privacy: {
    readonly rawNotesPersisted: false;
    readonly sourcePathPersisted: false;
    readonly sourceTitlePersisted: false;
  };
}

export async function evaluateP5211HarmonicCoreIntegration(
  registryPath = resolve(".local-evaluation/p5211/registry.json"),
  oldBaselinePath = resolve(".local-evaluation/p5211/baseline/current-harmonic-core.json"),
  outputPath = resolve(".local-evaluation/p5211/stage04/harmonic-core-regression.json"),
): Promise<P5211Stage04Artifact> {
  const oldBaseline = parseOldBaseline(JSON.parse(await readFile(oldBaselinePath, "utf8")));
  const current = await auditP5211LocalHarmonicCoreBaseline(
    registryPath,
    resolve(dirname(outputPath), "current-harmonic-core.json"),
  );
  const registry = parseLocalRegistry(JSON.parse(await readFile(registryPath, "utf8")));
  const entry = registry.fixtures[0];
  const bytes = new Uint8Array(await readFile(resolve(dirname(registryPath), entry.relativePath)));
  if (sha256(bytes) !== entry.sha256 || bytes.byteLength !== entry.bytes) {
    throw new Error("local fixture integrity failed");
  }

  const data = parseMidi(bytes);
  const notes = normalizeNotes(data);
  const standardContext = buildVoiceAwareRoleContext(buildVoices(data), notes);
  const context = buildVoiceAwareRoleContext(buildVoices(data), notes, {
    ...standardContext.analysisInput,
    voiceContributionPreset: "harmonic-core",
  });
  const weights = buildHarmonicCoreNoteWeights(notes, context.roles);
  const multipliers = [...weights.multipliers.values()];
  const benchmark = benchmarkClassifier(notes);
  const analysisTiming = measure(() => analyzeMidiVoiceAwareRerank(
    bytes,
    {},
    { analysisInput: context.analysisInput },
  ));

  const activeBefore = activeHandleCount();
  const heapBefore = process.memoryUsage();
  let repeatedFingerprint: string | undefined;
  for (let index = 0; index < 20; index += 1) {
    const fingerprint = sha256(new TextEncoder().encode(JSON.stringify(analyzeMidiVoiceAwareRerank(
      bytes,
      {},
      { analysisInput: context.analysisInput },
    ))));
    if (repeatedFingerprint !== undefined && fingerprint !== repeatedFingerprint) {
      throw new Error("repeated analysis is not deterministic");
    }
    repeatedFingerprint = fingerprint;
  }
  const heapAfter = process.memoryUsage();
  const activeAfter = activeHandleCount();

  const artifact: P5211Stage04Artifact = {
    schemaVersion: 1,
    kind: "p5211-stage04-harmonic-core-regression",
    codeCandidateCommit: currentHead(),
    fixtureId: "p5211-real-001",
    oldBaselineCandidate: stage00CodeCandidate,
    deterministic: current.deterministic
      && repeatedFingerprint === current.analysis.outputFingerprintSha256,
    oldNew: {
      outputChanged: oldBaseline.analysis.outputFingerprintSha256
        !== current.analysis.outputFingerprintSha256,
      timelineEventDelta: current.analysis.timelineEventCount
        - oldBaseline.analysis.timelineEventCount,
      blockCandidateDelta: current.analysis.blockCandidateCount
        - oldBaseline.analysis.blockCandidateCount,
      topologyUnchanged: JSON.stringify(current.topology) === JSON.stringify(oldBaseline.topology),
    },
    noteWeights: {
      ...weights.summary,
      minimumMultiplier: multipliers.length > 0 ? Math.min(...multipliers) : 1,
    },
    performance: {
      featureClassifierMedianRatio: benchmark.ratio,
      fullAnalysis: analysisTiming,
      timedOut: benchmark.maximumMs > maximumSampleMs
        || analysisTiming.maximumMs > maximumSampleMs,
    },
    resource: {
      activeHandleMeasurementAvailable: true,
      activeHandleDelta: activeAfter - activeBefore,
      repeatedAnalysisCount: 20,
      retainedAnalysisCount: 0,
      heapDeltaBytes: heapAfter.heapUsed - heapBefore.heapUsed,
      rssDeltaBytes: heapAfter.rss - heapBefore.rss,
    },
    privacy: {
      rawNotesPersisted: false,
      sourcePathPersisted: false,
      sourceTitlePersisted: false,
    },
  };

  if (!artifact.deterministic
    || !artifact.oldNew.outputChanged
    || !artifact.oldNew.topologyUnchanged
    || !(artifact.noteWeights.minimumMultiplier > 0)
    || artifact.performance.featureClassifierMedianRatio > maximumMedianRatio
    || artifact.performance.timedOut
    || artifact.resource.activeHandleDelta !== 0) {
    throw new Error("Stage04 Harmonic Core regression gate failed");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(outputPath.replace(/\.json$/u, ".md"), renderP5211Stage04Markdown(artifact), "utf8");
  return artifact;
}

export function renderP5211Stage04Markdown(artifact: P5211Stage04Artifact): string {
  return [
    "# P5.21.1 Stage04 Harmonic Core Regression",
    "",
    `- Candidate: ${artifact.codeCandidateCommit}`,
    `- Fixture: ${artifact.fixtureId} (anonymous ignored input)`,
    `- Deterministic: ${artifact.deterministic}`,
    `- Old/new output changed: ${artifact.oldNew.outputChanged}`,
    `- Timeline/block deltas: ${artifact.oldNew.timelineEventDelta} / ${artifact.oldNew.blockCandidateDelta}`,
    `- Weighted notes: ${artifact.noteWeights.weightedNoteCount}; minimum multiplier: ${artifact.noteWeights.minimumMultiplier}`,
    `- Feature/classifier median ratio: ${artifact.performance.featureClassifierMedianRatio}`,
    `- Full analysis median/max ms: ${artifact.performance.fullAnalysis.medianMs} / ${artifact.performance.fullAnalysis.maximumMs}`,
    `- Active handle delta: ${artifact.resource.activeHandleDelta}`,
    "- Heap/RSS deltas are descriptive non-gates.",
    "- Raw notes, paths, and source titles are omitted.",
    "",
  ].join("\n");
}

function parseOldBaseline(value: unknown): P5211LocalHarmonicCoreBaseline {
  if (!value || typeof value !== "object") throw new Error("old baseline is invalid");
  const candidate = value as Partial<P5211LocalHarmonicCoreBaseline>;
  if (candidate.kind !== "p5211-current-harmonic-core-local-baseline"
    || candidate.codeCandidateCommit !== stage00CodeCandidate
    || candidate.fixtureId !== "p5211-real-001"
    || candidate.deterministic !== true
    || candidate.inputIntegrityVerified !== true
    || candidate.privacy?.rawNotesPersisted !== false
    || candidate.privacy.sourcePathPersisted !== false
    || candidate.privacy.sourceTitlePersisted !== false
    || typeof candidate.analysis?.outputFingerprintSha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(candidate.analysis.outputFingerprintSha256)) {
    throw new Error("old baseline is invalid");
  }
  return candidate as P5211LocalHarmonicCoreBaseline;
}

function benchmarkClassifier(notes: readonly ReturnType<typeof normalizeNotes>[number][]): {
  readonly ratio: number;
  readonly maximumMs: number;
} {
  const dense = generateP5211DenseBenchmarkFixture(64).map((note) => ({
    id: note.id,
    pitch: note.pitch,
    startBeat: note.startBeat,
    endBeat: note.startBeat + note.durationBeats,
  }));
  const real = groupFeatureInputs(notes);
  const baseline = measure(() => [
    ...extractNoteTextureFeatures(dense),
    ...real.flatMap((voiceNotes) => [...extractNoteTextureFeatures(voiceNotes)]),
  ]);
  const classified = measure(() => [
    ...classifyNoteTextureFeatureSet(extractNoteTextureFeatures(dense)),
    ...real.flatMap((voiceNotes) => classifyNoteTextureFeatureSet(
      extractNoteTextureFeatures(voiceNotes),
    )),
  ]);
  return {
    ratio: Number((classified.medianMs / baseline.medianMs).toFixed(6)),
    maximumMs: classified.maximumMs,
  };
}

function groupFeatureInputs(
  notes: readonly ReturnType<typeof normalizeNotes>[number][],
): readonly (readonly NoteTextureInput[])[] {
  const grouped = new Map<string, NoteTextureInput[]>();
  for (const [index, note] of notes.entries()) {
    if (note.channel === undefined || note.channel === 9) continue;
    const id = voiceId(note.trackIndex, note.channel);
    const entry = {
      id: `local-${index}`,
      pitch: note.pitch,
      startBeat: note.startBeat,
      endBeat: note.sustainedEndBeat,
    };
    const voiceNotes = grouped.get(id);
    if (voiceNotes) voiceNotes.push(entry);
    else grouped.set(id, [entry]);
  }
  return [...grouped.values()];
}

function measure<T>(run: () => T): TimingSummary {
  for (let index = 0; index < 3; index += 1) run();
  const samples = Array.from({ length: 7 }, () => {
    const start = performance.now();
    run();
    return Number((performance.now() - start).toFixed(6));
  }).sort((left, right) => left - right);
  return {
    medianMs: samples[3] ?? 0,
    maximumMs: samples[6] ?? 0,
  };
}

function activeHandleCount(): number {
  const getter = (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles;
  if (typeof getter !== "function") throw new Error("active handle measurement unavailable");
  return getter.call(process).length;
}

function currentHead(): string {
  const value = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!/^[a-f0-9]{40}$/u.test(value)) throw new Error("candidate commit is invalid");
  return value;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  const artifact = await evaluateP5211HarmonicCoreIntegration();
  process.stdout.write(
    `P5.21.1 Stage04: changed=${artifact.oldNew.outputChanged}; weighted=${artifact.noteWeights.weightedNoteCount}; deterministic=${artifact.deterministic}; output=ignored-local.\n`,
  );
}

if (process.argv.includes("--run-cli")) {
  void main().catch(() => {
    process.stderr.write("P5.21.1 Stage04 failed: local input validation or regression gate failed.\n");
    process.exitCode = 1;
  });
}
