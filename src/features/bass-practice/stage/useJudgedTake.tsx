import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RecordCompareSection, type MidiRecordingCommands } from "../recording/ui/RecordCompareSection";
import type { RecordingTake } from "../recording/application/ports";
import { MidiBassPlayback } from "../midi/playback";
import { analyzeMidiBassRecording } from "../midi/analyzeRecording";
import type { BassAnalysis, BassJudgeSettings, BassPitchRule } from "../midi/analysis";
import type { MidiBassNote } from "../midi/model";
import { noteName } from "../midi/noteName";
import type { LaneNote } from "./Stage";

/**
 * P23-62: one judged take for any Bass practice — the same path the MIDI bassline has used since P13:
 * a bar of count-in clicks → record while the click (and the practice's chords) play → stop at the end of the
 * phrase → find the played notes on this PC → compare with the target. Nothing is kept unless 「残す」 is pressed.
 */

export type JudgedTakePhase = "idle" | "preparing" | "counting" | "recording" | "analyzing" | "done" | "failed";

export interface JudgedTakeOptions {
  readonly mode: "degree" | "rhythm" | "bassline" | "root-motion" | "midi-bassline";
  /** Changes when the phrase changes; the recorder starts fresh. */
  readonly resetKey: string;
  readonly practiceSessionId: string;
  /** The notes to play, from beat 0 of the phrase. */
  readonly target: readonly MidiBassNote[];
  readonly bpm: number;
  /** How long the take lasts in beats (the phrase and one beat of room at the end). */
  readonly lengthBeats: number;
  readonly beatsPerBar: number;
  /** Count-in clicks before the take; one bar (beatsPerBar) by default. */
  readonly countInBeats?: number;
  readonly pitchRule: BassPitchRule;
  /** The MIDI bassline's own 「判定の決まり」 (tolerance, latency); the Echo practices use the defaults. */
  readonly judge?: Partial<Omit<BassJudgeSettings, "pitchRule">>;
  /** The practice's chords during the take (Bassline only). */
  readonly accompaniment?: readonly MidiBassNote[];
  /** The click during the take. On by default — 「クリックに合わせて弾く」. */
  readonly click?: boolean;
  /** The kept take's id after 「録音を残す」 (for a practice that records it in its history). */
  readonly onTakeKept?: (reference: string) => void;
  /**
   * A practice with its own accompaniment engine (コード進行のベース): load it before the count-in (false = do
   * not record), start it when recording starts (return how many ms after now its beat 0 sounds), stop it.
   * When these are given, `accompaniment` and `click` are not played by the stage.
   */
  readonly prepareAccompaniment?: () => boolean | Promise<boolean>;
  readonly startAccompaniment?: () => number | void;
  readonly stopAccompaniment?: () => void;
}

/** P23-62: the judging rules every Echo practice uses — the MIDI bassline's 「ふつう」 and automatic latency. */
export const JUDGE: Omit<BassJudgeSettings, "pitchRule"> = { timingToleranceMs: 70, octaveCountsAsCorrect: true, autoLatencyCorrection: true };

export interface JudgedTake {
  readonly phase: JudgedTakePhase;
  /** 1…beatsPerBar during the count-in. */
  readonly count: number;
  /** Beat position while recording or playing back; undefined when still. */
  readonly beat?: number;
  readonly result?: BassAnalysis;
  readonly error?: string;
  readonly inputLevel: number;
  /** The recorder's own status (idle, ready, recording, recorded, saved, permission-denied, error, …). */
  readonly recorderStatus: string;
  /** True when this PC cannot record (no permission, no device, no API): use the self-rated path. */
  readonly unavailable: boolean;
  readonly playing: "target" | "take" | "overlay" | undefined;
  start(): void;
  stop(): void;
  reset(): void;
  playTarget(): void;
  playTake(): void;
  playOverlay(): void;
  stopPlayback(): void;
  keep(): void;
  /** The headless recorder; render it once anywhere inside the practice. */
  readonly recorder: ReactNode;
}

