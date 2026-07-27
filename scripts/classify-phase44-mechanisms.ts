import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import {
  buildVoiceFeatureInputs,
  buildVoices,
  parseMidi,
} from "../src/domain/midi";
import { normalizeNotes } from "../src/domain/midi/normalize";
import { annotateVoiceRoles } from "../src/domain/midi/voiceRoles";
import {
  aggregatePhase44Rows,
  evaluatePhase44Split,
  loadPhase44Manifest,
  type Phase44CorpusFile,
  type Phase44GoldEvent,
  type Phase44GoldNote,
  type Phase44Split,
} from "./phase44/targetedCorpus";

type Mechanism = "M1-same-track-role-mixing" | "M2-track-role-misclassification" | "M3-downstream-retention";

interface ClassifiedEvent {
  split: Phase44Split;
  mechanism: Mechanism;
  fileId: string;
  scenarioId: string;
  scenarioSlug: string;
  variant: "clean" | "stress";
  eventId: string;
  trackLayout: "same-track" | "separate-track";
  leakedNotes: number[];
  sourceTrackIds: string[];
  productRoles: Record<string, string>;
  precision: number;
  usable: boolean;
}

const corpusDir = resolve(cwd(), ".local-evaluation/voicing-melody-contamination-gold-v1");
const outputJson = resolve(cwd(), "docs/phase4.4/01-mechanism-classification.json");
const outputMarkdown = resolve(cwd(), "docs/phase4.4/01-mechanism-classification.md");
const detailsOutput = resolve(cwd(), ".local-evaluation/phase4.4/01-mechanism-events.json");
const manifest = await loadPhase44Manifest(corpusDir);
const classified: ClassifiedEvent[] = [];
const splitReports: Record<string, unknown> = {};

for (const split of ["dev", "validation"] as const) {
  const rows = await evaluatePhase44Split(corpusDir, manifest, split, ["A", "B"]);
  const productRows = rows.filter((row) => row.condition === "B");
  const goldRows = rows.filter((row) => row.condition === "A");
  const productRolesByFile = new Map<string, Record<string, string>>();
  for (const file of manifest.files.filter((candidate) => candidate.split === split)) {
    productRolesByFile.set(file.fileId, await inferProductTrackRoles(corpusDir, file));
  }
  for (const row of productRows.filter((candidate) => candidate.contaminationEvent)) {
    const file = manifest.files.find((candidate) => candidate.fileId === row.fileId);
    const event = file?.events.find((candidate) => candidate.eventId === row.eventId);
    if (!file || !event) throw new Error(`Missing Gold event ${row.fileId}/${row.eventId}`);
    const roles = productRolesByFile.get(file.fileId) ?? {};
    const leakedSources = sourceNotesForLeaks(file, event, row.melodyLeakedNotes);
    const mechanism = classifyMechanism(file, event, leakedSources, roles);
    classified.push({
      split,
      mechanism,
      fileId: row.fileId,
      scenarioId: row.scenarioId,
      scenarioSlug: row.scenarioSlug,
      variant: row.variant,
      eventId: row.eventId,
      trackLayout: row.trackLayout,
      leakedNotes: row.melodyLeakedNotes,
      sourceTrackIds: [...new Set(leakedSources.map((note) => note.trackId))].sort(),
      productRoles: roles,
      precision: row.precision,
      usable: row.status === "usable",
    });
  }
  splitReports[split] = {
    baselineA: aggregatePhase44Rows(goldRows),
    baselineB: aggregatePhase44Rows(productRows),
    mechanisms: mechanismSummary(classified.filter((row) => row.split === split)),
  };
}

const report = {
  schemaVersion: 1,
  analyzerMode: "phase4-v1",
  dedicatedHoldoutStatus: "not-evaluated",
  precedence: [
    "M1-same-track-role-mixing",
    "M2-track-role-misclassification",
    "M3-downstream-retention",
  ],
  splits: splitReports,
  validationReproduction: {
    reproduced: classified.some((row) => row.split === "validation"),
    eventCount: classified.filter((row) => row.split === "validation").length,
    mechanisms: [...new Set(
      classified.filter((row) => row.split === "validation").map((row) => row.mechanism),
    )],
  },
};

await mkdir(dirname(outputJson), { recursive: true });
await mkdir(dirname(detailsOutput), { recursive: true });
await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(
  detailsOutput,
  `${JSON.stringify({ schemaVersion: 1, classified }, null, 2)}\n`,
  "utf8",
);
await writeFile(outputMarkdown, markdown(report), "utf8");
stdout.write(`P4.4 mechanism classification: ${classified.length} contamination events.\n`);
stdout.write(`${JSON.stringify(report.splits, null, 2)}\n`);

async function inferProductTrackRoles(
  root: string,
  file: Phase44CorpusFile,
): Promise<Record<string, string>> {
  const bytes = new Uint8Array(await readFile(resolve(root, file.path)));
  const data = parseMidi(bytes);
  const voices = buildVoices(data);
  const features = buildVoiceFeatureInputs(voices, normalizeNotes(data));
  const annotated = annotateVoiceRoles(voices, features);
  return Object.fromEntries(file.tracks.map((track) => {
    const voice = annotated.find((candidate) =>
      candidate.trackName === track.midiTrackName
      && candidate.channel === track.channel);
    return [track.trackId, voice?.inferredRole ?? "unmapped"];
  }));
}

