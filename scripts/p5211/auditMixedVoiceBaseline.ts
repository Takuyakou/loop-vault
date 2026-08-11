import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { parseMidi } from "../../src/domain/midi/parser";
import type { NormalizedTimedNote, VoiceRole } from "../../src/domain/midi/types";
import {
  analyzeMidiVoiceAwareRerank,
  buildVoiceAwareRoleContext,
} from "../../src/domain/midi/voiceAwareReranker";
import { buildVoices, voiceId } from "../../src/domain/midi/voices";

interface LocalRegistry {
  readonly schemaVersion: 1;
  readonly kind: "p5211-local-real-fixture-registry";
  readonly fixtures: readonly [{
    readonly id: "p5211-real-001";
    readonly relativePath: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly groundTruth: "human-unconfirmed";
  }];
}

export interface P5211MixedVoiceTopology {
  readonly normalizedNoteCount: number;
  readonly voiceCount: number;
  readonly enabledVoiceCount: number;
  readonly sourceTrackCount: number;
  readonly channelTenVoiceCount: number;
  readonly maximumVoicePolyphony: number;
  readonly mixedTextureVoiceCount: number;
  readonly shortTopOverlayCandidateCount: number;
  readonly failureTopologyVerified: boolean;
  readonly roleCounts: Readonly<Partial<Record<VoiceRole, number>>>;
}

export interface P5211LocalHarmonicCoreBaseline {
  readonly schemaVersion: 1;
  readonly kind: "p5211-current-harmonic-core-local-baseline";
  readonly codeCandidateCommit: string;
  readonly fixtureId: "p5211-real-001";
  readonly inputIntegrityVerified: boolean;
  readonly deterministic: boolean;
  readonly topology: P5211MixedVoiceTopology;
  readonly analysis: {
    readonly timelineEventCount: number;
    readonly blockCandidateCount: number;
    readonly outputFingerprintSha256: string;
  };
  readonly privacy: {
    readonly rawNotesPersisted: false;
    readonly sourcePathPersisted: false;
    readonly sourceTitlePersisted: false;
  };
}

export async function auditP5211LocalHarmonicCoreBaseline(
  registryPath = resolve(".local-evaluation/p5211/registry.json"),
  outputPath = resolve(".local-evaluation/p5211/baseline/current-harmonic-core.json"),
): Promise<P5211LocalHarmonicCoreBaseline> {
  const registry = parseLocalRegistry(JSON.parse(await readFile(registryPath, "utf8")));
  const entry = registry.fixtures[0];
  const fixturePath = resolve(dirname(registryPath), entry.relativePath);
  if (!isPathWithin(dirname(registryPath), fixturePath)) throw new Error("local registry path is invalid");
  const bytes = new Uint8Array(await readFile(fixturePath));
  const integrity = sha256(bytes) === entry.sha256 && bytes.byteLength === entry.bytes;
  if (!integrity) throw new Error("local fixture integrity check failed");
  const codeCandidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const first = buildBaseline(bytes, codeCandidateCommit);
  const second = buildBaseline(bytes, codeCandidateCommit);
  const artifact: P5211LocalHarmonicCoreBaseline = {
    ...first,
    inputIntegrityVerified: true,
    deterministic: first.analysis.outputFingerprintSha256 === second.analysis.outputFingerprintSha256
      && JSON.stringify(first.topology) === JSON.stringify(second.topology),
  };
  if (!artifact.deterministic) throw new Error("local Harmonic Core baseline is not deterministic");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(outputPath.replace(/\.json$/u, ".md"), renderPrivacySafeBaselineMarkdown(artifact), "utf8");
  return artifact;
}

export function summarizeMixedVoiceTopology(
  notes: readonly NormalizedTimedNote[],
): Omit<P5211MixedVoiceTopology, "enabledVoiceCount" | "sourceTrackCount" | "channelTenVoiceCount" | "roleCounts"> {
  const grouped = new Map<string, NormalizedTimedNote[]>();
  for (const note of notes) {
    if (note.channel === undefined || note.channel === 9) continue;
    const id = voiceId(note.trackIndex, note.channel);
    grouped.set(id, [...(grouped.get(id) ?? []), note]);
  }
  let maximumVoicePolyphony = 0;
  let mixedTextureVoiceCount = 0;
  let shortTopOverlayCandidateCount = 0;
  for (const voiceNotes of grouped.values()) {
    maximumVoicePolyphony = Math.max(maximumVoicePolyphony, maximumPolyphony(voiceNotes));
    let voiceCandidates = 0;
    for (const candidate of voiceNotes) {
      const lower = voiceNotes.filter((note) => note.pitch < candidate.pitch
        && note.sustainedEndBeat > candidate.startBeat
        && note.startBeat < candidate.sustainedEndBeat);
      if (lower.length < 2) continue;
      const candidateDuration = candidate.sustainedEndBeat - candidate.startBeat;
      const lowerDurations = lower.map((note) => note.sustainedEndBeat - note.startBeat)
        .sort((left, right) => left - right);
      const medianLowerDuration = lowerDurations[Math.floor(lowerDurations.length / 2)] ?? 0;
      const coverage = supportCoverage(candidate, lower, 2);
      if (coverage >= 0.5 && candidateDuration <= medianLowerDuration * 0.6) voiceCandidates += 1;
    }
    if (voiceCandidates > 0) mixedTextureVoiceCount += 1;
    shortTopOverlayCandidateCount += voiceCandidates;
  }
  return {
    normalizedNoteCount: notes.length,
    voiceCount: grouped.size,
    maximumVoicePolyphony,
    mixedTextureVoiceCount,
    shortTopOverlayCandidateCount,
    failureTopologyVerified: mixedTextureVoiceCount > 0 && shortTopOverlayCandidateCount > 0,
  };
}

