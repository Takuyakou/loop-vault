import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseChordLabel } from "../../src/domain/chords";
import {
  buildVoiceFeatureInputs,
  buildVoices,
  parseMidi,
} from "../../src/domain/midi";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import type {
  MidiSongData,
  TimedNote,
  Voice,
} from "../../src/domain/midi/types";
import { annotateVoiceRoles } from "../../src/domain/midi/voiceRoles";
import {
  extractAggregatedCandidate,
  extractSimultaneousCandidates,
  extractVoicing,
  filterEventLocalMelodyContamination,
  normalizeMidiNotes,
  scoreVoicingCandidate,
  voicingNoteSetMetrics,
  type MelodyContaminationFilterOptions,
  type VoicingCandidate,
  type VoicingExtractionInput,
} from "../../src/domain/voicing";
import {
  loadPhase44Manifest,
  type Phase44CorpusFile,
  type Phase44GoldEvent,
  type Phase44GoldNote,
} from "../phase44/targetedCorpus";

export type RootCauseClassification =
  | "filter-not-triggered"
  | "same-pitch-duplicate"
  | "unfiltered-rebuild"
  | "candidate-unchanged"
  | "status-only-change"
  | "missing-harmony-dominant"
  | "evaluator-provenance-mismatch";

export interface RootCauseSignals {
  filterTriggered: boolean;
  samePitchDuplicate: boolean;
  unfilteredRebuild: boolean;
  candidateStructurallyUnchanged: boolean;
  finalPitchSetUnchanged: boolean;
  statusChanged: boolean;
  missingHarmonyDominant: boolean;
  evaluatorProvenanceMismatch: boolean;
}

export interface NoteInstanceTrace {
  noteInstanceId: string;
  pitch: number;
  startBeat: number;
  endBeat: number;
  trackIndex: number;
  trackName: string | null;
  channel: number | null;
  voiceId: string | null;
  inferredRole: Voice["inferredRole"] | null;
  roleConfidence: number | null;
  goldRole: string | null;
  goldVoicing: boolean | null;
  distractorKind: string | null;
}

interface CandidateTrace {
  structuralKey: string;
  representation: VoicingCandidate["representation"];
  midiNotes: number[];
  bassNote: number | null;
  onsetBeat: number;
  durationBeats: number;
  roleScore: number;
  score: number;
  confidence: number;
  requiredCoverage: number;
  foreignToneWeight: number;
  contributorNoteInstanceIds: string[];
}

interface ExtractionTrace {
  inputNoteInstanceIds: string[];
  inputPitchSet: number[];
  simultaneousCandidates: CandidateTrace[];
  aggregateCandidate: CandidateTrace | null;
  selectedCandidateSource: "simultaneous" | "aggregate" | "none";
  winner: CandidateTrace | null;
  finalSourceVoicing: {
    midiNotes: number[];
    contributorNoteInstanceIds: string[];
    status: "usable" | "review" | "not-found";
    reasons: string[];
  };
}

export interface ValidationPipelineEventTrace {
  key: string;
  fileId: string;
  scenarioId: string;
  scenarioSlug: string;
  variant: "clean" | "stress";
  eventId: string;
  chordSymbol: string;
  segment: { startBeat: number; endBeat: number };
  goldVoicingMidi: number[];
  excludedDistractorMidi: number[];
  filter: {
    triggered: boolean;
    beforeNoteInstances: NoteInstanceTrace[];
    afterNoteInstances: NoteInstanceTrace[];
    beforePitchSet: number[];
    afterPitchSet: number[];
    removedNoteInstances: NoteInstanceTrace[];
    samePitchDifferentTrackHolders: {
      removedNoteInstanceId: string;
      pitch: number;
      holders: NoteInstanceTrace[];
    }[];
    noteInstanceChanged: boolean;
    pitchSetChanged: boolean;
    leakedPitchFilterDecisions: {
      noteInstanceId: string;
      pitch: number;
      acceptedByFilter: boolean;
      rejectionReasons: string[];
      strongestConcurrentSupportPitches: number[];
    }[];
  };
  candidateDelta: {
    simultaneousBefore: number;
    simultaneousAfter: number;
    aggregateBefore: boolean;
    aggregateAfter: boolean;
    structuralCandidatesAdded: string[];
    structuralCandidatesRemoved: string[];
    candidatesWithScoreChange: {
      structuralKey: string;
      beforeScore: number;
      afterScore: number;
      beforeRoleScore: number;
      afterRoleScore: number;
    }[];
    structurallyUnchanged: boolean;
    winnerStructurallyUnchanged: boolean;
  };
  baseline: ExtractionTrace;
  shadow: ExtractionTrace;
  finalDelta: {
    pitchSetChanged: boolean;
    statusChanged: boolean;
    baselineMelodyLeakedPitches: number[];
    shadowMelodyLeakedPitches: number[];
    exactChanged: boolean;
    unfilteredRebuildDetected: boolean;
    evaluatorProvenanceMismatchPitches: number[];
  };
  firstInvalidationStage:
    | "filter-trigger"
    | "filter-pitch-projection"
    | "candidate-generation"
    | "candidate-ranking"
    | "final-normalization"
    | "evaluator"
    | "effect-survived";
  primaryClassification: RootCauseClassification;
  classifications: RootCauseClassification[];
}

