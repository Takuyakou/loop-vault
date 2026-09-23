import { describe, expect, it } from "vitest";

import { makeChordSymbol, normalizePc, parseChordLabel } from "../../src/domain/chords";
import { chordIdentityKey, normalizeChordSymbol } from "../../src/domain/chordIdentity";
import { detectorQualities, classifyRepresentability } from "../../src/domain/midi/evaluation/metricsV2";
import {
  FAMILY_C_TARGET_ARCHETYPES,
  SHADOW_CATALOG_UPPER_TEMPLATE_COUNT,
  SHADOW_MAX_CANDIDATE_VISITS,
  buildBoundedShadowCatalog,
  buildFamilyCNeighborIdentities,
  buildFamilyCTargetIdentities,
  buildFamilyCTargetSlashIdentities,
  buildIndividualAlterationNeighborIdentities,
  buildShadowMetamorphicVariants,
  evaluateShadowRepresentability,
  formatShadowIdentity,
  isBoundedShadowGrammarIdentity,
  normalizeShadowIdentity,
  parseShadowChordLabel,
  productionControlIdentity,
  productionIdentityFromShadow,
  resolveShadowIdentity,
  rootRelativePitchClasses,
  shadowIdentityKey,
  shadowIdentityMatches,
  shadowRootRelativeKey,
  shadowUpperIntervals,
  type ShadowRootRelativeIdentity,
  type ShadowSourceNote,
} from "./shadowRootRelativeIdentity";

function target(
  archetypeId: "altered-dominant-no5" | "dominant-11-no5",
  rootPitchClass = 0,
): ShadowRootRelativeIdentity {
  const archetype = FAMILY_C_TARGET_ARCHETYPES.find((entry) => entry.id === archetypeId);
  if (!archetype) throw new Error(`missing archetype ${archetypeId}`);
  return { rootPitchClass, ...archetype.descriptor };
}

function notesFor(identity: ShadowRootRelativeIdentity): ShadowSourceNote[] {
  const intervals = shadowUpperIntervals(identity);
  if (!intervals) throw new Error("identity has no pitch-class projection");
  const base = 48 + normalizePc(identity.rootPitchClass);
  return intervals.map((interval, index) => ({
    pitch: base + interval,
    startTick: index * 12,
    durationTicks: 96 + index,
    velocity: 72 + index,
  }));
}

