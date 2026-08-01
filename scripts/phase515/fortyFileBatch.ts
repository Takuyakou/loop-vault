import { access } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import { compareCodePoints } from "./corpusContract";
import {
  assertRealCorpusRootWithinRepository,
  readFileExistingWithinRoot,
} from "./safePath";

export async function evaluateFortyFileBatch(
  repositoryRoot: string,
  analyze: (bytes: Uint8Array) => unknown = (bytes) => analyzeMidi(bytes),
) {
  const corpusRoot = resolve(
    repositoryRoot,
    "test/loop-vault-voicing-gold-corpus-v1",
  );
  const manifestPath = resolve(corpusRoot, "manifest.json");
  if (!await exists(manifestPath)) {
    return skipped("private/ignored Voicing Gold corpus is not present");
  }
  await assertRealCorpusRootWithinRepository(repositoryRoot, corpusRoot);
  const manifest = JSON.parse(
    (await readFileExistingWithinRoot(corpusRoot, "manifest.json"))
      .toString("utf8"),
  ) as { files?: Array<{ split?: string; path?: string }> };
  const files = (manifest.files ?? [])
    .filter((item): item is { split?: string; path: string } =>
      item.split === "dev" && typeof item.path === "string")
    .sort((left, right) => compareCodePoints(left.path, right.path));
  if (files.length === 0) {
    return skipped("Voicing Gold manifest has no development files");
  }
  if (files.length !== 40) {
    return skipped("Voicing Gold development MIDI is incomplete");
  }
  if (
    new Set(files.map((item) => item.path)).size !== files.length
    || files.some((item) =>
      !item.path.replaceAll("\\", "/").startsWith("midi/dev/"))
  ) {
    throw new Error(
      "Voicing Gold development manifest contains a split/path substitution.",
    );
  }

  const runtimes: number[] = [];
  const started = performance.now();
  for (const item of files) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFileExistingWithinRoot(
        corpusRoot,
        item.path,
      ));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
        return skipped("Voicing Gold development MIDI is incomplete");
      }
      throw cause;
    }
    const fileStarted = performance.now();
    analyze(bytes);
    runtimes.push(performance.now() - fileStarted);
  }
  return {
    status: "COMPLETED" as const,
    corpus: "Voicing Gold development split",
    requested: 40,
    completed: files.length,
    totalMs: rounded(performance.now() - started),
    perFileMs: summarize(runtimes),
  };
}

function skipped(reason: string) {
  return {
    status: "SKIPPED" as const,
    reason,
    corpus: "Voicing Gold development split",
    requested: 40,
    completed: null,
  };
}

function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

function summarize(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: values.length,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: rounded(sorted.at(-1) ?? 0),
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return rounded(sorted[index] ?? 0);
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
