import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { makeChordSymbol } from "../../domain/chords";
import { analyzerQuickCandidates } from "../../domain/progressionEditing";
import { ChordAlternativeList } from "./ChordAlternativeList";

describe("ChordAlternativeList", () => {
  it("wraps and renders at most five alternatives", () => {
    const markup = renderToStaticMarkup(<ChordAlternativeList
      candidates={analyzerQuickCandidates([0, 2, 4, 5, 7, 9].map((root, index) => ({
        chord: makeChordSymbol(root, "maj"),
        confidence: 0.8 - index * 0.1,
      })))}
      onSelect={vi.fn()}
      language="en"
    />);

    expect(markup).toContain("flex-wrap");
    expect(markup).toContain('data-alternative-count="5"');
    expect((markup.match(/<button/g) ?? [])).toHaveLength(5);
    expect(markup).toContain(">G<");
    expect(markup).not.toContain(">A<");
  });
});
