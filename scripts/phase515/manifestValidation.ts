import { Midi } from "@tonejs/midi";
import { basename, dirname, isAbsolute, relative } from "node:path";
import { cwd } from "node:process";
import type { MidiData, MidiEvent } from "midi-file";
import { parseMidi } from "midi-file";
import { z } from "zod";
import {
  readFileExistingWithinRoot,
  safeResolveExistingWithinRoot,
} from "./safePath";

export interface Phase515Event {
  start_beat: number;
  duration_beats: number;
  expected_label: string;
  pitches: number[];
  pitch_names?: string[];
  track?: string;
  duplicate_exact?: boolean;
  velocity?: number;
}

export interface Phase515Case {
  id: string;
  filename: string;
  ppq: number;
  bpm: number;
  time_signature: string;
  tracks?: string[];
  events?: Phase515Event[];
  purpose: string;
  comparison_mode?: "exact_events" | "canonical_at_probe_beats";
  invariants: string[];
  expected_current_failures?: string[];
}

export interface Phase515Manifest {
  name: string;
  version: number;
  generated_at?: string;
  source_context?: string;
  purpose?: string;
  usage?: {
    recommended_local_path: string;
    do_not_commit_personal_midi: boolean;
    comparison_note: string;
  };
  cases: Phase515Case[];
  comparison_groups?: Record<string, string[]>;
}

export interface ManifestValidationIssue {
  level: "error" | "warning";
  code: string;
  caseId?: string;
  message: string;
}

export interface ManifestValidationResult {
  manifestPath: string;
  caseCount: number;
  midiCount: number;
  valid: boolean;
  issues: ManifestValidationIssue[];
}

const MIDI_MIN = 0;
const MIDI_MAX = 127;
const TICK_EPSILON = 1e-6;
const INVARIANT_ONLY_CASES = new Set(["32_type0_multichannel"]);

const eventSchema = z.object({
  start_beat: z.number().finite(),
  duration_beats: z.number().finite(),
  expected_label: z.string().trim().min(1),
  pitches: z.array(z.number()),
  pitch_names: z.array(z.string()).optional(),
  track: z.string().trim().min(1).optional(),
  duplicate_exact: z.boolean().optional(),
  velocity: z.number().int().min(0).max(127).optional(),
}).strict();
const caseSchema = z.object({
  id: z.string().trim().min(1),
  filename: z.string().regex(/^[^/\\]+\.mid$/i)
    .refine((value) => !isAbsolute(value) && value !== "." && value !== ".."),
  ppq: z.number().int().positive(),
  bpm: z.number().finite().positive(),
  time_signature: z.string().regex(/^\d+\/\d+$/).refine((value) => {
    const [numerator, denominator] = value.split("/").map(Number);
    return Boolean(
      numerator
      && denominator
      && Number.isInteger(numerator)
      && Number.isInteger(denominator)
      && (denominator & (denominator - 1)) === 0,
    );
  }, "Denominator must be a positive power of two."),
  tracks: z.array(z.string().trim().min(1)).optional(),
  events: z.array(eventSchema).optional(),
  purpose: z.string().trim().min(1),
  comparison_mode: z.enum(["exact_events", "canonical_at_probe_beats"]).optional(),
  invariants: z.array(z.string().trim().min(1)).min(1),
  expected_current_failures: z.array(z.string()).optional(),
}).strict();
const manifestSchema = z.object({
  name: z.string().trim().min(1),
  version: z.literal(1),
  generated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source_context: z.string().trim().min(1).optional(),
  purpose: z.string().trim().min(1).optional(),
  usage: z.object({
    recommended_local_path: z.string().trim().min(1),
    do_not_commit_personal_midi: z.boolean(),
    comparison_note: z.string().trim().min(1),
  }).strict().optional(),
  cases: z.array(caseSchema).min(1),
  comparison_groups: z.record(z.string(), z.array(z.string()).min(2)).optional(),
}).strict();

export function parsePhase515Manifest(raw: unknown): Phase515Manifest {
  return manifestSchema.parse(raw) as Phase515Manifest;
}

