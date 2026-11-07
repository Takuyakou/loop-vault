import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { useStore } from "zustand";
import { usePreviewSound } from "../../components/PreviewSoundProvider";
import { PracticeKeyboard } from "../../components/practice/PracticeKeyboard";
import {
  EarAnswerTaker, EarSession, answerSpecOf, functionKind, keySignatureOf, questionInfos, recentComparison, type EarChordInfo, type EarChordRecord, type EarMark, type EarQuestion,
} from "../../domain/earPractice";
import { heldNotes } from "../../domain/liveMidi";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { liveMidiService } from "../../liveMidi/liveMidiService";
import { openMidiPanel } from "../../liveMidi/midiPanel";
import type { MidiPreviewNote } from "../../audio/chordPreview";
import { GrandStaff } from "../chord-dojo/GrandStaff";
import { useDojoMidi } from "../chord-dojo/useDojoMidi";
import { createEarPlayback, type EarPlayback, type EarPlayHandle } from "./earPlayback";
import { earKeyboardRange } from "./earRange";
import { keyboardKeyHeight, whiteKeysIn } from "./earKeyboardHeight";
import { chordSnapshot, heldSnapshot } from "./earStaff";
import { diffRate, diffSeconds, pct, secText } from "./earFormat";
import { displayChordLabel } from "./label";
import type { EarSettings } from "./earSettings";
import { ResultScore } from "./ResultScore";

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const noteName = (note: number) => `${NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
/** How long a single chord is sounded when it is played by itself (seconds). */
const CHORD_SECONDS = 1.6;
const perfNow = () => globalThis.performance.now();

/** The room between the two staves: four lines apart, so the treble clef does not reach into the bass staff. */
const EAR_STAFF_GAP = 48;
const MARK_TEXT: Record<EarMark, string> = { ok: "✓", retry: "△", name: "名", key: "鍵" };
const MARK_LABEL: Record<EarMark, string> = { ok: "一発", retry: "弾き直し", name: "名前を見た", key: "鍵盤を見た" };

export interface EarRunProps {
  question: EarQuestion;
  settings: EarSettings;
  /** The name of the progression, shown on the result screen only (it gives the answer away). */
  resultName?: string;
  /** Replaced in tests. */
  playback?: EarPlayback;
  /** The records so far (the result compares with the last questions of the same level and length). */
  records?: readonly EarChordRecord[];
  /** The id of this run, so the result leaves it out of the comparison. */
  playId?: string;
  /** Called once when the question has been played to the end. */
  onFinished?: (session: EarSession) => void;
  /** 腕試し: which of the questions this is. There is no result screen for each; the next one follows. */
  benchmarkStep?: { index: number; total: number };
  /** The switch 「度数と機能を見せる」 on the screen (not offered in 腕試し). */
  onShowDegrees?: (value: boolean) => void;
  onExit: () => void;
  onAgain: () => void;
  onNext: () => void;
  onShiftKeyboard: (octaves: number) => void;
}

/** One run through one question: listening to the lap, playing chord by chord, the result. */
export function EarRun({ question, settings, resultName, playback: injected, records = [], playId = "", onFinished, benchmarkStep, onShowDegrees, onExit, onAgain, onNext, onShiftKeyboard }: EarRunProps) {
  const sessionRef = useRef<EarSession>();
  if (!sessionRef.current) sessionRef.current = new EarSession({ question, showFirstName: settings.showFirstName });
  const session = sessionRef.current;
  const [, bump] = useReducer((count: number) => count + 1, 0);
  const { sound } = usePreviewSound();
  const midi = useDojoMidi(true, false);
  const connected = midi.connected;
  const [clock, setClock] = useState<{ spreadMs: number; outputLatencyMs: number }>();
  const playback = useMemo(
    () => injected ?? createEarPlayback({ onClock: (value) => setClock({ spreadMs: value.spreadMs, outputLatencyMs: value.outputLatencyMs }) }),
    [injected],
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const [lapIndex, setLapIndex] = useState<number>();
  const [soundedIndex, setSoundedIndex] = useState<number>();
  const [revealed, setRevealed] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [pressed, setPressed] = useState<number>();
  const pressTimer = useRef<ReturnType<typeof setTimeout>>();
  const takerRef = useRef<EarAnswerTaker>();
  const downRef = useRef(new Set<string>());
  const soundedAtRef = useRef(0);
  const tokenRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const liveNotes = useStore(defaultLiveMidiStore, (state) => state.notes);
  const heldKey = heldNotes(liveNotes).join(",");
  const held = useMemo(() => (heldKey ? heldKey.split(",").map(Number) : []), [heldKey]);
  const range = useMemo(() => earKeyboardRange(question, settings.octaveShift), [question, settings.octaveShift]);
  // The keys are drawn as high as their width asks for (about 4.2 times), or lower when the window has no more room.
  const keyboardRef = useRef<HTMLDivElement>(null);
  const keyboardEndRef = useRef<HTMLDivElement>(null);
  const [keyHeight, setKeyHeight] = useState<number>();
  const whiteKeys = useMemo(() => whiteKeysIn(range.minMidiNote, range.maxMidiNote), [range.minMidiNote, range.maxMidiNote]);
  const key = { tonic: question.tonic, mode: question.mode };
  const keyKnown = question.keyName !== "";

  useLayoutEffect(() => {
    const wrapper = keyboardRef.current;
    const end = keyboardEndRef.current;
    if (!wrapper || !end) return undefined;
    const measure = () => {
      const svg = wrapper.querySelector("svg");
      if (!svg) return;
      const wrapperBox = wrapper.getBoundingClientRect();
      const svgBox = svg.getBoundingClientRect();
      if (svgBox.width <= 0) return;
      // What the wrapper holds besides the keys (its padding, the heading, the frame): it does not depend on the key height.
      const chrome = end.getBoundingClientRect().top - wrapperBox.top + parseFloat(getComputedStyle(wrapper).paddingBottom) - svgBox.height;
      const next = keyboardKeyHeight({ width: svgBox.width, whiteKeys, room: wrapper.clientHeight - chrome, narrowWindow: globalThis.innerWidth <= 1023 });
      setKeyHeight((current) => (current === next ? current : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    const svg = wrapper.querySelector("svg");
    if (svg) observer.observe(svg);
    return () => observer.disconnect();
  }, [whiteKeys]);

  // ---- degrees and functions ----------------------------------------------------------------------
  const infos = useMemo(() => questionInfos(question), [question]);
  const known = infos.every((info) => info !== undefined);
  /** The switch is on, and the key is known: every card shows them from the start (never in 腕試し). */
  const degreesOn = settings.showDegrees && !benchmarkStep && known;
  useEffect(() => {
    if (degreesOn && session.phase !== "result") session.markDegreesShown();
  });

  // ---- sound ------------------------------------------------------------------------------------
  const play = useCallback((id: string, notes: MidiPreviewNote[], endBeat: number): EarPlayHandle =>
    playback.play({ id, notes, bpm: question.bpm, endBeat, sound }), [playback, question.bpm, sound]);

  const chordNotes = useCallback((index: number, startBeat = 0, beats = CHORD_SECONDS * question.bpm / 60): MidiPreviewNote[] =>
    question.chords[index]!.notes.map((pitch) => ({ pitch, startBeat, durationBeats: beats, velocity: 90 })), [question]);

  const playChord = useCallback((index: number) => {
    const beats = CHORD_SECONDS * question.bpm / 60;
    return play(`ear:chord:${index}`, chordNotes(index, 0, beats), beats);
  }, [chordNotes, play, question.bpm]);

  const playPair = useCallback((index: number) => {
    const each = 2;
    const first = Math.max(0, index - 1);
    const notes = [first, index].filter((value, position, all) => all.indexOf(value) === position)
      .flatMap((chordIndex, position) => chordNotes(chordIndex, position * each, each * 0.95));
    return play(`ear:pair:${index}`, notes, each * (index === first ? 1 : 2));
  }, [chordNotes, play]);

  const beginPlayRef = useRef<() => void>(() => undefined);
  const playLap = useCallback((purpose: "first" | "again") => {
    const token = (tokenRef.current += 1);
    const notes = question.chords.flatMap((chord) =>
      chord.notes.map((pitch) => ({ pitch, startBeat: chord.startBeat, durationBeats: chord.durationBeats * 0.92, velocity: 90 })));
    const handle = play("ear:lap", notes, question.length * question.beatsPerBar);
    let timer: ReturnType<typeof setInterval> | undefined;
    void handle.started.then((info) => {
      if (!info || tokenRef.current !== token) return;
      timer = globalThis.setInterval(() => {
        const beat = (perfNow() - info.startPerfMs) / 1000 * question.bpm / 60;
        let at: number | undefined;
        question.chords.forEach((chord, index) => { if (beat >= chord.startBeat) at = index; });
        setLapIndex(beat >= 0 && beat < question.length * question.beatsPerBar ? at : undefined);
      }, 40);
    });
    void handle.ended.then((reason) => {
      if (timer) globalThis.clearInterval(timer);
      if (tokenRef.current !== token) return;
      setLapIndex(undefined);
      if (reason === "completed" && purpose === "first") beginPlayRef.current();
    });
  }, [play, question]);

  // ---- the card whose turn it is ---------------------------------------------------------------------
  const newTaker = useCallback((index: number) => {
    const chord = question.chords[index]!;
    takerRef.current = new EarAnswerTaker(answerSpecOf(chord), settingsRef.current.settleMs, downRef.current.size);
  }, [question]);

  const armCard = useCallback((index: number) => {
    newTaker(index);
    setRevealed(false);
    if (settingsRef.current.autoPlay) {
      // Measuring starts when the chord has finished sounding. Until the clock has been read, it is the planned end.
      session.setMeasureStart(perfNow() + CHORD_SECONDS * 1000);
      void playChord(index).started.then((info) => {
        if (info && session.index === index && !session.cards[index]!.done) session.setMeasureStart(info.endPerfMs);
      });
    } else {
      session.setMeasureStart(perfNow());
    }
  }, [newTaker, playChord, session]);

  const beginPlay = useCallback(() => {
    if (session.phase !== "listen") return;
    tokenRef.current += 1;
    setLapIndex(undefined);
    playback.stop();
    session.startPlaying();
    bump();
    armCard(0);
  }, [armCard, playback, session]);

  beginPlayRef.current = beginPlay;

  // The first lap begins as soon as the question is shown.
  useEffect(() => {
    playLap("first");
    return () => {
      tokenRef.current += 1;
      playback.stop();
    };
  }, []);

  // Fixture builds only (the fake MIDI keyboard of the tests is there): lets a test play the chords the screen is asking for.
  useEffect(() => {
    const scope = window as typeof window & { __p12Midi?: unknown; __earAnswer?: (index: number) => readonly number[] | undefined };
    if (!scope.__p12Midi) return undefined;
    scope.__earAnswer = (index) => question.chords[index]?.notes;
    return () => { delete scope.__earAnswer; };
  }, [question]);

  // ---- answers ----------------------------------------------------------------------------------------
  const handleAnswer = useCallback((notes: number[], completedAt: number) => {
    const result = session.answer(notes, completedAt);
    setFeedback({ ok: result.ok, text: result.message });
    if (result.ok) {
      soundedAtRef.current = perfNow();
      setSoundedIndex(session.index);
      session.next();
      bump();
      if (session.phase === "result") playback.stop();
      else armCard(session.index);
    } else {
      newTaker(session.index);
      bump();
    }
  }, [armCard, newTaker, playback, session]);

  useEffect(() => {
    const unsubscribe = liveMidiService.subscribeBatches((batch) => {
      const last = batch.events[batch.events.length - 1]?.timestampMs ?? 0;
      for (const event of batch.events) {
        const status = event.status & 240;
        if (status !== 128 && status !== 144) continue;
        const on = status === 144 && event.data2 > 0;
        const at = perfNow() - Math.max(0, last - event.timestampMs);
        const id = `${event.channel}:${event.data1}`;
        if (on) {
          downRef.current.add(id);
          if (soundedAtRef.current && at > soundedAtRef.current) { soundedAtRef.current = 0; setSoundedIndex(undefined); }
        } else downRef.current.delete(id);
        if (session.phase !== "play") continue;
        if (on) takerRef.current?.press(event.channel, event.data1, at);
        else takerRef.current?.release(event.channel, event.data1, at);
      }
    });
    const timer = globalThis.setInterval(() => {
      if (session.phase !== "play" || !connected) return;
      const answer = takerRef.current?.poll(perfNow());
      if (answer) handleAnswer(answer.notes, answer.completedAt);
    }, 10);
    return () => { unsubscribe(); globalThis.clearInterval(timer); };
  }, [connected, handleAnswer, session]);

  // ---- the player's own judgement (no MIDI keyboard) --------------------------------------------------------
  const selfJudge = useCallback((ok: boolean) => {
    const result = session.selfAnswer(ok);
    setFeedback({ ok, text: ok ? "合いました(自分で判定)" : "答えを見て、もう一度(自分で判定)" });
    setRevealed(false);
    if (ok) {
      setSoundedIndex(session.index);
      session.next();
      bump();
      if (session.phase === "result") playback.stop();
      else armCard(session.index);
    } else bump();
    void result;
  }, [armCard, playback, session]);

  // ---- keys ---------------------------------------------------------------------------------------------
  const listen = useCallback((kind: "chord" | "pair" | "lap") => {
    if (session.phase === "listen") {
      if (kind === "lap") playLap("first");
      return;
    }
    if (session.phase !== "play") return;
    session.countListen();
    bump();
    if (kind === "chord") void playChord(session.index);
    else if (kind === "pair") void playPair(session.index);
    else playLap("again");
  }, [playChord, playLap, playPair, session]);

  /** A card was pressed: its chord sounds, and nothing else moves (the card being played, the answer, the hints, the seconds). */
  const pressCard = useCallback((index: number) => {
    if (session.phase !== "play") return;
    session.countCardListen(index);
    bump();
    void playChord(index);
    setPressed(index);
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPressed(undefined), CHORD_SECONDS * 1000);
  }, [playChord, session]);
  useEffect(() => () => { if (pressTimer.current) clearTimeout(pressTimer.current); }, []);

  const hint = useCallback(() => {
    if (session.phase !== "play") return;
    session.hint();
    bump();
  }, [session]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.closest("input,select,textarea")) return;
      const onButton = Boolean(target?.closest("button,summary,[role=region][tabindex]"));
      if (event.key === "Escape") {
        if (scoreOpen) { setScoreOpen(false); event.preventDefault(); return; }
        event.preventDefault();
        onExit();
        return;
      }
      if (onButton && (event.key === "Enter" || event.key === " ")) return;
      const k = event.key.toLowerCase();
      if (event.key === "Enter") {
        event.preventDefault();
        if (session.phase === "listen") beginPlay();
        else if (session.phase === "result") onNext();
      } else if (k === "l") listen("chord");
      else if (k === "k") listen("pair");
      else if (k === "r") listen("lap");
      else if (event.key === " ") { event.preventDefault(); if (connected) hint(); else if (session.phase === "play") setRevealed(true); }
      else if (!connected && session.phase === "play" && revealed && k === "y") selfJudge(true);
      else if (!connected && session.phase === "play" && revealed && k === "n") selfJudge(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [beginPlay, connected, hint, listen, onExit, onNext, revealed, scoreOpen, selfJudge, session]);

  // ---- what is drawn --------------------------------------------------------------------------------------
  const phase = session.phase;
  const current = session.current;
  const chord = session.currentChord;
  const showAnswer = phase === "play" && !current.done && (session.answerOnKeyboard || revealed);
  const outsideLow = held.filter((note) => note < range.minMidiNote);
  const outsideHigh = held.filter((note) => note > range.maxMidiNote);
  const signature = keyKnown ? keySignatureOf(question.tonic, question.mode) : undefined;
  const heldNow = useMemo(() => heldSnapshot(held, key.tonic, key.mode), [held, key.tonic, key.mode]);
  const staffAnswer = useMemo(
    () => (showAnswer ? chordSnapshot(`ear:answer:${session.index}`, chord.symbol, chord.notes, key.tonic, key.mode) : undefined),
    [showAnswer, chord, session.index, key.tonic, key.mode],
  );
  const staffSounded = useMemo(() => {
    if (soundedIndex === undefined || held.length) return undefined;
    const done = question.chords[soundedIndex]!;
    return chordSnapshot(`ear:sounded:${soundedIndex}`, done.symbol, done.notes, key.tonic, key.mode);
  }, [soundedIndex, held.length, question, key.tonic, key.mode]);
  const soundedLabel = soundedIndex === undefined ? undefined : question.chords[soundedIndex]!.label;
  const heldNames = heldNow?.notes.map((note) => `${note.spelling.step}${note.spelling.alter < 0 ? "♭".repeat(-note.spelling.alter) : "♯".repeat(note.spelling.alter)}`) ?? [];
  const title = question.source === "bank" ? `耳の課題 ${String(question.displayNumber ?? 0).padStart(3, "0")}`
    : question.source === "builtin" ? "定番の進行" : "自分の進行";
  const answerNotes = showAnswer ? chord.notes : [];
  const answerPcs = answerNotes.map((note) => note % 12);

  const cardCount = question.chords.length;
  const ref = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(8);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setCapacity(Math.max(4, Math.min(12, Math.floor(element.clientWidth / 112))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const windowed = cardCount > capacity;
  const first = windowed ? Math.max(0, Math.min(cardCount - capacity, session.index - 2)) : 0;
  const shown = windowed ? question.chords.slice(first, first + capacity).map((_, offset) => first + offset) : question.chords.map((_, index) => index);

  const finishedRef = useRef(false);
  useEffect(() => {
    if (phase !== "result" || finishedRef.current) return;
    finishedRef.current = true;
    onFinished?.(session);
  });

  if (phase === "result" && benchmarkStep) {
    return <div className="ear-run" data-testid="ear-benchmark-saving"><p className="ear-line">腕試し {benchmarkStep.index + 1} / {benchmarkStep.total} を記録しています…</p></div>;
  }
  if (phase === "result") {
    return (
      <EarResult
        session={session}
        records={records}
        playId={playId}
        resultName={resultName}
        onAgain={onAgain}
        onNext={onNext}
        onExit={onExit}
        clock={clock}
        play={play}
        stop={() => playback.stop()}
        infos={infos}
      />
    );
  }

  return (
    <div className="ear-run" data-testid="ear-run" data-phase={phase} data-question-id={question.id} data-tonic={question.tonic} data-sounded={soundedIndex} data-clock-spread-ms={clock?.spreadMs.toFixed(1)} data-output-latency-ms={clock?.outputLatencyMs.toFixed(1)}>
      <div className="ear-head">
        <h1 data-testid="ear-title">{title}・レベル{question.level}・{question.length}小節</h1>
        {settings.showFirstName ? (
          <span className="ear-badge" data-testid="ear-key">
            {keyKnown ? `キー ${displayChordLabel(question.keyName)} ・ ` : ""}1つ目 {displayChordLabel(question.chords[0]!.label)}
          </span>
        ) : null}
        <span className="ear-badge ear-badge-plain">テンポ {question.bpm}</span>
        {benchmarkStep ? <span className="ear-badge" data-testid="ear-benchmark-step">腕試し {benchmarkStep.index + 1} / {benchmarkStep.total}</span> : null}
        <span className="ear-note">名前は弾いて合うと出ます</span>
      </div>

      <div className="ear-steps" role="group" aria-label="練習の流れ">
        <span data-state={phase === "listen" ? "current" : "done"}>① 1周聴く</span>
        <span data-state={phase === "play" ? "current" : "todo"}>② 1コードずつ弾く {phase === "play" ? ` ${session.index + 1} / ${cardCount}` : ""}</span>
        <span data-state="todo">③ 結果</span>
        {onShowDegrees && !benchmarkStep && known ? (
          <label className="ear-toggle" title="合う前から、度数と機能を全部のカードに出します(出したコードは、一発などの成績に入りません)">
            <input type="checkbox" data-testid="ear-degree-toggle" checked={settings.showDegrees} onChange={(event) => onShowDegrees(event.target.checked)} />
            度数と機能を見せる
          </label>
        ) : null}
        <div className="ear-legend" aria-label="印の意味">
          {(["ok", "retry", "name", "key"] as EarMark[]).map((mark) => (
            <span key={mark}><i className="ear-mark" data-mark={mark}>{MARK_TEXT[mark]}</i>{MARK_LABEL[mark]}</span>
          ))}
        </div>
      </div>

      <div className="ear-cards" ref={ref} data-testid="ear-cards" data-windowed={windowed || undefined}>
        {shown.map((index) => {
          const card = session.cards[index]!;
          const isCurrent = phase === "play" && index === session.index;
          const visible = session.nameVisible(index);
          const info = infos[index];
          const showInfo = info !== undefined && (card.done || card.shownFromStart || degreesOn);
          return (
            <div
              key={index}
              className="ear-card"
              data-testid={`ear-card-${index}`}
              role="button"
              aria-label={`${index + 1}つ目のコードを鳴らす`}
              aria-disabled={phase !== "play" ? "true" : undefined}
              title={phase === "play" ? "押すと鳴ります" : undefined}
              data-pressable={phase === "play" || undefined}
              data-pressed={pressed === index || undefined}
              data-degree={showInfo || undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pressCard(index)}
              data-current={isCurrent || undefined}
              data-done={card.done || undefined}
              data-lap={lapIndex === index || undefined}
              data-retry={card.mistakes > 0 && !card.done || undefined}
            >
              <span className="ear-card-top"><span className="ear-card-no">{index + 1}</span><span className="ear-marks">{session.marks(card).map((mark) => <i key={mark} className="ear-mark" data-mark={mark} title={MARK_LABEL[mark]}>{MARK_TEXT[mark]}</i>)}</span></span>
              <b className="ear-card-name" data-testid={`ear-card-name-${index}`}>{visible ? displayChordLabel(card.label) : "?"}</b>
              {showInfo ? <DegreeLines info={info} index={index} /> : null}
              <small className="ear-card-sub">
                {card.done && card.sec !== undefined ? `${card.sec.toFixed(1)}s`
                  : card.shownFromStart ? "最初から表示"
                    : isCurrent ? (card.mistakes > 0 ? "♪ 今のコード・弾き直し中" : "♪ 今のコード")
                      : lapIndex === index ? "♪" : ""}
              </small>
            </div>
          );
        })}
      </div>
      <div className="ear-position" aria-label="全体の位置" data-testid="ear-position">
        <span>{Math.min(session.index + 1, cardCount)} / {cardCount}</span>
        {session.cards.map((card, index) => (
          <i key={index} className="ear-dot" data-current={(phase === "play" && index === session.index) || undefined}
            data-state={card.done ? (card.mistakes > 0 || card.hint > 0 ? "help" : "ok") : card.mistakes > 0 ? "retry" : "todo"} />
        ))}
      </div>

      <div className="ear-middle">
        <div className="ear-controls">
          {!connected ? (
            <p className="ear-notice" role="status" data-testid="ear-no-midi">
              MIDI キーボードがつながっていません。聴いて、自分で判定して進められます。
              <button type="button" onClick={() => openMidiPanel()}>MIDI をつなぐ</button>
            </p>
          ) : null}
          {phase === "listen" ? (
            <p className="ear-line" data-testid="ear-listening">進行を聴いています… {settings.showFirstName ? "(1つ目のコード名は見えています)" : ""}</p>
          ) : feedback ? (
            <p className="ear-feedback" data-ok={feedback.ok} role="status" data-testid="ear-feedback">{feedback.ok ? "✓ " : "× "}{feedback.text}</p>
          ) : (
            <p className="ear-line">{connected ? "聴いたコードを鍵盤で弾いてください" : "頭の中で決めて弾いてから、「答え合わせ」を押してください"}</p>
          )}
          <div className="ear-actions">
            {phase === "listen" ? (
              <>
                <button type="button" className="dojo-primary" data-testid="ear-start-playing" onClick={beginPlay}>弾き始める <kbd>Enter</kbd></button>
                <button type="button" data-testid="ear-lap-again" onClick={() => listen("lap")}>もう一度聴く <kbd>R</kbd></button>
              </>
            ) : (
              <>
                <button type="button" data-testid="ear-listen-chord" onClick={() => listen("chord")}>今のコードを聴く <kbd>L</kbd></button>
                <button type="button" data-testid="ear-listen-pair" onClick={() => listen("pair")}>前のコードから続けて聴く <kbd>K</kbd></button>
                <button type="button" data-testid="ear-listen-lap" onClick={() => listen("lap")}>全体をもう一度 <kbd>R</kbd></button>
                {connected ? (
                  <button type="button" data-testid="ear-hint" disabled={current.hint >= 2} onClick={hint}>
                    ヒント:{current.hint === 0 ? "名前を見る" : current.hint === 1 ? "鍵盤で答えを見る" : "答えを表示中"} <kbd>Space</kbd>
                  </button>
                ) : revealed ? (
                  <>
                    <button type="button" className="dojo-primary" data-testid="ear-self-yes" onClick={() => selfJudge(true)}>弾けた <kbd>Y</kbd></button>
                    <button type="button" data-testid="ear-self-no" onClick={() => selfJudge(false)}>まだ <kbd>N</kbd></button>
                  </>
                ) : (
                  <button type="button" className="dojo-primary" data-testid="ear-reveal" onClick={() => setRevealed(true)}>答え合わせ <kbd>Space</kbd></button>
                )}
              </>
            )}
          </div>
          <p className="ear-stats" data-testid="ear-stats">
            聴き直し {session.listens}回{current.firstAnswerSec !== undefined && phase === "play" ? ` 最初の答えまで ${current.firstAnswerSec.toFixed(1)}s` : ""}
          </p>
          {settings.showClock ? (
            <p className="ear-clock" data-testid="ear-clock" data-bad={(clock?.spreadMs ?? 0) > 100 || undefined}>
              {clock
                ? `時計: 音の時計とページの時計の読みのばらつき ${clock.spreadMs.toFixed(1)} ms ・ 出力の遅れ ${clock.outputLatencyMs.toFixed(1)} ms${clock.spreadMs > 100 ? " ・ ばらつきが 100 ms を超えています(秒数が信用できません)" : ""}`
                : "時計: コードを鳴らすと表示されます"}
            </p>
          ) : null}
          <p className="ear-help">聴き直しは何度でも。印は付きません。ヒントは「名前を見る」→「鍵盤で答えを見る」の順。</p>
        </div>

        <div className="ear-score" data-testid="ear-score" data-open={scoreOpen || undefined}>
          <div className="ear-score-head">
            <b title="楽譜(押している音・答えは合ってから)"><span className="ear-score-long">楽譜(押している音・答えは合ってから)</span><span className="ear-score-short">楽譜</span></b>
            <button type="button" className="ear-zoom" data-testid="ear-score-zoom" onClick={() => setScoreOpen((open) => !open)}>
              {scoreOpen ? "閉じる" : "拡大"}
            </button>
          </div>
          <div className="ear-score-body">
            <GrandStaff
              compact
              staffGap={EAR_STAFF_GAP}
              showFingering={false}
              cropX={{ x: 58, width: 366 }}
              alwaysStaff
              {...(signature ? { keySignature: signature } : {})}
              {...(staffSounded ? { snapshot: staffSounded, tone: "sounded" as const, caption: `${soundedLabel} · 鳴った音` }
                : heldNow ? { snapshot: heldNow, tone: "held" as const, caption: "押している音" }
                  : { caption: "押している音" })}
              {...(staffAnswer ? { answerSnapshot: staffAnswer } : {})}
            />
          </div>
          <p className="ear-score-foot" data-testid="ear-score-foot">
            {staffSounded ? `${soundedLabel} の鳴った音: ${staffSounded.notes.map((note) => noteName(note.midi)).join(" ")}`
              : heldNames.length ? `${heldNames.join("・")} を押しています${signature ? `(調号 ${displayChordLabel(question.keyName)})` : ""}` : ""}
          </p>
        </div>
      </div>

      <div className="ear-keyboard dojo-keyboard" data-testid="ear-keyboard" data-range-min={range.minMidiNote} data-range-max={range.maxMidiNote} data-key-height={keyHeight}
        ref={keyboardRef} style={keyHeight === undefined ? undefined : ({ "--ear-key-h": `${keyHeight}px` } as CSSProperties)}>
        <div className="dojo-keyboard-head">
          <b>鍵盤</b>
          <span><i className="dojo-held-swatch" />押している音</span>
          <span><i className="dojo-answer-swatch" />答え(ヒントの2段目で出る)</span>
          <span className="ear-range">
            <button type="button" aria-label="1オクターブ下げる" data-testid="ear-range-down" onClick={() => onShiftKeyboard(-1)}>◀</button>
            <button type="button" aria-label="1オクターブ上げる" data-testid="ear-range-up" onClick={() => onShiftKeyboard(1)}>▶</button>
          </span>
          {outsideLow.length ? <span className="ear-outside" data-testid="ear-outside-low">◀ {noteName(Math.min(...outsideLow))}</span> : null}
          {outsideHigh.length ? <span className="ear-outside" data-testid="ear-outside-high">{noteName(Math.max(...outsideHigh))} ▶</span> : null}
        </div>
        <PracticeKeyboard
          appearance="dojo"
          hideLegend
          compactSummary
          octaveConvention="scientific"
          range={range}
          guideNotes={answerNotes}
          allowedPitchClasses={answerPcs}
          requiredPitchClasses={answerPcs}
          interactionMode={showAnswer ? undefined : "neutral-monitor"}
          level={showAnswer ? 1 : 2}
          matchState="empty"
          concealNoteNames={!showAnswer}
          {...(keyHeight === undefined ? {} : { dojoHeight: keyHeight })}
        />
        <div ref={keyboardEndRef} aria-hidden="true" style={{ height: 0 }} />
      </div>
    </div>
  );
}

/** The full-width Roman numerals of a degree, each in its own span, so that the kind after it can sit close (`Ⅰm`, not `Ⅰ m`). */
function romanSpans(degree: string) {
  return degree.split(/([ⅠⅡⅢⅣⅤⅥⅦ])/).map((part, position) =>
    /^[ⅠⅡⅢⅣⅤⅥⅦ]$/.test(part) ? <span key={position} className="ear-roman" data-roman={part}>{part}</span> : part);
}

/** The degree and the function under a chord name (the function is nothing when no rule fits). */
function DegreeLines({ info, index, result = false }: { info: EarChordInfo; index: number; result?: boolean }) {
  const prefix = result ? "ear-result-card" : "ear-card";
  return (
    <>
      <small className="ear-card-degree" data-testid={`${prefix}-degree-${index}`}>{romanSpans(info.degree)}</small>
      {info.fn ? <small className="ear-card-fn" data-kind={functionKind(info.fn)} data-testid={`${prefix}-function-${index}`}>{info.fn}</small> : null}
    </>
  );
}

// ---- the result ----------------------------------------------------------------------------------------

function EarResult({ session, records, playId, resultName, onAgain, onNext, onExit, clock, play, stop, infos }: {
  session: EarSession;
  records: readonly EarChordRecord[];
  playId: string;
  resultName: string | undefined;
  onAgain: () => void;
  onNext: () => void;
  onExit: () => void;
  clock: { spreadMs: number; outputLatencyMs: number } | undefined;
  play: (id: string, notes: MidiPreviewNote[], endBeat: number) => EarPlayHandle;
  stop: () => void;
  infos: ReadonlyArray<EarChordInfo | undefined>;
}) {
  const question = session.question;
  const [pressed, setPressed] = useState<number>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  /** A card on the result screen: its chord sounds; nothing is counted. */
  const pressCard = (index: number) => {
    const beats = CHORD_SECONDS * question.bpm / 60;
    void play(`ear:result-chord:${index}`, question.chords[index]!.notes.map((pitch) => ({ pitch, startBeat: 0, durationBeats: beats, velocity: 90 })), beats);
    setPressed(index);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPressed(undefined), CHORD_SECONDS * 1000);
  };
  const anyInfo = infos.some((info) => info !== undefined && info.fn !== "");
  const summary = session.summary();
  const title = question.source === "bank" ? `耳の課題 ${String(question.displayNumber ?? 0).padStart(3, "0")}`
    : question.source === "builtin" ? "定番の進行" : "自分の進行";
  const names = session.cards;
  const compared = recentComparison(records, { level: question.level, length: question.length, excludePlay: playId });
  const rateNow = summary.counted ? summary.firstTry / summary.counted : undefined;
  const rateDiff = diffRate(rateNow, compared.figures.firstTryRate);
  const secDiff = diffSeconds(summary.medianSec, compared.figures.medianSec);
  return (
    <div className="ear-run ear-result" data-testid="ear-result" data-clock-spread-ms={clock?.spreadMs.toFixed(1)} data-output-latency-ms={clock?.outputLatencyMs.toFixed(1)}>
      <div className="ear-head">
        <h1>{title}・レベル{question.level}・{question.length}小節</h1>
        {question.keyName ? <span className="ear-badge">キー {displayChordLabel(question.keyName)}</span> : null}
        <span className="ear-badge ear-badge-plain">テンポ {question.bpm}</span>
      </div>
      {resultName ? <p className="ear-line" data-testid="ear-result-name">この進行は <b>{resultName}</b> でした</p> : null}
      <div className="ear-cards ear-cards-result" data-testid="ear-result-cards">
        {names.map((card) => (
          <div
            className="ear-card"
            key={card.index}
            role="button"
            aria-label={`${card.index + 1}つ目のコードを鳴らす`}
            title="押すと鳴ります"
            data-pressable
            data-pressed={pressed === card.index || undefined}
            data-degree={infos[card.index] ? true : undefined}
            data-done={card.done || undefined}
            data-testid={`ear-result-card-${card.index}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pressCard(card.index)}
          >
            <span className="ear-card-top"><span className="ear-card-no">{card.index + 1}</span><span className="ear-marks">{session.marks(card).map((mark) => <i key={mark} className="ear-mark" data-mark={mark} title={MARK_LABEL[mark]}>{MARK_TEXT[mark]}</i>)}</span></span>
            <b className="ear-card-name">{displayChordLabel(card.label)}</b>
            {infos[card.index] ? <DegreeLines info={infos[card.index]!} index={card.index} result /> : null}
            <small className="ear-card-sub">{card.self ? "自分で判定" : card.shownFromStart ? "最初から表示" : card.sec !== undefined ? `${card.sec.toFixed(1)}s` : ""}</small>
          </div>
        ))}
      </div>
      <dl className="ear-summary" data-testid="ear-summary">
        <div><dt title="最初の答えで合った(聴き直しは何回でもよい・ヒントなし)">一発</dt><dd data-testid="ear-summary-first">{summary.firstTry} / {summary.counted}</dd></div>
        <div><dt>秒数の中央値</dt><dd data-testid="ear-summary-median">{summary.medianSec === undefined ? "—" : `${summary.medianSec.toFixed(1)}s`}</dd></div>
        <div><dt>ヒント</dt><dd data-testid="ear-summary-hints">{summary.hints}</dd></div>
        <div><dt>聴き直し</dt><dd data-testid="ear-summary-listens">{summary.listens}回</dd></div>
      </dl>
      <p className="ear-line" data-testid="ear-compare">
        {compared.plays === 0 ? "前回までとの比べ: 同じレベル・長さの記録がまだありません。" : (
          <>前回までとの比べ({compared.plays}問と比べて): 一発 {pct(rateNow)}(これまで {pct(compared.figures.firstTryRate)}){rateDiff ? ` ${rateDiff.text}` : ""}
            ・ 秒数 {secText(summary.medianSec)}(これまで {secText(compared.figures.medianSec)}){secDiff ? ` ${secDiff.text}` : ""}</>
        )}
      </p>
      {anyInfo ? <p className="ear-help" data-testid="ear-function-note">機能はコードの並びから自動で推定したものです。</p> : null}
      <ResultScore session={session} play={play} stop={stop} />
      <p className="ear-help">「一発」は、最初の答えで合った(聴き直しは何度でも可・ヒントなし)コードの数です。最初から名前が見えていたコードと、自分で判定したコードは数えません。</p>
      <div className="ear-actions">
        <button type="button" data-testid="ear-again" onClick={onAgain}>同じ進行をもう一度</button>
        <button type="button" className="dojo-primary" data-testid="ear-next" onClick={onNext}>次の問題 <kbd>Enter</kbd></button>
        <button type="button" data-testid="ear-to-choose" onClick={onExit}>選ぶ画面へ <kbd>Esc</kbd></button>
      </div>
    </div>
  );
}
