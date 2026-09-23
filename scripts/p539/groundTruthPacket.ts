import { Midi } from "@tonejs/midi";

import { diagnoseLegacyWindowCandidates } from "../../src/domain/midi/legacy";
import { parseMidi } from "../../src/domain/midi/parser";
import { phase4QualityEvidence } from "../../src/domain/midi/phase4Analyzer";
import type { MidiSongData } from "../../src/domain/midi/types";
import { selectChordEvidenceNotes } from "../../src/domain/midi/voices";
import {
  parseShadowChordLabel,
  shadowIdentityKey,
} from "./shadowRootRelativeIdentity";
import { rankStage02ShadowCandidates } from "./shadowCandidateRanking";

export type AnonymousRegionId = "FC-REAL-01" | "FC-REAL-02"
  | "FC-SAFETY-01" | "FC-SAFETY-02" | "FC-SAFETY-03";

export interface BlindNoteEvidence {
  midiPitch: number;
  onsetBeats: number;
  durationBeats: number;
  velocity: number;
  voice: number;
  carriedIntoContext: boolean;
}

export interface BlindTimeSlice {
  relativeBeat: number;
  pitchClassesAboveLowestTarget: number[];
  lowestMidiPitch: number | null;
  attackCount: number;
}

export interface BlindRegionEvidence {
  id: AnonymousRegionId;
  contextBeforeBeats: number;
  targetDurationBeats: number;
  contextAfterBeats: number;
  lowestTargetPitchClass: number;
  notes: BlindNoteEvidence[];
  slices: BlindTimeSlice[];
}

export interface LocalRegionBinding {
  id: AnonymousRegionId;
  windowIndex: number;
  startBeat: number;
  choices: {
    A: { origin: "legacy" | "shadow"; label: string };
    B: { origin: "legacy" | "shadow"; label: string };
  };
}

export interface GroundTruthPacket {
  blindRegions: BlindRegionEvidence[];
  localBindings: LocalRegionBinding[];
  excerpts: Array<{ id: AnonymousRegionId; bytes: Uint8Array }>;
}

function pitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function maxIndex(values: readonly number[]): number {
  return values.reduce((best, value, index) => value > values[best] ? index : best, 0);
}

/** Selection uses the frozen comparison; no winner, rank, or score enters the blind evidence. */
export function changedRegionIndices(bytes: Uint8Array): Array<{
  index: number;
  legacyLabel: string;
  shadowLabel: string;
}> {
  const diagnostics = diagnoseLegacyWindowCandidates(bytes, {
    useQualityEvidence: true,
    qualityEvidence: phase4QualityEvidence,
  });
  return diagnostics.flatMap((diagnostic, index) => {
    if (diagnostic.totalWeight <= 0 || diagnostic.noteCount === 0) return [];
    if (!diagnostic.histogram || !diagnostic.bassHistogram || !diagnostic.candidates[0]) {
      throw new Error("Private window evidence is unavailable");
    }
    const legacyLabel = diagnostic.candidates[0].chord.label;
    const legacyIdentity = parseShadowChordLabel(legacyLabel);
    const shadow = rankStage02ShadowCandidates({
      histogram: diagnostic.histogram,
      bassPitchClass: maxIndex(diagnostic.bassHistogram),
    }).topCandidate;
    return shadowIdentityKey(legacyIdentity) === shadow.identityKey
      ? []
      : [{ index, legacyLabel, shadowLabel: shadow.canonicalLabel }];
  });
}