export function renderPrivacySafeBaselineMarkdown(artifact: P5211LocalHarmonicCoreBaseline): string {
  return [
    "# P5.21.1 Local Harmonic Core Baseline",
    "",
    `- Fixture: ${artifact.fixtureId} (anonymous, ignored local input)`,
    `- Candidate: ${artifact.codeCandidateCommit}`,
    `- Integrity verified: ${artifact.inputIntegrityVerified}`,
    `- Deterministic: ${artifact.deterministic}`,
    `- Failure topology verified: ${artifact.topology.failureTopologyVerified}`,
    `- Voices: ${artifact.topology.voiceCount}; enabled: ${artifact.topology.enabledVoiceCount}`,
    `- Mixed-texture voices: ${artifact.topology.mixedTextureVoiceCount}`,
    `- Short top-overlay candidates: ${artifact.topology.shortTopOverlayCandidateCount}`,
    `- Timeline events: ${artifact.analysis.timelineEventCount}; block candidates: ${artifact.analysis.blockCandidateCount}`,
    "- Raw notes, source paths, and source titles are omitted.",
    "",
  ].join("\n");
}

export function parseLocalRegistry(value: unknown): LocalRegistry {
  if (!value || typeof value !== "object") throw new Error("local registry schema is invalid");
  const candidate = value as Partial<LocalRegistry>;
  const fixture = candidate.fixtures?.[0];
  if (candidate.schemaVersion !== 1
    || candidate.kind !== "p5211-local-real-fixture-registry"
    || candidate.fixtures?.length !== 1
    || fixture?.id !== "p5211-real-001"
    || fixture.groundTruth !== "human-unconfirmed"
    || typeof fixture.relativePath !== "string"
    || !/^fixtures\/[a-z0-9-]+\.mid$/u.test(fixture.relativePath)
    || typeof fixture.sha256 !== "string"
    || !/^[a-f0-9]{64}$/u.test(fixture.sha256)
    || !Number.isSafeInteger(fixture.bytes)
    || fixture.bytes <= 0) {
    throw new Error("local registry schema is invalid");
  }
  return candidate as LocalRegistry;
}

function buildBaseline(bytes: Uint8Array, codeCandidateCommit: string): P5211LocalHarmonicCoreBaseline {
  const data = parseMidi(bytes);
  const normalized = normalizeNotes(data);
  const builtVoices = buildVoices(data);
  const standardContext = buildVoiceAwareRoleContext(builtVoices, normalized);
  const analysisInput = {
    ...standardContext.analysisInput,
    voiceContributionPreset: "harmonic-core" as const,
  };
  const context = buildVoiceAwareRoleContext(builtVoices, normalized, analysisInput);
  const analysis = analyzeMidiVoiceAwareRerank(bytes, {}, { analysisInput: context.analysisInput });
  const topology = summarizeMixedVoiceTopology(normalized);
  const roleCounts: Partial<Record<VoiceRole, number>> = {};
  for (const voice of context.annotatedVoices) {
    roleCounts[voice.inferredRole] = (roleCounts[voice.inferredRole] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    kind: "p5211-current-harmonic-core-local-baseline",
    codeCandidateCommit,
    fixtureId: "p5211-real-001",
    inputIntegrityVerified: false,
    deterministic: false,
    topology: {
      ...topology,
      enabledVoiceCount: context.analysisInput.enabledVoiceIds.length,
      sourceTrackCount: data.tracks.length,
      channelTenVoiceCount: context.annotatedVoices.filter((voice) => voice.channel === 9).length,
      roleCounts,
    },
    analysis: {
      timelineEventCount: analysis.fullTimeline.length,
      blockCandidateCount: analysis.blockCandidates.length,
      outputFingerprintSha256: sha256(new TextEncoder().encode(JSON.stringify(analysis))),
    },
    privacy: {
      rawNotesPersisted: false,
      sourcePathPersisted: false,
      sourceTitlePersisted: false,
    },
  };
}

function supportCoverage(
  candidate: NormalizedTimedNote,
  lower: readonly NormalizedTimedNote[],
  requiredSupport: number,
): number {
  const start = candidate.startBeat;
  const end = candidate.sustainedEndBeat;
  const duration = end - start;
  if (!(duration > 0)) return 0;
  const events = lower.flatMap((note) => {
    const overlapStart = Math.max(start, note.startBeat);
    const overlapEnd = Math.min(end, note.sustainedEndBeat);
    return overlapEnd > overlapStart
      ? [{ beat: overlapStart, delta: 1 }, { beat: overlapEnd, delta: -1 }]
      : [];
  }).sort((left, right) => left.beat - right.beat || left.delta - right.delta);
  let active = 0;
  let previous = start;
  let covered = 0;
  for (const event of events) {
    if (active >= requiredSupport) covered += event.beat - previous;
    active += event.delta;
    previous = event.beat;
  }
  if (active >= requiredSupport) covered += end - previous;
  return covered / duration;
}

function maximumPolyphony(notes: readonly NormalizedTimedNote[]): number {
  const events = notes.flatMap((note) => [
    { beat: note.startBeat, delta: 1 },
    { beat: note.sustainedEndBeat, delta: -1 },
  ]).sort((left, right) => left.beat - right.beat || left.delta - right.delta);
  let active = 0;
  let maximum = 0;
  for (const event of events) {
    active += event.delta;
    maximum = Math.max(maximum, active);
  }
  return maximum;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPathWithin(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath !== "" && !relativePath.startsWith("..") && !resolve(relativePath).startsWith("\\");
}