export interface ValidationPipelineTraceReport {
  schemaVersion: 1;
  phase: "4.4.1";
  analyzerMode: "phase4-v1";
  fileVersion: 1;
  productBehaviorChanged: false;
  validationRun: "validation-discovery-plus-six-event-detail-trace";
  holdoutStatus: "not-run";
  frozenOptions: MelodyContaminationFilterOptions;
  totals: {
    validationFilesInspected: number;
    validationEventsInspected: number;
    contaminationEventsTraced: number;
    filterTriggeredEvents: number;
    noteInstanceChangedEvents: number;
    pitchSetChangedEvents: number;
    finalPitchSetChangedEvents: number;
    exactChangedEvents: number;
    melodyLeakChangedEvents: number;
    statusChangedEventsAllValidation: number;
    statusChangedEventsAmongContamination: number;
    unfilteredRebuildEvents: number;
  };
  statusOnlyExplanation: {
    reviewToUsableEvents: string[];
    usableToReviewEvents: string[];
    reviewToUsableWithUnchangedFinalPitchSet: string[];
    winnerDurationExtendedWithUnchangedFinalPitchSet: string[];
  };
  events: ValidationPipelineEventTrace[];
  statusChangeCohort: ValidationPipelineEventTrace[];
}

interface EventResult {
  key: string;
  baselineStatus: "usable" | "review" | "not-found";
  shadowStatus: "usable" | "review" | "not-found";
  baselinePitches: number[];
  shadowPitches: number[];
}

interface EligibleNote {
  note: TimedNote;
  noteInstanceId: string;
  pitch: number;
  startBeat: number;
  endBeat: number;
  role: Voice["inferredRole"];
  roleConfidence: number;
}

