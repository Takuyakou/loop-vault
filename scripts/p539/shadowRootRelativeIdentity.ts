import {
  makeChordSymbol,
  normalizePc,
  noteNameFromPitchClass,
  parseChordLabel,
  pitchClassFromNoteToken,
} from "../../src/domain/chords";
import {
  canonicalIdentityFromFactorized,
  factorizeChordSymbol,
  symbolFromFactorized,
  type CoreTriad,
  type SeventhKind,
  type TensionKind,
} from "../../src/domain/chordFactorization";
import type { NormalizedChordIdentity } from "../../src/domain/chordIdentity";
import { detectorQualities } from "../../src/domain/midi/evaluation/metricsV2";
import type { ChordSymbol } from "../../src/domain/types";

/**
 * Evaluation-only identity grammar for P5.39 Family C.
 *
 * This descriptor deliberately lives outside `src/`: it must prove the grammar
 * before the production `ChordSymbol`, parser, schema, or candidate vocabulary
 * can change. Root, upper structure, and bass are independent facts. Explicit
 * omissions describe a normally expected structural tone; they are not inferred
 * merely because a pitch class happens to be absent from an observed voicing.
 */
export type ShadowExtension = "6" | "9" | "11" | "13";
export type ShadowAlteration = "b9" | "#9" | "#11" | "b13" | "#5";
export type ShadowOmission = "no3" | "no5";

export interface ShadowRootRelativeIdentity {
  rootPitchClass: number;
  triad: CoreTriad;
  seventh: SeventhKind | null;
  extensions: readonly ShadowExtension[];
  alterations: readonly ShadowAlteration[];
  omissions: readonly ShadowOmission[];
  /** Omitted in root position; always independent from the upper identity. */
  bassPitchClass?: number;
}

export interface ShadowSourceNote {
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
}

export interface ShadowTargetArchetype {
  id: "altered-dominant-no5" | "dominant-11-no5";
  descriptor: Omit<ShadowRootRelativeIdentity, "rootPitchClass" | "bassPitchClass">;
}

export interface ShadowNeighborArchetype {
  id: "altered-dominant-with5" | "dominant-11-with5";
  descriptor: Omit<ShadowRootRelativeIdentity, "rootPitchClass" | "bassPitchClass">;
}

export interface ShadowAlterationNeighborArchetype {
  id:
    | "dominant-b9"
    | "dominant-sharp9"
    | "dominant-sharp11"
    | "dominant-b13"
    | "dominant-sharp5";
  descriptor: Omit<ShadowRootRelativeIdentity, "rootPitchClass" | "bassPitchClass">;
}

/** P5.40-02b fixed semantic neighbors; excluded from the frozen Stage01 catalog. */
export const STAGE02B_FIXED_ARCHETYPES = [
  {
    id: "explicit-minor-nine-eleven",
    descriptor: {
      triad: "minor", seventh: "minor7", extensions: ["9", "11"],
      alterations: [], omissions: [],
    },
  },
  {
    id: "dual-upper-alteration-no5",
    descriptor: {
      triad: "major", seventh: "minor7", extensions: [],
      alterations: ["#11", "b13"], omissions: ["no5"],
    },
  },
] as const;

export interface ShadowMetamorphicVariant {
  id:
    | "close"
    | "reordered"
    | "permuted"
    | "high-register"
    | "octave-spread"
    | "root-doubled"
    | "third-doubled"
    | "seventh-doubled"
    | "extension-doubled";
  notes: readonly ShadowSourceNote[];
}

export type ShadowResolution =
  | { status: "MATCH"; key: string }
  | { status: "AMBIGUOUS"; keys: readonly string[] }
  | { status: "UNSUPPORTED"; keys: readonly [] };

export type ShadowRepresentabilityStatus =
  | "REPRESENTABLE"
  | "NOT_REPRESENTABLE"
  | "AMBIGUOUS_BY_CONTRACT";

