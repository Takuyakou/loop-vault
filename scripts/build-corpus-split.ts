import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, stdout } from "node:process";
import type { ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";

/**
 * Builds the Phase 4.0 tune/holdout split.
 *
 * The split is deterministic and content-addressed: cases are stratified by
 * preset and mode, then ordered by their MIDI sha256 inside each stratum. No
 * randomness is involved, so re-running this never reshuffles the assignment.
 * Weight search may only ever read the tune subset.
 */
const HOLDOUT_SHARE = 0.3;
const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const outputDir = resolve(cwd(), "docs/phase4.0");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;

interface Entry { caseId: string; sha: string; stratum: string; key: string; mode: string; bars: number; hasSlash: boolean }

const entries: Entry[] = manifest.files.map((file) => {
  const record = file.generationRecord as { presetId: string; key?: string; mode?: string; bars?: number };
  return {
    caseId: file.caseId,
    sha: file.midiSha256 ?? "",
    stratum: `${record.presetId}:${record.mode ?? "?"}`,
    key: record.key ?? "?",
    mode: record.mode ?? "?",
    bars: record.bars ?? 0,
    hasSlash: file.chordTimeline.some((segment) => segment.chordSymbol.label.includes("/")),
  };
});

const strata = new Map<string, Entry[]>();
for (const entry of entries) {
  strata.set(entry.stratum, [...(strata.get(entry.stratum) ?? []), entry]);
}

const tune: Entry[] = [];
const holdout: Entry[] = [];
// Cumulative (largest-remainder) allocation so the global holdout share lands on
// HOLDOUT_SHARE exactly instead of drifting upward from per-stratum rounding.
let seenCases = 0;
let allocatedHoldout = 0;
for (const [, members] of [...strata].sort((left, right) => left[0].localeCompare(right[0]))) {
  const ordered = [...members].sort((left, right) => left.sha.localeCompare(right.sha) || left.caseId.localeCompare(right.caseId));
  seenCases += ordered.length;
  const holdoutCount = Math.round(seenCases * HOLDOUT_SHARE) - allocatedHoldout;
  allocatedHoldout += holdoutCount;
  ordered.forEach((entry, index) => (index < holdoutCount ? holdout : tune).push(entry));
}

const summarize = (rows: Entry[]) => ({
  caseCount: rows.length,
  byMode: tally(rows.map((row) => row.mode)),
  byBars: tally(rows.map((row) => String(row.bars))),
  keyCount: new Set(rows.map((row) => `${row.key} ${row.mode}`)).size,
  slashCaseCount: rows.filter((row) => row.hasSlash).length,
});

function tally(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Object.fromEntries([...counts].sort((left, right) => left[0].localeCompare(right[0])));
}

const byId = (rows: Entry[]) => rows.map((row) => row.caseId).sort();
const split = {
  schemaVersion: 1,
  datasetId: manifest.recipeSha256,
  policy: {
    holdoutShare: HOLDOUT_SHARE,
    stratifiedBy: ["presetId", "mode"],
    orderedBy: "midiSha256",
    deterministic: true,
    rule: "weight and threshold search may only read `tune`; `holdout` is evaluated at stage completion and promotion decisions only",
  },
  strataCount: strata.size,
  tune: { ...summarize(tune), caseIds: byId(tune) },
  holdout: { ...summarize(holdout), caseIds: byId(holdout) },
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "00-corpus-split.json"), `${JSON.stringify(split, null, 2)}\n`, "utf8");
stdout.write(`strata=${strata.size} tune=${tune.length} holdout=${holdout.length}\n`);
stdout.write(`tune modes=${JSON.stringify(split.tune.byMode)} bars=${JSON.stringify(split.tune.byBars)} slash=${split.tune.slashCaseCount}\n`);
stdout.write(`holdout modes=${JSON.stringify(split.holdout.byMode)} bars=${JSON.stringify(split.holdout.byBars)} slash=${split.holdout.slashCaseCount}\n`);
