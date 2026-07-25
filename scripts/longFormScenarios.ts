import {
  bar, held, rest, type BarPlan, type ChordSpec, type ScenarioPlan, type ShapeName,
} from "./longFormCorpus";

/**
 * Long-form Corpus v1.1 scenarios.
 *
 * Twelve scenarios, each 96 to 192 bars, each with a clean and a stress variant.
 * The point of the length is repeat count: the reported failure needs a vamp that
 * recurs four times across a hundred bars of other material, which a sixteen-bar
 * fixture cannot express.
 *
 * Splits are assigned per scenario pair so a clean/stress pair never straddles a
 * split boundary.
 */

function c(rootPc: number, shape: ShapeName, bassPc?: number, acceptableAlternatives?: string[]): ChordSpec {
  return { rootPc, shape, ...(bassPc === undefined ? {} : { bassPc }), ...(acceptableAlternatives ? { acceptableAlternatives } : {}) };
}

const C = 0, Db = 1, D = 2, Eb = 3, E = 4, F = 5, Gb = 6, G = 7, Ab = 8, A = 9, Bb = 10, B = 11;

/** The Endless chord: E minor eleventh over an A bass, no minor third sounding low. */
const em11a = c(E, "min11", A, ["A13sus", "A9sus4"]);

/**
 * Filler that forms no repeat at all.
 *
 * A short cycle looks aperiodic against a four-bar window and is not: a
 * seven-chord loop makes every window seven bars apart identical, so filler
 * accumulated ten occurrences and swept the candidate list. The scenario would
 * then be testing the filler rather than the blocks it exists to isolate.
 *
 * This walks a chord pool with a fixed seed instead, never repeating a chord back
 * to back, so no two windows anywhere in the song share a structure.
 */
const FILLER_POOL: ChordSpec[] = [
  c(Bb, "maj7"), c(Eb, "maj9"), c(Ab, "maj7"), c(Db, "maj9"), c(Gb, "maj7"),
  c(B, "min7"), c(E, "dom9"), c(Ab, "min7"), c(Db, "dom7"), c(Gb, "maj9"),
  c(Bb, "min7"), c(Eb, "dom9"),
];

/**
 * Filler made of four-bar pad chords.
 *
 * One chord per bar turns every two-bar filler window into a two-chord fragment,
 * and with a pool this size those fragments collide on the relative signature and
 * accumulate occurrence counts of three to five — enough to outscore the vamp the
 * scenario is built around. Holding each chord for four bars makes filler windows
 * one-chord shapes that each occur once or twice, so the vamp with four
 * occurrences is the strongest short candidate, which is the situation the real
 * file produces.
 */
function padFiller(fromBar: number, toBar: number): BarPlan[] {
  const bars: BarPlan[] = [];
  let index = 0;
  for (let position = fromBar; position <= toBar; position += 4) {
    const length = Math.min(4, toBar - position + 1);
    bars.push(...held(FILLER_POOL[index % FILLER_POOL.length], length));
    index += 1;
  }
  return bars.slice(0, toBar - fromBar + 1);
}

function filler(fromBar: number, toBar: number): BarPlan[] {
  const bars: BarPlan[] = [];
  // Seeded from the absolute bar number so a scenario's filler is identical
  // wherever the function is called from.
  let state = 20260725 >>> 0;
  let previous = -1;
  for (let position = 1; position <= toBar; position += 1) {
    let index = previous;
    while (index === previous) {
      state = (state * 1664525 + 1013904223) >>> 0;
      index = state % FILLER_POOL.length;
    }
    previous = index;
    if (position >= fromBar) bars.push(bar(FILLER_POOL[index]));
  }
  return bars;
}

/** Places bar plans into an array indexed from bar 1, filling gaps with filler. */
function layout(
  totalBars: number,
  blocks: Array<{ startBar: number; bars: BarPlan[] }>,
  fill: (fromBar: number, toBar: number) => BarPlan[] = filler,
): BarPlan[] {
  const result: BarPlan[] = fill(1, totalBars);
  for (const block of blocks) {
    block.bars.forEach((plan, offset) => {
      const index = block.startBar - 1 + offset;
      if (index < totalBars) result[index] = plan;
    });
  }
  return result;
}

function progression(specs: readonly ChordSpec[]): BarPlan[] {
  return specs.map((spec) => bar(spec));
}

// ---------------------------------------------------------------------------

