import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { compareCodePoints, sha256 } from "./corpusContract";
import {
  readFileExistingWithinRoot,
  safeResolveExistingWithinRoot,
  safeResolveWithinRoot,
} from "./safePath";

export interface FrozenExternalSuite {
  id: string;
  selection: string;
  repositoryLocation: string;
  manifestSha256: string | null;
  selectionSha256: string;
  contentSha256: string;
  fileCount: number;
  files: Array<{ path: string; sha256: string; byteLength: number }>;
  supplementalInputs: FrozenExternalSuiteSupplementalInput[];
}

export interface FrozenExternalSuiteSupplementalInput {
  path: string;
  sha256: string;
  byteLength: number;
  selectionAssociation: "rows-filtered-to-frozen-midi-selection";
}

export interface ExternalSuiteStatus {
  id: string;
  repositoryLocation: string;
  status: "VERIFIED" | "SKIPPED";
  exists: boolean;
  frozenFingerprint: FrozenExternalSuite;
}

interface Selection {
  path: string;
  expectedSha256?: string;
}

const SUITES = [
  {
    id: "chord-drip-100",
    sourcePath: "docs/loop-vault-evaluation-corpus/manifest.json",
    selection: "all 100 manifest files",
    select: (manifest: unknown): Selection[] => {
      const files = (manifest as {
        files?: Array<{ midiFile?: string; midiSha256?: string }>;
      }).files;
      return (files ?? []).map((item) => ({
        path: item.midiFile ?? "",
        expectedSha256: item.midiSha256,
      }));
    },
  },
  {
    id: "voicing-gold-development",
    sourcePath: "test/loop-vault-voicing-gold-corpus-v1/manifest.json",
    selection: "manifest files where split=dev",
    supplementalInputs: ["note-events.jsonl"],
    select: (manifest: unknown): Selection[] => {
      const files = (manifest as { files?: Array<{ path: string; sha256?: string; split?: string }> }).files;
      return (files ?? []).filter((item) => item.split === "dev")
        .map((item) => ({ path: item.path, expectedSha256: item.sha256 }));
    },
  },
  {
    id: "voicing-gold-40-file-selection",
    sourcePath: "test/loop-vault-voicing-gold-corpus-v1/manifest.json",
    selection: "frozen 40-file development selection",
    supplementalInputs: ["note-events.jsonl"],
    select: (manifest: unknown): Selection[] => {
      const files = (manifest as { files?: Array<{ path: string; sha256?: string; split?: string }> }).files;
      return (files ?? []).filter((item) => item.split === "dev").slice(0, 40)
        .map((item) => ({ path: item.path, expectedSha256: item.sha256 }));
    },
  },
  {
    id: "voicing-gold-validation",
    sourcePath: "test/loop-vault-voicing-gold-corpus-v1/manifest.json",
    selection: "manifest files where split=validation",
    supplementalInputs: ["note-events.jsonl"],
    select: (manifest: unknown): Selection[] => {
      const files = (manifest as { files?: Array<{ path: string; sha256?: string; split?: string }> }).files;
      return (files ?? []).filter((item) => item.split === "validation")
        .map((item) => ({ path: item.path, expectedSha256: item.sha256 }));
    },
  },
  {
    id: "voicing-gold-burned-holdout-diagnostic-only",
    sourcePath: "test/loop-vault-voicing-gold-corpus-v1/manifest.json",
    selection: "manifest files where split=holdout; burned diagnostic-only, never fresh",
    select: (manifest: unknown): Selection[] => {
      const files = (manifest as { files?: Array<{ path: string; sha256?: string; split?: string }> }).files;
      return (files ?? []).filter((item) => item.split === "holdout")
        .map((item) => ({ path: item.path, expectedSha256: item.sha256 }));
    },
  },
  {
    id: "chapter3",
    sourcePath: ".local-evaluation/chapter3-seed/manifest.json",
    fallbackPath: "test/loop-vault-chapter3-seed/manifest.json",
    selection: "all manifest cases",
    select: (manifest: unknown): Selection[] => {
      const cases = (manifest as { cases?: Array<{ midiPath: string; sha256?: string }> }).cases;
      return (cases ?? []).map((item) => ({
        path: item.midiPath,
        expectedSha256: item.sha256,
      }));
    },
  },
  {
    id: "phase4.7-development",
    sourcePath: ".local-evaluation/loop-vault-bass-companion-identity-gold-v1/manifest.json",
    selection: "manifest files where split=dev",
    select: (manifest: unknown): Selection[] => {
      const files = (manifest as { files?: Array<{ path: string; sha256?: string; split?: string }> }).files;
      return (files ?? []).filter((item) => item.split === "dev")
        .map((item) => ({ path: item.path, expectedSha256: item.sha256 }));
    },
  },
  {
    id: "phase4.7-validation",
    sourcePath: ".local-evaluation/loop-vault-bass-companion-identity-gold-v1/manifest.json",
    selection: "manifest files where split=validation",
    select: (manifest: unknown): Selection[] => {
      const files = (manifest as { files?: Array<{ path: string; sha256?: string; split?: string }> }).files;
      return (files ?? []).filter((item) => item.split === "validation")
        .map((item) => ({ path: item.path, expectedSha256: item.sha256 }));
    },
  },
] as const;

