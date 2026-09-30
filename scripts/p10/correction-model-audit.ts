/**
 * P10.0-00 audit (not product code). Builds synthetic MIDI in memory, runs the product's
 * capture pipeline exactly as the store does (analyzeMidi → voices → attachSourceVoicings)
 * and measures what a CorrectionModel would need:
 *   - can each card's sourceVoicing pitch be found among the source notes of its span,
 *   - how many cards the three spec 6.3 review rules would flag, per threshold choice,
 *   - whether an existing function can name an arbitrary note set (Top-K),
 *   - card count versus the expected count, and analysis time.
 * Only aggregates are written (docs/phase10.0/evidence/). No MIDI bytes, paths or names.
 *
 *   npx vite-node scripts/p10/correction-model-audit.ts
 */
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { buildScenarioMidi, p10Scenarios } from "../../src/testing/p10SyntheticSongs";
import { analyzeMidi, annotateVoiceRolesV2, buildVoices, normalizeNotes, parseMidi } from "../../src/domain/midi";
import { beatsPerBar } from "../../src/domain/midi/timing";
import { segmentSections } from "../../src/domain/midi/sections";
import { attachSourceVoicings } from "../../src/domain/voicing";
import { chordPitchClasses } from "../../src/domain/chordVoicing";
import { detectLiveChord } from "../../src/domain/liveMidi/liveChordDetector";
import { createLiveNoteState, toNoteKey } from "../../src/domain/liveMidi/noteState";
import { getAnalysisProfileAnalyzeOptions } from "../../src/storage/accuracyFirstSettings";
import type { ChordTimelineItem } from "../../src/domain/types";
import type { TimedNote, Voice } from "../../src/domain/midi/types";

type Scenario = import("../../src/testing/p10SyntheticSongs").Scenario;
const scenarios = p10Scenarios;
const build = buildScenarioMidi;

// ---- thresholds under test ------------------------------------------------------------------
const SHORT_BEATS = [0.25, 0.3, 0.5];
const REPEAT_N = [4, 8, 16];
const GRID = 0.25;
const GRID_TOLERANCE = 0.05;
/** "-nonchord": only a melody-role note whose pitch class is not in the card name's chord tones. */
type MelodyRule = "continued-top" | "melody-role" | "either" | "melody-role-nonchord" | "continued-top-or-melody-nonchord";
const MELODY_RULES: MelodyRule[] = ["continued-top", "melody-role", "either", "melody-role-nonchord", "continued-top-or-melody-nonchord"];

interface Span { card: ChordTimelineItem; start: number; end: number }
type BeatNote = { pitch: number; start: number; end: number; voice?: Voice };

