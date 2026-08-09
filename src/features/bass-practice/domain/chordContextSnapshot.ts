import { labelFromSymbol } from "../../../domain/chords";
import type {
  ChordQuality,
  ChordSymbol,
  SavedProgressionBlock,
  SongIdea,
  Tension,
} from "../../../domain/types";
import { stableHash } from "./determinism";

export const CHORD_CONTEXT_SNAPSHOT_VERSION = "chord-context-snapshot-v1" as const;
export const CHORD_CONTEXT_SECTION_BEATS = [4, 8, 16, 32, 48] as const;
export type ChordContextSectionLengthBeats = (typeof CHORD_CONTEXT_SECTION_BEATS)[number];
export const CHORD_CONTEXT_MAX_SECTION_CHORDS = 48;

const supportedQualities = new Set<ChordQuality>([
  "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5",
  "dim7", "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4",
  "dom7sus4", "add9", "six", "min6", "sixNine",
]);
const supportedTensions = new Set<Tension>([
  "9", "b9", "#9", "11", "#11", "13", "b13",
]);

export interface VaultChordContextSourceReference {
  readonly ideaId: string;
  readonly blockId: string;
}

export interface ChordContextSnapshotChord {
  readonly id: string;
  readonly root: number;
  readonly quality: ChordQuality;
  readonly tensions: readonly Tension[];
  readonly bass?: number;
  readonly label: string;
  /** Section-relative onset in beats. */
  readonly startBeat: number;
  readonly durationBeats: number;
}

export interface VaultChordContextSection {
  readonly id: string;
  readonly startBar: number;
  /** Inclusive source bar. */
  readonly endBar: number;
  readonly lengthBeats: ChordContextSectionLengthBeats;
  readonly chords: readonly ChordContextSnapshotChord[];
}

export interface VaultChordContextSnapshot {
  readonly version: typeof CHORD_CONTEXT_SNAPSHOT_VERSION;
  readonly source: {
    readonly kind: "vault";
    readonly reference: VaultChordContextSourceReference;
    /** Derived only from harmonic metadata and section bounds, never user text. */
    readonly safeLabel: string;
  };
  readonly tonalContext: {
    readonly key: string;
    readonly mode?: "major" | "minor";
  };
  readonly originalBpm: number;
  readonly meter: { readonly numerator: 4; readonly denominator: 4 };
  readonly section: VaultChordContextSection;
  /** Signature of canonical snapshot content, including source logical ids. */
  readonly signature: string;
}

export interface GeneratedChordContextSnapshot {
  readonly version: typeof CHORD_CONTEXT_SNAPSHOT_VERSION;
  readonly source: { readonly kind: "generated"; readonly safeLabel: "Generated progression" };
  readonly tonalContext: { readonly key: string; readonly mode?: "major" | "minor" };
  readonly originalBpm: number;
  readonly meter: { readonly numerator: 4; readonly denominator: 4 };
  readonly section: VaultChordContextSection;
  readonly signature: string;
}

export interface PresetChordContextSnapshot {
  readonly version: typeof CHORD_CONTEXT_SNAPSHOT_VERSION;
  readonly source: {
    readonly kind: "preset";
    readonly presetId: string;
    readonly catalogVersion: string;
    readonly safeLabel: string;
  };
  readonly tonalContext: { readonly key: string; readonly mode?: "major" | "minor" };
  readonly originalBpm: number;
  readonly meter: { readonly numerator: 4; readonly denominator: 4 };
  readonly section: VaultChordContextSection;
  readonly signature: string;
}

export type ChordContextSnapshot = VaultChordContextSnapshot | GeneratedChordContextSnapshot | PresetChordContextSnapshot;

export type VaultChordContextSnapshotErrorCode =
  | "source-unavailable"
  | "unsupported-source"
  | "invalid-section"
  | "invalid-snapshot";

export interface VaultChordContextSnapshotError {
  readonly code: VaultChordContextSnapshotErrorCode;
  readonly message: string;
}

export type VaultChordContextSectionsResult =
  | { readonly ok: true; readonly sections: readonly VaultChordContextSection[] }
  | { readonly ok: false; readonly error: VaultChordContextSnapshotError };

