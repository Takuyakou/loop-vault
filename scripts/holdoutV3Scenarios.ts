import {
  bar, held, type BarPlan, type ChordSpec, type ScenarioPlan, type ShapeName,
} from "./longFormCorpus";

/**
 * holdout-v3: eight scenarios, clean and stress, generated once and run once.
 *
 * Deliberately built from different material than Long-form v1.1 — different
 * keys, different layouts, different section lengths — so that passing here is
 * not a memory of the tuning set. The generator, the manifest and the gates are
 * fixed before this file is evaluated, and nothing is adjusted afterwards.
 */

function c(rootPc: number, shape: ShapeName, bassPc?: number, acceptableAlternatives?: string[]): ChordSpec {
  return {
    rootPc,
    shape,
    ...(bassPc === undefined ? {} : { bassPc }),
    ...(acceptableAlternatives ? { acceptableAlternatives } : {}),
  };
}

const C = 0, Db = 1, D = 2, Eb = 3, E = 4, F = 5, Gb = 6, G = 7, Ab = 8, A = 9, Bb = 10, B = 11;

/** Four-bar pads, so filler windows are single-chord shapes rather than pairs. */
const PAD_POOL: ChordSpec[] = [
  c(Ab, "maj9"), c(Db, "maj7"), c(Gb, "maj9"), c(B, "maj7"),
  c(E, "min9"), c(A, "min7"), c(D, "dom9"), c(G, "maj9"),
];

/**
 * Places the annotated blocks first, then fills what is left with held pads.
 *
 * Filling first would let a four-bar hold started in a gap sound across the
 * first bars of the block that replaced it, so the gaps are measured after the
 * blocks are in place and no pad ever crosses into an annotated bar.
 */
function layout(totalBars: number, blocks: Array<{ startBar: number; bars: BarPlan[] }>): BarPlan[] {
  const result: Array<BarPlan | null> = Array.from({ length: totalBars }, () => null);
  for (const block of blocks) {
    block.bars.forEach((plan, offset) => {
      const index = block.startBar - 1 + offset;
      if (index >= 0 && index < totalBars) result[index] = plan;
    });
  }

  let padIndex = 0;
  let position = 0;
  while (position < totalBars) {
    if (result[position] !== null) {
      position += 1;
      continue;
    }
    let runEnd = position;
    while (runEnd < totalBars && result[runEnd] === null) runEnd += 1;
    for (let start = position; start < runEnd; start += 4) {
      const length = Math.min(4, runEnd - start);
      held(PAD_POOL[padIndex % PAD_POOL.length], length).forEach((plan, offset) => {
        result[start + offset] = plan;
      });
      padIndex += 1;
    }
    position = runEnd;
  }

  return result.map((plan) => plan ?? { chords: [] });
}

const progression = (specs: readonly ChordSpec[]): BarPlan[] => specs.map((spec) => bar(spec));

function repeatedBlocks(starts: readonly number[], shape: BarPlan[]) {
  return starts.map((startBar) => ({ startBar, bars: shape }));
}

function blocksFor(
  starts: readonly number[],
  lengthBars: number,
  patternId: string,
  rank: "top3" | "top10",
) {
  return starts.map((start, index) => ({
    id: `${patternId}-${index + 1}`,
    start_bar: start,
    end_bar: start + lengthBars - 1,
    block_type: "progression" as const,
    usefulness: "must-show" as const,
    pattern_id: patternId,
    expected_main_lane: true,
    rank_constraint: index === 0 ? rank : ("top10" as const),
    notes: "",
  }));
}

function patternFor(starts: readonly number[], lengthBars: number, patternId: string, description: string) {
  return {
    pattern_id: patternId,
    normalized_description: description,
    expected_card_count: 1,
    occurrences: starts.map((start) => ({ startBar: start, endBar: start + lengthBars - 1 })),
    merge_policy: "merge" as const,
    notes: "",
  };
}

function sectionsFor(starts: readonly number[], lengthBars: number, prefix = "sec") {
  return starts.map((start, index) => ({
    id: `${prefix}${index + 1}`,
    startBar: start,
    endBar: start + lengthBars - 1,
  }));
}

