import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { MidiData, MidiEvent } from "midi-file";
import { parseMidi, writeMidi } from "midi-file";
import {
  parsePhase515Manifest,
  type Phase515Case,
} from "./manifestValidation";
import {
  safeResolveExistingWithinRoot,
} from "./safePath";

export const phase515ContractVersion = "phase5.15-corpus-v2";
export const phase515GeneratorVersion = "p515-00-semantic-midi-generator-v1";

export const phase515Partitions = {
  development: [
    "01_shell_fifths_aligned",
    "02_shell_fifths_pickup_irregular",
    "04_adjacent_chord_false_tension_trap",
    "05_fleeting_tensions_do_not_promote",
    "06_true_sustained_tensions",
    "13_major7_shells",
    "14_minor7_shells",
    "16_arpeggiated_shells",
    "18_melody_contamination_separate_track",
    "19_chromatic_bass_approach_notes",
    "33_sus2_vs_add9",
    "34_sus4_vs_7sus4",
  ],
  validation: [
    "07_legitimate_slash_pedal",
    "08_same_chord_rearticulation",
    "09_halfbeat_boundary_changes",
    "12_split_tracks_harmony_bass",
    "15_rootless_dominant_with_context",
    "17_common_tone_legato_boundary",
    "20_true_pedal_bass_slash_progression",
    "21_sustain_pedal_overlap",
    "22_triplet_boundaries",
    "23_meter_3_4",
    "24_meter_6_8",
    "32_type0_multichannel",
    "35_nc_silence_region",
  ],
  roundTripBaseline: [
    "10_phase514_roundtrip_basic",
    "11_phase514_roundtrip_complex",
  ],
  runtimeOnly: ["36_long_three_minute_stability"],
} as const;

export const phase515InvariantGroups = {
  duplicate: [
    "02_shell_fifths_pickup_irregular",
    "03_shell_fifths_pickup_irregular_exact_duplicates",
  ],
  ppq: ["26_ppq96_equivalence", "27_ppq960_equivalence"],
  velocity: ["28_velocity_low", "29_velocity_high"],
  trackOrder: [
    "30_track_order_harmony_first",
    "31_track_order_bass_first",
  ],
  tempoMap: ["25_tempo_change_mid_file"],
} as const;

export interface Phase515ExpectedSegment {
  startBeat: number;
  endBeat: number;
  durationBeats: number;
  label: string;
}

export interface Phase515ContractCase {
  id: string;
  filename: string;
  purpose: string;
  invariants: string[];
  comparisonMode:
    | "exact-event"
    | "canonical-identity"
    | "probe-beat"
    | "invariant-deep-equal"
    | "boundary-only"
    | "representability-aware";
  sourceManifest: "base-v1" | "supplemental-v1";
  sourceRecipe: Phase515Case;
  sourceRowCount: number;
  expectedSegments: Phase515ExpectedSegment[];
  midi: {
    sha256: string;
    byteLength: number;
    smfFormat: 0 | 1 | 2;
    ppq: number;
    bpm: number;
    timeSignature: string;
    trackCount: number;
    noteCount: number;
    clipLengthBeats: number;
    markers: Array<{ beat: number; label: string }>;
  };
  sourceMidi: MidiData;
}

export interface Phase515CorpusContract {
  schemaVersion: 2;
  corpusVersion: typeof phase515ContractVersion;
  generatorVersion: typeof phase515GeneratorVersion;
  generatedBy: "deterministic-code";
  privacy: {
    syntheticOnly: true;
    personalMidiIncluded: false;
    absolutePathsIncluded: false;
  };
  partitions: typeof phase515Partitions;
  invariantGroups: typeof phase515InvariantGroups;
  cases: Phase515ContractCase[];
}

