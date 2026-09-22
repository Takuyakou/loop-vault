/**
 * Finds LF-MIDI-001 from privacy-safe metadata in an approved ignored-local
 * directory, then emits aggregate counts only. No filename or path is printed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { argv } from "node:process";

import { parseMidi } from "../../src/domain/midi/parser";
import { stage00DownstreamBaseline } from "./stage00Baseline";

const directory = argv[argv.length - 1];
if (!directory) {
  throw new Error("usage: vite-node scripts/p538/run-stage00-private-discovery.ts <private-directory>");
}

const candidates = discoverPrivateCandidates(directory);
process.stdout.write(`candidateCount=${candidates.length}\n`);
if (candidates.length !== 1) {
  throw new Error("LF-MIDI-001 could not be selected uniquely from privacy-safe metadata");
}

const baseline = stage00DownstreamBaseline(new Uint8Array(readFileSync(candidates[0]!)));
process.stdout.write(`${JSON.stringify(baseline)}\n`);

function discoverPrivateCandidates(root: string): string[] {
  const matches: string[] = [];
  const pending = [root];

  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!/^\.midi?$/i.test(extname(entry.name))) continue;
      try {
        const bytes = new Uint8Array(readFileSync(entryPath));
        const data = parseMidi(bytes);
        if (
          data.timeSignature === "1/4"
          && data.totalBars === 65
          && data.ticksPerBeat === 96
          && data.notes.length === 574
        ) {
          matches.push(entryPath);
        }
      } catch {
        // Ignore unreadable/non-SMF files without disclosing their path.
      }
    }
  }

  return matches;
}