export async function tracePhase441Validation(
  corpusDir: string,
  frozenOptions: MelodyContaminationFilterOptions,
): Promise<ValidationPipelineTraceReport> {
  const manifest = await loadPhase44Manifest(corpusDir);
  const validationFiles = manifest.files.filter((file) => file.split === "validation");
  const traces: ValidationPipelineEventTrace[] = [];
  const statusChangeTraces: ValidationPipelineEventTrace[] = [];
  const allResults: EventResult[] = [];
  let validationEventsInspected = 0;

  for (const file of validationFiles) {
    const data = parseMidi(new Uint8Array(await readFile(resolve(corpusDir, file.path))));
    const rawVoices = buildVoices(data);
    const features = buildVoiceFeatureInputs(rawVoices, normalizeNotes(data));
    const productVoices = annotateVoiceRoles(rawVoices, features);
    const noteIdByReference = new Map(
      data.notes.map((note, index) => [note, buildNoteInstanceId(note, index)]),
    );

    for (const event of file.events) {
      validationEventsInspected += 1;
      const chord = parseChordLabel(event.chordSymbol);
      if (!chord) throw new Error(`Unparseable Gold chord: ${file.fileId}/${event.eventId}`);
      const input = {
        chord,
        segment: { startBeat: event.startBeat, endBeat: event.endBeat },
        notes: data.notes,
        ticksPerBeat: data.ticksPerBeat,
        voices: productVoices,
      } satisfies VoicingExtractionInput;
      const shadowFilter = filterEventLocalMelodyContamination(
        input,
        frozenOptions,
      );
      const shadowInput = { ...input, notes: shadowFilter.notes };
      const baselineResult = extractVoicing(input);
      const shadowResult = extractVoicing(shadowInput);
      const baselinePitches = baselineResult.snapshot?.midiNotes ?? [];
      const shadowPitches = shadowResult.snapshot?.midiNotes ?? [];
      const key = `${file.fileId}/${event.eventId}`;
      allResults.push({
        key,
        baselineStatus: baselineResult.status,
        shadowStatus: shadowResult.status,
        baselinePitches,
        shadowPitches,
      });
      const contaminationEvent = leakedPitches(
        baselinePitches,
        event.goldVoicingMidi,
        event.excludedDistractorMidi,
      ).length > 0;
      const statusChanged = baselineResult.status !== shadowResult.status;
      if (contaminationEvent || statusChanged) {
        const detailedTrace = traceEvent({
          data,
          file,
          event,
          productVoices,
          noteIdByReference,
          input,
          shadowInput,
          shadowFilter,
          frozenOptions,
        });
        if (contaminationEvent) traces.push(detailedTrace);
        if (statusChanged) statusChangeTraces.push(detailedTrace);
      }
    }
  }

  if (traces.length !== 6) {
    throw new Error(`Expected exactly 6 Validation contamination events, got ${traces.length}`);
  }
  const reviewToUsable = allResults.filter(
    (row) => row.baselineStatus !== "usable" && row.shadowStatus === "usable",
  );
  const usableToReview = allResults.filter(
    (row) => row.baselineStatus === "usable" && row.shadowStatus !== "usable",
  );
  return {
    schemaVersion: 1,
    phase: "4.4.1",
    analyzerMode: "phase4-v1",
    fileVersion: 1,
    productBehaviorChanged: false,
    validationRun: "validation-discovery-plus-six-event-detail-trace",
    holdoutStatus: "not-run",
    frozenOptions,
    totals: {
      validationFilesInspected: validationFiles.length,
      validationEventsInspected,
      contaminationEventsTraced: traces.length,
      filterTriggeredEvents: count(traces, (row) => row.filter.triggered),
      noteInstanceChangedEvents: count(traces, (row) => row.filter.noteInstanceChanged),
      pitchSetChangedEvents: count(traces, (row) => row.filter.pitchSetChanged),
      finalPitchSetChangedEvents: count(traces, (row) => row.finalDelta.pitchSetChanged),
      exactChangedEvents: count(traces, (row) => row.finalDelta.exactChanged),
      melodyLeakChangedEvents: count(
        traces,
        (row) => !setsEqual(
          row.finalDelta.baselineMelodyLeakedPitches,
          row.finalDelta.shadowMelodyLeakedPitches,
        ),
      ),
      statusChangedEventsAllValidation: reviewToUsable.length + usableToReview.length,
      statusChangedEventsAmongContamination: count(
        traces,
        (row) => row.finalDelta.statusChanged,
      ),
      unfilteredRebuildEvents: count(
        traces,
        (row) => row.finalDelta.unfilteredRebuildDetected,
      ),
    },
    statusOnlyExplanation: {
      reviewToUsableEvents: reviewToUsable.map((row) => row.key),
      usableToReviewEvents: usableToReview.map((row) => row.key),
      reviewToUsableWithUnchangedFinalPitchSet: reviewToUsable
        .filter((row) => setsEqual(row.baselinePitches, row.shadowPitches))
        .map((row) => row.key),
      winnerDurationExtendedWithUnchangedFinalPitchSet: statusChangeTraces
        .filter((row) =>
          !row.finalDelta.pitchSetChanged
          && (row.shadow.winner?.durationBeats ?? 0)
            > (row.baseline.winner?.durationBeats ?? 0))
        .map((row) => row.key),
    },
    events: traces,
    statusChangeCohort: statusChangeTraces,
  };
}

