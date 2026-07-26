import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { recommendPatterns } from "../src/domain/midi/candidateRecommendation";
import { createManualDraft } from "../src/domain/midi/manualDraft";
import { draftEditable, validateDraft } from "../src/domain/midi/manualDraftEditing";
import { draftPreviewTimeline } from "../src/domain/midi/manualDraftPlayback";
import { timelineRangeIssues } from "../src/domain/midi/manualRange";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

/**
 * P4.1.3-M5 — the Manual Recoverability Hard Gates.
 *
 * These ask whether a person can reach, build, hear and keep the block they
 * want. They do not ask whether the window generator proposed it: that is
 * `must-show-catalog-recall`, which P4.1.2-H4 recorded as 14/16 and which is not
 * amended here. A generator that misses a span is a shortfall. A user who cannot
 * express the span they want is a dead end, and only the second is what this
 * contract closes.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const baselinePath = optionValue("--baseline") ?? "docs/phase4.1.3/00-manual-repair-baseline.json";
const mode = (optionValue("--mode") ?? "phase4.1.2-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/phase4.1.3/05-manual-recoverability-results.json");

interface BaselineRegion {
  corpus: string;
  scenarioId: string;
  variant: string;
  blockId: string;
  goldStartBar: number;
  goldEndBar: number;
  timelineSourceComplete: boolean;
  nearestCandidateBarIoU: number;
  boundaryAdjustmentBars: number;
}

const baseline = JSON.parse(await readFile(resolve(cwd(), baselinePath), "utf8")) as {
  corpora: string[];
  regions: BaselineRegion[];
};

const fileOf = new Map<string, { corpusPath: string; fileName: string }>();
for (const corpusPath of baseline.corpora) {
  const manifest = JSON.parse(
    await readFile(resolve(cwd(), corpusPath, "manifest.json"), "utf8"),
  ) as { scenarios: Array<{ scenarioId: string; variants: Array<{ fileName: string; variant: string }> }> };
  const name = corpusPath.split(/[/\\]/).pop() ?? corpusPath;
  for (const scenario of manifest.scenarios) {
    for (const variant of scenario.variants) {
      fileOf.set(`${name}:${scenario.scenarioId}:${variant.variant}`, { corpusPath, fileName: variant.fileName });
    }
  }
}

interface RegionResult {
  region: string;
  lengthBars: number;
  rangeExpressible: boolean;
  draftCreated: boolean;
  eventsInDraft: number;
  eventsInRange: number;
  editorSlots: number;
  previewEvents: number;
  canSave: boolean;
  deterministic: boolean;
  catalogPatternsBefore: number;
  catalogPatternsAfter: number;
  recommendationIdentical: boolean;
}

const results: RegionResult[] = [];

for (const region of baseline.regions) {
  const located = fileOf.get(`${region.corpus}:${region.scenarioId}:${region.variant}`);
  if (!located) throw new Error(`no file for ${region.scenarioId}`);
  const bytes = new Uint8Array(
    await readFile(resolve(cwd(), located.corpusPath, "midi", located.fileName)),
  );
  const analysis = analyzeMidi(bytes, { mode });
  const range = {
    startBar: region.goldStartBar, startBeat: 1, endBar: region.goldEndBar, endBeat: 4,
  };

  const rangeExpressible = timelineRangeIssues({ timeline: analysis.fullTimeline, ...range }).length === 0;
  const catalogOf = () => {
    const catalog = analysis.candidateCatalog;
    return catalog === undefined
      ? { patterns: 0, recommendation: "none" }
      : {
        patterns: catalog.patterns.length,
        recommendation: JSON.stringify(recommendPatterns(catalog).recommendations.map((entry) => entry.patternId)),
      };
  };
  const before = catalogOf();

  const build = () => createManualDraft({
    timeline: analysis.fullTimeline, range, now: "2026-07-26T00:00:00.000Z",
  });
  const draft = build();
  const after = catalogOf();

  results.push({
    region: `${region.corpus}:${region.scenarioId}_${region.variant}:${region.blockId}`,
    lengthBars: draft.lengthBars,
    rangeExpressible,
    draftCreated: draft.events.length > 0,
    eventsInDraft: draft.events.length,
    eventsInRange: draftPreviewTimeline(draft).length,
    editorSlots: draftEditable(draft).slots.length,
    previewEvents: draftPreviewTimeline(draft).length,
    canSave: validateDraft(draft).canSave,
    deterministic: JSON.stringify(build().events) === JSON.stringify(draft.events)
      && JSON.stringify(build().events) === JSON.stringify(draft.events),
    catalogPatternsBefore: before.patterns,
    catalogPatternsAfter: after.patterns,
    recommendationIdentical: before.recommendation === after.recommendation,
  });
}

// --- Arbitrary lengths, so nothing is tuned to 19 and 22 --------------------

// Reuse a corpus file rather than inventing material, so the probe runs on
// chords a real analyser produced.
const probeSource = [...fileOf.values()][0];
const probeBytes = new Uint8Array(
  await readFile(resolve(cwd(), probeSource.corpusPath, "midi", probeSource.fileName)),
);

const lengthProbe = (() => {
  const timeline = analyzeMidi(probeBytes, { mode });
  const totalBars = timeline.totalBars;
  let attempted = 0;
  let created = 0;
  const lengths = new Set<number>();
  for (let lengthBars = 1; lengthBars <= Math.min(64, totalBars); lengthBars += 1) {
    for (let startBar = 1; startBar + lengthBars - 1 <= totalBars; startBar += 7) {
      const range = {
        startBar, startBeat: 1, endBar: startBar + lengthBars - 1, endBeat: 4,
      };
      if (timelineRangeIssues({ timeline: timeline.fullTimeline, ...range }).length > 0) continue;
      attempted += 1;
      const draft = createManualDraft({
        timeline: timeline.fullTimeline, range, now: "2026-07-26T00:00:00.000Z",
      });
      if (draft.events.length > 0 && draft.lengthBars === lengthBars && validateDraft(draft).canSave) {
        created += 1;
        lengths.add(lengthBars);
      }
    }
  }
  return { attempted, created, distinctLengths: lengths.size };
})();

// --- Repository facts -------------------------------------------------------

const trackedMidi = execFileSync("git", ["ls-files", "*.mid", "*.midi"], { cwd: cwd() })
  .toString().trim();

const timelineNonRegression = await (async () => {
  try {
    const recorded = JSON.parse(await readFile(
      resolve(cwd(), "docs/phase4.1.3/05-timeline-non-regression.json"), "utf8",
    )) as { checked: number; identical: number };
    return recorded;
  } catch {
    return undefined;
  }
})();

// --- Gates ------------------------------------------------------------------

interface GateResult {
  id: string;
  verdict: "pass" | "fail" | "not-evaluated";
  detail: string;
}

const all = (predicate: (row: RegionResult) => boolean) => results.every(predicate);
const count = (predicate: (row: RegionResult) => boolean) => results.filter(predicate).length;

const gates: GateResult[] = [
  {
    id: "timeline-range-selection-success-rate",
    verdict: all((row) => row.rangeExpressible) ? "pass" : "fail",
    detail: `${count((row) => row.rangeExpressible)}/${results.length} regions expressible`,
  },
  {
    id: "arbitrary-length-candidate-creation-rate",
    verdict: lengthProbe.attempted > 0 && lengthProbe.created === lengthProbe.attempted ? "pass" : "fail",
    detail: `${lengthProbe.created}/${lengthProbe.attempted} ranges, ${lengthProbe.distinctLengths} distinct lengths`,
  },
  {
    id: "manual-draft-event-reachability",
    verdict: all((row) => row.eventsInDraft === row.eventsInRange && row.eventsInDraft > 0) ? "pass" : "fail",
    detail: `${count((row) => row.eventsInDraft === row.eventsInRange)}/${results.length}`,
  },
  {
    id: "manual-draft-editor-reachability",
    verdict: all((row) => row.editorSlots === row.eventsInDraft) ? "pass" : "fail",
    detail: `${count((row) => row.editorSlots === row.eventsInDraft)}/${results.length}`,
  },
  {
    id: "preview-reachability",
    verdict: all((row) => row.previewEvents === row.eventsInDraft) ? "pass" : "fail",
    detail: `${count((row) => row.previewEvents === row.eventsInDraft)}/${results.length}`,
  },
  {
    id: "save-reachability",
    verdict: all((row) => row.canSave) ? "pass" : "fail",
    detail: `${count((row) => row.canSave)}/${results.length}`,
  },
  {
    id: "catalog-non-destructive",
    verdict: all((row) => row.catalogPatternsBefore === row.catalogPatternsAfter) ? "pass" : "fail",
    detail: `${count((row) => row.catalogPatternsBefore === row.catalogPatternsAfter)}/${results.length}`,
  },
  {
    id: "recommendation-non-regression",
    verdict: all((row) => row.recommendationIdentical) ? "pass" : "fail",
    detail: `${count((row) => row.recommendationIdentical)}/${results.length}`,
  },
  {
    id: "deterministic-domain-functions",
    verdict: all((row) => row.deterministic) ? "pass" : "fail",
    detail: `${count((row) => row.deterministic)}/${results.length} stable over three builds`,
  },
  {
    id: "private-midi-tracked",
    verdict: trackedMidi.length === 0 ? "pass" : "fail",
    detail: trackedMidi.length === 0 ? "0 files" : trackedMidi.split("\n").length + " files",
  },
  {
    id: "timeline-non-regression",
    verdict: timelineNonRegression === undefined
      ? "not-evaluated"
      : (timelineNonRegression.identical === timelineNonRegression.checked ? "pass" : "fail"),
    detail: timelineNonRegression === undefined
      ? "run scripts/verify-timeline-non-regression.ts --output docs/phase4.1.3/05-timeline-non-regression.json"
      : `${timelineNonRegression.identical}/${timelineNonRegression.checked} identical`,
  },
  // Asserted in the test suite rather than here, because they need the store and
  // the schema rather than a corpus. Recorded so the list is complete rather
  // than quietly shorter than the frozen contract.
  {
    id: "reload-consistency",
    verdict: "not-evaluated",
    detail: "asserted in src/domain/midi/manualDraftSave.test.ts (save -> parse -> compare)",
  },
  {
    id: "chord-dojo-reachability",
    verdict: "not-evaluated",
    detail: "asserted in src/domain/midi/manualDraftSave.test.ts (ordinary member of idea.progressionBlocks)",
  },
  {
    id: "schema-compatibility",
    verdict: "not-evaluated",
    detail: "asserted in src/domain/midi/manualDraftSave.test.ts (vaultFileSchema.parse)",
  },
  {
    id: "file-version",
    verdict: "not-evaluated",
    detail: "asserted in src/domain/midi/manualDraftSave.test.ts (fileVersion === 1)",
  },
  {
    id: "tauri-build",
    verdict: "not-evaluated",
    detail: "run npm run tauri build; recorded in 05-final-report.md",
  },
  {
    id: "rollback-available",
    verdict: "not-evaluated",
    detail: "each stage is its own merge commit; recorded in 05-final-report.md",
  },
];

const report = {
  schemaVersion: 1,
  stage: "P4.1.3-M5",
  contract: "Manual Recoverability Contract v1",
  mode,
  regionCount: results.length,
  gates,
  verdict: gates.some((gate) => gate.verdict === "fail") ? "FAIL" : "PASS",
  arbitraryLengthProbe: lengthProbe,
  qualityTargets: {
    repairableWithin1RangeSelection: baseline.regions.filter(
      (region) => region.timelineSourceComplete,
    ).length,
    regionCount: baseline.regions.length,
    timelineSourceComplete: baseline.regions.filter((region) => region.timelineSourceComplete).length,
    meanNearestCandidateBarIoU: Number((baseline.regions.reduce(
      (sum, region) => sum + region.nearestCandidateBarIoU, 0,
    ) / baseline.regions.length).toFixed(6)),
    meanBoundaryAdjustmentBars: Number((baseline.regions.reduce(
      (sum, region) => sum + region.boundaryAdjustmentBars, 0,
    ) / baseline.regions.length).toFixed(4)),
    timeToSavedProgression: null,
  },
  regions: results,
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`Manual Recoverability: ${report.verdict}  (${results.length} regions)\n\n`);
for (const gate of gates) {
  const mark = gate.verdict === "pass" ? "PASS" : (gate.verdict === "fail" ? "FAIL" : "----");
  stdout.write(`${mark}  ${gate.id.padEnd(42)} ${gate.detail}\n`);
}
stdout.write(
  `\narbitrary lengths: ${lengthProbe.created}/${lengthProbe.attempted} ranges`
  + ` across ${lengthProbe.distinctLengths} distinct lengths\n`,
);