const SINGLE_FILES = [
  {
    id: "suran",
    sourcePath: ".local-evaluation/phase4.1/fixtures/suran-remix.mid",
  },
  {
    id: "endless",
    sourcePath: ".local-evaluation/phase4.1.1/fixtures/endless.mid",
  },
  {
    id: "all-instruments",
    sourcePath: ".local-evaluation/midi/all_instruments.mid",
  },
] as const;

export async function freezeAvailableExternalSuites(
  repositoryRoot: string,
): Promise<FrozenExternalSuite[]> {
  const suites: FrozenExternalSuite[] = [];
  for (const descriptor of SUITES) {
    const primaryBytes = await trySafeRead(repositoryRoot, descriptor.sourcePath);
    const fallbackPath = "fallbackPath" in descriptor
      ? descriptor.fallbackPath
      : undefined;
    const fallbackBytes = !primaryBytes && fallbackPath
      ? await trySafeRead(repositoryRoot, fallbackPath)
      : undefined;
    const repositoryManifestPath = primaryBytes
      ? descriptor.sourcePath
      : fallbackBytes && fallbackPath
        ? fallbackPath
        : undefined;
    const manifestBytes = primaryBytes ?? fallbackBytes;
    if (!repositoryManifestPath || !manifestBytes) continue;
    const manifest: unknown = JSON.parse(new TextDecoder().decode(manifestBytes));
    const manifestRoot = resolve(repositoryRoot, repositoryManifestPath, "..");
    const fingerprint = await fingerprintSelection(
      repositoryRoot,
      descriptor.id,
      descriptor.selection,
      descriptor.sourcePath,
      sha256(manifestBytes),
      manifestRoot,
      descriptor.select(manifest),
      "supplementalInputs" in descriptor
        ? descriptor.supplementalInputs
        : [],
    );
    if (fingerprint) suites.push(fingerprint);
  }
  for (const descriptor of SINGLE_FILES) {
    const safeBytes = await trySafeRead(repositoryRoot, descriptor.sourcePath);
    if (!safeBytes) continue;
    const bytes = new Uint8Array(safeBytes);
    suites.push({
      id: descriptor.id,
      selection: "single runtime fixture",
      repositoryLocation: descriptor.sourcePath,
      manifestSha256: null,
      selectionSha256: sha256(descriptor.sourcePath),
      contentSha256: sha256(bytes),
      fileCount: 1,
      files: [{
        path: descriptor.sourcePath,
        sha256: sha256(bytes),
        byteLength: bytes.byteLength,
      }],
      supplementalInputs: [],
    });
  }
  return suites.sort((left, right) => compareCodePoints(left.id, right.id));
}

