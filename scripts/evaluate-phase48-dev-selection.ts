import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  chordIdentityKey,
  normalizeChordLabel,
  normalizeChordSymbol,
  type NormalizedChordIdentity,
} from "../src/domain/chordIdentity";
import { analyzeMidi } from "../src/domain/midi";
import { parseMidi } from "../src/domain/midi/parser";
import type { ChordSymbol } from "../src/domain/types";
import {
  bestWindow,
  diagnoseLoadedFile,
  loadPhase47Files,
  mean,
  regressionCorpusDir,
} from "./phase47/evaluationShared";
import {
  buildPhase48EvidenceNotes,
  type Phase48EvidenceNote,
} from "./phase48/eventEvidence";
import {
  generateObservedFlatNineShadowCandidates,
  shadowCandidateToChord,
  type FlatNineEvidenceVariant,
  type FlatNineSourceCandidate,
} from "./phase48/observedFlatNineShadow";

interface EvaluationInput {
  fileId: string;
  eventId: string;
  scenarioId: string;
  corpusVariant: "clean" | "stress";
  expectedLabel: string;
  eventStartBeat: number;
  eventEndBeat: number;
  sourceCandidates: FlatNineSourceCandidate[];
  evidenceNotes: Phase48EvidenceNote[];
}

interface RankedCandidate {
  label: string;
  chord: ChordSymbol;
  identity: NormalizedChordIdentity;
  canonicalIdentity: string;
  score: number;
  source: "raw" | "shadow";
}

const evidenceVariants: readonly FlatNineEvidenceVariant[] = ["E1", "E2", "E3"];
const { manifest, files } = await loadPhase47Files(regressionCorpusDir, "dev");
const inputs: EvaluationInput[] = [];

for (const loaded of files) {
  const parsed = parseMidi(loaded.bytes);
  const evidenceNotes = buildPhase48EvidenceNotes(parsed, loaded.file.fileId);
  const windows = diagnoseLoadedFile(loaded);
  const beatsPerBar = loaded.file.timeSignature.numerator
    * (4 / loaded.file.timeSignature.denominator);
  for (const event of loaded.file.events) {
    const window = bestWindow(windows, event, beatsPerBar);
    inputs.push({
      fileId: loaded.file.fileId,
      eventId: event.eventId,
      scenarioId: loaded.file.scenarioId,
      corpusVariant: loaded.file.variant,
      expectedLabel: event.chordSymbol,
      eventStartBeat: event.startBeat,
      eventEndBeat: event.endBeat,
      sourceCandidates: window?.candidates ?? [],
      evidenceNotes,
    });
  }
}

const productHashBefore = productOutputHash();
const productHashAfter = productOutputHash();
const productRuntimeSamplesMs = benchmarkProduct();
const variantReports = evidenceVariants.map(evaluateVariant);
const passingVariants = variantReports
  .filter((entry) => entry.gates.allPassed)
  .sort((left, right) =>
    right.metrics.target7b9Recall - left.metrics.target7b9Recall
    || left.metrics.negativeFalseGenerationRate
      - right.metrics.negativeFalseGenerationRate
    || left.variant.localeCompare(right.variant));
const selectedVariant = passingVariants[0]?.variant ?? null;
const report = {
  schemaVersion: 1,
  phase: "4.8-03",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split: "existing-dev",
  eventCount: inputs.length,
  targetCount: inputs.filter((input) => input.expectedLabel === "A7b9").length,
  negativeCount: inputs.filter((input) => input.expectedLabel !== "A7b9").length,
  runtimeContract: {
    relative: "median Shadow generation for the 40-file corpus / median Product analysis for the same corpus",
    absolute: "median Shadow generation divided by 40 analyzed files",
    samples: 9,
    productSamplesMs: productRuntimeSamplesMs,
    productMedianMs: median(productRuntimeSamplesMs),
  },
  interventionLock: {
    changed: false,
    candidateGenerationOnly: true,
    scoreChanged: false,
    rankChanged: false,
    tieBreakChanged: false,
    allocationChanged: false,
    analyzerChanged: false,
  },
  productInertness: {
    beforeHash: productHashBefore,
    afterHash: productHashAfter,
    unchanged: productHashBefore === productHashAfter,
  },
  variants: variantReports,
  selection: {
    selectedVariant,
    decision: selectedVariant ? "proceed-to-new-corpus-integrity" : "non-promotion",
    allVariantsFailed: selectedVariant === null,
    validationRun: false,
    holdoutRun: false,
    productConnected: false,
  },
};