export function useJudgedTake(options: JudgedTakeOptions): JudgedTake {
  const { mode, resetKey, practiceSessionId, bpm, lengthBeats, beatsPerBar } = options;
  const playback = useMemo(() => new MidiBassPlayback(), []);
  const commands = useRef<MidiRecordingCommands | null>(null);
  const analysisRef = useRef<AbortController>();
  const softwareOffset = useRef(0);
  const countTimer = useRef<ReturnType<typeof setTimeout>>();
  const [phase, setPhase] = useState<JudgedTakePhase>("idle");
  const [count, setCount] = useState(1);
  const [beat, setBeat] = useState<number>();
  const [result, setResult] = useState<BassAnalysis>();
  const [error, setError] = useState<string>();
  const [inputLevel, setInputLevel] = useState(0);
  const [recorderStatus, setRecorderStatus] = useState("idle");
  const [playing, setPlaying] = useState<JudgedTake["playing"]>();
  const latest = useRef(options); latest.current = options;
  const durationMs = lengthBeats * 60_000 / bpm;

  const clearCount = () => { if (countTimer.current) clearTimeout(countTimer.current); countTimer.current = undefined; };
  const stopPlayback = useCallback(() => { playback.stop(); setPlaying(undefined); setBeat(undefined); }, [playback]);

  useEffect(() => () => { playback.stop(); analysisRef.current?.abort(); clearCount(); }, [playback]);
  // A new phrase: forget the last take.
  useEffect(() => {
    analysisRef.current?.abort(); clearCount(); playback.stop();
    setPhase("idle"); setResult(undefined); setError(undefined); setBeat(undefined); setPlaying(undefined);
  }, [playback, resetKey]);

  const completed = async (take: RecordingTake) => {
    clearCount();
    setPhase("analyzing"); setBeat(undefined); setError(undefined);
    const controller = new AbortController();
    analysisRef.current?.abort(); analysisRef.current = controller;
    const { target: notes, bpm: tempo, pitchRule: rule, judge } = latest.current;
    try {
      const measured = await analyzeMidiBassRecording(
        { ...take, metadata: { ...take.metadata, startOffsetMs: take.metadata.startOffsetMs + softwareOffset.current } },
        notes, tempo, { ...JUDGE, ...judge, pitchRule: rule }, controller.signal,
      );
      if (controller.signal.aborted) return;
      setResult(measured); setPhase("done");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "録音を判定できませんでした。");
      setPhase("failed");
    }
  };

  const countDown = () => {
    const { bpm: tempo, beatsPerBar: bar, countInBeats } = latest.current;
    const beats = countInBeats ?? bar;
    setPhase("counting"); setCount(1); playback.countIn(tempo, beats);
    let n = 1;
    const tick = () => { n += 1; if (n > beats) return; setCount(n); countTimer.current = setTimeout(tick, 60_000 / tempo); };
    countTimer.current = setTimeout(tick, 60_000 / tempo);
  };

  const start = useCallback(() => {
    if (phase === "counting" || phase === "recording" || phase === "analyzing" || phase === "preparing") return;
    stopPlayback(); setResult(undefined); setError(undefined);
    commands.current?.start();
  }, [phase, stopPlayback]);
  const stop = useCallback(() => { commands.current?.stop(); }, []);
  const reset = useCallback(() => { analysisRef.current?.abort(); stopPlayback(); setPhase("idle"); setResult(undefined); setError(undefined); }, [stopPlayback]);

  const playTarget = useCallback(() => {
    if (playing) { stopPlayback(); return; }
    const { target: notes, bpm: tempo, lengthBeats: beats, beatsPerBar: bar } = latest.current;
    void playback.prepare().then((ready) => {
      if (!ready) return;
      setPlaying("target"); setBeat(0);
      playback.start(notes, [], tempo, beats, false, setBeat, () => { setPlaying(undefined); setBeat(undefined); }, 0, bar);
    });
  }, [playback, playing, stopPlayback]);
  const playTake = useCallback(() => { stopPlayback(); setPlaying("take"); commands.current?.playTake(); }, [stopPlayback]);
  const playOverlay = useCallback(() => { stopPlayback(); setPlaying("overlay"); commands.current?.playOverlay(); }, [stopPlayback]);
  const keep = useCallback(() => { commands.current?.keep(); }, []);

  const unavailable = ["permission-denied", "device-missing", "unavailable"].includes(recorderStatus);
  useEffect(() => {
    if (recorderStatus === "recorded" || recorderStatus === "saved") setPlaying((current) => current === "take" || current === "overlay" ? undefined : current);
    if (unavailable || recorderStatus === "error") { clearCount(); setPhase((current) => current === "done" ? current : "failed"); setError((current) => current ?? (recorderStatus === "permission-denied" ? "マイクの使用が許可されませんでした。" : recorderStatus === "device-missing" ? "入力の機器が見つかりません。" : recorderStatus === "unavailable" ? "この環境では録音できません。" : "録音を始められませんでした。")); }
  }, [recorderStatus, unavailable]);

  const recorder = (
    <RecordCompareSection
      mode={mode}
      presentation="none"
      resetKey={resetKey}
      practiceSessionId={practiceSessionId}
      countInMs={(options.countInBeats ?? beatsPerBar) * 60_000 / bpm}
      onStatusChange={(status) => {
        setRecorderStatus(status);
        if (status === "preparing") setPhase("preparing");
      }}
      onInputLevel={setInputLevel}
      onTakeKept={(reference) => latest.current.onTakeKept?.(reference)}
      midiRecording={{
        durationMs,
        startOffsetMs: () => softwareOffset.current,
        commands,
        onCompleted: (take) => void completed(take),
        onCanceled: () => { clearCount(); playback.stop(); setBeat(undefined); setPhase("idle"); },
        onCountIn: countDown,
      }}
      onRecordingPrepare={async () => {
        setResult(undefined); setError(undefined);
        const ready = await playback.prepare();
        const own = latest.current.prepareAccompaniment;
        return ready && (own ? await own() : true);
      }}
      onRecordingStart={() => {
        clearCount(); setPhase("recording"); setBeat(0);
        const { accompaniment: chords, bpm: tempo, lengthBeats: beats, click: withClick = true, beatsPerBar: bar, startAccompaniment } = latest.current;
        if (startAccompaniment) {
          // The stage still moves the playhead (silently); the practice's engine plays the chords and click.
          const delay = playback.start([], [], tempo, beats, false, setBeat, () => undefined, 0, bar);
          const own = startAccompaniment();
          softwareOffset.current = typeof own === "number" ? own : delay;
          return;
        }
        softwareOffset.current = playback.start([], chords ?? [], tempo, beats, withClick, setBeat, () => undefined, 0, bar);
      }}
      onRecordingStop={() => { playback.stop(); latest.current.stopAccompaniment?.(); }}
      onPlaybackStart={() => { playback.stop(); }}
      targetPlayer={{
        prepare: () => playback.prepare(),
        play: (onEnded) => {
          const { target: notes, bpm: tempo, lengthBeats: beats, beatsPerBar: bar } = latest.current;
          setBeat(0);
          const delay = playback.start(notes, [], tempo, beats, false, setBeat, () => { setBeat(undefined); onEnded(); }, softwareOffset.current, bar);
          return { stop: () => playback.stop(), audioDelayMs: Math.max(0, delay - softwareOffset.current) };
        },
      }}
    />
  );

  return { phase, count, beat, result, error, inputLevel, recorderStatus, unavailable, playing, start, stop, reset, playTarget, playTake, playOverlay, stopPlayback, keep, recorder };
}

