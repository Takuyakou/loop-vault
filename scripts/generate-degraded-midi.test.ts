import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeMidi } from "midi-file";
import { afterEach, describe, expect, it } from "vitest";
import type { ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";
import {
  correctionProxyPerCase,
  generateDegradedCorpus,
  parseCliOptions,
} from "./generate-degraded-midi";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("degraded MIDI corpus generation", () => {
  it("regenerates every MIDI and the manifest byte-identically", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-vault-dirty-corpus-"));
    temporaryDirectories.push(root);
    const inputDirectory = join(root, "input");
    const firstOutput = join(root, "first");
    const secondOutput = join(root, "second");
    await mkdir(inputDirectory, { recursive: true });
    const midi = Uint8Array.from(writeMidi({
      header: { format: 1, numTracks: 1, ticksPerBeat: 480 },
      tracks: [[
        { deltaTime: 0, meta: true, type: "trackName", text: "Piano" },
        { deltaTime: 0, type: "programChange", channel: 0, programNumber: 0 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 90 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, meta: true, type: "endOfTrack" },
      ]],
    }));
    await writeFile(join(inputDirectory, "case.mid"), midi);
    const manifest: ChordDripCorpusManifest = {
      schemaVersion: 1,
      generatorVersion: "fixture-v1",
      recipeSha256: "fixture-recipe",
      files: [{
        caseId: "case",
        midiFile: "case.mid",
        generationRecord: { presetId: "p", voicingId: "v", patternId: "hold", bars: 1 },
        chordTimeline: [{
          startBeat: 0,
          durationBeats: 4,
          chordSymbol: { root: 0, quality: "maj", label: "C" },
        }],
      }],
    };
    const manifestPath = join(inputDirectory, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const first = await generateDegradedCorpus({ inputManifestPath: manifestPath, outputDirectory: firstOutput, globalSeed: 365 });
    const second = await generateDegradedCorpus({ inputManifestPath: manifestPath, outputDirectory: secondOutput, globalSeed: 365 });

    expect(await readFile(first.manifestPath)).toEqual(await readFile(second.manifestPath));
    expect(first.manifest.files).toHaveLength(11);
    for (const file of first.manifest.files) {
      expect(await readFile(join(firstOutput, file.midiFile)))
        .toEqual(await readFile(join(secondOutput, file.midiFile)));
    }
  });

  it("normalizes the correction proxy across different case counts", () => {
    expect(correctionProxyPerCase(918, 100)).toBe(9.18);
    expect(correctionProxyPerCase(2754, 300)).toBe(9.18);
    expect(correctionProxyPerCase(0, 0)).toBe(0);
  });

  it.each(["--input", "--output", "--report", "--seed", "--limit-per-category"])(
    "rejects %s without a value",
    (flag) => {
      expect(() => parseCliOptions([flag])).toThrow(`${flag} requires a value`);
      expect(() => parseCliOptions([`${flag}=`])).toThrow(`${flag} requires a value`);
    },
  );

  it("rejects unknown flags", () => {
    expect(() => parseCliOptions(["--unknown", "value"])).toThrow("Unknown flag: --unknown");
  });

  it("parses explicit CLI values", () => {
    expect(parseCliOptions([
      "--run-cli",
      "--input=input.json",
      "--output", "generated",
      "--report", "reports",
      "--seed", "42",
      "--limit-per-category", "7",
    ])).toEqual({
      inputManifestPath: "input.json",
      outputDirectory: "generated",
      reportDirectory: "reports",
      globalSeed: 42,
      limitPerCategory: 7,
    });
  });
});