export type VaultChordContextSnapshotResult =
  | { readonly ok: true; readonly snapshot: VaultChordContextSnapshot }
  | { readonly ok: false; readonly error: VaultChordContextSnapshotError };

export type PresetChordContextSnapshotResult =
  | { readonly ok: true; readonly snapshot: PresetChordContextSnapshot }
  | { readonly ok: false; readonly error: VaultChordContextSnapshotError };

export type GeneratedChordContextSnapshotResult =
  | { readonly ok: true; readonly snapshot: GeneratedChordContextSnapshot }
  | { readonly ok: false; readonly error: VaultChordContextSnapshotError };

export interface BuildVaultChordContextSnapshotInput {
  readonly sourceReference: VaultChordContextSourceReference;
  readonly block: SavedProgressionBlock;
  /** Omit to select the earliest safe, complete section. */
  readonly sectionId?: string;
}

/**
 * Enumerates only complete, contiguous 4/4 one- or two-bar sections. It never
 * clips a long source or adopts a neighboring progression as a substitute.
 */
export function selectVaultChordContextSections(
  block: SavedProgressionBlock | undefined,
): VaultChordContextSectionsResult {
  if (!block) return failure("source-unavailable", "Saved progression is no longer available.");
  const sourceError = validateVaultSource(block);
  if (sourceError) return failure("unsupported-source", sourceError);
  const sourceEvents = toSourceEvents(block.chords);
  if (!sourceEvents) {
    return failure("unsupported-source", "Saved progression chord timing is unavailable for Chord Context Practice.");
  }

  const sections: VaultChordContextSection[] = [];
  for (const event of sourceEvents) {
    if (event.beat !== 1) continue;
    for (const lengthBeats of CHORD_CONTEXT_SECTION_BEATS) {
      const endAbsoluteBeat = event.absoluteBeat + lengthBeats;
      const contained = sourceEvents.filter((candidate) => (
        candidate.absoluteBeat >= event.absoluteBeat
        && candidate.absoluteBeat + candidate.durationBeats <= endAbsoluteBeat
      ));
      if (!isCompleteSection(contained, event.absoluteBeat, endAbsoluteBeat)) continue;
      if (contained.length > CHORD_CONTEXT_MAX_SECTION_CHORDS) continue;
      const chords = contained.map((candidate, index) => freezeChord({
        id: `chord:${index}`,
        root: candidate.chord.root,
        quality: candidate.chord.quality,
        tensions: [...candidate.chord.tensions],
        ...(candidate.chord.bass === undefined ? {} : { bass: candidate.chord.bass }),
        label: labelFromSymbol(candidate.chord),
        startBeat: candidate.absoluteBeat - event.absoluteBeat,
        durationBeats: candidate.durationBeats,
      }));
      const barLength = lengthBeats / 4;
      sections.push(Object.freeze({
        id: `bars:${event.bar}-${event.bar + barLength - 1}`,
        startBar: event.bar,
        endBar: event.bar + barLength - 1,
        lengthBeats,
        chords: Object.freeze(chords),
      }));
    }
  }

  if (!sections.length) {
    return failure("unsupported-source", "Saved progression has no complete 1, 2, 4, 8, or 12-bar 4/4 Chord Context section.");
  }
  return { ok: true, sections: Object.freeze(sections) };
}

/** Creates a detached, immutable snapshot from the source as it exists now. */
export function buildVaultChordContextSnapshot(
  input: BuildVaultChordContextSnapshotInput,
): VaultChordContextSnapshotResult {
  if (!isSourceReference(input.sourceReference)) {
    return failure("invalid-section", "Chord Context Practice needs stable Vault idea and progression references.");
  }
  const sectionsResult = selectVaultChordContextSections(input.block);
  if (!sectionsResult.ok) return sectionsResult;
  const section = input.sectionId === undefined
    ? sectionsResult.sections[0]
    : sectionsResult.sections.find((candidate) => candidate.id === input.sectionId);
  if (!section) {
    return failure("invalid-section", "Selected Chord Context section is no longer available in this progression.");
  }
  const snapshot = createVaultSnapshot(
    input.sourceReference,
    input.block.detectedKey!.trim(),
    input.block.bpm!,
    section,
  );
  return { ok: true, snapshot };
}
/**
 * Resolves a fresh source only from the current Vault model. A missing idea or
 * block deliberately fails; callers must not fall back to a different source.
 */
