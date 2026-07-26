import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd } from "node:process";
import { analyzeMidi } from "../src/domain/midi/analysis";
import { normalizeChordLabel } from "../src/domain/chordIdentity";
import { inferTrackRoles } from "../src/domain/midi/legacy";
import { parseMidi } from "../src/domain/midi/parser";
import { detectExtractionProfile } from "../src/domain/midi/extractionProfile";
import { shadowDiagnostics, type ChordObservation, type ObservedNote, type ShadowDiagnostics } from "../src/domain/midi/shadowEvidence";
import type { MidiAnalyzerMode, TrackRole } from "../src/domain/midi/types";

/**
 * Turning MIDI into the observations the shadow diagnostics describe.
 *
 * Shared by F1 and F2 so both stages look at exactly the same notes. If they
 * assembled their own observations, a difference between the two stages could be
 * a difference in the harness rather than in what is being measured.
 */

export interface WindowObservation extends ChordObservation {
  bar: number;
  beat: number;
  durationBeats: number;
  /** The label the product currently produces. Reference only. */
  currentLabel: string;
}

export interface FileObservations {
  source: string;
  totalBars: number;
  beatsPerBar: number;
  windows: WindowObservation[];
  diagnostics: ShadowDiagnostics[];
  runtimeMs: number;
}

function beatsPerBarOf(timeSignature: string | undefined): number {
  if (!timeSignature) return 4;
  const [beats] = timeSignature.split("/").map(Number);
  return Number.isFinite(beats) && beats > 0 ? beats : 4;
}

/**
 * Every note sounding inside a timeline event, with how long it sounds for.
 *
 * Weighted by overlap rather than counted, so a note that clips the edge of the
 * window does not carry the same vote as one that fills it. Percussion is
 * excluded: a kick drum's pitch class is not harmonic evidence.
 */
function notesIn(
  song: ReturnType<typeof parseMidi>,
  roles: Map<number, TrackRole>,
  startBeat: number,
  endBeat: number,
): ObservedNote[] {
  const ticksPerBeat = song.ticksPerBeat;
  const startTick = startBeat * ticksPerBeat;
  const endTick = endBeat * ticksPerBeat;
  const observed: ObservedNote[] = [];

  for (const note of song.notes) {
    const role = roles.get(note.trackIndex) ?? "mixed";
    if (role === "percussion") continue;
    const noteEnd = note.startTick + note.durationTick;
    if (note.startTick >= endTick || noteEnd <= startTick) continue;
    const overlap = Math.min(noteEnd, endTick) - Math.max(note.startTick, startTick);
    if (overlap <= 0) continue;
    observed.push({ pitch: note.pitch, weight: overlap / ticksPerBeat, role });
  }
  return observed;
}

export async function observeFile(
  source: string,
  path: string,
  mode: MidiAnalyzerMode = "phase4-v1",
): Promise<FileObservations> {
  const bytes = new Uint8Array(await readFile(path));
  const started = performance.now();
  const analysis = analyzeMidi(bytes, { mode });
  const song = parseMidi(bytes);
  const roles = inferTrackRoles(song, detectExtractionProfile(song));
  const beatsPerBar = beatsPerBarOf(analysis.timeSignature);

  const windows: WindowObservation[] = [];
  const diagnostics: ShadowDiagnostics[] = [];
  let previousRoot: number | undefined;

  for (const item of analysis.fullTimeline) {
    const startBeat = (item.bar - 1) * beatsPerBar + (item.beat - 1);
    const endBeat = startBeat + item.durationBeats;
    const identity = normalizeChordLabel(item.chord.label);

    const observation: WindowObservation = {
      bar: item.bar,
      beat: item.beat,
      durationBeats: item.durationBeats,
      currentLabel: item.chord.label,
      notes: notesIn(song, roles, startBeat, endBeat),
      windowBeats: item.durationBeats,
      ...(identity && !identity.noChord ? { currentRoot: identity.rootPitchClass } : {}),
      ...(identity?.bassPitchClass !== undefined ? { currentBass: identity.bassPitchClass } : {}),
    };

    // Continuity uses the previous *shadow* root, never the product's, so the
    // shadow chain is not quietly anchored to the answer it is measured against.
    const shadow = shadowDiagnostics(observation, {
      ...(previousRoot === undefined ? {} : { previousRoot }),
    });
    previousRoot = shadow.root.top3[0]?.pitchClass;

    windows.push(observation);
    diagnostics.push(shadow);
  }

  return {
    source,
    totalBars: analysis.totalBars,
    beatsPerBar,
    windows,
    diagnostics,
    runtimeMs: Number((performance.now() - started).toFixed(1)),
  };
}