export async function verifyFrozenExternalSuites(
  repositoryRoot: string,
  frozen: readonly FrozenExternalSuite[],
): Promise<ExternalSuiteStatus[]> {
  const current = await freezeAvailableExternalSuites(repositoryRoot);
  const byId = new Map(current.map((item) => [item.id, item]));
  return frozen.map((locked) => {
    const actual = byId.get(locked.id);
    if (!actual) {
      return {
        id: locked.id,
        repositoryLocation: locked.repositoryLocation,
        status: "SKIPPED" as const,
        exists: false,
        frozenFingerprint: locked,
      };
    }
    if (stableJson(actual) !== stableJson(locked)) {
      throw new Error(`External suite fingerprint drift: ${locked.id}.`);
    }
    return {
      id: locked.id,
      repositoryLocation: locked.repositoryLocation,
      status: "VERIFIED" as const,
      exists: true,
      frozenFingerprint: locked,
    };
  });
}

async function fingerprintSelection(
  repositoryRoot: string,
  id: string,
  selection: string,
  repositoryLocation: string,
  manifestSha256: string,
  root: string,
  selected: readonly Selection[],
  supplementalInputPaths: readonly string[] = [],
): Promise<FrozenExternalSuite | null> {
  const ordered = [...selected].sort((left, right) =>
    compareCodePoints(left.path, right.path));
  if (ordered.length === 0) {
    throw new Error(`External suite selection is empty: ${id}.`);
  }
  const selectedRepositoryPaths = ordered.map((item) => {
    const lexical = safeResolveWithinRoot(root, item.path);
    const repositoryRelative = relative(resolve(repositoryRoot), lexical);
    safeResolveWithinRoot(repositoryRoot, repositoryRelative);
    return repositoryRelative;
  });
  const selectedBytes = await Promise.all(selectedRepositoryPaths.map((path) =>
    trySafeRead(repositoryRoot, path)));
  const presentCount = selectedBytes.filter(Boolean).length;
  if (presentCount === 0) return null;
  if (presentCount !== ordered.length) {
    throw new Error(`External suite is partially present: ${id}.`);
  }
  const content = createHash("sha256");
  const files = [];
  for (const [index, item] of ordered.entries()) {
    const repositoryPath = selectedRepositoryPaths[index]!;
    // Resolve again immediately before the handle-based read. This makes a
    // manifest-path swap fail closed rather than trusting the earlier probe.
    await safeResolveExistingWithinRoot(repositoryRoot, repositoryPath);
    const bytes = new Uint8Array(
      await readFileExistingWithinRoot(repositoryRoot, repositoryPath),
    );
    const actualSha256 = sha256(bytes);
    if (item.expectedSha256 && item.expectedSha256 !== actualSha256) {
      throw new Error(`External suite manifest/content drift: ${id}/${item.path}.`);
    }
    content.update(item.path);
    content.update("\0");
    content.update(bytes);
    content.update("\0");
    files.push({
      path: item.path,
      sha256: actualSha256,
      byteLength: bytes.byteLength,
    });
  }
  const supplementalInputs: FrozenExternalSuiteSupplementalInput[] = [];
  for (const path of supplementalInputPaths) {
    const lexical = safeResolveWithinRoot(root, path);
    const repositoryPath = relative(resolve(repositoryRoot), lexical);
    safeResolveWithinRoot(repositoryRoot, repositoryPath);
    const bytes = new Uint8Array(
      await readFileExistingWithinRoot(repositoryRoot, repositoryPath),
    );
    const digest = sha256(bytes);
    content.update("supplemental\0");
    content.update(path);
    content.update("\0");
    content.update(bytes);
    content.update("\0");
    supplementalInputs.push({
      path,
      sha256: digest,
      byteLength: bytes.byteLength,
      selectionAssociation: "rows-filtered-to-frozen-midi-selection",
    });
  }
  return {
    id,
    selection,
    repositoryLocation,
    manifestSha256,
    selectionSha256: sha256(stableJson(ordered)),
    contentSha256: content.digest("hex"),
    fileCount: files.length,
    files,
    supplementalInputs,
  };
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

async function trySafeRead(
  repositoryRoot: string,
  repositoryPath: string,
): Promise<Buffer | undefined> {
  try {
    return await readFileExistingWithinRoot(repositoryRoot, repositoryPath);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
}
