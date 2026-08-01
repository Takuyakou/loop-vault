import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parseMidi, writeMidi } from "midi-file";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generatePhase515Corpus } from "./generateCorpus";
import type { Phase515Manifest } from "./manifestValidation";
import {
  validateManifestFile,
  validateMidiBytesAgainstCase,
  validateManifestStructure,
} from "./manifestValidation";

function validManifest(): Phase515Manifest {
  return {
    name: "fixture",
    version: 1,
    cases: [{
      id: "case-1",
      filename: "case-1.mid",
      ppq: 96,
      bpm: 120,
      time_signature: "4/4",
      purpose: "fixture",
      invariants: ["deterministic"],
      events: [{
        start_beat: 1.53125,
        duration_beats: 1.5,
        expected_label: "C7/E",
        pitches: [40, 48, 58, 64],
      }],
    }],
  };
}

describe("Phase 5.15 manifest validation", () => {
  let generatedParent = "";
  let generatedRoot = "";
  beforeAll(async () => {
    generatedParent = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-test-"));
    generatedRoot = resolve(generatedParent, "generated");
    await generatePhase515Corpus(generatedRoot);
  });
  afterAll(async () => {
    await rm(generatedParent, { recursive: true, force: true });
  });

  it("accepts tick-representable irregular boundaries and slash bass", () => {
    expect(validateManifestStructure(validManifest())).toEqual([]);
  });

  it("validates the intentional case 28/29 velocity difference exactly", async () => {
    const { manifest } = await validateManifestFile(
      resolve(generatedRoot, "test/phase5.15-supplemental/manifest-supplemental.json"),
      resolve(generatedRoot, "test/phase5.15-supplemental/midi"),
    );
    for (const [id, velocity] of [
      ["28_velocity_low", 35],
      ["29_velocity_high", 120],
    ] as const) {
      const item = manifest.cases.find((candidate) => candidate.id === id)!;
      expect(item.events?.every((event) => event.velocity === velocity)).toBe(true);
      const bytes = new Uint8Array(readFileSync(resolve(
        generatedRoot,
        "test/phase5.15-supplemental/midi",
        item.filename,
      )));
      expect(validateMidiBytesAgainstCase(item, bytes)).toEqual([]);
    }
  });

  it("rejects note velocity/multiplicity and semantic event mutations", async () => {
    const { manifest } = await validateManifestFile(
      resolve(generatedRoot, "test/phase5.15-supplemental/manifest-supplemental.json"),
      resolve(generatedRoot, "test/phase5.15-supplemental/midi"),
    );
    const item = manifest.cases.find((candidate) => candidate.id === "28_velocity_low")!;
    const source = new Uint8Array(readFileSync(resolve(
      generatedRoot,
      "test/phase5.15-supplemental/midi",
      item.filename,
    )));
    const midi = parseMidi(source);
    const track = midi.tracks.find((candidate) =>
      candidate.some((event) => event.type === "noteOn" && event.velocity > 0))!;
    const noteOn = track.find((event) =>
      event.type === "noteOn" && event.velocity > 0)!;
    if (noteOn.type !== "noteOn") throw new Error("fixture note missing");
    noteOn.velocity += 1;
    track.splice(1, 0, {
      deltaTime: 0,
      channel: 0,
      type: "controller",
      controllerType: 1,
      value: 64,
    });
    const issues = validateMidiBytesAgainstCase(
      item,
      new Uint8Array(writeMidi(midi)),
    );
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "exact-note-missing",
      "unexpected-note",
      "controller-recipe-mismatch",
    ]));
  });

  it("rejects duplicate ids, invalid durations, pitch range, and bad groups", () => {
    const manifest = validManifest();
    manifest.cases.push({
      ...manifest.cases[0]!,
      events: [{
        start_beat: 0,
        duration_beats: 0,
        expected_label: "N.C.",
        pitches: [128],
      }],
    });
    manifest.comparison_groups = { duplicate: ["case-1", "missing-case"] };
    const codes = validateManifestStructure(manifest).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining([
      "duplicate-case-id",
      "invalid-duration",
      "pitch-out-of-range",
      "no-chord-has-pitches",
      "missing-comparison-member",
    ]));
  });

  it("rejects PPQ-unrepresentable beat values", () => {
    const manifest = validManifest();
    manifest.cases[0]!.events![0]!.start_beat = 1 / 7;
    expect(validateManifestStructure(manifest)).toContainEqual(expect.objectContaining({
      code: "unrepresentable-start",
      level: "error",
    }));
  });

  it("rejects traversal, invalid velocity, and non-power-of-two meters", () => {
    const manifest = validManifest();
    manifest.cases[0]!.filename = "../escape.mid";
    manifest.cases[0]!.events![0]!.velocity = 128;
    manifest.cases[0]!.time_signature = "4/3";
    const codes = validateManifestStructure(manifest).map((item) => item.code);
    expect(codes).toContain("runtime-schema");
  });

  it("reports repository-relative paths from async file validation", async () => {
    const result = await validateManifestFile(
      resolve(generatedRoot, "test/phase5.15/manifest.json"),
      resolve(generatedRoot, "test/phase5.15/midi"),
    );
    expect(result.result.valid).toBe(true);
    expect(result.result.manifestPath).toBe("<outside-repository>");
    expect(result.result.manifestPath).not.toMatch(/^[A-Za-z]:[\\/]/);
  });
});