export interface CorpusEntry {
  source: string;
  path: string;
  /** Subset labels, so results can be reported per material rather than pooled. */
  subsets: string[];
}

/** Every file the Stage F evaluation runs on, with the subsets it belongs to. */
export async function stageFCorpus(extraFiles: ReadonlyArray<{ source: string; path: string }> = []): Promise<CorpusEntry[]> {
  const entries: CorpusEntry[] = [];

  const corpora = [
    { path: ".local-evaluation/synthetic-gold-v1", name: "synthetic-gold-v1" },
    { path: ".local-evaluation/long-form-v1.1", name: "long-form-v1.1" },
    { path: ".local-evaluation/holdout-v3", name: "regression-v3" },
  ];

  for (const corpus of corpora) {
    try {
      const manifest = JSON.parse(
        await readFile(resolve(cwd(), corpus.path, "manifest.json"), "utf8"),
      ) as {
        scenarios: Array<{
          scenarioId: string;
          title: string;
          tags?: string[];
          stressFeatures?: string[];
          variants: Array<{ fileName: string; variant: string }>;
        }>;
      };
      for (const scenario of manifest.scenarios) {
        for (const variant of scenario.variants) {
          entries.push({
            source: `${corpus.name}:${scenario.scenarioId}_${variant.variant}`,
            path: resolve(cwd(), corpus.path, "midi", variant.fileName),
            subsets: subsetsFor(scenario.title, scenario.stressFeatures ?? [], variant.variant),
          });
        }
      }
    } catch {
      // A corpus that has not been generated locally is skipped rather than
      // faked; the report says which ones ran.
    }
  }

  try {
    const manifestPath = resolve(cwd(), "docs/loop-vault-evaluation-corpus/manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      files: Array<{ caseId: string; midiFile: string }>;
    };
    for (const entry of manifest.files) {
      entries.push({
        source: `chord-drip:${entry.caseId}`,
        path: resolve(dirname(manifestPath), entry.midiFile),
        subsets: ["chord-drip"],
      });
    }
  } catch { /* not available */ }

  for (const extra of extraFiles) {
    entries.push({ source: extra.source, path: extra.path, subsets: [extra.source.split(":")[0]] });
  }

  return entries;
}

/**
 * Which subsets a scenario belongs to.
 *
 * Derived from the scenario's declared title and stress features, never from its
 * id: keying on `S16` or `H3` would be exactly the fixture-id hard-coding the
 * contract forbids, and would stop working the moment a scenario is renamed.
 */
function subsetsFor(title: string, stressFeatures: readonly string[], variant: string): string[] {
  const subsets: string[] = [];
  const text = `${title} ${stressFeatures.join(" ")}`.toLowerCase();

  if (/pedal|slash|ostinato/.test(text)) subsets.push("pedal-slash");
  if (/rootless/.test(text)) subsets.push("rootless");
  if (/inversion|slash/.test(text)) subsets.push("inversion");
  if (/extension|tension|jazz|13|11|9/.test(text)) subsets.push("tension-rich");
  if (/arpeggi/.test(text)) subsets.push("arpeggiated");
  if (/humaniz|anticipat/.test(text)) subsets.push("humanized");
  if (/two-chords-per-bar|half-bar/.test(text)) subsets.push("half-bar-2chord");
  if (/triad/.test(text) && !/seventh|extension/.test(text)) subsets.push("plain-triad");
  if (/walking/.test(text)) subsets.push("walking-bass");
  subsets.push(variant === "stress" ? "stress" : "clean");

  return subsets.length > 0 ? subsets : ["other"];
}
