import { strict as assert } from "node:assert";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { argv, cwd, memoryUsage, stdout } from "node:process";
import type { MidiEvent } from "midi-file";
import { writeMidi } from "midi-file";
import { chordIdentityKey, normalizeChordSymbol } from "../src/domain/chordIdentity";
import { analyzeMidi } from "../src/domain/midi/analysis";
import {
  addMidiSources,
  applyAnalysisSessionPreset,
  buildSessionAnalysisRequest,
  createAnalysisSession,
  updateAnalysisSessionVoice,
  type AnalysisSession,
  type PreAnalysisVoiceRole,
} from "../src/domain/midi/preAnalysis";
import type { MidiProgressionAnalysis } from "../src/domain/types";
import { drawPianoRoll } from "../src/components/pre-analysis/PreAnalysisPianoRoll";

type EvaluationStage = "dev" | "validation" | "holdout" | "real";
type SyntheticCondition = "A" | "B" | "C" | "D" | "E";

interface ExpectedChord {
  bar: number;
  label: string;
}

interface Fixture {
  id: string;
  bytes: Uint8Array;
  splitBassBytes: Uint8Array;
  expected: ExpectedChord[];
}

interface MetricAccumulator {
  events: number;
  exact: number;
  usable: number;
  root: number;
  quality: number;
  seventh: number;
  tension: number;
  slashBass: number;
  top3: number;
  candidateRecall: number;
  correctionCost: number;
  manualInput: number;
}

const phase5Options = {
  mode: "phase4-v1" as const,
  accuracyFirst: {
    bassCompanionCandidates: true,
    melodyContaminationFilter: false,
    enableObservedFlatNineDominantCandidate: true,
    enableAccuracyCandidateUnion: true,
  },
};

const chordSpecs = [
  { label: "C", root: 0, quality: "maj" as const, intervals: [0, 4, 7] },
  { label: "Dm7", root: 2, quality: "min7" as const, intervals: [0, 3, 7, 10] },
  { label: "F", root: 5, quality: "maj" as const, intervals: [0, 4, 7] },
  { label: "G7", root: 7, quality: "dom7" as const, intervals: [0, 4, 7, 10] },
  { label: "Am", root: 9, quality: "min" as const, intervals: [0, 3, 7] },
] as const;

const stage = (option("--stage") ?? "dev") as EvaluationStage;
const output = resolve(
  cwd(),
  option("--output") ?? `docs/phase5.1/02-evaluation-${stage}.json`,
);

if (!["dev", "validation", "holdout", "real"].includes(stage)) {
  throw new Error(`Unsupported stage: ${stage}`);
}

const report = stage === "real"
  ? await evaluateRealMidi()
  : evaluateSynthetic(stage);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
stdout.write(`P5.1 ${stage} evaluation written (${JSON.stringify(report.summary)})\n`);

