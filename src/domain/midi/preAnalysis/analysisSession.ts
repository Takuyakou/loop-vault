import {
  createMidiSourceId,
  preScanMidiSource,
} from "./voiceExtraction";
import type {
  AnalysisSession,
  AnalysisSessionIntakeResult,
  AnalysisSessionSource,
  AnalysisSessionVoice,
  AnalysisSessionWarning,
  MidiIntakeIssue,
  MidiSourceInput,
  PreAnalysisNote,
  PreAnalysisSelectionPreset,
} from "./types";

const nearDuplicateThreshold = 0.9;

export function createAnalysisSession(
  inputs: readonly MidiSourceInput[],
  sessionId = "phase5.1-session",
): AnalysisSessionIntakeResult {
  return intake(undefined, inputs, sessionId);
}

export function addMidiSources(
  session: AnalysisSession,
  inputs: readonly MidiSourceInput[],
): AnalysisSessionIntakeResult {
  return intake(session, inputs, session.id);
}

export function removeMidiSource(
  session: AnalysisSession,
  sourceId: string,
): AnalysisSession | undefined {
  const sources = session.sources.filter((source) => source.id !== sourceId);
  if (!sources.length) return undefined;
  const retainedVoiceIds = new Set(
    session.voices
      .filter((voice) => voice.sourceId !== sourceId)
      .map((voice) => voice.id),
  );
  const voices = session.voices.filter((voice) =>
    retainedVoiceIds.has(voice.id));
  const notes = session.notes.filter((note) => retainedVoiceIds.has(note.voiceId));
  return finalizeSession({
    ...session,
    masterSourceId: session.masterSourceId === sourceId
      ? sources[0].id
      : session.masterSourceId,
    sources,
    voices,
    notes,
    latestSourceId: undefined,
  });
}

export function updateAnalysisSessionVoice(
  session: AnalysisSession,
  voiceId: string,
  changes: Partial<Pick<
    AnalysisSessionVoice,
    "assignedRole" | "included" | "visible" | "muted" | "solo"
  >>,
): AnalysisSession {
  return {
    ...session,
    voices: session.voices.map((voice) =>
      voice.id === voiceId ? { ...voice, ...changes } : voice),
  };
}

export function applyAnalysisSessionPreset(
  session: AnalysisSession,
  preset: PreAnalysisSelectionPreset,
): AnalysisSession {
  if (preset === "custom") return { ...session, preset };
  const voices = session.voices.map((voice): AnalysisSessionVoice => {
    const assignedRole = preset === "auto"
      ? voice.autoRole
      : voice.assignedRole;
    const included = voice.duplicateOf === undefined
      && !voice.isDrum
      && (
        preset === "all-pitched"
        || (preset === "harmony-bass"
          && (assignedRole === "harmony" || assignedRole === "bass"))
        || (preset === "accompaniment-only" && assignedRole === "harmony")
        || (preset === "auto" && assignedRole !== "exclude")
      );
    return {
      ...voice,
      assignedRole,
      included,
      solo: false,
    };
  });
  return { ...session, voices, preset };
}

export function resetAnalysisSessionAuto(
  session: AnalysisSession,
): AnalysisSession {
  return applyAnalysisSessionPreset(session, "auto");
}

export function updateAnalysisSessionSource(
  session: AnalysisSession,
  sourceId: string,
  changes: Partial<Pick<AnalysisSessionSource, "visible" | "muted">>,
): AnalysisSession {
  return {
    ...session,
    sources: session.sources.map((source) =>
      source.id === sourceId ? { ...source, ...changes } : source),
  };
}

export function selectedSessionNotes(
  session: AnalysisSession,
): PreAnalysisNote[] {
  const included = new Set(
    session.voices
      .filter((voice) => voice.included && voice.duplicateOf === undefined)
      .map((voice) => voice.id),
  );
  return session.notes.filter((note) => included.has(note.voiceId));
}