export function buildVaultChordContextSnapshotFromVault(
  ideas: readonly SongIdea[],
  sourceReference: VaultChordContextSourceReference,
  sectionId?: string,
): VaultChordContextSnapshotResult {
  const idea = ideas.find((candidate) => candidate.id === sourceReference.ideaId);
  const block = idea?.progressionBlocks?.find((candidate) => candidate.id === sourceReference.blockId);
  if (!block) {
    return failure("source-unavailable", "This saved progression is no longer available for a new Chord Context practice.");
  }
  return buildVaultChordContextSnapshot({ sourceReference, block, sectionId });
}

/**
 * Builds the safe, detached snapshot catalog exposed inside Bassline Echo.
 * Unsupported sources are omitted; Vault objects never cross this boundary.
 */
export function buildVaultChordContextSnapshotCatalog(
  ideas: readonly SongIdea[],
): readonly VaultChordContextSnapshot[] {
  const snapshots: VaultChordContextSnapshot[] = [];
  const signatures = new Set<string>();
  for (const idea of ideas) {
    for (const block of idea.progressionBlocks ?? []) {
      const sections = selectVaultChordContextSections(block);
      if (!sections.ok) continue;
      for (const section of sections.sections) {
        const result = buildVaultChordContextSnapshot({
          sourceReference: { ideaId: idea.id, blockId: block.id },
          block,
          sectionId: section.id,
        });
        if (!result.ok || signatures.has(result.snapshot.signature)) continue;
        signatures.add(result.snapshot.signature);
        snapshots.push(result.snapshot);
      }
    }
  }
  return Object.freeze(snapshots);
}

/** Existing generated Bassline sources can use the same source-neutral contract. */
export function buildGeneratedChordContextSnapshot(input: {
  readonly key: string;
  readonly bpm: number;
  readonly chords: readonly ChordContextSnapshotChord[];
}): GeneratedChordContextSnapshotResult {
  if (!isSafeKey(input.key) || !isSupportedBpm(input.bpm)) {
    return failure("unsupported-source", "Generated Chord Context source has unsupported key or BPM.");
  }
  const section = sectionFromDetachedChords(input.chords);
  if (!section) {
    return failure("unsupported-source", "Generated Chord Context source has no safe complete section.");
  }
  return { ok: true, snapshot: createGeneratedSnapshot(input.key, input.bpm, section) };
}

/** Creates a detached immutable snapshot from a curated P5.18.1 preset. */
export function buildPresetChordContextSnapshot(input: {
  readonly presetId: string;
  readonly catalogVersion: string;
  readonly safeLabel: string;
  readonly key: string;
  readonly bpm: number;
  readonly chords: readonly ChordContextSnapshotChord[];
}): PresetChordContextSnapshotResult {
  if (!isSafeLogicalIdentifier(input.presetId)
    || !isSafeCatalogVersion(input.catalogVersion)
    || !isSafePresetLabel(input.safeLabel)
    || !isSafeKey(input.key)
    || !isSupportedBpm(input.bpm)
    || !Array.isArray(input.chords)
    || !input.chords.every(isPresetInputChord)) {
    return failure("unsupported-source", "Preset Chord Context source has unsupported identity, key, or BPM.");
  }
  const section = sectionFromDetachedChords(
    input.chords.map((chord) => freezeChord(chord)),
    `preset:${input.presetId}`,
  );
  if (!section) return failure("unsupported-source", "Preset Chord Context source has no supported complete section.");
  return { ok: true, snapshot: createPresetSnapshot(input.presetId, input.catalogVersion, input.safeLabel, input.key, input.bpm, section) };
}