export function validateManifestStructure(
  manifest: Phase515Manifest,
): ManifestValidationIssue[] {
  const issues: ManifestValidationIssue[] = [];
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) {
    for (const problem of parsed.error.issues) {
      issues.push(error(
        "runtime-schema",
        `${problem.path.join(".") || "<root>"}: ${problem.message}`,
      ));
    }
    return issues;
  }
  const ids = new Set<string>();

  if (manifest.version !== 1) {
    issues.push(error("unsupported-version", `Expected manifest version 1, got ${manifest.version}.`));
  }
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    issues.push(error("empty-cases", "Manifest must contain at least one case."));
    return issues;
  }

  for (const item of manifest.cases) {
    if (ids.has(item.id)) {
      issues.push(error("duplicate-case-id", `Duplicate case id: ${item.id}.`, item.id));
    }
    ids.add(item.id);
    if (!item.filename || !/\.mid$/i.test(item.filename)) {
      issues.push(error("invalid-midi-filename", "Case must reference a .mid file.", item.id));
    }
    if (!Number.isInteger(item.ppq) || item.ppq <= 0) {
      issues.push(error("invalid-ppq", `PPQ must be a positive integer, got ${item.ppq}.`, item.id));
    }
    if (!Number.isFinite(item.bpm) || item.bpm <= 0) {
      issues.push(error("invalid-bpm", `BPM must be positive, got ${item.bpm}.`, item.id));
    }
    if (!/^\d+\/\d+$/.test(item.time_signature)) {
      issues.push(error(
        "invalid-time-signature",
        `Invalid time signature: ${item.time_signature}.`,
        item.id,
      ));
    }
    if (!Array.isArray(item.invariants) || item.invariants.length === 0) {
      issues.push(error("missing-invariants", "Case must declare at least one invariant.", item.id));
    }

    const events = item.events ?? [];
    if (events.length === 0 && !INVARIANT_ONLY_CASES.has(item.id)) {
      issues.push(error("missing-expected-events", "Case has no expected events.", item.id));
    }
    if (events.length === 0 && INVARIANT_ONLY_CASES.has(item.id)) {
      issues.push(warning(
        "invariant-only-case",
        "Expected events are supplied by the frozen evaluation contract.",
        item.id,
      ));
    }

    const previousStartByTrack = new Map<string, number>();
    for (const event of events) {
      if (!Number.isFinite(event.start_beat) || event.start_beat < 0) {
        issues.push(error("invalid-start-beat", `Invalid start beat ${event.start_beat}.`, item.id));
      }
      if (!Number.isFinite(event.duration_beats) || event.duration_beats <= 0) {
        issues.push(error(
          "invalid-duration",
          `Duration must be positive, got ${event.duration_beats}.`,
          item.id,
        ));
      }
      const trackKey = event.track ?? "unassigned";
      const previousStart = previousStartByTrack.get(trackKey) ?? -Infinity;
      if (event.start_beat < previousStart) {
        issues.push(error(
          "unsorted-events",
          `Expected events for track ${trackKey} must be sorted.`,
          item.id,
        ));
      }
      previousStartByTrack.set(trackKey, event.start_beat);
      if (!isTickRepresentable(event.start_beat, item.ppq)) {
        issues.push(error(
          "unrepresentable-start",
          `Start beat ${event.start_beat} is not representable at PPQ ${item.ppq}.`,
          item.id,
        ));
      }
      if (!isTickRepresentable(event.duration_beats, item.ppq)) {
        issues.push(error(
          "unrepresentable-duration",
          `Duration ${event.duration_beats} is not representable at PPQ ${item.ppq}.`,
          item.id,
        ));
      }
      if (!Array.isArray(event.pitches)) {
        issues.push(error("missing-pitches", "Expected event must declare pitches.", item.id));
        continue;
      }
      for (const pitch of event.pitches) {
        if (!Number.isInteger(pitch) || pitch < MIDI_MIN || pitch > MIDI_MAX) {
          issues.push(error("pitch-out-of-range", `Pitch ${pitch} is outside 0..127.`, item.id));
        }
      }
      if (isNoChord(event.expected_label) && event.pitches.length > 0) {
        issues.push(error("no-chord-has-pitches", "N.C. event must not declare pitches.", item.id));
      }
    }

    const harmonicGroups = new Map<string, Phase515Event[]>();
    for (const event of events) {
      const key = `${event.start_beat}|${event.expected_label}`;
      harmonicGroups.set(key, [...(harmonicGroups.get(key) ?? []), event]);
    }
    for (const group of harmonicGroups.values()) {
      const slashBass = slashBassPitchClass(group[0]!.expected_label);
      const pitches = group.flatMap((event) => event.pitches);
      if (slashBass !== undefined && pitches.length > 0) {
        const lowest = Math.min(...pitches) % 12;
        if (lowest !== slashBass) {
          issues.push(error(
            "slash-bass-mismatch",
            `Slash bass pitch class ${slashBass} does not match grouped lowest pitch class ${lowest}.`,
            item.id,
          ));
        }
      }
    }
  }

  for (const [group, members] of Object.entries(manifest.comparison_groups ?? {})) {
    if (!Array.isArray(members) || members.length < 2) {
      issues.push(error("invalid-comparison-group", `${group} needs at least two cases.`));
      continue;
    }
    for (const member of members) {
      if (!ids.has(member)) {
        issues.push(error(
          "missing-comparison-member",
          `${group} references missing case ${member}.`,
        ));
      }
    }
  }
  return issues;
}

