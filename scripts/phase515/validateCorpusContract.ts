import { isAbsolute, resolve } from "node:path";
import {
  mkdtemp,
  readFile,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { cwd } from "node:process";
import { parseMidi } from "midi-file";
import { z } from "zod";
import type {
  Phase515ContractCase,
  Phase515CorpusContract,
} from "./corpusContract";
import {
  compareCodePoints,
  buildCorpusContract,
  markerSegments,
  maximumTick,
  midiMarkers,
  phase515ContractVersion,
  phase515GeneratorVersion,
  phase515InvariantGroups,
  phase515Partitions,
  renderContractMidi,
  semanticMidiKey,
  sha256,
  ticksPerBeat,
} from "./corpusContract";
import { safeResolveExistingWithinRoot } from "./safePath";
import { findPrivacyIssues } from "./privacy";

export interface CorpusContractIssue {
  code: string;
  message: string;
  caseId?: string;
}

export interface CorpusContractValidation {
  valid: boolean;
  caseCount: number;
  midiCount: number;
  deterministicGeneratedCount: number;
  byteExactGeneratedCount: number;
  issues: CorpusContractIssue[];
}

const finite = z.number().finite();
const positive = finite.positive();
const nonnegative = finite.nonnegative();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const safeFilename = z.string().min(1).regex(/^[^/\\]+\.mid$/i)
  .refine((value) => !isAbsolute(value) && value !== "." && value !== "..");
const comparisonModeSchema = z.enum([
  "exact-event",
  "canonical-identity",
  "probe-beat",
  "invariant-deep-equal",
  "boundary-only",
  "representability-aware",
]);
const expectedSegmentSchema = z.object({
  startBeat: nonnegative,
  endBeat: positive,
  durationBeats: positive,
  label: z.string().trim().min(1),
}).strict();
const markerSchema = z.object({
  beat: nonnegative,
  label: z.string().trim().min(1),
}).strict();
const midiSchema = z.object({
  sha256: sha256Schema,
  byteLength: z.number().int().positive(),
  smfFormat: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  ppq: z.number().int().positive(),
  bpm: positive,
  timeSignature: z.string().regex(/^\d+\/\d+$/).refine((value) => {
    const [numerator, denominator] = value.split("/").map(Number);
    return Boolean(
      numerator
      && denominator
      && Number.isInteger(numerator)
      && Number.isInteger(denominator)
      && (denominator & (denominator - 1)) === 0,
    );
  }, "Time-signature denominator must be a positive power of two."),
  trackCount: z.number().int().positive(),
  noteCount: z.number().int().nonnegative(),
  clipLengthBeats: positive,
  markers: z.array(markerSchema).min(1),
}).strict();
const deltaTime = z.number().int().nonnegative();
const metaBase = { deltaTime, meta: z.literal(true) };
const channelBase = {
  deltaTime,
  channel: z.number().int().min(0).max(15),
  running: z.boolean().optional(),
};
const eventSchema = z.discriminatedUnion("type", [
  z.object({ ...metaBase, type: z.literal("trackName"), text: z.string() }).strict(),
  z.object({ ...metaBase, type: z.literal("text"), text: z.string() }).strict(),
  z.object({ ...metaBase, type: z.literal("marker"), text: z.string() }).strict(),
  z.object({
    ...metaBase,
    type: z.literal("setTempo"),
    microsecondsPerBeat: z.number().int().positive(),
  }).strict(),
  z.object({
    ...metaBase,
    type: z.literal("timeSignature"),
    numerator: z.number().int().positive(),
    denominator: z.number().int().positive(),
    metronome: z.number().int().nonnegative(),
    thirtyseconds: z.number().int().nonnegative(),
  }).strict(),
  z.object({ ...metaBase, type: z.literal("endOfTrack") }).strict(),
  z.object({
    ...channelBase,
    type: z.literal("programChange"),
    programNumber: z.number().int().min(0).max(127),
  }).strict(),
  z.object({
    ...channelBase,
    type: z.literal("controller"),
    controllerType: z.number().int().min(0).max(127),
    value: z.number().int().min(0).max(127),
  }).strict(),
  z.object({
    ...channelBase,
    type: z.literal("noteOn"),
    noteNumber: z.number().int().min(0).max(127),
    velocity: z.number().int().min(0).max(127),
  }).strict(),
  z.object({
    ...channelBase,
    type: z.literal("noteOff"),
    noteNumber: z.number().int().min(0).max(127),
    velocity: z.number().int().min(0).max(127),
  }).strict(),
]);
const midiDataSchema = z.object({
  header: z.object({
    format: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    numTracks: z.number().int().nonnegative(),
    ticksPerBeat: z.number().int().positive().optional(),
    framesPerSecond: z.number().optional(),
    ticksPerFrame: z.number().optional(),
  }).strict(),
  tracks: z.array(z.array(eventSchema)).min(1),
}).strict();
const caseSchema = z.object({
  id: z.string().regex(/^\d{2}_[a-z0-9_]+$/),
  filename: safeFilename,
  purpose: z.string().trim().min(1),
  invariants: z.array(z.string().trim().min(1)).min(1),
  comparisonMode: comparisonModeSchema,
  sourceManifest: z.enum(["base-v1", "supplemental-v1"]),
  sourceRecipe: z.object({
    id: z.string().trim().min(1),
    filename: safeFilename,
    ppq: z.number().int().positive(),
    bpm: positive,
    time_signature: z.string().regex(/^\d+\/\d+$/),
    tracks: z.array(z.string().trim().min(1)).optional(),
    events: z.array(z.object({
      start_beat: finite,
      duration_beats: positive,
      expected_label: z.string().trim().min(1),
      pitches: z.array(z.number().int().min(0).max(127)),
      pitch_names: z.array(z.string()).optional(),
      track: z.string().trim().min(1).optional(),
      duplicate_exact: z.boolean().optional(),
      velocity: z.number().int().min(0).max(127).optional(),
    }).strict()).optional(),
    purpose: z.string().trim().min(1),
    comparison_mode: z.enum(["exact_events", "canonical_at_probe_beats"]).optional(),
    invariants: z.array(z.string().trim().min(1)).min(1),
    expected_current_failures: z.array(z.string()).optional(),
  }).strict(),
  sourceRowCount: z.number().int().nonnegative(),
  expectedSegments: z.array(expectedSegmentSchema).min(1),
  midi: midiSchema,
  sourceMidi: midiDataSchema,
}).strict();
const contractSchema = z.object({
  schemaVersion: z.literal(2),
  corpusVersion: z.literal(phase515ContractVersion),
  generatorVersion: z.literal(phase515GeneratorVersion),
  generatedBy: z.literal("deterministic-code"),
  privacy: z.object({
    syntheticOnly: z.literal(true),
    personalMidiIncluded: z.literal(false),
    absolutePathsIncluded: z.literal(false),
  }).strict(),
  partitions: z.object({
    development: z.array(z.string()),
    validation: z.array(z.string()),
    roundTripBaseline: z.array(z.string()),
    runtimeOnly: z.array(z.string()),
  }).strict(),
  invariantGroups: z.object({
    duplicate: z.array(z.string()),
    ppq: z.array(z.string()),
    velocity: z.array(z.string()),
    trackOrder: z.array(z.string()),
    tempoMap: z.array(z.string()),
  }).strict(),
  cases: z.array(caseSchema).length(36),
}).strict();

export async function loadPhase515CorpusContract(
  manifestPath = resolve(cwd(), "scripts/phase515/fixtures/manifest-v2.json"),
): Promise<Phase515CorpusContract> {
  const raw: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  const parsed = contractSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid Phase 5.15 contract: ${zodSummary(parsed.error)}`);
  }
  const privacyIssues = findPrivacyIssues(parsed.data, "contract");
  if (privacyIssues.length > 0) {
    throw new Error(
      `Invalid Phase 5.15 contract privacy: ${privacyIssues[0]!.path} ${privacyIssues[0]!.code}.`,
    );
  }
  return parsed.data as unknown as Phase515CorpusContract;
}

export async function validateCorpusContract(
  repositoryRoot: string,
  contract: Phase515CorpusContract,
): Promise<CorpusContractValidation> {
  const issues = validateCorpusContractStructure(contract);
  let midiCount = 0;
  let deterministicGeneratedCount = 0;
  let byteExactGeneratedCount = 0;

  for (const item of Array.isArray(contract.cases) ? contract.cases : []) {
    const group = item.sourceManifest === "base-v1"
      ? "test/phase5.15/midi"
      : "test/phase5.15-supplemental/midi";
    const groupRoot = resolve(repositoryRoot, group);
    let path: string;
    try {
      path = await safeResolveExistingWithinRoot(groupRoot, item.filename);
    } catch {
      issue(issues, "unsafe-midi-path", "MIDI path escapes its corpus directory.", item.id);
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(path));
      midiCount += 1;
    } catch {
      issue(issues, "missing-midi", `Missing local MIDI ${item.filename}.`, item.id);
      continue;
    }
    validatePhysicalMidi(item, bytes, issues);

    let generatedA: Uint8Array;
    let generatedB: Uint8Array;
    try {
      generatedA = renderContractMidi(item);
      generatedB = renderContractMidi(item);
    } catch (cause) {
      issue(
        issues,
        "generator-error",
        cause instanceof Error ? cause.message : String(cause),
        item.id,
      );
      continue;
    }
    if (sha256(generatedA) === sha256(generatedB)) deterministicGeneratedCount += 1;
    else issue(issues, "generator-nondeterministic", "Generator output changed.", item.id);
    if (sha256(generatedA) === item.midi.sha256) byteExactGeneratedCount += 1;
    else issue(issues, "generated-sha256-mismatch", "Generated MIDI hash differs from contract.", item.id);
    if (generatedA.byteLength !== item.midi.byteLength) {
      issue(issues, "generated-byte-length-mismatch", "Generated MIDI byte length differs from contract.", item.id);
    }
    if (semanticMidiKey(parseMidi(generatedA)) !== semanticMidiKey(item.sourceMidi)) {
      issue(issues, "generator-semantic-mismatch", "Generated MIDI changed events.", item.id);
    }
  }

  return {
    valid: issues.length === 0,
    caseCount: Array.isArray(contract.cases) ? contract.cases.length : 0,
    midiCount,
    deterministicGeneratedCount,
    byteExactGeneratedCount,
    issues: issues.sort((left, right) =>
      compareCodePoints(left.caseId ?? "", right.caseId ?? "")
      || compareCodePoints(left.code, right.code)),
  };
}

export function validateGeneratedCorpusContractInMemory(
  contract: Phase515CorpusContract,
): CorpusContractValidation {
  const issues = validateCorpusContractStructure(contract);
  let deterministicGeneratedCount = 0;
  let byteExactGeneratedCount = 0;
  for (const item of Array.isArray(contract.cases) ? contract.cases : []) {
    try {
      const generatedA = renderContractMidi(item);
      const generatedB = renderContractMidi(item);
      validatePhysicalMidi(item, generatedA, issues);
      if (sha256(generatedA) === sha256(generatedB)) {
        deterministicGeneratedCount += 1;
      } else {
        issue(
          issues,
          "generator-nondeterministic",
          "Generator output changed.",
          item.id,
        );
      }
      if (
        sha256(generatedA) === item.midi.sha256
        && generatedA.byteLength === item.midi.byteLength
      ) {
        byteExactGeneratedCount += 1;
      } else {
        issue(
          issues,
          "generated-contract-mismatch",
          "Generated MIDI bytes differ from the contract.",
          item.id,
        );
      }
      if (
        semanticMidiKey(parseMidi(generatedA))
        !== semanticMidiKey(item.sourceMidi)
      ) {
        issue(
          issues,
          "generator-semantic-mismatch",
          "Generated MIDI changed events.",
          item.id,
        );
      }
    } catch (cause) {
      issue(
        issues,
        "generator-error",
        cause instanceof Error ? cause.message : String(cause),
        item.id,
      );
    }
  }
  return {
    valid: issues.length === 0,
    caseCount: Array.isArray(contract.cases) ? contract.cases.length : 0,
    midiCount: Array.isArray(contract.cases) ? contract.cases.length : 0,
    deterministicGeneratedCount,
    byteExactGeneratedCount,
    issues: issues.sort((left, right) =>
      compareCodePoints(left.caseId ?? "", right.caseId ?? "")
      || compareCodePoints(left.code, right.code)),
  };
}

export function validateCorpusContractStructure(
  contract: Phase515CorpusContract,
): CorpusContractIssue[] {
  const issues: CorpusContractIssue[] = [];
  const parsed = contractSchema.safeParse(contract);
  if (!parsed.success) {
    for (const problem of parsed.error.issues) {
      issue(
        issues,
        "runtime-schema",
        `${problem.path.join(".") || "<root>"}: ${problem.message}`,
      );
    }
    return issues;
  }
  const privacyIssues = findPrivacyIssues(parsed.data, "contract");
  if (privacyIssues.length > 0) {
    for (const privacyIssue of privacyIssues) {
      issue(
        issues,
        "source-midi-privacy",
        `${privacyIssue.path} violates ${privacyIssue.code}.`,
      );
    }
    return issues;
  }

  const ids = new Set<string>();
  for (const item of contract.cases) {
    if (ids.has(item.id)) issue(issues, "duplicate-id", "Duplicate case id.", item.id);
    ids.add(item.id);
    validateCaseStructure(item, issues);
  }
  compareExactObject("partition", phase515Partitions, contract.partitions, issues);
  compareExactObject("invariant-group", phase515InvariantGroups, contract.invariantGroups, issues);
  validateRoles(contract, issues);
  return issues;
}

function validatePhysicalMidi(
  item: Phase515ContractCase,
  bytes: Uint8Array,
  issues: CorpusContractIssue[],
) {
  if (sha256(bytes) !== item.midi.sha256) {
    issue(issues, "sha256-mismatch", "MIDI SHA-256 differs from contract.", item.id);
  }
  if (bytes.byteLength !== item.midi.byteLength) {
    issue(issues, "byte-length-mismatch", "MIDI byte length differs from contract.", item.id);
  }
  let parsed;
  try {
    parsed = parseMidi(bytes);
  } catch (cause) {
    issue(issues, "unreadable-midi", cause instanceof Error ? cause.message : String(cause), item.id);
    return;
  }
  const ppq = ticksPerBeat(parsed);
  const metadata = {
    smfFormat: parsed.header.format,
    ppq,
    bpm: bpmOf(parsed),
    timeSignature: timeSignatureOf(parsed),
    trackCount: parsed.tracks.length,
    noteCount: parsed.tracks.flat().filter((event) =>
      event.type === "noteOn" && event.velocity > 0).length,
    clipLengthBeats: maximumTick(parsed) / ppq,
    markers: midiMarkers(parsed),
  };
  for (const key of [
    "smfFormat", "ppq", "bpm", "timeSignature", "trackCount", "noteCount",
    "clipLengthBeats",
  ] as const) {
    if (metadata[key] !== item.midi[key]) {
      issue(issues, `midi-${key}-mismatch`, `MIDI ${key} differs from contract.`, item.id);
    }
  }
  if (JSON.stringify(metadata.markers) !== JSON.stringify(item.midi.markers)) {
    issue(issues, "midi-markers-mismatch", "MIDI markers differ from contract.", item.id);
  }
  const labelsByBeat = new Map<number, Set<string>>();
  for (const marker of metadata.markers) {
    const labels = labelsByBeat.get(marker.beat) ?? new Set<string>();
    labels.add(marker.label);
    labelsByBeat.set(marker.beat, labels);
  }
  if ([...labelsByBeat.values()].some((labels) => labels.size > 1)) {
    issue(issues, "ambiguous-marker", "MIDI has multiple marker labels at one beat.", item.id);
  }
  if (semanticMidiKey(parsed) !== semanticMidiKey(item.sourceMidi)) {
    issue(issues, "semantic-source-mismatch", "MIDI events differ from contract.", item.id);
  }
  if (!segmentsEqual(markerSegments(parsed), item.expectedSegments)) {
    issue(issues, "marker-expected-mismatch", "Markers differ from the independent expected oracle.", item.id);
  }
}

function segmentsEqual(
  left: readonly { startBeat: number; endBeat: number; durationBeats: number; label: string }[],
  right: readonly { startBeat: number; endBeat: number; durationBeats: number; label: string }[],
): boolean {
  return left.length === right.length && left.every((segment, index) => {
    const other = right[index];
    return Boolean(
      other
      && segment.label === other.label
      && Math.abs(segment.startBeat - other.startBeat) <= 1e-9
      && Math.abs(segment.endBeat - other.endBeat) <= 1e-9
      && Math.abs(segment.durationBeats - other.durationBeats) <= 1e-9
    );
  });
}

function validateCaseStructure(
  item: Phase515ContractCase,
  issues: CorpusContractIssue[],
) {
  let previousEnd = -Infinity;
  for (const segment of item.expectedSegments) {
    if (Math.abs(segment.endBeat - segment.startBeat - segment.durationBeats) > 1e-9) {
      issue(issues, "segment-duration-mismatch", "Segment duration does not equal end-start.", item.id);
    }
    if (segment.startBeat < previousEnd) {
      issue(issues, "overlapping-segments", "Expected segments overlap.", item.id);
    }
    if (
      Math.abs(segment.startBeat * item.midi.ppq
        - Math.round(segment.startBeat * item.midi.ppq)) > 1e-6
      || Math.abs(segment.endBeat * item.midi.ppq
        - Math.round(segment.endBeat * item.midi.ppq)) > 1e-6
    ) {
      issue(issues, "ppq-unrepresentable", "Expected segment is not PPQ-representable.", item.id);
    }
    previousEnd = segment.endBeat;
  }
  if (
    item.sourceRecipe.id !== item.id
    || item.sourceRecipe.filename !== item.filename
    || item.sourceRecipe.ppq !== item.midi.ppq
    || Math.abs(item.sourceRecipe.bpm - item.midi.bpm) > 0.001
    || item.sourceRecipe.time_signature !== item.midi.timeSignature
    || item.sourceRecipe.purpose !== item.purpose
    || stableJson(item.sourceRecipe.invariants) !== stableJson(item.invariants)
    || (item.sourceRecipe.events?.length ?? 0) !== item.sourceRowCount
  ) {
    issue(
      issues,
      "source-recipe-metadata-mismatch",
      "Embedded v1 recipe metadata differs from the v2 case contract.",
      item.id,
    );
  }
  if (item.midi.smfFormat === 0 && item.sourceMidi.tracks.length !== 1) {
    issue(issues, "invalid-type0", "SMF Type 0 must contain one physical track.", item.id);
  }
  if (item.id === "32_type0_multichannel" && item.expectedSegments.length !== 2) {
    issue(issues, "type0-oracle", "Case 32 must retain its two-segment logical oracle.", item.id);
  }
  const labelsByTick = new Map<number, Set<string>>();
  for (const track of item.sourceMidi.tracks) {
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type !== "marker") continue;
      const label = event.text.trim();
      const labels = labelsByTick.get(tick) ?? new Set<string>();
      labels.add(label);
      labelsByTick.set(tick, labels);
    }
  }
  if ([...labelsByTick.values()].some((labels) => labels.size > 1)) {
    issue(issues, "ambiguous-marker", "Source MIDI has conflicting marker labels.", item.id);
  }
}

function validateRoles(
  contract: Phase515CorpusContract,
  issues: CorpusContractIssue[],
) {
  const all = new Set(contract.cases.map((item) => item.id));
  const primary = [
    ...contract.partitions.development,
    ...contract.partitions.validation,
    ...contract.partitions.roundTripBaseline,
    ...contract.partitions.runtimeOnly,
  ];
  const primaryCounts = new Map<string, number>();
  for (const id of primary) primaryCounts.set(id, (primaryCounts.get(id) ?? 0) + 1);
  for (const id of all) {
    const primaryCount = primaryCounts.get(id) ?? 0;
    const invariantCount = Object.values(contract.invariantGroups)
      .filter((members) => (members as readonly string[]).includes(id)).length;
    if (primaryCount > 1 || invariantCount > 1) {
      issue(issues, "duplicate-role", "Case has duplicate partition/invariant roles.", id);
    }
    if (primaryCount === 0 && invariantCount === 0) {
      issue(issues, "unpartitioned-case", "Case is not assigned to a role.", id);
    }
  }
  for (const id of [...primary, ...Object.values(contract.invariantGroups).flat()]) {
    if (!all.has(id)) issue(issues, "missing-partition-case", "Role references a missing case.", id);
  }
  if (
    contract.invariantGroups.tempoMap.length !== 1
    || contract.invariantGroups.tempoMap[0] !== "25_tempo_change_mid_file"
  ) {
    issue(issues, "tempo-map-role", "Tempo-map invariant must be the case 25 singleton.");
  }
  if (
    contract.partitions.roundTripBaseline.join("|")
    !== phase515Partitions.roundTripBaseline.join("|")
  ) {
    issue(issues, "roundtrip-role", "Cases 10/11 must remain in the round-trip bucket.");
  }
}

function compareExactObject(
  label: string,
  expected: Record<string, readonly string[]>,
  actual: Record<string, readonly string[]>,
  issues: CorpusContractIssue[],
) {
  for (const key of Object.keys(expected).sort(compareCodePoints)) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
      issue(issues, `invalid-${label}-membership`, `${label} ${key} membership/order changed.`);
    }
  }
  if (
    JSON.stringify(Object.keys(actual).sort(compareCodePoints))
    !== JSON.stringify(Object.keys(expected).sort(compareCodePoints))
  ) {
    issue(issues, `invalid-${label}-keys`, `${label} keys changed.`);
  }
}

function bpmOf(data: ReturnType<typeof parseMidi>): number {
  for (const event of data.tracks.flat()) {
    if (event.type === "setTempo") {
      return Number((60_000_000 / event.microsecondsPerBeat).toFixed(6));
    }
  }
  return Number.NaN;
}

function timeSignatureOf(data: ReturnType<typeof parseMidi>): string {
  for (const event of data.tracks.flat()) {
    if (event.type === "timeSignature") return `${event.numerator}/${event.denominator}`;
  }
  return "";
}

export async function validateSourceContractDrift(
  repositoryRoot: string,
  contract: Phase515CorpusContract,
): Promise<CorpusContractIssue[]> {
  const rebuilt = await buildCorpusContract(repositoryRoot);
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-contract-"));
  const temporaryPath = resolve(temporaryRoot, "manifest-v2.json");
  try {
    const rendered = `${JSON.stringify(rebuilt, null, 2)}\n`;
    await writeFile(temporaryPath, rendered, "utf8");
    const reparsed: unknown = JSON.parse(await readFile(temporaryPath, "utf8"));
    const deepEqual = stableJson(reparsed) === stableJson(contract);
    const hashEqual = sha256(stableJson(reparsed)) === sha256(stableJson(contract));
    return deepEqual && hashEqual ? [] : [{
      code: "source-contract-drift",
      message: "Validated source manifests/MIDI do not deep-equal the tracked v2 contract.",
    }];
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
    await rmdir(temporaryRoot).catch(() => undefined);
  }
}

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item)
        .sort(([left], [right]) => compareCodePoints(left, right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}

function zodSummary(error: z.ZodError): string {
  return error.issues.map((problem) =>
    `${problem.path.join(".") || "<root>"}: ${problem.message}`).join("; ");
}

function issue(
  issues: CorpusContractIssue[],
  code: string,
  message: string,
  caseId?: string,
) {
  issues.push({ code, message, ...(caseId ? { caseId } : {}) });
}
