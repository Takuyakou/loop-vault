import type { MidiPreviewNote, MidiPreviewSound } from "./chordPreview";
import type { PlaybackController, PlayingSource } from "./playbackController";

export type TextTransportStatus = "stopped" | "playing" | "paused";
export interface TextPlaybackSnapshot {
  readonly notes: readonly MidiPreviewNote[];
  readonly lengthBeats: number;
  readonly beatsPerBar: number;
  readonly sourceText: string;
}
export interface TextTransportState {
  readonly status: TextTransportStatus;
  readonly positionBeats: number;
  readonly playAnchor: number;
  readonly bpm: number;
  readonly loop: boolean;
  readonly snapshot?: TextPlaybackSnapshot;
}
export interface TextTransport {
  getState(): TextTransportState;
  position(): number;
  play(snapshot?: TextPlaybackSnapshot): void;
  pause(): void;
  stop(): void;
  seek(beat: number): void;
  beginning(): void;
  setBpm(bpm: number): void;
  setLoop(loop: boolean): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

/**
 * Text-only transport over the existing audio controller. The score snapshot is
 * copied at Play; trims are made in musical beats, never by bar approximation.
 */
export function createTextTransport(
  controller: PlaybackController,
  source: PlayingSource,
  sound: MidiPreviewSound = "electric-piano",
  now: () => number = () => performance.now(),
): TextTransport {
  let state: TextTransportState = {
    status: "stopped", positionBeats: 0, playAnchor: 0, bpm: 120, loop: false,
  };
  let startedAt = 0;
  let startBeat = 0;
  let generation = 0;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  const clearEnd = () => { if (endTimer !== undefined) clearTimeout(endTimer); endTimer = undefined; };
  const currentPosition = () => state.status === "playing" && state.snapshot
    ? Math.min(state.snapshot.lengthBeats, startBeat + Math.max(0, now() - startedAt) * state.bpm / 60000)
    : state.positionBeats;
  const clamp = (beat: number, length: number) => Number.isFinite(beat)
    ? Math.max(0, Math.min(length, beat)) : 0;

  function finish(epoch: number) {
    if (epoch !== generation || state.status !== "playing" || !state.snapshot) return;
    if (state.loop) {
      launch(0, true);
    } else {
      generation += 1;
      clearEnd();
      controller.stop();
      state = { ...state, status: "stopped", positionBeats: state.playAnchor, snapshot: undefined };
      emit();
    }
  }

  function launch(beat: number, includeSustain: boolean) {
    const snapshot = state.snapshot;
    if (!snapshot) return;
    generation += 1;
    const epoch = generation;
    clearEnd();
    const position = clamp(beat, snapshot.lengthBeats);
    if (position >= snapshot.lengthBeats) {
      finish(epoch);
      return;
    }
    startBeat = position;
    startedAt = now();
    state = { ...state, status: "playing", positionBeats: position };
    emit();
    const notes = sliceTextNotes(snapshot.notes, position, includeSustain);
    if (notes.length) {
      void controller.play(source, { type: "notes", notes, bpm: state.bpm, sound, dynamicTempo: true }, {
        onStarted() {
          if (epoch !== generation) return;
          startedAt = now();
          clearEnd();
          endTimer = setTimeout(() => finish(epoch), (snapshot.lengthBeats - position) * 60000 / state.bpm);
        },
        onEnded(reason) {
          if (epoch !== generation) return;
          // Audio can end before the score when the final bars are rests.
          // The musical-length timer, not the last sounded note, owns completion.
          if (reason === "completed") return;
          else {
            generation += 1;
            clearEnd();
            state = { ...state, status: "stopped", positionBeats: state.playAnchor, snapshot: undefined };
            emit();
          }
        },
      }).catch(() => {
        if (epoch !== generation) return;
        generation += 1;
        clearEnd();
        state = { ...state, status: "stopped", positionBeats: state.playAnchor, snapshot: undefined };
        emit();
      });
    } else {
      controller.stop();
    }
    if (!notes.length) endTimer = setTimeout(() => finish(epoch),
      (snapshot.lengthBeats - position) * 60000 / state.bpm);
  }

  return {
    getState: () => state,
    position: currentPosition,
    play(snapshot) {
      if (state.status === "playing") return;
      if (state.status === "stopped") {
        if (!snapshot || snapshot.lengthBeats <= 0) return;
        const frozen = { ...snapshot, notes: snapshot.notes.map(note => ({ ...note })) };
        const position = clamp(state.positionBeats, frozen.lengthBeats);
        state = { ...state, snapshot: frozen, playAnchor: position, positionBeats: position };
      }
      launch(state.positionBeats, true);
    },
    pause() {
      if (state.status !== "playing") return;
      const position = currentPosition();
      generation += 1;
      clearEnd();
      controller.stop();
      state = { ...state, status: "paused", positionBeats: position };
      emit();
    },
    stop() {
      if (state.status === "stopped") return;
      generation += 1;
      clearEnd();
      controller.stop();
      state = { ...state, status: "stopped", positionBeats: state.playAnchor, snapshot: undefined };
      emit();
    },
    seek(beat) {
      const length = state.snapshot?.lengthBeats ?? Number.MAX_SAFE_INTEGER;
      const position = clamp(beat, length);
      if (state.status === "playing") launch(position, true);
      else { state = { ...state, positionBeats: position }; emit(); }
    },
    beginning() {
      if (state.status === "playing") launch(0, true);
      else { state = { ...state, positionBeats: 0 }; emit(); }
    },
    setBpm(bpm) {
      if (!Number.isFinite(bpm)) return;
      const value = Math.max(30, Math.min(240, Math.round(bpm)));
      if (value === state.bpm) return;
      const position = currentPosition();
      state = { ...state, bpm: value, positionBeats: position };
      if (state.status === "playing") {
        if (controller.updateNotesBpm?.(source, value)) {
          startBeat = position; startedAt = now();
          generation += 1;
          const epoch = generation;
          clearEnd();
          if (state.snapshot) endTimer = setTimeout(() => finish(epoch),
            (state.snapshot.lengthBeats - position) * 60000 / value);
          emit();
        } else launch(position, false);
      } else emit();
    },
    setLoop(loop) { if (loop !== state.loop) { state = { ...state, loop }; emit(); } },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { generation += 1; clearEnd(); if (state.status === "playing") controller.stop(); listeners.clear(); },
  };
}

/** Crossing notes are resumed after Pause/Seek but skipped on live BPM reschedule. */
export function sliceTextNotes(notes: readonly MidiPreviewNote[], beat: number, includeSustain: boolean): MidiPreviewNote[] {
  const epsilon = 1e-6;
  return notes.flatMap(note => {
    const end = note.startBeat + note.durationBeats;
    if (end <= beat + epsilon) return [];
    if (note.startBeat < beat - epsilon) {
      return includeSustain ? [{ ...note, startBeat: 0, durationBeats: end - beat }] : [];
    }
    return [{ ...note, startBeat: Math.max(0, note.startBeat - beat) }];
  });
}
