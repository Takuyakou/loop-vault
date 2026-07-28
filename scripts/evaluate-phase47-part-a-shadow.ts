import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  bestWindow,
  diagnoseLoadedFile,
  identityKey,
  loadPhase47Files,
  mean,
  notesForWindow,
  qualityFamily,
  regressionCorpusDir,
} from "./phase47/evaluationShared";
import {
  generatePartACompanion,
  rankWithIncumbentPreference,
} from "./phase47/partAShadow";

const { manifest, files } = await loadPhase47Files(regressionCorpusDir, "dev");
const rows = [];
const generatedCounts: number[] = [];
const familyCounts: string[] = [];
let duplicateCount = 0;
let missingProvenanceCount = 0;
const deterministicHash = createHash("sha256");

for (const loaded of files) {
  const windows = diagnoseLoadedFile(loaded);
  const beatsPerBar = loaded.file.timeSignature.numerator
    * (4 / loaded.file.timeSignature.denominator);
  for (const event of loaded.file.events) {
    const window = bestWindow(windows, event, beatsPerBar);
    if (!window) continue;
    const generated = generatePartACompanion(
      window.candidates,
      notesForWindow(loaded, window, beatsPerBar),
    );
    const ranked = rankWithIncumbentPreference(
      window.candidates,
      generated.candidates,
    );
    const baselineKeys = window.candidates.map((candidate) =>
      identityKey(candidate.chord));
    const combinedKeys = ranked.map((candidate) => identityKey(candidate.chord));
    const retainedBaselineKeys = ranked
      .filter((candidate) => candidate.baseline)
      .map((candidate) => identityKey(candidate.chord));
    duplicateCount += combinedKeys.length - new Set(combinedKeys).size;
    missingProvenanceCount += generated.candidates.filter((candidate) =>
      candidate.provenance.noteInstanceIds.length === 0
      || !candidate.provenance.canonicalRoundTrip.passed).length;
    generatedCounts.push(generated.candidates.length);
    generated.candidates.forEach((candidate) =>
      familyCounts.push(qualityFamily(candidate.chord)));
    const row = {
      fileId: loaded.file.fileId,
      eventId: event.eventId,
      expected: event.chordSymbol,
      baselineRank1: window.candidates[0]?.chord.label ?? null,
      combinedRank1: ranked[0]?.chord.label ?? null,
      baselineRank1Score: window.candidates[0]?.rawScore ?? null,
      combinedRank1Score: ranked[0]?.rawScore ?? null,
      baselineCandidateCount: window.candidates.length,
      combinedCandidateCount: ranked.length,
      baselineRetained: baselineKeys.every((key, index) =>
        retainedBaselineKeys[index] === key),
      generated: generated.candidates.map((candidate) => ({
        label: candidate.chord.label,
        canonicalIdentity: candidate.canonicalIdentity,
        rawScore: candidate.rawScore,
        provenance: candidate.provenance,
      })),
      diagnostics: generated.diagnostics,
    };
    rows.push(row);
    deterministicHash.update(JSON.stringify(row));
  }
}

const report = {
  schemaVersion: 1,
  phase: "4.7-02",
  corpusVersion: manifest.corpusVersion,
  analyzerMode: "phase4-v1",
  split: "existing-dev-regression",
  rule: "automatic-bass-plain-companion-v1",
  eventCount: rows.length,
  generated: {
    total: generatedCounts.reduce((sum, value) => sum + value, 0),
    averagePerEvent: mean(generatedCounts),
    maximumPerEvent: Math.max(...generatedCounts),
    minimumPerEvent: Math.min(...generatedCounts),
  },
  candidateContract: {
    rank1UnchangedCount: rows.filter((row) =>
      row.baselineRank1 === row.combinedRank1
      && row.baselineRank1Score === row.combinedRank1Score).length,
    baselineSequenceRetainedCount: rows.filter((row) =>
      row.baselineRetained).length,
    duplicateCount,
    missingProvenanceCount,
  },
  familiesGenerated: Object.fromEntries(
    [...new Set(familyCounts)].sort().map((family) => [
      family,
      familyCounts.filter((candidate) => candidate === family).length,
    ]),
  ),
  deterministicHash: deterministicHash.digest("hex"),
  productChanged: false,
  validationOrHoldoutRun: false,
  rows,
};

await writeFile(
  resolve(cwd(), "docs/phase4.7/02-part-a-shadow.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
await writeFile(
  resolve(cwd(), "docs/phase4.7/02-part-a-shadow.md"),
  `# Phase 4.7-02 Part A Shadow

Existing Dev ${rows.length} eventsへ、評価専用のquality-agnostic Part A ruleを適用した。
Product、UI、Vault、Analyzer pipelineには接続していない。

## Rule

1. baseline raw winnerがautomatic bass由来のnon-root slashである
2. 同coreのplain identityがbaseline集合にない
3. plain chordの全構成音をnote-instance provenanceで説明できる
4. canonical round-tripが一致する
5. 同scoreでplain companionを一件だけ追加する
6. incumbent-preserving tie-breakでbaseline candidateを先に保つ

## Results

- generated total: ${report.generated.total}
- average / event: ${report.generated.averagePerEvent.toFixed(6)}
- maximum / event: ${report.generated.maximumPerEvent}
- rank 1 unchanged: ${report.candidateContract.rank1UnchangedCount} / ${rows.length}
- baseline sequence retained: ${report.candidateContract.baselineSequenceRetainedCount} / ${rows.length}
- canonical duplicate: ${duplicateCount}
- missing provenance: ${missingProvenanceCount}
- deterministic hash: \`${report.deterministicHash}\`

## Family

| Family | Generated |
|---|---:|
${Object.entries(report.familiesGenerated).map(([family, count]) => `| ${family} | ${count} |`).join("\n")}

## Economy Gates

- average <= 0.25: ${report.generated.averagePerEvent <= 0.25 ? "PASS" : "FAIL"}
- max <= 2: ${report.generated.maximumPerEvent <= 2 ? "PASS" : "FAIL"}
- duplicate 0: ${duplicateCount === 0 ? "PASS" : "FAIL"}
- provenance 100%: ${missingProvenanceCount === 0 ? "PASS" : "FAIL"}

既存rank 1をslash優先として再定義したのではなく、同点時にincumbentを維持した。
`,
  "utf8",
);
stdout.write(`${JSON.stringify({
  generated: report.generated,
  candidateContract: report.candidateContract,
  familiesGenerated: report.familiesGenerated,
  deterministicHash: report.deterministicHash,
}, null, 2)}\n`);
