import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { chordPitchClasses } from "../src/domain/chordVoicing";
import { classifyRepresentability } from "../src/domain/midi/evaluation/metricsV2";
import {
  bestWindow,
  diagnoseLoadedFile,
  identityKey,
  isNonRootSlash,
  loadPhase47Files,
  notesForWindow,
  plainCompanion,
} from "./phase47/evaluationShared";
import {
  bassCompanionCorpusVersion,
  defaultBassCompanionCorpusDir,
  type BassCompanionCorpusFile,
  type BassCompanionCorpusManifest,
  type BassCompanionFamily,
  type BassCompanionSplit,
} from "./phase47/generateBassCompanionCorpus";

export interface CorpusIntegrityOptions {
  corpusDirectory?: string;
  reportJsonPath?: string;
  reportMarkdownPath?: string;
  stratificationJsonPath?: string;
  stratificationMarkdownPath?: string;
  checkGitTracking?: boolean;
}

interface FileIntegrityRow {
  fileId: string;
  split: BassCompanionSplit;
  variant: "clean" | "stress";
  sha256Match: boolean;
  byteLengthMatch: boolean;
  parserRoundTrip: boolean;
  manifestNotes: number;
  parsedNotes: number;
  manifestTracks: number;
  parsedTracks: number;
  manifestEvents: number;
  representableEvents: number;
  applicableEvents: number;
}

interface SplitSummary {
  files: number;
  events: number;
  notes: number;
  variants: Record<string, number>;
  families: Record<string, number>;
  goldBassIdentity: Record<string, number>;
  keys: Record<string, number>;
  bassConditions: Record<string, number>;
  trackLayouts: Record<string, number>;
  durationClasses: Record<string, number>;
  representableEvents: number;
  expectedApplicableEvents: number;
  measuredApplicableEvents: number;
  minimumApplicableEvents: number;
  applicableMinimumPass: boolean;
}

export interface CorpusIntegrityReport {
  schemaVersion: 1;
  phase: "4.7-04";
  corpusVersion: string;
  corpusLocation: string;
  productChanged: false;
  precisionEvaluationRun: false;
  validationOrHoldoutAccuracyEvaluated: false;
  counts: {
    files: number;
    events: number;
    notes: number;
    bytes: number;
  };
  splitOverlap: {
    duplicateFileIds: number;
    duplicateSha256AcrossSplits: number;
    duplicateScenarioIds: number;
  };
  parserRoundTrip: {
    passedFiles: number;
    failedFiles: number;
  };
  representability: {
    representableEvents: number;
    unsupportedEvents: number;
  };
  applicability: {
    measuredEvents: number;
    expectedEvents: number;
    falsePositiveAgainstPlan: number;
    falseNegativeAgainstPlan: number;
  };
  splits: Record<BassCompanionSplit, SplitSummary>;
  git: {
    midiTracked: number;
    localEvaluationTracked: number;
  };
  gates: {
    corpusVersion: boolean;
    checksumsAndLengths: boolean;
    parserRoundTrip: boolean;
    splitOverlapZero: boolean;
    familiesStratified: boolean;
    bassConditionsStratified: boolean;
    cleanStressBalanced: boolean;
    plainSlashBalanced: boolean;
    allTwelveKeysPerSplit: boolean;
    representability: boolean;
    applicabilityMinimums: boolean;
    midiTrackedZero: boolean;
    localEvaluationTrackedZero: boolean;
    overall: boolean;
  };
  files: FileIntegrityRow[];
}

const splitMinimums: Record<BassCompanionSplit, number> = {
  dev: 24,
  validation: 12,
  holdout: 12,
};
const splits: readonly BassCompanionSplit[] = ["dev", "validation", "holdout"];
const requiredFamilies: readonly BassCompanionFamily[] = [
  "m7",
  "m9",
  "maj9",
  "7sus4",
  "13",
  "maj7",
  "dom7",
];
const requiredBassConditions = [
  "root",
  "third",
  "fifth",
  "seventh",
  "passing",
  "pedal",
  "non-chord",
  "short",
] as const;

