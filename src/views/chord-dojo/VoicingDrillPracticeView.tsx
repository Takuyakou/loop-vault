import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { playbackController } from "../../audio/playbackController";
import { usePreviewSound } from "../../components/PreviewSoundProvider";
import {
  DRILL_KEY_NAMES, buildDrillKeySet, drillMismatch, drillSetById, drillSetRevision,
  type CCard, type DrillCard,
} from "../../domain/chordDojo/voicingDrill";
import {
  advanceDrillCard, beginDrillLap, beginManualDrillRound, drillCardElapsedMs, drillElapsedMs, drillEvent,
  drillLapCounts, idleDrillRound, markDrillHint, prepareDrillRound,
  type DrillRound,
} from "../../domain/chordDojo/voicingDrillSession";
import { NAMES } from "../../domain/chordDojo/recipes";
const pc = (note: number) => ((note % 12) + 12) % 12;
import {
  drillEntryFor, voicingDrillRecordsStore, type DrillRecordCard, type DrillStageKey,
} from "../../domain/chordDojo/voicingDrillRecords";
import {
  drillBestOfSet, drillKeyBests, drillKeyName, drillNewestLast, drillPaceTotal, drillPriorRevisions,
  drillSlowCards, formatDrillLap, formatDrillSeconds,
} from "../../domain/chordDojo/voicingDrillProgress";
import { nextJazzKey, startJazzKeyBag, type JazzKeyBag } from "../../domain/chordDojo/jazzRandomKey";
import { heldNotes, reduceLiveNoteState, sustainedNotes, createLiveNoteState } from "../../domain/liveMidi";
import { type TargetSnapshot, type WrittenPitch } from "../../domain/chordDojo/targetSnapshot";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { liveMidiService } from "../../liveMidi/liveMidiService";
import { HeldCardBoard, heldStaffExtent } from "./HeldCardParts";
import { PracticeActions, PracticeCard, PracticeConditions, PracticeGuide, PracticeHead, PracticeLap, PracticeResult, PracticeSafeArea, RepeatToggle, keyed, type StageItem } from "./PracticeFrame";

/** P22-01 §4-4: what the staff and the list said always, behind the 「?」 of the conditions. */
const DRILL_HELP = "楽譜は構成音の表示です（リズムの指定はありません）。左手はルート 1 音、右手は決まった形です。形どおりに押さえると 1 枚進みます。選んだキーで 1 周の秒数を記録します（ヒントを見た周は記録しません）。";
import { degreeFunctionKinds } from "../../domain/earPractice/degreeFunction";
import { usePracticeLayout } from "./practiceLayout";
import { readRepeatSetting, writeRepeatSetting } from "./practiceRepeat";
import { answerKeyboardRange } from "./keyboardRange";
import { useDojoMidi } from "./useDojoMidi";
import { whiteKeysIn } from "../ear-practice/earKeyboardHeight";
import { DRILL_STAGE_LABELS } from "./voicingDrillLabels";
import { rememberRecent } from "./dojoRecent";
import "./voicingDrill.css";

/**
 * P19 ボイシングドリル: one set, one key, ① 見て弾く or ② 覚えて弾く. The left hand is the root, the right hand is the
 * fixed shape; the lap is judged by `voicingDrillSession` from the held keys only (no pedal), timed by the MIDI input,
 * and kept in its own record file. Without MIDI the answer is shown and 「弾けた」 advances, with no seconds and no
 * record. The screen uses the P18 practice frame (head, cards, staff, keyboard, a free strip under the keyboard).
 */
interface DrillResult {
  readonly totalMs: number;
  readonly cardMs: readonly number[];
  readonly marks: readonly number[];
  readonly key: number;
  readonly stage: DrillStageKey;
  readonly hinted: boolean;
  readonly recorded: boolean;
  readonly manual: boolean;
  readonly bestBefore?: number;
  readonly lastBefore?: number;
  readonly improved: boolean;
}

const GLYPH_ALTER: Record<string, number> = { "♯": 1, "♭": -1, "𝄪": 2, "𝄫": -2 };
/** `E4`, `B♭3`, `A𝄫4`: the spelling the drill already writes. */
function writtenPitch(name: string): WrittenPitch {
  const match = /^([A-G])([\u266F\u266D\u{1D12A}\u{1D12B}]*)(-?\d+)$/u.exec(name);
  if (!match) return { step: "C", alter: 0, octave: 4 };
  return { step: match[1] as WrittenPitch["step"], alter: [...match[2]!].reduce((sum, glyph) => sum + (GLYPH_ALTER[glyph] ?? 0), 0), octave: Number(match[3]) };
}

