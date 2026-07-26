import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { chordIdentityKey, normalizeChordLabel } from "../src/domain/chordIdentity";
import {
  canonicalIdentityFromFactorized,
  factorizeChordLabel,
  factorizedKey,
} from "../src/domain/chordFactorization";
import { fingerprintMidiBytes } from "../src/domain/midi/feedback";
import type { MidiAnalyzerMode } from "../src/domain/midi/types";

/**
 * Stage F0 gate: does the factorized representation change anything?
 *
 * The answer has to be no, and the way to know is to run it over every chord the
 * product actually produces rather than over the ones I thought to write a test
 * for. Each timeline event is taken apart and put back, and the resulting
 * canonical identity is compared to the one the product computes directly. Any
 * difference is a new equivalence, which would silently merge or split
 * progressions.
 *
 * The product analysis itself is untouched — F0 wires nothing in — so the
 * timeline, the candidate order and the warnings are compared to themselves
 * across two runs to record determinism at the same time.
 */

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const corpusPaths = (optionValue("--corpora")
  ?? ".local-evaluation/synthetic-gold-v1,.local-evaluation/long-form-v1.1,.local-evaluation/holdout-v3"
).split(",").filter(Boolean);
// Repeatable rather than comma-separated: real filenames contain commas, and
// splitting on them silently truncated the first private file into a path that
// did not exist.
const extraPaths = argv.flatMap(
  (value, index) => (value === "--file" && argv[index + 1] ? [argv[index + 1]] : []),
);
const mode = (optionValue("--mode") ?? "phase4-v1") as MidiAnalyzerMode;
const outputPath = resolve(cwd(), optionValue("--output") ?? "docs/stage-f/00-factorization-invariance.json");

interface FileRow {
  source: string;
  fingerprint: string;
  timelineEvents: number;
  chordsChecked: number;
  identityMismatches: number;
  unparseable: number;
  roundTripFailures: string[];
  timelineIdentical: boolean;
  candidateOrderIdentical: boolean;
  warningsIdentical: boolean;
  runtimeMs: number;
}

const rows: FileRow[] = [];
const distinctLabels = new Set<string>();
const distinctFactorized = new Set<string>();

async function check(source: string, path: string) {
  const bytes = new Uint8Array(await readFile(path));
  const started = performance.now();
  const analysis = analyzeMidi(bytes, { mode });
  const runtimeMs = Number((performance.now() - started).toFixed(1));
  const again = analyzeMidi(bytes, { mode });

  let chordsChecked = 0;
  let identityMismatches = 0;
  let unparseable = 0;
  const roundTripFailures: string[] = [];

  for (const item of analysis.fullTimeline) {
    const label = item.chord.label;
    distinctLabels.add(label);
    const direct = normalizeChordLabel(label);
    const factorized = factorizeChordLabel(label);

    if (direct === null || factorized === null) {
      unparseable += 1;
      // Both have to refuse the same labels. One accepting what the other
      // rejects would mean the two disagree about what a chord even is.
      if ((direct === null) !== (factorized === null)) {
        roundTripFailures.push(`${label} (one side parsed, the other did not)`);
      }
      continue;
    }

    chordsChecked += 1;
    distinctFactorized.add(factorizedKey(factorized));
    if (chordIdentityKey(canonicalIdentityFromFactorized(factorized)) !== chordIdentityKey(direct)) {
      identityMismatches += 1;
      if (roundTripFailures.length < 8) roundTripFailures.push(label);
    }
  }

  const timelineOf = (result: typeof analysis) => JSON.stringify(
    result.fullTimeline.map((item) => [item.bar, item.beat, item.durationBeats, item.chord.label]),
  );
  const candidatesOf = (result: typeof analysis) => JSON.stringify(
    result.blockCandidates.map((candidate) => [candidate.id, candidate.startBar, candidate.endBar]),
  );
  const warningsOf = (result: typeof analysis) => JSON.stringify(
    result.fullTimeline.map((item) => item.warnings),
  );

  rows.push({
    source,
    fingerprint: fingerprintMidiBytes(bytes),
    timelineEvents: analysis.fullTimeline.length,
    chordsChecked,
    identityMismatches,
    unparseable,
    roundTripFailures,
    timelineIdentical: timelineOf(analysis) === timelineOf(again),
    candidateOrderIdentical: candidatesOf(analysis) === candidatesOf(again),
    warningsIdentical: warningsOf(analysis) === warningsOf(again),
    runtimeMs,
  });
}

