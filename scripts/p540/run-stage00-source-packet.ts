/** Source-only P5.40-00 packet. Does not inspect candidate choices or invoke ranking. */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { argv, stderr, stdout } from "node:process";

import { parseMidi } from "../../src/domain/midi/parser";
import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import { selectSinglePrivateCandidate } from "../p539/privatePromotionRunner";
import {
  buildLocalSourceExcerpts,
  buildLocalStateEvidence,
  renderLocalSourceOnly,
} from "./localGroundTruthPacket";

const ENTRYPOINT = /(?:^|\/)run-stage00-source-packet\.(?:[cm]?js|ts)$/;

function privateInputDirectory(args: readonly string[]): string {
  const index = args.findIndex((entry) => ENTRYPOINT.test(entry.replace(/\\/g, "/")));
  const supplied = index < 0 ? [] : args.slice(index + 1);
  if (supplied.length !== 1 || !supplied[0]) throw new Error("One private input directory required");
  return supplied[0];
}

function ignoredFile(path: string): void {
  execFileSync("git", ["check-ignore", "-q", "--", path], { stdio: "ignore" });
}

function frozenWindowIndex(): number {
  const path = resolve(".local-evaluation/p539-03c-review/sealed-binding.private.json");
  ignoredFile(path);
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || !("regions" in parsed)
    || !Array.isArray(parsed.regions) || parsed.regions.length !== 3) {
    throw new Error("Frozen safety locator unavailable");
  }
  const ids = parsed.regions.map((item: unknown) => item && typeof item === "object"
    && "id" in item ? item.id : null);
  if (new Set(ids).size !== 3 || ids.filter((id) => id === "FC-SAFETY-03").length !== 1) {
    throw new Error("Frozen safety locator IDs collide");
  }
  const region = parsed.regions.find((item: unknown) => item && typeof item === "object"
    && "id" in item && item.id === "FC-SAFETY-03");
  if (!region || typeof region !== "object" || !("windowIndex" in region)
    || !Number.isInteger(region.windowIndex) || region.windowIndex < 0
    || !("changedBeatOffsets" in region) || !Array.isArray(region.changedBeatOffsets)
    || !region.changedBeatOffsets.length
    || region.changedBeatOffsets.some((offset: unknown) => offset !== 0 && offset !== 1)) {
    throw new Error("Frozen safety locator mismatch");
  }
  return region.windowIndex as number;
}

function ignoredOutputDirectory(): string {
  const root = resolve(".local-evaluation");
  const output = resolve(root, "p540-00-source-review");
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) {
    throw new Error("Ignored evaluation root must not be a link");
  }
  ignoredFile(output);
  if (existsSync(output)) throw new Error("Source packet already exists");
  return output;
}

function main(): void {
  const output = ignoredOutputDirectory();
  const source = selectSinglePrivateCandidate(
    discoverLfMidi001Candidates(privateInputDirectory(argv)),
  );
  const bytes = new Uint8Array(readFileSync(source));
  const before = Uint8Array.from(bytes);
  const data = parseMidi(bytes);
  const windowIndex = frozenWindowIndex();
  const regions = [
    buildLocalStateEvidence(data, windowIndex * 2, "FC-SAFETY-03-L0"),
    buildLocalStateEvidence(data, windowIndex * 2 + 1, "FC-SAFETY-03-L1"),
  ];
  const after = new Uint8Array(readFileSync(source));
  const sourceUnchanged = before.length === bytes.length && before.length === after.length
    && before.every((value, index) => value === bytes[index] && value === after[index]);
  if (!sourceUnchanged) throw new Error("Source bytes changed");
  const artifacts = [
    { name: "source-evidence.html", content: renderLocalSourceOnly(regions) },
    ...buildLocalSourceExcerpts(regions, data.tempo ?? 120).map((item) => ({
      name: `${item.id}.mid`, content: item.bytes,
    })),
  ];
  mkdirSync(resolve(".local-evaluation"), { recursive: true });
  mkdirSync(output);
  for (const artifact of artifacts) {
    const path = resolve(output, artifact.name);
    ignoredFile(path);
    writeFileSync(path, artifact.content);
  }
  stdout.write(`localStates=${regions.length}\n`);
  stdout.write(`ignoredArtifacts=${artifacts.length}\n`);
  stdout.write(`sourceUnchanged=${sourceUnchanged}\n`);
}

try {
  main();
} catch {
  // Exception details may contain private paths or musical source evidence.
  stderr.write("Stage00 source-only packet could not be prepared.\n");
  process.exitCode = 1;
}
