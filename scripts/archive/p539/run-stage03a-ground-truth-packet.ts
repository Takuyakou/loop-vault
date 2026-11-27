import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";

import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import {
  buildGroundTruthPacket,
  renderBlindChoices,
  renderBlindReview,
} from "./groundTruthPacket";
import { selectSinglePrivateCandidate } from "./privatePromotionRunner";

const ENTRYPOINT = /(?:^|\/)run-stage03a-ground-truth-packet\.(?:[cm]?js|ts)$/;

function privateInputArgument(args: readonly string[]): string {
  const index = args.findIndex((entry) => ENTRYPOINT.test(entry.replace(/\\/g, "/")));
  const userArgs = index < 0 ? [] : args.slice(index + 1);
  if (userArgs.length !== 1 || !userArgs[0]) {
    throw new Error("one private evaluation directory argument is required");
  }
  return userArgs[0];
}

function ignoredOutputDirectory(): string {
  const root = resolve(".local-evaluation");
  const output = resolve(root, "p539-03a-review");
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) {
    throw new Error("ignored evaluation root must not be a link");
  }
  execFileSync("git", ["check-ignore", "-q", "--", output], { stdio: "ignore" });
  if (existsSync(output)) throw new Error("review packet already exists");
  return output;
}

function main(): void {
  const inputRoot = privateInputArgument(argv);
  const output = ignoredOutputDirectory();
  const candidates = discoverLfMidi001Candidates(inputRoot);
  const source = selectSinglePrivateCandidate(candidates);
  const packet = buildGroundTruthPacket(new Uint8Array(readFileSync(source)));
  mkdirSync(resolve(".local-evaluation"), { recursive: true });
  mkdirSync(output);
  writeFileSync(resolve(output, "source-evidence.html"), renderBlindReview(packet.blindRegions));
  writeFileSync(resolve(output, "candidate-choices.html"), renderBlindChoices(packet.localBindings));
  writeFileSync(resolve(output, "sealed-binding.private.json"), `${JSON.stringify({
    schemaVersion: 1,
    fixtureId: "LF-MIDI-001",
    regions: packet.localBindings,
  }, null, 2)}\n`);
  for (const excerpt of packet.excerpts) {
    writeFileSync(resolve(output, `${excerpt.id}.mid`), excerpt.bytes);
  }
  stdout.write(`blindReviewPackets=${packet.blindRegions.length}\nignoredOutput=true\n`);
}

try {
  main();
} catch {
  // Filesystem errors may contain private filenames. Never echo their details.
  stderr.write("Private ground-truth packet could not be prepared.\n");
  process.exitCode = 1;
}