function run(scenario: Scenario, melodyFilter?: boolean) {
  const bytes = build(scenario);
  const defaults = getAnalysisProfileAnalyzeOptions();
  const options = melodyFilter === undefined ? defaults : { ...defaults, accuracyFirst: { ...defaults.accuracyFirst, melodyContaminationFilter: melodyFilter } };
  const t0 = performance.now();
  const result = analyzeMidi(bytes, options);
  const analysisMs = performance.now() - t0;
  const sourceData = parseMidi(bytes);
  const voices = annotateVoiceRolesV2(buildVoices(sourceData), normalizeNotes(sourceData));
  const t1 = performance.now();
  const timeline = attachSourceVoicings(result.fullTimeline, { analysis: result, sourceData, sourceVoices: voices, accuracyFirst: options.accuracyFirst });
  const voicingMs = performance.now() - t1;
  const meter = beatsPerBar(result.timeSignature);
  const tpb = sourceData.ticksPerBeat;
  const voiceOf = (note: TimedNote) => voices.find((voice) => voice.trackIndex === note.trackIndex && voice.channel === note.channel);
  const notes: BeatNote[] = sourceData.notes.map((note) => ({ pitch: note.pitch, start: note.startTick / tpb, end: (note.startTick + note.durationTick) / tpb, voice: voiceOf(note) }));
  const spans: Span[] = timeline.map((card) => { const start = (card.bar - 1) * meter + card.beat - 1; return { card, start, end: start + card.durationBeats }; });
  const inSpan = (span: Span) => notes.filter((note) => note.start < span.end && note.end > span.start);

  // Mapping sourceVoicing pitches back to source notes.
  let matched = 0, unmatched = 0, noVoicing = 0, aggregated = 0, simultaneous = 0, cardsFullyMatched = 0;
  const used: number[][] = spans.map((span) => {
    const voicing = span.card.voicingMemory?.sourceVoicing;
    if (!voicing) { noVoicing += 1; return []; }
    if (voicing.representation === "aggregated-note-set") aggregated += 1; else simultaneous += 1;
    const here = inSpan(span);
    let all = true;
    for (const pitch of voicing.midiNotes) {
      if (here.some((note) => note.pitch === pitch)) matched += 1; else { unmatched += 1; all = false; }
    }
    if (all) cardsFullyMatched += 1;
    return [...voicing.midiNotes];
  });

  // Review rules.
  const melodyFlags = (rule: MelodyRule) => spans.filter((span, index) => {
    const here = inSpan(span);
    const top = Math.max(...here.map((note) => note.pitch));
    const tones = new Set(chordPitchClasses(span.card.chord));
    const continued = (pitch: number, note: BeatNote) => pitch === top && note.start < span.start - 1e-6;
    const melody = (note: BeatNote) => note.voice?.inferredRole === "melody";
    return used[index]!.some((pitch) => here.some((note) => {
      if (note.pitch !== pitch) return false;
      if (rule === "continued-top") return continued(pitch, note);
      if (rule === "melody-role") return melody(note);
      if (rule === "either") return continued(pitch, note) || melody(note);
      const nonChord = melody(note) && !tones.has(pitch % 12);
      return rule === "melody-role-nonchord" ? nonChord : continued(pitch, note) || nonChord;
    }));
  }).length;
  const percussionFlags = (shortBeats: number, repeat: number) => {
    const onGrid = (beat: number) => Math.abs(beat / GRID - Math.round(beat / GRID)) * GRID <= GRID_TOLERANCE;
    const counts = new Map<number, number>();
    for (const note of notes) if (note.end - note.start <= shortBeats + 1e-6 && onGrid(note.start)) counts.set(note.pitch, (counts.get(note.pitch) ?? 0) + 1);
    const suspects = new Set([...counts].filter(([, count]) => count >= repeat).map(([pitch]) => pitch));
    return {
      suspectPitches: suspects.size,
      cardsUsingSuspect: used.filter((pitches) => pitches.some((pitch) => suspects.has(pitch))).length,
      cardsContainingSuspect: spans.filter((span) => inSpan(span).some((note) => suspects.has(note.pitch))).length,
    };
  };
  const melodyOnlyPitch = spans.filter((span, index) => {
    const here = inSpan(span);
    return used[index]!.some((pitch) => {
      const owners = here.filter((note) => note.pitch === pitch);
      return owners.length > 0 && owners.every((note) => note.voice?.inferredRole === "melody");
    });
  }).length;
  const shape = (pitches: number[]) => pitches.length ? `${[...new Set(pitches.map((p) => p % 12))].sort((a, b) => a - b).join(",")}/${Math.min(...pitches)}` : "";
  const sameSplit = used.filter((pitches, index) => index + 1 < used.length && pitches.length > 0 && shape(pitches) === shape(used[index + 1]!)).length;

  // Naming an arbitrary note set (spec 8.4) and chord tones (spec 6.4).
  let named = 0, agrees = 0, alternativesTotal = 0;
  used.forEach((pitches, index) => {
    if (pitches.length < 3) return;
    const state = createLiveNoteState();
    for (const pitch of pitches) state.held.set(toNoteKey(0, pitch), { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 });
    const detection = detectLiveChord(state);
    if (detection.kind !== "chord" || !detection.chord) return;
    named += 1;
    alternativesTotal += 1 + detection.alternatives.length;
    const card = spans[index]!.card.chord;
    if (chordPitchClasses(detection.chord).join() === chordPitchClasses(card).join() && detection.chord.root === card.root) agrees += 1;
  });

  const melodyByRule = Object.fromEntries(MELODY_RULES.map((rule) => [rule, melodyFlags(rule)]));
  const percussionGrid = Object.fromEntries(SHORT_BEATS.flatMap((short) => REPEAT_N.map((n) => [`short<=${short}&n>=${n}`, percussionFlags(short, n)])));
  return {
    id: melodyFilter === undefined ? scenario.id : `${scenario.id}+melodyFilter`,
    melodyContaminationFilter: options.accuracyFirst?.melodyContaminationFilter ?? false,
    about: scenario.about,
    bars: result.fullTimeline.length ? Math.max(...spans.map((span) => Math.ceil(span.end / meter))) : 0,
    sourceNotes: notes.length,
    cards: timeline.length,
    expectedCards: scenario.expectedCards ?? null,
    cardDelta: scenario.expectedCards === undefined ? null : timeline.length - scenario.expectedCards,
    sections: result.sections?.length ?? 0,
    /** The pure segmenter called from outside the analyzer (the product mode phase4-v1 does not return sections). */
    sectionsViaSegmenter: segmentSections(sourceData, result.fullTimeline).length,
    alternativesPerCard: +(timeline.reduce((sum, card) => sum + card.alternatives.length, 0) / Math.max(1, timeline.length)).toFixed(2),
    voiceRoles: voices.map((voice) => voice.inferredRole),
    mapping: { cardsWithVoicing: timeline.length - noVoicing, cardsWithoutVoicing: noVoicing, simultaneous, aggregated, pitchesMatched: matched, pitchesUnmatched: unmatched, cardsFullyMatched },
    review: { melodyByRule, melodyOnlyPitchUsed: melodyOnlyPitch, percussionGrid, sameChordSplit: sameSplit },
    naming: { cardsNamed: named, agreesWithCard: agrees, meanCandidates: named ? +(alternativesTotal / named).toFixed(2) : 0, maxCandidates: 3 },
    timingMs: { analysis: Math.round(analysisMs), sourceVoicing: Math.round(voicingMs) },
  };
}