function traceEvent(args: {
  data: MidiSongData;
  file: Phase44CorpusFile;
  event: Phase44GoldEvent;
  productVoices: readonly Voice[];
  noteIdByReference: ReadonlyMap<TimedNote, string>;
  input: VoicingExtractionInput;
  shadowInput: VoicingExtractionInput;
  shadowFilter: ReturnType<typeof filterEventLocalMelodyContamination>;
  frozenOptions: MelodyContaminationFilterOptions;
}): ValidationPipelineEventTrace {
  const {
    data,
    file,
    event,
    productVoices,
    noteIdByReference,
    input,
    shadowInput,
    shadowFilter,
    frozenOptions,
  } = args;
  const beforeNotes = eventNotes(input.notes, data.ticksPerBeat, event);
  const afterNotes = eventNotes(shadowInput.notes, data.ticksPerBeat, event);
  const beforeInstances = beforeNotes.map((note) =>
    noteInstanceTrace(note, noteIdByReference, data, file, event, productVoices));
  const afterInstances = afterNotes.map((note) =>
    noteInstanceTrace(note, noteIdByReference, data, file, event, productVoices));
  const removedInstances = shadowFilter.removed.map((entry) =>
    noteInstanceTrace(
      entry.note,
      noteIdByReference,
      data,
      file,
      event,
      productVoices,
    ));
  const baseline = extractionTrace(input, noteIdByReference);
  const shadow = extractionTrace(shadowInput, noteIdByReference);
  const baselineCandidates = candidateMap(baseline);
  const shadowCandidates = candidateMap(shadow);
  const structuralCandidatesAdded = [...shadowCandidates.keys()]
    .filter((key) => !baselineCandidates.has(key));
  const structuralCandidatesRemoved = [...baselineCandidates.keys()]
    .filter((key) => !shadowCandidates.has(key));
  const candidatesWithScoreChange = [...baselineCandidates.entries()].flatMap(
    ([key, before]) => {
      const after = shadowCandidates.get(key);
      return after && (
        before.score !== after.score
        || before.roleScore !== after.roleScore
      )
        ? [{
            structuralKey: key,
            beforeScore: rounded(before.score),
            afterScore: rounded(after.score),
            beforeRoleScore: rounded(before.roleScore),
            afterRoleScore: rounded(after.roleScore),
          }]
        : [];
    },
  );
  const beforePitchSet = pitches(beforeInstances);
  const afterPitchSet = pitches(afterInstances);
  const samePitchDifferentTrackHolders = removedInstances.flatMap((removed) => {
    const holders = afterInstances.filter(
      (candidate) =>
        candidate.pitch === removed.pitch
        && candidate.trackIndex !== removed.trackIndex,
    );
    return holders.length === 0
      ? []
      : [{
          removedNoteInstanceId: removed.noteInstanceId,
          pitch: removed.pitch,
          holders,
        }];
  });
  const removedIds = new Set(removedInstances.map((note) => note.noteInstanceId));
  const unfilteredRebuildDetected = shadow.finalSourceVoicing
    .contributorNoteInstanceIds.some((id) => removedIds.has(id));
  const baselineLeaked = leakedPitches(
    baseline.finalSourceVoicing.midiNotes,
    event.goldVoicingMidi,
    event.excludedDistractorMidi,
  );
  const shadowLeaked = leakedPitches(
    shadow.finalSourceVoicing.midiNotes,
    event.goldVoicingMidi,
    event.excludedDistractorMidi,
  );
  const afterById = new Map(afterInstances.map((note) => [note.noteInstanceId, note]));
  const evaluatorProvenanceMismatchPitches = shadowLeaked.filter((pitch) => {
    const removedDistractor = removedInstances.some(
      (note) =>
        note.pitch === pitch
        && (note.goldVoicing === false || note.distractorKind !== null),
    );
    const remainingGoldContributor = shadow.finalSourceVoicing
      .contributorNoteInstanceIds
      .map((id) => afterById.get(id))
      .some((note) => note?.pitch === pitch && note.goldVoicing === true);
    return removedDistractor && remainingGoldContributor;
  });
  const baselineExact = voicingNoteSetMetrics(
    baseline.finalSourceVoicing.midiNotes,
    event.goldVoicingMidi,
  ).exact;
  const shadowExact = voicingNoteSetMetrics(
    shadow.finalSourceVoicing.midiNotes,
    event.goldVoicingMidi,
  ).exact;
  const structuralCandidatesUnchanged =
    structuralCandidatesAdded.length === 0
    && structuralCandidatesRemoved.length === 0;
  const winnerStructurallyUnchanged =
    baseline.winner?.structuralKey === shadow.winner?.structuralKey;
  const finalPitchSetUnchanged = setsEqual(
    baseline.finalSourceVoicing.midiNotes,
    shadow.finalSourceVoicing.midiNotes,
  );
  const statusChanged =
    baseline.finalSourceVoicing.status !== shadow.finalSourceVoicing.status;
  const missingHarmonyDominant = !hasHarmonyDominant(
    productVoices,
    beforeInstances,
  );
  const signals: RootCauseSignals = {
    filterTriggered: removedInstances.length > 0,
    samePitchDuplicate: samePitchDifferentTrackHolders.length > 0,
    unfilteredRebuild: unfilteredRebuildDetected,
    candidateStructurallyUnchanged: structuralCandidatesUnchanged,
    finalPitchSetUnchanged,
    statusChanged,
    missingHarmonyDominant,
    evaluatorProvenanceMismatch: evaluatorProvenanceMismatchPitches.length > 0,
  };
  const classifications = classifyRootCauses(signals);
  return {
    key: `${file.fileId}/${event.eventId}`,
    fileId: file.fileId,
    scenarioId: file.scenarioId,
    scenarioSlug: file.scenarioSlug,
    variant: file.variant,
    eventId: event.eventId,
    chordSymbol: event.chordSymbol,
    segment: { startBeat: event.startBeat, endBeat: event.endBeat },
    goldVoicingMidi: event.goldVoicingMidi,
    excludedDistractorMidi: event.excludedDistractorMidi,
    filter: {
      triggered: removedInstances.length > 0,
      beforeNoteInstances: beforeInstances,
      afterNoteInstances: afterInstances,
      beforePitchSet,
      afterPitchSet,
      removedNoteInstances: removedInstances,
      samePitchDifferentTrackHolders,
      noteInstanceChanged: !setsEqual(
        beforeInstances.map((note) => note.noteInstanceId),
        afterInstances.map((note) => note.noteInstanceId),
      ),
      pitchSetChanged: !setsEqual(beforePitchSet, afterPitchSet),
      leakedPitchFilterDecisions: beforeNotes
        .filter((note) => baselineLeaked.includes(note.pitch))
        .map((note) => filterDecisionForNote(
          note,
          input,
          productVoices,
          noteIdByReference,
          frozenOptions,
        )),
    },
    candidateDelta: {
      simultaneousBefore: baseline.simultaneousCandidates.length,
      simultaneousAfter: shadow.simultaneousCandidates.length,
      aggregateBefore: baseline.aggregateCandidate !== null,
      aggregateAfter: shadow.aggregateCandidate !== null,
      structuralCandidatesAdded,
      structuralCandidatesRemoved,
      candidatesWithScoreChange,
      structurallyUnchanged: structuralCandidatesUnchanged,
      winnerStructurallyUnchanged,
    },
    baseline,
    shadow,
    finalDelta: {
      pitchSetChanged: !finalPitchSetUnchanged,
      statusChanged,
      baselineMelodyLeakedPitches: baselineLeaked,
      shadowMelodyLeakedPitches: shadowLeaked,
      exactChanged: baselineExact !== shadowExact,
      unfilteredRebuildDetected,
      evaluatorProvenanceMismatchPitches,
    },
    firstInvalidationStage: firstInvalidationStage({
      filterTriggered: removedInstances.length > 0,
      filterPitchSetChanged: !setsEqual(beforePitchSet, afterPitchSet),
      candidatesChanged: !structuralCandidatesUnchanged,
      winnerChanged: !winnerStructurallyUnchanged,
      finalChanged: !finalPitchSetUnchanged,
      evaluatorChanged: !setsEqual(baselineLeaked, shadowLeaked),
    }),
    primaryClassification: primaryClassification(classifications),
    classifications,
  };
}

