import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Tone from "tone";
import { Button, Chip, IconButton, Popover, SegmentedControl, Select } from "../../../components/ui";
import { useMetronome } from "../../../components/MetronomeProvider";
import { STANDARD_BASS_TUNINGS } from "../domain/constants";
import { fretboardPositions } from "../domain/mapping";
import { EchoPracticeFrame, useEchoActive } from "../ui/EchoPracticeFrame";
import {
  StageButton,
  StageCount,
  StageFrame,
  StageFretboard,
  StageLane,
  StageMeter,
  StagePlayButton,
  StageResultHead,
  StageTools,
  type LaneNote,
  type ResultFact,
  type StageStep,
} from "../stage/Stage";
import { takeNotes, useJudgedTake, type JudgedTakePhase } from "../stage/useJudgedTake";
import { MidiBassPlayback } from "./playback";
import { MIDI_BASS_FEEDBACK_QUALIFIED } from "./qualification";
import type { BassAnalysis } from "./analysis";
import { midiBassWindow, bestMidiBassAttempt, type MidiBassSong, type MidiBassSettings } from "./model";
import { noteName } from "./noteName";
import type { DegreeUiSettings } from "../ui/BassPracticeView";

export interface MidiBassPracticeProps {
  song: MidiBassSong;
  settings: MidiBassSettings;
  instrument: DegreeUiSettings;
  onBack: () => void;
  onSongChange: (song: MidiBassSong) => Promise<void>;
  onSettingsChange: (settings: MidiBassSettings) => Promise<void>;
}

const RUNNING_PHASES = new Set<JudgedTakePhase>(["preparing", "counting", "recording", "analyzing"]);
const TOLERANCE_LABELS: Record<MidiBassSettings["timingToleranceMs"], string> = {
  50: "きびしい ±50ms",
  70: "ふつう ±70ms",
  100: "ゆるい ±100ms",
};

function textWidthPx(text: string): number {
  return [...text].reduce((sum, ch) => sum + (/[\u0020-\u007e♭♯✓✗＋]/.test(ch) ? 8 : 12.5), 0);
}

function fitLaneNote(note: LaneNote, lengthBeats: number, minBeatPx: number): LaneNote {
  // StageLane sets padding-inline:5px (10px) + 4px margin in P23-64 CSS; keep text within box bounds so heavy jitter never overflows.
  const beatPx = Math.max(minBeatPx, 860 / Math.max(1, lengthBeats));
  const innerPx = note.durationBeats * beatPx - 14;
  if (!note.text) return note;
  const sub = note.sub && textWidthPx(note.text) + 4 + textWidthPx(note.sub) <= innerPx ? note.sub : undefined;
  if (textWidthPx(note.text) <= innerPx) return sub === note.sub ? note : { ...note, sub };
  const compact = note.kind === "ok" ? "✓" : note.kind === "pitch" ? "✗" : undefined;
  const text = compact && textWidthPx(compact) <= innerPx ? compact : undefined;
  return { ...note, text, sub: undefined };
}