function intake(
  current: AnalysisSession | undefined,
  inputs: readonly MidiSourceInput[],
  sessionId: string,
): AnalysisSessionIntakeResult {
  const sources = current ? [...current.sources] : [];
  const voices = current ? [...current.voices] : [];
  const notes = current ? [...current.notes] : [];
  const issues: MidiIntakeIssue[] = [];
  const usedIds = new Set(sources.map((source) => source.id));
  let latestSourceId: string | undefined;

  inputs.forEach((input, inputIndex) => {
    const sourceId = uniqueSourceId(input, usedIds, sources.length + inputIndex);
    try {
      const scan = preScanMidiSource(input.bytes, {
        sourceId,
        displayName: input.displayName,
      });
      if (!scan.notes.length) {
        issues.push({
          inputIndex,
          code: "empty-midi",
          message: "MIDI contains no note events.",
        });
        return;
      }
      usedIds.add(sourceId);
      sources.push({
        ...scan.source,
        bytes: input.bytes.slice(),
        visible: true,
        muted: false,
      });
      voices.push(...scan.voices);
      notes.push(...scan.notes);
      latestSourceId = sourceId;
    } catch (error) {
      issues.push(issueFromError(error, inputIndex));
    }
  });

  if (!sources.length) return { issues };
  const session = finalizeSession({
    id: sessionId,
    masterSourceId: current?.masterSourceId ?? sources[0].id,
    sources,
    voices,
    notes,
    preset: current?.preset ?? "auto",
    warnings: [],
    ...(latestSourceId ? { latestSourceId } : {}),
  });
  return { session, issues };
}

function finalizeSession(session: AnalysisSession): AnalysisSession {
  const duplicateResult = applyDuplicateGuard(session);
  return {
    ...session,
    voices: duplicateResult.voices,
    warnings: [
      ...timelineWarnings(session),
      ...duplicateResult.warnings,
    ].sort(compareWarning),
  };
}

function applyDuplicateGuard(session: AnalysisSession): {
  voices: AnalysisSessionVoice[];
  warnings: AnalysisSessionWarning[];
} {
  const voices: AnalysisSessionVoice[] = session.voices.map(
    (voice): AnalysisSessionVoice => {
      const {
        duplicateOf: _duplicateOf,
        duplicateKind: _duplicateKind,
        ...clean
      } = voice;
      return {
        ...clean,
        included: voice.duplicateOf
          ? voice.autoRole !== "exclude"
          : voice.included,
      };
    },
  );
  const notesByVoice = new Map<string, PreAnalysisNote[]>();
  for (const note of session.notes) {
    const voiceNotes = notesByVoice.get(note.voiceId) ?? [];
    voiceNotes.push(note);
    notesByVoice.set(note.voiceId, voiceNotes);
  }
  const signatures = new Map(voices.map((voice) => [
    voice.id,
    noteSignature(notesByVoice.get(voice.id) ?? []),
  ]));
  const sourceVoiceCounts = new Map(session.sources.map((source) => [
    source.id,
    voices.filter((voice) => voice.sourceId === source.id).length,
  ]));
  const sourceOrder = new Map(
    session.sources.map((source, index) => [source.id, index]),
  );
  const warnings: AnalysisSessionWarning[] = [];

  for (let leftIndex = 0; leftIndex < voices.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < voices.length; rightIndex += 1) {
      const left = voices[leftIndex];
      const right = voices[rightIndex];
      if (left.sourceId === right.sourceId) continue;
      const similarity = signatureSimilarity(
        signatures.get(left.id) ?? [],
        signatures.get(right.id) ?? [],
      );
      if (similarity === 1) {
        const [kept, duplicate] = preferredVoice(
          left,
          right,
          sourceVoiceCounts,
          sourceOrder,
        );
        const duplicateIndex = voices.findIndex((voice) => voice.id === duplicate.id);
        voices[duplicateIndex] = {
          ...duplicate,
          included: false,
          duplicateOf: kept.id,
          duplicateKind: "exact",
        };
        warnings.push({
          code: "exact-duplicate",
          sourceIds: [kept.sourceId, duplicate.sourceId],
          voiceIds: [kept.id, duplicate.id],
        });
      } else if (similarity >= nearDuplicateThreshold) {
        warnings.push({
          code: "near-duplicate",
          sourceIds: [left.sourceId, right.sourceId],
          voiceIds: [left.id, right.id],
        });
      }
    }
  }
  return { voices, warnings: deduplicateWarnings(warnings) };
}