export async function validateManifestFile(
  manifestPath: string,
  midiDirectory: string,
): Promise<{ manifest: Phase515Manifest; result: ManifestValidationResult }> {
  const raw: unknown = JSON.parse(
    (await readFileExistingWithinRoot(
      dirname(manifestPath),
      basename(manifestPath),
    )).toString("utf8"),
  );
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((problem) => error(
      "runtime-schema",
      `${problem.path.join(".") || "<root>"}: ${problem.message}`,
    ));
    return {
      manifest: raw as Phase515Manifest,
      result: {
        manifestPath: repositoryRelative(manifestPath),
        caseCount: Array.isArray((raw as { cases?: unknown }).cases)
          ? (raw as { cases: unknown[] }).cases.length
          : 0,
        midiCount: 0,
        valid: false,
        issues,
      },
    };
  }
  const manifest = parsed.data as Phase515Manifest;
  const issues = validateManifestStructure(manifest);
  let midiCount = 0;

  for (const item of manifest.cases) {
    try {
      await safeResolveExistingWithinRoot(midiDirectory, item.filename);
    } catch {
      issues.push(error("unsafe-midi-path", "MIDI path escapes its corpus directory.", item.id));
      continue;
    }
    midiCount += 1;
    try {
      const bytes = new Uint8Array(
        await readFileExistingWithinRoot(midiDirectory, item.filename),
      );
      validateMidiAgainstCase(item, new Midi(bytes), issues);
      validateMidiBytesAgainstCase(item, bytes, issues);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
        issues.push(error("missing-midi", `Missing MIDI: ${item.filename}.`, item.id));
        midiCount -= 1;
        continue;
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      issues.push(error("unreadable-midi", `Cannot parse ${item.filename}: ${message}`, item.id));
    }
  }

  return {
    manifest,
    result: {
      manifestPath: repositoryRelative(manifestPath),
      caseCount: manifest.cases.length,
      midiCount,
      valid: !issues.some((issue) => issue.level === "error"),
      issues,
    },
  };
}

interface ExactNote {
  trackIndex: number;
  track: string;
  channel: number;
  pitch: number;
  startTick: number;
  endTick: number;
  velocity: number;
}

/**
 * Recipe validation is an exact multiset comparison. Overlap/presence checks
 * are insufficient because they let duplicate, shortened, velocity-mutated,
 * or unexpected notes silently enter the supposedly deterministic source.
 */