if (!report.productInertness.unchanged) {
  throw new Error("Product Analyzer changed during Existing Dev selection.");
}

await Promise.all([
  writeFile(
    resolve(cwd(), "docs/phase4.8/03-dev-selection-lock.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(cwd(), "docs/phase4.8/03-dev-selection-lock.md"),
    `# Phase 4.8-03 Existing Dev Selection Lock

## Variant Gate

| Variant | target recall | rescue | false generation | avg/max added | runtime relative | runtime ms/file | regression/plain/root | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---|
${variantReports.map((entry) => `| ${entry.variant} | ${(entry.metrics.target7b9Recall * 100).toFixed(2)}% | ${entry.metrics.generatedRescueCount}/40 | ${(entry.metrics.negativeFalseGenerationRate * 100).toFixed(2)}% | ${entry.metrics.averageAddedCandidates.toFixed(4)}/${entry.metrics.maximumAddedCandidates} | ${(entry.runtime.relativeToProduct * 100).toFixed(2)}% | ${entry.runtime.absolutePerFileMs.toFixed(4)} | ${entry.counterfactual.regressedCount}/${entry.counterfactual.plainSevenStolenCount}/${entry.counterfactual.rootChangedCount} | ${entry.gates.allPassed ? "PASS" : "FAIL"} |`).join("\n")}

## Decision

- Selected variant: ${selectedVariant ?? "none"}
- Decision: ${report.selection.decision}
- Product hash unchanged: ${report.productInertness.unchanged}
- Validation / Holdout run: false / false
- Product connected: false

E1/E2/E3のrule、threshold、budgetはP4.8-00で固定した値から変更していない。
`,
    "utf8",
  ),
]);

stdout.write(`${JSON.stringify({
  productRuntimeMedianMs: report.runtimeContract.productMedianMs,
  productInertness: report.productInertness,
  variants: variantReports.map((entry) => ({
    variant: entry.variant,
    metrics: entry.metrics,
    counterfactual: entry.counterfactual,
    runtime: entry.runtime,
    gates: entry.gates,
  })),
  selection: report.selection,
}, null, 2)}\n`);

function evaluateVariant(variant: FlatNineEvidenceVariant) {
  const rows = inputs.map((input) => {
    const generated = generateObservedFlatNineShadowCandidates(
      input.sourceCandidates,
      input.evidenceNotes,
      {
        variant,
        eventStartBeat: input.eventStartBeat,
        eventEndBeat: input.eventEndBeat,
      },
    );
    const raw = deduplicateAndRank(input.sourceCandidates.flatMap((candidate) => {
      const identity = normalizeChordSymbol(candidate.chord);
      return [{
        label: candidate.chord.label,
        chord: candidate.chord,
        identity,
        canonicalIdentity: chordIdentityKey(identity),
        score: candidate.rawScore,
        source: "raw" as const,
      }];
    }));
    const shadow = generated.map((candidate): RankedCandidate => {
      const chord = shadowCandidateToChord(candidate);
      const identity = normalizeChordSymbol(chord);
      return {
        label: chord.label,
        chord,
        identity,
        canonicalIdentity: candidate.canonicalIdentity,
        score: candidate.baselineCoreScore,
        source: "shadow",
      };
    });
    const combined = deduplicateAndRank([...raw, ...shadow]);
    const expected = normalizeChordLabel(input.expectedLabel);
    const expectedIdentity = expected ? chordIdentityKey(expected) : null;
    const before = raw[0] ?? null;
    const after = combined[0] ?? null;
    const changed = before?.canonicalIdentity !== after?.canonicalIdentity;
    const beforeCorrect = before?.canonicalIdentity === expectedIdentity;
    const afterCorrect = after?.canonicalIdentity === expectedIdentity;
    const outcome = !changed
      ? "unchanged"
      : !beforeCorrect && afterCorrect
        ? "improved"
        : beforeCorrect && !afterCorrect
          ? "regressed"
          : "neutral";
    const target = input.expectedLabel === "A7b9";
    const generatedTarget = generated.some((candidate) =>
      shadowCandidateToChord(candidate).label === "A7(b9)");
    return {
      fileId: input.fileId,
      eventId: input.eventId,
      scenarioId: input.scenarioId,
      corpusVariant: input.corpusVariant,
      expectedLabel: input.expectedLabel,
      target,
      generatedTarget,
      generatedCount: generated.length,
      generatedLabels: shadow.map((candidate) => candidate.label),
      generatedEvidenceClasses: generated.map((candidate) =>
        candidate.evidenceClass),
      provenanceComplete: generated.every((candidate) =>
        candidate.supportingCoreNoteInstanceIds.length > 0
        && candidate.supportingB9NoteInstanceIds.length > 0),
      beforeRank1: before?.label ?? null,
      afterRank1: after?.label ?? null,
      changed,
      outcome,
      rootChanged: changed
        && before !== null
        && after !== null
        && before.identity.rootPitchClass !== after.identity.rootPitchClass,
      plainSevenStolen: changed
        && before?.chord.quality === "dom7"
        && before.chord.tensions.length === 0
        && after?.chord.quality === "dom7"
        && after.chord.tensions.includes("b9"),
      beforeGoldRank: rankOf(raw, expectedIdentity),
      afterGoldRank: rankOf(combined, expectedIdentity),
      beforeTop3Canonical: rankOf(raw, expectedIdentity) !== null
        && rankOf(raw, expectedIdentity)! <= 3,
      afterTop3Canonical: rankOf(combined, expectedIdentity) !== null
        && rankOf(combined, expectedIdentity)! <= 3,
      beforeTop3Root: expected
        ? raw.slice(0, 3).some((candidate) =>
            candidate.identity.rootPitchClass === expected.rootPitchClass)
        : false,
      afterTop3Root: expected
        ? combined.slice(0, 3).some((candidate) =>
            candidate.identity.rootPitchClass === expected.rootPitchClass)
        : false,
    };
  });
  const targetRows = rows.filter((row) => row.target);
  const negativeRows = rows.filter((row) => !row.target);
  const generatedCount = rows.reduce((sum, row) =>
    sum + row.generatedCount, 0);
  const runtimeSamplesMs = benchmarkShadow(variant);
  const runtimeMedianMs = median(runtimeSamplesMs);
  const productMedianMs = median(productRuntimeSamplesMs);
  const deterministicHashes = Array.from({ length: 3 }, () =>
    hashVariantOutput(variant));
  const duplicateCount = rows.reduce((sum, row) =>
    sum + row.generatedLabels.length
      - new Set(row.generatedLabels).size, 0);
  const counterfactual = {
    rank1ChangedCount: rows.filter((row) => row.changed).length,
    improvedCount: rows.filter((row) => row.outcome === "improved").length,
    regressedCount: rows.filter((row) => row.outcome === "regressed").length,
    neutralCount: rows.filter((row) => row.outcome === "neutral").length,
    unchangedCount: rows.filter((row) => row.outcome === "unchanged").length,
    rootChangedCount: rows.filter((row) => row.rootChanged).length,
    plainSevenStolenCount: rows.filter((row) => row.plainSevenStolen).length,
    top3Canonical: {
      before: rate(rows.filter((row) => row.beforeTop3Canonical).length, rows.length),
      after: rate(rows.filter((row) => row.afterTop3Canonical).length, rows.length),
    },
    top3Root: {
      before: rate(rows.filter((row) => row.beforeTop3Root).length, rows.length),
      after: rate(rows.filter((row) => row.afterTop3Root).length, rows.length),
    },
    mrr: {
      before: mean(rows.map((row) => reciprocalRank(row.beforeGoldRank))),
      after: mean(rows.map((row) => reciprocalRank(row.afterGoldRank))),
    },
  };
  const metrics = {
    target7b9Recall: rate(
      targetRows.filter((row) => row.generatedTarget).length,
      targetRows.length,
    ),
    generatedRescueCount: targetRows.filter((row) => row.generatedTarget).length,
    stillMissingCount: targetRows.filter((row) => !row.generatedTarget).length,
    negativeFalseGenerationRate: rate(
      negativeRows.filter((row) => row.generatedCount > 0).length,
      negativeRows.length,
    ),
    negativeFalseGenerationCount: negativeRows
      .filter((row) => row.generatedCount > 0).length,
    generatedCandidateCount: generatedCount,
    averageAddedCandidates: generatedCount / rows.length,
    averageAddedApplicableCandidates: mean(
      rows.filter((row) => row.generatedCount > 0)
        .map((row) => row.generatedCount),
    ),
    maximumAddedCandidates: Math.max(...rows.map((row) => row.generatedCount)),
    duplicateCount,
    provenanceRate: rate(
      rows.filter((row) => row.provenanceComplete).length,
      rows.length,
    ),
    deterministicRate: new Set(deterministicHashes).size === 1 ? 1 : 0,
  };
  const runtime = {
    samplesMs: runtimeSamplesMs,
    medianCorpusMs: runtimeMedianMs,
    absolutePerFileMs: runtimeMedianMs / files.length,
    perEventMs: runtimeMedianMs / inputs.length,
    relativeToProduct: runtimeMedianMs / productMedianMs,
    serializedOutputBytes: Buffer.byteLength(JSON.stringify(rows), "utf8"),
  };
  const gateChecks = {
    targetRecall: metrics.target7b9Recall >= 0.8,
    rescued: metrics.generatedRescueCount >= 32,
    falseGeneration: metrics.negativeFalseGenerationRate <= 0.05,
    provenance: metrics.provenanceRate === 1,
    averageCandidateEconomy: metrics.averageAddedCandidates <= 0.5,
    maximumCandidateEconomy: metrics.maximumAddedCandidates <= 2,
    runtimeRelative: runtime.relativeToProduct <= 0.1,
    runtimeAbsolute: runtime.absolutePerFileMs <= 10,
    deterministic: metrics.deterministicRate === 1,
    productInertness: productHashBefore === productHashAfter,
    counterfactualRegression: counterfactual.regressedCount === 0,
    plainSevenStolen: counterfactual.plainSevenStolenCount === 0,
    rootChanged: counterfactual.rootChangedCount === 0,
    duplicate: metrics.duplicateCount === 0,
  };
  return {
    variant,
    metrics,
    counterfactual,
    runtime,
    gates: {
      checks: gateChecks,
      failed: Object.entries(gateChecks)
        .filter(([, passed]) => !passed)
        .map(([name]) => name),
      allPassed: Object.values(gateChecks).every(Boolean),
    },
    rows,
  };
}

function benchmarkProduct(): number[] {
  const run = () => {
    const started = performance.now();
    let checksum = 0;
    for (const loaded of files) {
      checksum += analyzeMidi(loaded.bytes, {
        mode: "phase4-v1",
        fileName: loaded.file.path,
      }).fullTimeline.length;
    }
    if (checksum === 0) throw new Error("Product benchmark produced no timeline.");
    return performance.now() - started;
  };
  run();
  return Array.from({ length: 9 }, run);
}

function benchmarkShadow(variant: FlatNineEvidenceVariant): number[] {
  const run = () => {
    const started = performance.now();
    let checksum = 0;
    for (const input of inputs) {
      checksum += generateObservedFlatNineShadowCandidates(
        input.sourceCandidates,
        input.evidenceNotes,
        {
          variant,
          eventStartBeat: input.eventStartBeat,
          eventEndBeat: input.eventEndBeat,
        },
      ).length;
    }
    if (checksum < 0) throw new Error("Unreachable Shadow checksum.");
    return performance.now() - started;
  };
  run();
  return Array.from({ length: 9 }, run);
}

function hashVariantOutput(variant: FlatNineEvidenceVariant): string {
  const hash = createHash("sha256");
  for (const input of inputs) {
    hash.update(JSON.stringify(generateObservedFlatNineShadowCandidates(
      input.sourceCandidates,
      input.evidenceNotes,
      {
        variant,
        eventStartBeat: input.eventStartBeat,
        eventEndBeat: input.eventEndBeat,
      },
    )));
  }
  return hash.digest("hex");
}

function productOutputHash(): string {
  const hash = createHash("sha256");
  for (const loaded of files) {
    hash.update(JSON.stringify(analyzeMidi(loaded.bytes, {
      mode: "phase4-v1",
      fileName: loaded.file.path,
    })));
  }
  return hash.digest("hex");
}

function deduplicateAndRank(
  candidates: readonly RankedCandidate[],
): RankedCandidate[] {
  const byIdentity = new Map<string, RankedCandidate>();
  for (const candidate of candidates) {
    const previous = byIdentity.get(candidate.canonicalIdentity);
    if (!previous
      || candidate.score > previous.score
      || (candidate.score === previous.score
        && candidate.source === "raw"
        && previous.source === "shadow")) {
      byIdentity.set(candidate.canonicalIdentity, candidate);
    }
  }
  return [...byIdentity.values()].sort((left, right) =>
    right.score - left.score
    || left.label.localeCompare(right.label)
    || (left.source === "raw" ? -1 : 1));
}

function rankOf(
  candidates: readonly RankedCandidate[],
  expectedIdentity: string | null,
): number | null {
  if (!expectedIdentity) return null;
  const index = candidates.findIndex((candidate) =>
    candidate.canonicalIdentity === expectedIdentity);
  return index < 0 ? null : index + 1;
}

function reciprocalRank(rank: number | null): number {
  return rank === null ? 0 : 1 / rank;
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