export type ShadowRepresentabilityReason =
  | "EXACT_BOUNDED_CATALOG_MATCH"
  | "NO_BOUNDED_CATALOG_MATCH"
  | "MULTIPLE_BOUNDED_CATALOG_MATCHES";

export interface ShadowRepresentabilityMatch {
  catalogId: string;
  key: string;
  label: string;
}

export interface ShadowRepresentabilityResult {
  status: ShadowRepresentabilityStatus;
  reasonCodes: readonly ShadowRepresentabilityReason[];
  matches: readonly ShadowRepresentabilityMatch[];
  candidateVisits: number;
}

const EXTENSION_ORDER: readonly ShadowExtension[] = ["6", "9", "11", "13"];
// Existing chords.ts order, restricted to alterations available in this shadow.
const ALTERATION_ORDER: readonly ShadowAlteration[] = ["b9", "#9", "#11", "b13", "#5"];
const OMISSION_ORDER: readonly ShadowOmission[] = ["no3", "no5"];

const EXTENSION_INTERVAL: Readonly<Record<ShadowExtension, number>> = {
  "6": 9,
  "9": 2,
  "11": 5,
  "13": 9,
};

const ALTERATION_INTERVAL: Readonly<Record<ShadowAlteration, number>> = {
  b9: 1,
  "#9": 3,
  "#11": 6,
  b13: 8,
  "#5": 8,
};

const TRIAD_INTERVALS: Readonly<Record<CoreTriad, readonly number[]>> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  power: [0, 7],
  unknown: [0],
};

const SEVENTH_INTERVAL: Readonly<Record<SeventhKind, number>> = {
  minor7: 10,
  major7: 11,
  diminished7: 9,
};

const THIRD_INTERVAL: Partial<Record<CoreTriad, number>> = {
  major: 4,
  minor: 3,
  diminished: 3,
  augmented: 4,
};

const FIFTH_INTERVAL: Partial<Record<CoreTriad, number>> = {
  major: 7,
  minor: 7,
  diminished: 6,
  augmented: 8,
  sus2: 7,
  sus4: 7,
  power: 7,
};

/** The only two evidence-backed Family-C templates authorized for Stage01. */
export const FAMILY_C_TARGET_ARCHETYPES: readonly ShadowTargetArchetype[] = [
  {
    id: "altered-dominant-no5",
    descriptor: {
      triad: "major",
      seventh: "minor7",
      extensions: [],
      alterations: ["#9", "b13"],
      omissions: ["no5"],
    },
  },
  {
    id: "dominant-11-no5",
    descriptor: {
      triad: "major",
      seventh: "minor7",
      extensions: ["9", "11"],
      alterations: [],
      omissions: ["no5"],
    },
  },
] as const;

/** Fixed hard-negative neighbors from the public-safe Stage00 matrix. */
export const FAMILY_C_NEIGHBOR_ARCHETYPES: readonly ShadowNeighborArchetype[] = [
  {
    id: "altered-dominant-with5",
    descriptor: {
      triad: "major",
      seventh: "minor7",
      extensions: [],
      alterations: ["#9", "b13"],
      omissions: [],
    },
  },
  {
    id: "dominant-11-with5",
    descriptor: {
      triad: "major",
      seventh: "minor7",
      extensions: ["9", "11"],
      alterations: [],
      omissions: [],
    },
  },
] as const;

/** Individually supported dominant alterations; never combined as a powerset. */
export const INDIVIDUAL_ALTERATION_NEIGHBOR_ARCHETYPES:
readonly ShadowAlterationNeighborArchetype[] = [
  ["dominant-b9", "b9"],
  ["dominant-sharp9", "#9"],
  ["dominant-sharp11", "#11"],
  ["dominant-b13", "b13"],
  ["dominant-sharp5", "#5"],
].map(([id, alteration]) => ({
  id: id as ShadowAlterationNeighborArchetype["id"],
  descriptor: {
    triad: "major",
    seventh: "minor7",
    extensions: [],
    alterations: [alteration as ShadowAlteration],
    omissions: [],
  },
}));

