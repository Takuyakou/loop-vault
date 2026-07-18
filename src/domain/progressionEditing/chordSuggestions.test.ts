import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import {
  contextualAlternativesForSlot,
  createEditableProgression,
  suggestChordAlternatives,
  suggestNextChordAlternatives,
} from ".";
import { makeCandidate } from "./testFixtures";

describe("contextual chord suggestions", () => {
  it("fills a short analysis list to five deterministic candidates", () => {
    const current = makeChordSymbol(0, "maj7");
    const analyzed = [{ chord: makeChordSymbol(7, "dom7"), confidence: 0.84 }];
    const first = suggestChordAlternatives({
      current,
      analyzedAlternatives: analyzed,
      keySignature: "C major",
    });
    const second = suggestChordAlternatives({
      current,
      analyzedAlternatives: analyzed,
      keySignature: "C major",
    });

    expect(first).toHaveLength(5);
    expect(first[0]?.chord.label).toBe("G7");
    expect(new Set(first.map((candidate) => candidate.chord.label)).size).toBe(5);
    expect(second).toEqual(first);
  });

  it("suggests a non-copying next chord and five remaining choices", () => {
    const previous = makeChordSymbol(0, "maj7");
    const suggestions = suggestNextChordAlternatives(previous, "C major");

    expect(suggestions).toHaveLength(6);
    expect(suggestions[0]?.chord.label).toBe("Fmaj7");
    expect(suggestions.every((candidate) => candidate.chord.label !== previous.label)).toBe(true);
  });

  it("enriches an editable slot without mutating stored analysis alternatives", () => {
    const editable = createEditableProgression(makeCandidate());
    const sourceAlternatives = editable.slots[0]!.alternatives;
    const enriched = contextualAlternativesForSlot(editable, editable.slots[0]!.id, "C major");

    expect(enriched?.alternatives).toHaveLength(5);
    expect(sourceAlternatives).toHaveLength(1);
    expect(enriched?.alternatives).not.toBe(sourceAlternatives);
  });
});