/** Validates detached historical snapshots without looking up the live Vault. */
export function validateChordContextSnapshot(
  value: unknown,
): { readonly ok: true; readonly snapshot: ChordContextSnapshot } | { readonly ok: false; readonly error: VaultChordContextSnapshotError } {
  if (!isRecord(value) || value.version !== CHORD_CONTEXT_SNAPSHOT_VERSION) {
    return failure("invalid-snapshot", "Chord Context snapshot version or shape is invalid.");
  }
  const source = value.source;
  const tonalContext = value.tonalContext;
  const meter = value.meter;
  const section = value.section;
  if ((!isVaultSnapshotSource(source) && !isGeneratedSnapshotSource(source) && !isPresetSnapshotSource(source))
    || !isTonalContext(tonalContext)
    || !isSupportedBpm(value.originalBpm)
    || !isFourFour(meter)
    || !isSection(section)) {
    return failure("invalid-snapshot", "Chord Context snapshot contents are invalid.");
  }
  const snapshot = source.kind === "vault"
    ? createVaultSnapshot(source.reference, tonalContext.key, value.originalBpm, section)
    : source.kind === "preset"
      ? createPresetSnapshot(source.presetId, source.catalogVersion, source.safeLabel, tonalContext.key, value.originalBpm, section)
      : createGeneratedSnapshot(tonalContext.key, value.originalBpm, section);
  if ((source.kind === "vault" && !isVaultSection(snapshot.section))
    || (source.kind === "preset" && !isPresetSection(snapshot.section, source.presetId))
    || (source.kind === "generated" && !isGeneratedSection(snapshot.section))) {
    return failure("invalid-snapshot", "Chord Context snapshot section does not match its source contract.");
  }
  if (typeof value.signature !== "string" || value.signature !== snapshot.signature) {
    return failure("invalid-snapshot", "Chord Context snapshot signature does not match its canonical content.");
  }
  // Return only a freshly canonicalized clone. This strips unknown/root fields
  // such as rawMidi or sourcePath even if a caller supplied a valid signature.
  return { ok: true, snapshot };
}

function createVaultSnapshot(
  sourceReference: VaultChordContextSourceReference,
  key: string,
  originalBpm: number,
  section: VaultChordContextSection,
): VaultChordContextSnapshot {
  const canonicalSection = cloneSection(section);
  const source = Object.freeze({
    kind: "vault" as const,
    reference: Object.freeze({ ideaId: sourceReference.ideaId, blockId: sourceReference.blockId }),
    safeLabel: safeVaultLabel(key, canonicalSection),
  });
  const withoutSignature = Object.freeze({
    version: CHORD_CONTEXT_SNAPSHOT_VERSION,
    source,
    tonalContext: canonicalTonalContext(key),
    originalBpm,
    meter: Object.freeze({ numerator: 4 as const, denominator: 4 as const }),
    section: canonicalSection,
  });
  return Object.freeze({ ...withoutSignature, signature: signatureForSnapshot(withoutSignature) });
}

function createGeneratedSnapshot(
  key: string,
  originalBpm: number,
  section: VaultChordContextSection,
): GeneratedChordContextSnapshot {
  const withoutSignature = Object.freeze({
    version: CHORD_CONTEXT_SNAPSHOT_VERSION,
    source: Object.freeze({ kind: "generated" as const, safeLabel: "Generated progression" as const }),
    tonalContext: canonicalTonalContext(key),
    originalBpm,
    meter: Object.freeze({ numerator: 4 as const, denominator: 4 as const }),
    section: cloneSection(section),
  });
  return Object.freeze({ ...withoutSignature, signature: signatureForSnapshot(withoutSignature) });
}

function createPresetSnapshot(
  presetId: string,
  catalogVersion: string,
  safeLabel: string,
  key: string,
  originalBpm: number,
  section: VaultChordContextSection,
): PresetChordContextSnapshot {
  const canonicalSection = cloneSection(section);
  const withoutSignature = Object.freeze({
    version: CHORD_CONTEXT_SNAPSHOT_VERSION,
    source: Object.freeze({ kind: "preset" as const, presetId, catalogVersion, safeLabel }),
    tonalContext: canonicalTonalContext(key),
    originalBpm,
    meter: Object.freeze({ numerator: 4 as const, denominator: 4 as const }),
    section: canonicalSection,
  });
  return Object.freeze({ ...withoutSignature, signature: signatureForSnapshot(withoutSignature) });
}

