import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  findStagedFileViolations,
  splitNulPaths,
  stagedFiles,
} from "./check-staged-files.mjs";

describe("staged-file safety guard", () => {
  it.each([
    ".agents/settings.json",
    ".claude/project.json",
    "artifacts/phase5.15/report.json",
    ".local-evaluation/private/source.json",
    "test/phase5.15/manifest.json",
    "test/phase5.15-supplemental/manifest-supplemental.json",
    "src-tauri/target/release/loop-vault.exe",
    "src-tauri/target-next/release/loop-vault.exe",
    "target/debug/output",
    "playwright-report/index.html",
    "test-results/run.json",
    "blob-report/report.zip",
    "node_modules/package/index.js",
    "dist/index.js",
    "test/fixtures/synthetic.mid",
    "music/example.MID",
    "music/example.midi",
  ])("rejects %s", (path) => {
    expect(findStagedFileViolations([path])).toHaveLength(1);
  });

  it("normalizes Windows separators and permits product source", () => {
    expect(findStagedFileViolations([
      ".agents\\settings.json",
      "src/domain/midi/analysis.ts",
    ])).toHaveLength(1);
  });

  it("splits NUL-delimited names without treating embedded newlines as paths", () => {
    expect(splitNulPaths(Buffer.from("normal.ts\0改行\n名前.MID\0", "utf8")))
      .toEqual(["normal.ts", "改行\n名前.MID"]);
  });

  it("reads Unicode and newline filenames from the staged index losslessly", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "loop-vault-stage-guard-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: root });
      // NTFS rejects embedded newlines; splitNulPaths above covers that Git
      // edge case independently while this exercises real Unicode index I/O.
      const safeName = process.platform === "win32" ? "日本語-safe.ts" : "日本語\nsafe.ts";
      const blockedName = process.platform === "win32"
        ? "音源-秘密.MIDI"
        : "音源\n秘密.MIDI";
      await writeFile(resolve(root, safeName), "safe");
      await writeFile(resolve(root, blockedName), "blocked");
      execFileSync("git", ["add", "--", safeName, blockedName], { cwd: root });
      const files = stagedFiles(root);
      expect(files).toEqual(expect.arrayContaining([safeName, blockedName]));
      expect(findStagedFileViolations(files)).toEqual([
        expect.stringContaining(blockedName),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
