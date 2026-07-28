import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Midi } from "@tonejs/midi";
import { afterEach, describe, expect, it } from "vitest";
import {
  bassCompanionCorpusVersion,
  corpusDesignSummary,
  generateBassCompanionCorpus,
} from "./generateBassCompanionCorpus";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("Phase 4.7 bass companion Gold corpus", () => {
  it("freezes balanced, independent splits before precision evaluation", async () => {
    const directory = await createTemporaryDirectory();
    const manifest = await generateBassCompanionCorpus(directory);
    const summary = corpusDesignSummary(manifest);

    expect(manifest.corpusVersion).toBe(bassCompanionCorpusVersion);
    expect(summary.files).toBe(36);
    expect(summary.events).toBe(288);
    expect(summary.splits).toEqual({
      dev: { files: 12, events: 96, expectedApplicable: 84 },
      validation: { files: 12, events: 96, expectedApplicable: 84 },
      holdout: { files: 12, events: 96, expectedApplicable: 84 },
    });

    for (const split of ["dev", "validation", "holdout"] as const) {
      const files = manifest.files.filter((file) => file.split === split);
      const events = files.flatMap((file) => file.events);
      expect(new Set(files.map((file) => file.keyPitchClass)).size).toBe(12);
      expect(files.filter((file) => file.variant === "clean")).toHaveLength(6);
      expect(files.filter((file) => file.variant === "stress")).toHaveLength(6);
      expect(events.filter((event) => event.goldBassIdentity === "plain"))
        .toHaveLength(48);
      expect(events.filter((event) => event.goldBassIdentity === "slash"))
        .toHaveLength(48);
      expect(new Set(events.map((event) => event.family))).toEqual(new Set([
        "m7",
        "m9",
        "maj9",
        "7sus4",
        "13",
        "maj7",
        "dom7",
      ]));
      expect(new Set(events.map((event) => event.bassCondition))).toEqual(new Set([
        "root",
        "third",
        "fifth",
        "seventh",
        "passing",
        "pedal",
        "non-chord",
        "short",
      ]));
    }
  });

  it("is byte-deterministic and readable by the SMF library", async () => {
    const firstDirectory = await createTemporaryDirectory();
    const secondDirectory = await createTemporaryDirectory();
    const first = await generateBassCompanionCorpus(firstDirectory);
    const second = await generateBassCompanionCorpus(secondDirectory);

    expect(second).toEqual(first);
    const firstFile = first.files[0]!;
    const bytes = await readFile(resolve(firstDirectory, firstFile.path));
    const midi = new Midi(bytes);
    expect(midi.tracks.reduce((sum, track) => sum + track.notes.length, 0))
      .toBe(firstFile.noteCount);
    expect(midi.tracks.length + 1).toBe(firstFile.trackCount);
    expect(bytes.byteLength).toBe(firstFile.byteLength);
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "loop-vault-p47-corpus-"));
  temporaryDirectories.push(directory);
  return directory;
}
