import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseChordLabel } from "../../src/domain/chords";
import {
  buildVoiceFeatureInputs,
  buildVoices,
  parseMidi,
} from "../../src/domain/midi";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { annotateVoiceRoles } from "../../src/domain/midi/voiceRoles";
import {
  extractVoicing,
  filterEventLocalMelodyContamination,
  voicingNoteSetMetrics,
  voicingRegisterMetrics,
  type MelodyContaminationFilterOptions,
  type VoicingExtractionInput,
} from "../../src/domain/voicing";

interface GeneralEvent {
  eventId: string;
  startBeat: number;
  endBeat: number;
  chordSymbol: string;
  goldTargets: { sourceFaithfulMidi: number[] };
}

interface GeneralFile {
  fileId: string;
  scenarioId: string;
  scenarioSlug: string;
  split: "dev" | "validation" | "holdout";
  path: string;
  events: GeneralEvent[];
}

interface GeneralManifest {
  files: GeneralFile[];
}

interface GeneralRow {
  mode: "product" | "shadow";
  fileId: string;
  scenarioId: string;
  scenarioSlug: string;
  eventId: string;
  exact: boolean;
  truePositive: number;
  predictedCount: number;
  goldCount: number;
  precision: number;
  recall: number;
  f1: number;
  bassCorrect: boolean;
  topCorrect: boolean;
  registerExact: boolean;
  usable: boolean;
  sourceNoteAdditionCount: number;
}

export async function evaluateGeneralRegression(
  corpusDir: string,
  split: "dev" | "validation" | "holdout",
  options: MelodyContaminationFilterOptions,
  customFilter?: (
    input: VoicingExtractionInput,
  ) => { notes: VoicingExtractionInput["notes"] },
) {
  const manifest = JSON.parse(
    await readFile(resolve(corpusDir, "manifest.json"), "utf8"),
  ) as GeneralManifest;
  const rows: GeneralRow[] = [];
  for (const file of manifest.files.filter((candidate) => candidate.split === split)) {
    const bytes = new Uint8Array(await readFile(resolve(corpusDir, file.path)));
    const data = parseMidi(bytes);
    const rawVoices = buildVoices(data);
    const features = buildVoiceFeatureInputs(rawVoices, normalizeNotes(data));
    const productVoices = annotateVoiceRoles(rawVoices, features);
    for (const event of file.events) {
      const chord = parseChordLabel(event.chordSymbol);
      if (!chord) throw new Error(`Unparseable Gold chord ${file.fileId}/${event.eventId}`);
      const segment = { startBeat: event.startBeat, endBeat: event.endBeat };
      const filterInput = {
        notes: data.notes,
        voices: productVoices,
        ticksPerBeat: data.ticksPerBeat,
        segment,
        chord,
      };
      const shadow = customFilter?.(filterInput)
        ?? filterEventLocalMelodyContamination(filterInput, options);
      const observed = observedPitches(data.notes, data.ticksPerBeat, segment);
      for (const mode of ["product", "shadow"] as const) {
        const extraction = extractVoicing({
          chord,
          segment,
          notes: mode === "shadow" ? shadow.notes : data.notes,
          ticksPerBeat: data.ticksPerBeat,
          voices: productVoices,
        });
        const predicted = extraction.snapshot?.midiNotes ?? [];
        const gold = event.goldTargets.sourceFaithfulMidi;
        const note = voicingNoteSetMetrics(predicted, gold);
        const register = voicingRegisterMetrics(predicted, gold);
        rows.push({
          mode,
          fileId: file.fileId,
          scenarioId: file.scenarioId,
          scenarioSlug: file.scenarioSlug,
          eventId: event.eventId,
          exact: note.exact,
          truePositive: note.truePositive,
          predictedCount: new Set(predicted).size,
          goldCount: new Set(gold).size,
          precision: note.precision,
          recall: note.recall,
          f1: note.f1,
          bassCorrect: register.bassNoteCorrect,
          topCorrect: register.topNoteCorrect,
          registerExact: register.registerExact,
          usable: extraction.status === "usable",
          sourceNoteAdditionCount: predicted.filter((pitch) => !observed.includes(pitch)).length,
        });
      }
    }
  }
  return {
    split,
    product: grouped(rows.filter((row) => row.mode === "product")),
    shadow: grouped(rows.filter((row) => row.mode === "shadow")),
  };
}

function grouped(rows: readonly GeneralRow[]) {
  return {
    overall: aggregate(rows),
    plainBlock: aggregate(rows.filter((row) => /close-block/i.test(row.scenarioSlug))),
    rootless: aggregate(rows.filter((row) => /rootless/i.test(row.scenarioSlug))),
    arpeggio: aggregate(rows.filter((row) => /arpeggio/i.test(row.scenarioSlug))),
    byScenario: Object.fromEntries(
      [...new Set(rows.map((row) => row.scenarioId))].sort().map((scenarioId) => [
        scenarioId,
        {
          slug: rows.find((row) => row.scenarioId === scenarioId)?.scenarioSlug,
          metrics: aggregate(rows.filter((row) => row.scenarioId === scenarioId)),
        },
      ]),
    ),
  };
}

function aggregate(rows: readonly GeneralRow[]) {
  const events = rows.length;
  const predicted = sum(rows.map((row) => row.predictedCount));
  const gold = sum(rows.map((row) => row.goldCount));
  const truePositive = sum(rows.map((row) => row.truePositive));
  const precision = predicted === 0 ? (gold === 0 ? 1 : 0) : truePositive / predicted;
  const recall = gold === 0 ? (predicted === 0 ? 1 : 0) : truePositive / gold;
  return {
    events,
    voicingExactRate: ratio(rows.filter((row) => row.exact).length, events),
    notePrecision: rounded(precision),
    noteRecall: rounded(recall),
    noteF1: rounded(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)),
    bassNoteAccuracy: ratio(rows.filter((row) => row.bassCorrect).length, events),
    topNoteAccuracy: ratio(rows.filter((row) => row.topCorrect).length, events),
    registerExactRate: ratio(rows.filter((row) => row.registerExact).length, events),
    sourceVoicingUsableRate: ratio(rows.filter((row) => row.usable).length, events),
    generatedFallbackRate: ratio(rows.filter((row) => !row.usable).length, events),
    sourceNoteAdditionCount: sum(rows.map((row) => row.sourceNoteAdditionCount)),
  };
}

function observedPitches(
  notes: readonly {
    pitch: number;
    startTick: number;
    durationTick: number;
  }[],
  ticksPerBeat: number,
  segment: { startBeat: number; endBeat: number },
): number[] {
  return [...new Set(notes.filter((note) => {
    const startBeat = note.startTick / ticksPerBeat;
    const endBeat = (note.startTick + note.durationTick) / ticksPerBeat;
    return endBeat > segment.startBeat && startBeat < segment.endBeat;
  }).map((note) => note.pitch))];
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function ratio(value: number, total: number): number | null {
  return total === 0 ? null : rounded(value / total);
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}