function filterDecisionForNote(
  note: TimedNote,
  input: VoicingExtractionInput,
  voices: readonly Voice[],
  noteIdByReference: ReadonlyMap<TimedNote, string>,
  options: MelodyContaminationFilterOptions,
): ValidationPipelineEventTrace["filter"]["leakedPitchFilterDecisions"][number] {
  const voice = note.channel === undefined
    ? undefined
    : voices.find((candidate) =>
        candidate.trackIndex === note.trackIndex
        && candidate.channel === note.channel);
  const startBeat = note.startTick / input.ticksPerBeat;
  const endBeat = (note.startTick + note.durationTick) / input.ticksPerBeat;
  const rejectionReasons: string[] = [];
  if (!voice) rejectionReasons.push("voice-not-found");
  if (voice && voice.inferredRole !== "melody") {
    rejectionReasons.push(`role-is-${voice.inferredRole}`);
  }
  if (voice && voice.roleConfidence < options.minimumRoleConfidence) {
    rejectionReasons.push(
      `role-confidence-${rounded(voice.roleConfidence)}<${options.minimumRoleConfidence}`,
    );
  }
  if (voice && voice.maxPolyphony > 1) {
    rejectionReasons.push(`max-polyphony-${voice.maxPolyphony}>1`);
  }
  if (voice && voice.highestVoiceShare < 0.5) {
    rejectionReasons.push(`highest-share-${rounded(voice.highestVoiceShare)}<0.5`);
  }
  if (voice && voice.highestVoiceShare <= voice.lowestVoiceShare) {
    rejectionReasons.push("highest-share-not-above-lowest-share");
  }
  if (endBeat <= input.segment.startBeat || startBeat >= input.segment.endBeat) {
    rejectionReasons.push("outside-segment");
  }
  const clippedStart = Math.max(startBeat, input.segment.startBeat);
  const clippedEnd = Math.min(endBeat, input.segment.endBeat);
  const support = strongestConcurrentSupportForTrace(
    input.notes.flatMap((candidate) => {
      if (candidate === note || candidate.channel === undefined) return [];
      const supportVoice = voices.find((entry) =>
        entry.trackIndex === candidate.trackIndex
        && entry.channel === candidate.channel);
      if (!supportVoice || !isHarmonySupportVoiceForTrace(supportVoice)) return [];
      const candidateStart = candidate.startTick / input.ticksPerBeat;
      const candidateEnd =
        (candidate.startTick + candidate.durationTick) / input.ticksPerBeat;
      if (candidateEnd <= clippedStart || candidateStart >= clippedEnd) return [];
      return [{
        pitch: candidate.pitch,
        startBeat: candidateStart,
        endBeat: candidateEnd,
      }];
    }),
    clippedStart,
    clippedEnd,
    options.minimumConcurrentSupportBeats,
  );
  if (support.length < options.minimumConcurrentNonMelodyPitches) {
    rejectionReasons.push(
      `concurrent-harmony-${support.length}<${options.minimumConcurrentNonMelodyPitches}`,
    );
  }
  return {
    noteInstanceId: noteIdByReference.get(note)
      ?? buildNoteInstanceId(note, input.notes.indexOf(note)),
    pitch: note.pitch,
    acceptedByFilter: rejectionReasons.length === 0,
    rejectionReasons,
    strongestConcurrentSupportPitches: support,
  };
}

