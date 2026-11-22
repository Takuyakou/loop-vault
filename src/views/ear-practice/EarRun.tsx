import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from "react";
import { useStore } from "zustand";
import { usePreviewSound } from "../../components/PreviewSoundProvider";
import { PracticeKeyboard } from "../../components/practice/PracticeKeyboard";
import {
  EarAnswerTaker, EarSession, answerSpecOf, FEW_CHORDS, functionKind, keySignatureOf, questionInfos, recentComparison, recentPlaySeries,
  type EarChordInfo, type EarChordRecord, type EarFigures, type EarMark, type EarQuestion, type EarSummary,
} from "../../domain/earPractice";
import { heldNotes } from "../../domain/liveMidi";
import { judgeEarAnswer, type EarJudgement } from "../../domain/earPractice/judgement";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { liveMidiService } from "../../liveMidi/liveMidiService";
import { openMidiPanel } from "../../liveMidi/midiPanel";
import type { MidiPreviewNote } from "../../audio/chordPreview";
import { GrandStaff } from "../chord-dojo/GrandStaff";
import { useDojoMidi } from "../chord-dojo/useDojoMidi";
import { createEarPlayback, playAnswerListen, type EarPlayback, type EarPlayHandle } from "./earPlayback";
import { earKeyboardRange } from "./earRange";
import { keyboardKeyHeight, whiteKeysIn } from "./earKeyboardHeight";
import { chordSnapshot, heldSnapshot } from "./earStaff";
import { diffRate, diffSeconds, pct, secText } from "./earFormat";
import { displayChordLabel } from "./label";
import type { EarSettings } from "./earSettings";
import { ResultScore } from "./ResultScore";
import { secondsLines } from "./earResultLines";

