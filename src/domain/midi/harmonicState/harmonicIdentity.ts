import { labelFromSymbol, makeChordSymbol, normalizePc } from "../../chords";
import { chordTemplates } from "../candidates";
import type { ChordQuality, ChordSymbol } from "../../types";

export interface P524HarmonicIdentity {
  readonly root: number;
  readonly quality: ChordQuality;
  readonly pitchClasses: readonly number[];
  readonly label: string;
}

const vocabularyByPitchClassSignature: ReadonlyMap<string, readonly P524HarmonicIdentity[]> = (() => {
  const index = new Map<string, P524HarmonicIdentity[]>();
  for (let root = 0; root < 12; root += 1) {
    for (const template of chordTemplates) {
      const pitchClasses = uniqueSorted([
        ...template.required,
        ...template.important,
        ...template.optional,
      ].map((interval) => normalizePc(root + interval)));
      const symbol = makeChordSymbol(root, template.quality);
      const identity = {
        root,
        quality: template.quality,
        pitchClasses,
        label: p524DisplayLabel(symbol),
      };
      const signature = pitchClasses.join(",");
      const candidates = index.get(signature) ?? [];
      candidates.push(identity);
      index.set(signature, candidates);
    }
  }
  return index;
})();

/**
 * Exact existing-vocabulary identity. Aliased signatures resolve only when a
 * stable Bass identifies one candidate root; an ambiguous non-root inversion
 * fails closed. Slash display is applied only after identity is unambiguous.
 */
export function identifyP524HarmonicState(
  pitchClasses: readonly number[],
  bassPitchClass: number | undefined,
): P524HarmonicIdentity | undefined {
  const normalized = uniqueSorted(pitchClasses.map(normalizePc));
  const candidates = vocabularyByPitchClassSignature.get(normalized.join(",")) ?? [];
  if (candidates.length === 0) return undefined;
  const bassRoot = bassPitchClass === undefined
    ? []
    : candidates.filter((candidate) => candidate.root === normalizePc(bassPitchClass));
  const resolved = bassRoot.length === 1 ? bassRoot[0] : candidates.length === 1 ? candidates[0] : undefined;
  return resolved === undefined ? undefined : { ...resolved, pitchClasses: normalized };
}

export function labelP524IdentityWithStableBass(
  identity: Pick<P524HarmonicIdentity, "root" | "quality" | "pitchClasses">,
  stableBassPitchClasses: readonly number[],
): string {
  const bass = uniqueSorted(stableBassPitchClasses);
  const stableBass = bass.length === 1 ? bass[0] : undefined;
  const slashBass = stableBass !== undefined
    && stableBass !== identity.root
    && identity.pitchClasses.includes(stableBass)
    ? stableBass
    : undefined;
  return p524DisplayLabel(makeChordSymbol(identity.root, identity.quality, [], slashBass));
}

export function sameP524HarmonicIdentity(
  left: Pick<P524HarmonicIdentity, "root" | "quality" | "pitchClasses">,
  right: Pick<P524HarmonicIdentity, "root" | "quality" | "pitchClasses">,
): boolean {
  return left.root === right.root
    && left.quality === right.quality
    && arraysEqual(left.pitchClasses, right.pitchClasses);
}

function p524DisplayLabel(symbol: ChordSymbol): string {
  const canonical = labelFromSymbol(symbol);
  return symbol.quality === "add9" ? canonical.replace("add9", "(add9)") : canonical;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
