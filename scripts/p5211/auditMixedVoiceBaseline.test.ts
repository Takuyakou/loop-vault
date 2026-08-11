import { describe, expect, it } from "vitest";
import type { NormalizedTimedNote } from "../../src/domain/midi/types";
import {
  parseLocalRegistry,
  renderPrivacySafeBaselineMarkdown,
  summarizeMixedVoiceTopology,
  type P5211LocalHarmonicCoreBaseline,
} from "./auditMixedVoiceBaseline";

describe("P5.21.1 local mixed-voice baseline support", () => {
  it("detects a short moving top layer over a sustained lower bed without chord identity", () => {
    const notes = [
      note(48, 0, 8), note(52, 0, 8), note(55, 0, 8), note(59, 0, 8),
      note(64, 1, 1), note(67, 3, 1),
    ];
    const topology = summarizeMixedVoiceTopology(notes);
    expect(topology).toMatchObject({
      voiceCount: 1,
      maximumVoicePolyphony: 5,
      mixedTextureVoiceCount: 1,
      shortTopOverlayCandidateCount: 2,
      failureTopologyVerified: true,
    });
  });

  it("does not call aligned sustained upper harmony a short overlay", () => {
    const topology = summarizeMixedVoiceTopology([
      note(48, 0, 8), note(52, 0, 8), note(55, 0, 8), note(62, 0, 8),
    ]);
    expect(topology.shortTopOverlayCandidateCount).toBe(0);
    expect(topology.failureTopologyVerified).toBe(false);
  });

  it("accepts only the anonymous ignored registry schema", () => {
    const registry = {
      schemaVersion: 1,
      kind: "p5211-local-real-fixture-registry",
      fixtures: [{
        id: "p5211-real-001",
        relativePath: "fixtures/p5211-real-001.mid",
        sha256: "a".repeat(64),
        bytes: 123,
        groundTruth: "human-unconfirmed",
      }],
    };
    expect(parseLocalRegistry(registry)).toEqual(registry);
    expect(() => parseLocalRegistry({
      ...registry,
      fixtures: [{ ...registry.fixtures[0], relativePath: "../private.mid" }],
    })).toThrow("schema");
  });

  it("renders only anonymous aggregate data", () => {
    const markdown = renderPrivacySafeBaselineMarkdown(baseline());
    expect(markdown).toContain("p5211-real-001");
    expect(markdown).toContain("Raw notes, source paths, and source titles are omitted");
    expect(markdown).not.toMatch(/[A-Z]:\\/u);
    expect(markdown).not.toContain(".mid");
  });
});

function note(pitch: number, startBeat: number, durationBeats: number): NormalizedTimedNote {
  return {
    pitch,
    startTick: startBeat * 480,
    durationTick: durationBeats * 480,
    velocity: 96,
    trackIndex: 1,
    channel: 0,
    program: 0,
    programExplicit: true,
    sourceTrackIndex: 1,
    isDrum: false,
    startBeat,
    endBeat: startBeat + durationBeats,
    sustainedEndBeat: startBeat + durationBeats,
  };
}

function baseline(): P5211LocalHarmonicCoreBaseline {
  return {
    schemaVersion: 1,
    kind: "p5211-current-harmonic-core-local-baseline",
    codeCandidateCommit: "a".repeat(40),
    fixtureId: "p5211-real-001",
    inputIntegrityVerified: true,
    deterministic: true,
    topology: {
      normalizedNoteCount: 6,
      voiceCount: 1,
      enabledVoiceCount: 1,
      sourceTrackCount: 1,
      channelTenVoiceCount: 0,
      maximumVoicePolyphony: 5,
      mixedTextureVoiceCount: 1,
      shortTopOverlayCandidateCount: 2,
      failureTopologyVerified: true,
      roleCounts: { harmony: 1 },
    },
    analysis: {
      timelineEventCount: 2,
      blockCandidateCount: 1,
      outputFingerprintSha256: "b".repeat(64),
    },
    privacy: {
      rawNotesPersisted: false,
      sourcePathPersisted: false,
      sourceTitlePersisted: false,
    },
  };
}