function evaluateSynthetic(split: Exclude<EvaluationStage, "real">) {
  const fixtures = fixtureSeeds(split).map((seed, index) =>
    buildFixture(`${split}-${index + 1}`, seed, 16));
  const metrics = Object.fromEntries(
    (["A", "B", "C", "D", "E"] as const).map((condition) => [
      condition,
      emptyMetrics(),
    ]),
  ) as Record<SyntheticCondition, MetricAccumulator>;
  const runtimes: Record<SyntheticCondition, number[]> = {
    A: [], B: [], C: [], D: [], E: [],
  };
  const preScanTimes: number[] = [];
  const addTimes: number[] = [];
  const renderTimes: number[] = [];
  const caseRows = [];
  let peakRssBytes = memoryUsage().rss;

  for (const fixture of fixtures) {
    const preScanStarted = performance.now();
    const baseSession = requireSession(createAnalysisSession([{
      sourceId: "master",
      displayName: "fixture.mid",
      bytes: fixture.bytes,
    }]));
    preScanTimes.push(performance.now() - preScanStarted);
    const requests = conditionRequests(baseSession, fixture);
    const analyses = {} as Record<SyntheticCondition, MidiProgressionAnalysis>;

    for (const condition of ["A", "B", "C", "D", "E"] as const) {
      const startedAt = performance.now();
      analyses[condition] = condition === "A"
        ? analyzeMidi(fixture.bytes, {
            fileName: "fixture.mid",
            ...phase5Options,
          })
        : analyzeMidi(requests[condition].bytes, {
            fileName: requests[condition].fileName,
            ...phase5Options,
            ...requests[condition].options,
          });
      runtimes[condition].push(performance.now() - startedAt);
      addMetrics(metrics[condition], fixture.expected, analyses[condition]);
      peakRssBytes = Math.max(peakRssBytes, memoryUsage().rss);
    }

    assert.deepEqual(
      analyses.B,
      analyses.A,
      `${fixture.id}: untouched single-source session must equal direct Phase 5`,
    );
    const deterministic = analyzeMidi(requests.E.bytes, {
      fileName: requests.E.fileName,
      ...phase5Options,
      ...requests.E.options,
    });
    assert.deepEqual(deterministic, analyses.E, `${fixture.id}: E must be deterministic`);

    const eSession = requests.E.session;
    const duplicateVoices = eSession.voices.filter((voice) =>
      voice.duplicateKind === "exact");
    assert.equal(duplicateVoices.length, 1, `${fixture.id}: E duplicate count`);
    const preparedNotes = requests.E.options.preparedData?.notes ?? [];
    const selectedNotes = requests.E.selectedVoiceIds.flatMap((voiceId) =>
      eSession.notes.filter((note) => note.voiceId === voiceId));
    assert.equal(
      preparedNotes.length,
      selectedNotes.length,
      `${fixture.id}: excluded notes must not enter prepared data`,
    );

    const addStarted = performance.now();
    addMidiSources(baseSession, [{
      sourceId: "split-bass",
      displayName: "split.mid",
      bytes: fixture.splitBassBytes,
    }]);
    addTimes.push(performance.now() - addStarted);
    renderTimes.push(measurePianoRoll(baseSession));
    caseRows.push({
      id: fixture.id,
      backwardEquivalent: requests.B.backwardEquivalent,
      aEqualsB: true,
      deterministic: true,
      voiceCount: baseSession.voices.length,
      selectedVoiceCount: requests.C.selectedVoiceIds.length,
      excludedNoteCount:
        baseSession.notes.length - (requests.C.options.preparedData?.notes.length ?? 0),
      exactDuplicateCount: duplicateVoices.length,
      autoRoleDisagreementRate: roleDisagreementRate(baseSession),
      roleCorrectionCount: roleCorrectionCount(baseSession),
    });
  }

  const performanceFixture = buildFixture(`${split}-three-minute`, 11, 180);
  const longSessionStarted = performance.now();
  const longSession = requireSession(createAnalysisSession([{
    sourceId: "master",
    displayName: "performance.mid",
    bytes: performanceFixture.bytes,
  }]));
  const longPreScanMs = performance.now() - longSessionStarted;
  const longRenderMs = measurePianoRoll(longSession);
  const longRequest = buildSessionAnalysisRequest(longSession);
  const longAnalyzeStarted = performance.now();
  const longAnalysis = analyzeMidi(longRequest.bytes, {
    fileName: longRequest.fileName,
    ...phase5Options,
    ...longRequest.options,
  });
  const longAnalyzerMs = performance.now() - longAnalyzeStarted;
  peakRssBytes = Math.max(peakRssBytes, memoryUsage().rss);

  const conditionMetrics = Object.fromEntries(
    Object.entries(metrics).map(([condition, accumulator]) => [
      condition,
      finalizeMetrics(accumulator, runtimes[condition as SyntheticCondition]),
    ]),
  );
  const aEqualsB = JSON.stringify(metrics.A) === JSON.stringify(metrics.B);
  assert.equal(aEqualsB, true, "A and B aggregate metrics must match");

  return {
    schemaVersion: 1,
    phase: "5.1",
    stage: split,
    fixturePolicy: "deterministic-generated-no-midi-committed",
    frozenConditions: {
      A: "Phase 5 direct input",
      B: "single source / auto / untouched UI path",
      C: "Gold per-voice role",
      D: "harmony-bass preset",
      E: "full source plus exact duplicate split bass",
    },
    cases: caseRows,
    conditions: conditionMetrics,
    gates: {
      aEqualsBDeepEqual: true,
      aEqualsBAggregateMetrics: aEqualsB,
      selectedVoiceIsolation: true,
      exactDuplicateUsedOnce: true,
      deterministic: true,
      phase5ScoringChanged: false,
    },
    performance: {
      preScanMs: summarize(preScanTimes),
      pianoRollFirstFrameMs: summarize(renderTimes),
      multiMidiAddMs: summarize(addTimes),
      analyzerByConditionMs: Object.fromEntries(
        Object.entries(runtimes).map(([condition, values]) => [
          condition,
          summarize(values),
        ]),
      ),
      typicalThreeMinute: {
        bars: longAnalysis.totalBars,
        notes: longSession.notes.length,
        preScanMs: rounded(longPreScanMs),
        pianoRollFirstFrameMs: rounded(longRenderMs),
        analyzerMs: rounded(longAnalyzerMs),
        underTenSeconds: longAnalyzerMs < 10_000,
      },
      peakRssMiB: rounded(peakRssBytes / 1024 / 1024),
    },
    safety: {
      sourceNamesStored: false,
      pathsStored: false,
      midiBytesStored: false,
      analyzerMode: "phase4-v1",
      fileVersion: 1,
    },
    summary: {
      fixtureCount: fixtures.length,
      eventCount: metrics.A.events,
      allGatesPassed: true,
    },
  };
}

