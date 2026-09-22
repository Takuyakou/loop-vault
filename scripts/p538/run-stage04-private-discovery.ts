/**
 * Finds LF-MIDI-001 from approved ignored-local data, then emits Stage04
 * aggregate metrics only. No filename, path, bytes, raw notes, chord labels,
 * formatted text, summaries, checksum, or fingerprint is output.
 */
import { readFileSync } from "node:fs";
import { argv } from "node:process";

import { discoverLfMidi001Candidates } from "./privateFixtureDiscovery";
import { stage04HardeningAggregate } from "./stage04HardeningAudit";

const directory = argv[argv.length - 1];
if (!directory) {
  throw new Error("usage: vite-node scripts/p538/run-stage04-private-discovery.ts <private-directory>");
}

const candidates = discoverLfMidi001Candidates(directory);
process.stdout.write(`candidateCount=${candidates.length}\n`);
if (candidates.length !== 1) {
  throw new Error("LF-MIDI-001 could not be selected uniquely from privacy-safe metadata");
}

const aggregate = stage04HardeningAggregate(
  new Uint8Array(readFileSync(candidates[0]!)),
  9,
);
process.stdout.write(`${JSON.stringify(aggregate)}\n`);