function sourceNotesForLeaks(
  file: Phase44CorpusFile,
  event: Phase44GoldEvent,
  leaked: readonly number[],
): Phase44GoldNote[] {
  const leakedSet = new Set(leaked);
  return file.notes.filter((note) =>
    leakedSet.has(note.midi)
    && note.startBeat < event.endBeat
    && note.startBeat + note.durationBeats > event.startBeat
    && !note.goldVoicing);
}

function classifyMechanism(
  file: Phase44CorpusFile,
  event: Phase44GoldEvent,
  leakedSources: readonly Phase44GoldNote[],
  productRoles: Readonly<Record<string, string>>,
): Mechanism {
  const eventNotes = file.notes.filter((note) =>
    note.startBeat < event.endBeat
    && note.startBeat + note.durationBeats > event.startBeat);
  const rolesByTrack = new Map<string, Set<string>>();
  for (const note of eventNotes) addToSet(rolesByTrack, note.trackId, note.role);
  if (leakedSources.some((note) => {
    const roles = rolesByTrack.get(note.trackId) ?? new Set<string>();
    return roles.has("harmony") && (roles.has("melody") || roles.has("voice"));
  })) {
    return "M1-same-track-role-mixing";
  }

  const tracks = new Map(file.tracks.map((track) => [track.trackId, track]));
  if (leakedSources.some((note) => {
    const goldRole = tracks.get(note.trackId)?.goldRole;
    const productRole = productRoles[note.trackId];
    return (goldRole === "melody" || goldRole === "voice")
      && productRole !== "melody";
  })) {
    return "M2-track-role-misclassification";
  }
  return "M3-downstream-retention";
}

function mechanismSummary(rows: readonly ClassifiedEvent[]) {
  return Object.fromEntries(
    ([
      "M1-same-track-role-mixing",
      "M2-track-role-misclassification",
      "M3-downstream-retention",
    ] as const).map((mechanism) => {
      const matching = rows.filter((row) => row.mechanism === mechanism);
      const noteCount = matching.reduce((sum, row) => sum + row.leakedNotes.length, 0);
      const precision = matching.length
        ? matching.reduce((sum, row) => sum + row.precision, 0) / matching.length
        : null;
      const usable = matching.length
        ? matching.filter((row) => row.usable).length / matching.length
        : null;
      return [mechanism, {
        eventCount: matching.length,
        noteCount,
        clean: matching.filter((row) => row.variant === "clean").length,
        stress: matching.filter((row) => row.variant === "stress").length,
        sameTrack: matching.filter((row) => row.trackLayout === "same-track").length,
        separateTrack: matching.filter((row) => row.trackLayout === "separate-track").length,
        meanPrecision: precision === null ? null : rounded(precision),
        precisionLoss: precision === null ? null : rounded(1 - precision),
        usableRate: usable === null ? null : rounded(usable),
        usableLoss: usable === null ? null : rounded(1 - usable),
        scenarios: countBy(matching, (row) => row.scenarioId),
      }];
    }),
  );
}

function markdown(report: typeof report): string {
  const dev = report.splits.dev as { mechanisms: Record<string, MechanismMetrics> };
  const validation = report.splits.validation as { mechanisms: Record<string, MechanismMetrics> };
  return `# Phase 4.4 M1 / M2 / M3 自動分類

Gold per-note role、Gold track role、Product role、実際にリークしたsource noteから自動分類した。
優先順はM1 → M2 → M3。scenario IDやファイルIDによる分岐はない。

| Mechanism | Dev events / notes | Validation events / notes | Dev precision loss | Dev usable loss |
|---|---:|---:|---:|---:|
${mechanismRow("M1-same-track-role-mixing", dev, validation)}
${mechanismRow("M2-track-role-misclassification", dev, validation)}
${mechanismRow("M3-downstream-retention", dev, validation)}

## 判断材料

- M1は同一物理Trackにharmonyとmelody/voiceのGold noteが共存する構造限界
- M2は純melody/voice TrackがProductでmelody以外になったclassifier損失
- M3はProduct roleがmelodyでもsourceVoicingへ残った下流損失
- validation再現: ${report.validationReproduction.reproduced}
- 専用holdout: not-evaluated

イベント単位のsource track、Product role、leaked pitchはGit管理外の
\`.local-evaluation/phase4.4/01-mechanism-events.json\`へ保存した。
`;
}

interface MechanismMetrics {
  eventCount: number;
  noteCount: number;
  precisionLoss: number | null;
  usableLoss: number | null;
}

function mechanismRow(
  mechanism: Mechanism,
  dev: { mechanisms: Record<string, MechanismMetrics> },
  validation: { mechanisms: Record<string, MechanismMetrics> },
): string {
  const left = dev.mechanisms[mechanism]!;
  const right = validation.mechanisms[mechanism]!;
  return `| ${mechanism} | ${left.eventCount} / ${left.noteCount} | `
    + `${right.eventCount} / ${right.noteCount} | ${percent(left.precisionLoss)} | `
    + `${percent(left.usableLoss)} |`;
}

function addToSet<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
  const values = map.get(key) ?? new Set<V>();
  values.add(value);
  map.set(key, values);
}

function countBy<T>(values: readonly T[], keyFor: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`;
}