export const SHADOW_CATALOG_UPPER_TEMPLATE_COUNT = 30;
export const SHADOW_MAX_CANDIDATE_VISITS = 300;

function uniqueInOrder<T extends string>(
  values: readonly T[],
  order: readonly T[],
): T[] {
  return [...new Set(values)].sort(
    (left, right) => order.indexOf(left) - order.indexOf(right),
  );
}

function omissionIsStructural(triad: CoreTriad, omission: ShadowOmission): boolean {
  return omission === "no3" ? THIRD_INTERVAL[triad] !== undefined : FIFTH_INTERVAL[triad] !== undefined;
}

/** Canonicalizes ordering/deduplication and rejects semantically invalid omissions. */
export function normalizeShadowIdentity(
  identity: ShadowRootRelativeIdentity,
): ShadowRootRelativeIdentity | null {
  const omissions = uniqueInOrder(identity.omissions, OMISSION_ORDER);
  if (omissions.some((omission) => !omissionIsStructural(identity.triad, omission))) {
    return null;
  }

  const extensions = uniqueInOrder(identity.extensions, EXTENSION_ORDER);
  const alterations = uniqueInOrder(identity.alterations, ALTERATION_ORDER);
  const modifierIntervals = new Set([
    ...extensions.map((extension) => EXTENSION_INTERVAL[extension]),
    ...alterations.map((alteration) => ALTERATION_INTERVAL[alteration]),
  ]);
  const omittedIntervals = omissions.map((omission) => (
    omission === "no3" ? THIRD_INTERVAL[identity.triad] : FIFTH_INTERVAL[identity.triad]
  ));
  // A PC-only oracle cannot prove that a structural tone is absent while an
  // explicitly named modifier supplies the same PC. Reject instead of silently
  // erasing either semantic fact (for example, minor/no3 together with #9).
  if (omittedIntervals.some((interval) => (
    interval !== undefined && modifierIntervals.has(interval)
  ))) return null;

  const rootPitchClass = normalizePc(identity.rootPitchClass);
  const bassPitchClass = identity.bassPitchClass === undefined
    ? undefined
    : normalizePc(identity.bassPitchClass);

  return {
    rootPitchClass,
    triad: identity.triad,
    seventh: identity.seventh,
    extensions,
    alterations,
    omissions,
    ...(bassPitchClass !== undefined && bassPitchClass !== rootPitchClass
      ? { bassPitchClass }
      : {}),
  };
}

/** Root/bass-independent semantic key used to prove transposition invariance. */
export function shadowRootRelativeKey(identity: ShadowRootRelativeIdentity): string | null {
  const normalized = normalizeShadowIdentity(identity);
  if (!normalized) return null;
  return [
    normalized.triad,
    normalized.seventh ?? "-",
    normalized.extensions.join("."),
    normalized.alterations.join("."),
    normalized.omissions.join("."),
  ].join("|");
}

/** Stable full identity key. Input modifier order cannot change this key. */
export function shadowIdentityKey(identity: ShadowRootRelativeIdentity): string | null {
  const normalized = normalizeShadowIdentity(identity);
  if (!normalized) return null;
  return [
    normalized.rootPitchClass,
    shadowRootRelativeKey(normalized),
    normalized.bassPitchClass ?? "-",
  ].join("|");
}

interface BoundedShadowCatalogEntry {
  id: string;
  identity: ShadowRootRelativeIdentity;
}

function attachCatalogBass(
  identity: ShadowRootRelativeIdentity,
  bassPitchClass?: number,
): ShadowRootRelativeIdentity {
  if (bassPitchClass === undefined || normalizePc(bassPitchClass) === identity.rootPitchClass) {
    return identity;
  }
  return { ...identity, bassPitchClass: normalizePc(bassPitchClass) };
}

/**
 * The complete Stage01 catalog: 21 existing production qualities, two
 * public-safe Family-C targets, two with-fifth hard-negative neighbors, and five
 * individually supported dominant-alteration neighbors.
 * Optional bass multiplies none of the modifier space; it is attached after the
 * bounded upper identity has been selected.
 */