for (const corpusPath of corpusPaths) {
  const manifest = JSON.parse(
    await readFile(resolve(cwd(), corpusPath, "manifest.json"), "utf8"),
  ) as { scenarios: Array<{ scenarioId: string; variants: Array<{ fileName: string; variant: string }> }> };
  const name = corpusPath.split(/[/\\]/).pop() ?? corpusPath;
  for (const scenario of manifest.scenarios) {
    for (const variant of scenario.variants) {
      await check(
        `${name}:${scenario.scenarioId}_${variant.variant}`,
        resolve(cwd(), corpusPath, "midi", variant.fileName),
      );
    }
  }
}

// The Chord Drip corpus, which is what the product's non-regression gate uses.
try {
  const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    files: Array<{ caseId: string; midiFile: string }>;
  };
  for (const entry of manifest.files) {
    await check(`chord-drip:${entry.caseId}`, resolve(dirname(manifestPath), entry.midiFile));
  }
} catch {
  stdout.write("  (chord drip corpus not available)\n");
}

// Anything else the caller names, so private MIDI can be checked without its
// path ever reaching the report.
for (const path of extraPaths) {
  const label = optionValue("--label") ?? "private";
  await check(`${label}:${rows.length}`, resolve(cwd(), path));
}

const totals = rows.reduce(
  (sum, row) => ({
    files: sum.files + 1,
    events: sum.events + row.timelineEvents,
    checked: sum.checked + row.chordsChecked,
    mismatches: sum.mismatches + row.identityMismatches,
    unparseable: sum.unparseable + row.unparseable,
  }),
  { files: 0, events: 0, checked: 0, mismatches: 0, unparseable: 0 },
);

const gates = [
  {
    id: "identity-round-trip",
    verdict: totals.mismatches === 0 ? "pass" : "fail",
    detail: `${totals.checked - totals.mismatches}/${totals.checked} chords keep their identity`,
  },
  {
    id: "parser-agreement",
    verdict: rows.every((row) => row.roundTripFailures.length === 0 || row.identityMismatches > 0)
      ? "pass" : "fail",
    detail: `${rows.filter((row) => row.roundTripFailures.length === 0).length}/${rows.length} files clean`,
  },
  {
    id: "timeline-stable",
    verdict: rows.every((row) => row.timelineIdentical) ? "pass" : "fail",
    detail: `${rows.filter((row) => row.timelineIdentical).length}/${rows.length}`,
  },
  {
    id: "candidate-order-stable",
    verdict: rows.every((row) => row.candidateOrderIdentical) ? "pass" : "fail",
    detail: `${rows.filter((row) => row.candidateOrderIdentical).length}/${rows.length}`,
  },
  {
    id: "warnings-stable",
    verdict: rows.every((row) => row.warningsIdentical) ? "pass" : "fail",
    detail: `${rows.filter((row) => row.warningsIdentical).length}/${rows.length}`,
  },
];

const runtimes = rows.map((row) => row.runtimeMs);
const report = {
  schemaVersion: 1,
  stage: "Stage F0",
  mode,
  corpora: corpusPaths,
  totals,
  distinctLabels: distinctLabels.size,
  distinctFactorized: distinctFactorized.size,
  gates,
  verdict: gates.some((gate) => gate.verdict === "fail") ? "FAIL" : "PASS",
  runtimeMs: {
    min: Math.min(...runtimes),
    mean: Number((runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length).toFixed(1)),
    max: Math.max(...runtimes),
  },
  files: rows.map((row) => ({ ...row, roundTripFailures: row.roundTripFailures.slice(0, 4) })),
};

await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

stdout.write(`Stage F0 factorization invariance: ${report.verdict}\n\n`);
for (const gate of gates) {
  stdout.write(`${gate.verdict === "pass" ? "PASS" : "FAIL"}  ${gate.id.padEnd(26)} ${gate.detail}\n`);
}
stdout.write(
  `\n${totals.files} files, ${totals.events} timeline events, ${totals.checked} chords checked`
  + `, ${totals.unparseable} unparseable (both sides)\n`
  + `${distinctLabels.size} distinct labels, ${distinctFactorized.size} distinct factorized forms\n`
  + `runtime min ${report.runtimeMs.min} / mean ${report.runtimeMs.mean} / max ${report.runtimeMs.max} ms\n`,
);