function timelineWarnings(session: AnalysisSession): AnalysisSessionWarning[] {
  const master = session.sources.find((source) =>
    source.id === session.masterSourceId) ?? session.sources[0];
  const masterFirstBeat = firstNoteBeat(session.notes, master.id);
  return session.sources.flatMap((source): AnalysisSessionWarning[] => {
    if (source.id === master.id) return [];
    const warnings: AnalysisSessionWarning[] = [];
    if (!sameJson(source.tempoMap, master.tempoMap)) {
      warnings.push({
        code: "tempo-map-mismatch",
        sourceIds: [master.id, source.id],
      });
    }
    if (!sameJson(source.timeSignatures, master.timeSignatures)) {
      warnings.push({
        code: "time-signature-mismatch",
        sourceIds: [master.id, source.id],
      });
    }
    const durationDifference = Math.abs(
      source.durationBeats - master.durationBeats,
    );
    if (durationDifference > 4
      && durationDifference / Math.max(1, master.durationBeats) > 0.1) {
      warnings.push({
        code: "duration-mismatch",
        sourceIds: [master.id, source.id],
      });
    }
    const sourceFirstBeat = firstNoteBeat(session.notes, source.id);
    if (Math.abs(sourceFirstBeat - masterFirstBeat) > 0.5) {
      warnings.push({
        code: "start-position-mismatch",
        sourceIds: [master.id, source.id],
      });
    }
    return warnings;
  });
}

function uniqueSourceId(
  input: MidiSourceInput,
  usedIds: ReadonlySet<string>,
  seed: number,
): string {
  const preferred = input.sourceId?.trim()
    || createMidiSourceId(input.bytes, seed);
  if (!usedIds.has(preferred)) return preferred;
  let suffix = 1;
  while (usedIds.has(`${preferred}-${suffix}`)) suffix += 1;
  return `${preferred}-${suffix}`;
}

function issueFromError(error: unknown, inputIndex: number): MidiIntakeIssue {
  const message = error instanceof Error ? error.message : "MIDI could not be read.";
  return {
    inputIndex,
    code: /format 2|SMPTE/i.test(message)
      ? "unsupported-format"
      : "invalid-midi",
    message,
  };
}

function noteSignature(notes: readonly PreAnalysisNote[]): string[] {
  return notes.map((note) => [
    note.pitch,
    stableNumber(note.startBeat),
    stableNumber(note.durationBeats),
  ].join(":")).sort(asciiCompare);
}

function signatureSimilarity(
  left: readonly string[],
  right: readonly string[],
): number {
  if (!left.length || !right.length) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union ? intersection / union : 0;
}

function preferredVoice(
  left: AnalysisSessionVoice,
  right: AnalysisSessionVoice,
  sourceVoiceCounts: ReadonlyMap<string, number>,
  sourceOrder: ReadonlyMap<string, number>,
): [AnalysisSessionVoice, AnalysisSessionVoice] {
  const leftSplit = sourceVoiceCounts.get(left.sourceId) === 1;
  const rightSplit = sourceVoiceCounts.get(right.sourceId) === 1;
  if (leftSplit !== rightSplit) return leftSplit ? [left, right] : [right, left];
  return (sourceOrder.get(left.sourceId) ?? 0)
    <= (sourceOrder.get(right.sourceId) ?? 0)
    ? [left, right]
    : [right, left];
}

function firstNoteBeat(notes: readonly PreAnalysisNote[], sourceId: string): number {
  const sourceNotes = notes.filter((note) => note.sourceId === sourceId);
  return sourceNotes.length
    ? Math.min(...sourceNotes.map((note) => note.startBeat))
    : 0;
}

function stableNumber(value: number): string {
  return value.toFixed(9);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function deduplicateWarnings(
  warnings: readonly AnalysisSessionWarning[],
): AnalysisSessionWarning[] {
  return [...new Map(warnings.map((warning) => [
    [
      warning.code,
      warning.sourceIds.join(","),
      warning.voiceIds?.join(",") ?? "",
    ].join("|"),
    warning,
  ])).values()];
}

function compareWarning(
  left: AnalysisSessionWarning,
  right: AnalysisSessionWarning,
): number {
  return asciiCompare(left.code, right.code)
    || asciiCompare(left.sourceIds.join(":"), right.sourceIds.join(":"))
    || asciiCompare(
      left.voiceIds?.join(":") ?? "",
      right.voiceIds?.join(":") ?? "",
    );
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