export async function buildCorpusContract(
  repositoryRoot: string,
): Promise<Phase515CorpusContract> {
  const baseRoot = resolve(repositoryRoot, "test/phase5.15");
  const supplementalRoot = resolve(repositoryRoot, "test/phase5.15-supplemental");
  const base = parsePhase515Manifest(JSON.parse(
    await readFile(resolve(baseRoot, "manifest.json"), "utf8"),
  ));
  const supplemental = parsePhase515Manifest(JSON.parse(
    await readFile(resolve(supplementalRoot, "manifest-supplemental.json"), "utf8"),
  ));
  const definitions = [
    ...base.cases.map((item) => ({
      item,
      sourceManifest: "base-v1" as const,
      midiRoot: resolve(baseRoot, "midi"),
    })),
    ...supplemental.cases.map((item) => ({
      item,
      sourceManifest: "supplemental-v1" as const,
      midiRoot: resolve(supplementalRoot, "midi"),
    })),
  ];
  const cases: Phase515ContractCase[] = [];

  for (const definition of definitions) {
    const bytes = new Uint8Array(
      await readFile(await safeResolveExistingWithinRoot(
        definition.midiRoot,
        definition.item.filename,
      )),
    );
    const sourceMidi = parseMidi(bytes);
    const expectedSegments = logicalExpectedSegments(definition.item, sourceMidi);
    cases.push({
      id: definition.item.id,
      filename: definition.item.filename,
      purpose: definition.item.purpose,
      invariants: definition.item.invariants,
      comparisonMode: comparisonModeFor(definition.item),
      sourceManifest: definition.sourceManifest,
      sourceRecipe: definition.item,
      sourceRowCount: definition.item.events?.length ?? 0,
      expectedSegments,
      midi: {
        sha256: sha256(bytes),
        byteLength: bytes.byteLength,
        smfFormat: sourceMidi.header.format,
        ppq: ticksPerBeat(sourceMidi),
        bpm: firstBpm(sourceMidi),
        timeSignature: firstTimeSignature(sourceMidi),
        trackCount: sourceMidi.tracks.length,
        noteCount: sourceMidi.tracks.flat().filter((event) =>
          event.type === "noteOn" && event.velocity > 0).length,
        clipLengthBeats: maximumTick(sourceMidi) / ticksPerBeat(sourceMidi),
        markers: midiMarkers(sourceMidi),
      },
      sourceMidi,
    });
  }

  return {
    schemaVersion: 2,
    corpusVersion: phase515ContractVersion,
    generatorVersion: phase515GeneratorVersion,
    generatedBy: "deterministic-code",
    privacy: {
      syntheticOnly: true,
      personalMidiIncluded: false,
      absolutePathsIncluded: false,
    },
    partitions: phase515Partitions,
    invariantGroups: phase515InvariantGroups,
    cases: cases.sort((left, right) => compareCodePoints(left.id, right.id)),
  };
}

export function renderContractMidi(item: Phase515ContractCase): Uint8Array {
  return new Uint8Array(writeMidi(item.sourceMidi));
}

export function semanticMidiKey(data: MidiData): string {
  return JSON.stringify({
    header: data.header,
    tracks: data.tracks.map((track) => track.map((event) =>
      Object.fromEntries(Object.entries(event)
        .filter(([key]) => key !== "running")))),
  });
}

export function markerSegments(data: MidiData): Phase515ExpectedSegment[] {
  const ppq = ticksPerBeat(data);
  const markers: Array<{ tick: number; label: string }> = [];
  let finalTick = 0;
  for (const track of data.tracks) {
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      finalTick = Math.max(finalTick, tick);
      if (event.type === "marker") {
        markers.push({ tick, label: event.text.trim() });
      }
    }
  }
  const unique = [...new Map(
    markers.map((marker) => [`${marker.tick}|${marker.label}`, marker]),
  ).values()].sort((left, right) =>
    left.tick - right.tick || compareCodePoints(left.label, right.label));
  return unique.map((marker, index) => {
    const endTick = unique[index + 1]?.tick ?? finalTick;
    const startBeat = marker.tick / ppq;
    const endBeat = endTick / ppq;
    return {
      startBeat,
      endBeat,
      durationBeats: endBeat - startBeat,
      label: marker.label,
    };
  });
}

/**
 * The logical oracle comes from the recipe's expected rows, not the MIDI
 * markers. Markers are deliberately only a redundant assertion channel and are
 * validated against this oracle. This keeps a marker mutation from silently
 * rewriting the expected answer.
 */