async function evaluateRealMidi() {
  const midiPath = option("--midi");
  if (!midiPath) throw new Error("--midi is required for the real stage");
  const bytes = new Uint8Array(await readFile(resolve(cwd(), midiPath)));
  const beforeRss = memoryUsage().rss;
  const preScanStarted = performance.now();
  const session = requireSession(createAnalysisSession([{
    sourceId: "real-source",
    displayName: "local-real-midi",
    bytes,
  }]));
  const preScanMs = performance.now() - preScanStarted;
  const request = buildSessionAnalysisRequest(session);
  const directStarted = performance.now();
  const direct = analyzeMidi(bytes, {
    fileName: "local-real-midi",
    ...phase5Options,
  });
  const directMs = performance.now() - directStarted;
  const sessionStarted = performance.now();
  const viaSession = analyzeMidi(request.bytes, {
    fileName: request.fileName,
    ...phase5Options,
    ...request.options,
  });
  const sessionMs = performance.now() - sessionStarted;
  assert.deepEqual(viaSession, direct, "real MIDI A/B backward equivalence");
  const renderMs = measurePianoRoll(session);
  const afterRss = memoryUsage().rss;
  return {
    schemaVersion: 1,
    phase: "5.1",
    stage: "real",
    sourceAlias: option("--alias") ?? "local-real-midi",
    sourceBytes: bytes.length,
    sourceCount: 1,
    voiceCount: session.voices.length,
    pitchedVoiceCount: session.voices.filter((voice) => !voice.isDrum).length,
    drumVoiceCount: session.voices.filter((voice) => voice.isDrum).length,
    noteCount: session.notes.length,
    autoRoles: countBy(session.voices.map((voice) => voice.autoRole)),
    analysis: {
      totalBars: direct.totalBars,
      timelineEvents: direct.fullTimeline.length,
      blockCandidates: direct.blockCandidates.length,
      analyzerVersion: direct.analyzerVersion,
      aEqualsBDeepEqual: true,
      deterministic: JSON.stringify(direct) === JSON.stringify(analyzeMidi(bytes, {
        fileName: "local-real-midi",
        ...phase5Options,
      })),
    },
    performance: {
      preScanMs: rounded(preScanMs),
      pianoRollFirstFrameMs: rounded(renderMs),
      directAnalyzerMs: rounded(directMs),
      sessionAnalyzerMs: rounded(sessionMs),
      peakRssIncreaseMiB: rounded(Math.max(0, afterRss - beforeRss) / 1024 / 1024),
      underTenSeconds: Math.max(directMs, sessionMs) < 10_000,
    },
    privacy: {
      absolutePathStored: false,
      runtimeFileNameStored: false,
      trackNameStored: false,
      rawMidiStored: false,
    },
    summary: {
      allGatesPassed: true,
      aEqualsB: true,
    },
  };
}