export function MidiBassPractice({ song, settings, instrument, onBack, onSongChange, onSettingsChange }: MidiBassPracticeProps) {
  const [startBar, setStartBar] = useState(1);
  const [bars, setBars] = useState(settings.defaultWindowBars);
  const [tempo, setTempo] = useState(settings.defaultTempoPercent);
  const [showFret, setShowFret] = useState(false);
  const [reference, setReference] = useState(true);
  const [accompaniment, setAccompaniment] = useState(true);
  const [listening, setListening] = useState(false);
  const [listenBeat, setListenBeat] = useState<number>();
  const [notice, setNotice] = useState<string>();

  const playback = useMemo(() => new MidiBassPlayback(), []);
  const { enabled: click, setEnabled: setClick } = useMetronome();
  const window = useMemo(() => midiBassWindow(song, startBar, bars, tempo), [song, startBar, bars, tempo]);
  const resetKey = `${song.id}:${window.startBar}:${bars}:${tempo}`;
  const totalBars = Math.ceil(song.lengthBeats / 4);
  const best = bestMidiBassAttempt(song);
  const chordLabels = useMemo(
    () => song.chordLabels?.filter((c) => c.startBeat >= window.startBeat && c.startBeat < window.startBeat + window.lengthBeats)
      .map((c) => ({ startBeat: c.startBeat - window.startBeat, label: c.label })) ?? [],
    [song.chordLabels, window.startBeat, window.lengthBeats],
  );
  const accompanimentNotes = useMemo(
    () => (accompaniment ? window.accompaniment.flatMap((t) => t.notes) : []),
    [accompaniment, window.accompaniment],
  );
  const sessionIdRef = useRef(0);
  const practiceSessionId = useMemo(() => `midi-bassline-${song.id}-${++sessionIdRef.current}`, [song.id]);

  const stopListen = useCallback(() => {
    playback.stop();
    setListening(false);
    setListenBeat(undefined);
  }, [playback]);

  useEffect(() => () => { playback.stop(); }, [playback]);

  const audioOptions = useRef({ reference, accompaniment, click, window });
  audioOptions.current = { reference, accompaniment, click, window };

  const take = useJudgedTake({
    mode: "midi-bassline",
    resetKey,
    practiceSessionId,
    target: window.bass,
    bpm: window.bpm,
    lengthBeats: window.lengthBeats,
    beatsPerBar: 4,
    pitchRule: settings.octaveCountsAsCorrect ? "octave" : "exact",
    judge: {
      timingToleranceMs: settings.timingToleranceMs,
      autoLatencyCorrection: settings.autoLatencyCorrection,
    },
    accompaniment: accompanimentNotes,
    click,
  });

  const takeRunning = RUNNING_PHASES.has(take.phase);
  const locked = takeRunning;

  // Record cancellation notice when a running take is stopped before completion or failure.
  const prevPhaseRef = useRef<JudgedTakePhase>(take.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = take.phase;
    if (RUNNING_PHASES.has(prev) && take.phase === "idle" && !take.result) {
      setNotice("途中で止めたため、判定・記録は行っていません。");
    }
  }, [take.phase, take.result]);

  // Persist each judged take into song.attempts at most once.
  const songRef = useRef(song);
  songRef.current = song;
  const onSongChangeRef = useRef(onSongChange);
  onSongChangeRef.current = onSongChange;
  const savedResultRef = useRef<BassAnalysis>();
  useEffect(() => {
    if (take.phase !== "done" || !take.result || savedResultRef.current === take.result) return;
    savedResultRef.current = take.result;
    if (!MIDI_BASS_FEEDBACK_QUALIFIED) {
      setNotice("音の判定は資格確認が未完了のため表示しません。録音を聴き比べできます。");
      return;
    }
    const measured = take.result;
    const attempt = {
      completedAt: new Date().toISOString(),
      window: { startBar: window.startBar, bars: window.bars },
      tempoPercent: tempo,
      toleranceMs: settings.timingToleranceMs,
      counts: measured.counts,
      meanOffsetMs: measured.meanOffsetMs,
      latencyCorrectionMs: measured.latencyCorrectionMs,
      marks: measured.marks.map((m) => m.kind),
    };
    void onSongChangeRef.current({
      ...songRef.current,
      lastPracticedAt: attempt.completedAt,
      attempts: [attempt, ...songRef.current.attempts].slice(0, 200),
    }).catch(() => setNotice("記録を保存できませんでした。"));
  }, [take.phase, take.result, window.startBar, window.bars, tempo, settings.timingToleranceMs]);

  const stopAll = useCallback(() => {
    stopListen();
    take.stopPlayback();
    if (takeRunning) take.stop();
    else take.reset();
  }, [stopListen, take, takeRunning]);

  const changeWindow = useCallback((nextStart: number, nextBars = bars, nextTempo = tempo) => {
    if (locked) return;
    stopListen();
    take.reset();
    setNotice(undefined);
    setStartBar(nextStart);
    setBars(nextBars);
    setTempo(nextTempo);
    void onSettingsChange({ ...settings, defaultWindowBars: nextBars, defaultTempoPercent: nextTempo })
      .catch(() => setNotice("設定を保存できませんでした。"));
  }, [bars, locked, onSettingsChange, settings, stopListen, take, tempo]);

  const nextWindow = useCallback(() => {
    changeWindow(window.startBar + window.bars <= totalBars ? window.startBar + window.bars : 1);
  }, [changeWindow, totalBars, window.bars, window.startBar]);

  const listen = useCallback(async () => {
    if (locked) return;
    if (listening) { stopListen(); return; }
    take.stopPlayback();
    setNotice(undefined);
    try {
      const ok = await playback.prepare();
      if (!ok) { setNotice("お手本を再生できませんでした。"); return; }
      setListenBeat(0);
      setListening(true);
      const opts = audioOptions.current;
      playback.start(
        opts.reference ? opts.window.bass : [],
        opts.accompaniment ? opts.window.accompaniment.flatMap((t) => t.notes) : [],
        opts.window.bpm,
        opts.window.lengthBeats,
        opts.click,
        (b) => setListenBeat(b),
        () => { setListening(false); setListenBeat(undefined); },
      );
    } catch (caught) {
      setListening(false);
      setListenBeat(undefined);
      setNotice(caught instanceof Error ? caught.message : "お手本を再生できませんでした。");
    }
  }, [listening, locked, playback, stopListen, take]);

  const recordDisabledReason = window.bass.length === 0
    ? "この区間にはベースの音がありません。別の区間を選んでください。"
    : window.durationMs > 59800
      ? "録音は60秒までです。区間を短くするかテンポを上げてください。"
      : undefined;

  const record = useCallback(() => {
    if (locked || recordDisabledReason) return;
    stopListen();
    setNotice(undefined);
    savedResultRef.current = undefined;
    void Tone.start().catch(() => undefined);
    take.start();
  }, [locked, recordDisabledReason, stopListen, take]);

  const step: StageStep = takeRunning || take.phase === "failed" ? 1 : take.phase === "done" && take.result ? 2 : 0;
  const result = step === 2 ? take.result : undefined;
  const practiceState = takeRunning
    ? (take.phase === "recording" ? "recording" : take.phase === "counting" ? "counting" : take.phase === "analyzing" ? "analyzing" : "preparing")
    : take.phase === "failed" ? "failed"
      : step === 2 ? "result"
        : listening ? "listening" : "ready";

  const active = useEchoActive();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!active || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && (event.target.closest("input, select, textarea, [contenteditable='true']") || event.key !== "Escape" && event.target.closest("button, a, [role='dialog']"))) return;
      const key = event.key.toLowerCase();
      let handled = true;
      if (key === "escape") {
        if (takeRunning) take.stop();
        else { take.stopPlayback(); stopListen(); }
      } else if (takeRunning) {
        handled = false;
      } else if (key === " ") {
        if (step === 0) void listen();
        else if (step === 2) take.playTarget();
        else handled = false;
      } else if (key === "r" && (step === 0 || step === 2 || take.phase === "failed") && !recordDisabledReason) {
        record();
      } else if (key === "n") {
        nextWindow();
      } else {
        handled = false;
      }
      if (handled) event.preventDefault();
    };
    globalThis.window.addEventListener("keydown", handler);
    return () => globalThis.window.removeEventListener("keydown", handler);
  }, [active, listen, nextWindow, record, recordDisabledReason, step, stopListen, take, takeRunning]);

  // Auto-scroll the lane cleanly across wide multi-bar windows.
  const laneHostRef = useRef<HTMLDivElement>(null);
  const minBeatPx = showFret ? 64 : 48;
  const activeBeat = take.phase === "recording" ? take.beat : step === 2 && take.playing ? take.beat : listening ? listenBeat : undefined;
  useEffect(() => {
    if (activeBeat === undefined) return;
    const viewport = laneHostRef.current?.querySelector<HTMLElement>(".bp-lane-scroll");
    if (!viewport) return;
    const x = 76 + activeBeat * minBeatPx;
    if (x > viewport.scrollLeft + viewport.clientWidth - 100 || x < viewport.scrollLeft) {
      viewport.scrollLeft = Math.max(0, x - viewport.clientWidth * 0.3);
    }
  }, [activeBeat, minBeatPx]);

  const refNotes: LaneNote[] = useMemo(() => window.bass.map((n) => {
    const pitchName = noteName(n.pitch);
    const pos = fretboardPositions(n.pitch, STANDARD_BASS_TUNINGS[instrument.stringCount], instrument.fretRange)[0];
    const fretText = pos ? `${instrument.stringCount - pos.stringIndex}弦 ${pos.fret}` : undefined;
    return fitLaneNote({
      startBeat: n.startBeat,
      durationBeats: n.durationBeats,
      kind: "ref",
      text: pitchName,
      sub: showFret ? fretText : undefined,
      label: fretText ? `${pitchName} ${fretText}` : pitchName,
    }, window.lengthBeats, minBeatPx);
  }), [instrument.fretRange, instrument.stringCount, minBeatPx, showFret, window.bass, window.lengthBeats]);

  const takeLaneNotes: LaneNote[] = useMemo(() => {
    if (!result) return [];
    const notes = takeNotes(result, window.bpm, window.lengthBeats, window.bass);
    return notes.map((note, index) => {
      let annotated = note;
      if (showFret) {
        const mark = result.marks[index];
        const pitch = mark?.played?.pitch ?? (index < window.bass.length ? window.bass[index]?.pitch : undefined);
        const pos = pitch !== undefined ? fretboardPositions(pitch, STANDARD_BASS_TUNINGS[instrument.stringCount], instrument.fretRange)[0] : undefined;
        if (pos) {
          const fretText = `${instrument.stringCount - pos.stringIndex}弦 ${pos.fret}`;
          annotated = { ...note, sub: fretText, label: `${note.label} ${fretText}` };
        }
      }
      return fitLaneNote(annotated, window.lengthBeats, minBeatPx);
    });
  }, [instrument.fretRange, instrument.stringCount, minBeatPx, result, showFret, window.bass, window.bpm, window.lengthBeats]);

  const windowAttempts = useMemo(
    () => song.attempts.filter((a) => a.window.startBar === window.startBar && a.window.bars === window.bars),
    [song.attempts, window.bars, window.startBar],
  );

  const currentNote = activeBeat !== undefined
    ? window.bass.find((n) => activeBeat >= n.startBeat && activeBeat < n.startBeat + n.durationBeats)
    : undefined;

  const fretboard = (marks?: BassAnalysis["marks"]) => {
    const notes = currentNote ? [currentNote] : window.bass;
    const dots = notes.map((n) => {
      const idx = window.bass.indexOf(n);
      const mark = marks && idx >= 0 ? marks[idx] : undefined;
      return {
        midiNote: n.pitch,
        label: noteName(n.pitch),
        ...(mark && mark.kind !== "ok" ? { tone: "warn" as const } : {}),
      };
    });
    return (
      <StageFretboard
        dots={dots}
        stringCount={instrument.stringCount}
        fretRange={instrument.fretRange}
        handedness={instrument.handedness}
      />
    );
  };

  const tools = (
    <StageTools>
      <Popover
        label="判定の決まり"
        trigger={(props) => (
          <Chip {...props} data-testid="midi-judge-conditions">
            {`判定 ${TOLERANCE_LABELS[settings.timingToleranceMs]}`}
          </Chip>
        )}
      >
        <div className="bp-tools-panel" style={{ maxHeight: "min(70vh, 520px)", overflowY: "auto" }}>
          <label>タイミングの許し
            <Select
              aria-label="タイミングの許し"
              className="w-full"
              value={settings.timingToleranceMs}
              disabled={locked}
              onChange={(e) => void onSettingsChange({ ...settings, timingToleranceMs: Number(e.target.value) as 50 | 70 | 100 }).catch(() => setNotice("設定を保存できませんでした。"))}
            >
              <option value={50}>きびしい ±50ms</option>
              <option value={70}>ふつう ±70ms</option>
              <option value={100}>ゆるい ±100ms</option>
            </Select>
          </label>
          <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={settings.octaveCountsAsCorrect}
              disabled={locked}
              onChange={(e) => void onSettingsChange({ ...settings, octaveCountsAsCorrect: e.target.checked }).catch(() => setNotice("設定を保存できませんでした。"))}
            />
            <span>オクターブ違いを合いにする</span>
          </label>
          <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={settings.autoLatencyCorrection}
              disabled={locked}
              onChange={(e) => void onSettingsChange({ ...settings, autoLatencyCorrection: e.target.checked }).catch(() => setNotice("設定を保存できませんでした。"))}
            />
            <span>音のずれの補正 自動</span>
          </label>
          {windowAttempts.length > 0 ? (
            <section className="grid gap-1 border-t border-[var(--lv-border)] pt-2">
              <h4 className="m-0 text-xs font-semibold text-[var(--lv-text)]">この区間の記録</h4>
              {windowAttempts.slice(0, 5).map((a, i) => (
                <p className="m-0" key={`${a.completedAt}-${i}`}>
                  {new Date(a.completedAt).toLocaleString("ja-JP")} · {a.counts.correct}/{a.counts.total} 合いました
                </p>
              ))}
            </section>
          ) : null}
          <p>単音の演奏を対象にした目安です。録音は「残す」を押した時だけ保存します。</p>
        </div>
      </Popover>
    </StageTools>
  );

  const songBar = (
    <div className="bass-midi-bar">
      <div className="bass-midi-bar-song">
        <h2 title={song.title}>{song.title}</h2>
        <span>{totalBars} 小節 · {Math.round(window.bpm)} BPM</span>
      </div>
      <div className="bass-midi-bar-controls">
        <span>区間</span>
        <IconButton className="bass-midi-step-btn" label="前の区間" size="sm" disabled={locked || window.startBar === 1} onClick={() => changeWindow(Math.max(1, window.startBar - window.bars))}>‹</IconButton>
        <Select aria-label="開始小節" value={window.startBar} disabled={locked} onChange={(e) => changeWindow(Number(e.target.value))}>
          {Array.from({ length: totalBars }, (_, i) => (
            <option key={i} value={i + 1}>{i + 1}〜{Math.min(totalBars, i + (bars === "all" ? totalBars : bars))} 小節</option>
          ))}
        </Select>
        <IconButton className="bass-midi-step-btn" label="次の区間" size="sm" disabled={locked || window.startBar + window.bars > totalBars} onClick={() => changeWindow(window.startBar + window.bars)}>›</IconButton>
        <span>長さ</span>
        <SegmentedControl
          label="区間の長さ"
          value={String(bars)}
          options={[1, 2, 4, 8, "all"].map((b) => ({ value: String(b), label: b === "all" ? "全部" : b, disabled: locked }))}
          onChange={(b) => changeWindow(startBar, b === "all" ? "all" : Number(b) as 1 | 2 | 4 | 8)}
        />
        <span>テンポ</span>
        <SegmentedControl
          label="MIDI練習テンポ"
          value={String(tempo)}
          options={[60, 80, 100].map((t) => ({ value: String(t), label: `${t}%`, disabled: locked }))}
          onChange={(t) => changeWindow(startBar, bars, Number(t) as 60 | 80 | 100)}
        />
        <Chip
          aria-label="お気に入り"
          selected={song.favorite}
          disabled={locked}
          onClick={() => void onSongChange({ ...song, favorite: !song.favorite }).catch(() => setNotice("保存できませんでした。"))}
        >
          ☆
        </Chip>
        <Button size="sm" disabled={locked} onClick={() => { stopAll(); onBack(); }}>一覧へ</Button>
      </div>
    </div>
  );

  const overviewBins = Math.min(128, totalBars);
  const overview = (
    <div className="bass-midi-overview" style={{ gridTemplateColumns: `repeat(${overviewBins},minmax(0,1fr))` }} role="group" aria-label="曲全体の帯">
      {Array.from({ length: overviewBins }, (_, bin) => {
        const i = Math.floor((bin * totalBars) / overviewBins);
        return (
          <button
            type="button"
            key={i}
            data-best={Boolean(best && i + 1 >= best.window.startBar && i + 1 < best.window.startBar + best.window.bars)}
            aria-label={`${i + 1}小節から練習`}
            aria-pressed={i + 1 >= window.startBar && i + 1 < window.startBar + window.bars}
            disabled={locked}
            onClick={() => changeWindow(i + 1)}
          >
            {i + 1}
            <span aria-hidden="true">{song.bass.some((n) => n.startBeat >= i * 4 && n.startBeat < (i + 1) * 4) ? "••" : "·"}</span>
          </button>
        );
      })}
    </div>
  );

  const stageBody = (() => {
    if (step === 1) {
      const recordingNow = take.phase === "recording";
      return (
        <StageFrame step={1} keys={takeRunning ? "Esc 止める" : "R もう一度 · N 次の区間"} state={practiceState}>
          {tools}{take.recorder}
          {take.phase === "counting" ? <StageCount beats={4} current={take.count} /> : null}
          <p className="bp-say">
            {take.phase === "analyzing" ? "判定しています…"
              : take.phase === "failed" ? "うまく録れませんでした"
                : take.phase === "counting" || take.phase === "preparing" ? "カウントのあとに弾き始めます"
                  : "伴奏に合わせて弾いてください"}
          </p>
          <div ref={laneHostRef} className="w-full flex justify-center">
            <StageLane
              lengthBeats={window.lengthBeats}
              beatsPerBar={4}
              wide
              minBeatPx={minBeatPx}
              rows={[{ label: "お手本", notes: refNotes }, { label: "自分", notes: [] }]}
              {...(chordLabels.length > 0 ? { chords: chordLabels } : {})}
              {...(recordingNow && take.beat !== undefined ? { playhead: take.beat } : {})}
            />
          </div>
          {take.phase === "failed" ? <p className="bp-note-line" role="alert">{take.error}</p> : null}
          {recordingNow ? (
            <p className="bp-note-line" data-testid="midi-input-line">
              <StageMeter level={take.inputLevel} />
              {take.inputLevel > 0.004 ? "入力に音が届いています" : "入力に音が来ていません。機器とチャンネルを確かめてください"}
              {" · クリック "}{click ? "入" : "切"}
              {song.accompaniment.length > 0 ? ` · 伴奏 ${accompaniment ? "入" : "切"}` : ""}
              {" · 録音は判定にだけ使い、保存しません"}
            </p>
          ) : null}
          <div className="bp-actions">
            {takeRunning ? (
              <StageButton tone="record" keyHint="Esc" onClick={take.stop} data-testid="midi-stop">■ 止める</StageButton>
            ) : (
              <>
                <StageButton onClick={() => { setNotice(undefined); take.reset(); }} data-testid="midi-back-listen">1 聴くに戻る</StageButton>
                <StageButton tone="primary" keyHint="R" disabled={Boolean(recordDisabledReason)} onClick={record} data-testid="midi-retry">● もう一度</StageButton>
              </>
            )}
          </div>
          {notice ? <p className="bp-note-line" role="alert">{notice}</p> : null}
        </StageFrame>
      );
    }

    if (step === 2 && result) {
      const qualified = MIDI_BASS_FEEDBACK_QUALIFIED;
      const good = qualified && result.counts.total > 0 && result.counts.correct / result.counts.total >= 0.75;
      const drift = Math.abs(result.meanOffsetMs) <= 15 ? "ちょうど" : result.meanOffsetMs > 0 ? "少し遅め" : "少し早め";
      const facts: ResultFact[] = qualified ? [
        { text: `合った ${result.counts.correct}`, tone: "ok" },
        { text: `音が違う ${result.counts.wrongPitch}`, tone: "ng" },
        { text: `早い・遅い ${result.counts.timing}`, tone: "warn" },
        ...(result.counts.missed > 0 ? [{ text: `抜け ${result.counts.missed}`, tone: "mute" as const }] : []),
        ...(result.counts.extra > 0 ? [{ text: `余分な音 ${result.counts.extra}`, tone: "ng" as const }] : []),
        { text: `タイミング 平均 ${result.meanOffsetMs >= 0 ? "+" : ""}${Math.round(result.meanOffsetMs)}ms（${drift}）` },
        { text: settings.autoLatencyCorrection ? `ずれの補正 自動 ${Math.round(result.latencyCorrectionMs)}ms` : "ずれの補正 切" },
      ] : [];
      const kept = take.recorderStatus === "saved";
      const recentTwo = windowAttempts.slice(0, 2)
        .map((a) => `${new Date(a.completedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} ${a.counts.correct}/${a.counts.total}`)
        .join(" · ");
      return (
        <StageFrame step={2} keys="Space お手本 · R もう一度 · N 次の区間" tone={good ? "good" : undefined} state={practiceState}>
          {tools}{take.recorder}
          <div className="bass-midi-result-head" data-testid="midi-bass-result">
            {qualified ? (
              <StageResultHead big={`${result.counts.correct} / ${result.counts.total}`} label="音が合いました" facts={facts} />
            ) : (
              <StageResultHead big="完了" label="録音を取りました" facts={facts} />
            )}
          </div>
          <div ref={laneHostRef} className="w-full flex justify-center">
            <StageLane
              lengthBeats={window.lengthBeats}
              beatsPerBar={4}
              wide
              minBeatPx={minBeatPx}
              rows={[{ label: "お手本", notes: refNotes }, { label: "自分", notes: takeLaneNotes }]}
              {...(chordLabels.length > 0 ? { chords: chordLabels } : {})}
              {...(take.beat !== undefined && take.playing ? { playhead: take.beat } : {})}
            />
          </div>
          {showFret ? fretboard(result.marks) : null}
          <div className="bp-actions" data-testid="midi-result-actions">
            <StageButton onClick={take.playTarget} aria-pressed={take.playing === "target"}>▶ お手本</StageButton>
            <StageButton onClick={take.playTake} aria-pressed={take.playing === "take"}>▶ 自分</StageButton>
            <StageButton onClick={take.playOverlay} aria-pressed={take.playing === "overlay"}>▶ 重ねて</StageButton>
            <StageButton onClick={take.keep} disabled={kept} data-testid="midi-keep-take">{kept ? "残しました" : "録音を残す"}</StageButton>
            <span className="bp-actions-gap" aria-hidden="true" />
            <StageButton keyHint="R" disabled={Boolean(recordDisabledReason)} onClick={record} data-testid="midi-record-again">● もう一度</StageButton>
            <StageButton tone="primary" keyHint="N" onClick={nextWindow} data-testid="midi-next-window">次の区間</StageButton>
          </div>
          {recentTwo ? <p className="bp-note-line" data-testid="midi-window-attempts">この区間の記録：{recentTwo}</p> : null}
          {notice ? <p className="bp-note-line" role="alert">{notice}</p> : null}
        </StageFrame>
      );
    }

    return (
      <StageFrame step={0} keys="Space 聴く · R 録って弾く · N 次の区間" state={practiceState}>
        {tools}{take.recorder}
        <p className="bp-say">お手本を聴いてから、伴奏に合わせて弾きます</p>
        <div ref={laneHostRef} className="w-full flex justify-center">
          <StageLane
            lengthBeats={window.lengthBeats}
            beatsPerBar={4}
            wide
            minBeatPx={minBeatPx}
            rows={[{ label: "お手本", notes: refNotes }, { label: "自分", notes: [] }]}
            {...(chordLabels.length > 0 ? { chords: chordLabels } : {})}
            {...(listening && listenBeat !== undefined ? { playhead: listenBeat } : {})}
          />
        </div>
        {showFret ? fretboard() : null}
        <div className="bp-playrow">
          <StageButton aria-pressed={reference} disabled={locked} onClick={() => setReference((v) => !v)}>お手本 {reference ? "入" : "切"}</StageButton>
          {song.accompaniment.length > 0 ? (
            <StageButton aria-pressed={accompaniment} disabled={locked} onClick={() => setAccompaniment((v) => !v)}>伴奏 {accompaniment ? "入" : "切"}</StageButton>
          ) : null}
          <StagePlayButton playing={listening} label={listening ? "止める" : "聴く"} disabled={locked} onClick={() => void listen()} data-testid="midi-listen" />
          <StageButton aria-pressed={click} disabled={locked} onClick={() => setClick(!click)}>クリック {click ? "入" : "切"}</StageButton>
        </div>
        <div className="bp-actions">
          <StageButton aria-label="弦とフレットを出す" aria-pressed={showFret} disabled={locked} onClick={() => setShowFret((v) => !v)}>弦とフレット</StageButton>
          <StageButton tone="primary" keyHint="R" disabled={Boolean(recordDisabledReason)} onClick={record} data-testid="midi-record">● 録って弾く</StageButton>
        </div>
        {recordDisabledReason ? <p className="bp-note-line" role="status">{recordDisabledReason}</p> : null}
        {notice ? <p className="bp-note-line" role="alert">{notice}</p> : null}
      </StageFrame>
    );
  })();

  return (
    <EchoPracticeFrame rail={false}>
      <div className="bass-midi-shell" data-testid="midi-bass-practice" data-practice-state={practiceState} data-stage-step={step}>
        {songBar}
        {overview}
        {stageBody}
      </div>
    </EchoPracticeFrame>
  );
}
