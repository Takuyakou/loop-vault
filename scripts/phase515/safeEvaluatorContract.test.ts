import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPhase47SafeManifest,
  assertVoicingGoldSafeManifest,
  captureFrozenBaselineLock,
  loadFrozenSafeEvaluatorContract,
  readFrozenSuiteMidi,
  readFrozenSuiteSupplementalInput,
  selectFrozenDefinitions,
  type FrozenSafeEvaluatorSuite,
  type SafeEvaluatorFile,
} from "./safeEvaluatorContract";

function partition(
  counts: Record<"dev" | "validation" | "holdout", number>,
): SafeEvaluatorFile[] {
  return Object.entries(counts).flatMap(([split, count]) =>
    Array.from({ length: count }, (_, index) => {
      const id = `${split}-${String(index + 1).padStart(2, "0")}`;
      return {
        fileId: id,
        split,
        path: `midi/${split}/${id}_fixture.mid`,
      };
    }));
}

describe("safe existing-corpus evaluator contracts", () => {
  it("accepts only the exact Phase 4.7 12/12/12 partition", () => {
    const files = partition({ dev: 12, validation: 12, holdout: 12 });
    expect(() => assertPhase47SafeManifest("corpus", files)).not.toThrow();
    expect(() => assertPhase47SafeManifest("corpus", files.slice(1)))
      .toThrow(/exactly 36/);
  });

  it("rejects Phase 4.7 fileId, split, path, and filename inconsistencies", () => {
    const files = partition({ dev: 12, validation: 12, holdout: 12 });
    expect(() => assertPhase47SafeManifest("corpus", [
      { ...files[0]!, fileId: "holdout-01" },
      ...files.slice(1),
    ])).toThrow(/duplicate|fileId\/split/);
    expect(() => assertPhase47SafeManifest("corpus", [
      { ...files[0]!, path: "midi/holdout/dev-01_fixture.mid" },
      ...files.slice(1),
    ])).toThrow(/split\/MIDI path/);
    expect(() => assertPhase47SafeManifest("corpus", [
      { ...files[0]!, path: "midi/dev/not-the-id.mid" },
      ...files.slice(1),
    ])).toThrow(/fileId\/MIDI filename/);
  });

  it("requires exact Voicing Gold split counts and contained split paths", () => {
    const files = partition({ dev: 40, validation: 10, holdout: 10 });
    expect(() => assertVoicingGoldSafeManifest("corpus", files)).not.toThrow();
    expect(() => assertVoicingGoldSafeManifest("corpus", [
      { ...files[0]!, path: "../private.mid" },
      ...files.slice(1),
    ])).toThrow(/escapes|Unsafe/);
    expect(() => assertVoicingGoldSafeManifest("corpus", [
      { ...files[0]!, path: "midi/validation/dev-01_fixture.mid" },
      ...files.slice(1),
    ])).toThrow(/split\/MIDI path/);
  });

  it("requires a parent-supplied fixed frozen contract in standalone safe mode", async () => {
    await expect(loadFrozenSafeEvaluatorContract("repository", [
      "--p515-safe-non-holdout",
    ])).rejects.toThrow(/requires exactly one --p515-frozen-contract/);
  });

  it("rejects a frozen-lock namespace whose bytes do not match the parent digest", async () => {
    const repository = await mkdtemp(resolve(tmpdir(), "p515-safe-lock-"));
    try {
      await mkdir(resolve(repository, "docs/phase5.15"), { recursive: true });
      await writeFile(
        resolve(repository, "docs/phase5.15/00-baseline-lock.json"),
        "{}",
      );
      await expect(loadFrozenSafeEvaluatorContract(repository, [
        "--p515-frozen-contract",
        "docs/phase5.15/00-baseline-lock.json",
        "--p515-frozen-contract-sha256",
        "0".repeat(64),
      ])).rejects.toThrow(/contract hash mismatch/);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it("fails closed when the parent baseline-lock namespace swaps after open", async () => {
    const repository = await mkdtemp(resolve(tmpdir(), "p515-parent-lock-"));
    const lockDirectory = resolve(repository, "docs/phase5.15");
    const lockPath = resolve(lockDirectory, "00-baseline-lock.json");
    const displaced = resolve(lockDirectory, "captured-baseline-lock.json");
    try {
      await mkdir(lockDirectory, { recursive: true });
      await writeFile(lockPath, "{}");
      await expect(captureFrozenBaselineLock(repository, {
        afterHandleOpen: async () => {
          await rename(lockPath, displaced);
          await writeFile(lockPath, "{\"replacement\":true}", { flag: "wx" });
        },
      })).rejects.toThrow(/identity changed|changed during read/);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it("rejects static and post-open namespace swaps before bytes reach Analyzer", async () => {
    const repository = await mkdtemp(resolve(tmpdir(), "p515-safe-evaluator-"));
    const corpus = resolve(repository, "corpus");
    const midiRoot = resolve(corpus, "midi/dev");
    await mkdir(midiRoot, { recursive: true });
    const midiPath = resolve(midiRoot, "dev-01.mid");
    const safeBytes = Buffer.from("reviewed-dev-midi");
    const holdoutBytes = Buffer.from("private-holdout-midi");
    await writeFile(midiPath, safeBytes);
    const suite = {
      id: "phase4.7-development",
      selection: "manifest files where split=dev",
      repositoryLocation: "corpus/manifest.json",
      manifestSha256: "0".repeat(64),
      selectionSha256: "1".repeat(64),
      contentSha256: "2".repeat(64),
      fileCount: 1,
      files: [{
        path: "midi/dev/dev-01.mid",
        sha256: createHash("sha256").update(safeBytes).digest("hex"),
        byteLength: safeBytes.byteLength,
      }],
      supplementalInputs: [],
    } satisfies FrozenSafeEvaluatorSuite;
    try {
      await expect(readFrozenSuiteMidi(
        repository,
        corpus,
        suite,
        suite.files[0]!.path,
      )).resolves.toEqual(safeBytes);

      // Simulates a namespace swap after the parent verified the lock and
      // before the child opens the reviewed dev pathname.
      await writeFile(midiPath, holdoutBytes);
      await expect(readFrozenSuiteMidi(
        repository,
        corpus,
        suite,
        suite.files[0]!.path,
      )).rejects.toThrow(/content mismatch before Analyzer/);

      await writeFile(midiPath, safeBytes);
      let analyzerCalled = false;
      const displaced = resolve(midiRoot, "captured-dev.mid");
      await expect((async () => {
        const captured = await readFrozenSuiteMidi(
          repository,
          corpus,
          suite,
          suite.files[0]!.path,
          {
            afterHandleOpen: async () => {
              await rename(midiPath, displaced);
              await writeFile(midiPath, holdoutBytes, { flag: "wx" });
            },
          },
        );
        analyzerCalled = true;
        return captured;
      })()).rejects.toThrow(/identity changed|changed during read/);
      expect(analyzerCalled).toBe(false);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it("uses exactly the frozen ordered selection and rejects extra manifest rows", () => {
    const suite = {
      id: "phase4.7-development",
      selection: "dev",
      repositoryLocation: "corpus/manifest.json",
      manifestSha256: "0".repeat(64),
      selectionSha256: "1".repeat(64),
      contentSha256: "2".repeat(64),
      fileCount: 1,
      files: [{
        path: "midi/dev/a.mid",
        sha256: "3".repeat(64),
        byteLength: 1,
      }],
      supplementalInputs: [],
    } satisfies FrozenSafeEvaluatorSuite;
    expect(selectFrozenDefinitions(
      suite,
      [{ path: "midi/dev/a.mid" }],
      (row) => row.path,
    )).toEqual([{ path: "midi/dev/a.mid" }]);
    expect(() => selectFrozenDefinitions(
      suite,
      [{ path: "midi/dev/a.mid" }, { path: "midi/holdout/private.mid" }],
      (row) => row.path,
    )).toThrow(/outside the frozen selection/);
  });

  it("reads the frozen Voicing supplemental input through the verified handle", async () => {
    const repository = await mkdtemp(resolve(tmpdir(), "p515-safe-supplement-"));
    const corpus = resolve(repository, "corpus");
    const notePath = resolve(corpus, "note-events.jsonl");
    const reviewed = Buffer.from('{"fileId":"dev-01"}\n');
    const replacement = Buffer.from('{"fileId":"holdout-01"}\n');
    try {
      await mkdir(corpus, { recursive: true });
      await writeFile(notePath, reviewed);
      const suite = {
        id: "voicing-gold-development",
        selection: "manifest files where split=dev",
        repositoryLocation: "corpus/manifest.json",
        manifestSha256: "0".repeat(64),
        selectionSha256: "1".repeat(64),
        contentSha256: "2".repeat(64),
        fileCount: 1,
        files: [{ path: "midi/dev/a.mid", sha256: "3".repeat(64), byteLength: 1 }],
        supplementalInputs: [{
          path: "note-events.jsonl",
          sha256: createHash("sha256").update(reviewed).digest("hex"),
          byteLength: reviewed.byteLength,
          selectionAssociation: "rows-filtered-to-frozen-midi-selection",
        }],
      } satisfies FrozenSafeEvaluatorSuite;
      await expect(readFrozenSuiteSupplementalInput(
        repository,
        corpus,
        suite,
        "note-events.jsonl",
      )).resolves.toEqual(reviewed);

      const displaced = resolve(corpus, "captured-note-events.jsonl");
      await expect(readFrozenSuiteSupplementalInput(
        repository,
        corpus,
        suite,
        "note-events.jsonl",
        {
          afterHandleOpen: async () => {
            await rename(notePath, displaced);
            await writeFile(notePath, replacement, { flag: "wx" });
          },
        },
      )).rejects.toThrow(/identity changed|changed during read/);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });
});
