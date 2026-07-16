import type { EvaluationReport } from "./types";

export function comparisonMarkdown(baseline: EvaluationReport, candidate: EvaluationReport): string {
  const rows = ["rootAccuracy", "rootTop3Accuracy", "qualityAccuracy", "qualityTop3Accuracy", "tetradAccuracy", "exactAccuracy", "exactTop3Accuracy", "boundaryPrecision", "boundaryRecall", "overSegmentationRate", "underSegmentationRate"] as const;
  return [
    "# MIDI Analyzer Comparison", "", `Dataset: ${candidate.datasetId}`, "",
    "| Metric | Legacy | Candidate | Delta |", "|---|---:|---:|---:|",
    ...rows.map((key) => `| ${key} | ${percent(baseline.metrics[key])} | ${percent(candidate.metrics[key])} | ${signed(candidate.metrics[key] - baseline.metrics[key])} |`),
    "", `Legacy corrections: ${baseline.metrics.correctionCost}`,
    `Candidate corrections: ${candidate.metrics.correctionCost}`, "",
  ].join("\n");
}

function percent(value: number): string { return `${(value * 100).toFixed(2)}%`; }
function signed(value: number): string { return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}pp`; }