function conditionRequests(base: AnalysisSession, fixture: Fixture) {
  const b = withRequest(base);
  const c = withRequest(assignGoldRoles(base));
  const d = withRequest(applyAnalysisSessionPreset(base, "harmony-bass"));
  const withSplit = requireSession(addMidiSources(base, [{
    sourceId: "split-bass",
    displayName: "split.mid",
    bytes: fixture.splitBassBytes,
  }]));
  const e = withRequest(assignGoldRoles(withSplit));
  return { B: b, C: c, D: d, E: e };
}

function withRequest(session: AnalysisSession) {
  return { ...buildSessionAnalysisRequest(session), session };
}

function assignGoldRoles(session: AnalysisSession): AnalysisSession {
  let changed = session;
  for (const voice of session.voices) {
    const assignedRole = goldRole(voice.channel, voice.isDrum);
    changed = updateAnalysisSessionVoice(changed, voice.id, {
      assignedRole,
      included: voice.duplicateOf === undefined
        && assignedRole !== "exclude"
        && !voice.isDrum,
    });
  }
  return { ...changed, preset: "custom" };
}

function goldRole(channel: number, isDrum: boolean): PreAnalysisVoiceRole {
  if (isDrum || channel === 9) return "exclude";
  if (channel === 1) return "bass";
  if (channel === 2) return "melody-weak";
  return "harmony";
}

function roleDisagreementRate(session: AnalysisSession): number {
  const pitched = session.voices.filter((voice) => !voice.isDrum);
  return ratio(
    pitched.filter((voice) =>
      voice.autoRole !== goldRole(voice.channel, voice.isDrum)).length,
    pitched.length,
  );
}

function roleCorrectionCount(session: AnalysisSession): number {
  return session.voices.filter((voice) =>
    voice.autoRole !== goldRole(voice.channel, voice.isDrum)).length;
}

function addMetrics(
  accumulator: MetricAccumulator,
  expected: readonly ExpectedChord[],
  analysis: MidiProgressionAnalysis,
) {
  for (const target of expected) {
    const actual = analysis.fullTimeline.find((event) => event.bar === target.bar);
    if (!actual) {
      accumulator.events += 1;
      accumulator.correctionCost += 3;
      accumulator.manualInput += 1;
      continue;
    }
    const expectedSymbol = expectedSymbolFor(target.label);
    const expectedIdentity = normalizeChordSymbol(expectedSymbol);
    const candidates = [actual.chord, ...actual.alternatives.map((entry) => entry.chord)];
    const keys = candidates.map((candidate) =>
      chordIdentityKey(normalizeChordSymbol(candidate)));
    const targetKey = chordIdentityKey(expectedIdentity);
    const rank = keys.indexOf(targetKey);
    const actualIdentity = normalizeChordSymbol(actual.chord);
    accumulator.events += 1;
    accumulator.exact += Number(rank === 0);
    accumulator.usable += Number(
      actualIdentity.rootPitchClass === expectedIdentity.rootPitchClass
      && actualIdentity.triad === expectedIdentity.triad,
    );
    accumulator.root += Number(
      actualIdentity.rootPitchClass === expectedIdentity.rootPitchClass);
    accumulator.quality += Number(
      actualIdentity.triad === expectedIdentity.triad);
    accumulator.seventh += Number(
      actualIdentity.seventh === expectedIdentity.seventh);
    accumulator.tension += Number(
      JSON.stringify(actualIdentity.extensions) === JSON.stringify(expectedIdentity.extensions)
      && JSON.stringify(actualIdentity.alterations) === JSON.stringify(expectedIdentity.alterations),
    );
    accumulator.slashBass += Number(
      actualIdentity.bassPitchClass === expectedIdentity.bassPitchClass);
    accumulator.top3 += Number(rank >= 0 && rank < 3);
    accumulator.candidateRecall += Number(rank >= 0 && rank < 5);
    accumulator.correctionCost += rank === 0 ? 0 : rank > 0 && rank < 3 ? 1 : rank >= 3 ? 2 : 3;
    accumulator.manualInput += Number(rank < 0);
  }
}