function strongestConcurrentSupportForTrace(
  notes: readonly { pitch: number; startBeat: number; endBeat: number }[],
  startBeat: number,
  endBeat: number,
  minimumDuration: number,
): number[] {
  const boundaries = [
    startBeat,
    endBeat,
    ...notes.flatMap((entry) => [
      Math.max(startBeat, entry.startBeat),
      Math.min(endBeat, entry.endBeat),
    ]),
  ].filter((beat) => beat >= startBeat && beat <= endBeat)
    .sort((left, right) => left - right);
  let best: number[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const left = boundaries[index]!;
    const right = boundaries[index + 1]!;
    if (right - left + Number.EPSILON < minimumDuration) continue;
    const active = sortedUnique(notes.filter(
      (entry) => entry.startBeat <= left && entry.endBeat >= right,
    ).map((entry) => entry.pitch));
    if (
      active.length > best.length
      || (active.length === best.length && compareNotes(active, best) < 0)
    ) {
      best = active;
    }
  }
  return best;
}

function isHarmonySupportVoiceForTrace(voice: Voice): boolean {
  return voice.inferredRole === "harmony"
    || voice.inferredRole === "pad"
    || voice.inferredRole === "mixed"
    || voice.maxPolyphony >= 3;
}

function extractionTrace(
  input: VoicingExtractionInput,
  noteIdByReference: ReadonlyMap<TimedNote, string>,
): ExtractionTrace {
  const eligible = eligibleNotes(input, noteIdByReference);
  const simultaneous = extractSimultaneousCandidates(input);
  const aggregate = extractAggregatedCandidate(input);
  const productCandidates = simultaneous.length > 0
    ? simultaneous
    : aggregate ? [aggregate] : [];
  const ranked = productCandidates.map((candidate) =>
    candidateTrace(input, candidate, eligible))
    .sort(compareCandidateTraces);
  const winner = ranked[0] ?? null;
  const extraction = extractVoicing(input);
  const finalPitches = extraction.snapshot?.midiNotes ?? [];
  const contributorNoteInstanceIds = winner
    ? winner.contributorNoteInstanceIds.filter((id) => {
        const note = eligible.find((candidate) => candidate.noteInstanceId === id);
        return note !== undefined && finalPitches.includes(note.pitch);
      })
    : [];
  return {
    inputNoteInstanceIds: eligible.map((note) => note.noteInstanceId),
    inputPitchSet: sortedUnique(eligible.map((note) => note.pitch)),
    simultaneousCandidates: simultaneous.map((candidate) =>
      candidateTrace(input, candidate, eligible)),
    aggregateCandidate: aggregate
      ? candidateTrace(input, aggregate, eligible)
      : null,
    selectedCandidateSource: simultaneous.length > 0
      ? "simultaneous"
      : aggregate ? "aggregate" : "none",
    winner,
    finalSourceVoicing: {
      midiNotes: finalPitches,
      contributorNoteInstanceIds: sortedUniqueStrings(contributorNoteInstanceIds),
      status: extraction.status,
      reasons: extraction.reasons,
    },
  };
}

function candidateTrace(
  input: VoicingExtractionInput,
  candidate: VoicingCandidate,
  eligible: readonly EligibleNote[],
): CandidateTrace {
  const scored = scoreVoicingCandidate(input.chord, candidate);
  const confidence = clamp01(
    scored.score * (candidate.representation === "aggregated-note-set" ? 0.82 : 1),
  );
  const endBeat = candidate.onsetBeat + candidate.durationBeats;
  const contributors = eligible.filter((note) => {
    if (!candidate.midiNotes.includes(note.pitch)) return false;
    if (candidate.representation === "aggregated-note-set") return true;
    return note.startBeat <= candidate.onsetBeat && note.endBeat >= endBeat;
  });
  return {
    structuralKey: candidateStructuralKey(candidate),
    representation: candidate.representation,
    midiNotes: candidate.midiNotes,
    bassNote: candidate.bassNote ?? null,
    onsetBeat: rounded(candidate.onsetBeat),
    durationBeats: rounded(candidate.durationBeats),
    roleScore: candidate.roleScore,
    score: scored.score,
    confidence,
    requiredCoverage: rounded(scored.coverage.requiredCoverage),
    foreignToneWeight: rounded(scored.coverage.foreignToneWeight),
    contributorNoteInstanceIds: sortedUniqueStrings(
      contributors.map((note) => note.noteInstanceId),
    ),
  };
}