export async function evaluatePhase47CorpusIntegrity(
  options: CorpusIntegrityOptions = {},
): Promise<CorpusIntegrityReport> {
  const corpusDirectory = resolve(
    cwd(),
    options.corpusDirectory ?? defaultBassCompanionCorpusDir,
  );
  const manifest = JSON.parse(
    await readFile(resolve(corpusDirectory, "manifest.json"), "utf8"),
  ) as BassCompanionCorpusManifest;
  const loaded = await loadPhase47Files(corpusDirectory);
  const fileRows: FileIntegrityRow[] = [];
  let falsePositiveAgainstPlan = 0;
  let falseNegativeAgainstPlan = 0;

  for (const loadedFile of loaded.files) {
    const file = loadedFile.file as BassCompanionCorpusFile;
    const bytes = loadedFile.bytes;
    const parsedNoteCount = loadedFile.evidenceNotes.length
      + countExcludedNotes(bytes);
    const parsedTrackCount = countParsedTracks(bytes);
    const parserRoundTrip = parsedNoteCount === file.noteCount
      && parsedTrackCount === file.trackCount
      && loadedFile.ticksPerBeat === file.ppq
      && file.timeSignature.numerator === 4
      && file.timeSignature.denominator === 4;
    const windows = diagnoseLoadedFile(loadedFile);
    let applicableEvents = 0;
    let representableEvents = 0;

    for (const event of file.events) {
      if (classifyRepresentability(event.chordSymbol).representability === "representable") {
        representableEvents += 1;
      }
      const window = bestWindow(windows, event, 4);
      const measuredApplicable = window
        ? measureApplicability(loadedFile, window)
        : false;
      if (measuredApplicable) applicableEvents += 1;
      if (measuredApplicable && !event.expectedApplicable) falsePositiveAgainstPlan += 1;
      if (!measuredApplicable && event.expectedApplicable) falseNegativeAgainstPlan += 1;
    }

    fileRows.push({
      fileId: file.fileId,
      split: file.split,
      variant: file.variant,
      sha256Match: sha256(bytes) === file.sha256,
      byteLengthMatch: bytes.byteLength === file.byteLength,
      parserRoundTrip,
      manifestNotes: file.noteCount,
      parsedNotes: parsedNoteCount,
      manifestTracks: file.trackCount,
      parsedTracks: parsedTrackCount,
      manifestEvents: file.events.length,
      representableEvents,
      applicableEvents,
    });
  }

  const splitSummaries = Object.fromEntries(splits.map((split) => {
    const files = manifest.files.filter((file) => file.split === split);
    const events = files.flatMap((file) => file.events);
    const rows = fileRows.filter((file) => file.split === split);
    const measuredApplicableEvents = rows.reduce(
      (sum, row) => sum + row.applicableEvents,
      0,
    );
    const summary: SplitSummary = {
      files: files.length,
      events: events.length,
      notes: files.reduce((sum, file) => sum + file.noteCount, 0),
      variants: countBy(files.map((file) => file.variant)),
      families: countBy(events.map((event) => event.family)),
      goldBassIdentity: countBy(events.map((event) => event.goldBassIdentity)),
      keys: countBy(files.map((file) => String(file.keyPitchClass))),
      bassConditions: countBy(events.map((event) => event.bassCondition)),
      trackLayouts: countBy(events.map((event) => event.bassTrackLayout)),
      durationClasses: countBy(events.map((event) => event.bassDurationClass)),
      representableEvents: rows.reduce((sum, row) => sum + row.representableEvents, 0),
      expectedApplicableEvents: events.filter((event) => event.expectedApplicable).length,
      measuredApplicableEvents,
      minimumApplicableEvents: splitMinimums[split],
      applicableMinimumPass: measuredApplicableEvents >= splitMinimums[split],
    };
    return [split, summary];
  })) as Record<BassCompanionSplit, SplitSummary>;

  const duplicateFileIds = duplicateCount(manifest.files.map((file) => file.fileId));
  const duplicateScenarioIds = duplicateCount(
    manifest.files.map((file) => file.scenarioId),
  );
  const duplicateSha256AcrossSplits = crossSplitHashDuplicates(manifest.files);
  const tracked = options.checkGitTracking === false
    ? { midiTracked: 0, localEvaluationTracked: 0 }
    : gitTrackingCounts();
  const totalEvents = manifest.files.reduce((sum, file) => sum + file.events.length, 0);
  const totalRepresentable = fileRows.reduce(
    (sum, file) => sum + file.representableEvents,
    0,
  );
  const measuredApplicable = fileRows.reduce(
    (sum, file) => sum + file.applicableEvents,
    0,
  );
  const expectedApplicable = manifest.files.flatMap((file) => file.events)
    .filter((event) => event.expectedApplicable).length;
  const gatesWithoutOverall = {
    corpusVersion: manifest.corpusVersion === bassCompanionCorpusVersion,
    checksumsAndLengths: fileRows.every((file) =>
      file.sha256Match && file.byteLengthMatch),
    parserRoundTrip: fileRows.every((file) => file.parserRoundTrip),
    splitOverlapZero: duplicateFileIds === 0
      && duplicateScenarioIds === 0
      && duplicateSha256AcrossSplits === 0,
    familiesStratified: splits.every((split) =>
      requiredFamilies.every((family) => (splitSummaries[split].families[family] ?? 0) > 0)),
    bassConditionsStratified: splits.every((split) =>
      requiredBassConditions.every(
        (condition) => (splitSummaries[split].bassConditions[condition] ?? 0) > 0,
      )),
    cleanStressBalanced: splits.every((split) =>
      splitSummaries[split].variants.clean === splitSummaries[split].variants.stress),
    plainSlashBalanced: splits.every((split) =>
      splitSummaries[split].goldBassIdentity.plain
      === splitSummaries[split].goldBassIdentity.slash),
    allTwelveKeysPerSplit: splits.every((split) =>
      Object.keys(splitSummaries[split].keys).length === 12),
    representability: totalRepresentable === totalEvents,
    applicabilityMinimums: splits.every((split) =>
      splitSummaries[split].applicableMinimumPass),
    midiTrackedZero: tracked.midiTracked === 0,
    localEvaluationTrackedZero: tracked.localEvaluationTracked === 0,
  };
  const gates = {
    ...gatesWithoutOverall,
    overall: Object.values(gatesWithoutOverall).every(Boolean),
  };
  const report: CorpusIntegrityReport = {
    schemaVersion: 1,
    phase: "4.7-04",
    corpusVersion: manifest.corpusVersion,
    corpusLocation: defaultBassCompanionCorpusDir,
    productChanged: false,
    precisionEvaluationRun: false,
    validationOrHoldoutAccuracyEvaluated: false,
    counts: {
      files: manifest.files.length,
      events: totalEvents,
      notes: manifest.files.reduce((sum, file) => sum + file.noteCount, 0),
      bytes: manifest.files.reduce((sum, file) => sum + file.byteLength, 0),
    },
    splitOverlap: {
      duplicateFileIds,
      duplicateSha256AcrossSplits,
      duplicateScenarioIds,
    },
    parserRoundTrip: {
      passedFiles: fileRows.filter((file) => file.parserRoundTrip).length,
      failedFiles: fileRows.filter((file) => !file.parserRoundTrip).length,
    },
    representability: {
      representableEvents: totalRepresentable,
      unsupportedEvents: totalEvents - totalRepresentable,
    },
    applicability: {
      measuredEvents: measuredApplicable,
      expectedEvents: expectedApplicable,
      falsePositiveAgainstPlan,
      falseNegativeAgainstPlan,
    },
    splits: splitSummaries,
    git: tracked,
    gates,
    files: fileRows,
  };

  if (options.reportJsonPath) {
    await writeFile(
      resolve(cwd(), options.reportJsonPath),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  }
  if (options.reportMarkdownPath) {
    await writeFile(
      resolve(cwd(), options.reportMarkdownPath),
      markdownReport(report),
      "utf8",
    );
  }
  if (options.stratificationJsonPath) {
    await writeFile(
      resolve(cwd(), options.stratificationJsonPath),
      `${JSON.stringify({
        schemaVersion: 1,
        phase: report.phase,
        corpusVersion: report.corpusVersion,
        splitOverlap: report.splitOverlap,
        splits: report.splits,
        stratificationGates: {
          splitOverlapZero: report.gates.splitOverlapZero,
          familiesStratified: report.gates.familiesStratified,
          bassConditionsStratified: report.gates.bassConditionsStratified,
          cleanStressBalanced: report.gates.cleanStressBalanced,
          plainSlashBalanced: report.gates.plainSlashBalanced,
          allTwelveKeysPerSplit: report.gates.allTwelveKeysPerSplit,
        },
      }, null, 2)}\n`,
      "utf8",
    );
  }
  if (options.stratificationMarkdownPath) {
    await writeFile(
      resolve(cwd(), options.stratificationMarkdownPath),
      stratificationReport(report),
      "utf8",
    );
  }
  return report;
}

function measureApplicability(
  loadedFile: Awaited<ReturnType<typeof loadPhase47Files>>["files"][number],
  window: ReturnType<typeof diagnoseLoadedFile>[number],
): boolean {
  const candidateKeys = new Set(window.candidates.map((candidate) =>
    identityKey(candidate.chord)));
  const supportingPitchClasses = new Set(
    notesForWindow(loadedFile, window, 4).map((note) => note.pitchClass),
  );
  return window.candidates.some((candidate) => {
    if (!isNonRootSlash(candidate.chord)) return false;
    const plain = plainCompanion(candidate.chord);
    return !candidateKeys.has(identityKey(plain))
      && chordPitchClasses(plain)
        .every((pitchClass) => supportingPitchClasses.has(pitchClass));
  });
}

function countExcludedNotes(bytes: Uint8Array): number {
  const { parseMidi } = requireParser();
  const parsed = parseMidi(bytes);
  const evidenceTracks = new Set(
    parsed.notes.filter((note) => note.channel !== 9).map((note) => note.trackIndex),
  );
  return parsed.notes.filter((note) => !evidenceTracks.has(note.trackIndex)).length;
}

function countParsedTracks(bytes: Uint8Array): number {
  const { parseMidi } = requireParser();
  return parseMidi(bytes).tracks.length;
}

function requireParser() {
  return {
    // Kept behind one helper so every round-trip check uses the product parser.
    parseMidi: (
      bytes: Uint8Array,
    ) => {
      const raw = requireParserModule(bytes);
      return raw;
    },
  };
}

function requireParserModule(bytes: Uint8Array) {
  // Static import is intentionally avoided nowhere else; this wrapper keeps the
  // call site explicit in the report implementation.
  return importedParseMidi(bytes);
}

import { parseMidi as importedParseMidi } from "../src/domain/midi/parser";

function duplicateCount(values: readonly string[]): number {
  return values.length - new Set(values).size;
}

function crossSplitHashDuplicates(files: readonly BassCompanionCorpusFile[]): number {
  const splitsByHash = new Map<string, Set<BassCompanionSplit>>();
  for (const file of files) {
    const members = splitsByHash.get(file.sha256) ?? new Set<BassCompanionSplit>();
    members.add(file.split);
    splitsByHash.set(file.sha256, members);
  }
  return [...splitsByHash.values()].filter((members) => members.size > 1).length;
}

function countBy(values: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [
      value,
      values.filter((candidate) => candidate === value).length,
    ]),
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitTrackingCounts() {
  const trackedMidi = execFileSync(
    "git",
    ["ls-files", "*.mid", "*.midi"],
    { cwd: cwd(), encoding: "utf8" },
  ).trim().split(/\r?\n/).filter(Boolean);
  const trackedLocal = execFileSync(
    "git",
    ["ls-files", ".local-evaluation"],
    { cwd: cwd(), encoding: "utf8" },
  ).trim().split(/\r?\n/).filter(Boolean);
  return {
    midiTracked: trackedMidi.length,
    localEvaluationTracked: trackedLocal.length,
  };
}

function markdownReport(report: CorpusIntegrityReport): string {
  const splitRows = splits.map((split) => {
    const value = report.splits[split];
    return `| ${split} | ${value.files} | ${value.events} | ${value.notes} | `
      + `${value.variants.clean}/${value.variants.stress} | `
      + `${value.goldBassIdentity.plain}/${value.goldBassIdentity.slash} | `
      + `${value.measuredApplicableEvents}/${value.minimumApplicableEvents} |`;
  }).join("\n");
  const gateRows = Object.entries(report.gates)
    .map(([gate, passed]) => `| ${gate} | ${passed ? "PASS" : "FAIL"} |`)
    .join("\n");
  return `# Phase 4.7-04 New Gold Corpus Integrity

## 結論

固定v1コーパスを結果確認前に一括生成し、Productコードを変更せずintegrityとPart A applicabilityだけを検証した。Validation / Holdoutの精度評価は実行していない。

## Corpus

- Location: \`${report.corpusLocation}\`（Git管理外）
- Version: \`${report.corpusVersion}\`
- Files / events / notes: ${report.counts.files} / ${report.counts.events} / ${report.counts.notes}
- Bytes: ${report.counts.bytes}
- SHA-256 / byteLength: ${report.gates.checksumsAndLengths ? "PASS" : "FAIL"}
- Parser round-trip: ${report.parserRoundTrip.passedFiles}/${report.counts.files}
- Representability: ${report.representability.representableEvents}/${report.counts.events}
- Split duplicate: file ${report.splitOverlap.duplicateFileIds}, scenario ${report.splitOverlap.duplicateScenarioIds}, SHA across split ${report.splitOverlap.duplicateSha256AcrossSplits}

## Split stratification

| Split | Files | Events | Notes | Clean/Stress | Plain/Slash | Applicable/Minimum |
|---|---:|---:|---:|---:|---:|---:|
${splitRows}

各splitにm7 / m9 / maj9 / 7sus4 / 13 / maj7 / dom7、8種類のbass condition、same/separate track、short/medium/long、12キーを含む。

## Applicability

- Expected by fixed design: ${report.applicability.expectedEvents}
- Measured with existing parser/analyzer diagnostic API: ${report.applicability.measuredEvents}
- Plan false-positive / false-negative: ${report.applicability.falsePositiveAgainstPlan} / ${report.applicability.falseNegativeAgainstPlan}

この値はP4.7 Part Aを適用可能かだけを測る。コード検出精度、candidate recall、Top-3、Validation / Holdout Gateは未評価。

## Gates

| Gate | Result |
|---|---|
${gateRows}

## Scope

- Product変更: なし
- Product接続: なし
- Validation / Holdout精度評価: 未実行
- MIDI / manifestのGit追加: なし
- 結果確認後の追加生成: なし
`;
}

function stratificationReport(report: CorpusIntegrityReport): string {
  const sections = splits.map((split) => {
    const value = report.splits[split];
    return `## ${split}

- Files / events / notes: ${value.files} / ${value.events} / ${value.notes}
- Clean / stress: ${value.variants.clean} / ${value.variants.stress}
- Plain / slash Gold: ${value.goldBassIdentity.plain} / ${value.goldBassIdentity.slash}
- Applicable: ${value.measuredApplicableEvents}（minimum ${value.minimumApplicableEvents}）
- Families: ${JSON.stringify(value.families)}
- Bass conditions: ${JSON.stringify(value.bassConditions)}
- Track layouts: ${JSON.stringify(value.trackLayouts)}
- Duration classes: ${JSON.stringify(value.durationClasses)}
- Keys: ${JSON.stringify(value.keys)}
`;
  }).join("\n");
  return `# Phase 4.7-04 Split Stratification

Corpus version: \`${report.corpusVersion}\`

Dev / Validation / Holdoutは固定generatorから同時生成した。精度評価前にsplit、family、bass condition、clean/stress、plain/slash、key分布を固定し、split間のfile/scenario/SHA重複を検査した。

${sections}
## Gates

- Split overlap zero: ${report.gates.splitOverlapZero ? "PASS" : "FAIL"}
- Families stratified: ${report.gates.familiesStratified ? "PASS" : "FAIL"}
- Bass conditions stratified: ${report.gates.bassConditionsStratified ? "PASS" : "FAIL"}
- Clean/stress balanced: ${report.gates.cleanStressBalanced ? "PASS" : "FAIL"}
- Plain/slash balanced: ${report.gates.plainSlashBalanced ? "PASS" : "FAIL"}
- All 12 keys per split: ${report.gates.allTwelveKeysPerSplit ? "PASS" : "FAIL"}
`;
}

function optionValue(name: string): string | undefined {
  const inline = argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function runCli() {
  const report = await evaluatePhase47CorpusIntegrity({
    corpusDirectory: optionValue("--corpus") ?? defaultBassCompanionCorpusDir,
    reportJsonPath: optionValue("--json") ?? "docs/phase4.7/04-corpus-integrity.json",
    reportMarkdownPath: optionValue("--markdown") ?? "docs/phase4.7/04-corpus-integrity.md",
    stratificationJsonPath: optionValue("--stratification-json")
      ?? "docs/phase4.7/04-split-stratification.json",
    stratificationMarkdownPath: optionValue("--stratification-markdown")
      ?? "docs/phase4.7/04-split-stratification.md",
  });
  stdout.write(`${JSON.stringify({
    counts: report.counts,
    applicability: report.applicability,
    gates: report.gates,
  }, null, 2)}\n`);
  if (!report.gates.overall) process.exitCode = 1;
}

if (argv.some((argument) => argument.replaceAll("\\", "/").endsWith(
  "scripts/evaluate-phase47-corpus-integrity.ts",
))) {
  await runCli();
}