export function buildBoundedShadowCatalog(
  rootPitchClass: number,
  bassPitchClass?: number,
): readonly BoundedShadowCatalogEntry[] {
  const root = normalizePc(rootPitchClass);
  const existing = detectorQualities.map((quality) => ({
    id: `production:${quality}`,
    identity: productionControlIdentity(root, quality, bassPitchClass),
  }));
  const targets = FAMILY_C_TARGET_ARCHETYPES.map((archetype) => ({
    id: `target:${archetype.id}`,
    identity: attachCatalogBass({ rootPitchClass: root, ...archetype.descriptor }, bassPitchClass),
  }));
  const neighbors = FAMILY_C_NEIGHBOR_ARCHETYPES.map((archetype) => ({
    id: `neighbor:${archetype.id}`,
    identity: attachCatalogBass({ rootPitchClass: root, ...archetype.descriptor }, bassPitchClass),
  }));
  const alterationNeighbors = INDIVIDUAL_ALTERATION_NEIGHBOR_ARCHETYPES.map((archetype) => ({
    id: `alteration-neighbor:${archetype.id}`,
    identity: attachCatalogBass({ rootPitchClass: root, ...archetype.descriptor }, bassPitchClass),
  }));
  return [...existing, ...targets, ...neighbors, ...alterationNeighbors];
}

/** True only for one of the fixed Stage01 upper-identity templates. */
export function isBoundedShadowGrammarIdentity(identity: ShadowRootRelativeIdentity): boolean {
  const normalized = normalizeShadowIdentity(identity);
  const familyKey = normalized ? shadowRootRelativeKey(normalized) : null;
  if (!normalized || !familyKey) return false;
  return buildBoundedShadowCatalog(0).some((entry) => (
    shadowRootRelativeKey(entry.identity) === familyKey
  ));
}

/** Opt-in grammar extension; frozen Stage01 representability stays unchanged. */
export function isStage02bShadowGrammarIdentity(identity: ShadowRootRelativeIdentity): boolean {
  if (isBoundedShadowGrammarIdentity(identity)) return true;
  const key = shadowRootRelativeKey(identity);
  return key !== null && STAGE02B_FIXED_ARCHETYPES.some(({ descriptor }) => (
    shadowRootRelativeKey({ rootPitchClass: 0, ...descriptor }) === key
  ));
}

function removeOmittedStructuralIntervals(
  identity: ShadowRootRelativeIdentity,
  intervals: Set<number>,
): void {
  if (identity.omissions.includes("no3")) {
    const third = THIRD_INTERVAL[identity.triad];
    if (third !== undefined) intervals.delete(third);
  }
  if (identity.omissions.includes("no5")) {
    const fifth = FIFTH_INTERVAL[identity.triad];
    if (fifth !== undefined) intervals.delete(fifth);
  }
}

/** Exact upper-structure pitch-class content implied by an explicit identity. */
export function shadowUpperIntervals(
  identity: ShadowRootRelativeIdentity,
): readonly number[] | null {
  const normalized = normalizeShadowIdentity(identity);
  if (!normalized) return null;

  const intervals = new Set(TRIAD_INTERVALS[normalized.triad]);
  if (normalized.seventh) intervals.add(SEVENTH_INTERVAL[normalized.seventh]);
  normalized.extensions.forEach((extension) => intervals.add(EXTENSION_INTERVAL[extension]));
  normalized.alterations.forEach((alteration) => intervals.add(ALTERATION_INTERVAL[alteration]));
  removeOmittedStructuralIntervals(normalized, intervals);
  return [...intervals].sort((left, right) => left - right);
}