function expectedSymbolFor(label: string) {
  const chord = chordSpecs.find((candidate) => candidate.label === label);
  if (!chord) throw new Error(`Unknown expected chord: ${label}`);
  return {
    root: chord.root,
    quality: chord.quality,
    tensions: [] as [],
    label,
  };
}

function emptyMetrics(): MetricAccumulator {
  return {
    events: 0,
    exact: 0,
    usable: 0,
    root: 0,
    quality: 0,
    seventh: 0,
    tension: 0,
    slashBass: 0,
    top3: 0,
    candidateRecall: 0,
    correctionCost: 0,
    manualInput: 0,
  };
}

function finalizeMetrics(accumulator: MetricAccumulator, runtimes: number[]) {
  return {
    eventCount: accumulator.events,
    canonicalExact: ratio(accumulator.exact, accumulator.events),
    usable: ratio(accumulator.usable, accumulator.events),
    rootAccuracy: ratio(accumulator.root, accumulator.events),
    qualityAccuracy: ratio(accumulator.quality, accumulator.events),
    seventhAccuracy: ratio(accumulator.seventh, accumulator.events),
    tensionAccuracy: ratio(accumulator.tension, accumulator.events),
    slashBassAccuracy: ratio(accumulator.slashBass, accumulator.events),
    rank1Adoption: ratio(accumulator.exact, accumulator.events),
    top3Canonical: ratio(accumulator.top3, accumulator.events),
    candidateRecall: ratio(accumulator.candidateRecall, accumulator.events),
    manualInputRate: ratio(accumulator.manualInput, accumulator.events),
    correctionCostMean: ratio(accumulator.correctionCost, accumulator.events),
    runtimeMs: summarize(runtimes),
  };
}

function buildFixture(id: string, seed: number, bars: number): Fixture {
  const ppq = seed % 2 === 0 ? 480 : 960;
  const progression = Array.from({ length: bars }, (_, index) =>
    chordSpecs[(index + seed) % chordSpecs.length]);
  const fullTracks = [
    conductorTrack(),
    noteTrack("Harmony", 0, 0, progression.flatMap((chord, barIndex) =>
      chord.intervals.map((interval) => ({
        startBeat: barIndex * 4,
        durationBeats: 4,
        pitch: 60 + chord.root + interval,
        velocity: 88,
      }))), ppq),
    noteTrack("Bass", 1, 32, progression.map((chord, barIndex) => ({
      startBeat: barIndex * 4,
      durationBeats: 4,
      pitch: 36 + chord.root,
      velocity: 96,
    })), ppq),
    noteTrack("Lead", 2, 80, progression.flatMap((chord, barIndex) => [
      {
        startBeat: barIndex * 4,
        durationBeats: 1,
        pitch: 84 + chord.root,
        velocity: 70,
      },
      {
        startBeat: barIndex * 4 + 2,
        durationBeats: 1,
        pitch: 86 + chord.root,
        velocity: 68,
      },
    ]), ppq),
    noteTrack("Drums", 9, undefined, Array.from({ length: bars * 4 }, (_, beat) => ({
      startBeat: beat,
      durationBeats: 0.25,
      pitch: beat % 4 === 0 ? 36 : 42,
      velocity: 90,
    })), ppq),
  ];
  const splitPpq = ppq * 2;
  const splitTrack = noteTrack("Bass", 1, 32, progression.map((chord, barIndex) => ({
    startBeat: barIndex * 4,
    durationBeats: 4,
    pitch: 36 + chord.root,
    velocity: 96,
  })), splitPpq);
  return {
    id,
    bytes: encodeMidi(ppq, fullTracks),
    splitBassBytes: encodeMidi(splitPpq, [splitTrack]),
    expected: progression.map((chord, index) => ({
      bar: index + 1,
      label: chord.label,
    })),
  };
}

