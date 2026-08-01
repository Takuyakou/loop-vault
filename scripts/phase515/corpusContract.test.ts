import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Phase515CorpusContract } from "./corpusContract";
import { markerSegments, renderContractMidi, sha256 } from "./corpusContract";
import { generatePhase515Corpus } from "./generateCorpus";
import {
  validateCorpusContract,
  validateCorpusContractStructure,
  validateSourceContractDrift,
} from "./validateCorpusContract";

function loadContract(): Phase515CorpusContract {
  return JSON.parse(readFileSync(
    resolve("scripts/phase515/fixtures/manifest-v2.json"),
    "utf8",
  )) as Phase515CorpusContract;
}

describe("Phase 5.15 corpus v2 contract", () => {
  let generatedParent = "";
  let generatedRoot = "";
  beforeAll(async () => {
    generatedParent = await mkdtemp(
      resolve(tmpdir(), "loop-vault-p515-contract-test-"),
    );
    generatedRoot = resolve(generatedParent, "generated");
    await generatePhase515Corpus(generatedRoot);
  });
  afterAll(async () => {
    await rm(generatedParent, { recursive: true, force: true });
  });

  it("separates logical marker segments from multi-track source rows", () => {
    const contract = loadContract();
    const pedal = contract.cases.find((item) =>
      item.id === "20_true_pedal_bass_slash_progression")!;
    expect(pedal.sourceRowCount).toBeGreaterThan(pedal.expectedSegments.length);
    expect(pedal.expectedSegments.map((segment) => segment.label)).toEqual([
      "Cmaj7/D",
      "Bbmaj7/D",
    ]);
  });

  it("detects source-manifest/contract drift by stable deep equality", async () => {
    const contract = loadContract();
    expect(await validateSourceContractDrift(generatedRoot, contract)).toEqual([]);
    const mutated = structuredClone(contract);
    mutated.cases[0]!.purpose += " mutated";
    expect(await validateSourceContractDrift(generatedRoot, mutated)).toContainEqual(
      expect.objectContaining({ code: "source-contract-drift" }),
    );
  });

  it("rejects extra and recursively private sourceMidi fields", () => {
    const extra = structuredClone(loadContract()) as unknown as {
      cases: Array<{ sourceMidi: { tracks: Array<Array<Record<string, unknown>>> } }>;
    };
    extra.cases[0]!.sourceMidi.tracks[0]![0]!.privatePath = "C:\\Users\\person\\song.mid";
    expect(validateCorpusContractStructure(
      extra as unknown as Phase515CorpusContract,
    )).toContainEqual(expect.objectContaining({ code: "runtime-schema" }));

    const absolute = structuredClone(loadContract());
    const text = absolute.cases[0]!.sourceMidi.tracks.flat()
      .find((event) => event.type === "text");
    if (!text || text.type !== "text") throw new Error("fixture text missing");
    text.text = "C:\\Users\\person\\song.mid";
    expect(validateCorpusContractStructure(absolute)).toContainEqual(
      expect.objectContaining({ code: "source-midi-privacy" }),
    );
  });

  it("fills the Type 0 expected timeline from MIDI markers", () => {
    const item = loadContract().cases.find((candidate) =>
      candidate.id === "32_type0_multichannel")!;
    expect(item.midi.smfFormat).toBe(0);
    expect(item.expectedSegments.map((segment) => segment.label)).toEqual([
      "Cmaj7",
      "Am7",
    ]);
  });

  it("locks all invariant pairs, including duplicate invariance", () => {
    const contract = loadContract();
    expect(contract.invariantGroups.duplicate).toEqual([
      "02_shell_fifths_pickup_irregular",
      "03_shell_fifths_pickup_irregular_exact_duplicates",
    ]);
    expect(validateCorpusContractStructure(contract)).toEqual([]);
  });

  it("renders every fixture deterministically from the tracked semantic source", () => {
    for (const item of loadContract().cases) {
      const first = renderContractMidi(item);
      const second = renderContractMidi(item);
      expect(sha256(first)).toBe(sha256(second));
      const markers = markerSegments(item.sourceMidi);
      expect(markers.map((segment) => ({
        startBeat: segment.startBeat,
        endBeat: segment.endBeat,
        label: segment.label,
      }))).toEqual(item.expectedSegments.map((segment) => ({
        startBeat: segment.startBeat,
        endBeat: segment.endBeat,
        label: segment.label,
      })));
    }
  });

  it("mutation check rejects overlapping expected segments", () => {
    const contract = structuredClone(loadContract());
    contract.cases[0]!.expectedSegments[1]!.startBeat =
      contract.cases[0]!.expectedSegments[0]!.startBeat;
    expect(validateCorpusContractStructure(contract)).toContainEqual(
      expect.objectContaining({ code: "overlapping-segments" }),
    );
  });

  it("rejects partition membership/order mutation against fixed constants", () => {
    const contract = structuredClone(loadContract());
    const mutable = contract as unknown as {
      partitions: { development: string[] };
    };
    mutable.partitions.development = [
      mutable.partitions.development[1]!,
      mutable.partitions.development[0]!,
      ...mutable.partitions.development.slice(2),
    ];
    expect(validateCorpusContractStructure(contract)).toContainEqual(
      expect.objectContaining({ code: "invalid-partition-membership" }),
    );
  });

  it("async validation rejects physical and generated byte metadata mutations", async () => {
    const contract = structuredClone(loadContract());
    contract.cases[0]!.midi.sha256 = "0".repeat(64);
    contract.cases[0]!.midi.byteLength += 1;
    const result = await validateCorpusContract(generatedRoot, contract);
    expect(result.valid).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      "sha256-mismatch",
      "byte-length-mismatch",
      "generated-sha256-mismatch",
      "generated-byte-length-mismatch",
    ]));
  });

  it("rejects metadata, privacy, partition, and source-event mutations", async () => {
    const contract = structuredClone(loadContract());
    contract.privacy.absolutePathsIncluded = true as false;
    (contract as unknown as {
      partitions: { development: string[] };
    }).partitions.development = [
      ...contract.partitions.development.slice(1),
      contract.partitions.development[0],
    ];
    contract.cases[0]!.midi.noteCount += 1;
    const firstTrack = contract.cases[0]!.sourceMidi.tracks[0]!;
    firstTrack[0]!.deltaTime += 1;
    const result = await validateCorpusContract(generatedRoot, contract);
    expect(result.valid).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      "runtime-schema",
    ]));
  });

  it("rejects ambiguous marker labels and marker metadata mutations", async () => {
    const contract = structuredClone(loadContract());
    const item = contract.cases.find((candidate) =>
      candidate.id === "32_type0_multichannel")!;
    item.midi.markers[0]!.label = "Wrong";
    const marker = item.sourceMidi.tracks[0]!.find((event) => event.type === "marker")!;
    if (marker.type === "marker") {
      item.sourceMidi.tracks[0]!.splice(1, 0, {
        ...marker,
        deltaTime: 0,
        text: "Conflicting",
      });
    }
    const result = await validateCorpusContract(generatedRoot, contract);
    expect(result.valid).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "midi-markers-mismatch",
      "semantic-source-mismatch",
      "generated-sha256-mismatch",
    ]));
  });
});