/** Converts an existing production chord into the shadow grammar without changing it. */
export function shadowIdentityFromChordSymbol(symbol: ChordSymbol): ShadowRootRelativeIdentity {
  const factorized = factorizeChordSymbol(symbol);
  const extensions = factorized.tensions.filter(
    (tension): tension is ShadowExtension => EXTENSION_ORDER.includes(tension as ShadowExtension),
  );
  const alterations = factorized.tensions.filter(
    (tension): tension is ShadowAlteration => ALTERATION_ORDER.includes(tension as ShadowAlteration),
  );
  const rootPitchClass = normalizePc(factorized.root);
  const bassPitchClass = normalizePc(factorized.bass);
  return {
    rootPitchClass,
    triad: factorized.triad,
    seventh: factorized.seventh,
    extensions,
    alterations,
    omissions: [],
    ...(bassPitchClass !== rootPitchClass ? { bassPitchClass } : {}),
  };
}

/**
 * Converts only omission-free shadow identities back to the existing normalized
 * identity. A target with `no3`/`no5` intentionally has no production identity.
 */
export function productionIdentityFromShadow(
  identity: ShadowRootRelativeIdentity,
): NormalizedChordIdentity | null {
  const normalized = normalizeShadowIdentity(identity);
  if (!normalized || normalized.omissions.length > 0) return null;
  return canonicalIdentityFromFactorized({
    root: normalized.rootPitchClass,
    triad: normalized.triad,
    seventh: normalized.seventh,
    tensions: [...normalized.extensions, ...normalized.alterations] as TensionKind[],
    bass: normalized.bassPitchClass ?? normalized.rootPitchClass,
  });
}

function isDominantEleven(identity: ShadowRootRelativeIdentity): boolean {
  return identity.triad === "major"
    && identity.seventh === "minor7"
    && identity.extensions.length === 2
    && identity.extensions[0] === "9"
    && identity.extensions[1] === "11"
    && identity.alterations.length === 0;
}

function addOmissionsToLabel(label: string, omissions: readonly ShadowOmission[]): string {
  if (omissions.length === 0) return label;
  const bassMatch = /\/[A-G](?:#|b)*$/.exec(label);
  const bass = bassMatch?.[0] ?? "";
  const upper = bassMatch ? label.slice(0, -bass.length) : label;
  const parenthesized = /\(([^)]*)\)$/.exec(upper);
  if (!parenthesized) return `${upper}(${omissions.join(",")})${bass}`;
  const existing = parenthesized[1];
  const joined = [existing, ...omissions].filter(Boolean).join(",");
  return `${upper.slice(0, parenthesized.index)}(${joined})${bass}`;
}

/** Deterministic, explicit Shadow notation. Never emits the ambiguous `alt` token. */
export function formatShadowIdentity(
  identity: ShadowRootRelativeIdentity,
  allowStage02b = false,
): string | null {
  const normalized = normalizeShadowIdentity(identity);
  if (!normalized || !(allowStage02b
    ? isStage02bShadowGrammarIdentity(normalized)
    : isBoundedShadowGrammarIdentity(normalized))) return null;

  const root = noteNameFromPitchClass(normalized.rootPitchClass);
  const bass = normalized.bassPitchClass === undefined
    ? ""
    : `/${noteNameFromPitchClass(normalized.bassPitchClass)}`;

  if (isDominantEleven(normalized)) {
    return `${root}11${normalized.omissions.length ? `(${normalized.omissions.join(",")})` : ""}${bass}`;
  }

  const symbol = symbolFromFactorized({
    root: normalized.rootPitchClass,
    triad: normalized.triad,
    seventh: normalized.seventh,
    tensions: [...normalized.extensions, ...normalized.alterations] as TensionKind[],
    bass: normalized.bassPitchClass ?? normalized.rootPitchClass,
  });
  if (!symbol) return null;
  return addOmissionsToLabel(symbol.label, normalized.omissions);
}

const NOTE_TOKEN = "[A-G](?:#|b)*";
const SHADOW_MODIFIER = new Set<string>([
  ...EXTENSION_ORDER,
  ...ALTERATION_ORDER,
  ...OMISSION_ORDER,
]);

