import type { CorrectionCard } from "../../domain/correction/correctionModel";
import { progressionFunctions, type FunctionKind } from "../../domain/harmony/chordFunction";
import { degreeOf } from "../../domain/harmony/degrees";
import { displayDegreeLabel } from "../../ui/chordText";

/** What a card shows about its place in the key: the degree as it is drawn (Ⅱm7) and its role (T / SD / SDm / D, or "" for none). */
export interface CardHarmony {
  readonly degree: string;
  readonly role: FunctionKind;
}

const PITCH: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The same key spellings `degreeOf` reads (`C major`, `Eb major`, `F# minor`, `Am`, `C`). */
function tonicOf(key: string | undefined): { tonicPc: number; mode: "major" | "minor" } | undefined {
  const match = /^([A-G])(#|b)?(?:\s*(major|minor)|\s*(m))?$/i.exec(key?.trim() ?? "");
  if (!match) return undefined;
  const tonicPc = (PITCH[match[1]!.toUpperCase()]! + (match[2] === "#" ? 1 : match[2] === "b" ? 11 : 0)) % 12;
  return { tonicPc, mode: match[3]?.toLowerCase() === "minor" || match[4] ? "minor" : "major" };
}

/**
 * P23-14: the degree and the role of every card, by card id. Empty when the key is unknown or unreadable.
 * The role of a chord depends on the chord after it, so the cards are read in the order they sound.
 */
export function cardHarmony(
  cards: readonly Pick<CorrectionCard, "id" | "name" | "start">[],
  key: string | undefined,
): Map<string, CardHarmony> {
  const result = new Map<string, CardHarmony>();
  const tonic = tonicOf(key);
  if (!tonic) return result;
  const ordered = [...cards].sort((left, right) => left.start - right.start);
  const roles = progressionFunctions(ordered.map(({ name }) => ({
    rootPc: name.root,
    quality: name.quality,
    tensions: name.tensions,
    ...(name.bass === undefined ? {} : { bassPc: name.bass }),
  })), tonic);
  ordered.forEach((card, index) => {
    const degree = degreeOf(card.name, key)?.label;
    if (!degree) return;
    result.set(card.id, { degree: displayDegreeLabel(degree), role: roles[index]?.kind ?? "" });
  });
  return result;
}