function canonicalTonalContext(key: string): { readonly key: string; readonly mode: "major" | "minor" } {
  const normalized = key.trim();
  return Object.freeze({ key: normalized, mode: modeFromKey(normalized)! });
}
function validateVaultSource(block: SavedProgressionBlock | undefined): string | undefined {
  if (!block) return "Saved progression is no longer available.";
  if (!isSafeKey(block.detectedKey)) return "Saved progression key is unavailable for Chord Context Practice.";
  if (!isSupportedBpm(block.bpm)) return "Saved progression BPM must be between 30 and 240.";
  if (normalizeMeter(block.timeSignature) !== "4/4") return "Chord Context Practice currently requires an explicit 4/4 source meter.";
  if (!Array.isArray(block.chords) || !block.chords.length) return "Saved progression has no chords for Chord Context Practice.";
  return undefined;
}

interface SourceEvent {
  readonly bar: number;
  readonly beat: number;
  readonly absoluteBeat: number;
  readonly durationBeats: number;
  readonly chord: ChordSymbol;
}

function toSourceEvents(chords: readonly SavedProgressionBlock["chords"][number][]): readonly SourceEvent[] | undefined {
  const events: SourceEvent[] = [];
  for (const entry of chords) {
    if (!Number.isInteger(entry.bar) || entry.bar < 1 || !Number.isFinite(entry.beat) || entry.beat < 1 || entry.beat > 4 || !Number.isFinite(entry.durationBeats) || entry.durationBeats <= 0 || !isChordSymbol(entry.chord)) {
      return undefined;
    }
    events.push({
      bar: entry.bar,
      beat: entry.beat,
      absoluteBeat: (entry.bar - 1) * 4 + entry.beat - 1,
      durationBeats: entry.durationBeats,
      chord: entry.chord,
    });
  }
  events.sort((left, right) => left.absoluteBeat - right.absoluteBeat || labelFromSymbol(left.chord).localeCompare(labelFromSymbol(right.chord)));
  for (let index = 1; index < events.length; index += 1) {
    if (events[index - 1]!.absoluteBeat + events[index - 1]!.durationBeats > events[index]!.absoluteBeat) return undefined;
  }
  return events;
}

function isCompleteSection(events: readonly SourceEvent[], startBeat: number, endBeat: number): boolean {
  if (!events.length || events.length > CHORD_CONTEXT_MAX_SECTION_CHORDS) return false;
  let cursor = startBeat;
  for (const event of events) {
    if (event.absoluteBeat !== cursor) return false;
    cursor += event.durationBeats;
  }
  return cursor === endBeat;
}

function sectionFromDetachedChords(chords: readonly ChordContextSnapshotChord[], idPrefix = "generated"): VaultChordContextSection | undefined {
  if (!chords.length || chords.length > CHORD_CONTEXT_MAX_SECTION_CHORDS || !chords.every(isSnapshotChord)) return undefined;
  const copied = [...chords].sort((left, right) => left.startBeat - right.startBeat || left.id.localeCompare(right.id));
  const end = copied.reduce((maximum, chord) => Math.max(maximum, chord.startBeat + chord.durationBeats), 0);
  if (!isSupportedSectionLength(end) || !isCompleteDetachedSection(copied, end)) return undefined;
  return Object.freeze({
    id: `${idPrefix}:${end}`,
    startBar: 1,
    endBar: end / 4,
    lengthBeats: end,
    chords: Object.freeze(copied.map(cloneChord)),
  });
}

function isCompleteDetachedSection(chords: readonly ChordContextSnapshotChord[], end: number): boolean {
  let cursor = 0;
  for (const chord of chords) {
    if (chord.startBeat !== cursor) return false;
    cursor += chord.durationBeats;
  }
  return cursor === end;
}