const NAMES = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
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
  /** S11-S15: the last judgement of this card, with the shape that was played (to leave that shape out of さっき試した形). */
  const [last, setLast] = useState<{ notes: readonly number[]; verdict: EarJudgement }>();
  const [lapIndex, setLapIndex] = useState<number>();
  /** S3: the wheel of the big listen button runs for as long as the sound does; nothing is measured here. */
  const [ring, setRing] = useState<{ ms: number; token: number }>();
  const ringToken = useRef(0);
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

  /** S3: a new sound restarts the wheel; the end of an older sound does not stop the newer one. */
  const startRing = useCallback((ms: number) => {
    ringToken.current += 1;
    const token = ringToken.current;
    setRing({ ms, token });
    return token;
  }, []);
  const endRing = useCallback((token: number) => {
    if (ringToken.current === token) setRing(undefined);
  }, []);

  const playChord = useCallback((index: number) => {
    const beats = CHORD_SECONDS * question.bpm / 60;
    const handle = play(`ear:chord:${index}`, chordNotes(index, 0, beats), beats);
    const token = startRing(CHORD_SECONDS * 1000);
    void handle.ended.then(() => endRing(token));
    return handle;
  }, [chordNotes, endRing, play, question.bpm, startRing]);

  const playPair = useCallback((index: number) => {
    const each = 2;
    const first = Math.max(0, index - 1);
    const notes = [first, index].filter((value, position, all) => all.indexOf(value) === position)
      .flatMap((chordIndex, position) => chordNotes(chordIndex, position * each, each * 0.95));
    const endBeat = each * (index === first ? 1 : 2);
    const handle = play(`ear:pair:${index}`, notes, endBeat);
    const token = startRing(endBeat * 60000 / question.bpm);
    void handle.ended.then(() => endRing(token));
    return handle;
  }, [chordNotes, endRing, play, question.bpm, startRing]);

  const beginPlayRef = useRef<() => void>(() => undefined);
  const playLap = useCallback((purpose: "first" | "again") => {
    const token = (tokenRef.current += 1);
    const notes = question.chords.flatMap((chord) =>
      chord.notes.map((pitch) => ({ pitch, startBeat: chord.startBeat, durationBeats: chord.durationBeats * 0.92, velocity: 90 })));
    const handle = play("ear:lap", notes, question.length * question.beatsPerBar);
    const ringId = startRing(question.length * question.beatsPerBar * 60000 / question.bpm);
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
      endRing(ringId);
      if (tokenRef.current !== token) return;
      setLapIndex(undefined);
      if (reason === "completed" && purpose === "first") beginPlayRef.current();
    });
  }, [endRing, play, question, startRing]);

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
    const chordNow = session.currentChord;
    const verdict = judgeEarAnswer({ symbol: chordNow.symbol, judge: chordNow.judge, notes: chordNow.notes }, notes);
    setFeedback({ ok: result.ok, text: result.message });
    if (result.ok) {
      setLast(undefined);
      soundedAtRef.current = perfNow();
      setSoundedIndex(session.index);
      session.next();
      bump();
      if (session.phase === "result") playback.stop();
      else armCard(session.index);
    } else {
      setLast({ notes: [...notes].sort((left, right) => left - right), verdict });
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
    setLast(undefined);
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
  const listen = useCallback((kind: "chord" | "pair" | "lap" | "bass" | "spread") => {
    if (session.phase === "listen") {
      if (kind === "lap") playLap("first");
      return;
    }
    if (session.phase !== "play") return;
    session.countListen();
    bump();
    if (kind === "chord") void playChord(session.index);
    else if (kind === "pair") void playPair(session.index);
    else if (kind === "bass" || kind === "spread") {
      // S5/S6: the answer of this card, its lowest note alone or its notes one at a time. A listen like any other.
      const chordNow = session.currentChord;
      const beats = CHORD_SECONDS * question.bpm / 60;
      const handle = playAnswerListen(play, `ear:${kind}:${session.index}`, chordNow.notes, kind, { chordBeats: beats });
      const lengthBeats = kind === "bass" ? beats : [...new Set(chordNow.notes)].length;
      const token = startRing(lengthBeats * 60000 / question.bpm);
      void handle.ended.then(() => endRing(token));
    } else playLap("again");
  }, [endRing, play, playChord, playLap, playPair, question.bpm, session, startRing]);

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
      else if (k === "b") listen("bass");
      else if (k === "a") listen("spread");
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
  // S11-S15: what the last judgement says, in the words the screen adds around it.
  const pcOf = (note: number) => ((note % 12) + 12) % 12;
  const verdictNow = phase === "play" && last && !last.verdict.ok ? last.verdict : undefined;
  const extraPcs = verdictNow?.extra ?? [];
  const namedMissing = verdictNow?.namedMissing;
  const guide = !feedback || feedback.ok || !verdictNow ? undefined
    : verdictNow.extra.length ? "赤い音を外して、もう一度押さえてください。"
      : verdictNow.missing.length ? "音を足して、もう一度押さえてください。"
        : verdictNow.bassWrong ? "一番下の音を替えて、もう一度押さえてください。"
          : undefined;
  // S15: the shape of the judgement on show is not repeated under さっき試した形.
  const newestFormIsShown = Boolean(verdictNow && last && session.triedForms[0] && session.triedForms[0]!.notes.join(",") === last.notes.join(","));
  const triedShown = connected ? (newestFormIsShown ? session.triedForms.slice(1) : session.triedForms).slice(0, 2) : [];
  // B2: the pressed keys whose note names the last judgement called extra.
  const foreignKeys = extraPcs.length ? held.filter((note) => extraPcs.includes(pcOf(note))) : [];

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
        <button type="button" className="ear-back" data-testid="ear-back" onClick={onExit} aria-label="耳で弾くに戻る">
          <span aria-hidden="true">‹</span> 耳で弾く
        </button>
        <h1 data-testid="ear-title">
          <span className="ear-title-main">{title}</span>
          <span className="ear-title-fact">・レベル{question.level}</span>
          <span className="ear-title-fact">・{question.length}小節</span>
        </h1>
        {settings.showFirstName ? (
          <span className="ear-badge" data-testid="ear-key">
            {keyKnown ? `キー ${displayChordLabel(question.keyName)} ・ ` : ""}1つ目 {displayChordLabel(question.chords[0]!.label)}
          </span>
        ) : null}
        <span className="ear-badge ear-badge-plain">テンポ {question.bpm}</span>
        {benchmarkStep ? <span className="ear-badge" data-testid="ear-benchmark-step">腕試し {benchmarkStep.index + 1} / {benchmarkStep.total}</span> : null}
        <div className="ear-steps" role="group" aria-label="練習の流れ">
          <span data-state={phase === "listen" ? "current" : "done"}>
            <i className="ear-step-no" aria-hidden="true">{phase === "listen" ? "1" : "✓"}</i>
            <b className="ear-step-label">1周聴く</b>
          </span>
          <em className="ear-step-line" data-filled={phase !== "listen" ? "true" : undefined} aria-hidden="true" />
          <span data-state={phase === "play" ? "current" : "todo"}>
            <i className="ear-step-no" aria-hidden="true">2</i>
            <b className="ear-step-label">1コードずつ弾く{phase === "play" ? ` ${session.index + 1} / ${cardCount}` : ""}</b>
          </span>
          <em className="ear-step-line" aria-hidden="true" />
          <span data-state="todo">
            <i className="ear-step-no" aria-hidden="true">3</i>
            <b className="ear-step-label">結果</b>
          </span>
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
              <i className="ear-card-bar" data-kind={card.done && showInfo && info ? functionKind(info.fn) : undefined} aria-hidden="true" />
            </div>
          );
        })}
      </div>
      <div className="ear-under">
        <div className="ear-legend" aria-label="印の意味">
          {(["ok", "retry", "name", "key"] as EarMark[]).map((mark) => (
            <span key={mark}><i className="ear-mark" data-mark={mark}>{MARK_TEXT[mark]}</i>{MARK_LABEL[mark]}</span>
          ))}
        </div>
        <div className="ear-position" aria-label="全体の位置" data-testid="ear-position">
          <span>{Math.min(session.index + 1, cardCount)} / {cardCount}</span>
          {session.cards.map((card, index) => (
            <i key={index} className="ear-dot" data-current={(phase === "play" && index === session.index) || undefined}
              data-state={card.done ? (card.mistakes > 0 || card.hint > 0 ? "help" : "ok") : card.mistakes > 0 ? "retry" : "todo"} />
          ))}
        </div>
        {onShowDegrees && !benchmarkStep && known ? (
          <label className="ear-toggle" title="合う前から、度数と機能を全部のカードに出します(出したコードは、一発などの成績に入りません)">
            <input type="checkbox" data-testid="ear-degree-toggle" checked={settings.showDegrees} onChange={(event) => onShowDegrees(event.target.checked)} />
            度数と機能を見せる
          </label>
        ) : <span className="ear-under-fill" aria-hidden="true" />}
      </div>

      <div className="ear-stage">
        <section className="ear-zone ear-listen" aria-label="聴く">
          <div className="ear-zone-head"><b>聴く</b><small>何度でも。印は付きません</small></div>
          <div className="ear-listen-body">
            <button type="button" className="ear-orb" data-testid={phase === "listen" ? "ear-lap-again" : "ear-listen-chord"}
              title={phase === "play" ? "今のコードを聴く(L)" : "全体をもう一度聴く(R)"}
              aria-label={phase === "play" ? "今のコードを聴く" : "全体をもう一度聴く"}
              onClick={() => listen(phase === "listen" ? "lap" : "chord")}>
              <svg className="ear-orb-ring" viewBox="0 0 100 100" aria-hidden="true">
                <circle className="ear-orb-ring-track" cx="50" cy="50" r="46" />
                {ring ? <circle key={ring.token} className="ear-orb-ring-fill" style={{ "--ear-ring-ms": `${ring.ms}ms` } as CSSProperties} cx="50" cy="50" r="46" pathLength={100} /> : null}
              </svg>
              <span className="ear-orb-core">
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
                  <path d="M16 8.5a5 5 0 0 1 0 7M18.6 6a8.5 8.5 0 0 1 0 12" />
                </svg>
                <b>{phase === "listen" ? "全体を聴く" : "今のコード"}</b>
                <small><kbd>{phase === "listen" ? "R" : "L"}</kbd></small>
              </span>
            </button>
            <div className="ear-listen-list">
              <button type="button" data-testid="ear-listen-pair" disabled={phase !== "play"} onClick={() => listen("pair")}><span>前のコードから</span><kbd>K</kbd></button>
              <button type="button" data-testid="ear-listen-lap" onClick={() => listen("lap")}><span>全体をもう一度</span><kbd>R</kbd></button>
              <button type="button" data-testid="ear-listen-bass" disabled={phase !== "play"} onClick={() => listen("bass")}><span>ベースだけ</span><kbd>B</kbd></button>
              <button type="button" data-testid="ear-listen-spread" disabled={phase !== "play"} onClick={() => listen("spread")}><span>ばらして聴く</span><kbd>A</kbd></button>
            </div>
          </div>
        </section>

        <section className="ear-zone ear-answer" aria-label={phase === "listen" ? "まず聴く" : "答える"}>
          {!connected ? (
            <p className="ear-notice" role="status" data-testid="ear-no-midi">
              MIDI キーボードがつながっていません。聴いて、自分で判定して進められます。
              <button type="button" onClick={() => openMidiPanel()}>MIDI をつなぐ</button>
            </p>
          ) : null}
          {phase === "listen" ? (
            <>
              <div className="ear-zone-head"><b>まず聴く</b></div>
              <div className="ear-listen-big">
                <p className="ear-listening" data-testid="ear-listening">進行を聴いています… {settings.showFirstName ? "(1つ目のコード名は見えています)" : ""}</p>
                <p className="ear-lap-count"><b>{Math.min(cardCount, (lapIndex ?? 0) + 1)}</b> / {cardCount} 小節</p>
                <button type="button" className="dojo-primary ear-primary" data-testid="ear-start-playing" onClick={beginPlay}>弾き始める <kbd>Enter</kbd></button>
              </div>
            </>
          ) : (
            <>
              <div className="ear-zone-head">
                <b>答える</b>
                <span className="ear-stats" data-testid="ear-stats">
                  聴き直し {session.listens}回{current.firstAnswerSec !== undefined ? ` 最初の答えまで ${current.firstAnswerSec.toFixed(1)}s` : ""}
                </span>
              </div>
              <div className="ear-now">
                <div className="ear-tile" data-bad={verdictNow && !verdictNow.ok || undefined}>
                  <b>{session.index + 1}</b>
                  <small>つ目</small>
                </div>
                <div className="ear-now-text">
                  {feedback ? (
                    <p className="ear-feedback" data-ok={feedback.ok} role="status" data-testid="ear-feedback">{feedback.ok ? "✓ " : "× "}{feedback.text}</p>
                  ) : (
                    <p className="ear-line">{connected ? "聴いたコードを鍵盤で弾いてください" : "頭の中で決めて弾いてから、「答え合わせ」を押してください"}</p>
                  )}
                  {guide ? <p className="ear-sline" data-testid="ear-feedback-guide">{guide}</p> : null}
                </div>
              </div>
              {connected ? (
                <>
                  <div className="ear-held" data-testid="ear-held-chips">
                    <span className="ear-held-k">押している音</span>
                    {held.length ? held.map((note, position) => (
                      <span key={note} className="ear-chip" data-extra={extraPcs.includes(pcOf(note)) || undefined}>{heldNames[position] ?? NAMES[pcOf(note)]}</span>
                    )) : <span className="ear-chip-none">—</span>}
                    {namedMissing !== undefined ? <span className="ear-chip" data-missing="true">{NAMES[namedMissing]}</span> : null}
                  </div>
                  {triedShown.length ? (
                    <div className="ear-tried" data-testid="ear-tried">
                      <span className="ear-held-k">さっき試した形</span>
                      {triedShown.map((form) => {
                        const formVerdict = judgeEarAnswer({ symbol: chord.symbol, judge: chord.judge, notes: chord.notes }, form.notes);
                        return (
                          <div className="ear-tried-row" key={`${form.attempt}:${form.notes.join(",")}`}>
                            <span className="ear-tried-n">{form.attempt} 回目</span>
                            {form.notes.map((note) => (
                              <span key={note} className="ear-chip ear-chip-sm" data-extra={formVerdict.extra.includes(pcOf(note)) || undefined}>{NAMES[pcOf(note)]}</span>
                            ))}
                            <span className="ear-tried-msg">{form.message}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              ) : null}
              {settings.showClock ? (
                <p className="ear-clock" data-testid="ear-clock" data-bad={(clock?.spreadMs ?? 0) > 100 || undefined}>
                  {clock
                    ? `時計: 音の時計とページの時計の読みのばらつき ${clock.spreadMs.toFixed(1)} ms ・ 出力の遅れ ${clock.outputLatencyMs.toFixed(1)} ms${clock.spreadMs > 100 ? " ・ ばらつきが 100 ms を超えています(秒数が信用できません)" : ""}`
                    : "時計: コードを鳴らすと表示されます"}
                </p>
              ) : null}
              <div className="ear-hintrow">
                <span className="ear-hint-k">ヒント</span>
                {connected ? (
                  <>
                    {current.hint === 0 ? (
                      <button type="button" className="ear-hintbtn" data-testid="ear-hint" onClick={hint}>① 名前を見る <kbd>Space</kbd><i className="ear-mark" data-mark="name">名</i></button>
                    ) : (
                      <span className="ear-hintbtn" data-used="true">① 名前を見る <i className="ear-mark" data-mark="name">名</i></span>
                    )}
                    <span className="ear-hint-arrow" aria-hidden="true">→</span>
                    {current.hint === 0 ? (
                      <span className="ear-hintbtn" data-todo="true">② 鍵盤で答えを見る <i className="ear-mark" data-mark="key">鍵</i></span>
                    ) : current.hint === 1 ? (
                      <button type="button" className="ear-hintbtn" data-testid="ear-hint" onClick={hint}>② 鍵盤で答えを見る <kbd>Space</kbd><i className="ear-mark" data-mark="key">鍵</i></button>
                    ) : (
                      <button type="button" className="ear-hintbtn" data-testid="ear-hint" disabled>② 答えを表示中 <i className="ear-mark" data-mark="key">鍵</i></button>
                    )}
                  </>
                ) : revealed ? (
                  <>
                    <button type="button" className="dojo-primary" data-testid="ear-self-yes" onClick={() => selfJudge(true)}>弾けた <kbd>Y</kbd></button>
                    <button type="button" data-testid="ear-self-no" onClick={() => selfJudge(false)}>まだ <kbd>N</kbd></button>
                  </>
                ) : (
                  <button type="button" className="dojo-primary" data-testid="ear-reveal" onClick={() => setRevealed(true)}>答え合わせ <kbd>Space</kbd></button>
                )}
              </div>
            </>
          )}
        </section>

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
          <span><i className="dojo-extra-swatch" />余分な音</span>
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
          {...(foreignKeys.length ? { foreignNotes: foreignKeys } : {})}
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

/** X11: the figures of a run that is not in the records yet, from the session's own summary (one point, the newest). */
function figuresFromSession(session: EarSession, summary: EarSummary): EarFigures {
  const counted = session.cards.filter((card) => !card.shownFromStart && !card.self && card.done);
  const rateOf = (part: number) => (summary.counted ? part / summary.counted : undefined);
  const noHint = counted.filter((card) => card.hint === 0).length;
  const clean = counted.filter((card) => card.mistakes === 0 && card.hint === 0 && card.listens === 0).length;
  return {
    chords: session.cards.length,
    measured: summary.counted,
    firstTry: summary.firstTry,
    noHint,
    cleanFirstTry: clean,
    firstTryRate: rateOf(summary.firstTry),
    noHintRate: rateOf(noHint),
    cleanRate: rateOf(clean),
    ...(summary.medianSec !== undefined ? { medianSec: summary.medianSec } : {}),
    ...(summary.counted ? { replayAvg: counted.reduce((sum, card) => sum + card.listens, 0) / summary.counted } : {}),
    few: summary.counted < FEW_CHORDS,
  };
}

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
  /** X7: the whole progression once, as the score plays it (nothing is counted). */
  const playAll = () => {
    const total = question.length * question.beatsPerBar;
    const notes = question.chords.flatMap((chord) =>
      chord.notes.map((pitch) => ({ pitch, startBeat: chord.startBeat, durationBeats: chord.durationBeats * 0.92, velocity: 90 })));
    void play("ear:result:all", notes, total);
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
  const nameHints = session.cards.filter((card) => card.hint >= 1).length;
  const keyHints = session.cards.filter((card) => card.hint >= 2).length;
  // X8: a card shown from the start or judged by the player has no seconds' line, even though it was timed.
  const lines = secondsLines(session.cards.map((card) => ({ sec: card.shownFromStart || card.self ? undefined : card.sec })), summary.medianSec);
  const degrees = infos.every((info) => info !== undefined) ? infos.map((info) => info!.degree).join(" → ") : "";
  const keyName = question.keyName !== "" ? displayChordLabel(question.keyName) : "";
  // X10/X11: the last questions of this level and length, the current one at the right end.
  const series = useMemo(() => {
    const points = recentPlaySeries(records, { level: question.level, length: question.length });
    if (points.some((point) => point.play === playId)) return points;
    return [...points, { play: playId, at: "", figures: figuresFromSession(session, summary) }].slice(-12);
  }, [playId, question.length, question.level, records, session, summary]);
  const currentIndex = series.length - 1;
  const previous = series.slice(0, currentIndex);
  const meanOf = (values: ReadonlyArray<number | undefined>) => {
    const present = values.filter((value): value is number => value !== undefined);
    return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : undefined;
  };
  const rateMean = meanOf(previous.map((point) => point.figures.firstTryRate));
  const secMean = meanOf(previous.map((point) => point.figures.medianSec));
  const maxTrendSec = Math.max(1, ...series.map((point) => point.figures.medianSec ?? 0));
  const rateLabel = `一発の割合。直近 ${series.length} 問。今回 ${pct(rateNow)}${rateMean === undefined ? "" : `、これまでの平均 ${pct(rateMean)}`}`;
  const secLabel = `秒数の中央値。直近 ${series.length} 問。今回 ${secText(summary.medianSec)}${secMean === undefined ? "" : `、これまでの平均 ${secText(secMean)}`}`;
  const ring = 2 * Math.PI * 50;
  // P23-58-fix-1 B6: at >= 1200px wide, move 「これまでとの比べ」 into the top band's 3rd column so the score takes full width.
  const [wideTrend, setWideTrend] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1200 : false));
  const [shortWide, setShortWide] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1200 && window.innerHeight <= 800 : false));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mqWide = window.matchMedia("(min-width: 1200px)");
    const mqShort = window.matchMedia("(min-width: 1200px) and (max-height: 800px)");
    const sync = () => {
      setWideTrend(mqWide.matches);
      setShortWide(mqShort.matches);
    };
    sync();
    mqWide.addEventListener("change", sync);
    mqShort.addEventListener("change", sync);
    return () => {
      mqWide.removeEventListener("change", sync);
      mqShort.removeEventListener("change", sync);
    };
  }, []);
  const trendAside = (
    <aside className={`ear-result-trend${wideTrend ? " ear-result-trend-top" : ""}`} data-testid="ear-result-trend">
      <div className="ear-trend-head"><b>これまでとの比べ</b><small>同じレベル・長さの直近 12 問</small></div>
      <figure className="ear-trend-chart" data-testid="ear-trend-rate" role="img" aria-label={rateLabel}>
        <figcaption>一発の割合</figcaption>
        <div className="ear-trend-bars">
          {series.map((point, index) => (
            <i key={point.play || index} className="ear-trend-bar" data-current={index === currentIndex || undefined}
              data-empty={point.figures.firstTryRate === undefined || undefined}
              style={{ "--ear-trend": point.figures.firstTryRate ?? 0 } as CSSProperties} />
          ))}
        </div>
        <div className="ear-trend-axis"><span>{series.length - 1} 問前</span><span>今回 {pct(rateNow)}</span></div>
      </figure>
      <figure className="ear-trend-chart" data-testid="ear-trend-seconds" role="img" aria-label={secLabel}>
        <figcaption title="秒数の中央値(低いほど速い)">秒数の中央値</figcaption>
        <div className="ear-trend-bars">
          {series.map((point, index) => (
            <i key={point.play || index} className="ear-trend-bar" data-current={index === currentIndex || undefined}
              data-empty={point.figures.medianSec === undefined || undefined}
              style={{ "--ear-trend": (point.figures.medianSec ?? 0) / maxTrendSec } as CSSProperties} />
          ))}
        </div>
        <div className="ear-trend-axis"><span>{series.length - 1} 問前</span><span>今回 {secText(summary.medianSec)}</span></div>
      </figure>
      {series.length <= 1 ? <p className="ear-help">同じレベル・長さの記録がまだありません。</p> : null}
    </aside>
  );
  return (
    <div className="ear-run ear-result" data-testid="ear-result" data-clock-spread-ms={clock?.spreadMs.toFixed(1)} data-output-latency-ms={clock?.outputLatencyMs.toFixed(1)}>
      <div className="ear-head">
        <button type="button" className="ear-back" data-testid="ear-back" onClick={onExit} aria-label="耳で弾くに戻る">
          <span aria-hidden="true">‹</span> 耳で弾く
        </button>
        <h1>
          <span className="ear-title-main">{title}</span>
          <span className="ear-title-fact">・レベル{question.level}</span>
          <span className="ear-title-fact">・{question.length}小節</span>
        </h1>
        {question.keyName ? <span className="ear-badge">キー {displayChordLabel(question.keyName)}</span> : null}
        <span className="ear-badge ear-badge-plain">テンポ {question.bpm}</span>
        <div className="ear-steps" role="group" aria-label="練習の流れ">
          <span data-state="done"><i className="ear-step-no" aria-hidden="true">✓</i><b className="ear-step-label">1周聴く</b></span>
          <em className="ear-step-line" data-filled="true" aria-hidden="true" />
          <span data-state="done"><i className="ear-step-no" aria-hidden="true">✓</i><b className="ear-step-label">1コードずつ弾く</b></span>
          <em className="ear-step-line" data-filled="true" aria-hidden="true" />
          <span data-state="current"><i className="ear-step-no" aria-hidden="true">3</i><b className="ear-step-label">結果</b></span>
        </div>
      </div>

      <div className="ear-result-body">
        {/* X2-X6: one face — the first-try wheel, the question's name and key, the four figures (and trend at >=1200px). */}
        <div className="ear-result-top" data-wide-trend={wideTrend || undefined}>
          <div className="ear-rate">
            <svg className="ear-rate-ring" viewBox="0 0 110 110" aria-hidden="true">
              <circle className="ear-rate-track" cx="55" cy="55" r="50" />
              {rateNow !== undefined && rateNow > 0 ? <circle className="ear-rate-fill" cx="55" cy="55" r="50" strokeDasharray={`${ring * rateNow} ${ring}`} /> : null}
            </svg>
            <div className="ear-rate-center">
              <b data-len={(summary.counted ? `${summary.firstTry} / ${summary.counted}` : "— / 0").length}>{summary.counted ? `${summary.firstTry} / ${summary.counted}` : "— / 0"}</b>
              <span>一発</span>
            </div>
          </div>
          <div className="ear-result-now">
            {resultName ? <p className="ear-result-name" data-testid="ear-result-name"><small>この進行は</small> <b>{resultName}</b> <small>でした</small></p> : null}
            {(keyName || degrees) ? (
              <p className="ear-result-facts">{keyName ? `キー ${keyName}` : ""}{keyName && degrees ? " ・ " : ""}{degrees}</p>
            ) : null}
            <dl className="ear-summary" data-testid="ear-summary">
              <div className="ear-summary-card">
                <dt title="最初の答えで合った(聴き直しは何回でもよい・ヒントなし)">一発</dt>
                <dd data-testid="ear-summary-first">{summary.firstTry} / {summary.counted}</dd>
                {compared.plays ? <dd className="ear-summary-note">{rateDiff ? <span className="ear-diff" data-better={rateDiff.better}>{rateDiff.text}</span> : null}これまで {pct(compared.figures.firstTryRate)}</dd> : null}
              </div>
              <div className="ear-summary-card">
                <dt>秒数の中央値</dt>
                <dd data-testid="ear-summary-median">{summary.medianSec === undefined ? "—" : `${summary.medianSec.toFixed(1)}s`}</dd>
                {compared.plays ? <dd className="ear-summary-note">{secDiff ? <span className="ear-diff" data-better={secDiff.better}>{secDiff.text}</span> : null}これまで {secText(compared.figures.medianSec)}</dd> : null}
              </div>
              <div className="ear-summary-card">
                <dt>ヒント</dt>
                <dd data-testid="ear-summary-hints">{summary.hints}</dd>
                <dd className="ear-summary-note">名前 {nameHints} ・ 鍵盤 {keyHints}</dd>
              </div>
              <div className="ear-summary-card">
                <dt>聴き直し</dt>
                <dd data-testid="ear-summary-listens">{summary.listens}回</dd>
                <dd className="ear-summary-note">印は付きません</dd>
              </div>
            </dl>
          </div>
          {wideTrend ? trendAside : null}
        </div>
        <p className="ear-line ear-compare-line" data-testid="ear-compare">
          {compared.plays === 0 ? "前回までとの比べ: 同じレベル・長さの記録がまだありません。" : (
            <>前回までとの比べ({compared.plays}問と比べて): 一発 {pct(rateNow)}(これまで {pct(compared.figures.firstTryRate)}){rateDiff ? ` ${rateDiff.text}` : ""}
              ・ 秒数 {secText(summary.medianSec)}(これまで {secText(compared.figures.medianSec)}){secDiff ? ` ${secDiff.text}` : ""}</>
          )}
        </p>

        {/* X7/X8: one card per chord, with the seconds' line under it. */}
        <div className="ear-result-cards-head">
          <b>1 コードずつ</b>
          <span>押すと鳴ります。下の線は、かかった秒数です(黄色は時間がかかった所)。</span>
          <button type="button" data-testid="ear-result-play-all" onClick={playAll}>通して聴く</button>
        </div>
        <div className="ear-cards ear-cards-result" data-testid="ear-result-cards">
          {names.map((card) => {
            const line = lines[card.index];
            return (
              <div
                className="ear-card ear-result-card"
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
                <i className="ear-card-bar" data-kind={infos[card.index] ? functionKind(infos[card.index]!.fn) : undefined} aria-hidden="true" />
                {line ? <i className="ear-result-sec" data-slow={line.slow || undefined} style={{ "--ear-sec": line.ratio } as CSSProperties} aria-hidden="true" /> : null}
              </div>
            );
          })}
        </div>

        {/* X9/X10: the score and, beside it (under it when narrow; in top band when >=1200px), the last twelve questions. */}
        <div className="ear-result-row" data-wide-trend={wideTrend || undefined}>
          <div className="ear-result-score-face">
            <ResultScore
              session={session}
              play={play}
              stop={stop}
              compactHeader={shortWide}
              functionNote={shortWide && anyInfo ? "機能はコードの並びから自動で推定したものです。" : undefined}
            />
            {anyInfo && !shortWide ? <p className="ear-help" data-testid="ear-function-note">機能はコードの並びから自動で推定したものです。</p> : null}
          </div>
          {wideTrend ? null : trendAside}
        </div>
      </div>

      <div className="ear-result-foot">
        <button type="button" data-testid="ear-to-choose" onClick={onExit}>選ぶ画面へ <kbd>Esc</kbd></button>
        <p className="ear-help">「一発」は、最初の答えで合った(聴き直しは何度でも可・ヒントなし)コードの数です。最初から名前が見えていたコードと、自分で判定したコードは数えません。</p>
        <div className="ear-result-foot-actions">
          <button type="button" data-testid="ear-again" onClick={onAgain}>同じ進行をもう一度</button>
          <button type="button" className="dojo-primary" data-testid="ear-next" onClick={onNext}>次の問題 <kbd>Enter</kbd></button>
        </div>
      </div>
    </div>
  );
}
