import { describe, expect, it } from "vitest";

import { normalizePc } from "../../src/domain/chords";
import { buildMidi } from "../p534/fixtures";
import { evaluateStage03bInteractions, projectStage03bTimeline } from "../p539/stage03bInteraction";
import { exactRankingEvidence, rankStage02ShadowCandidates } from "../p539/shadowCandidateRanking";
import {
  STAGE02B_FIXED_ARCHETYPES,
  buildShadowMetamorphicVariants,
  shadowIdentityKey,
  type ShadowRootRelativeIdentity,
} from "../p539/shadowRootRelativeIdentity";
import { rankStage02bShadowCandidates } from "./stage02bShadowRanking";
import {
  certifyStage02cWinner,
  evaluateStage02cSafeActivation,
  frozenPrefixWinner,
} from "./stage02cSafeActivation";

const ticksPerBeat = 96;

function sequence(parts: readonly { notes: readonly number[]; start: number; duration: number }[]): Uint8Array {
  return buildMidi({
    ticksPerBeat,
    tempoMicrosPerBeat: 500_000,
    notes: parts.flatMap((part) => part.notes.map((pitch) => ({
      pitch, startTick: part.start * ticksPerBeat, durationTick: part.duration * ticksPerBeat,
    }))),
  });
}

describe("P5.40-02c safe activation over the frozen prefix", () => {
  it("recovers the exact 276-prefix winner from a single bounded enriched evaluation", () => {
    for (let root = 0; root < 12; root += 1) {
      for (const archetype of STAGE02B_FIXED_ARCHETYPES) {
        const identity: ShadowRootRelativeIdentity = { rootPitchClass: root, ...archetype.descriptor };
        for (const bassPitchClass of [root, normalizePc(root + (identity.triad === "minor" ? 3 : 4))]) {
          const evidence = exactRankingEvidence({ ...identity, bassPitchClass });
          const enriched = rankStage02bShadowCandidates(evidence);
          const frozen = rankStage02ShadowCandidates(evidence);
          expect(frozenPrefixWinner(enriched).identityKey).toBe(frozen.topCandidate.identityKey);
          expect(enriched.candidateVisits).toBeLessThanOrEqual(300);
        }
      }
    }
  }, 30_000);

  it("requires a source-semantic improvement and fails closed on structural conflict", () => {
    const identity: ShadowRootRelativeIdentity = {
      rootPitchClass: 0, ...STAGE02B_FIXED_ARCHETYPES[0]!.descriptor,
    };
    const evidence = exactRankingEvidence(identity);
    const result = rankStage02bShadowCandidates(evidence);
    const certified = certifyStage02cWinner(result, evidence);
    expect(certified.selected.identityKey).toBe(result.topCandidate.identityKey);
    expect(["same", "certified"]).toContain(certified.reason);

    const unsupported = { ...evidence, histogram: [...evidence.histogram] };
    unsupported.histogram[normalizePc(identity.rootPitchClass + 5)] = 0;
    const denied = certifyStage02cWinner(result, unsupported);
    expect(denied.selected.identityKey).toBe(denied.baseline.identityKey);
    expect(denied.reason).toBe("structural");
  });

  it("keeps structurally complete local corrections across roots, basses and invariant transforms", () => {
    for (let root = 0; root < 12; root += 1) {
      for (const archetype of STAGE02B_FIXED_ARCHETYPES) {
        const upper: ShadowRootRelativeIdentity = { rootPitchClass: root, ...archetype.descriptor };
        for (const bassPitchClass of [root, normalizePc(root + (upper.triad === "minor" ? 3 : 4))]) {
          const identity = bassPitchClass === root ? upper : { ...upper, bassPitchClass };
          const evidence = exactRankingEvidence(identity);
          const result = rankStage02bShadowCandidates(evidence);
          expect(certifyStage02cWinner(result, evidence).selected.identityKey)
            .toBe(shadowIdentityKey(identity));
        }
        for (const variant of buildShadowMetamorphicVariants(upper)) {
          const histogram = Array(12).fill(0) as number[];
          variant.notes.forEach((note) => { histogram[normalizePc(note.pitch)] += 1; });
          const evidence = { histogram, bassPitchClass: root };
          const result = rankStage02bShadowCandidates(evidence);
          expect(certifyStage02cWinner(result, evidence).selected.identityKey)
            .toBe(shadowIdentityKey(upper));
        }
      }
    }
  }, 30_000);

  it("preserves the frozen projection for ordinary unsplit material and source order", () => {
    const bytes = sequence([{ notes: [48, 52, 55, 59], start: 0, duration: 4 }]);
    const before = Uint8Array.from(bytes);
    const result = evaluateStage02cSafeActivation(bytes);
    const frozen = evaluateStage03bInteractions(bytes);
    expect(result.baselineFinal).toEqual(projectStage03bTimeline(frozen.data, frozen.windows, "model-a"));
    expect(result.final).toEqual(result.baselineFinal);
    expect(result.traces.every((trace) => trace.candidateVisits.every((visits) => visits <= 300))).toBe(true);
    expect(evaluateStage02cSafeActivation(bytes)).toEqual(result);
    expect(bytes).toEqual(before);
  });

  it("reconstructs the frozen Family B projection across mixed two-beat windows", () => {
    const bytes = sequence([
      { notes: [48, 52, 55], start: 0, duration: 1 },
      { notes: [45, 49, 64], start: 1, duration: 1 },
      { notes: [41, 45, 48, 52], start: 2, duration: 2 },
      { notes: [43, 47, 50, 53], start: 4, duration: 1 },
      { notes: [48, 51, 55, 58], start: 5, duration: 1 },
    ]);
    const frozen = evaluateStage03bInteractions(bytes);
    const result = evaluateStage02cSafeActivation(bytes);
    expect(result.baselineFinal).toEqual(projectStage03bTimeline(frozen.data, frozen.windows, "model-a"));
    expect(result.traces.map((trace) => trace.baselineTriggered))
      .toEqual(frozen.windows.map((row) => row.expandedDecision.triggered));
  });

  it("admits coherent same-root sub-beat changes but rejects re-strike and bass-only movement", () => {
    const temporal = sequence([
      { notes: [48, 52, 55, 59], start: 0, duration: 1 },
      { notes: [48, 52, 55, 58], start: 1, duration: 0.5 },
      { notes: [48, 51, 55, 58], start: 1.5, duration: 0.5 },
    ]);
    expect(evaluateStage02cSafeActivation(temporal).traces[0]?.microPartitioned).toBe(true);
    const negatives = [
      sequence([
        { notes: [48, 52, 55, 58], start: 0, duration: 1 },
        { notes: [48, 52, 55, 58], start: 1, duration: 1 },
      ]),
      sequence([
        { notes: [48, 52, 55, 58], start: 0, duration: 1 },
        { notes: [52, 55, 58, 60], start: 1, duration: 1 },
      ]),
      sequence([
        { notes: [48, 52, 55, 58], start: 0, duration: 1 },
        { notes: [48, 55], start: 1, duration: 1 },
      ]),
    ];
    negatives.forEach((bytes) => {
      expect(evaluateStage02cSafeActivation(bytes).traces[0]?.microPartitioned).toBe(false);
    });
  });
});