describe("P5.39-01 root-relative Shadow identity grammar", () => {
  it("represents both Family-C targets for all 12 roots without root-specific branches", () => {
    const rows = buildFamilyCTargetIdentities();

    expect(rows).toHaveLength(24);
    for (const archetype of FAMILY_C_TARGET_ARCHETYPES) {
      const family = rows.filter((row) => row.archetypeId === archetype.id);
      expect(family).toHaveLength(12);
      expect(new Set(family.map((row) => row.identity.rootPitchClass))).toEqual(
        new Set(Array.from({ length: 12 }, (_, root) => root)),
      );
      expect(new Set(family.map((row) => shadowRootRelativeKey(row.identity))).size).toBe(1);
    }

    expect(shadowUpperIntervals(target("altered-dominant-no5"))).toEqual([0, 3, 4, 8, 10]);
    expect(shadowUpperIntervals(target("dominant-11-no5"))).toEqual([0, 2, 4, 5, 10]);
  });

  it("round-trips every target through deterministic explicit Shadow notation", () => {
    for (const { identity } of buildFamilyCTargetIdentities()) {
      const label = formatShadowIdentity(identity);
      expect(label).not.toBeNull();
      if (!label) throw new Error("Shadow formatter rejected bounded target identity");
      expect(label).not.toMatch(/alt/i);
      expect(label).toContain("no5");
      const parsed = parseShadowChordLabel(label);
      expect(parsed).not.toBeNull();
      if (!parsed) throw new Error(`Shadow parser rejected canonical label ${label}`);
      expect(shadowIdentityKey(parsed)).toBe(shadowIdentityKey(identity));
      expect(formatShadowIdentity(parsed)).toBe(label);
      expect(productionIdentityFromShadow(identity)).toBeNull();
      expect(classifyRepresentability(label).representability).toBe("parser-unsupported");
    }
  });

  it("covers order/permutation/register and each structural doubling separately", () => {
    const rows = buildFamilyCTargetIdentities();
    const variants = rows.flatMap(({ identity }) => (
      buildShadowMetamorphicVariants(identity).map((variant) => ({ identity, variant }))
    ));

    expect(variants).toHaveLength(24 * 9);
    expect(new Set(variants.map(({ variant }) => variant.id))).toEqual(new Set([
      "close",
      "reordered",
      "permuted",
      "high-register",
      "octave-spread",
      "root-doubled",
      "third-doubled",
      "seventh-doubled",
      "extension-doubled",
    ]));
    for (const { identity, variant } of variants) {
      expect(shadowIdentityMatches(identity, variant.notes)).toBe(true);
      expect(resolveShadowIdentity([identity], variant.notes)).toEqual({
        status: "MATCH",
        key: shadowIdentityKey(identity),
      });
      expect(rootRelativePitchClasses(identity.rootPitchClass, variant.notes)).toEqual(
        shadowUpperIntervals(identity),
      );
    }
  });

  it("treats omissions as explicit expected-tone facts rather than inferred absence", () => {
    const omittedFifth = target("dominant-11-no5", 7);
    const complete: ShadowRootRelativeIdentity = { ...omittedFifth, omissions: [] };
    const omittedNotes = buildShadowMetamorphicVariants(omittedFifth)[0].notes;

    expect(shadowIdentityMatches(omittedFifth, omittedNotes)).toBe(true);
    expect(shadowIdentityMatches(complete, omittedNotes)).toBe(false);
    expect(shadowUpperIntervals(complete)).toEqual([0, 2, 4, 5, 7, 10]);
    expect(shadowUpperIntervals({
      rootPitchClass: 0,
      triad: "minor",
      seventh: "minor7",
      extensions: [],
      alterations: [],
      omissions: ["no3"],
    })).toEqual([0, 7, 10]);
    expect(normalizeShadowIdentity({
      rootPitchClass: 0,
      triad: "sus4",
      seventh: null,
      extensions: [],
      alterations: [],
      omissions: ["no3"],
    })).toBeNull();
    expect(normalizeShadowIdentity({
      rootPitchClass: 0,
      triad: "augmented",
      seventh: "minor7",
      extensions: [],
      alterations: ["b13"],
      omissions: ["no5"],
    })).toBeNull();
    expect(normalizeShadowIdentity({
      rootPitchClass: 0,
      triad: "minor",
      seventh: "minor7",
      extensions: [],
      alterations: ["#9"],
      omissions: ["no3"],
    })).toBeNull();
  });

  it("canonicalizes modifier ordering, aliases, duplicates, and accidentals", () => {
    const scrambled: ShadowRootRelativeIdentity = {
      rootPitchClass: 7,
      triad: "major",
      seventh: "minor7",
      extensions: [],
      alterations: ["b13", "#9", "b13"],
      omissions: ["no5", "no5"],
    };
    const canonical = normalizeShadowIdentity(scrambled);
    expect(canonical?.alterations).toEqual(["#9", "b13"]);
    expect(canonical?.omissions).toEqual(["no5"]);
    expect(formatShadowIdentity(scrambled)).toBe("G7(#9,b13,no5)");

    const alias = parseShadowChordLabel("G7(no5,b13,#9)");
    expect(alias).not.toBeNull();
    if (!alias) throw new Error("Shadow parser rejected modifier-order alias");
    expect(shadowIdentityKey(alias)).toBe(shadowIdentityKey(scrambled));
    expect(formatShadowIdentity(alias)).toBe("G7(#9,b13,no5)");
    const flatTarget = parseShadowChordLabel("Gb11(no5)");
    expect(flatTarget).not.toBeNull();
    if (!flatTarget) throw new Error("Shadow parser rejected enharmonic target");
    expect(shadowIdentityKey(flatTarget)).toBe(shadowIdentityKey(target("dominant-11-no5", 6)));
    expect(parseShadowChordLabel("G7alt")).toBeNull();
  });

  it("rejects arbitrary modifier powersets outside the fixed 30-template catalog", () => {
    const arbitrary: ShadowRootRelativeIdentity = {
      rootPitchClass: 0,
      triad: "major",
      seventh: "minor7",
      extensions: [],
      alterations: ["b9", "#9", "#11", "b13", "#5"],
      omissions: ["no3", "no5"],
    };

    expect(buildBoundedShadowCatalog(0)).toHaveLength(SHADOW_CATALOG_UPPER_TEMPLATE_COUNT);
    expect(new Set(buildBoundedShadowCatalog(0).map((entry) => (
      shadowRootRelativeKey(entry.identity)
    ))).size).toBe(SHADOW_CATALOG_UPPER_TEMPLATE_COUNT);
    expect(isBoundedShadowGrammarIdentity(arbitrary)).toBe(false);
    expect(formatShadowIdentity(arbitrary)).toBeNull();
    expect(parseShadowChordLabel("C7(b9,#9,#11,b13,#5,no3,no5)")).toBeNull();
    expect(parseShadowChordLabel("C7(b9,#9)")).toBeNull();
  });

  it("supports each dominant alteration individually across 12 roots without overlabeling", () => {
    const neighbors = buildIndividualAlterationNeighborIdentities();
    expect(neighbors).toHaveLength(5 * 12);

    for (const { archetypeId, identity } of neighbors) {
      const label = formatShadowIdentity(identity);
      expect(label).not.toBeNull();
      if (!label) throw new Error(`Shadow formatter rejected ${archetypeId}`);
      const parsed = parseShadowChordLabel(label);
      expect(parsed).not.toBeNull();
      if (!parsed) throw new Error(`Shadow parser rejected ${label}`);
      expect(shadowIdentityKey(parsed)).toBe(shadowIdentityKey(identity));

      const result = evaluateShadowRepresentability({
        rootPitchClass: identity.rootPitchClass,
        upperNotes: notesFor(identity),
      });
      expect(result.candidateVisits).toBe(SHADOW_CATALOG_UPPER_TEMPLATE_COUNT);
      if (archetypeId === "dominant-b13" || archetypeId === "dominant-sharp5") {
        expect(result.status).toBe("AMBIGUOUS_BY_CONTRACT");
        expect(result.reasonCodes).toEqual(["MULTIPLE_BOUNDED_CATALOG_MATCHES"]);
        expect(result.matches).toHaveLength(2);
      } else {
        expect(result.status).toBe("REPRESENTABLE");
        expect(result.reasonCodes).toEqual(["EXACT_BOUNDED_CATALOG_MATCH"]);
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].catalogId).toBe(`alteration-neighbor:${archetypeId}`);
      }
    }

    const plainDominant = productionControlIdentity(7, "dom7");
    const plainResult = evaluateShadowRepresentability({
      rootPitchClass: 7,
      upperNotes: notesFor(plainDominant),
    });
    expect(plainResult.status).toBe("REPRESENTABLE");
    expect(plainResult.matches).toEqual([{
      catalogId: "production:dom7",
      key: shadowIdentityKey(plainDominant),
      label: "G7",
    }]);
  });

  it("uses the internal bounded catalog for target and neighboring representability", () => {
    for (const { archetypeId, identity } of buildFamilyCTargetIdentities()) {
      const result = evaluateShadowRepresentability({
        rootPitchClass: identity.rootPitchClass,
        upperNotes: notesFor(identity),
      });
      expect(result).toEqual({
        status: "REPRESENTABLE",
        reasonCodes: ["EXACT_BOUNDED_CATALOG_MATCH"],
        matches: [{
          catalogId: `target:${archetypeId}`,
          key: shadowIdentityKey(identity),
          label: formatShadowIdentity(identity),
        }],
        candidateVisits: SHADOW_CATALOG_UPPER_TEMPLATE_COUNT,
      });
    }

    for (const { archetypeId, identity } of buildFamilyCNeighborIdentities()) {
      const result = evaluateShadowRepresentability({
        rootPitchClass: identity.rootPitchClass,
        upperNotes: notesFor(identity),
      });
      expect(result.status).toBe("REPRESENTABLE");
      expect(result.reasonCodes).toEqual(["EXACT_BOUNDED_CATALOG_MATCH"]);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].catalogId).toBe(`neighbor:${archetypeId}`);
    }

    for (const quality of ["dom7", "dom9", "dom13", "sus4", "min11", "maj9", "add9"] as const) {
      const identity = productionControlIdentity(7, quality);
      const result = evaluateShadowRepresentability({
        rootPitchClass: 7,
        upperNotes: notesFor(identity),
      });
      expect(result.status).toBe("REPRESENTABLE");
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].catalogId).toBe(`production:${quality}`);
      expect(result.matches[0].label).toBe(makeChordSymbol(7, quality).label);
    }

    expect(evaluateShadowRepresentability({
      rootPitchClass: 0,
      upperNotes: [0, 1, 2].map((interval, index) => ({
        pitch: 48 + interval,
        startTick: index,
        durationTicks: 96,
        velocity: 80,
      })),
    })).toEqual({
      status: "NOT_REPRESENTABLE",
      reasonCodes: ["NO_BOUNDED_CATALOG_MATCH"],
      matches: [],
      candidateVisits: SHADOW_CATALOG_UPPER_TEMPLATE_COUNT,
    });

    const c6 = productionControlIdentity(0, "six");
    const ambiguous = evaluateShadowRepresentability({ upperNotes: notesFor(c6) });
    expect(ambiguous.status).toBe("AMBIGUOUS_BY_CONTRACT");
    expect(ambiguous.reasonCodes).toEqual(["MULTIPLE_BOUNDED_CATALOG_MATCHES"]);
    expect(ambiguous.matches.map((match) => match.label)).toEqual(expect.arrayContaining(["C6", "Am7"]));
    expect(ambiguous.candidateVisits).toBe(4 * SHADOW_CATALOG_UPPER_TEMPLATE_COUNT);
    expect(ambiguous.candidateVisits).toBeLessThanOrEqual(SHADOW_MAX_CANDIDATE_VISITS);

    const sixPcEvidence = evaluateShadowRepresentability({
      upperNotes: [0, 1, 2, 3, 4, 5].map((interval, index) => ({
        pitch: 48 + interval,
        startTick: index,
        durationTicks: 96,
        velocity: 80,
      })),
    });
    expect(sixPcEvidence.candidateVisits).toBe(6 * SHADOW_CATALOG_UPPER_TEMPLATE_COUNT);
    expect(sixPcEvidence.candidateVisits).toBeLessThanOrEqual(SHADOW_MAX_CANDIDATE_VISITS);
    const denseEvidence = evaluateShadowRepresentability({
      upperNotes: [0, 1, 2, 3, 4, 5, 6].map((interval, index) => ({
        pitch: 48 + interval,
        startTick: index,
        durationTicks: 96,
        velocity: 80,
      })),
    });
    expect(denseEvidence.status).toBe("NOT_REPRESENTABLE");
    expect(denseEvidence.candidateVisits).toBe(0);
  });

  it("covers target slash identities for both archetypes across all roots", () => {
    const slashTargets = buildFamilyCTargetSlashIdentities();
    expect(slashTargets).toHaveLength(24);

    for (const { archetypeId, identity } of slashTargets) {
      const bassPitchClass = identity.bassPitchClass;
      expect(bassPitchClass).toBeDefined();
      const label = formatShadowIdentity(identity);
      expect(label).toMatch(/\/[A-G](?:#|b)*$/);
      if (!label) throw new Error("Shadow formatter rejected bounded slash target");
      const parsed = parseShadowChordLabel(label);
      expect(parsed).not.toBeNull();
      if (!parsed) throw new Error(`Shadow parser rejected canonical slash target ${label}`);
      expect(shadowIdentityKey(parsed)).toBe(shadowIdentityKey(identity));
      const result = evaluateShadowRepresentability({
        rootPitchClass: identity.rootPitchClass,
        upperNotes: notesFor(identity),
        bassPitchClass,
      });
      expect(result.status).toBe("REPRESENTABLE");
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].catalogId).toBe(`target:${archetypeId}`);
    }
  });

  it("separates slash bass from the upper identity and never infers bass from note order", () => {
    const upper = target("altered-dominant-no5", 9);
    const slash: ShadowRootRelativeIdentity = { ...upper, bassPitchClass: 1 };
    const notes = buildShadowMetamorphicVariants(upper)[1].notes;

    expect(shadowRootRelativeKey(slash)).toBe(shadowRootRelativeKey(upper));
    expect(shadowIdentityKey(slash)).not.toBe(shadowIdentityKey(upper));
    expect(formatShadowIdentity(slash)).toBe("A7(#9,b13,no5)/C#");
    const parsedSlash = parseShadowChordLabel("A7(#9,b13,no5)/Db");
    expect(parsedSlash).not.toBeNull();
    if (!parsedSlash) throw new Error("Shadow parser rejected enharmonic slash target");
    expect(shadowIdentityKey(parsedSlash)).toBe(shadowIdentityKey(slash));
    expect(shadowIdentityMatches(slash, notes)).toBe(false);
    expect(shadowIdentityMatches(slash, notes, 1)).toBe(true);
    expect(shadowIdentityMatches(upper, notes)).toBe(true);
  });

  it("reports genuine pitch-class ambiguity instead of forcing the target label", () => {
    const altered = target("altered-dominant-no5", 4);
    const augmentedAlternative: ShadowRootRelativeIdentity = {
      rootPitchClass: 4,
      triad: "augmented",
      seventh: "minor7",
      extensions: [],
      alterations: ["#9"],
      omissions: [],
    };
    const notes = buildShadowMetamorphicVariants(altered)[0].notes;

    expect(shadowUpperIntervals(augmentedAlternative)).toEqual(shadowUpperIntervals(altered));
    const resolution = resolveShadowIdentity([altered, augmentedAlternative], notes);
    expect(resolution.status).toBe("AMBIGUOUS");
    if (resolution.status === "AMBIGUOUS") expect(resolution.keys).toHaveLength(2);
    expect(resolveShadowIdentity([
      { ...altered, rootPitchClass: normalizePc(altered.rootPitchClass + 1) },
    ], notes)).toEqual({ status: "UNSUPPORTED", keys: [] });
  });

  it("keeps all 21 existing qualities across 12 roots identity-exact", () => {
    const controls = detectorQualities.flatMap((quality) => (
      Array.from({ length: 12 }, (_, rootPitchClass) => ({ quality, rootPitchClass }))
    ));
    expect(controls).toHaveLength(21 * 12);

    for (const { quality, rootPitchClass } of controls) {
      const production = makeChordSymbol(rootPitchClass, quality);
      const shadow = productionControlIdentity(rootPitchClass, quality);
      const restored = productionIdentityFromShadow(shadow);
      expect(restored).not.toBeNull();
      if (!restored) throw new Error(`Production control did not restore ${production.label}`);
      expect(chordIdentityKey(restored)).toBe(chordIdentityKey(normalizeChordSymbol(production)));
      expect(formatShadowIdentity(shadow)).toBe(production.label);
      const parsed = parseShadowChordLabel(production.label);
      expect(parsed).not.toBeNull();
      if (!parsed) throw new Error(`Shadow parser rejected production control ${production.label}`);
      expect(shadowIdentityKey(parsed)).toBe(shadowIdentityKey(shadow));
    }
  });

  it("keeps 12 slash controls identity-exact and separate from their upper structures", () => {
    for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass += 1) {
      const bassPitchClass = normalizePc(rootPitchClass + 4);
      const production = makeChordSymbol(rootPitchClass, "maj", [], bassPitchClass);
      const shadow = productionControlIdentity(rootPitchClass, "maj", bassPitchClass);
      const upper = productionControlIdentity(rootPitchClass, "maj");
      const restored = productionIdentityFromShadow(shadow);
      expect(restored).not.toBeNull();
      if (!restored) throw new Error(`Slash control did not restore ${production.label}`);
      expect(chordIdentityKey(restored)).toBe(chordIdentityKey(normalizeChordSymbol(production)));
      expect(shadowRootRelativeKey(shadow)).toBe(shadowRootRelativeKey(upper));
      expect(shadowIdentityKey(shadow)).not.toBe(shadowIdentityKey(upper));
      expect(formatShadowIdentity(shadow)).toBe(production.label);
    }
  });

  it("is deterministic, bounded, and leaves every source-note field untouched", () => {
    expect(FAMILY_C_TARGET_ARCHETYPES).toHaveLength(2);
    expect(buildFamilyCTargetIdentities()).toHaveLength(24);
    expect(FAMILY_C_TARGET_ARCHETYPES.every((archetype) => (
      archetype.descriptor.extensions.length <= 2
      && archetype.descriptor.alterations.length <= 2
      && archetype.descriptor.omissions.length <= 1
    ))).toBe(true);

    const identity = target("dominant-11-no5", 11);
    const variants = buildShadowMetamorphicVariants(identity);
    expect(variants).toHaveLength(9);
    const before = structuredClone(variants);
    const label = formatShadowIdentity(identity);
    expect(label).not.toBeNull();
    if (!label) throw new Error("Shadow formatter rejected deterministic target");
    const first = JSON.stringify({
      key: shadowIdentityKey(identity),
      label,
      parse: parseShadowChordLabel(label),
      resolution: resolveShadowIdentity([identity], variants[8].notes),
    });
    const second = JSON.stringify({
      key: shadowIdentityKey(identity),
      label,
      parse: parseShadowChordLabel(label),
      resolution: resolveShadowIdentity([identity], variants[8].notes),
    });

    expect(second).toBe(first);
    expect(variants).toEqual(before);
    expect(parseChordLabel(label)).toBeNull();
  });
});