/** Parses bounded Shadow notation without widening the production parser. */
export function parseShadowChordLabel(label: string, allowStage02b = false): ShadowRootRelativeIdentity | null {
  const trimmed = label.trim();
  if (/alt/i.test(trimmed)) return null;

  const rootMatch = new RegExp(`^(${NOTE_TOKEN})`).exec(trimmed);
  if (!rootMatch) return null;
  const rootPitchClass = pitchClassFromNoteToken(rootMatch[1]);
  if (rootPitchClass === undefined) return null;

  let rest = trimmed.slice(rootMatch[1].length);
  let bassPitchClass: number | undefined;
  const bassMatch = new RegExp(`/(${NOTE_TOKEN})$`).exec(rest);
  if (bassMatch) {
    bassPitchClass = pitchClassFromNoteToken(bassMatch[1]);
    rest = rest.slice(0, -bassMatch[0].length);
  }

  const modifierMatch = /\(([^)]*)\)$/.exec(rest);
  const tokens = modifierMatch
    ? modifierMatch[1].split(/[\s,]+/).filter(Boolean)
    : [];
  if (tokens.some((token) => !SHADOW_MODIFIER.has(token))) return null;
  const qualitySurface = modifierMatch ? rest.slice(0, modifierMatch.index) : rest;
  const omissions = tokens.filter((token): token is ShadowOmission => (
    OMISSION_ORDER.includes(token as ShadowOmission)
  ));
  const writtenTensions = tokens.filter((token) => !OMISSION_ORDER.includes(token as ShadowOmission));

  if (qualitySurface === "11") {
    const descriptor: ShadowRootRelativeIdentity = {
      rootPitchClass,
      triad: "major",
      seventh: "minor7",
      extensions: ["9", "11", ...writtenTensions.filter(
        (token): token is ShadowExtension => EXTENSION_ORDER.includes(token as ShadowExtension),
      )],
      alterations: writtenTensions.filter(
        (token): token is ShadowAlteration => ALTERATION_ORDER.includes(token as ShadowAlteration),
      ),
      omissions,
      ...(bassPitchClass !== undefined ? { bassPitchClass } : {}),
    };
    const normalized = normalizeShadowIdentity(descriptor);
    return normalized && (allowStage02b
      ? isStage02bShadowGrammarIdentity(normalized)
      : isBoundedShadowGrammarIdentity(normalized)) ? normalized : null;
  }

  const productionLabel = `${rootMatch[1]}${qualitySurface}${writtenTensions.length
    ? `(${writtenTensions.join(",")})`
    : ""}${bassMatch?.[0] ?? ""}`;
  const symbol = parseChordLabel(productionLabel);
  if (!symbol) return null;
  const parsed = shadowIdentityFromChordSymbol(symbol);
  const normalized = normalizeShadowIdentity({
    ...parsed,
    ...(allowStage02b ? {
      extensions: [...parsed.extensions, ...writtenTensions.filter(
        (token): token is ShadowExtension => EXTENSION_ORDER.includes(token as ShadowExtension),
      )],
      alterations: [...parsed.alterations, ...writtenTensions.filter(
        (token): token is ShadowAlteration => ALTERATION_ORDER.includes(token as ShadowAlteration),
      )],
    } : {}),
    omissions,
  });
  return normalized && (allowStage02b
    ? isStage02bShadowGrammarIdentity(normalized)
    : isBoundedShadowGrammarIdentity(normalized)) ? normalized : null;
}

export function buildFamilyCTargetIdentities(): Array<{
  archetypeId: ShadowTargetArchetype["id"];
  identity: ShadowRootRelativeIdentity;
}> {
  return FAMILY_C_TARGET_ARCHETYPES.flatMap((archetype) => (
    Array.from({ length: 12 }, (_, rootPitchClass) => ({
      archetypeId: archetype.id,
      identity: { rootPitchClass, ...archetype.descriptor },
    }))
  ));
}

export function buildFamilyCNeighborIdentities(): Array<{
  archetypeId: ShadowNeighborArchetype["id"];
  identity: ShadowRootRelativeIdentity;
}> {
  return FAMILY_C_NEIGHBOR_ARCHETYPES.flatMap((archetype) => (
    Array.from({ length: 12 }, (_, rootPitchClass) => ({
      archetypeId: archetype.id,
      identity: { rootPitchClass, ...archetype.descriptor },
    }))
  ));
}

