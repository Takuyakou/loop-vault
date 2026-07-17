import { createLiveNoteState, parseNoteKey, toNoteKey } from "./noteState";
import type { LiveMidiDomainEvent, LiveNoteState } from "./types";

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const SUSTAIN_CONTROLLER = 64;

export function reduceLiveNoteState(
  state: LiveNoteState,
  event: LiveMidiDomainEvent,
): LiveNoteState {
  const next = cloneState(state);
  const status = event.status & 0xf0;
  if (status === NOTE_ON && event.data2 > 0) {
    noteOn(next, event.channel, event.data1, event.data2, event.timestampMs);
  } else if (status === NOTE_OFF || (status === NOTE_ON && event.data2 === 0)) {
    noteOff(next, event.channel, event.data1, event.timestampMs);
  } else if (status === CONTROL_CHANGE && event.data1 === SUSTAIN_CONTROLLER) {
    sustain(next, event.channel, event.data2 >= 64);
  }
  return next;
}

export function clearLiveNoteState(): LiveNoteState {
  return createLiveNoteState();
}

function noteOn(
  state: LiveNoteState,
  channel: number,
  note: number,
  velocity: number,
  timestampMs: number,
) {
  const key = toNoteKey(channel, note);
  const previous = state.held.get(key);
  state.sustained.delete(key);
  state.held.set(key, {
    count: (previous?.count ?? 0) + 1,
    velocity,
    sinceMs: previous?.sinceMs ?? timestampMs,
    lastEventMs: timestampMs,
  });
}

function noteOff(state: LiveNoteState, channel: number, note: number, timestampMs: number) {
  const key = toNoteKey(channel, note);
  const previous = state.held.get(key);
  if (!previous) return;
  if (previous.count > 1) {
    state.held.set(key, { ...previous, count: previous.count - 1, lastEventMs: timestampMs });
    return;
  }
  state.held.delete(key);
  if (state.pedalByChannel.get(channel)) state.sustained.add(key);
}

function sustain(state: LiveNoteState, channel: number, enabled: boolean) {
  state.pedalByChannel.set(channel, enabled);
  if (enabled) return;
  for (const key of state.sustained) {
    if (parseNoteKey(key).channel === channel) state.sustained.delete(key);
  }
}

function cloneState(state: LiveNoteState): LiveNoteState {
  return {
    held: new Map([...state.held].map(([key, value]) => [key, { ...value }])),
    sustained: new Set(state.sustained),
    pedalByChannel: new Map(state.pedalByChannel),
  };
}