export function validateMidiBytesAgainstCase(
  item: Phase515Case,
  bytes: Uint8Array,
  issues: ManifestValidationIssue[] = [],
): ManifestValidationIssue[] {
  let data: MidiData;
  try {
    data = parseMidi(bytes);
  } catch (cause) {
    issues.push(error(
      "unreadable-midi",
      cause instanceof Error ? cause.message : String(cause),
      item.id,
    ));
    return issues;
  }
  if ((item.events ?? []).length === 0 && INVARIANT_ONLY_CASES.has(item.id)) {
    return issues;
  }

  const trackNames = data.tracks.map((track, index) =>
    track.find((event) => event.type === "trackName")?.text ?? `track-${index}`);
  const trackIndexByName = new Map(trackNames.map((name, index) => [name, index]));
  const expected: ExactNote[] = [];
  for (const event of item.events ?? []) {
    if (isNoChord(event.expected_label)) continue;
    const track = event.track ?? "unassigned";
    const trackIndex = trackIndexByName.get(track);
    if (trackIndex === undefined) {
      issues.push(error("missing-track", `Missing declared track ${track}.`, item.id));
      continue;
    }
    const copies = event.duplicate_exact ? 2 : 1;
    for (const [pitchIndex, pitch] of event.pitches.entries()) {
      for (let copy = 0; copy < copies; copy += 1) {
        const arpeggioOffset = item.id === "16_arpeggiated_shells"
          ? pitchIndex * item.ppq / 4
          : 0;
        expected.push({
          trackIndex,
          track,
          channel: channelForTrack(track),
          pitch,
          startTick: Math.round(event.start_beat * item.ppq + arpeggioOffset),
          endTick: Math.round(
            (event.start_beat + event.duration_beats) * item.ppq,
          ),
          velocity: event.velocity ?? 96,
        });
      }
    }
  }
  expected.push(...approvedRecipeDecorations(item, trackIndexByName));
  const actual = extractExactNotes(data, trackNames, item.id, issues);
  const expectedCounts = multiset(expected.map(exactNoteKey));
  const actualCounts = multiset(actual.map(exactNoteKey));
  const missing = multisetDifference(expectedCounts, actualCounts);
  const unexpected = multisetDifference(actualCounts, expectedCounts);
  if (missing.length > 0) {
    issues.push(error(
      "exact-note-missing",
      `Missing recipe notes: ${missing.join("; ")}.`,
      item.id,
    ));
  }
  if (unexpected.length > 0) {
    issues.push(error(
      "unexpected-note",
      `Unexpected MIDI notes: ${unexpected.join("; ")}.`,
      item.id,
    ));
  }
  validateSemanticExtras(item, data, issues);
  return issues;
}

function extractExactNotes(
  data: MidiData,
  trackNames: readonly string[],
  caseId: string,
  issues: ManifestValidationIssue[],
): ExactNote[] {
  const result: ExactNote[] = [];
  data.tracks.forEach((track, trackIndex) => {
    let tick = 0;
    const active = new Map<string, Array<{
      startTick: number;
      velocity: number;
      channel: number;
      pitch: number;
    }>>();
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === "noteOn" && event.velocity > 0) {
        const key = `${event.channel}|${event.noteNumber}`;
        const queue = active.get(key) ?? [];
        queue.push({
          startTick: tick,
          velocity: event.velocity,
          channel: event.channel,
          pitch: event.noteNumber,
        });
        active.set(key, queue);
      } else if (
        event.type === "noteOff"
        || (event.type === "noteOn" && event.velocity === 0)
      ) {
        const key = `${event.channel}|${event.noteNumber}`;
        const queue = active.get(key);
        const started = queue?.shift();
        if (!started) {
          issues.push(error(
            "unmatched-note-off",
            `Unmatched note-off at track ${trackIndex}, tick ${tick}.`,
            caseId,
          ));
          continue;
        }
        result.push({
          trackIndex,
          track: trackNames[trackIndex]!,
          channel: started.channel,
          pitch: started.pitch,
          startTick: started.startTick,
          endTick: tick,
          velocity: started.velocity,
        });
      }
    }
    if ([...active.values()].some((queue) => queue.length > 0)) {
      issues.push(error("unterminated-note", `Track ${trackIndex} has unterminated notes.`, caseId));
    }
  });
  return result;
}