/** L01: the reported failure, at the length that produces it. */
const L01: ScenarioPlan = (() => {
  const totalBars = 112;
  const prog1 = progression([c(C, "maj7"), c(A, "min7"), c(D, "min7"), c(G, "dom7"),
    c(C, "maj7"), c(A, "min7"), c(D, "min7"), c(G, "dom7")]);
  const prog2 = progression([c(F, "maj7"), c(E, "min7"), c(D, "min7"), c(C, "maj"),
    c(F, "maj7"), c(E, "min7"), c(D, "min7"), c(C, "maj")]);
  const prog3 = progression([c(A, "min7"), c(F, "maj7"), c(C, "maj7"), c(G, "dom7"),
    c(A, "min7"), c(F, "maj7"), c(C, "maj7"), c(G, "dom7")]);
  const prog4 = progression([c(D, "min7"), c(G, "dom7"), c(C, "maj7"), c(F, "maj7"),
    c(D, "min7"), c(G, "dom7"), c(C, "maj7"), c(F, "maj7")]);
  const vamp = () => held(em11a, 2);

  return {
    scenarioId: "L01",
    title: "endless-vamp-vs-progressions",
    description: "Four distinct eight-bar progressions and one two-bar one-chord vamp appearing four times, at the length that lets the vamp's repeat count dominate.",
    bpm: 96,
    split: "dev",
    tags: ["selection", "vamp", "long-form", "endless-type"],
    stressFeatures: ["all-channel-zero", "fragmented-notes", "dense-melody", "voice-duplicate"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: [
      "the four progressions occupy the first three cards",
      "the vamp is one card with four occurrences and never outranks a progression",
    ],
    sections: [
      { id: "prog-sec1", startBar: 1, endBar: 8 },
      { id: "vamp-sec1", startBar: 15, endBar: 16 },
      { id: "prog-sec2", startBar: 29, endBar: 36 },
      { id: "vamp-sec2", startBar: 43, endBar: 44 },
      { id: "prog-sec3", startBar: 57, endBar: 64 },
      { id: "vamp-sec3", startBar: 71, endBar: 72 },
      { id: "prog-sec4", startBar: 85, endBar: 92 },
      { id: "vamp-sec4", startBar: 99, endBar: 100 },
    ],
    expectedBlocks: [
      { id: "prog1", start_bar: 1, end_bar: 8, block_type: "progression", usefulness: "must-show", pattern_id: "prog1", expected_main_lane: true, rank_constraint: "top3", notes: "" },
      { id: "prog2", start_bar: 29, end_bar: 36, block_type: "progression", usefulness: "must-show", pattern_id: "prog2", expected_main_lane: true, rank_constraint: "top3", notes: "" },
      { id: "prog3", start_bar: 57, end_bar: 64, block_type: "progression", usefulness: "must-show", pattern_id: "prog3", expected_main_lane: true, rank_constraint: "top3", notes: "" },
      { id: "prog4", start_bar: 85, end_bar: 92, block_type: "progression", usefulness: "must-show", pattern_id: "prog4", expected_main_lane: true, rank_constraint: "top3", notes: "" },
      { id: "vamp1", start_bar: 15, end_bar: 16, block_type: "vamp", usefulness: "secondary", pattern_id: "em11a-vamp", expected_main_lane: false, rank_constraint: "after-progressions", notes: "" },
      { id: "vamp2", start_bar: 43, end_bar: 44, block_type: "vamp", usefulness: "secondary", pattern_id: "em11a-vamp", expected_main_lane: false, rank_constraint: "after-progressions", notes: "" },
      { id: "vamp3", start_bar: 71, end_bar: 72, block_type: "vamp", usefulness: "secondary", pattern_id: "em11a-vamp", expected_main_lane: false, rank_constraint: "after-progressions", notes: "" },
      { id: "vamp4", start_bar: 99, end_bar: 100, block_type: "vamp", usefulness: "secondary", pattern_id: "em11a-vamp", expected_main_lane: false, rank_constraint: "after-progressions", notes: "" },
    ],
    expectedPatterns: [
      { pattern_id: "prog1", normalized_description: "Imaj7-vi7-ii7-V7 x2", expected_card_count: 1, occurrences: [{ startBar: 1, endBar: 8 }], merge_policy: "merge", notes: "" },
      { pattern_id: "prog2", normalized_description: "IVmaj7-iii7-ii7-I x2", expected_card_count: 1, occurrences: [{ startBar: 29, endBar: 36 }], merge_policy: "merge", notes: "" },
      { pattern_id: "prog3", normalized_description: "vi7-IVmaj7-Imaj7-V7 x2", expected_card_count: 1, occurrences: [{ startBar: 57, endBar: 64 }], merge_policy: "merge", notes: "" },
      { pattern_id: "prog4", normalized_description: "ii7-V7-Imaj7-IVmaj7 x2", expected_card_count: 1, occurrences: [{ startBar: 85, endBar: 92 }], merge_policy: "merge", notes: "" },
      { pattern_id: "em11a-vamp", normalized_description: "Em11/A vamp", expected_card_count: 1, occurrences: [{ startBar: 15, endBar: 16 }, { startBar: 43, endBar: 44 }, { startBar: 71, endBar: 72 }, { startBar: 99, endBar: 100 }], merge_policy: "merge", notes: "" },
    ],
    bars: layout(totalBars, [
      { startBar: 1, bars: prog1 },
      { startBar: 15, bars: vamp() },
      { startBar: 29, bars: prog2 },
      { startBar: 43, bars: vamp() },
      { startBar: 57, bars: prog3 },
      { startBar: 71, bars: vamp() },
      { startBar: 85, bars: prog4 },
      { startBar: 99, bars: vamp() },
    ], padFiller),
  };
})();

/** L02: one pattern, eight occurrences, a different voicing each time. */
const L02: ScenarioPlan = (() => {
  const totalBars = 128;
  const shape = progression([c(C, "maj7"), c(A, "min7"), c(D, "min7"), c(G, "dom7"),
    c(C, "maj7"), c(A, "min7"), c(D, "min7"), c(G, "dom7")]);
  const starts = [1, 17, 33, 49, 65, 81, 97, 113];
  const shifts = [0, 12, -12, 12, 0, -12, 12, 0];

  return {
    scenarioId: "L02",
    title: "pattern-eight-occurrences",
    description: "One eight-bar progression appearing eight times, voiced differently each time. Eight occurrences must not become eight cards.",
    bpm: 104,
    split: "dev",
    tags: ["pattern", "occurrence", "ui", "long-form"],
    stressFeatures: ["different-voicing-per-occurrence", "track-reorder", "humanized-timing"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: [
      "eight occurrences collapse into one card",
      "each occurrence keeps its own absolute chords and voicing",
    ],
    sections: starts.map((start, index) => ({ id: `sec${index + 1}`, startBar: start, endBar: start + 7 })),
    expectedBlocks: starts.map((start, index) => ({
      id: `rep${index + 1}`,
      start_bar: start,
      end_bar: start + 7,
      block_type: "progression" as const,
      usefulness: "must-show" as const,
      pattern_id: "repeat-eight",
      expected_main_lane: true,
      rank_constraint: "top10" as const,
      notes: "",
    })),
    expectedPatterns: [{
      pattern_id: "repeat-eight",
      normalized_description: "Imaj7-vi7-ii7-V7 x2",
      expected_card_count: 1,
      occurrences: starts.map((start) => ({ startBar: start, endBar: start + 7 })),
      merge_policy: "merge",
      notes: "",
    }],
    bars: layout(totalBars, starts.map((start) => ({ startBar: start, bars: shape }))),
    voicingShifts: starts.map((start, index) => ({ startBar: start, endBar: start + 7, semitoneShift: shifts[index] })),
  };
})();

/** L03: a middle section that must stay reachable. */
const L03: ScenarioPlan = (() => {
  const totalBars = 144;
  const outer = progression([c(G, "maj7"), c(E, "min7"), c(A, "min7"), c(D, "dom7"),
    c(G, "maj7"), c(E, "min7"), c(A, "min7"), c(D, "dom7")]);
  const middle = progression([c(Bb, "maj7"), c(G, "min7"), c(C, "min7"), c(F, "dom7"),
    c(Bb, "maj7"), c(G, "min7"), c(C, "min7"), c(F, "dom7")]);

  return {
    scenarioId: "L03",
    title: "middle-section-reachability",
    description: "A distinct middle section surrounded by a long outer section. The middle must be reachable from the candidate list rather than merely covered.",
    bpm: 92,
    split: "holdout-v2",
    tags: ["coverage", "section", "long-form"],
    stressFeatures: ["section-instrumentation-change", "fragmented-notes", "all-channel-zero"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["the middle section is reachable from a visible card"],
    sections: [
      { id: "outer-a", startBar: 1, endBar: 48 },
      { id: "middle", startBar: 49, endBar: 96 },
      { id: "outer-b", startBar: 97, endBar: 144 },
    ],
    expectedBlocks: [
      { id: "outer-a", start_bar: 1, end_bar: 8, block_type: "progression", usefulness: "must-show", pattern_id: "outer-p", expected_main_lane: true, rank_constraint: "top3", notes: "" },
      { id: "middle", start_bar: 49, end_bar: 56, block_type: "progression", usefulness: "must-show", pattern_id: "middle-p", expected_main_lane: true, rank_constraint: "top3", notes: "" },
      { id: "outer-b", start_bar: 97, end_bar: 104, block_type: "progression", usefulness: "must-show", pattern_id: "outer-p", expected_main_lane: true, rank_constraint: "top3", notes: "" },
    ],
    expectedPatterns: [
      { pattern_id: "outer-p", normalized_description: "Imaj7-vi7-ii7-V7 in G x2", expected_card_count: 1, occurrences: [{ startBar: 1, endBar: 8 }, { startBar: 97, endBar: 104 }], merge_policy: "merge", notes: "" },
      { pattern_id: "middle-p", normalized_description: "Imaj7-vi7-ii7-V7 in Bb x2", expected_card_count: 1, occurrences: [{ startBar: 49, endBar: 56 }], merge_policy: "merge", notes: "" },
    ],
    bars: layout(totalBars, [
      { startBar: 1, bars: outer },
      { startBar: 9, bars: outer },
      { startBar: 49, bars: middle },
      { startBar: 57, bars: middle },
      { startBar: 97, bars: outer },
      { startBar: 105, bars: outer },
    ]),
  };
})();

/** L04: sections whose lengths the fixed window set cannot express. */
const L04: ScenarioPlan = (() => {
  const totalBars = 96;
  const ranges = [
    { id: "sec1", startBar: 1, endBar: 14 },
    { id: "sec2", startBar: 15, endBar: 32 },
    { id: "sec3", startBar: 33, endBar: 52 },
    { id: "sec4", startBar: 53, endBar: 68 },
    { id: "sec5", startBar: 69, endBar: 82 },
    { id: "sec6", startBar: 83, endBar: 96 },
  ];
  const palettes: ChordSpec[][] = [
    [c(C, "maj7"), c(A, "min7"), c(F, "maj7"), c(G, "dom7")],
    [c(D, "min7"), c(G, "dom7"), c(C, "maj7"), c(A, "dom7")],
    [c(E, "min7"), c(A, "min7"), c(D, "min7"), c(G, "dom7")],
    [c(F, "maj7"), c(Bb, "maj7"), c(E, "min7b5"), c(A, "dom7")],
    [c(Ab, "maj7"), c(Db, "maj9"), c(Eb, "dom7"), c(Ab, "maj7")],
    [c(B, "min7"), c(E, "dom9"), c(A, "maj7"), c(D, "maj7")],
  ];

  const blocks = ranges.map((range, index) => {
    const palette = palettes[index];
    const bars: BarPlan[] = [];
    for (let position = range.startBar; position <= range.endBar; position += 1) {
      bars.push(bar(palette[(position - range.startBar) % palette.length]));
    }
    return { startBar: range.startBar, bars };
  });

  return {
    scenarioId: "L04",
    title: "odd-section-lengths",
    description: "Sections of 14, 18, 20, 16, 14 and 14 bars. Only the 16-bar one is expressible with the fixed window set.",
    bpm: 88,
    split: "dev",
    tags: ["generation", "section", "long-form"],
    stressFeatures: ["fragmented-notes", "dense-melody", "all-channel-zero"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["every section is generatable as a candidate"],
    sections: ranges,
    expectedBlocks: ranges.map((range, index) => ({
      id: range.id,
      start_bar: range.startBar,
      end_bar: range.endBar,
      block_type: "progression" as const,
      usefulness: "must-show" as const,
      pattern_id: range.id,
      expected_main_lane: true,
      rank_constraint: "top10" as const,
      notes: index === 3 ? "sixteen bars: expressible today" : "not expressible with lengths 2/4/8/16",
    })),
    expectedPatterns: ranges.map((range) => ({
      pattern_id: range.id,
      normalized_description: `${range.endBar - range.startBar + 1}-bar section`,
      expected_card_count: 1,
      occurrences: [{ startBar: range.startBar, endBar: range.endBar }],
      merge_policy: "merge" as const,
      notes: "",
    })),
    bars: layout(totalBars, blocks),
  };
})();

/** L05: an eight-bar phrase whose own first half repeats more often than it does. */
const L05: ScenarioPlan = (() => {
  const totalBars = 128;
  const halfA = [c(F, "maj7"), c(G, "dom7"), c(E, "min7"), c(A, "min7")];
  const phrase = progression([...halfA, ...halfA]);
  const starts = [1, 17, 33, 49, 65, 81, 97, 113];

  return {
    scenarioId: "L05",
    title: "phrase-vs-half-repeat",
    description: "An eight-bar chorus built from a four-bar half stated twice, so the half occurs twice as often as the phrase and outscores it on repeat count.",
    bpm: 100,
    split: "dev",
    tags: ["selection", "window-length", "long-form"],
    stressFeatures: ["humanized-timing", "overlap-notes", "voice-duplicate"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["the eight-bar phrase outranks its own four-bar half"],
    sections: starts.map((start, index) => ({ id: `chorus${index + 1}`, startBar: start, endBar: start + 7 })),
    expectedBlocks: starts.map((start, index) => ({
      id: `chorus${index + 1}`,
      start_bar: start,
      end_bar: start + 7,
      block_type: "progression" as const,
      usefulness: "must-show" as const,
      pattern_id: "chorus-phrase",
      expected_main_lane: true,
      rank_constraint: index === 0 ? ("top3" as const) : ("top10" as const),
      notes: "",
    })),
    expectedPatterns: [{
      pattern_id: "chorus-phrase",
      normalized_description: "IV-V-iii-vi x2 as one eight-bar phrase",
      expected_card_count: 1,
      occurrences: starts.map((start) => ({ startBar: start, endBar: start + 7 })),
      merge_policy: "merge",
      notes: "the four-bar half is a sub-window of this phrase, not a separate expectation",
    }],
    bars: layout(totalBars, starts.map((start) => ({ startBar: start, bars: phrase }))),
  };
})();

/** L06: nothing but one-chord vamps. */
const L06: ScenarioPlan = (() => {
  const totalBars = 96;
  const bars: BarPlan[] = [];
  for (let position = 1; position <= 48; position += 2) bars.push(...held(em11a, 2));
  for (let position = 49; position <= 96; position += 2) bars.push(...held(c(A, "min11", D, ["D13sus"]), 2));

  return {
    scenarioId: "L06",
    title: "vamp-only-song",
    description: "Two one-chord vamps and nothing else. With no progression available the vamps are the answer, not a fallback to be hidden.",
    bpm: 84,
    split: "dev",
    tags: ["vamp", "fallback", "long-form"],
    stressFeatures: ["fragmented-notes", "arpeggiated-harmony", "ghost-notes"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["vamps are shown when no progression exists"],
    sections: [
      { id: "vamp-a", startBar: 1, endBar: 48 },
      { id: "vamp-b", startBar: 49, endBar: 96 },
    ],
    expectedBlocks: [
      { id: "vamp-a", start_bar: 1, end_bar: 2, block_type: "vamp", usefulness: "must-show", pattern_id: "vamp-a", expected_main_lane: true, rank_constraint: "top3", notes: "no progression exists in this song" },
      { id: "vamp-b", start_bar: 49, end_bar: 50, block_type: "vamp", usefulness: "must-show", pattern_id: "vamp-b", expected_main_lane: true, rank_constraint: "top3", notes: "no progression exists in this song" },
    ],
    expectedPatterns: [
      { pattern_id: "vamp-a", normalized_description: "Em11/A vamp", expected_card_count: 1, occurrences: Array.from({ length: 24 }, (_, index) => ({ startBar: 1 + index * 2, endBar: 2 + index * 2 })), merge_policy: "merge", notes: "" },
      { pattern_id: "vamp-b", normalized_description: "Am11/D vamp", expected_card_count: 1, occurrences: Array.from({ length: 24 }, (_, index) => ({ startBar: 49 + index * 2, endBar: 50 + index * 2 })), merge_policy: "merge", notes: "" },
    ],
    bars,
  };
})();

/** L07: rootless voicings over a walking bass. */
const L07: ScenarioPlan = (() => {
  const totalBars = 96;
  const shape = progression([c(D, "min9"), c(G, "dom13"), c(C, "maj9"), c(A, "dom9"),
    c(D, "min9"), c(G, "dom13"), c(C, "maj9"), c(A, "dom9")]);
  const starts = [1, 17, 33, 49, 65, 81];

  return {
    scenarioId: "L07",
    title: "rootless-walking-bass",
    description: "Rootless upper voicings over a walking bass, the combination that moved the detected root on the short corpus.",
    bpm: 132,
    split: "holdout-v2",
    tags: ["timeline", "rootless", "long-form"],
    stressFeatures: ["rootless-harmony", "walking-bass", "voice-duplicate", "dense-melody"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["the canonical timeline is unchanged between clean and stress"],
    sections: starts.map((start, index) => ({ id: `sec${index + 1}`, startBar: start, endBar: start + 7 })),
    expectedBlocks: starts.map((start, index) => ({
      id: `rep${index + 1}`,
      start_bar: start,
      end_bar: start + 7,
      block_type: "progression" as const,
      usefulness: "must-show" as const,
      pattern_id: "rootless-p",
      expected_main_lane: true,
      rank_constraint: index === 0 ? ("top3" as const) : ("top10" as const),
      notes: "",
    })),
    expectedPatterns: [{
      pattern_id: "rootless-p",
      normalized_description: "ii9-V13-Imaj9-VI9 x2",
      expected_card_count: 1,
      occurrences: starts.map((start) => ({ startBar: start, endBar: start + 7 })),
      merge_policy: "merge",
      notes: "",
    }],
    bars: layout(totalBars, starts.map((start) => ({ startBar: start, bars: shape }))),
  };
})();

/** L08: triads over a pedal bass — the shape that reads as a minor eleventh. */
const L08: ScenarioPlan = (() => {
  const totalBars = 96;
  const shape = progression([
    c(D, "maj", E, ["Dadd9/E", "E11(no3)"]),
    c(E, "maj", Gb, ["Eadd9/F#", "F#11(no3)"]),
    c(G, "maj9", A, ["A13sus"]),
    c(C, "maj", D, ["Cadd9/D", "D11(no3)"]),
    c(D, "maj", E, ["Dadd9/E", "E11(no3)"]),
    c(E, "maj", Gb, ["Eadd9/F#", "F#11(no3)"]),
    c(G, "maj9", A, ["A13sus"]),
    c(C, "maj", D, ["Cadd9/D", "D11(no3)"]),
  ]);
  const starts = [1, 17, 33, 49, 65, 81];

  return {
    scenarioId: "L08",
    title: "pedal-slash-progression",
    description: "D/E, E/F#, Gmaj9/A and C/D over a pedal bass. No minor third sounds, so a minor eleventh reading is unsupported.",
    bpm: 90,
    split: "validation",
    tags: ["timeline", "pedal", "slash", "long-form"],
    stressFeatures: ["voice-duplicate", "all-channel-zero", "fragmented-notes"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["no reading claims a third that does not sound"],
    sections: starts.map((start, index) => ({ id: `sec${index + 1}`, startBar: start, endBar: start + 7 })),
    expectedBlocks: starts.map((start, index) => ({
      id: `rep${index + 1}`,
      start_bar: start,
      end_bar: start + 7,
      block_type: "progression" as const,
      usefulness: "must-show" as const,
      pattern_id: "pedal-p",
      expected_main_lane: true,
      rank_constraint: index === 0 ? ("top3" as const) : ("top10" as const),
      notes: "",
    })),
    expectedPatterns: [{
      pattern_id: "pedal-p",
      normalized_description: "pedal slash sequence x2",
      expected_card_count: 1,
      occurrences: starts.map((start) => ({ startBar: start, endBar: start + 7 })),
      merge_policy: "merge",
      notes: "",
    }],
    bars: layout(totalBars, starts.map((start) => ({ startBar: start, bars: shape }))),
  };
})();

/** L09: arpeggiated harmony, as AI extraction produces it. */
const L09: ScenarioPlan = (() => {
  const totalBars = 112;
  const shape = progression([c(C, "maj9"), c(A, "min7"), c(D, "min9"), c(G, "dom13"),
    c(C, "maj9"), c(A, "min7"), c(D, "min9"), c(G, "dom13")]);
  const starts = [1, 17, 33, 49, 65, 81, 97];

  return {
    scenarioId: "L09",
    title: "arpeggiated-extraction",
    description: "Harmony stated as arpeggios rather than blocks, so no window ever holds the full chord at once.",
    bpm: 112,
    split: "holdout-v2",
    tags: ["timeline", "extraction", "long-form"],
    stressFeatures: ["arpeggiated-harmony", "all-channel-zero", "fragmented-notes", "ghost-notes"],
    boundaryToleranceBeats: 0.6,
    expectedInvariants: ["the canonical timeline is unchanged between clean and stress"],
    sections: starts.map((start, index) => ({ id: `sec${index + 1}`, startBar: start, endBar: start + 7 })),
    expectedBlocks: starts.map((start, index) => ({
      id: `rep${index + 1}`,
      start_bar: start,
      end_bar: start + 7,
      block_type: "progression" as const,
      usefulness: "must-show" as const,
      pattern_id: "arp-p",
      expected_main_lane: true,
      rank_constraint: index === 0 ? ("top3" as const) : ("top10" as const),
      notes: "",
    })),
    expectedPatterns: [{
      pattern_id: "arp-p",
      normalized_description: "Imaj9-vi7-ii9-V13 x2",
      expected_card_count: 1,
      occurrences: starts.map((start) => ({ startBar: start, endBar: start + 7 })),
      merge_policy: "merge",
      notes: "",
    }],
    bars: layout(totalBars, starts.map((start) => ({ startBar: start, bars: shape }))),
  };
})();

/** L10: humanized timing with overlapping releases. */
const L10: ScenarioPlan = (() => {
  const totalBars = 112;
  const shape = progression([c(A, "min7"), c(D, "min7"), c(G, "dom7"), c(C, "maj7"),
    c(F, "maj7"), c(B, "min7b5"), c(E, "dom7"), c(A, "min7")]);
  const starts = [1, 17, 33, 49, 65, 81, 97];

  return {
    scenarioId: "L10",
    title: "humanized-overlap",
    description: "Onsets nudged off the grid and releases overlapping the next chord, so neighbouring tones bleed into each window.",
    bpm: 76,
    split: "validation",
    tags: ["timeline", "boundary", "long-form"],
    stressFeatures: ["humanized-timing", "overlap-notes", "dense-melody"],
    boundaryToleranceBeats: 0.6,
    expectedInvariants: ["boundaries stay inside the declared tolerance"],
    sections: starts.map((start, index) => ({ id: `sec${index + 1}`, startBar: start, endBar: start + 7 })),
    expectedBlocks: starts.map((start, index) => ({
      id: `rep${index + 1}`,
      start_bar: start,
      end_bar: start + 7,
      block_type: "progression" as const,
      usefulness: "must-show" as const,
      pattern_id: "humanized-p",
      expected_main_lane: true,
      rank_constraint: index === 0 ? ("top3" as const) : ("top10" as const),
      notes: "",
    })),
    expectedPatterns: [{
      pattern_id: "humanized-p",
      normalized_description: "vi7-ii7-V7-Imaj7-IVmaj7-viiø-III7-vi7",
      expected_card_count: 1,
      occurrences: starts.map((start) => ({ startBar: start, endBar: start + 7 })),
      merge_policy: "merge",
      notes: "",
    }],
    bars: layout(totalBars, starts.map((start) => ({ startBar: start, bars: shape }))),
  };
})();

/** L11: the same progression in four keys. */
const L11: ScenarioPlan = (() => {
  const totalBars = 96;
  const inKey = (offset: number) => progression([
    c((C + offset) % 12, "maj7"), c((A + offset) % 12, "min7"),
    c((D + offset) % 12, "min7"), c((G + offset) % 12, "dom7"),
    c((C + offset) % 12, "maj7"), c((A + offset) % 12, "min7"),
    c((D + offset) % 12, "min7"), c((G + offset) % 12, "dom7"),
  ]);
  const placements = [
    { startBar: 1, offset: 0 },
    { startBar: 25, offset: 2 },
    { startBar: 49, offset: 4 },
    { startBar: 73, offset: 7 },
  ];

  return {
    scenarioId: "L11",
    title: "transposed-repeats",
    description: "One progression stated in four keys. Transposition-invariant identity should group them while each keeps its own absolute chords.",
    bpm: 108,
    split: "holdout-v2",
    tags: ["pattern", "transposition", "long-form"],
    stressFeatures: ["different-voicing-per-occurrence", "all-channel-zero", "humanized-timing"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: [
      "four transposed statements form one pattern",
      "each occurrence keeps its own absolute chords",
    ],
    sections: placements.map((placement, index) => ({
      id: `key${index + 1}`,
      startBar: placement.startBar,
      endBar: placement.startBar + 7,
    })),
    expectedBlocks: placements.map((placement, index) => ({
      id: `key${index + 1}`,
      start_bar: placement.startBar,
      end_bar: placement.startBar + 7,
      block_type: "progression" as const,
      usefulness: "must-show" as const,
      pattern_id: "transposed-p",
      expected_main_lane: true,
      rank_constraint: index === 0 ? ("top3" as const) : ("top10" as const),
      notes: "",
    })),
    expectedPatterns: [{
      pattern_id: "transposed-p",
      normalized_description: "Imaj7-vi7-ii7-V7 x2, transposition-invariant",
      expected_card_count: 1,
      occurrences: placements.map((placement) => ({
        startBar: placement.startBar,
        endBar: placement.startBar + 7,
      })),
      merge_policy: "merge",
      notes: "",
    }],
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

/** L12: four, eight and sixteen-bar structures nested inside each other. */
const L12: ScenarioPlan = (() => {
  const totalBars = 128;
  const motif = [c(C, "maj7"), c(A, "min7"), c(F, "maj7"), c(G, "dom7")];
  const answer = [c(D, "min7"), c(G, "dom7"), c(C, "maj7"), c(A, "dom7")];
  const tail = [c(F, "maj7"), c(Bb, "maj7"), c(E, "min7"), c(A, "min7")];
  const full = progression([...motif, ...answer, ...motif, ...tail]);
  const starts = [1, 17, 33, 49, 65, 81, 97, 113];

  return {
    scenarioId: "L12",
    title: "nested-block-lengths",
    description: "A sixteen-bar form containing eight-bar phrases containing four-bar motifs, all genuinely present at once.",
    bpm: 98,
    split: "dev",
    tags: ["selection", "nesting", "long-form"],
    stressFeatures: ["dense-melody", "overlap-notes", "fragmented-notes"],
    boundaryToleranceBeats: 0.25,
    expectedInvariants: ["the sixteen-bar form and its eight-bar phrases are both reachable"],
    sections: starts.map((start, index) => ({ id: `sec${index + 1}`, startBar: start, endBar: start + 15 }))
      .filter((section) => section.endBar <= totalBars),
    expectedBlocks: [
      { id: "form1", start_bar: 1, end_bar: 16, block_type: "progression", usefulness: "must-show", pattern_id: "full-form", expected_main_lane: true, rank_constraint: "top3", notes: "" },
      { id: "phrase1", start_bar: 1, end_bar: 8, block_type: "progression", usefulness: "must-show", pattern_id: "phrase-a", expected_main_lane: true, rank_constraint: "top10", notes: "" },
      { id: "phrase2", start_bar: 9, end_bar: 16, block_type: "progression", usefulness: "must-show", pattern_id: "phrase-b", expected_main_lane: true, rank_constraint: "top10", notes: "" },
      { id: "motif1", start_bar: 1, end_bar: 4, block_type: "progression", usefulness: "secondary", pattern_id: "motif-a", expected_main_lane: true, rank_constraint: "other", notes: "" },
    ],
    expectedPatterns: [
      { pattern_id: "full-form", normalized_description: "sixteen-bar form", expected_card_count: 1, occurrences: starts.filter((start) => start + 15 <= totalBars).map((start) => ({ startBar: start, endBar: start + 15 })), merge_policy: "merge", notes: "" },
      { pattern_id: "phrase-a", normalized_description: "motif + answer", expected_card_count: 1, occurrences: starts.map((start) => ({ startBar: start, endBar: start + 7 })), merge_policy: "merge", notes: "" },
      { pattern_id: "phrase-b", normalized_description: "motif + tail", expected_card_count: 1, occurrences: starts.map((start) => ({ startBar: start + 8, endBar: start + 15 })).filter((occurrence) => occurrence.endBar <= totalBars), merge_policy: "merge", notes: "" },
      { pattern_id: "motif-a", normalized_description: "four-bar motif", expected_card_count: 1, occurrences: [{ startBar: 1, endBar: 4 }], merge_policy: "merge", notes: "" },
    ],
    bars: layout(totalBars, starts.map((start) => ({ startBar: start, bars: full }))),
  };
})();

export const LONG_FORM_SCENARIOS: ScenarioPlan[] = [
  L01, L02, L03, L04, L05, L06, L07, L08, L09, L10, L11, L12,
];

/** Kept exported so a generator run can assert the length rule rather than trust it. */
export const MIN_BARS = 96;
export const MAX_BARS = 192;

void rest;