/** H1: a repeated one-chord vamp against four different progressions. */
const H1: ScenarioPlan = (() => {
  const totalBars = 128;
  const vampChord = c(A, "min11", D, ["D13sus", "D9sus4"]);
  const progs = [
    progression([c(Bb, "maj7"), c(G, "min7"), c(C, "min7"), c(F, "dom7"),
      c(Bb, "maj7"), c(G, "min7"), c(C, "min7"), c(F, "dom7")]),
    progression([c(Eb, "maj7"), c(D, "min7b5"), c(G, "dom7"), c(C, "min7"),
      c(Eb, "maj7"), c(D, "min7b5"), c(G, "dom7"), c(C, "min7")]),
    progression([c(Ab, "maj7"), c(F, "min7"), c(Bb, "min7"), c(Eb, "dom7"),
      c(Ab, "maj7"), c(F, "min7"), c(Bb, "min7"), c(Eb, "dom7")]),
    progression([c(Db, "maj7"), c(Bb, "min7"), c(Eb, "min7"), c(Ab, "dom7"),
      c(Db, "maj7"), c(Bb, "min7"), c(Eb, "min7"), c(Ab, "dom7")]),
  ];
  const progStarts = [1, 33, 65, 97];
  const vampStarts = [17, 49, 81, 113];

  return {
    scenarioId: "H1",
    title: "repeated-vamp-with-distinct-progressions",
    description: "Four distinct eight-bar progressions and one two-bar vamp appearing four times.",
    bpm: 94,
    split: "holdout-v3",
    tags: ["catalog", "recommendation", "vamp"],
    stressFeatures: ["all-channel-zero", "fragmented-notes", "dense-melody"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["the vamp is one card with four occurrences and never the top suggestion"],
    sections: [...sectionsFor(progStarts, 8, "prog"), ...sectionsFor(vampStarts, 2, "vamp")],
    expectedBlocks: [
      ...progStarts.flatMap((start, index) => blocksFor([start], 8, `prog${index + 1}`, "top3")),
      ...vampStarts.map((start, index) => ({
        id: `vamp${index + 1}`,
        start_bar: start,
        end_bar: start + 1,
        block_type: "vamp" as const,
        usefulness: "secondary" as const,
        pattern_id: "holdout-vamp",
        expected_main_lane: false,
        rank_constraint: "after-progressions" as const,
        notes: "",
      })),
    ],
    expectedPatterns: [
      ...progStarts.map((start, index) => patternFor([start], 8, `prog${index + 1}`, `progression ${index + 1}`)),
      patternFor(vampStarts, 2, "holdout-vamp", "Am11/D vamp"),
    ],
    bars: layout(totalBars, [
      ...progStarts.map((start, index) => ({ startBar: start, bars: progs[index] })),
      ...vampStarts.map((start) => ({ startBar: start, bars: held(vampChord, 2) })),
    ]),
  };
})();

/** H2: four, eight and sixteen-bar structures nested inside each other. */
const H2: ScenarioPlan = (() => {
  const totalBars = 128;
  const motif = [c(G, "maj7"), c(E, "min7"), c(A, "min7"), c(D, "dom7")];
  const answer = [c(B, "min7"), c(E, "dom7"), c(A, "maj7"), c(D, "dom9")];
  const tail = [c(C, "maj7"), c(Gb, "min7b5"), c(B, "dom7"), c(E, "min7")];
  const full = progression([...motif, ...answer, ...motif, ...tail]);
  const starts = [1, 17, 33, 49, 65, 81, 97, 113];

  return {
    scenarioId: "H2",
    title: "nested-four-eight-sixteen",
    description: "A sixteen-bar form holding eight-bar phrases holding four-bar motifs.",
    bpm: 102,
    split: "holdout-v3",
    tags: ["catalog", "nesting"],
    stressFeatures: ["dense-melody", "overlap-notes", "fragmented-notes"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["the sixteen-bar form and its phrases are all in the catalog"],
    sections: sectionsFor(starts, 16).filter((section) => section.endBar <= totalBars),
    expectedBlocks: [
      ...blocksFor([1], 16, "full-form", "top3"),
      ...blocksFor([1], 8, "phrase-a", "top10"),
      ...blocksFor([9], 8, "phrase-b", "top10"),
    ],
    expectedPatterns: [
      patternFor(starts.filter((start) => start + 15 <= totalBars), 16, "full-form", "sixteen-bar form"),
      patternFor(starts, 8, "phrase-a", "motif and answer"),
      patternFor(starts.map((start) => start + 8).filter((start) => start + 7 <= totalBars), 8, "phrase-b", "motif and tail"),
    ],
    bars: layout(totalBars, repeatedBlocks(starts, full)),
  };
})();

/** H3: sections whose lengths are not powers of two. */
const H3: ScenarioPlan = (() => {
  const totalBars = 108;
  const ranges = [
    { start: 1, length: 13 },
    { start: 14, length: 19 },
    { start: 33, length: 21 },
    { start: 54, length: 16 },
    { start: 70, length: 17 },
    { start: 87, length: 22 },
  ];
  const palettes: ChordSpec[][] = [
    [c(F, "maj7"), c(D, "min7"), c(G, "min7"), c(C, "dom7")],
    [c(Bb, "maj7"), c(G, "min9"), c(C, "min7"), c(F, "dom9")],
    [c(A, "min7"), c(D, "min7"), c(G, "dom7"), c(C, "maj7")],
    [c(Eb, "maj9"), c(C, "min7"), c(F, "min7"), c(Bb, "dom7")],
    [c(B, "min7"), c(E, "dom9"), c(A, "maj7"), c(D, "maj7")],
    [c(Db, "maj9"), c(Bb, "min7"), c(Eb, "min9"), c(Ab, "dom13")],
  ];

  return {
    scenarioId: "H3",
    title: "non-power-of-two-sections",
    description: "Sections of 13, 19, 21, 16, 17 and 22 bars.",
    bpm: 86,
    split: "holdout-v3",
    tags: ["catalog", "generation", "section"],
    stressFeatures: ["fragmented-notes", "dense-melody", "all-channel-zero"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["every section is present in the catalog"],
    sections: ranges.map((range, index) => ({
      id: `sec${index + 1}`,
      startBar: range.start,
      endBar: range.start + range.length - 1,
    })),
    expectedBlocks: ranges.map((range, index) => ({
      id: `sec${index + 1}`,
      start_bar: range.start,
      end_bar: range.start + range.length - 1,
      block_type: "progression" as const,
      usefulness: "must-show" as const,
      pattern_id: `sec${index + 1}`,
      expected_main_lane: true,
      rank_constraint: "top10" as const,
      notes: `${range.length}-bar section`,
    })),
    expectedPatterns: ranges.map((range, index) => ({
      pattern_id: `sec${index + 1}`,
      normalized_description: `${range.length}-bar section`,
      expected_card_count: 1,
      occurrences: [{ startBar: range.start, endBar: range.start + range.length - 1 }],
      merge_policy: "merge" as const,
      notes: "",
    })),
    bars: layout(totalBars, ranges.map((range, index) => {
      const palette = palettes[index];
      const bars: BarPlan[] = [];
      for (let position = 0; position < range.length; position += 1) {
        bars.push(bar(palette[position % palette.length]));
      }
      return { startBar: range.start, bars };
    })),
  };
})();

/** H4: rootless voicings over a walking bass. */
const H4: ScenarioPlan = (() => {
  const totalBars = 96;
  const shape = progression([c(G, "min9"), c(C, "dom13"), c(F, "maj9"), c(D, "dom9"),
    c(G, "min9"), c(C, "dom13"), c(F, "maj9"), c(D, "dom9")]);
  const starts = [1, 17, 33, 49, 65, 81];

  return {
    scenarioId: "H4",
    title: "rootless-over-walking-bass",
    description: "Rootless upper voicings over a walking bass.",
    bpm: 138,
    split: "holdout-v3",
    tags: ["timeline", "rootless"],
    stressFeatures: ["rootless-harmony", "walking-bass", "voice-duplicate", "dense-melody"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["the catalog holds the progression whatever the classification"],
    sections: sectionsFor(starts, 8),
    expectedBlocks: blocksFor(starts, 8, "rootless-p", "top3"),
    expectedPatterns: [patternFor(starts, 8, "rootless-p", "ii9-V13-Imaj9-VI9 x2")],
    bars: layout(totalBars, repeatedBlocks(starts, shape)),
  };
})();

/** H5: harmony stated as arpeggios. */
const H5: ScenarioPlan = (() => {
  const totalBars = 112;
  const shape = progression([c(D, "maj9"), c(B, "min7"), c(E, "min9"), c(A, "dom13"),
    c(D, "maj9"), c(B, "min7"), c(E, "min9"), c(A, "dom13")]);
  const starts = [1, 17, 33, 49, 65, 81, 97];

  return {
    scenarioId: "H5",
    title: "arpeggiated-extraction",
    description: "Harmony as arpeggios, so no window holds a full chord at once.",
    bpm: 116,
    split: "holdout-v3",
    tags: ["timeline", "extraction", "uncertain"],
    stressFeatures: ["arpeggiated-harmony", "all-channel-zero", "fragmented-notes", "ghost-notes"],
    boundaryToleranceBeats: 0.6,
    expectedInvariants: ["candidates whose classification is unreliable stay in the catalog"],
    sections: sectionsFor(starts, 8),
    expectedBlocks: blocksFor(starts, 8, "arp-p", "top3"),
    expectedPatterns: [patternFor(starts, 8, "arp-p", "Imaj9-vi7-ii9-V13 x2")],
    bars: layout(totalBars, repeatedBlocks(starts, shape)),
  };
})();

/** H6: onsets off the grid and releases overlapping the next chord. */
const H6: ScenarioPlan = (() => {
  const totalBars = 112;
  const shape = progression([c(E, "min7"), c(A, "min7"), c(D, "dom7"), c(G, "maj7"),
    c(C, "maj7"), c(Gb, "min7b5"), c(B, "dom7"), c(E, "min7")]);
  const starts = [1, 17, 33, 49, 65, 81, 97];

  return {
    scenarioId: "H6",
    title: "humanized-overlap",
    description: "Humanized onsets with releases bleeding into the next chord.",
    bpm: 78,
    split: "holdout-v3",
    tags: ["timeline", "boundary"],
    stressFeatures: ["humanized-timing", "overlap-notes", "dense-melody"],
    boundaryToleranceBeats: 0.6,
    expectedInvariants: ["boundaries stay inside the declared tolerance"],
    sections: sectionsFor(starts, 8),
    expectedBlocks: blocksFor(starts, 8, "humanized-p", "top3"),
    expectedPatterns: [patternFor(starts, 8, "humanized-p", "vi7-ii7-V7-Imaj7-IVmaj7-viio-III7-vi7")],
    bars: layout(totalBars, repeatedBlocks(starts, shape)),
  };
})();

/** H7: one progression stated in four keys. */
const H7: ScenarioPlan = (() => {
  const totalBars = 104;
  const inKey = (offset: number) => progression([
    c((F + offset) % 12, "maj7"), c((D + offset) % 12, "min7"),
    c((G + offset) % 12, "min7"), c((C + offset) % 12, "dom7"),
    c((F + offset) % 12, "maj7"), c((D + offset) % 12, "min7"),
    c((G + offset) % 12, "min7"), c((C + offset) % 12, "dom7"),
  ]);
  const placements = [
    { startBar: 1, offset: 0 },
    { startBar: 27, offset: 3 },
    { startBar: 53, offset: 6 },
    { startBar: 79, offset: 9 },
  ];
  const starts = placements.map((placement) => placement.startBar);

  return {
    scenarioId: "H7",
    title: "transposed-repetition",
    description: "One progression in four keys: one pattern, four occurrences.",
    bpm: 106,
    split: "holdout-v3",
    tags: ["catalog", "transposition"],
    stressFeatures: ["different-voicing-per-occurrence", "all-channel-zero", "humanized-timing"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["four transposed statements form one card with four occurrences"],
    sections: sectionsFor(starts, 8, "key"),
    expectedBlocks: blocksFor(starts, 8, "transposed-p", "top3"),
    expectedPatterns: [patternFor(starts, 8, "transposed-p", "Imaj7-vi7-ii7-V7 x2, transposition-invariant")],
    bars: layout(totalBars, placements.map((placement) => ({
      startBar: placement.startBar,
      bars: inKey(placement.offset),
    }))),
    voicingShifts: placements.map((placement, index) => ({
      startBar: placement.startBar,
      endBar: placement.startBar + 7,
      semitoneShift: [0, 12, -12, 12][index],
    })),
  };
})();

/** H8: a long distinct middle section between two outer ones. */
const H8: ScenarioPlan = (() => {
  const totalBars = 160;
  const outer = progression([c(A, "maj7"), c(Gb, "min7"), c(B, "min7"), c(E, "dom7"),
    c(A, "maj7"), c(Gb, "min7"), c(B, "min7"), c(E, "dom7")]);
  const middle = progression([c(C, "min9"), c(Ab, "maj7"), c(Bb, "dom9"), c(Eb, "maj7"),
    c(C, "min9"), c(Ab, "maj7"), c(Bb, "dom9"), c(Eb, "maj7")]);

  return {
    scenarioId: "H8",
    title: "long-middle-section",
    description: "A long distinct middle section surrounded by a returning outer section.",
    bpm: 90,
    split: "holdout-v3",
    tags: ["catalog", "coverage", "section"],
    stressFeatures: ["section-instrumentation-change", "fragmented-notes", "all-channel-zero"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["the middle section is present in the catalog"],
    sections: [
      { id: "outer-a", startBar: 1, endBar: 48 },
      { id: "middle", startBar: 49, endBar: 112 },
      { id: "outer-b", startBar: 113, endBar: 160 },
    ],
    expectedBlocks: [
      ...blocksFor([1], 8, "outer-p", "top3"),
      ...blocksFor([49], 8, "middle-p", "top3"),
    ],
    expectedPatterns: [
      patternFor([1, 17, 113, 129], 8, "outer-p", "outer progression"),
      patternFor([49, 65, 81, 97], 8, "middle-p", "middle progression"),
    ],
    bars: layout(totalBars, [
      ...repeatedBlocks([1, 17, 113, 129], outer),
      ...repeatedBlocks([49, 65, 81, 97], middle),
    ]),
  };
})();

export const HOLDOUT_V3_SCENARIOS: ScenarioPlan[] = [H1, H2, H3, H4, H5, H6, H7, H8];
