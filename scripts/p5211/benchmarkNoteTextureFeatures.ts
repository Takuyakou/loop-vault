import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { parseMidi } from "../../src/domain/midi/parser";
import {
  extractNoteTextureFeatures,
  type NoteTextureInput,
} from "../../src/domain/midi/noteTextureFeatures";
import { voiceId } from "../../src/domain/midi/voices";
import { parseLocalRegistry } from "./auditMixedVoiceBaseline";
import { generateP5211DenseBenchmarkFixture } from "./noteRoleFixtures";

interface TimingSummary {
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maximumMs: number;
  readonly samples: readonly number[];
}

interface BenchmarkArtifact {
  readonly schemaVersion: 1;
  readonly kind: "p5211-stage01-note-texture-benchmark";
  readonly codeCandidateCommit: string;
  readonly warmups: 3;
  readonly measuredRuns: 7;
  readonly hardSampleLimitMs: 2_000;
  readonly deterministic: boolean;
  readonly synthetic: { readonly noteCount: number; readonly timing: TimingSummary };
  readonly anonymousReal: { readonly noteCount: number; readonly voiceCount: number; readonly timing: TimingSummary };
  readonly privacy: { readonly rawNotesPersisted: false; readonly sourcePathPersisted: false; readonly sourceTitlePersisted: false };
}

async function main(): Promise<void> {
  const registryPath = resolve(".local-evaluation/p5211/registry.json");
  const registry = parseLocalRegistry(JSON.parse(await readFile(registryPath, "utf8")));
  const entry = registry.fixtures[0];
  const bytes = new Uint8Array(await readFile(resolve(dirname(registryPath), entry.relativePath)));
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
    throw new Error("local fixture integrity check failed");
  }
  const synthetic = generateP5211DenseBenchmarkFixture(64).map((note) => ({
    id: note.id,
    pitch: note.pitch,
    startBeat: note.startBeat,
    endBeat: note.startBeat + note.durationBeats,
  }));
  const realByVoice = new Map<string, NoteTextureInput[]>();
  for (const [index, note] of normalizeNotes(parseMidi(bytes)).entries()) {
    if (note.channel === undefined || note.channel === 9) continue;
    const id = voiceId(note.trackIndex, note.channel);
    realByVoice.set(id, [...(realByVoice.get(id) ?? []), {
      id: `local-${index}`,
      pitch: note.pitch,
      startBeat: note.startBeat,
      endBeat: note.sustainedEndBeat,
    }]);
  }
  const runSynthetic = (): readonly unknown[] => extractNoteTextureFeatures(synthetic);
  const runReal = (): readonly unknown[] => [...realByVoice.values()]
    .flatMap((notes) => [...extractNoteTextureFeatures(notes)]);
  const firstSynthetic = JSON.stringify(runSynthetic());
  const firstReal = JSON.stringify(runReal());
  const artifact: BenchmarkArtifact = {
    schemaVersion: 1,
    kind: "p5211-stage01-note-texture-benchmark",
    codeCandidateCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    warmups: 3,
    measuredRuns: 7,
    hardSampleLimitMs: 2_000,
    deterministic: firstSynthetic === JSON.stringify(runSynthetic()) && firstReal === JSON.stringify(runReal()),
    synthetic: { noteCount: synthetic.length, timing: measure(runSynthetic) },
    anonymousReal: {
      noteCount: [...realByVoice.values()].reduce((sum, notes) => sum + notes.length, 0),
      voiceCount: realByVoice.size,
      timing: measure(runReal),
    },
    privacy: { rawNotesPersisted: false, sourcePathPersisted: false, sourceTitlePersisted: false },
  };
  if (!artifact.deterministic
    || artifact.synthetic.timing.maximumMs > artifact.hardSampleLimitMs
    || artifact.anonymousReal.timing.maximumMs > artifact.hardSampleLimitMs) {
    throw new Error("note texture benchmark failed");
  }
  const output = resolve(".local-evaluation/p5211/benchmark/stage01-note-texture.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  process.stdout.write(`P5.21.1 Stage01 benchmark: synthetic=${artifact.synthetic.noteCount}; anonymousReal=${artifact.anonymousReal.noteCount}; deterministic=${artifact.deterministic}; output=ignored-local.\n`);
}

function measure(run: () => readonly unknown[]): TimingSummary {
  for (let index = 0; index < 3; index += 1) run();
  const samples = Array.from({ length: 7 }, () => {
    const start = performance.now();
    run();
    return Number((performance.now() - start).toFixed(6));
  }).sort((left, right) => left - right);
  return {
    medianMs: samples[3] ?? 0,
    p95Ms: samples[6] ?? 0,
    maximumMs: samples[6] ?? 0,
    samples,
  };
}

void main().catch(() => {
  process.stderr.write("P5.21.1 Stage01 benchmark failed: local input validation or feature extraction failed.\n");
  process.exitCode = 1;
});
