import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChordTimelineItem } from "../domain/types";
import { ProgressionGrid } from "./ProgressionGrid";

function chord(label: string, bar: number, beat: number): ChordTimelineItem {
  return {
    bar,
    beat,
    durationBeats: 4,
    chord: {
      root: 0,
      quality: "maj",
      tensions: [],
      label,
    },
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  };
}

describe("ProgressionGrid", () => {
  it("renders bar cards, selected chord, and playback progress", () => {
    const markup = renderToStaticMarkup(
      <ProgressionGrid
        chords={[chord("Cmaj7", 1, 1), chord("Am7", 2, 1)]}
        currentBar={1}
        selectedChordIndex={0}
        playingChordIndex={0}
        playingProgress={0.5}
      />,
    );

    expect(markup).toContain("Cmaj7");
    expect(markup).toContain("aria-pressed=\"true\"");
    expect(markup).toContain("width:50%");
    expect(markup).toContain("shadow-[0_0_0_1px_rgba(103,232,249,0.75)]");
  });
});