function validateSemanticExtras(
  item: Phase515Case,
  data: MidiData,
  issues: ManifestValidationIssue[],
) {
  const allowed = new Set([
    "trackName", "setTempo", "timeSignature", "text", "marker", "endOfTrack",
    "programChange", "noteOn", "noteOff",
    ...(item.id === "21_sustain_pedal_overlap" ? ["controller"] : []),
  ]);
  const unexpectedTypes = [...new Set(
    data.tracks.flat().map((event) => event.type).filter((type) => !allowed.has(type)),
  )];
  if (unexpectedTypes.length > 0) {
    issues.push(error(
      "unexpected-semantic-event",
      `Unexpected MIDI event types: ${unexpectedTypes.join(", ")}.`,
      item.id,
    ));
  }
  const markers = timedEvents(data, "marker").map(({ tick, event }) =>
    `${tick}|${event.text.trim()}`);
  const expectedMarkers = (item.events ?? []).map((event) => ({
    tick: Math.round(event.start_beat * item.ppq),
    label: event.expected_label,
  })).sort((left, right) => left.tick - right.tick)
    .map((marker) => `${marker.tick}|${marker.label}`);
  if (JSON.stringify(markers) !== JSON.stringify(expectedMarkers)) {
    issues.push(error("marker-recipe-mismatch", "Marker events differ from the recipe.", item.id));
  }
  const controllers = timedEvents(data, "controller").map(({ trackIndex, tick, event }) =>
    `${trackIndex}|${tick}|${event.channel}|${event.controllerType}|${event.value}`);
  const expectedControllers = item.id === "21_sustain_pedal_overlap"
    ? ["1|0|0|64|127", "1|1680|0|64|0"]
    : [];
  if (JSON.stringify(controllers) !== JSON.stringify(expectedControllers)) {
    issues.push(error(
      "controller-recipe-mismatch",
      "Controller events differ from the frozen recipe.",
      item.id,
    ));
  }
}

function channelForTrack(track: string): number {
  if (track === "Bass") return 1;
  if (track === "Melody") return 2;
  return 0;
}

/**
 * The v1 recipes describe harmonic regions. These explicitly frozen
 * decorations are the only notes whose purpose is non-harmonic/legato rather
 * than membership in a recipe row.
 */
function approvedRecipeDecorations(
  item: Phase515Case,
  trackIndexByName: ReadonlyMap<string, number>,
): ExactNote[] {
  const note = (
    track: string,
    pitch: number,
    startBeat: number,
    endBeat: number,
    velocity: number,
  ): ExactNote => ({
    trackIndex: trackIndexByName.get(track) ?? -1,
    track,
    channel: channelForTrack(track),
    pitch,
    startTick: Math.round(startBeat * item.ppq),
    endTick: Math.round(endBeat * item.ppq),
    velocity,
  });
  switch (item.id) {
    case "05_fleeting_tensions_do_not_promote":
      return [
        note("Passing Tones", 64, 1.875, 1.9375, 70),
        note("Passing Tones", 66, 3.875, 3.9375, 70),
      ];
    case "17_common_tone_legato_boundary":
      return [
        note("Harmony", 64, 0, 8, 84),
        note("Harmony", 67, 0, 8, 84),
      ];
    case "18_melody_contamination_separate_track":
      return [
        note("Melody", 74, 0.5, 0.8, 72),
        note("Melody", 76, 1, 1.3, 72),
        note("Melody", 77, 1.5, 1.8, 72),
        note("Melody", 79, 2.5, 2.8, 72),
        note("Melody", 77, 3, 3.3, 72),
        note("Melody", 76, 3.5, 3.8, 72),
      ];
    case "19_chromatic_bass_approach_notes":
      return [
        note("Bass", 42, 1.5, 1.7, 90),
        note("Bass", 43, 1.75, 1.95, 90),
        note("Bass", 47, 3.5, 3.7, 90),
        note("Bass", 48, 3.75, 3.95, 90),
      ];
    default:
      return [];
  }
}

function timedEvents<T extends MidiEvent["type"]>(
  data: MidiData,
  type: T,
): Array<{
  trackIndex: number;
  tick: number;
  event: Extract<MidiEvent, { type: T }>;
}> {
  const found: Array<{
    trackIndex: number;
    tick: number;
    event: Extract<MidiEvent, { type: T }>;
  }> = [];
  data.tracks.forEach((track, trackIndex) => {
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === type) {
        found.push({
          trackIndex,
          tick,
          event: event as Extract<MidiEvent, { type: T }>,
        });
      }
    }
  });
  return found;
}

function exactNoteKey(note: ExactNote): string {
  return [
    note.trackIndex, note.track, note.channel, note.pitch, note.startTick,
    note.endTick, note.velocity,
  ].join("|");
}