export function buildBlindRegionEvidence(
  data: MidiSongData,
  startBeat: number,
  id: AnonymousRegionId,
): BlindRegionEvidence {
  const contextBeforeBeats = Math.min(1, startBeat);
  const contextAfterBeats = 1;
  const targetDurationBeats = 2;
  const contextStart = startBeat - contextBeforeBeats;
  const contextEnd = startBeat + targetDurationBeats + contextAfterBeats;
  const overlapping = selectChordEvidenceNotes(data.notes)
    .filter((note) => {
      const onset = note.startTick / data.ticksPerBeat;
      const end = (note.startTick + note.durationTick) / data.ticksPerBeat;
      return onset < contextEnd && end > contextStart;
    })
    .sort((left, right) => left.startTick - right.startTick
      || left.pitch - right.pitch || left.trackIndex - right.trackIndex);
  const voiceIds = [...new Set(overlapping.map((note) => note.trackIndex))].sort((a, b) => a - b);
  const notes = overlapping.map((note): BlindNoteEvidence => {
    const onset = note.startTick / data.ticksPerBeat;
    const end = (note.startTick + note.durationTick) / data.ticksPerBeat;
    return {
      midiPitch: note.pitch,
      onsetBeats: round(Math.max(onset, contextStart) - startBeat),
      durationBeats: round(Math.min(end, contextEnd) - Math.max(onset, contextStart)),
      velocity: note.velocity,
      voice: voiceIds.indexOf(note.trackIndex) + 1,
      carriedIntoContext: onset < contextStart,
    };
  });
  const targetNotes = notes.filter((note) => (
    note.onsetBeats < targetDurationBeats
      && note.onsetBeats + note.durationBeats > 0
  ));
  if (targetNotes.length === 0) throw new Error("Target window has no source note evidence");
  const lowestTargetPitchClass = pitchClass(Math.min(...targetNotes.map((note) => note.midiPitch)));
  const slices: BlindTimeSlice[] = [];
  for (let beat = -contextBeforeBeats; beat < targetDurationBeats + contextAfterBeats; beat += 0.5) {
    const sounding = notes.filter((note) => note.onsetBeats < beat + 0.5
      && note.onsetBeats + note.durationBeats > beat);
    const attacks = notes.filter((note) => note.onsetBeats >= beat
      && note.onsetBeats < beat + 0.5 && !note.carriedIntoContext);
    slices.push({
      relativeBeat: beat,
      pitchClassesAboveLowestTarget: [...new Set(sounding.map((note) => (
        (pitchClass(note.midiPitch) - lowestTargetPitchClass + 12) % 12
      )))].sort((a, b) => a - b),
      lowestMidiPitch: sounding.length ? Math.min(...sounding.map((note) => note.midiPitch)) : null,
      attackCount: attacks.length,
    });
  }
  return {
    id,
    contextBeforeBeats,
    targetDurationBeats,
    contextAfterBeats,
    lowestTargetPitchClass,
    notes,
    slices,
  };
}

export function buildBlindExcerptMidi(region: BlindRegionEvidence, bpm: number): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const track = midi.addTrack();
  const offset = region.contextBeforeBeats;
  for (const note of region.notes) {
    if (note.durationBeats <= 0) continue;
    track.addNote({
      midi: note.midiPitch,
      ticks: Math.round((note.onsetBeats + offset) * midi.header.ppq),
      durationTicks: Math.max(1, Math.round(note.durationBeats * midi.header.ppq)),
      velocity: Math.max(0, Math.min(1, note.velocity / 127)),
    });
  }
  return new Uint8Array(midi.toArray());
}

/** Generates local-only source evidence; labels live only in the separate sealed binding. */
export function buildGroundTruthPacket(bytes: Uint8Array): GroundTruthPacket {
  const before = Uint8Array.from(bytes);
  const data = parseMidi(bytes);
  const changed = changedRegionIndices(bytes);
  if (changed.length !== 2) throw new Error("Expected exactly two changed private regions");
  const ids: readonly AnonymousRegionId[] = ["FC-REAL-01", "FC-REAL-02"];
  const blindRegions = changed.map((entry, ordinal) => (
    buildBlindRegionEvidence(data, entry.index * 2, ids[ordinal])
  ));
  const localBindings = changed.map((entry, ordinal): LocalRegionBinding => {
    const legacy = { origin: "legacy" as const, label: entry.legacyLabel };
    const shadow = { origin: "shadow" as const, label: entry.shadowLabel };
    return {
      id: ids[ordinal],
      windowIndex: entry.index,
      startBeat: entry.index * 2,
      choices: ordinal === 0 ? { A: legacy, B: shadow } : { A: shadow, B: legacy },
    };
  });
  if (before.length !== bytes.length || before.some((value, index) => value !== bytes[index])) {
    throw new Error("Private source bytes changed during packet generation");
  }
  const excerpts = blindRegions.map((region) => ({
    id: region.id,
    bytes: buildBlindExcerptMidi(region, data.tempo ?? 120),
  }));
  return { blindRegions, localBindings, excerpts };
}

