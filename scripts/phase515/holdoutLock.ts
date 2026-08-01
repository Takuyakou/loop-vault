import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { makeChordSymbol } from "../../src/domain/chords";
import { buildProgressionMidi } from "../../src/domain/midiExport";
import type {
  ChordQuality,
  SavedProgressionBlock,
} from "../../src/domain/types";
import { compareCodePoints, sha256 } from "./corpusContract";
import {
  assertRealCorpusRootWithinRepository,
  readFileExistingWithinRoot,
} from "./safePath";

export async function computeHoldoutLock(root: string) {
  const corpusRoot = resolve(
    root,
    ".local-evaluation/loop-vault-bass-companion-identity-gold-v1",
  );
  await assertRealCorpusRootWithinRepository(root, corpusRoot);
  const manifestBytes = await readFileExistingWithinRoot(
    corpusRoot,
    "manifest.json",
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    files: Array<{
      fileId?: string;
      path: string;
      split: string;
      sha256: string;
    }>;
  };
  assertPhase47ManifestPartitionIntegrity(manifest.files);
  const selected = manifest.files.filter((item) => item.split === "holdout")
    .map((item) => ({ path: item.path, sha256: item.sha256 }))
    .sort((left, right) => compareCodePoints(left.path, right.path));
  const contentHash = createHash("sha256");
  const lockedFiles = [];
  for (const item of selected) {
    const bytes = new Uint8Array(await readFileExistingWithinRoot(
      corpusRoot,
      item.path,
    ));
    const manifestEntry = manifest.files.find((entry) => entry.path === item.path)!;
    contentHash.update(item.path);
    contentHash.update("\0");
    contentHash.update(bytes);
    contentHash.update("\0");
    lockedFiles.push({
      path: item.path,
      expectedManifestFieldsSha256: sha256(stableJson(manifestEntry)),
      expectedSha256: item.sha256,
      actualSha256: sha256(bytes),
      actualByteLength: bytes.byteLength,
      matchesManifest: sha256(bytes) === item.sha256,
    });
  }
  return {
    phase47FreshHoldout: {
      sourceManifestSha256: sha256(new Uint8Array(manifestBytes)),
      caseCount: selected.length,
      selectionSha256: sha256(stableJson(selected)),
      expectedManifestFieldsSha256: sha256(stableJson(
        selected.map((item) =>
          manifest.files.find((entry) => entry.path === item.path)!),
      )),
      midiContentSha256: contentHash.digest("hex"),
      files: lockedFiles,
      resultOpened: false,
    },
    phase514RoundTripSubset: await computeRoundTripSubset(root),
    excluded: {
      voicingGoldHoldout: "burned by prior diagnostics",
      userRealMidi: "explicitly excluded",
    },
  };
}

export function assertPhase47ManifestPartitionIntegrity(
  files: Array<{
    fileId?: string;
    path: string;
    split: string;
    sha256: string;
  }>,
): void {
  if (!Array.isArray(files) || files.length !== 36) {
    throw new Error("Phase 4.7 manifest must contain the frozen 36-file partition.");
  }
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const counts = new Map<string, number>();
  for (const item of files) {
    if (
      typeof item.fileId !== "string"
      || !["dev", "validation", "holdout"].includes(item.split)
      || typeof item.path !== "string"
      || typeof item.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(item.sha256)
    ) {
      throw new Error("Malformed Phase 4.7 manifest partition entry.");
    }
    const normalized = item.path.replaceAll("\\", "/");
    if (
      !normalized.startsWith(`midi/${item.split}/`)
      || !item.fileId.startsWith(`${item.split}-`)
    ) {
      throw new Error("Phase 4.7 split/path substitution detected.");
    }
    if (seenIds.has(item.fileId) || seenPaths.has(normalized)) {
      throw new Error("Duplicate Phase 4.7 manifest identity/path.");
    }
    seenIds.add(item.fileId);
    seenPaths.add(normalized);
    counts.set(item.split, (counts.get(item.split) ?? 0) + 1);
  }
  for (const split of ["dev", "validation", "holdout"]) {
    if (counts.get(split) !== 12) {
      throw new Error(`Phase 4.7 ${split} partition must contain exactly 12 files.`);
    }
  }
}

export async function verifyFrozenHoldout(
  root: string,
  frozen: Awaited<ReturnType<typeof computeHoldoutLock>>,
) {
  const manifestPath = resolve(
    root,
    ".local-evaluation/loop-vault-bass-companion-identity-gold-v1/manifest.json",
  );
  const available = await access(manifestPath).then(() => true, () => false);
  if (available) {
    const recomputed = await computeHoldoutLock(root);
    assertFrozenHoldoutMatches(frozen, recomputed, "Frozen");
    return {
      phase47FreshHoldout: "VERIFIED",
      phase514RoundTripSubset: "VERIFIED",
      lockedHashesPreserved: true,
    } as const;
  }

  const roundTrip = await computeRoundTripSubset(root);
  assertFrozenHoldoutMatches(
    frozen.phase514RoundTripSubset,
    roundTrip,
    "Phase 5.14 round-trip subset",
  );
  return {
    phase47FreshHoldout:
      "SKIPPED (private/ignored Holdout unavailable; frozen hashes retained for P5.15-06)",
    phase514RoundTripSubset: "VERIFIED",
    lockedHashesPreserved: true,
  } as const;
}

export function assertFrozenHoldoutMatches(
  frozen: unknown,
  recomputed: unknown,
  label: string,
) {
  if (stableJson(frozen) !== stableJson(recomputed)) {
    throw new Error(`${label} Holdout lock mismatch.`);
  }
}

export function stableJson(value: unknown): string {
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

async function computeRoundTripSubset(root: string) {
  const roundTripIndices = [2, 7, 12, 17];
  const qualities: readonly ChordQuality[] = [
    "maj", "min", "dim", "aug", "maj7", "min7", "dom7", "min7b5", "dim7",
    "maj9", "min9", "dom9", "min11", "dom13", "sus2", "sus4", "dom7sus4",
    "add9", "six", "min6", "sixNine",
  ];
  const selection = roundTripIndices.map((index) => ({
    index,
    quality: qualities[index]!,
    expected: makeChordSymbol((index * 5) % 12, qualities[index]!).label,
  }));
  const chords = selection.map((item) =>
    makeChordSymbol((item.index * 5) % 12, item.quality));
  const block: SavedProgressionBlock = {
    id: "phase5.14-round-trip",
    summaryText: "Synthetic round trip",
    chords: chords.map((chord, index) => ({
      eventId: `event-${index + 1}`,
      bar: index + 1,
      beat: 1,
      durationBeats: 4,
      chord,
      confidence: 1,
      alternatives: [],
      warnings: [],
    })),
    bpm: 120,
    timeSignature: "4/4",
    tags: [],
    capturedAt: "2026-07-30T00:00:00.000Z",
    analyzerVersion: "synthetic",
  };
  const selectedExport = buildProgressionMidi(block);
  return {
    selectionSize: roundTripIndices.length,
    selectionSha256: sha256(stableJson(selection)),
    exportedMidiSha256: sha256(selectedExport.bytes),
    exportedMidiByteLength: selectedExport.bytes.byteLength,
    exporterSourceSha256: sha256(new Uint8Array(await readFile(
      resolve(root, "src/domain/midiExport/build.ts"),
    ))),
    resultOpened: false,
  };
}