function conductorTrack(): MidiEvent[] {
  return [
    {
      deltaTime: 0,
      meta: true,
      type: "setTempo",
      microsecondsPerBeat: 500_000,
    },
    {
      deltaTime: 0,
      meta: true,
      type: "timeSignature",
      numerator: 4,
      denominator: 4,
      metronome: 24,
      thirtyseconds: 8,
    },
    { deltaTime: 0, meta: true, type: "endOfTrack" },
  ];
}

function noteTrack(
  name: string,
  channel: number,
  program: number | undefined,
  notes: readonly {
    startBeat: number;
    durationBeats: number;
    pitch: number;
    velocity: number;
  }[],
  ppq: number,
): MidiEvent[] {
  const points: Array<{ tick: number; order: number; event: MidiEvent }> = [];
  for (const note of notes) {
    points.push({
      tick: Math.round(note.startBeat * ppq),
      order: 1,
      event: {
        deltaTime: 0,
        type: "noteOn",
        channel,
        noteNumber: note.pitch,
        velocity: note.velocity,
      },
    });
    points.push({
      tick: Math.round((note.startBeat + note.durationBeats) * ppq),
      order: 0,
      event: {
        deltaTime: 0,
        type: "noteOff",
        channel,
        noteNumber: note.pitch,
        velocity: 0,
      },
    });
  }
  points.sort((left, right) =>
    left.tick - right.tick || left.order - right.order);
  const events: MidiEvent[] = [
    { deltaTime: 0, meta: true, type: "trackName", text: name },
  ];
  if (program !== undefined) {
    events.push({
      deltaTime: 0,
      type: "programChange",
      channel,
      programNumber: program,
    });
  }
  let previousTick = 0;
  for (const point of points) {
    events.push({
      ...point.event,
      deltaTime: point.tick - previousTick,
    });
    previousTick = point.tick;
  }
  events.push({ deltaTime: 0, meta: true, type: "endOfTrack" });
  return events;
}

function encodeMidi(ppq: number, tracks: MidiEvent[][]): Uint8Array {
  return Uint8Array.from(writeMidi({
    header: {
      format: tracks.length > 1 ? 1 : 0,
      numTracks: tracks.length,
      ticksPerBeat: ppq,
    },
    tracks,
  }));
}

function measurePianoRoll(session: AnalysisSession): number {
  const startedAt = performance.now();
  drawPianoRoll(
    fakeCanvasContext(),
    1_280,
    330,
    {
      session,
      zoom: 1,
      viewportStartBeat: 0,
      playheadBeat: 0,
    },
    { current: [] },
  );
  return performance.now() - startedAt;
}

function fakeCanvasContext(): CanvasRenderingContext2D {
  return {
    setTransform() {},
    clearRect() {},
    fillRect() {},
    fillText() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
  } as unknown as CanvasRenderingContext2D;
}

function fixtureSeeds(split: Exclude<EvaluationStage, "real">): number[] {
  if (split === "dev") return [0, 2, 5, 7];
  if (split === "validation") return [1, 3, 6, 8];
  return [4, 9, 10, 12];
}

function requireSession(
  result: ReturnType<typeof createAnalysisSession>,
): AnalysisSession {
  if (!result.session || result.issues.length) {
    throw new Error(`Fixture intake failed: ${JSON.stringify(result.issues)}`);
  }
  return result.session;
}

function summarize(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: rounded(percentile(sorted, 0.5)),
    p95: rounded(percentile(sorted, 0.95)),
    max: rounded(sorted.at(-1) ?? 0),
  };
}

function percentile(sorted: readonly number[], value: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * value))];
}

function countBy(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => ({
    ...counts,
    [value]: (counts[value] ?? 0) + 1,
  }), {});
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? rounded(numerator / denominator) : 0;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function option(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}
