/**
 * P5.34-03 local-fixture runner (shadow-only).
 *
 * Accepts a MIDI path via the final CLI argument and emits ONLY privacy-safe
 * aggregates: A/B/C/D counts, P5.24/P5.26 reachability, and semantic aggregate
 * categories. No filename, path, checksum, bytes, or raw note list is printed.
 */

import { readFileSync } from "node:fs";
import { argv } from "node:process";
import { parseChordLabel } from "../../src/domain/chords";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { parseMidi } from "../../src/domain/midi/parser";
import { inferTrackRoles } from "../../src/domain/midi/legacy";
import {
  instrument,
  onsetSweepTicks,
  snapOnsets,
  withMeterView,
} from "./isolationCore";

const path = argv[argv.length - 1];
if (!/\.(mid|midi)$/i.test(path ?? "")) {
  throw new Error("usage: vite-node scripts/p534/run-local.ts <midi-path>");
}
const bytes = new Uint8Array(readFileSync(path));
const data = parseMidi(bytes);
const roles = inferTrackRoles(data, null);

function line(label: string, d: ReturnType<typeof parseMidi>, segmenter: "legacy" | "meter-independent", tol?: number): void {
  const dd = tol !== undefined && tol > 0 ? snapOnsets(d, tol) : d;
  const c = instrument(dd, roles, { segmenter }).counts;
  process.stdout.write(
    `${label}\tsrc=${c.sourceNoteCount} win=${c.windowCount} raw=${c.rawTimelineItemCount} ` +
    `sm=${c.timelineItemCount} blk=${c.blockItemCount} occ=${c.occupiedBarCount} ` +
    `bar=${c.formattedBarCount} dash=${c.dashCount} bnd=${c.boundaryCount}\n`,
  );
}

process.stdout.write(
  `# timeSig=${data.timeSignature} totalBars=${data.totalBars} ticksPerBeat=${data.ticksPerBeat}\n`,
);
line("A", data, "legacy");
line("B", withMeterView(data, 4, 4), "legacy");
line("C", data, "meter-independent");
for (const t of onsetSweepTicks(data.ticksPerBeat).filter((x) => x > 0)) {
  line(`D-${t}`, data, "meter-independent", t);
}

const base = analyzeMidi(bytes);
const p524 = analyzeMidi(bytes, { mode: "phase4-v1", enableHarmonicStateConsolidation: true });
const p526 = analyzeMidi(bytes, { mode: "phase4-v1", enableLocalHarmonicStateConsolidation: true });
process.stdout.write(
  `# P524/P526: default=${base.analyzerVersion} +p524=${p524.analyzerVersion} +p526=${p526.analyzerVersion}\n`,
);

for (const [label, seg, d] of [
  ["B", "legacy", withMeterView(data, 4, 4)],
  ["C", "meter-independent", data],
] as const) {
  const r = instrument(d, roles, { segmenter: seg });
  const labels = r.labels;
  const distinct = new Set(labels).size;
  const slash = labels.filter((l) => l.includes("/")).length;
  const representable = labels.filter((l) => parseChordLabel(l) !== null).length;
  const bm7 = labels.includes("Bm7");
  const am11Slash = labels.some((l) => /^Am11\//.test(l));
  const alteredDominant = labels.some((l) => /^(G|A|C|D|E|F|B|Ab|Bb|Db|Eb|Gb|C#|F#)(7|9|13)/.test(l) && /b9|#9|b13|#11/.test(l));
  process.stdout.write(
    `SEM-${label}\tdistinct=${distinct} total=${labels.length} slash=${slash} ` +
    `representable=${representable} bm7=${bm7} am11slash=${am11Slash} alteredDom=${alteredDominant}\n`,
  );
}