/** The staff and keyboard picture of one card, with the written names the drill uses (not a second spelling). */
function snapshotOf(setId: string, key: number, card: DrillCard): TargetSnapshot {
  const notes = [
    ...card.left.map((midi, index) => ({ id: `${setId}:${key}:${card.id}:L${index}`, midi, hand: "left" as const, spelling: writtenPitch(card.leftNames[index]!) })),
    ...card.right.map((midi, index) => ({ id: `${setId}:${key}:${card.id}:R${index}`, midi, hand: "right" as const, spelling: writtenPitch(card.rightNames[index]!) })),
  ];
  return {
    targetId: `voicing-drill:${setId}:${card.id}`,
    revision: `${setId}:${key}:${card.id}`,
    midiNotes: [...card.left, ...card.right],
    bass: card.left[0],
    chordSymbol: card.label,
    keyContext: DRILL_KEY_NAMES[key],
    notes,
  };
}

const recordCards = (cards: readonly CCard[]): DrillRecordCard[] =>
  cards.map((card) => ({ id: card.id, label: card.label, degree: card.degree, form: card.form, left: [...card.left], right: [...card.right] }));

export function VoicingDrillPracticeView({ setId, onBack, initialKey, initialStage, initialRandom }: { setId: string; onBack: () => void; /** P20: resume the last stage, key and random flag at the start of the lap. */ initialKey?: number; initialStage?: DrillStageKey; initialRandom?: boolean }) {
  const set = drillSetById(setId)!;
  const revision = drillSetRevision(setId);
  const records = useStore(voicingDrillRecordsStore);
  useEffect(() => { void voicingDrillRecordsStore.getState().initialize(); }, []);

  const [key, setKeyState] = useState(initialKey ?? 0);
  const [bag, setBagState] = useState<JazzKeyBag | undefined>(() => initialRandom ? startJazzKeyBag(Math.floor(Math.random() * 2 ** 30), initialKey ?? 0) : undefined);
  const [stage, setStageState] = useState<DrillStageKey>(initialStage ?? "see");
  const [repeat, setRepeatState] = useState(() => readRepeatSetting("e"));
  const [round, setRoundState] = useState<DrillRound>(() => idleDrillRound());
  const [lapNo, setLapNo] = useState(1);
  const [lapKey, setLapKeyState] = useState(initialKey ?? 0);
  const [result, setResult] = useState<DrillResult | undefined>();
  const [pending, setPendingState] = useState<{ key: number; bag?: JazzKeyBag } | undefined>();
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(() => new Set());
  const [lapNote, setLapNote] = useState<string | undefined>();
  const [sortSlow, setSortSlow] = useState(false);
  const [tick, setTick] = useState(() => performance.now());

  const { view, connected, prepareAudio, resetAudio, audioState, retryAudio, connectionKey } = useDojoMidi(true, false);
  const { sound } = usePreviewSound();
  const manual = !connected && !view.busy;

  const cards = useMemo(() => buildDrillKeySet(setId, key).cards, [setId, key]);
  const cardsRef = useRef<readonly DrillCard[]>(cards);
  cardsRef.current = cards;
  const keyRef = useRef(key); keyRef.current = key;
  const bagRef = useRef<JazzKeyBag | undefined>(bag); bagRef.current = bag;
  const stageRef = useRef(stage); stageRef.current = stage;
  const repeatRef = useRef(repeat); repeatRef.current = repeat;
  const roundRef = useRef(round); roundRef.current = round;
  const lapKeyRef = useRef(lapKey); lapKeyRef.current = lapKey;
  const manualRef = useRef(manual); manualRef.current = manual;
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const connectedRef = useRef(connected); connectedRef.current = connected;
  const rawNotes = useRef(structuredClone(defaultLiveMidiStore.getState().notes));
  const debugRef = useRef<{ at: number; channel: number; note: number; on: boolean; index: number; phase: string; passed: boolean }[]>([]);
  const [, bumpDebug] = useState(0);
  const [reason, setReason] = useState<string>();
  const recentRemembered = useRef(false);
  const cardsStripRef = useRef<HTMLDivElement>(null);

  const applyKey = useCallback((next: number) => {
    cardsRef.current = buildDrillKeySet(setId, next).cards;
    keyRef.current = next; lapKeyRef.current = next;
    setKeyState(next); setLapKeyState(next);
  }, [setId]);
  const applyBag = useCallback((next: JazzKeyBag | undefined) => {
    bagRef.current = next; setBagState(next);
  }, []);

  const discardRound = useCallback(() => {
    recentRemembered.current = false;
    const next = manualRef.current ? beginManualDrillRound() : idleDrillRound();
    roundRef.current = next; setRoundState(next);
    setResult(undefined); setPendingState(undefined); pendingRef.current = undefined;
    setRevealed(new Set()); setLapNote(undefined);
  }, []);

  const finishLap = useCallback((finished: DrillRound, at: number) => {
    const lapKeyNow = lapKeyRef.current;
    const stageNow = stageRef.current;
    const manualNow = !connectedRef.current;
    const cardMs = [...finished.cardMs];
    const totalMs = cardMs.reduce((sum, ms) => sum + ms, 0);
    const entry = drillEntryFor(voicingDrillRecordsStore.getState().file, setId, revision, lapKeyNow, stageNow);
    const bestBefore = entry?.best?.totalMs;
    const lastBefore = entry?.last?.totalMs;
    const recorded = !manualNow && drillLapCounts(finished, stageNow, true) && cardMs.length === cardsRef.current.length;
    const improved = recorded && (bestBefore === undefined || totalMs < bestBefore);
    setResult({
      totalMs, cardMs, marks: [...finished.marks], key: lapKeyNow, stage: stageNow,
      hinted: finished.hinted, recorded, manual: manualNow, bestBefore, lastBefore, improved,
    });
    if (recorded) {
      void voicingDrillRecordsStore.getState().record({
        setId, setRevision: revision, cards: recordCards(set.cards), key: lapKeyNow, stage: stageNow,
        totalMs, cardMs, marks: [...finished.marks], operation: `voicing-drill:${setId}:${revision}:${lapKeyNow}:${stageNow}:${crypto.randomUUID()}`,
      });
    }
    if (repeatRef.current) {
      if (bagRef.current && !finished.hinted) {
        const next = nextJazzKey(bagRef.current, lapKeyNow);
        applyBag(next.state); applyKey(next.key);
      }
      const nextRound = manualNow ? beginManualDrillRound() : beginDrillLap(finished, at);
      roundRef.current = nextRound; setRoundState(nextRound);
      setRevealed(new Set()); setLapNo((n) => n + 1); setLapNote(manualNow ? "記録なし" : formatDrillLap(totalMs)); setResult(undefined);
    } else if (bagRef.current && !finished.hinted) {
      const next = nextJazzKey(bagRef.current, lapKeyNow);
      setPendingState({ key: next.key, bag: next.state }); pendingRef.current = { key: next.key, bag: next.state };
    }
  }, [applyBag, applyKey, setId, revision]);

  const finishLapRef = useRef(finishLap); finishLapRef.current = finishLap;

  const handleNote = useCallback((pitch: number, on: boolean, at: number, channel: number, held: readonly number[]) => {
    const current = roundRef.current;
    if (on && !recentRemembered.current && (current.phase === "ready" || current.phase === "running")) {
      recentRemembered.current = true;
      rememberRecent({ kind: "drill", id: setId, stage: stageRef.current, key: keyRef.current, random: Boolean(bagRef.current) });
    }
    const next = current.phase === "idle" || current.phase === "finished"
      ? { round: current, passed: false }
      : drillEvent(current, cardsRef.current, pitch, on, at, held);
    debugRef.current = [...debugRef.current, { at: Math.round(at), channel, note: pitch, on, index: next.round.index, phase: next.round.phase, passed: next.passed }].slice(-50);
    bumpDebug((value) => value + 1);
    roundRef.current = next.round; setRoundState(next.round);
    if (!next.passed) return;
    setReason(undefined);
    setRevealed(new Set());
    if (next.round.phase === "finished") finishLapRef.current(next.round, at);
  }, [setId]);

  useEffect(() => {
    if (round.phase !== "running" || round.held.length === 0) { setReason(undefined); return undefined; }
    const card = cardsRef.current[round.index];
    if (!card) return undefined;
    const timer = setTimeout(() => {
      const sustained = sustainedNotes(rawNotes.current);
      const mismatch = drillMismatch(card, round.held, sustained);
      if (!mismatch) return;
      if (stageRef.current === "recall") { setReason("形が違います"); return; }
      const allowed = new Set([pc(card.rootPitchClass), ...card.right.map(pc)]);
      const name = (note: number) => NAMES[pc(note)];
      const extra = round.held.filter((note) => !allowed.has(pc(note))).map(name);
      const missing = [card.rootPitchClass, ...card.right].filter((note) => !round.held.some((heldNote) => pc(heldNote) === pc(note))).map(name);
      setReason(mismatch === "extra" ? `余分な音: ${extra.join(" ") || name(round.held[round.held.length - 1]!)}`
        : mismatch === "missing" ? `足りない音: ${missing.join(" ")}`
          : mismatch === "right" ? `右手の並びが違います（${round.held.map(name).join(" ")}）`
            : mismatch === "left" ? "左手が一番下にない"
              : "ペダルの音は数えない");
    }, 1000);
    return () => clearTimeout(timer);
  }, [round.phase, round.index, round.held, stage]);

  // The raw MIDI events decide (the pedal is not one of them). The time of the event is used, as the other Dojo screens do.
  useEffect(() => {
    const unsubscribe = liveMidiService.subscribeBatches((batch) => {
      if (!connectedRef.current) return;
      const now = performance.now();
      const last = batch.events[batch.events.length - 1]?.timestampMs ?? now;
      for (const event of batch.events) {
        const status = event.status & 0xf0;
        if (status !== 0x80 && status !== 0x90) continue;
        rawNotes.current = reduceLiveNoteState(rawNotes.current, event);
        const held = [...new Set(heldNotes(rawNotes.current))];
        handleNote(event.data1, status === 0x90 && event.data2 > 0, now - Math.max(0, last - event.timestampMs), event.channel, held);
      }
    });
    return unsubscribe;
  }, [handleNote]);

  // MIDI went away or came back: the lap is dropped and no key is held (spec §3).
  const lastConnection = useRef({ connected, key: connectionKey });
  useEffect(() => {
    if (lastConnection.current.connected === connected && lastConnection.current.key === connectionKey) return;
    lastConnection.current = { connected, key: connectionKey };
    rawNotes.current = createLiveNoteState();
    discardRound();
  }, [connected, connectionKey, discardRound]);

  // Without MIDI: an untimed round from card 1 (no 始める needed); it is never recorded.
  useEffect(() => {
    if (!manual || roundRef.current.phase !== "idle") return;
    const next = beginManualDrillRound();
    roundRef.current = next; setRoundState(next);
    lapKeyRef.current = keyRef.current; setLapKeyState(keyRef.current);
  }, [manual]);

  // The seconds of the card and of the lap are shown while a timed round runs.
  useEffect(() => {
    if (round.phase !== "running" || manual) return undefined;
    setTick(performance.now());
    const timer = setInterval(() => setTick(performance.now()), 200);
    return () => clearInterval(timer);
  }, [round.phase, round.clock.startedAt, manual]);

  useEffect(() => () => { playbackController.stop(); resetAudio(); }, [resetAudio]);

  const toggleRepeat = () => setRepeatState((value) => { writeRepeatSetting("e", !value); return !value; });

  const start = () => {
    prepareAudio();
    setResult(undefined); setRevealed(new Set()); setLapNote(undefined);
    lapKeyRef.current = keyRef.current; setLapKeyState(keyRef.current);
    const next = manualRef.current ? beginManualDrillRound() : prepareDrillRound(new Set(heldNotes(rawNotes.current)));
    roundRef.current = next; setRoundState(next);
  };

  const chooseKey = (next: number) => {
    if (next === keyRef.current) return;
    discardRound();
    applyBag(undefined);
    applyKey(next);
    setLapNo(1);
  };

  const toggleRandom = () => {
    discardRound();
    if (bagRef.current) { applyBag(undefined); return; }
    // The key on the screen stays for this lap; the next key of the shuffled round comes at its end (as Jazz does).
    applyBag(startJazzKeyBag(Math.floor(Math.random() * 2 ** 30), keyRef.current));
    setLapNo(1);
  };

  const chooseStage = (next: DrillStageKey) => {
    if (next === stageRef.current) return;
    discardRound();
    stageRef.current = next; setStageState(next);
    setLapNo(1);
  };

  const restart = () => { discardRound(); setLapNo(1); };

  const again = useCallback(() => {
    playbackController.stop();
    const next = pendingRef.current;
    if (next) { applyBag(next.bag); applyKey(next.key); }
    setPendingState(undefined); pendingRef.current = undefined;
    setResult(undefined); setRevealed(new Set()); setLapNote(undefined);
    setLapNo((n) => n + 1);
    lapKeyRef.current = keyRef.current; setLapKeyState(keyRef.current);
    const nextRound = manualRef.current ? beginManualDrillRound() : prepareDrillRound(new Set(heldNotes(rawNotes.current)));
    roundRef.current = nextRound; setRoundState(nextRound);
  }, [applyBag, applyKey]);

  const quit = useCallback(() => {
    playbackController.stop();
    const next = idleDrillRound();
    roundRef.current = next; setRoundState(next);
    onBack();
  }, [onBack]);

  const revealCard = (index: number) => {
    setRevealed((previous) => {
      if (previous.has(index)) return previous;
      const next = new Set(previous); next.add(index); return next;
    });
    if (stageRef.current === "recall") {
      const next = markDrillHint(roundRef.current);
      roundRef.current = next; setRoundState(next);
    }
  };

  const advanceManual = () => {
    const current = roundRef.current;
    if (!manualRef.current || current.phase !== "running") return;
    if (!recentRemembered.current) {
      recentRemembered.current = true;
      rememberRecent({ kind: "drill", id: setId, stage: stageRef.current, key: keyRef.current, random: Boolean(bagRef.current) });
    }
    const next = advanceDrillCard(current, cardsRef.current.length, performance.now());
    roundRef.current = next; setRoundState(next);
    if (next.phase === "finished") finishLapRef.current(next, performance.now());
  };

  const playCard = async (index: number) => {
    const card = cardsRef.current[index];
    if (!card) return;
    if (stageRef.current === "recall") revealCard(index);
    prepareAudio();
    try {
      await playbackController.play({ kind: "practice", id: `voicing-drill:card:${index}` }, {
        type: "chord",
        chord: { root: card.rootPitchClass, quality: "maj", tensions: [], label: card.label },
        sound,
        explicitMidiNotes: [...card.left, ...card.right],
      });
    } catch { /* the answer is on the screen */ }
  };

  // The keys of the practice area: from the arrow keys and Space/Y/R (the same shortcuts as the other practice screens).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || document.querySelector("[role=dialog]")) return;
      if (event.target instanceof HTMLElement && event.target.closest("input,select,textarea,button,summary,[role=region][tabindex]")) return;
      const pressed = event.key.toLowerCase();
      if (pressed === "escape") { event.preventDefault(); quit(); }
      else if (pressed === " " && stageRef.current === "recall") { event.preventDefault(); revealCard(roundRef.current.index); }
      else if (pressed === "y" && manualRef.current && roundRef.current.phase === "running") { event.preventDefault(); advanceManual(); }
      else if (pressed === "r" && roundRef.current.phase === "finished") { event.preventDefault(); again(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [again, quit]);

  const whiteKeys = useMemo(() => {
    const range = answerKeyboardRange(cards.flatMap((card) => [...card.left, ...card.right]), true);
    return whiteKeysIn(range.minMidiNote, range.maxMidiNote);
  }, [cards]);
  const { ref: practice, layout, style: layoutStyle } = usePracticeLayout(whiteKeys, Math.min(cards.length, 6));

  // The cards are one row that scrolls sideways; the card being played is kept in the middle of the strip (the same
  // idea as the progression band of Voicing Loop). `auto`, not `smooth`, so a fast run never judges a card off-screen.
  useEffect(() => {
    const strip = cardsStripRef.current;
    if (!strip) return undefined;
    const frame = requestAnimationFrame(() => {
      const current = strip.querySelector<HTMLElement>(`[data-drill-index="${round.index}"]`);
      if (!current) return;
      const stripRect = strip.getBoundingClientRect();
      const cardRect = current.getBoundingClientRect();
      const left = strip.scrollLeft + cardRect.left - stripRect.left - (strip.clientWidth - cardRect.width) / 2;
      strip.scrollTo({ left: Math.max(0, Math.min(left, strip.scrollWidth - strip.clientWidth)), behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
  }, [round.index, key, stage, layout.kind]);

  const allSnapshots = useMemo(() => {
    const snapshots: TargetSnapshot[] = [];
    for (let each = 0; each < 12; each += 1) for (const card of buildDrillKeySet(setId, each).cards) snapshots.push(snapshotOf(setId, each, card));
    return snapshots;
  }, [setId]);
  const staffExtent = useMemo(() => heldStaffExtent(allSnapshots), [allSnapshots]);

  const card = cards[round.index] ?? cards[0]!;
  const snapshot = useMemo(() => snapshotOf(setId, key, card), [setId, key, card]);
  const shown = (index: number) => stage === "see" || manual || revealed.has(index) || index < round.index;
  const boardHidden = stage === "recall" && !manual && !revealed.has(round.index) && round.phase !== "finished";

  const bestOfStage = useMemo(() => drillBestOfSet(records.file, setId, revision, [stage]), [records.file, setId, revision, stage]);
  const bestLap = useMemo(() => bestOfStage ? drillEntryFor(records.file, setId, revision, bestOfStage.key, bestOfStage.stage)?.best : undefined,
    [records.file, setId, revision, bestOfStage]);
  const newestLast = useMemo(() => drillNewestLast(records.file, setId, revision, stage), [records.file, setId, revision, stage]);
  const slowLast = useMemo(() => newestLast ? drillSlowCards(set.cards, newestLast.last.cardMs, newestLast.last.marks, 3) : [], [newestLast]);
  const entry = drillEntryFor(records.file, setId, revision, key, stage);

  const elapsed = drillElapsedMs(round, tick);
  const cardElapsed = drillCardElapsedMs(round, tick);
  const pace = drillPaceTotal(bestLap, round.index);
  const paceDiff = pace === undefined || round.clock.startedAt === null ? undefined : elapsed - pace;

  const stages: readonly StageItem[] = [
    { num: "①", name: "見て弾く", state: stage === "see" ? "on" : "idle", onSelect: () => chooseStage("see") },
    { num: "②", name: "覚えて弾く", state: stage === "recall" ? "on" : "idle", onSelect: () => chooseStage("recall") },
  ];

  const bestAfter = result ? (result.recorded ? (result.bestBefore === undefined ? result.totalMs : Math.min(result.bestBefore, result.totalMs)) : result.bestBefore) : undefined;
  const keyBests = drillKeyBests(records.file, setId, revision, stage);
  const prior = drillPriorRevisions(records.file, setId, revision);

  const timerText = manual ? "" : `このカード ${formatDrillSeconds(cardElapsed)} 秒 · 1 周 ${formatDrillSeconds(elapsed)} 秒${paceDiff === undefined ? "" : ` · 自己ベスト比 ${paceDiff >= 0 ? "+" : "−"}${formatDrillSeconds(Math.abs(paceDiff))} 秒`}`;

  return <section className="dojo" data-testid="dojo-drill" data-dojo-screen="voicing-drill" data-practice-frame="e"
    data-drill-set={setId} data-drill-stage={stage} data-drill-key={key} data-drill-card={round.index} data-drill-state={round.phase}
    data-drill-lap={lapNo} data-drill-random={bag ? "on" : undefined} data-drill-hinted={round.hinted || undefined}
    data-drill-manual={manual || undefined} data-drill-result={result ? "true" : undefined} data-midi-kind={view.kind}>
    <div className="dojo-practice dojo-endless" ref={practice} data-practice-layout={layout.kind} data-drill-result={result ? "true" : undefined} data-drill-hidden={boardHidden || undefined} style={layoutStyle}>
      <PracticeHead backLabel="ボイシングドリル" onBack={quit} kind="" title={`${DRILL_STAGE_LABELS[set.stage]}・${set.name}`}
        degrees={set.degrees.join("–")} degreesTestId="drill-degrees" stages={stages} progressLabel="この画面の周回"
        progress={<>
          <span data-testid="drill-progress">{stage === "see" ? "①" : "②"} <em>{lapNo}</em>周目 · <em>{round.index + 1}/{cards.length}</em></span>
          <span>記録 <em data-testid="drill-laps">{entry?.laps ?? 0}</em> 周</span>
          {manual ? <span>秒数なし</span> : null}
        </>} />
      <div className="dojo-endless-center dojo-drill-center">
        <PracticeConditions className="dojo-drill-bar" help={DRILL_HELP}>
          <label className="dojo-drill-key"><span>キー</span><select aria-label="キー" data-testid="drill-key-select" value={key} onChange={(event) => chooseKey(Number(event.target.value))}>
            {DRILL_KEY_NAMES.map((name, index) => <option value={index} key={index}>{name}</option>)}
          </select></label>
          <button type="button" data-testid="drill-random" aria-pressed={Boolean(bag)} onClick={toggleRandom}>ランダムキー</button>
          <button type="button" data-testid="drill-restart" onClick={restart}>最初から</button>
          <RepeatToggle on={repeat} onToggle={toggleRepeat} testId="drill-repeat" />
        </PracticeConditions>

        {audioState === "error" ? <p className="dojo-notice" role="alert">入力のピアノ音を開始できませんでした。判定は続けられます。<button type="button" onClick={retryAudio}>入力音をもう一度</button></p> : null}
        {records.error ? <p role="alert" data-testid="drill-record-error">{records.error}<button type="button" onClick={() => void voicingDrillRecordsStore.getState().retry()}>記録の保存を再試行</button></p> : null}

        {result ? <div className="dojo-drill-result" data-testid="drill-result">
          <PracticeLap testId="drill-lap" summary={<div className="dojo-drill-result-head">
            <h2>1 周の結果 <small>{drillKeyName(result.key)}・{result.stage === "see" ? "①" : "②"}</small></h2>
            <p className="dojo-drill-total" data-testid="drill-result-total">{result.manual ? "秒数は測っていません" : `今回 ${formatDrillLap(result.totalMs)}`}</p>
            <p data-testid="drill-result-best">自己ベスト {bestAfter === undefined ? "なし" : formatDrillLap(bestAfter)}{result.improved ? <b className="dojo-drill-updated" data-testid="drill-best-updated">更新</b> : null}</p>
            <p data-testid="drill-result-last">前回 {result.lastBefore === undefined ? "なし" : formatDrillLap(result.lastBefore)}</p>
            {result.hinted ? <p className="dojo-drill-note" data-testid="drill-result-hinted">ヒントを見たので、この周は記録していません。</p> : null}
            {result.manual ? <p className="dojo-drill-note" data-testid="drill-result-manual">MIDI がないため、記録していません。</p> : null}
          </div>}>
            <button type="button" className="dojo-primary" data-testid="drill-again" onClick={again} {...keyed("もう一度", "R")} />
            <button type="button" data-testid="drill-to-list" onClick={onBack}>組の一覧へ</button>
          </PracticeLap>
          <div className="dojo-drill-result-grid">
            <section className="dojo-drill-panel">
              <div className="dojo-drill-panel-head"><h3>カードごとの秒数</h3><button type="button" data-testid="drill-sort-slow" aria-pressed={sortSlow} onClick={() => setSortSlow((value) => !value)}>遅い順</button></div>
              <table className="dojo-drill-table" data-testid="drill-card-table">
                <thead><tr><th>#</th><th>コード</th><th>形</th><th>秒</th><th>迷った</th></tr></thead>
                <tbody>{cards.map((each, index) => ({ each, index })).sort((a, b) => sortSlow ? (result.cardMs[b.index] ?? 0) - (result.cardMs[a.index] ?? 0) : a.index - b.index).map(({ each, index }) => {
                  const ms = result.cardMs[index];
                  return <tr key={index} data-testid="drill-card-row" data-index={index}>
                    <td>{index + 1}</td><td>{each.label}</td><td>{each.form ?? "—"}</td>
                    <td data-testid="drill-card-ms">{result.manual || ms === undefined ? "—" : formatDrillSeconds(ms)}</td>
                    <td>{result.marks.includes(index) ? "迷った" : ""}</td>
                  </tr>;
                })}</tbody>
              </table>
            </section>
            <section className="dojo-drill-panel">
              <h3>{stage === "see" ? "①" : "②"} の 12 キーの自己ベスト（秒）</h3>
              <div className="dojo-drill-keys" data-testid="drill-key-bests">{keyBests.map((ms, each) => <span key={each} data-testid={`drill-key-best-${each}`} data-current={each === key || undefined}>
                <i>{drillKeyName(each)}</i><b>{ms === undefined ? "—" : formatDrillSeconds(ms)}</b>
              </span>)}</div>
              {prior.length ? <p className="dojo-drill-note" data-testid="drill-prior-revisions">中身が変わる前の記録: {prior.map(({ best }) => `${formatDrillLap(best.totalMs)}・${drillKeyName(best.key)}`).join(" / ")}</p> : null}
            </section>
          </div>
        </div> : <>
          <div className="dojo-endless-cards dojo-original-cards dojo-drill-cards" ref={cardsStripRef} data-testid="drill-card-strip">{cards.map((each, index) => {
            const done = index < round.index, current = index === round.index;
            const fn = degreeFunctionKinds(cards.map((c) => c.degree), "major")[index];
            return <PracticeCard key={index} testId="drill-card" degreeTestId="drill-card-degree" nameTestId="drill-card-name" notesTestId="drill-card-notes"
              extra={{ "data-drill-index": String(index) }}
              label={`${each.label}（${each.degree}）${stage === "see" ? "を見る" : "を思い出す"}`}
              onPress={() => void playCard(index)} state={done ? "done" : current ? "current" : "todo"}
              hint={stage === "recall" && revealed.has(index) || undefined}
              degree={each.degree} name={each.label} status={each.form ? `形${each.form}` : undefined} fn={fn?.kind||undefined} fnBorrowed={fn?.borrowedDominant}
              mark={stage === "recall" && revealed.has(index) ? <span className="dojo-drill-hint-chip">ヒント</span> : undefined}
              notes={<><i>左</i> {shown(index) ? each.leftNames.join(" ") : "?"}<br /><i>右</i> {shown(index) ? each.rightNames.join(" ") : "?"}</>} />;
          })}</div>
          <PracticeResult>{reason ? <p className="dojo-drill-reason" data-testid="drill-reason" role="status" data-error="true">{reason}</p> : null}</PracticeResult>
          <PracticeGuide>
            {round.phase === "idle" || round.phase === "ready" ? <p className="dojo-drill-record" data-testid="drill-record-line">
              {bestOfStage ? `自己ベスト ${formatDrillLap(bestOfStage.totalMs)}（${drillKeyName(bestOfStage.key)}）` : "まだ記録はありません"}
              {newestLast ? `・前回 ${formatDrillLap(newestLast.last.totalMs)}` : ""}
              {slowLast.length ? `・前回遅かったコード: ${slowLast.map((card) => `${card.label}${card.marked ? "（迷った）" : ""}`).join("・")}` : ""}
            </p> : null}
            {!manual && round.phase === "running" ? <p className="dojo-drill-timer" data-testid="drill-timer">{timerText}</p> : null}
            <div className="dojo-drill-status" role="status" data-testid="drill-status">
            {manual ? "MIDI がつながっていないため、秒数は測らず記録もしません。答えを見て「弾けた」で進みます。"
              : round.phase === "waiting-release" ? "鍵盤から手を離してください。離すと、次の鍵から計測します。"
                : round.phase === "ready" ? "最初の鍵を押すと計測が始まります。"
                  : round.phase === "running" ? `${round.index + 1} 枚目: ${card.label}（${card.degree}）${card.form ? ` 形${card.form}` : ""}`
                    : lapNote ? `1 周 ${lapNote}` : ""}
          </div>
          </PracticeGuide>
          <PracticeActions className="dojo-drill-actions">
            {round.phase === "idle" ? <button type="button" className="dojo-primary" data-testid="drill-start" disabled={view.busy} onClick={start}>始める</button> : null}
            {manual && round.phase === "running" ? <button type="button" className="dojo-primary" data-testid="drill-yes" onClick={advanceManual} {...keyed("弾けた", "Y")} /> : null}
            {round.phase === "running" && !manual ? <button type="button" data-testid="drill-listen" onClick={() => void playCard(round.index)} {...keyed("お手本を聴く", "L")} /> : null}
            {stage === "recall" && round.phase !== "idle" ? <button type="button" data-testid="drill-hint" onClick={() => revealCard(round.index)} {...keyed("ヒント", "Space")} /> : null}
          </PracticeActions>
          <details className="dojo-drill-debug" data-testid="drill-debug">
            <summary>判定の様子</summary>
            <table className="dojo-drill-table">
              <thead><tr><th>時刻</th><th>ch</th><th>音</th><th>押/離</th><th>カード</th><th>結果</th></tr></thead>
              <tbody>{[...debugRef.current].reverse().map((entry, index) => <tr key={index} data-testid="drill-debug-row">
                <td>{entry.at.toFixed(0)}</td><td>{entry.channel + 1}</td><td>{entry.note}</td><td>{entry.on ? "押" : "離"}</td><td>{entry.index + 1}</td><td>{entry.passed ? "通過" : entry.phase}</td>
              </tr>)}</tbody>
            </table>
            <p>直近 50 件・この画面だけ。保存しません。</p>
          </details>
        </>}
      </div>

      {!result ? <>
        <HeldCardBoard quiet snapshot={snapshot} left={card.left} right={card.right} keyHeight={layout.keyHeight} markScale={layout.markScale}
          staffExtent={staffExtent} concealed={boardHidden} showFingering={false}
          caption={manual ? "答えを見ながら弾いてください" : stage === "recall" ? undefined : "このカードの押さえ方"} />
        {boardHidden ? <p className="dojo-drill-cover" data-testid="drill-cover">② 覚えて弾くでは、鍵盤と楽譜を隠しています。ヒント（Space）で今のカードの答えを見られます。</p> : null}
      </> : null}
      <PracticeSafeArea />
    </div>
  </section>;
}
