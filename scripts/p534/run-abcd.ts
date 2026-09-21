/**
 * P5.34-02 A/B/C/D experiment runner (shadow-only, deterministic).
 *
 * Emits privacy-safe aggregates only. No filename, path, checksum, bytes, or
 * raw note dump.
 */

import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { inferTrackRoles } from "../../src/domain/midi/legacy";
import { chordFixture, progressionFixture, semanticPitchSets, timingFixtures } from "./fixtures";
import {
  instrument,
  onsetSweepTicks,
  semanticKey,
  snapOnsets,
  withMeterView,
  type IsolationCounts,
  type IsolationResult,
} from "./isolationCore";

type Data = ReturnType<typeof parseMidi>;

function row(data: Data, variant: string, meter: string, toleranceTicks?: number): string {
  const roles = inferTrackRoles(data, null);
  const seg = variant === "C" || variant === "D" ? "meter-independent" as const : "legacy" as const;
  const d = toleranceTicks !== undefined && toleranceTicks > 0 ? snapOnsets(data, toleranceTicks) : data;
  const r = instrument(d, roles, { segmenter: seg });
  const c = r.counts;
  return (
    `${variant}\t${meter}\t` +
    `src=${c.sourceNoteCount} ev=${c.evidenceNoteCount} win=${c.windowCount} ` +
    `raw=${c.rawTimelineItemCount} sm=${c.timelineItemCount} blk=${c.blockItemCount} ` +
    `occ=${c.occupiedBarCount} bar=${c.formattedBarCount} dash=${c.dashCount} bnd=${c.boundaryCount}`
  );
}

function abcd(data: Data, label: string): void {
  process.stdout.write(`### ${label} (timeSig=${data.timeSignature}, totalBars=${data.totalBars})\n`);
  process.stdout.write(row(data, "A", data.timeSignature ?? "4/4") + "\n");
  process.stdout.write(row(withMeterView(data, 4, 4), "B", "4/4") + "\n");
  process.stdout.write(row(data, "C", "none") + "\n");
  for (const t of onsetSweepTicks(data.ticksPerBeat).filter((x) => x > 0)) {
    process.stdout.write(row(data, "D", `none tol=${t}`, t) + "\n");
  }
  process.stdout.write("\n");
}

function labels(data: Data, label: string): void {
  const roles = inferTrackRoles(data, null);
  const a = instrument(data, roles, { segmenter: "legacy" });
  const c = instrument(data, roles, { segmenter: "meter-independent" });
  process.stdout.write(
    `### ${label}\nA labels: ${a.labels.join(",") || "(none)"}\n` +
    `C labels: ${c.labels.join(",") || "(none)"}\n\n`,
  );
}

// ---- 1. Meter fixtures (A/B/C/D) ----
abcd(parseMidi(progressionFixture(1, 4)), "METER 1/4 progression");
abcd(parseMidi(progressionFixture(4, 4)), "METER 4/4 progression");

// ---- 2. Timing fixtures (A/B/C/D) ----
for (const tf of timingFixtures) {
  abcd(parseMidi(tf.build()), `T ${tf.id}: ${tf.note}`);
}

// ---- 3. Semantic fixtures (labels under A and C) ----
for (const sf of semanticPitchSets) {
  const bytes = chordFixture(sf.pitches, { ticksPerBeat: 96, numerator: 4, denominator: 4 });
  labels(parseMidi(bytes), `S ${sf.id}: ${sf.note}`);
}

// ---- 4. Secondary experiment: P5.24/P5.26 reachability ----
process.stdout.write("### SECONDARY: P5.24/P5.26 reachability\n");
for (const [label, bytes] of [
  ["1/4 progression", progressionFixture(1, 4)],
  ["4/4 progression", progressionFixture(4, 4)],
] as const) {
  const base = analyzeMidi(bytes);
  const p524 = analyzeMidi(bytes, { mode: "phase4-v1", enableHarmonicStateConsolidation: true });
  const p526 = analyzeMidi(bytes, { mode: "phase4-v1", enableLocalHarmonicStateConsolidation: true });
  process.stdout.write(
    `${label}: default=${base.analyzerVersion} | +P5.24=${p524.analyzerVersion} | +P5.26=${p526.analyzerVersion}\n`,
  );
}

// ---- 5. Semantic identity keys (for report) ----
process.stdout.write("\n### semantic identity keys (S fixtures, A labels)\n");
for (const sf of semanticPitchSets) {
  const bytes = chordFixture(sf.pitches, { ticksPerBeat: 96, numerator: 4, denominator: 4 });
  const data = parseMidi(bytes);
  const roles = inferTrackRoles(data, null);
  const a = instrument(data, roles, { segmenter: "legacy" });
  const key = a.labels[0] ? semanticKey(a.labels[0]) : "null";
  process.stdout.write(`${sf.id}: label=${a.labels[0] ?? "(none)"} key=${key}\n`);
}
