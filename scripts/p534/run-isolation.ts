/**
 * P5.34 isolation harness CLI (shadow-only).
 *
 * Usage:
 *   vite-node scripts/p534/run-isolation.ts [<midi-path>]
 *
 * With no path, runs the deterministic synthetic fixtures. With a path, reads a
 * local MIDI (ignored, never logged) and emits privacy-safe aggregates only —
 * no filename, path, checksum, bytes, or raw note dump.
 */

import { readFileSync } from "node:fs";
import { argv } from "node:process";
import { parseMidi } from "../../src/domain/midi/parser";
import { inferTrackRoles } from "../../src/domain/midi/legacy";
import { chordFixture, semanticPitchSets } from "./fixtures";
import {
  instrument,
  onsetSweepTicks,
  snapOnsets,
  withMeterView,
  type IsolationCounts,
} from "./isolationCore";

interface VariantRow {
  variant: string;
  meter: string;
  toleranceTicks?: number;
  counts: IsolationCounts;
  labels: string[];
}

function runOn(data: ReturnType<typeof parseMidi>): VariantRow[] {
  const roles = inferTrackRoles(data, null);
  const rows: VariantRow[] = [];

  rows.push({
    variant: "A",
    meter: data.timeSignature ?? "4/4",
    counts: instrument(data, roles, { segmenter: "legacy" }).counts,
    labels: instrument(data, roles, { segmenter: "legacy" }).labels,
  });

  const bData = withMeterView(data, 4, 4);
  rows.push({
    variant: "B",
    meter: "4/4",
    counts: instrument(bData, roles, { segmenter: "legacy" }).counts,
    labels: instrument(bData, roles, { segmenter: "legacy" }).labels,
  });

  rows.push({
    variant: "C",
    meter: "none (source-extent)",
    counts: instrument(data, roles, { segmenter: "meter-independent" }).counts,
    labels: instrument(data, roles, { segmenter: "meter-independent" }).labels,
  });

  for (const tolerance of onsetSweepTicks(data.ticksPerBeat).filter((t) => t > 0)) {
    const snapped = snapOnsets(data, tolerance);
    rows.push({
      variant: "D",
      meter: "none (source-extent)",
      toleranceTicks: tolerance,
      counts: instrument(snapped, roles, { segmenter: "meter-independent" }).counts,
      labels: instrument(snapped, roles, { segmenter: "meter-independent" }).labels,
    });
  }

  return rows;
}

function emit(label: string, rows: VariantRow[]): void {
  process.stdout.write(`== ${label} ==\n`);
  for (const row of rows) {
    const tolerance = row.toleranceTicks !== undefined ? ` tol=${row.toleranceTicks}` : "";
    process.stdout.write(
      `${row.variant}\t${row.meter}${tolerance}\t` +
      `windows=${row.counts.windowCount} timeline=${row.counts.timelineItemCount} ` +
      `blocks=${row.counts.blockItemCount} occupiedBars=${row.counts.occupiedBarCount} ` +
      `formattedBars=${row.counts.formattedBarCount} dashes=${row.counts.dashCount} ` +
      `labels=[${row.labels.join(",")}]\n`,
    );
  }
  process.stdout.write("\n");
}

const lastArg = argv[argv.length - 1];
const isMidiPath = /\.(mid|midi)$/i.test(lastArg ?? "");
const path = isMidiPath ? lastArg : undefined;
if (path) {
  const bytes = new Uint8Array(readFileSync(path));
  emit("local", runOn(parseMidi(bytes)));
} else {
  for (const fixture of semanticPitchSets) {
    const bytes = chordFixture(fixture.pitches, { ticksPerBeat: 96, numerator: 4, denominator: 4 });
    emit(fixture.id, runOn(parseMidi(bytes)));
  }
}
