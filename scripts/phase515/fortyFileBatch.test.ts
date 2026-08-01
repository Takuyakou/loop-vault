import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateFortyFileBatch } from "./fortyFileBatch";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

async function repositoryWithManifest(files: unknown[]) {
  const root = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-forty-"));
  roots.push(root);
  const corpus = resolve(root, "test/loop-vault-voicing-gold-corpus-v1");
  await mkdir(corpus, { recursive: true });
  await writeFile(resolve(corpus, "manifest.json"), JSON.stringify({ files }));
  return root;
}

describe("P5.15 40-file runtime batch", () => {
  it("skips a manifest-only corpus without reading missing MIDI", async () => {
    const root = await repositoryWithManifest([
      { split: "dev", path: "midi/missing.mid" },
    ]);
    await expect(evaluateFortyFileBatch(root, () => {
      throw new Error("analyzer must not run");
    })).resolves.toMatchObject({
      status: "SKIPPED",
      completed: null,
      reason: expect.stringMatching(/incomplete/),
    });
  });

  it("skips when the manifest selects zero development files", async () => {
    const root = await repositoryWithManifest([
      { split: "holdout", path: "midi/hidden.mid" },
    ]);
    await expect(evaluateFortyFileBatch(root)).resolves.toMatchObject({
      status: "SKIPPED",
      completed: null,
      reason: expect.stringMatching(/no development/),
    });
  });
});