function eligibleNotes(
  input: VoicingExtractionInput,
  noteIdByReference: ReadonlyMap<TimedNote, string>,
): EligibleNote[] {
  const voices = new Map(
    (input.voices ?? []).map((voice) => [`${voice.trackIndex}:${voice.channel}`, voice]),
  );
  return input.notes.flatMap((note) => {
    const voice = note.channel === undefined
      ? undefined
      : voices.get(`${note.trackIndex}:${note.channel}`);
    const startBeat = note.startTick / input.ticksPerBeat;
    const endBeat = (note.startTick + note.durationTick) / input.ticksPerBeat;
    if (
      !Number.isInteger(note.pitch)
      || note.pitch < 0
      || note.pitch > 127
      || note.durationTick <= 0
      || endBeat <= input.segment.startBeat
      || startBeat >= input.segment.endBeat
      || note.channel === 9
      || voice?.inferredRole === "percussion"
    ) {
      return [];
    }
    return [{
      note,
      noteInstanceId: noteIdByReference.get(note)
        ?? buildNoteInstanceId(note, input.notes.indexOf(note)),
      pitch: note.pitch,
      startBeat: Math.max(startBeat, input.segment.startBeat),
      endBeat: Math.min(endBeat, input.segment.endBeat),
      role: voice?.inferredRole ?? "mixed",
      roleConfidence: voice?.roleConfidence ?? 0,
    }];
  });
}

function noteInstanceTrace(
  note: TimedNote,
  noteIdByReference: ReadonlyMap<TimedNote, string>,
  data: MidiSongData,
  file: Phase44CorpusFile,
  event: Phase44GoldEvent,
  voices: readonly Voice[],
): NoteInstanceTrace {
  const voice = note.channel === undefined
    ? undefined
    : voices.find((candidate) =>
        candidate.trackIndex === note.trackIndex
        && candidate.channel === note.channel);
  const track = data.tracks.find((candidate) => candidate.index === note.trackIndex);
  const goldTrack = file.tracks.find((candidate) =>
    candidate.channel === note.channel
    && candidate.midiTrackName === track?.name);
  const goldNote = goldTrack
    ? findGoldNote(note, data.ticksPerBeat, event, file.notes, goldTrack.trackId)
    : undefined;
  return {
    noteInstanceId: noteIdByReference.get(note)
      ?? buildNoteInstanceId(note, data.notes.indexOf(note)),
    pitch: note.pitch,
    startBeat: rounded(note.startTick / data.ticksPerBeat),
    endBeat: rounded((note.startTick + note.durationTick) / data.ticksPerBeat),
    trackIndex: note.trackIndex,
    trackName: track?.name ?? null,
    channel: note.channel ?? null,
    voiceId: voice?.id ?? null,
    inferredRole: voice?.inferredRole ?? null,
    roleConfidence: voice ? rounded(voice.roleConfidence) : null,
    goldRole: goldNote?.role ?? goldTrack?.goldRole ?? null,
    goldVoicing: goldNote?.goldVoicing ?? null,
    distractorKind: goldNote?.distractorKind ?? null,
  };
}

function findGoldNote(
  note: TimedNote,
  ticksPerBeat: number,
  event: Phase44GoldEvent,
  goldNotes: readonly Phase44GoldNote[],
  trackId: string,
): Phase44GoldNote | undefined {
  const startBeat = note.startTick / ticksPerBeat;
  const durationBeats = note.durationTick / ticksPerBeat;
  return goldNotes.find((candidate) =>
    candidate.eventId === event.eventId
    && candidate.trackId === trackId
    && candidate.midi === note.pitch
    && near(candidate.startBeat, startBeat)
    && near(candidate.durationBeats, durationBeats));
}

function eventNotes(
  notes: readonly TimedNote[],
  ticksPerBeat: number,
  event: Pick<Phase44GoldEvent, "startBeat" | "endBeat">,
): TimedNote[] {
  return notes.filter((note) => {
    const startBeat = note.startTick / ticksPerBeat;
    const endBeat = (note.startTick + note.durationTick) / ticksPerBeat;
    return endBeat > event.startBeat && startBeat < event.endBeat;
  });
}

