import { Midi } from "@tonejs/midi";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, stdout } from "node:process";
import { chordPitchClasses } from "../../src/domain/chordVoicing";
import { makeChordSymbol } from "../../src/domain/chords";
import type { ChordQuality } from "../../src/domain/types";

export const bassCompanionCorpusVersion = "loop-vault-bass-companion-identity-gold-v1";
export const bassCompanionGeneratorVersion = "p47-04-fixed-generator-v1";
export const defaultBassCompanionCorpusDir =
  ".local-evaluation/loop-vault-bass-companion-identity-gold-v1";

export type BassCompanionSplit = "dev" | "validation" | "holdout";
export type BassCompanionVariant = "clean" | "stress";
export type BassCompanionFamily =
  | "m7"
  | "m9"
  | "maj9"
  | "7sus4"
  | "13"
  | "maj7"
  | "dom7";
export type GoldBassIdentity = "plain" | "slash";
export type BassCondition =
  | "root"
  | "third"
  | "fifth"
  | "seventh"
  | "passing"
  | "pedal"
  | "non-chord"
  | "short";

export interface BassCompanionGoldEvent {
  eventId: string;
  bar: number;
  beatInBar: number;
  startBeat: number;
  endBeat: number;
  durationBeats: number;
  chordSymbol: string;
  acceptableAlternatives: string[];
  family: BassCompanionFamily;
  rootPitchClass: number;
  performedBassPitchClass: number;
  goldBassIdentity: GoldBassIdentity;
  bassCondition: BassCondition;
  bassTrackLayout: "same-track" | "separate-track";
  bassDurationClass: "short" | "medium" | "long";
  expectedApplicable: boolean;
  expectedHarmonyPitchClasses: number[];
  expectedNoteCount: number;
}

export interface BassCompanionCorpusFile {
  fileId: string;
  path: string;
  split: BassCompanionSplit;
  scenarioId: string;
  scenarioSlug: string;
  variant: BassCompanionVariant;
  keyPitchClass: number;
  keyLabel: string;
  sha256: string;
  byteLength: number;
  ppq: number;
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  bars: number;
  trackCount: number;
  noteCount: number;
  events: BassCompanionGoldEvent[];
}

export interface BassCompanionCorpusManifest {
  schemaVersion: 1;
  corpusVersion: string;
  generatorVersion: string;
  seed: number;
  description: string;
  generatedBy: "deterministic-code";
  files: BassCompanionCorpusFile[];
}

interface PlannedEvent {
  split: BassCompanionSplit;
  variant: BassCompanionVariant;
  fileIndex: number;
  eventIndex: number;
  keyPitchClass: number;
  family: BassCompanionFamily;
  quality: ChordQuality;
  root: number;
  goldBassIdentity: GoldBassIdentity;
  bassCondition: BassCondition;
  bassTrackLayout: "same-track" | "separate-track";
  bassDurationClass: "short" | "medium" | "long";
}

interface NotePlan {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
}

const ppq = 480;
const barsPerFile = 8;
const filesPerSplit = 12;
const eventsPerFile = 8;
const bpm = 96;
const corpusSeed = 4704;
const noteNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const splits: readonly BassCompanionSplit[] = ["dev", "validation", "holdout"];
const families: readonly Array<{ family: BassCompanionFamily; quality: ChordQuality }> = [
  { family: "m7", quality: "min7" },
  { family: "m9", quality: "min9" },
  { family: "maj9", quality: "maj9" },
  { family: "7sus4", quality: "dom7sus4" },
  { family: "13", quality: "dom13" },
  { family: "maj7", quality: "maj7" },
  { family: "dom7", quality: "dom7" },
];
const bassConditions: readonly BassCondition[] = [
  "third",
  "fifth",
  "seventh",
  "passing",
  "pedal",
  "non-chord",
  "short",
  "root",
];

