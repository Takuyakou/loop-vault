import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { chordIdentityKey, normalizeChordLabel } from "../src/domain/chordIdentity";
import { labelFromSymbol, parseChordLabel } from "../src/domain/chords";
import type { ChordDripCorpusManifest } from "../src/domain/midi/evaluation/manifest";

const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
const outputDir = resolve(cwd(), "docs/phase4.0");
// Stage artifacts are frozen snapshots, so the file name is explicit rather than
// defaulting to a stage number that a later run would silently overwrite.
const outputName = optionValue("--output") ?? "label-reachability.json";

function optionValue(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ChordDripCorpusManifest;

/**
 * Classifies why an expected corpus label cannot be produced by Loop Vault's own
 * parser/formatter pair. Surface reachability is the theoretical ceiling of the
 * historical `surfaceExact` metric: a label the app can never emit can never be
 * scored as an exact match, no matter how correct the detection is.
 */
type Reachability =
  | "reachable"
  | "parenthesized-tension"
  | "quality-notation"
  | "enharmonic-spelling"
  | "unparsable-other";

interface Bucket { total: number; reachable: number }

const byReason = new Map<Reachability, { events: number; beats: number; examples: Set<string> }>();
const byKey = new Map<string, Bucket>();
const byQuality = new Map<string, Bucket>();
const unsupportedLabels = new Map<string, number>();

let totalEvents = 0;
let totalBeats = 0;
let parseSuccessEvents = 0;
let roundTripEvents = 0;
let reachableBeats = 0;
let identityRoundTripEvents = 0;
const identityRoundTripFailures = new Map<string, number>();

/**
 * Semantic round-trip: the label must survive parse -> format -> parse with the
 * same musical identity. Unlike surface reachability this tolerates respelling
 * (`Bbm7(9)` -> `Bbm9`), which is the guarantee the label contract actually owes.
 */
function identityRoundTrips(label: string): boolean {
  const first = normalizeChordLabel(label);
  if (!first) return false;
  const reformatted = parseChordLabel(label)?.label;
  if (!reformatted) return false;
  const second = normalizeChordLabel(reformatted);
  return second !== null && chordIdentityKey(first) === chordIdentityKey(second);
}

function classify(label: string): Reachability {
  const parsed = parseChordLabel(label);
  if (!parsed) return label.includes("(") ? "parenthesized-tension" : "unparsable-other";
  const roundTrip = labelFromSymbol(parsed);
  if (roundTrip === label) return "reachable";
  const expectedRoot = /^([A-G](?:#|b)?)/.exec(label)?.[1] ?? "";
  const actualRoot = /^([A-G](?:#|b)?)/.exec(roundTrip)?.[1] ?? "";
  return expectedRoot !== actualRoot ? "enharmonic-spelling" : "quality-notation";
}

function bump(map: Map<string, Bucket>, key: string, beats: number, reachable: boolean) {
  const bucket = map.get(key) ?? { total: 0, reachable: 0 };
  bucket.total += beats;
  if (reachable) bucket.reachable += beats;
  map.set(key, bucket);
}

for (const file of manifest.files) {
  const record = file.generationRecord as { key?: string; mode?: string };
  const keyName = `${record.key ?? "?"} ${record.mode ?? "?"}`;
  for (const segment of file.chordTimeline) {
    const label = segment.chordSymbol.label;
    const beats = segment.durationBeats;
    const reason = classify(label);
    const isReachable = reason === "reachable";

    totalEvents += 1;
    totalBeats += beats;
    if (parseChordLabel(label)) parseSuccessEvents += 1;
    if (identityRoundTrips(label)) identityRoundTripEvents += 1;
    else identityRoundTripFailures.set(label, (identityRoundTripFailures.get(label) ?? 0) + 1);
    if (isReachable) {
      roundTripEvents += 1;
      reachableBeats += beats;
    } else {
      unsupportedLabels.set(label, (unsupportedLabels.get(label) ?? 0) + 1);
      const entry = byReason.get(reason) ?? { events: 0, beats: 0, examples: new Set<string>() };
      entry.events += 1;
      entry.beats += beats;
      if (entry.examples.size < 8) {
        const parsed = parseChordLabel(label);
        entry.examples.add(parsed ? `${label} -> ${labelFromSymbol(parsed)}` : label);
      }
      byReason.set(reason, entry);
    }
    bump(byKey, keyName, beats, isReachable);
    bump(byQuality, segment.chordSymbol.quality, beats, isReachable);
  }
}

const ratio = (value: number, total: number) => (total <= 0 ? 0 : Number((value / total).toFixed(6)));
const bucketRows = (map: Map<string, Bucket>) =>
  [...map]
    .map(([name, bucket]) => ({ name, beats: bucket.total, reachability: ratio(bucket.reachable, bucket.total) }))
    .sort((left, right) => left.reachability - right.reachability || left.name.localeCompare(right.name));

const report = {
  schemaVersion: 1,
  datasetId: manifest.recipeSha256,
  caseCount: manifest.files.length,
  totals: {
    expectedEvents: totalEvents,
    expectedBeats: totalBeats,
    parseSuccessEvents,
    expectedParseCoverage: ratio(parseSuccessEvents, totalEvents),
    surfaceRoundTripEvents: roundTripEvents,
    identityRoundTripEvents,
    identityRoundTripCoverage: ratio(identityRoundTripEvents, totalEvents),
    identityRoundTripFailures: [...identityRoundTripFailures]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([label, count]) => ({ label, count })),
    surfaceReachabilityEvents: ratio(roundTripEvents, totalEvents),
    surfaceReachabilityBeats: ratio(reachableBeats, totalBeats),
    unsupportedEventCount: totalEvents - roundTripEvents,
    distinctUnsupportedLabels: unsupportedLabels.size,
  },
  byReason: Object.fromEntries(
    [...byReason]
      .sort((left, right) => right[1].beats - left[1].beats)
      .map(([reason, entry]) => [reason, {
        events: entry.events,
        beats: entry.beats,
        beatShare: ratio(entry.beats, totalBeats),
        examples: [...entry.examples],
      }]),
  ),
  byKey: bucketRows(byKey),
  byQuality: bucketRows(byQuality),
  unsupportedLabels: [...unsupportedLabels]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([label, count]) => ({ label, count })),
};

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, outputName), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
stdout.write(`Expected events: ${totalEvents} (${totalBeats} beats)\n`);
stdout.write(`Parse coverage: ${pct(report.totals.expectedParseCoverage)}\n`);
stdout.write(`Identity round-trip: ${pct(report.totals.identityRoundTripCoverage)} (${identityRoundTripFailures.size} failing labels)\n`);
stdout.write(`Surface reachability (events): ${pct(report.totals.surfaceReachabilityEvents)}\n`);
stdout.write(`Surface reachability (beats):  ${pct(report.totals.surfaceReachabilityBeats)}  <- surfaceExact ceiling\n`);
stdout.write(`Unsupported events: ${report.totals.unsupportedEventCount} across ${unsupportedLabels.size} distinct labels\n`);
for (const [reason, entry] of Object.entries(report.byReason)) {
  stdout.write(`  ${reason}: ${entry.beats} beats (${pct(entry.beatShare)})\n`);
}