const rows = [
  ...scenarios.map((scenario) => run(scenario)),
  // The product's optional melody filter, on the scenarios with a melody track.
  ...scenarios.filter((scenario) => scenario.parts.some((part) => part.name === "Lead")).map((scenario) => run(scenario, true)),
];
const output = {
  generatedBy: "scripts/p10/correction-model-audit.ts",
  note: "Synthetic MIDI built in memory; product pipeline with the default analysis profile. Aggregates only.",
  thresholdsTried: { shortBeats: SHORT_BEATS, repeatN: REPEAT_N, grid: GRID, gridTolerance: GRID_TOLERANCE, melodyRules: MELODY_RULES },
  scenarios: rows,
};
const target = process.argv[2] ?? "docs/phase10.0/evidence/P10.0-00-correction-model.json";
writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`);
for (const row of rows) console.log(JSON.stringify({ id: row.id, cards: row.cards, expected: row.expectedCards, roles: row.voiceRoles, unmatched: row.mapping.pitchesUnmatched, melody: row.review.melodyByRule, melodyOnly: row.review.melodyOnlyPitchUsed, perc: row.review.percussionGrid["short<=0.3&n>=8"], split: row.review.sameChordSplit, ms: row.timingMs }));

// Baseline (spec 6.3 rules at the proposed thresholds, card counts, timing).
const PROPOSED = { shortBeats: 0.3, repeatN: 16, melodyRule: "continued-top-or-melody-nonchord" as MelodyRule };
const baseline = {
  generatedBy: "scripts/p10/correction-model-audit.ts",
  proposedThresholds: "docs/phase10.0/contracts/P10-review-thresholds.json",
  scenarios: rows.map((row) => {
    const percussion = row.review.percussionGrid[`short<=${PROPOSED.shortBeats}&n>=${PROPOSED.repeatN}`]!;
    return {
      id: row.id,
      cards: row.cards,
      expectedCards: row.expectedCards,
      cardDelta: row.cardDelta,
      flagged: {
        melody: row.review.melodyByRule[PROPOSED.melodyRule],
        percussionUsed: percussion.cardsUsingSuspect,
        percussionPresent: percussion.cardsContainingSuspect,
        sameChordSplit: row.review.sameChordSplit,
      },
      melodyRuleAlternatives: row.review.melodyByRule,
      analysisMs: row.timingMs.analysis,
      sourceVoicingMs: row.timingMs.sourceVoicing,
    };
  }),
};
writeFileSync(process.argv[3] ?? "docs/phase10.0/evidence/P10.0-00-baseline.json", `${JSON.stringify(baseline, null, 2)}\n`);