export function buildIndividualAlterationNeighborIdentities(): Array<{
  archetypeId: ShadowAlterationNeighborArchetype["id"];
  identity: ShadowRootRelativeIdentity;
}> {
  return INDIVIDUAL_ALTERATION_NEIGHBOR_ARCHETYPES.flatMap((archetype) => (
    Array.from({ length: 12 }, (_, rootPitchClass) => ({
      archetypeId: archetype.id,
      identity: { rootPitchClass, ...archetype.descriptor },
    }))
  ));
}

/** One deterministic first-inversion/slash contract for every target and root. */
export function buildFamilyCTargetSlashIdentities(): Array<{
  archetypeId: ShadowTargetArchetype["id"];
  identity: ShadowRootRelativeIdentity;
}> {
  return buildFamilyCTargetIdentities().map(({ archetypeId, identity }) => ({
    archetypeId,
    identity: { ...identity, bassPitchClass: normalizePc(identity.rootPitchClass + 4) },
  }));
}

function sourceNote(pitch: number, index: number): ShadowSourceNote {
  return {
    pitch,
    startTick: index * 12,
    durationTicks: 96 + index,
    velocity: 72 + index,
  };
}

/** Fixed transforms per target/root; no modifier cross-product or random runtime state. */
export function buildShadowMetamorphicVariants(
  identity: ShadowRootRelativeIdentity,
): readonly ShadowMetamorphicVariant[] {
  const normalized = normalizeShadowIdentity(identity);
  const intervals = normalized ? shadowUpperIntervals(normalized) : null;
  if (!normalized || !intervals) return [];
  const base = 48 + normalized.rootPitchClass;
  const close = intervals.map((interval) => base + interval);
  const permuted = [...close.slice(2), ...close.slice(0, 2)];
  const highRegister = close.map((pitch) => pitch + 24);
  const spread = intervals.map((interval, index) => base + interval + (index % 3) * 12);
  const third = THIRD_INTERVAL[normalized.triad];
  const seventh = normalized.seventh ? SEVENTH_INTERVAL[normalized.seventh] : undefined;
  const extension = normalized.extensions.length > 0
    ? EXTENSION_INTERVAL[normalized.extensions[0]]
    : ALTERATION_INTERVAL[normalized.alterations[0]];
  if (third === undefined || seventh === undefined || extension === undefined) return [];
  const variants: readonly [ShadowMetamorphicVariant["id"], readonly number[]][] = [
    ["close", close],
    ["reordered", [...close].reverse()],
    ["permuted", permuted],
    ["high-register", highRegister],
    ["octave-spread", spread],
    ["root-doubled", [...close, base + 24]],
    ["third-doubled", [...close, base + third + 24]],
    ["seventh-doubled", [...close, base + seventh + 24]],
    ["extension-doubled", [...close, base + extension + 24]],
  ];
  return variants.map(([id, pitches]) => ({
    id,
    notes: pitches.map(sourceNote),
  }));
}

export function rootRelativePitchClasses(
  rootPitchClass: number,
  notes: readonly ShadowSourceNote[],
): readonly number[] {
  return [...new Set(notes.map((note) => normalizePc(note.pitch - rootPitchClass)))]
    .sort((left, right) => left - right);
}

/** Pure exact oracle. Bass is compared separately and is never inferred from note order. */
export function shadowIdentityMatches(
  identity: ShadowRootRelativeIdentity,
  upperNotes: readonly ShadowSourceNote[],
  bassPitchClass?: number,
): boolean {
  const normalized = normalizeShadowIdentity(identity);
  const expected = normalized ? shadowUpperIntervals(normalized) : null;
  if (!normalized || !expected) return false;
  const observed = rootRelativePitchClasses(normalized.rootPitchClass, upperNotes);
  const expectedBass = normalized.bassPitchClass;
  const normalizedObservedBass = bassPitchClass === undefined ? undefined : normalizePc(bassPitchClass);
  const observedBass = normalizedObservedBass === normalized.rootPitchClass
    ? undefined
    : normalizedObservedBass;
  if (expectedBass !== observedBass) return false;
  return observed.length === expected.length
    && observed.every((interval, index) => interval === expected[index]);
}