function isSection(value: unknown): value is VaultChordContextSection {
  if (!isRecord(value)) return false;
  const { id, startBar, endBar, lengthBeats, chords } = value;
  if (!isSafeLogicalIdentifier(id) || typeof startBar !== "number" || !Number.isInteger(startBar) || startBar < 1
    || typeof endBar !== "number" || !Number.isInteger(endBar) || endBar < startBar
    || typeof lengthBeats !== "number"
    || !isSupportedSectionLength(lengthBeats)
    || !Array.isArray(chords)
    || chords.length < 1
    || chords.length > CHORD_CONTEXT_MAX_SECTION_CHORDS
    || !chords.every(isSnapshotChord)) return false;
  const ordered = [...chords].sort(
    (left, right) => left.startBeat - right.startBeat || left.id.localeCompare(right.id),
  );
  return isCompleteDetachedSection(ordered, lengthBeats)
    && endBar - startBar + 1 === lengthBeats / 4;
}

function isVaultSection(section: VaultChordContextSection): boolean {
  return section.id === `bars:${section.startBar}-${section.endBar}`;
}

function isGeneratedSection(section: VaultChordContextSection): boolean {
  return section.id === `generated:${section.lengthBeats}`
    && section.startBar === 1
    && section.endBar === section.lengthBeats / 4;
}

function isPresetSection(section: VaultChordContextSection, presetId: string): boolean {
  return section.id === `preset:${presetId}:${section.lengthBeats}`
    && section.startBar === 1
    && section.endBar === section.lengthBeats / 4;
}

function isPresetInputChord(value: unknown): value is ChordContextSnapshotChord {
  if (!isRecord(value) || !isChordSymbol(value)) return false;
  const { id, startBeat, durationBeats } = value;
  return isSafeLogicalIdentifier(id)
    && typeof startBeat === "number"
    && Number.isFinite(startBeat)
    && startBeat >= 0
    && typeof durationBeats === "number"
    && Number.isFinite(durationBeats)
    && durationBeats > 0;
}
function isSnapshotChord(value: unknown): value is ChordContextSnapshotChord {
  if (!isRecord(value) || !isChordSymbol(value)) return false;
  const { id, label, startBeat, durationBeats } = value;
  return isSafeLogicalIdentifier(id)
    && typeof label === "string"
    && label === canonicalChordLabel(value)
    && typeof startBeat === "number"
    && Number.isFinite(startBeat)
    && startBeat >= 0
    && typeof durationBeats === "number"
    && Number.isFinite(durationBeats)
    && durationBeats > 0;
}

function isChordSymbol(value: unknown): value is ChordSymbol {
  if (!isRecord(value)) return false;
  const { root, quality, tensions, bass } = value;
  return typeof root === "number"
    && Number.isInteger(root)
    && root >= 0
    && root <= 11
    && supportedQualities.has(quality as ChordQuality)
    && Array.isArray(tensions)
    && tensions.every((tension) => supportedTensions.has(tension as Tension))
    && (bass === undefined || (typeof bass === "number" && Number.isInteger(bass) && bass >= 0 && bass <= 11));
}

function isVaultSnapshotSource(value: unknown): value is VaultChordContextSnapshot["source"] {
  return isRecord(value)
    && value.kind === "vault"
    && isSourceReference(value.reference)
    && isSafeLabel(value.safeLabel);
}

function isGeneratedSnapshotSource(value: unknown): value is GeneratedChordContextSnapshot["source"] {
  return isRecord(value)
    && value.kind === "generated"
    && value.safeLabel === "Generated progression";
}

function isPresetSnapshotSource(value: unknown): value is PresetChordContextSnapshot["source"] {
  return isRecord(value)
    && value.kind === "preset"
    && isSafeLogicalIdentifier(value.presetId)
    && isSafeCatalogVersion(value.catalogVersion)
    && isSafePresetLabel(value.safeLabel);
}