export function renderBlindReview(regions: readonly BlindRegionEvidence[]): string {
  const escape = (value: string | number) => String(value).replace(/[&<>"']/g, (char) => (
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  ));
  const sections = regions.map((region) => {
    const notes = region.notes.map((note) => `<tr><td>${escape(note.onsetBeats)}</td><td>${escape(note.durationBeats)}</td><td>${escape(note.midiPitch)}</td><td>${escape(note.voice)}</td><td>${escape(note.velocity)}</td><td>${note.carriedIntoContext ? "yes" : "no"}</td></tr>`).join("");
    const slices = region.slices.map((slice) => `<tr><td>${escape(slice.relativeBeat)}</td><td>${escape(slice.pitchClassesAboveLowestTarget.join(", "))}</td><td>${escape(slice.lowestMidiPitch ?? "—")}</td><td>${escape(slice.attackCount)}</td></tr>`).join("");
    return `<section><h2>${escape(region.id)}</h2><p>Target: beat 0–2. Context: ${escape(region.contextBeforeBeats)} beat before and ${escape(region.contextAfterBeats)} beat after. <a href="${escape(region.id)}.mid">Listen to the short MIDI excerpt</a>.</p><p>Pitch-class offsets are relative to the lowest target pitch class, not an assumed chord root.</p><h3>Half-beat evidence</h3><table><thead><tr><th>Beat</th><th>PC offsets</th><th>Lowest MIDI pitch</th><th>Attacks</th></tr></thead><tbody>${slices}</tbody></table><h3>Source notes</h3><table><thead><tr><th>Onset</th><th>Duration</th><th>MIDI pitch</th><th>Voice</th><th>Velocity</th><th>Carried in</th></tr></thead><tbody>${notes}</tbody></table><p>Write your own chord interpretation and confidence before opening the separate candidate-choices page.</p></section>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blind Family-C review</title><style>body{font:16px system-ui;background:#101923;color:#edf5fb;margin:0}main{max-width:1000px;margin:auto;padding:24px}section{border:1px solid #426070;border-radius:8px;padding:16px;margin:20px 0;overflow:auto}a{color:#6de0d5}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #354858;padding:6px;text-align:left}</style></head><body><main><h1>Independent source review</h1><p>These anonymous excerpts contain only source note evidence. Listen and note a free-form interpretation before opening the separate candidate-choices page.</p>${sections}</main></body></html>`;
}

export function renderBlindChoices(bindings: readonly LocalRegionBinding[]): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => (
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  ));
  const sections = bindings.map((binding) => `<section><h2>${escape(binding.id)}</h2><p>A: ${escape(binding.choices.A.label)}</p><p>B: ${escape(binding.choices.B.label)}</p><p>Choose A, B, both plausible, or neither / insufficient. The origin of A/B is hidden.</p></section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Anonymous chord choices</title><style>body{font:16px system-ui;background:#101923;color:#edf5fb;margin:0}main{max-width:900px;margin:auto;padding:24px}section{border:1px solid #426070;border-radius:8px;padding:16px;margin:20px 0}</style></head><body><main><h1>Candidate interpretations</h1><p>Open only after reviewing the source-only evidence. A and B do not reveal which system proposed them.</p>${sections}</main></body></html>`;
}