/**
 * P23-62: the rating a result suggests. Every note right with no hint → 簡単; every note right, or three in
 * four → 良い; half → 難しい; less → もう一度. A hint takes 簡単 down to 良い. The player can change it.
 */
export function suggestedRating(correct: number, total: number, hintsOpened: number): "again" | "hard" | "good" | "easy" {
  if (total <= 0) return "again";
  const ratio = correct / total;
  if (ratio >= 1) return hintsOpened === 0 ? "easy" : "good";
  if (ratio >= 0.75) return "good";
  if (ratio >= 0.5) return "hard";
  return "again";
}

/** 自分's row from a judged take: each note where it was played, marked; missed ones where they should be. */
export function takeNotes(result: BassAnalysis, bpm: number, lengthBeats: number, target?: readonly { readonly startBeat: number; readonly durationBeats: number }[]): LaneNote[] {
  const beatOf = (ms: number) => ms * bpm / 60_000;
  const clamp = (start: number, duration: number) => {
    const s = Math.max(0, Math.min(lengthBeats - 0.25, start));
    return { startBeat: s, durationBeats: Math.max(0.25, Math.min(lengthBeats - s, duration)) };
  };
  const usedExtras = new Set<number>();
  const notes: LaneNote[] = result.marks.map((mark, index) => {
    if (!mark.played) {
      const expected = target?.[mark.targetIndex] ?? { startBeat: 0, durationBeats: 0.5 };
      const windowEnd = expected.startBeat + expected.durationBeats;
      let bestIdx = -1;
      let bestDist = Infinity;
      result.extras.forEach((extra, extraIdx) => {
        if (usedExtras.has(extraIdx)) return;
        const extraBeat = beatOf(extra.onsetMs);
        if (extraBeat < expected.startBeat - 0.5 || extraBeat >= windowEnd) return;
        const dist = Math.abs(extraBeat - expected.startBeat);
        if (dist < bestDist) { bestDist = dist; bestIdx = extraIdx; }
      });
      if (bestIdx >= 0) {
        usedExtras.add(bestIdx);
        const extra = result.extras[bestIdx]!;
        const extraBeat = beatOf(extra.onsetMs);
        const late = extraBeat >= expected.startBeat;
        const kind = late ? "late" : "early";
        const word = late ? "大きく遅い" : "大きく早い";
        const name = noteName(Math.round(extra.pitch));
        return {
          ...clamp(extraBeat, beatOf(extra.offsetMs - extra.onsetMs)),
          kind,
          text: late ? "遅い" : "早い",
          sub: name,
          label: `自分 ${index + 1} 音目 ${word} ${name}(判定の幅の外)`,
        };
      }
      return { ...clamp(expected.startBeat, expected.durationBeats), kind: "miss", text: "抜け", label: `自分 ${index + 1} 音目 抜け` };
    }
    const played = mark.played;
    const place = clamp(beatOf(played.onsetMs), beatOf(played.offsetMs - played.onsetMs));
    const name = noteName(Math.round(played.pitch));
    const ms = Math.abs(Math.round(mark.offsetMs ?? 0));
    if (mark.kind === "ok") return { ...place, kind: "ok", text: "✓", sub: name, label: `自分 ${index + 1} 音目 合った ${name}` };
    if (mark.kind === "pitch") return { ...place, kind: "pitch", text: "✗", sub: name, label: `自分 ${index + 1} 音目 音が違う ${name}` };
    const word = mark.kind === "late" ? "遅い" : "早い";
    return { ...place, kind: mark.kind, text: word, sub: `${ms}ms`, label: `自分 ${index + 1} 音目 ${word} ${ms}ms ${name}` };
  });
  result.extras.forEach((extra, extraIdx) => {
    if (usedExtras.has(extraIdx)) return;
    const name = noteName(Math.round(extra.pitch));
    notes.push({ ...clamp(beatOf(extra.onsetMs), beatOf(extra.offsetMs - extra.onsetMs)), kind: "extra", text: "＋", sub: name, label: `自分 余分な音 ${name}` });
  });
  return notes;
}
