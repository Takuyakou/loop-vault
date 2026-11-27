/**
 * P25-11 I: Voicing Loop's play-along, wired to the pure judgement (`playAlong.ts`). The view tells it where the
 * ear is (from the playhead's own audio-clock position) and it listens to the live MIDI notes. Nothing here runs
 * inside the 60fps drawing: a card change found by a frame is applied once, in a `setTimeout`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChordSymbol } from "../../domain/types";
import { heldNotes, sustainedNotes } from "../../domain/liveMidi";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import type { ProgressionPracticeVoicingPlan, ProgressionVoicingPracticeSnapshot } from "../../domain/progressionVoicingPractice/types";
import {
  achievement, createPlayAlongState, enterCard, pausePlayAlong, resetPlayAlong, updateNotes,
  type NoteJudgement, type PlayAlongCard, type PlayAlongMode, type PlayAlongState,
} from "../../domain/progressionVoicingPractice/playAlong";

export const PLAY_ALONG_KEY = "lv-voicing-loop-play-along";
export const PLAY_ALONG_MODE_KEY = "lv-voicing-loop-play-along-mode";

/** I2: the switch and the judgement, kept on this PC (unreadable → OFF, コード一致). */
export function readPlayAlongPreference(): { readonly on: boolean; readonly mode: PlayAlongMode } {
  try {
    return {
      on: window.localStorage.getItem(PLAY_ALONG_KEY) === "on",
      mode: window.localStorage.getItem(PLAY_ALONG_MODE_KEY) === "exact" ? "exact" : "chord",
    };
  } catch { return { on: false, mode: "chord" }; }
}

export function writePlayAlongPreference(on: boolean, mode: PlayAlongMode): void {
  try {
    window.localStorage.setItem(PLAY_ALONG_KEY, on ? "on" : "off");
    window.localStorage.setItem(PLAY_ALONG_MODE_KEY, mode);
  } catch { /* the setting only lives for this session */ }
}

export interface AudiblePosition {
  readonly spanIndex: number;
  readonly loop: number;
  readonly inCountIn: boolean;
}

const EMPTY_JUDGEMENT: NoteJudgement = { keys: new Map(), complete: false };

export function usePlayAlong({ active, mode, snapshot, plan, status, bpm, position, range }: {
  readonly active: boolean;
  readonly mode: PlayAlongMode;
  readonly snapshot: ProgressionVoicingPracticeSnapshot | undefined;
  readonly plan: ProgressionPracticeVoicingPlan | undefined;
  readonly status: string | undefined;
  readonly bpm: number;
  /** Where the ear is now (the playhead's audio-clock position). */
  readonly position: () => AudiblePosition | undefined;
  readonly range?: { readonly first: number; readonly last: number };
}) {
  /** The timeline cards (spans) as the judgement sees them; a rest or an unusable card has no target. */
  const cards = useMemo<PlayAlongCard[]>(() => (snapshot?.spans ?? []).map((span) => {
    if (span.kind !== "chord") return { startBeat: span.startBeat, durationBeats: span.durationBeats };
    const resolution = plan?.events[span.eventIndex];
    const event = snapshot!.events[span.eventIndex];
    if (resolution?.status !== "SUPPORTED" || !event) return { startBeat: span.startBeat, durationBeats: span.durationBeats };
    return { startBeat: span.startBeat, durationBeats: span.durationBeats, target: resolution.voicing.midiNotes, chord: event.chord as unknown as ChordSymbol };
  }), [plan, snapshot]);
  const [state, setState] = useState<PlayAlongState>(createPlayAlongState);
  const [judgement, setJudgement] = useState<NoteJudgement>(EMPTY_JUDGEMENT);
  const stateRef = useRef(state);
  stateRef.current = state;
  const live = useRef({ active, mode, cards, status, bpm, position });
  live.current = { active, mode, cards, status, bpm, position };

  /** Judge the notes held now against the card the ear is in (entering it first when it changed). */
  const judgeNow = useCallback(() => {
    const { active: on, cards: list, mode: judgeMode, status: clockStatus, bpm: tempo, position: where } = live.current;
    if (!on) return;
    const at = where();
    if (!at) return;
    const now = performance.now();
    let next = stateRef.current;
    if (at.spanIndex !== next.current || at.loop !== next.loop) next = enterCard(next, list, at.spanIndex, at.loop, now);
    const notes = defaultLiveMidiStore.getState().notes;
    const update = updateNotes(next, list, {
      mode: judgeMode, held: heldNotes(notes), sustained: sustainedNotes(notes), nowMs: now, msPerBeat: 60000 / (tempo || 120),
      counting: clockStatus === "running" && !at.inCountIn,
    });
    stateRef.current = update.state;
    setState(update.state);
    setJudgement(update.judgement);
  }, []);

  // I3-1: a MIDI change is judged at the ear's position at that moment.
  useEffect(() => {
    if (!active) return undefined;
    return defaultLiveMidiStore.subscribe((next, previous) => { if (next.notes !== previous.notes) judgeNow(); });
  }, [active, judgeNow]);

  // I3-7: pause re-judges the current card; stop, a new voicing / key / octave or OFF clears everything.
  useEffect(() => {
    if (status === "paused") { stateRef.current = pausePlayAlong(stateRef.current); setState(stateRef.current); }
  }, [status]);
  useEffect(() => {
    if (active && status !== "stopped" && status !== "ready") return;
    stateRef.current = resetPlayAlong(); setState(stateRef.current); setJudgement(EMPTY_JUDGEMENT);
  }, [active, status]);
  useEffect(() => { stateRef.current = resetPlayAlong(); setState(stateRef.current); setJudgement(EMPTY_JUDGEMENT); }, [plan?.snapshotFingerprint, mode]);

  /**
   * I3-1: called by the drawing for each frame with the card the ear is in. Only a reference comparison here;
   * a change schedules one state update (at most once per card).
   */
  const pending = useRef<string>();
  const onFrame = useCallback((at: AudiblePosition) => {
    if (!live.current.active) return;
    const current = stateRef.current;
    const key = `${at.spanIndex}:${at.loop}`;
    if ((at.spanIndex === current.current && at.loop === current.loop) || pending.current === key) return;
    pending.current = key;
    setTimeout(() => { pending.current = undefined; judgeNow(); }, 0);
  }, [judgeNow]);

  const marks = useMemo(() => {
    const out = new Map<number, "ok" | "wrong">();
    judgement.keys.forEach((mark, note) => { if (mark === "ok" || mark === "wrong") out.set(note, mark); });
    return out;
  }, [judgement]);
  const count = useMemo(() => achievement(state, cards, range), [cards, range, state]);
  return { state, marks, count, onFrame, cards };
}
