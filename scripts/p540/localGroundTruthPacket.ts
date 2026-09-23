/** Evaluation-only, source-first evidence for one local beat. No candidate imports. */
import type { MidiSongData } from "../../src/domain/midi/types";
import { selectChordEvidenceNotes } from "../../src/domain/midi/voices";
import {
  buildBlindExcerptMidi,
  type BlindNoteEvidence,
  type BlindRegionEvidence,
  type BlindTimeSlice,
} from "../p539/groundTruthPacket";

export type LocalStateId = "FC-SAFETY-03-L0" | "FC-SAFETY-03-L1";
export type LocalStateEvidence = Omit<BlindRegionEvidence, "id"> & { id: LocalStateId };

const pitchClass = (pitch: number): number => ((pitch % 12) + 12) % 12;
const round = (value: number): number => Math.round(value * 1000) / 1000;

export function buildLocalStateEvidence(
  data: MidiSongData,
  targetBeat: number,
  id: LocalStateId,
): LocalStateEvidence {
  if (!Number.isInteger(targetBeat) || targetBeat < 0 || data.ticksPerBeat <= 0) {
    throw new Error("Invalid local state boundary");
  }
  const contextBeforeBeats = Math.min(1, targetBeat);
  const contextAfterBeats = 1;
  const contextStart = targetBeat - contextBeforeBeats;
  const contextEnd = targetBeat + 2;
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
      onsetBeats: round(Math.max(onset, contextStart) - targetBeat),
      durationBeats: round(Math.min(end, contextEnd) - Math.max(onset, contextStart)),
      velocity: note.velocity,
      voice: voiceIds.indexOf(note.trackIndex) + 1,
      carriedIntoContext: onset < contextStart,
    };
  });
  const targetNotes = notes.filter((note) => note.onsetBeats < 1
    && note.onsetBeats + note.durationBeats > 0);
  if (!targetNotes.length) throw new Error("Local state has no source evidence");
  const lowestTargetPitchClass = pitchClass(Math.min(...targetNotes.map((note) => note.midiPitch)));
  const slices: BlindTimeSlice[] = [];
  for (let beat = -contextBeforeBeats; beat < 2; beat += 0.5) {
    const sounding = notes.filter((note) => note.onsetBeats < beat + 0.5
      && note.onsetBeats + note.durationBeats > beat);
    const attacks = notes.filter((note) => note.onsetBeats >= beat
      && note.onsetBeats < beat + 0.5 && !note.carriedIntoContext);
    slices.push({
      relativeBeat: beat,
      pitchClassesAboveLowestTarget: [...new Set(sounding.map((note) =>
        (pitchClass(note.midiPitch) - lowestTargetPitchClass + 12) % 12))].sort((a, b) => a - b),
      lowestMidiPitch: sounding.length ? Math.min(...sounding.map((note) => note.midiPitch)) : null,
      attackCount: attacks.length,
    });
  }
  return { id, contextBeforeBeats, targetDurationBeats: 1, contextAfterBeats,
    lowestTargetPitchClass, notes, slices };
}

const escape = (value: string | number): string => String(value).replace(/[&<>"']/g, (char) => (
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
));

export function renderLocalSourceOnly(regions: readonly LocalStateEvidence[]): string {
  const sections = regions.map((region) => {
    const notes = region.notes.map((note) => `<tr><td>${escape(note.onsetBeats)}</td><td>${escape(note.durationBeats)}</td><td>${escape(note.midiPitch)}</td><td>${escape(note.voice)}</td><td>${escape(note.velocity)}</td></tr>`).join("");
    const slices = region.slices.map((slice) => `<tr><td>${escape(slice.relativeBeat)}</td><td>${escape(slice.pitchClassesAboveLowestTarget.join(", "))}</td><td>${escape(slice.lowestMidiPitch ?? "—")}</td><td>${escape(slice.attackCount)}</td></tr>`).join("");
    return `<section><h2>${escape(region.id)}</h2><p>Target beat: 0–1. Context: ${escape(region.contextBeforeBeats)} beat before, 1 beat after. <a href="${escape(region.id)}.mid">Listen to source excerpt</a>.</p><p>Pitch-class offsets are relative to the lowest target pitch class, not a proposed root.</p><h3>Half-beat evidence</h3><table><thead><tr><th>Beat</th><th>PC offsets</th><th>Lowest MIDI pitch</th><th>Attacks</th></tr></thead><tbody>${slices}</tbody></table><h3>Source notes</h3><table><thead><tr><th>Onset</th><th>Duration</th><th>MIDI pitch</th><th>Voice</th><th>Velocity</th></tr></thead><tbody>${notes}</tbody></table></section>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local source review</title><style>body{font:16px system-ui;background:#101923;color:#edf5fb;margin:0}main{max-width:1000px;margin:auto;padding:24px}section{border:1px solid #426070;border-radius:8px;padding:16px;margin:20px 0;overflow:auto}a{color:#6de0d5}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #354858;padding:6px;text-align:left}</style></head><body><main><h1>Independent local-state source review</h1><p>Review each target beat from source notes and audio. Record an interpretation, or uncertainty, before consulting any candidate identity or score.</p>${sections}</main></body></html>`;
}

export function buildLocalSourceExcerpts(regions: readonly LocalStateEvidence[], bpm: number) {
  return regions.map((region) => ({ id: region.id, bytes: buildBlindExcerptMidi(region, bpm) }));
}
