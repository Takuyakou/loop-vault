/**
 * Finds LF-MIDI-001 from approved ignored-local data, then emits Shadow v2
 * aggregates only. No filename, path, bytes, raw notes, or chord text is output.
 */
import { readFileSync } from "node:fs";
import { argv } from "node:process";

import { discoverLfMidi001Candidates } from "./privateFixtureDiscovery";
import { stage01bShadowV2Aggregate } from "./stage01bShadowV2Audit";

const directory = argv[argv.length - 1];
if (!directory) {
  throw new Error("usage: vite-node scripts/p538/run-stage01b-private-discovery.ts <private-directory>");
}

const candidates = discoverLfMidi001Candidates(directory);
process.stdout.write(`candidateCount=${candidates.length}\n`);
if (candidates.length !== 1) {
  throw new Error("LF-MIDI-001 could not be selected uniquely from privacy-safe metadata");
}

const aggregate = stage01bShadowV2Aggregate(new Uint8Array(readFileSync(candidates[0]!)));
process.stdout.write(`${JSON.stringify(aggregate)}\n`);