export async function generateBassCompanionCorpus(
  outputDirectory = resolve(cwd(), defaultBassCompanionCorpusDir),
): Promise<BassCompanionCorpusManifest> {
  const root = resolve(outputDirectory);
  await mkdir(root, { recursive: true });
  const files: BassCompanionCorpusFile[] = [];

  for (const split of splits) {
    for (let fileIndex = 0; fileIndex < filesPerSplit; fileIndex += 1) {
      const variant: BassCompanionVariant = fileIndex % 2 === 0 ? "clean" : "stress";
      const keyPitchClass = fileIndex;
      const fileId = `${split}-${String(fileIndex + 1).padStart(2, "0")}-${variant}`;
      const scenarioSlug = `${noteNames[keyPitchClass].toLowerCase().replace("#", "s")}-identity-pairs`;
      const planned = Array.from({ length: eventsPerFile }, (_, eventIndex) =>
        planEvent(split, variant, fileIndex, eventIndex, keyPitchClass));
      const rendered = renderMidi(planned, variant);
      const relativePath = `midi/${split}/${fileId}_${scenarioSlug}.mid`;
      const absolutePath = resolve(root, relativePath);
      await mkdir(resolve(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, rendered.bytes);

      files.push({
        fileId,
        path: relativePath,
        split,
        scenarioId: `${split}-${String(fileIndex + 1).padStart(2, "0")}`,
        scenarioSlug,
        variant,
        keyPitchClass,
        keyLabel: noteNames[keyPitchClass],
        sha256: sha256(rendered.bytes),
        byteLength: rendered.bytes.byteLength,
        ppq,
        bpm,
        timeSignature: { numerator: 4, denominator: 4 },
        bars: barsPerFile,
        trackCount: rendered.trackCount,
        noteCount: rendered.noteCount,
        events: rendered.events,
      });
    }
  }

  const manifest: BassCompanionCorpusManifest = {
    schemaVersion: 1,
    corpusVersion: bassCompanionCorpusVersion,
    generatorVersion: bassCompanionGeneratorVersion,
    seed: corpusSeed,
    description:
      "Fixed synthetic Gold corpus for plain/slash companion identity preservation. "
      + "All split, family, key, variant and bass-condition assignments are frozen before evaluation.",
    generatedBy: "deterministic-code",
    files,
  };
  await writeFile(
    resolve(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

export function corpusDesignSummary(manifest: BassCompanionCorpusManifest) {
  return {
    files: manifest.files.length,
    events: manifest.files.reduce((sum, file) => sum + file.events.length, 0),
    notes: manifest.files.reduce((sum, file) => sum + file.noteCount, 0),
    splits: Object.fromEntries(splits.map((split) => {
      const files = manifest.files.filter((file) => file.split === split);
      return [split, {
        files: files.length,
        events: files.reduce((sum, file) => sum + file.events.length, 0),
        expectedApplicable: files.flatMap((file) => file.events)
          .filter((event) => event.expectedApplicable).length,
      }];
    })),
  };
}

function planEvent(
  split: BassCompanionSplit,
  variant: BassCompanionVariant,
  fileIndex: number,
  eventIndex: number,
  keyPitchClass: number,
): PlannedEvent {
  const splitOffset = splits.indexOf(split) * 2;
  const familyEntry = families[(fileIndex * eventsPerFile + eventIndex + splitOffset) % families.length];
  const bassCondition = bassConditions[(fileIndex + eventIndex + splitOffset) % bassConditions.length];
  return {
    split,
    variant,
    fileIndex,
    eventIndex,
    keyPitchClass,
    family: familyEntry.family,
    quality: familyEntry.quality,
    root: normalizePc(keyPitchClass + eventIndex * 5 + splitOffset),
    goldBassIdentity: (fileIndex + eventIndex) % 2 === 0 ? "plain" : "slash",
    bassCondition,
    bassTrackLayout: (fileIndex + eventIndex + splitOffset) % 2 === 0
      ? "separate-track"
      : "same-track",
    bassDurationClass: bassCondition === "short"
      ? "short"
      : (eventIndex % 3 === 0 ? "medium" : "long"),
  };
}

function renderMidi(
  planned: readonly PlannedEvent[],
  variant: BassCompanionVariant,
): {
  bytes: Uint8Array;
  events: BassCompanionGoldEvent[];
  trackCount: number;
  noteCount: number;
} {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [4, 4],
    measures: 0,
  });
  const harmony = midi.addTrack();
  harmony.name = "Harmony Piano";
  harmony.channel = 0;
  harmony.instrument.number = 0;
  const bass = midi.addTrack();
  bass.name = "Bass";
  bass.channel = 1;
  bass.instrument.number = 32;
  const melody = variant === "stress" ? midi.addTrack() : undefined;
  if (melody) {
    melody.name = "Melody";
    melody.channel = 2;
    melody.instrument.number = 80;
  }

  const events: BassCompanionGoldEvent[] = [];
  let noteCount = 0;
  for (const plan of planned) {
    const time = plan.eventIndex * 4;
    const plain = makeChordSymbol(plan.root, plan.quality);
    const harmonyPitchClasses = chordPitchClasses(plain);
    const performedBassPitchClass = bassPitchFor(plan, harmonyPitchClasses);
    const label = plan.goldBassIdentity === "slash" && performedBassPitchClass !== plan.root
      ? makeChordSymbol(plan.root, plan.quality, [], performedBassPitchClass).label
      : plain.label;
    const upperNotes = harmonyPitchClasses.map((pitchClass, index) =>
      midiForPitchClass(pitchClass, 58 + index * 2, 82));
    const harmonyNotes = upperNotes.map((midiNote, index): NotePlan => ({
      midi: midiNote,
      time: time + (variant === "stress" ? index * 0.0125 : 0),
      duration: variant === "stress" ? 3.65 - index * 0.04 : 3.8,
      velocity: 0.7 + (index % 2) * 0.04,
    }));
    const bassNotes = buildBassNotes(plan, performedBassPitchClass, time);
    const harmonyTarget = plan.bassTrackLayout === "same-track"
      ? [...harmonyNotes, ...bassNotes]
      : harmonyNotes;
    harmonyTarget.forEach((note) => harmony.addNote(note));
    if (plan.bassTrackLayout === "separate-track") {
      bassNotes.forEach((note) => bass.addNote(note));
    }
    noteCount += harmonyNotes.length + bassNotes.length;

    if (melody) {
      const melodyPc = harmonyPitchClasses[(plan.eventIndex + 1) % harmonyPitchClasses.length];
      const melodyNotes = [
        {
          midi: midiForPitchClass(melodyPc, 76, 88),
          time: time + 0.5,
          duration: 0.35,
          velocity: 0.48,
        },
        {
          midi: midiForPitchClass(
            harmonyPitchClasses[(plan.eventIndex + 2) % harmonyPitchClasses.length],
            78,
            90,
          ),
          time: time + 2.5,
          duration: 0.3,
          velocity: 0.44,
        },
      ];
      melodyNotes.forEach((note) => melody.addNote(note));
      noteCount += melodyNotes.length;
    }

    events.push({
      eventId: `e${String(plan.eventIndex + 1).padStart(2, "0")}`,
      bar: plan.eventIndex + 1,
      beatInBar: 1,
      startBeat: time,
      endBeat: time + 4,
      durationBeats: 4,
      chordSymbol: label,
      acceptableAlternatives: plan.goldBassIdentity === "plain"
        ? []
        : [plain.label],
      family: plan.family,
      rootPitchClass: plan.root,
      performedBassPitchClass,
      goldBassIdentity: plan.goldBassIdentity,
      bassCondition: plan.bassCondition,
      bassTrackLayout: plan.bassTrackLayout,
      bassDurationClass: plan.bassDurationClass,
      expectedApplicable: plan.bassCondition !== "root",
      expectedHarmonyPitchClasses: harmonyPitchClasses,
      expectedNoteCount: harmonyNotes.length + bassNotes.length
        + (variant === "stress" ? 2 : 0),
    });
  }

  return {
    bytes: new Uint8Array(midi.toArray()),
    events,
    // @tonejs/midi writes a dedicated tempo/time-signature SMF track before
    // the musical tracks. Product parser round-trip counts that track too.
    trackCount: midi.tracks.length + 1,
    noteCount,
  };
}

function bassPitchFor(plan: PlannedEvent, harmonyPitchClasses: readonly number[]): number {
  const root = plan.root;
  switch (plan.bassCondition) {
    case "root":
      return root;
    case "third":
      return harmonyPitchClasses[1] ?? normalizePc(root + 3);
    case "fifth":
      return harmonyPitchClasses.find((pitchClass) =>
        pitchClass === normalizePc(root + 7)) ?? harmonyPitchClasses[2] ?? normalizePc(root + 7);
    case "seventh":
      return harmonyPitchClasses.find((pitchClass) =>
        pitchClass === normalizePc(root + 10)
        || pitchClass === normalizePc(root + 11))
        ?? harmonyPitchClasses.at(-1)
        ?? normalizePc(root + 10);
    case "pedal":
      return normalizePc(plan.keyPitchClass + 7);
    case "non-chord":
      return firstNonChordPitchClass(root + 1, harmonyPitchClasses);
    case "passing":
      return harmonyPitchClasses[1] ?? normalizePc(root + 3);
    case "short":
      return harmonyPitchClasses[2] ?? normalizePc(root + 7);
  }
}

function buildBassNotes(
  plan: PlannedEvent,
  bassPitchClass: number,
  time: number,
): NotePlan[] {
  const primary = midiForPitchClass(bassPitchClass, 38, 52);
  if (plan.bassCondition === "passing") {
    return [
      { midi: primary, time, duration: 2, velocity: 0.82 },
      {
        midi: midiForPitchClass(normalizePc(bassPitchClass + 2), 38, 52),
        time: time + 2,
        duration: 1.8,
        velocity: 0.7,
      },
    ];
  }
  const duration = plan.bassDurationClass === "short"
    ? 1.35
    : (plan.bassDurationClass === "medium" ? 2.75 : 3.85);
  return [{ midi: primary, time, duration, velocity: 0.82 }];
}

function firstNonChordPitchClass(
  start: number,
  chordPitchClasses: readonly number[],
): number {
  for (let offset = 0; offset < 12; offset += 1) {
    const candidate = normalizePc(start + offset);
    if (!chordPitchClasses.includes(candidate)) return candidate;
  }
  return normalizePc(start);
}

function midiForPitchClass(pitchClass: number, minimum: number, maximum: number): number {
  let midi = normalizePc(pitchClass);
  while (midi < minimum) midi += 12;
  while (midi > maximum) midi -= 12;
  return midi;
}

function normalizePc(value: number): number {
  return ((Math.trunc(value) % 12) + 12) % 12;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function optionValue(name: string): string | undefined {
  const inline = argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function runCli() {
  const output = resolve(cwd(), optionValue("--output") ?? defaultBassCompanionCorpusDir);
  const manifest = await generateBassCompanionCorpus(output);
  stdout.write(`${JSON.stringify(corpusDesignSummary(manifest), null, 2)}\n`);
}

if (argv.some((argument) => argument.replaceAll("\\", "/").endsWith(
  "scripts/phase47/generateBassCompanionCorpus.ts",
))) {
  await runCli();
}