export function logicalExpectedSegments(
  item: Phase515Case,
  sourceMidi: MidiData,
): Phase515ExpectedSegment[] {
  if (item.id === "32_type0_multichannel") {
    return [
      { startBeat: 0, endBeat: 4, durationBeats: 4, label: "Cmaj7" },
      { startBeat: 4, endBeat: 8, durationBeats: 4, label: "Am7" },
    ];
  }
  const rows = item.events ?? [];
  const byIdentity = new Map<string, Phase515ExpectedSegment>();
  for (const row of rows) {
    const key = `${row.start_beat}|${row.expected_label}`;
    const current = byIdentity.get(key);
    const endBeat = row.start_beat + row.duration_beats;
    if (!current) {
      byIdentity.set(key, {
        startBeat: row.start_beat,
        endBeat,
        durationBeats: row.duration_beats,
        label: row.expected_label,
      });
    } else if (endBeat > current.endBeat) {
      current.endBeat = endBeat;
      current.durationBeats = endBeat - current.startBeat;
    }
  }
  const segments = [...byIdentity.values()].sort((left, right) =>
    left.startBeat - right.startBeat || compareCodePoints(left.label, right.label));
  if (segments.length === 0) {
    throw new Error(`Case ${item.id} has no independent logical oracle.`);
  }
  // N.C. rows may intentionally describe silence beyond the final note. The
  // recipe remains authoritative; source MIDI length is checked separately.
  void sourceMidi;
  return segments;
}

export function midiMarkers(data: MidiData): Array<{ beat: number; label: string }> {
  const ppq = ticksPerBeat(data);
  const markers: Array<{ beat: number; label: string }> = [];
  for (const track of data.tracks) {
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === "marker") {
        markers.push({ beat: tick / ppq, label: event.text.trim() });
      }
    }
  }
  return [...new Map(
    markers.map((marker) => [`${marker.beat}|${marker.label}`, marker]),
  ).values()].sort((left, right) =>
    left.beat - right.beat || compareCodePoints(left.label, right.label));
}

export function maximumTick(data: MidiData): number {
  let maximum = 0;
  for (const track of data.tracks) {
    let tick = 0;
    for (const event of track) tick += event.deltaTime;
    maximum = Math.max(maximum, tick);
  }
  return maximum;
}

/** Locale-independent ordering used for hashes and generated JSON. */
export function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function ticksPerBeat(data: MidiData): number {
  const ppq = data.header.ticksPerBeat;
  if (!ppq) throw new Error("SMPTE MIDI is not supported by the Phase 5.15 corpus.");
  return ppq;
}

function comparisonModeFor(
  item: Phase515Case,
): Phase515ContractCase["comparisonMode"] {
  if (item.id === "08_same_chord_rearticulation") return "probe-beat";
  if (item.id === "35_nc_silence_region") return "boundary-only";
  if (item.id === "25_tempo_change_mid_file") return "canonical-identity";
  if (
    [
      "03_shell_fifths_pickup_irregular_exact_duplicates",
      "26_ppq96_equivalence",
      "27_ppq960_equivalence",
      "28_velocity_low",
      "29_velocity_high",
      "30_track_order_harmony_first",
      "31_track_order_bass_first",
    ].includes(item.id)
  ) return "invariant-deep-equal";
  if (item.id.startsWith("10_") || item.id.startsWith("11_")) {
    return "representability-aware";
  }
  return item.comparison_mode === "canonical_at_probe_beats"
    ? "probe-beat"
    : "exact-event";
}

function firstBpm(data: MidiData): number {
  for (const event of allEvents(data)) {
    if (event.type === "setTempo") {
      return Number((60_000_000 / event.microsecondsPerBeat).toFixed(6));
    }
  }
  throw new Error("MIDI is missing a tempo event.");
}

function firstTimeSignature(data: MidiData): string {
  for (const event of allEvents(data)) {
    if (event.type === "timeSignature") {
      return `${event.numerator}/${event.denominator}`;
    }
  }
  throw new Error("MIDI is missing a time-signature event.");
}

function allEvents(data: MidiData): MidiEvent[] {
  return data.tracks.flat();
}
