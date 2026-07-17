import { normalizePc } from "../chords";
import type { LiveNoteState } from "./types";

export function createLiveNoteState(): LiveNoteState {
  return { held: new Map(), sustained: new Set(), pedalByChannel: new Map() };
}

export function toNoteKey(channel: number, note: number): string {
  return `${channel}:${note}`;
}

export function parseNoteKey(key: string): { channel: number; note: number } {
  const [channel, note] = key.split(":").map(Number);
  return { channel, note };
}

export function soundingNotes(state: LiveNoteState): number[] {
  return [...new Set([...state.held.keys(), ...state.sustained].map((key) => parseNoteKey(key).note))]
    .sort((left, right) => left - right);
}

export function soundingPitchClasses(state: LiveNoteState): number[] {
  return [...new Set(soundingNotes(state).map(normalizePc))].sort((left, right) => left - right);
}

export function heldNotes(state: LiveNoteState): number[] {
  return [...state.held.keys()].map((key) => parseNoteKey(key).note).sort((left, right) => left - right);
}

export function sustainedNotes(state: LiveNoteState): number[] {
  return [...state.sustained].map((key) => parseNoteKey(key).note).sort((left, right) => left - right);
}
