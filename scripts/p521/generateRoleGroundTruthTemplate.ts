import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { parseMidi } from "../../src/domain/midi/parser";
import { preScanMidiSource } from "../../src/domain/midi/preAnalysis/voiceExtraction";
import type { VoiceRole } from "../../src/domain/midi/types";
import { annotateVoiceRoles, buildVoiceFeatureInputs } from "../../src/domain/midi/voiceRoles";
import { buildVoices } from "../../src/domain/midi/voices";
import {
  createAnonymousFixtureId,
  createGroundTruthTemplate,
} from "./roleGroundTruthTemplate";

interface CliOptions {
  midiPath: string;
  outputDirectory: string;
  fixtureId?: string;
}

const defaultOutputDirectory = ".local-evaluation/p521-role-ground-truth";

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const fixtureId = options.fixtureId ?? createAnonymousFixtureId(randomUUID);
  const outputDirectory = resolveIgnoredOutputDirectory(options.outputDirectory);

  try {
    const bytes = new Uint8Array(await readFile(resolve(options.midiPath)));
    const scan = preScanMidiSource(bytes, {
      sourceId: fixtureId,
      displayName: "Local MIDI input",
    });
    const template = createGroundTruthTemplate(scan, fixtureId, currentAutomaticRoles(bytes));
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      resolve(outputDirectory, `${fixtureId}.ground-truth.json`),
      `${JSON.stringify(template, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    process.stdout.write(
      `Created anonymous role-review template for ${template.voices.length} Voices. Review expectedRole locally before Stage 00 resumes.\n`,
    );
  } catch {
    process.stderr.write("Unable to read or scan the local MIDI input. No template was written.\n");
    process.exitCode = 1;
  }
}

export function parseCliOptions(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  const allowed = new Set(["--midi", "--out", "--fixture-id"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!allowed.has(argument)) throw new Error(`Unknown flag: ${argument}`);
    if (values.has(argument)) throw new Error(`Duplicate flag: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    values.set(argument, value);
    index += 1;
  }
  const midiPath = values.get("--midi");
  if (!midiPath) throw new Error("--midi is required");
  return {
    midiPath,
    outputDirectory: values.get("--out") ?? defaultOutputDirectory,
    ...(values.has("--fixture-id") ? { fixtureId: values.get("--fixture-id") } : {}),
  };
}

export function resolveIgnoredOutputDirectory(value: string): string {
  const ignoredRoot = resolve(".local-evaluation");
  const outputDirectory = resolve(value);
  const normalizedRoot = ignoredRoot.toLocaleLowerCase();
  const normalizedOutput = outputDirectory.toLocaleLowerCase();
  if (normalizedOutput === normalizedRoot || normalizedOutput.startsWith(`${normalizedRoot}${sep}`)) {
    return outputDirectory;
  }
  throw new Error("--out must remain inside .local-evaluation");
}

function currentAutomaticRoles(bytes: Uint8Array): ReadonlyMap<string, VoiceRole> {
  const data = parseMidi(bytes);
  const voices = buildVoices(data);
  const annotated = annotateVoiceRoles(voices, buildVoiceFeatureInputs(voices, normalizeNotes(data)));
  return new Map(annotated.map((voice) => [
    `${voice.trackIndex}:${voice.channel}`,
    voice.inferredRole,
  ]));
}

void main();