/**
 * Catalog-backed representability decision. Callers supply evidence and,
 * optionally, a proposed root; they cannot supply or prune the candidate list.
 */
export function evaluateShadowRepresentability(input: {
  upperNotes: readonly ShadowSourceNote[];
  rootPitchClass?: number;
  bassPitchClass?: number;
}): ShadowRepresentabilityResult {
  const observedPitchClasses = [...new Set(input.upperNotes.map((note) => normalizePc(note.pitch)))]
    .sort((left, right) => left - right);
  // Every catalog identity contains its root and has at most six unique upper
  // pitch classes. With no proposed root, only observed PCs can be roots. This
  // evidence index keeps worst-case lookup at 6 x 30 = 180 visits.
  const roots = input.rootPitchClass === undefined
    ? (observedPitchClasses.length <= 6 ? observedPitchClasses : [])
    : [normalizePc(input.rootPitchClass)];
  const candidateVisits = roots.length * SHADOW_CATALOG_UPPER_TEMPLATE_COUNT;
  if (candidateVisits > SHADOW_MAX_CANDIDATE_VISITS) {
    throw new Error(`Shadow catalog visit bound exceeded: ${candidateVisits}`);
  }
  const matches = roots.flatMap((root) => (
    buildBoundedShadowCatalog(root, input.bassPitchClass)
      .filter((entry) => shadowIdentityMatches(
        entry.identity,
        input.upperNotes,
        input.bassPitchClass,
      ))
      .map((entry): ShadowRepresentabilityMatch | null => {
        const key = shadowIdentityKey(entry.identity);
        const label = formatShadowIdentity(entry.identity);
        return key && label ? { catalogId: entry.id, key, label } : null;
      })
      .filter((entry): entry is ShadowRepresentabilityMatch => entry !== null)
  ));
  const unique = [...new Map(matches.map((match) => [match.key, match])).values()]
    .sort((left, right) => left.key.localeCompare(right.key));

  if (unique.length === 0) {
    return {
      status: "NOT_REPRESENTABLE",
      reasonCodes: ["NO_BOUNDED_CATALOG_MATCH"],
      matches: [],
      candidateVisits,
    };
  }
  if (unique.length > 1) {
    return {
      status: "AMBIGUOUS_BY_CONTRACT",
      reasonCodes: ["MULTIPLE_BOUNDED_CATALOG_MATCHES"],
      matches: unique,
      candidateVisits,
    };
  }
  return {
    status: "REPRESENTABLE",
    reasonCodes: ["EXACT_BOUNDED_CATALOG_MATCH"],
    matches: unique,
    candidateVisits,
  };
}

/** Returns ambiguity instead of forcing one identity for an enharmonic PC set. */
export function resolveShadowIdentity(
  candidates: readonly ShadowRootRelativeIdentity[],
  upperNotes: readonly ShadowSourceNote[],
  bassPitchClass?: number,
): ShadowResolution {
  const keys = [...new Set(candidates
    .filter((candidate) => shadowIdentityMatches(candidate, upperNotes, bassPitchClass))
    .map(shadowIdentityKey)
    .filter((key): key is string => key !== null))]
    .sort();
  if (keys.length === 0) return { status: "UNSUPPORTED", keys: [] };
  if (keys.length > 1) return { status: "AMBIGUOUS", keys };
  return { status: "MATCH", key: keys[0] };
}

/** Convenience for existing-quality control generation; not a candidate generator. */
export function productionControlIdentity(
  rootPitchClass: number,
  quality: Parameters<typeof makeChordSymbol>[1],
  bassPitchClass?: number,
): ShadowRootRelativeIdentity {
  return shadowIdentityFromChordSymbol(makeChordSymbol(rootPitchClass, quality, [], bassPitchClass));
}