function multiset(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function multisetDifference(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>,
): string[] {
  return [...left.entries()].flatMap(([key, count]) => {
    const difference = count - (right.get(key) ?? 0);
    return difference > 0 ? [`${difference}x ${key}`] : [];
  }).sort();
}

function repositoryRelative(path: string): string {
  if (!isAbsolute(path)) return path.replaceAll("\\", "/");
  const value = relative(cwd(), path).replaceAll("\\", "/");
  return value.startsWith("../") || isAbsolute(value)
    ? "<outside-repository>"
    : value;
}

function validateMidiAgainstCase(
  item: Phase515Case,
  midi: Midi,
  issues: ManifestValidationIssue[],
) {
  if (midi.header.ppq !== item.ppq) {
    issues.push(error(
      "midi-ppq-mismatch",
      `Manifest PPQ ${item.ppq}, MIDI PPQ ${midi.header.ppq}.`,
      item.id,
    ));
  }
  const actualTempo = midi.header.tempos[0]?.bpm;
  if (actualTempo === undefined || Math.abs(actualTempo - item.bpm) > 0.01) {
    issues.push(error(
      "midi-tempo-mismatch",
      `Manifest BPM ${item.bpm}, MIDI BPM ${actualTempo ?? "missing"}.`,
      item.id,
    ));
  }
  const actualSignature = midi.header.timeSignatures[0]?.timeSignature.join("/");
  if (actualSignature !== item.time_signature) {
    issues.push(error(
      "midi-time-signature-mismatch",
      `Manifest ${item.time_signature}, MIDI ${actualSignature ?? "missing"}.`,
      item.id,
    ));
  }

  const notes = midi.tracks.flatMap((track) =>
    track.notes.map((note) => ({
      track: track.name,
      pitch: note.midi,
      startTick: note.ticks,
      endTick: note.ticks + note.durationTicks,
    })));
  for (const expectedTrack of item.tracks ?? []) {
    if (!midi.tracks.some((track) => track.name === expectedTrack)) {
      issues.push(error("missing-track", `Missing declared track ${expectedTrack}.`, item.id));
    }
  }

  for (const event of item.events ?? []) {
    const startTick = Math.round(event.start_beat * item.ppq);
    const endTick = startTick + Math.round(event.duration_beats * item.ppq);
    const inEvent = notes.filter((note) =>
      note.endTick > startTick
      && note.startTick < endTick
      && (!event.track || note.track === event.track));
    if (isNoChord(event.expected_label)) {
      if (notes.some((note) => note.endTick > startTick && note.startTick < endTick)) {
        issues.push(error(
          "no-chord-overlaps-notes",
          `N.C. event at beat ${event.start_beat} overlaps notes.`,
          item.id,
        ));
      }
      continue;
    }
    const presentPitches = new Set(inEvent.map((note) => note.pitch));
    const missing = [...new Set(event.pitches)].filter((pitch) => !presentPitches.has(pitch));
    if (missing.length > 0) {
      issues.push(error(
        "expected-pitch-missing",
        `Event at beat ${event.start_beat} is missing pitches ${missing.join(", ")}.`,
        item.id,
      ));
    }
    if (event.duplicate_exact) {
      const exactOnsets = inEvent.filter((note) => note.startTick === startTick);
      const missingDuplicates = [...new Set(event.pitches)].filter((pitch) =>
        exactOnsets.filter((note) => note.pitch === pitch).length < 2);
      if (missingDuplicates.length > 0) {
        issues.push(error(
          "declared-duplicate-missing",
          `Duplicate event lacks exact copies for ${missingDuplicates.join(", ")}.`,
          item.id,
        ));
      }
    }
  }
}

function error(code: string, message: string, caseId?: string): ManifestValidationIssue {
  return { level: "error", code, ...(caseId ? { caseId } : {}), message };
}

function warning(code: string, message: string, caseId?: string): ManifestValidationIssue {
  return { level: "warning", code, ...(caseId ? { caseId } : {}), message };
}

function isTickRepresentable(beats: number, ppq: number): boolean {
  return Math.abs(beats * ppq - Math.round(beats * ppq)) <= TICK_EPSILON;
}

function isNoChord(label: string): boolean {
  return /^(n\.?c\.?|no chord|-)$/i.test(label.trim());
}

function slashBassPitchClass(label: string): number | undefined {
  const match = label.trim().match(/\/([A-G])([#b]?)$/);
  if (!match) return undefined;
  const natural: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const base = natural[match[1]!];
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (base + accidental + 12) % 12;
}