function isTonalContext(value: unknown): value is ChordContextSnapshot["tonalContext"] {
  return isRecord(value)
    && isSafeKey(value.key)
    && value.mode === modeFromKey(value.key);
}
function cloneSection(section: VaultChordContextSection): VaultChordContextSection {
  const chords = [...section.chords]
    .sort(compareSnapshotChords)
    .map(cloneChord);
  return Object.freeze({
    id: section.id,
    startBar: section.startBar,
    endBar: section.endBar,
    lengthBeats: section.lengthBeats,
    chords: Object.freeze(chords),
  });
}

function compareSnapshotChords(left: ChordContextSnapshotChord, right: ChordContextSnapshotChord): number {
  return left.startBeat - right.startBeat || left.id.localeCompare(right.id);
}

function cloneChord(chord: ChordContextSnapshotChord): ChordContextSnapshotChord {
  return freezeChord({
    id: chord.id,
    root: chord.root,
    quality: chord.quality,
    tensions: [...chord.tensions],
    ...(chord.bass === undefined ? {} : { bass: chord.bass }),
    label: chord.label,
    startBeat: chord.startBeat,
    durationBeats: chord.durationBeats,
  });
}

function freezeChord(chord: ChordContextSnapshotChord): ChordContextSnapshotChord {
  const canonical: ChordSymbol = {
    root: chord.root,
    quality: chord.quality,
    tensions: [...chord.tensions],
    ...(chord.bass === undefined ? {} : { bass: chord.bass }),
    label: "",
  };
  return Object.freeze({
    id: chord.id,
    root: canonical.root,
    quality: canonical.quality,
    tensions: Object.freeze([...canonical.tensions]),
    ...(canonical.bass === undefined ? {} : { bass: canonical.bass }),
    label: canonicalChordLabel(canonical),
    startBeat: chord.startBeat,
    durationBeats: chord.durationBeats,
  });
}

function canonicalChordLabel(chord: {
  readonly root: number;
  readonly quality: ChordQuality;
  readonly tensions: readonly Tension[];
  readonly bass?: number;
}): string {
  return labelFromSymbol({
    root: chord.root,
    quality: chord.quality,
    tensions: [...chord.tensions],
    ...(chord.bass === undefined ? {} : { bass: chord.bass }),
    label: "",
  });
}

function safeVaultLabel(key: string, section: VaultChordContextSection): string {
  return `${key.trim()} · bars ${section.startBar}-${section.endBar}`;
}

function signatureForSnapshot(content: Omit<ChordContextSnapshot, "signature">): string {
  return `${CHORD_CONTEXT_SNAPSHOT_VERSION}:${stableHash(content)}`;
}

function modeFromKey(key: string): "major" | "minor" | undefined {
  const normalized = key.trim().toLowerCase();
  return normalized.endsWith(" major") ? "major" : normalized.endsWith(" minor") ? "minor" : undefined;
}

function normalizeMeter(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/\s/g, "") : undefined;
}

function isSafeCatalogVersion(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value);
}

function isSafePresetLabel(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9 .–-]{0,80}$/u.test(value);
}

function isSupportedSectionLength(value: number): value is ChordContextSectionLengthBeats {
  return (CHORD_CONTEXT_SECTION_BEATS as readonly number[]).includes(value);
}

function isSafeKey(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-G](?:#|b){0,2} (?:major|minor)$/.test(value.trim());
}

function isSafeLabel(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-G](?:#|b){0,2} (?:major|minor) · bars [1-9]\d*-[1-9]\d*$/.test(value);
}

function isSafeLogicalIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    && !/^[A-Za-z]:/.test(value);
}

function isSupportedBpm(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 30 && value <= 240;
}

function isFourFour(value: unknown): value is { readonly numerator: 4; readonly denominator: 4 } {
  return isRecord(value) && value.numerator === 4 && value.denominator === 4;
}

function isSourceReference(value: unknown): value is VaultChordContextSourceReference {
  return isRecord(value)
    && isSafeLogicalIdentifier(value.ideaId)
    && isSafeLogicalIdentifier(value.blockId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function failure(
  code: VaultChordContextSnapshotErrorCode,
  message: string,
): { readonly ok: false; readonly error: VaultChordContextSnapshotError } {
  return { ok: false, error: { code, message } };
}
