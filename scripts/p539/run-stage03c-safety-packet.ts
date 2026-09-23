/** Local-only blind packet preparation; stdout never includes private notes, labels, or paths. */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { argv, stderr, stdout } from "node:process";
import { resolve } from "node:path";

import { discoverLfMidi001Candidates } from "../p538/privateFixtureDiscovery";
import { changedRegionIndices, type LocalRegionBinding } from "./groundTruthPacket";
import { selectSinglePrivateCandidate } from "./privatePromotionRunner";
import { buildSafetyPacket, renderSafetyChoices, renderSafetySource } from "./stage03cSafetyPacket";

const ENTRYPOINT = /(?:^|\/)run-stage03c-safety-packet\.(?:[cm]?js|ts)$/;

function inputDirectory(args: readonly string[]): string {
  const index = args.findIndex((entry) => ENTRYPOINT.test(entry.replace(/\\/g, "/")));
  const supplied = index < 0 ? [] : args.slice(index + 1);
  if (supplied.length !== 1 || !supplied[0]) throw new Error("One private input directory required");
  return supplied[0];
}

function priorIndices(bytes: Uint8Array): number[] {
  const path = resolve(".local-evaluation/p539-03a-review/sealed-binding.private.json");
  execFileSync("git", ["check-ignore", "-q", "--", path], { stdio: "ignore" });
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || !("regions" in parsed)
    || !Array.isArray(parsed.regions) || parsed.regions.length !== 2) {
    throw new Error("Frozen prior binding unavailable");
  }
  const bindings = parsed.regions as LocalRegionBinding[];
  const changed = changedRegionIndices(bytes);
  if (changed.length !== 2 || bindings[0]?.id !== "FC-REAL-01"
    || bindings[1]?.id !== "FC-REAL-02"
    || bindings.some((binding, index) => binding.windowIndex !== changed[index]?.index)) {
    throw new Error("Frozen prior binding mismatch");
  }
  return bindings.map((binding) => binding.windowIndex);
}

function ignoredOutputDirectory(): string {
  const root = resolve(".local-evaluation");
  const output = resolve(root, "p539-03c-review");
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) {
    throw new Error("Ignored evaluation root must not be a link");
  }
  execFileSync("git", ["check-ignore", "-q", "--", output], { stdio: "ignore" });
  if (existsSync(output)) throw new Error("Blind packet already exists");
  return output;
}

function main(): void {
  const output = ignoredOutputDirectory();
  const source = selectSinglePrivateCandidate(discoverLfMidi001Candidates(inputDirectory(argv)));
  const bytes = new Uint8Array(readFileSync(source));
  const packet = buildSafetyPacket(bytes, priorIndices(bytes));
  mkdirSync(resolve(".local-evaluation"), { recursive: true });
  mkdirSync(output);
  const generated = [
    { name: "source-evidence.html", content: renderSafetySource(packet.blindRegions) },
    { name: "candidate-choices.html", content: renderSafetyChoices(packet.localBindings) },
    { name: "sealed-binding.private.json", content: `${JSON.stringify({
      schemaVersion: 1,
      fixtureId: "LF-MIDI-001",
      regions: packet.localBindings,
    }, null, 2)}\n` },
    ...packet.excerpts.map((excerpt) => ({ name: `${excerpt.id}.mid`, content: excerpt.bytes })),
  ];
  for (const artifact of generated) {
    const path = resolve(output, artifact.name);
    execFileSync("git", ["check-ignore", "-q", "--", path], { stdio: "ignore" });
    writeFileSync(path, artifact.content);
  }
  stdout.write(`reviewRegions=${packet.blindRegions.length}\n`);
  stdout.write(`ignoredArtifacts=${generated.length}\n`);
  stdout.write(`productionBaselineMatchesControl=${packet.productionBaselineMatchesControl}\n`);
  stdout.write(`sourceUnchanged=${packet.sourceUnchanged}\n`);
}

try {
  main();
} catch {
  // Filesystem and parse errors can contain private filenames or source data.
  stderr.write("Stage03c blind packet could not be prepared.\n");
  process.exitCode = 1;
}
