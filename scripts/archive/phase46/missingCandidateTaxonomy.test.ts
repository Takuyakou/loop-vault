import { describe, expect, it } from "vitest";
import {
  classifyMissingCandidate,
  type MissingCandidateSignals,
} from "./missingCandidateTaxonomy";

const base: MissingCandidateSignals = {
  representable: true,
  canonicalRoundTrip: true,
  rootHypothesisPresent: true,
  triadCorePresent: true,
  seventhCorePresent: true,
  exactIgnoringBassPresent: false,
  expectedHasAlteration: false,
  baseWithoutAlterationPresent: false,
  expectedHasTension: false,
  baseWithoutTensionPresent: false,
  expectedIsSuspendedSeventh: false,
  suspendedTriadPresent: false,
  presentBeforeClamp: true,
  presentAfterBudget: true,
  evidenceSufficient: true,
};

describe("Phase 4.6 missing candidate taxonomy", () => {
  it("classifies root-position identities that only exist as slash chords", () => {
    expect(classifyMissingCandidate({
      ...base,
      exactIgnoringBassPresent: true,
    })).toBe("slash-bass-generation-missing");
  });

  it("classifies missing alterations after the dominant seventh core", () => {
    expect(classifyMissingCandidate({
      ...base,
      expectedHasAlteration: true,
      baseWithoutAlterationPresent: true,
    })).toBe("alteration-generation-missing");
  });

  it("keeps suspended-seventh combination failures distinct", () => {
    expect(classifyMissingCandidate({
      ...base,
      seventhCorePresent: false,
      expectedIsSuspendedSeventh: true,
      suspendedTriadPresent: true,
    })).toBe("sus-combination-missing");
  });

  it("reports annotation and canonical contract failures before generation", () => {
    expect(classifyMissingCandidate({
      ...base,
      representable: false,
    })).toBe("annotation-contract-issue");
    expect(classifyMissingCandidate({
      ...base,
      canonicalRoundTrip: false,
    })).toBe("canonical-mapping-loss");
  });
});