export function buildNoteInstanceId(note: TimedNote, sourceIndex: number): string {
  return [
    `n${sourceIndex}`,
    `t${note.trackIndex}`,
    `c${note.channel ?? "x"}`,
    `s${note.startTick}`,
    `d${note.durationTick}`,
    `p${note.pitch}`,
  ].join(":");
}

export function classifyRootCauses(
  signals: RootCauseSignals,
): RootCauseClassification[] {
  const classifications: RootCauseClassification[] = [];
  if (!signals.filterTriggered) classifications.push("filter-not-triggered");
  if (signals.samePitchDuplicate) classifications.push("same-pitch-duplicate");
  if (signals.unfilteredRebuild) classifications.push("unfiltered-rebuild");
  if (signals.candidateStructurallyUnchanged) classifications.push("candidate-unchanged");
  if (signals.finalPitchSetUnchanged && signals.statusChanged) {
    classifications.push("status-only-change");
  }
  if (signals.missingHarmonyDominant) classifications.push("missing-harmony-dominant");
  if (signals.evaluatorProvenanceMismatch) {
    classifications.push("evaluator-provenance-mismatch");
  }
  return classifications.length > 0 ? classifications : ["candidate-unchanged"];
}

function primaryClassification(
  classifications: readonly RootCauseClassification[],
): RootCauseClassification {
  const order: readonly RootCauseClassification[] = [
    "filter-not-triggered",
    "unfiltered-rebuild",
    "missing-harmony-dominant",
    "same-pitch-duplicate",
    "evaluator-provenance-mismatch",
    "status-only-change",
    "candidate-unchanged",
  ];
  return order.find((classification) => classifications.includes(classification))
    ?? "candidate-unchanged";
}

function firstInvalidationStage(signals: {
  filterTriggered: boolean;
  filterPitchSetChanged: boolean;
  candidatesChanged: boolean;
  winnerChanged: boolean;
  finalChanged: boolean;
  evaluatorChanged: boolean;
}): ValidationPipelineEventTrace["firstInvalidationStage"] {
  if (!signals.filterTriggered) return "filter-trigger";
  if (!signals.filterPitchSetChanged) return "filter-pitch-projection";
  if (!signals.candidatesChanged) return "candidate-generation";
  if (!signals.winnerChanged) return "candidate-ranking";
  if (!signals.finalChanged) return "final-normalization";
  if (!signals.evaluatorChanged) return "evaluator";
  return "effect-survived";
}

function candidateMap(trace: ExtractionTrace): Map<string, CandidateTrace> {
  return new Map([
    ...trace.simultaneousCandidates,
    ...(trace.aggregateCandidate ? [trace.aggregateCandidate] : []),
  ].map((candidate) => [candidate.structuralKey, candidate]));
}

function candidateStructuralKey(candidate: VoicingCandidate): string {
  return [
    candidate.representation,
    rounded(candidate.onsetBeat),
    rounded(candidate.durationBeats),
    candidate.bassNote ?? "-",
    normalizeMidiNotes(candidate.midiNotes).join(","),
  ].join("|");
}

function compareCandidateTraces(left: CandidateTrace, right: CandidateTrace): number {
  return right.score - left.score
    || right.durationBeats - left.durationBeats
    || left.onsetBeat - right.onsetBeat
    || compareNotes(left.midiNotes, right.midiNotes);
}

function compareNotes(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return left.length - right.length;
}

function hasHarmonyDominant(
  voices: readonly Voice[],
  notes: readonly NoteInstanceTrace[],
): boolean {
  const eventVoiceIds = new Set(notes.map((note) => note.voiceId).filter(Boolean));
  return voices.some((voice) =>
    eventVoiceIds.has(voice.id)
    && (
      voice.inferredRole === "harmony"
      || voice.inferredRole === "pad"
      || voice.inferredRole === "mixed"
      || voice.maxPolyphony >= 3
    ));
}

function pitches(notes: readonly NoteInstanceTrace[]): number[] {
  return sortedUnique(notes.map((note) => note.pitch));
}

function leakedPitches(
  predicted: readonly number[],
  gold: readonly number[],
  distractors: readonly number[],
): number[] {
  const goldSet = new Set(gold);
  const distractorSet = new Set(distractors);
  return sortedUnique(predicted).filter(
    (pitch) => !goldSet.has(pitch) && distractorSet.has(pitch),
  );
}

function count<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  return values.filter(predicate).length;
}

function sortedUnique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function sortedUniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function setsEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function near(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
