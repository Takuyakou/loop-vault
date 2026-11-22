import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { playbackController } from "../../audio/playbackController";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { liveMidiService } from "../../liveMidi/liveMidiService";
import { createLiveNoteState, reduceLiveNoteState, soundingNotes } from "../../domain/liveMidi";
import type { ChordTimelineItem } from "../../domain/types";
import type { VaultProgression } from "../../domain/chordDojo/collect";
import { BUILTINS, buildBuiltin, builtinDisplayName } from "../../domain/chordDojo/builtins";
import { ChordEntry, judgeChord, requiredCount } from "../../domain/chordDojo/judging";
import {
  advanceGuidedStage,
  buildGuidedLesson,
  currentGuidedCard,
  endGuidedSession,
  guidedCardAnswerVisible,
  guidedMaterialsVisible,
  guidedRoundComplete,
  guidedStageInstruction,
  guidedStageLabel,
  guidedStageResultText,
  guidedTicket,
  hintGuided,
  markGuidedHint,
  markGuidedListenPlayed,
  markGuidedSelfConfirmed,
  rearmGuidedInput,
  recordGuidedCard,
  recordGuidedTempoCard,
  restartGuidedSession,
  retryGuidedRound,
  skipGuidedTempo,
  startGuidedSession,
  GUIDE_STAGES,
  type GuidedCardTicket,
  type GuidedSession,
} from "../../domain/chordDojo/guidedPractice";
import type { Task } from "../../domain/chordDojo/store";
import { NAMES, pc } from "../../domain/chordDojo/recipes";
import { GrandStaff } from "./GrandStaff";
import { PracticeKeyboard } from "../../components/practice/PracticeKeyboard";
import { DojoBackButton } from "./DojoBackButton";
import { PracticeActions, PracticeCard, PracticeGuide, PracticeHead, PracticeSafeArea, STAFF_HELP, type StageItem } from "./PracticeFrame";
import { targetSnapshot, snapshotFingerLabels } from "../../domain/chordDojo/targetSnapshot";
import { frozenDisplay } from "./lessonFingering";
import { answerKeyboardRange } from "./keyboardRange";
import { useDojoMidi } from "./useDojoMidi";
import { usePreviewSound } from "../../components/PreviewSoundProvider";
import { useMetronome } from "../../components/MetronomeProvider";
import { canUseTempo, tempoPlan } from "./tempo";
import { defaultGuidedRange, guidedMaterialView, type GuidedMaterial, type GuidedMaterialView } from "./guidedMaterial";
import type { ProgressionVoicingTransport } from "../../practice/ProgressionVoicingTransport";

/**
 * P23-38 (from P23-35): 「ガイド練習」 — a session-only five-stage guide over one 2–4 chord material.
 *
 * The entry is the Chord Dojo home's fifth card; the material is a session value of the Dojo (never stored).
 * The view keeps P23-35's contracts: no Dojo records, the same target/judge/keystaff parts, the existing
 * sound and the existing musical clock. The material chooser only reads the existing lists' data; it does
 * not call the ordinary practice path.
 */

/** The ordinary practice polls its input at this period; the guide keeps the same contract. */
const POLL_MS = 10;
const BUILTIN_OPTIONS = BUILTINS.map((builtin) => ({ value: builtin.id, label: builtinDisplayName(builtin) }));
const SAVED_FALLBACK_ID = "jb-3625";

function lessonFor(material: GuidedMaterial, view: GuidedMaterialView, bpm: number) {
  const built = buildGuidedLesson({
    sourceKey: material.task.key,
    chords: view.chords,
    name: view.name,
    bpm,
    ...(view.keyLabel === undefined ? {} : { keyLabel: view.keyLabel }),
    range: { start: view.start, end: view.end },
    id: `guide-${material.task.key}-${view.start}-${view.end}-${bpm}`,
    tempoAvailable: true,
  });
  if (!built.ok) return built;
  // ④ uses the existing clock or says 対象外 for this material; it never invents a timing model.
  if (canUseTempo(built.lesson.cards.map((card) => card.event), bpm)) return built;
  return { ok: true as const, lesson: { ...built.lesson, tempoAvailable: false } };
}

interface PickerState {
  readonly kind: "builtin" | "saved";
  readonly builtinId: string;
  readonly keyIndex: number;
  readonly savedKey: string;
}

function pickerFrom(material: GuidedMaterial, progressions: readonly VaultProgression[]): PickerState {
  const builtin = material.task.key.startsWith("builtin:");
  return {
    kind: builtin ? "builtin" : "saved",
    builtinId: builtin ? material.task.key.split(":")[1] ?? SAVED_FALLBACK_ID : SAVED_FALLBACK_ID,
    keyIndex: material.task.roots[0] ?? 0,
    savedKey: !builtin ? material.task.key : progressions[0]?.key ?? "",
  };
}

export function GuidedPracticeView({ material, progressions, onExit, onChangeMaterial, startChoosing = false, bpm: dojoBpm, settleMs }: {
  readonly material: GuidedMaterial;
  readonly progressions: readonly VaultProgression[];
  readonly onExit: () => void;
  readonly onChangeMaterial: (next: GuidedMaterial) => void;
  /** Opened from the home's 「教材を変更」: the chooser is the first thing shown. */
  readonly startChoosing?: boolean;
  /** The Dojo's own tempo setting: the guide's initial value and its limits follow it. */
  readonly bpm: number;
  /** The Dojo's own settle window for one chord. */
  readonly settleMs: number;
}) {
  const { sound } = usePreviewSound();
  const { enabled: metronomeEnabled } = useMetronome();
  const view = useMemo(() => guidedMaterialView(material, progressions), [material, progressions]);
  const lesson = useMemo(() => (view ? lessonFor(material, view, dojoBpm) : undefined), [material, view, dojoBpm]);
  const [session, setSession] = useState<GuidedSession>();
  const [flash, setFlash] = useState<{ ok: boolean; message: string }>();
  const [previewing, setPreviewing] = useState(false);
  const [tempoRunning, setTempoRunning] = useState(false);
  const [tempoSummary, setTempoSummary] = useState<boolean[]>();
  /** §6.2: the practice tempo is a session value of this screen (never saved, never the source tempo). */
  const [practiceBpm, setPracticeBpm] = useState(dojoBpm);
  const [bpmText, setBpmText] = useState(String(dojoBpm));
  const [bpmError, setBpmError] = useState<string>();
  const sessionRef = useRef<GuidedSession>();
  sessionRef.current = session;
  /** §6.1: while the material chooser is open the judge is off; the interval reads this, not a closure. */
  const choosingRef = useRef(false);
  /** MIDI input is audible here (the usual practice piano), and the same connection judges. */
  const { connected, view: midiView } = useDojoMidi(true);

  // ── the material chooser ─────────────────────────────────────────────────────────────────────
  const [choosing, setChoosing] = useState(startChoosing);
  choosingRef.current = choosing;
  const entryChoosing = useRef(startChoosing);
  const initialPicker = pickerFrom(material, progressions);
  const [kind, setKind] = useState<PickerState["kind"]>(initialPicker.kind);
  const [builtinId, setBuiltinId] = useState(initialPicker.builtinId);
  const [keyIndex, setKeyIndex] = useState(initialPicker.keyIndex);
  const [savedKey, setSavedKey] = useState(initialPicker.savedKey);
  const [range, setRange] = useState<{ start: number; end: number }>(() => ({
    start: view?.start ?? 0,
    end: view?.end ?? Math.min(3, Math.max(1, (view?.chords.length ?? 4) - 1)),
  }));
  /** The session was already started for this material id (a re-render never starts a second one). */
  const startedFor = useRef<string>();
  const transportRef = useRef<ProgressionVoicingTransport>();

  const materialTotal = useCallback((nextKind: PickerState["kind"], nextBuiltinId: string, nextKey: number, nextSavedKey: string) => {
    if (nextKind === "builtin") return buildBuiltin(nextBuiltinId, nextKey).chords.length;
    return progressions.find((entry) => entry.key === nextSavedKey)?.chords.length ?? 0;
  }, [progressions]);

  /** §6.2: 30–240, the Dojo's own range. An empty or invalid field is never passed to the clock. */
  const changeBpm = useCallback((raw: string) => {
    setBpmText(raw);
    const value = Number(raw);
    if (raw.trim() === "") { setBpmError(undefined); return; }
    if (!Number.isInteger(value) || value < 30 || value > 240) {
      setBpmError("30〜240 の整数で指定してください");
      return;
    }
    setBpmError(undefined);
    if (value === practiceBpm) return;
    setPracticeBpm(value);
    if (sessionRef.current?.stage === "tempo" && !tempoRunning) {
      // A different tempo starts the ④ round from the top; earlier stages keep their results.
      setTempoSummary(undefined);
      setSession((before) => before && before.stage === "tempo" && before.status !== "roundComplete"
        ? retryGuidedRound(before)
        : before);
    }
  }, [practiceBpm, tempoRunning]);

  const openChooser = useCallback(() => {
    // §6.1: the judge stops at the moment the chooser opens; raw key/pedal tracking continues.
    entry.current = undefined;
    entryTicket.current = undefined;
    releaseGate.current = false;
    const picker = pickerFrom(material, progressions);
    const current = guidedMaterialView(material, progressions);
    playbackController.stop();
    setPreviewing(false);
    transportRef.current?.stop();
    transportRef.current = undefined;
    setTempoRunning(false);
    setKind(picker.kind);
    setBuiltinId(picker.builtinId);
    setKeyIndex(picker.keyIndex);
    setSavedKey(picker.savedKey);
    setRange({
      start: current?.start ?? 0,
      end: current?.end ?? Math.min(3, Math.max(1, (current?.chords.length ?? 4) - 1)),
    });
    setChoosing(true);
  }, [material, progressions]);

  const resetPickerRange = (nextKind: PickerState["kind"], nextBuiltinId: string, nextKey: number, nextSavedKey: string) => {
    const total = materialTotal(nextKind, nextBuiltinId, nextKey, nextSavedKey);
    setRange(defaultGuidedRange(total));
  };

  const draftTask: Task | undefined = kind === "builtin"
    ? { kind: "progression", key: `builtin:${builtinId}:1`, review: false, roots: [keyIndex], seconds: 120 }
    : savedKey
      ? { kind: "progression", key: savedKey, review: false, roots: [0], seconds: 120 }
      : undefined;
  const draftMaterial: GuidedMaterial | undefined = draftTask ? { task: draftTask, range } : undefined;
  const draftView = draftMaterial ? guidedMaterialView(draftMaterial, progressions) : undefined;
  const draftLesson = draftMaterial && draftView ? lessonFor(draftMaterial, draftView, dojoBpm) : undefined;
  const draftUnavailable = !draftMaterial || !draftView
    ? "この教材はガイドで使えません。別の教材を選んでください。"
    : undefined;

  const applyDraft = () => {
    if (!draftMaterial || !draftLesson || !draftLesson.ok) return;
    playbackController.stop();
    setPreviewing(false);
    setTempoRunning(false);
    const id = draftLesson.lesson.id;
    startedFor.current = id;
    setSession(startGuidedSession(draftLesson.lesson, `${id}-${Date.now().toString(36)}`));
    onChangeMaterial(draftMaterial);
    entryChoosing.current = false;
    setChoosing(false);
    setFlash(undefined);
    setTempoSummary(undefined);
  };

  const cancelChooser = () => {
    if (entryChoosing.current) { onExit(); return; }
    setChoosing(false);
  };

  // ── the session is the material's first snapshot, once ─────────────────────────────────────
  useEffect(() => {
    if (!lesson) return;
    if (!lesson.ok) return;
    const id = lesson.lesson.id;
    if (startedFor.current === id) return;
    startedFor.current = id;
    setSession(startGuidedSession(lesson.lesson, `${id}-${Date.now().toString(36)}`));
  }, [lesson]);

  // ── input: the same raw MIDI contract the ordinary practice reads ────────────────────────────
  const rawNotes = useRef(createLiveNoteState());
  const entry = useRef<ChordEntry>();
  const entryTicket = useRef<GuidedCardTicket>();
  const releaseGate = useRef(true);
  const tempoEntry = useRef<ChordEntry>();
  const tempoTicket = useRef<GuidedCardTicket>();

  // A judge result is only applied while its ticket still describes the current card; see
  // `recordGuidedCard`. The interval reads refs, so a re-render never arms a second one.
  useEffect(() => {
    const unsubscribe = liveMidiService.subscribeBatches((batch) => {
      for (const event of batch.events) {
        rawNotes.current = reduceLiveNoteState(rawNotes.current, event);
        const status = event.status & 240;
        if (status !== 128 && status !== 144) continue;
        const on = status === 144 && event.data2 > 0;
        const at = performance.now() - Math.max(0, (batch.events[batch.events.length - 1]?.timestampMs ?? event.timestampMs) - event.timestampMs);
        entry.current?.event(event.channel, event.data1, on, at);
        tempoEntry.current?.event(event.channel, event.data1, on, at);
      }
    });
    return () => unsubscribe();
  }, []);

  // A stage/round boundary waits for the keys (and any held pedal voice) to be let go, so a chord
  // still held from the step before cannot pass the new card. Between adjacent cards of the same
  // round the ordinary re-strike contract is kept (no forced all-notes-off).
  const boundary = session ? `${session.id}:${session.stage}:${session.epoch}` : "";
  useEffect(() => {
    if (!boundary) return;
    releaseGate.current = soundingNotes(rawNotes.current).length === 0;
  }, [boundary]);

  const arm = useCallback((ticket: GuidedCardTicket) => {
    const s = sessionRef.current;
    if (!s) return;
    const card = s.lesson.cards[ticket.cardIndex];
    if (!card) return;
    entry.current = new ChordEntry(requiredCount(card.target), settleMs);
    entryTicket.current = ticket;
  }, [settleMs]);

  useEffect(() => {
    if (choosing) return;
    const current = session;
    if (!current || current.stage === "tempo") {
      entry.current = undefined;
      entryTicket.current = undefined;
      return;
    }
    const ticket = guidedTicket(current);
    if (!ticket) {
      entry.current = undefined;
      entryTicket.current = undefined;
      return;
    }
    arm(ticket);
  }, [session?.id, session?.stage, session?.cardIndex, session?.attemptId, session?.status, choosing, arm]);

  // §6.1: the chooser is a mode of this screen, not a new session. Opening it drops the armed judge
  // (the next answer starts after a release); closing it re-arms the same card with a fresh entry, so
  // notes played behind the chooser are neither judged nor carried over. A confirmed material starts
  // a new session instead (applyDraft).
  useEffect(() => {
    if (choosing) {
      entry.current = undefined;
      entryTicket.current = undefined;
      releaseGate.current = false;
      return;
    }
    releaseGate.current = soundingNotes(rawNotes.current).length === 0;
    const current = sessionRef.current;
    const ticket = current ? guidedTicket(current) : undefined;
    if (ticket) arm(ticket);
  }, [choosing, arm]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = sessionRef.current;
      const ticket = entryTicket.current;
      if (!current || !ticket || current.stage === "tempo" || choosingRef.current) return;
      if (!releaseGate.current) {
        if (soundingNotes(rawNotes.current).length === 0) {
          releaseGate.current = true;
          arm(guidedTicket(current) ?? ticket);
        }
        return;
      }
      const response = entry.current?.poll(performance.now());
      if (!response) return;
      const card = current.lesson.cards[ticket.cardIndex];
      if (!card) return;
      const judged = judgeChord(card.target, response.notes);
      // ② may use the existing detailed explanation; ③ never names the missing notes.
      const message = judged.ok ? "合いました" : current.stage === "see" ? judged.message : "まだ合っていません";
      const applied = recordGuidedCard(current, ticket, judged.ok, message);
      if (!applied.accepted) return;
      setFlash({ ok: judged.ok, message });
      setSession(applied.session);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [arm]);

  // MIDI dropped: the results collected before the change can never count; a fresh release is needed.
  const connectionKey = connected ? midiView.kind : "off";
  const previousConnection = useRef(connectionKey);
  useEffect(() => {
    if (previousConnection.current === connectionKey) return;
    previousConnection.current = connectionKey;
    rawNotes.current = structuredClone(defaultLiveMidiStore.getState().notes);
    releaseGate.current = soundingNotes(rawNotes.current).length === 0;
    entry.current = undefined;
    tempoEntry.current = undefined;
    setSession((before) => before === undefined ? before : rearmGuidedInput(before));
  }, [connectionKey]);

  // ── sound: the range, one card, and stopping it ──────────────────────────────────────────────
  // One preview at a time, and nothing is left playing when the screen (or the stage) is left.
  useEffect(() => {
    playbackController.stop();
    setPreviewing(false);
  }, [session?.stage, session?.status]);
  useEffect(() => () => { playbackController.stop(); transportRef.current?.stop(); }, []);

  const playRange = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || previewing) return;
    const timeline: ChordTimelineItem[] = current.lesson.cards.map((card, index) => ({
      eventId: `guide-${index}`, bar: 1, beat: 1, durationBeats: card.beats,
      chord: card.chord, confidence: 1, alternatives: [], warnings: [],
    }));
    const notesById: Record<string, readonly number[]> = {};
    for (const [index, card] of current.lesson.cards.entries()) notesById[`guide-${index}`] = card.notes;
    playbackController.stop();
    setPreviewing(true);
    try {
      await playbackController.play({ kind: "practice", id: "chord-dojo:guide" }, {
        type: "timeline", timeline, bpm: practiceBpm, sound, explicitMidiNotesByEventId: notesById,
      }, {
        onEnded: (reason) => {
          setPreviewing(false);
          if (reason !== "completed") return;
          // ① is 取り組み済み only when the whole range was heard to its end.
          setSession((before) => before && before.id === current.id && before.stage === "listen" ? markGuidedListenPlayed(before) : before);
        },
      });
    } catch {
      setPreviewing(false);
      setFlash({ ok: false, message: "お手本を再生できません。鍵盤の答えを確認してください" });
    }
  }, [previewing, sound, practiceBpm]);

  const playCard = useCallback(async (index: number, asHint: boolean) => {
    const current = sessionRef.current;
    if (!current || previewing) return;
    const card = current.lesson.cards[index];
    if (!card) return;
    if (asHint && (current.stage === "recall" || current.stage === "apply")) {
      // 「見本を聴く」 is the same information as 「見本を確認」: this round is assisted.
      setSession((before) => before && before.id === current.id ? markGuidedHint(before, index) : before);
    }
    playbackController.stop();
    setPreviewing(true);
    try {
      await playbackController.play({ kind: "practice", id: `chord-dojo:guide:${index}` }, {
        type: "chord", chord: card.chord, sound, explicitMidiNotes: card.notes,
      });
    } catch {
      setFlash({ ok: false, message: "お手本を再生できません。鍵盤の答えを確認してください" });
    } finally {
      setPreviewing(false);
    }
  }, [previewing, sound]);

  // ── ④ tempo: the existing clock, no record path ─────────────────────────────────────────────
  const tempoValues = useRef<boolean[]>([]);
  const tempoMatch = useRef(false);

  const stopTempo = useCallback(() => {
    transportRef.current?.stop();
    transportRef.current = undefined;
    tempoEntry.current = undefined;
    tempoTicket.current = undefined;
    tempoValues.current = [];
    setTempoSummary(undefined);
    setTempoRunning(false);
    // A stop is not the end of the lap: the results of a half-played lap are dropped and the next
    // start begins at the top of the range, with fresh input and no carry-over.
    setSession((before) => before && before.stage === "tempo" && before.status !== "roundComplete"
      && before.cardResults.some((result) => result !== "pending")
      ? retryGuidedRound(before)
      : before);
  }, []);

  const beginTempo = useCallback(() => {
    const current = sessionRef.current;
    if (!current || current.stage !== "tempo" || tempoRunning) return;
    const chords = current.lesson.cards.map((card) => card.event);
    let clock;
    try {
      clock = tempoPlan(chords, practiceBpm);
    } catch {
      // The existing clock cannot play this material: ④ says so and ⑤ follows.
      setSession((before) => before ? skipGuidedTempo(before) : before);
      return;
    }
    transportRef.current = clock.transport;
    tempoValues.current = [];
    setTempoSummary(undefined);
    setTempoRunning(true);
    const total = current.lesson.cards.reduce((sum, card) => sum + card.beats, 0);
    let index = 0;
    let active = true;
    /** The session the clock is judging against: it moves with each applied boundary, without waiting
     * for React to re-render (a stale read would arm the same card twice). */
    let live = current;
    const armTempo = () => {
      const ticket = guidedTicket(live);
      const card = live.lesson.cards[live.cardIndex];
      if (!ticket || !card) return;
      tempoTicket.current = ticket;
      tempoEntry.current = new ChordEntry(requiredCount(card.target), settleMs);
      releaseGate.current = soundingNotes(rawNotes.current).length === 0;
      tempoMatch.current = false;
    };
    const close = () => {
      const ticket = tempoTicket.current;
      if (!ticket) return;
      const card = live.lesson.cards[ticket.cardIndex];
      const candidate = tempoEntry.current;
      if (card && candidate && !candidate.done && candidate.lastOnMs !== undefined
        && candidate.snapshot.length >= requiredCount(card.target) && judgeChord(card.target, candidate.snapshot).ok) {
        tempoMatch.current = true;
      }
      tempoValues.current.push(tempoMatch.current);
      tempoMatch.current = false;
      const applied = recordGuidedTempoCard(live, ticket, tempoValues.current[tempoValues.current.length - 1]!);
      if (applied.accepted) { live = applied.session; setSession(live); }
      tempoEntry.current = undefined;
      tempoTicket.current = undefined;
    };
    armTempo();
    // A synchronous throw from the clock must not take the screen with it.
    try {
    void clock.transport.start({
      ...clock, bpm: practiceBpm, countInBars: 0, metronomeEnabled, referenceSoundEnabled: false, sound,
      onTransportBeat: (beat: number) => {
        if (!active) return;
        let nextIndex = 0;
        let end = current.lesson.cards[0]!.beats;
        while (beat >= end - 1e-6 && nextIndex + 1 < current.lesson.cards.length) {
          nextIndex += 1;
          end += current.lesson.cards[nextIndex]!.beats;
        }
        while (index < nextIndex) {
          close();
          index += 1;
          armTempo();
        }
        if (beat >= total - 1e-6) {
          close();
          active = false;
          transportRef.current?.stop();
          transportRef.current = undefined;
          setTempoRunning(false);
          setTempoSummary([...tempoValues.current]);
        }
      },
    }).catch(() => {
      if (!active) return;
      active = false;
      stopTempo();
      setFlash({ ok: false, message: "テンポの練習を開始できません。もう一度お試しください" });
    });
    } catch {
      active = false;
      transportRef.current = undefined;
      setTempoRunning(false);
      setFlash({ ok: false, message: "テンポの練習を開始できません。もう一度お試しください" });
    }
  }, [tempoRunning, metronomeEnabled, sound, stopTempo, settleMs, practiceBpm]);

  useEffect(() => () => { transportRef.current?.stop(); transportRef.current = undefined; }, []);

  // Esc stops what is playing and nothing else: it never moves a stage or throws a round away.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.repeat) return;
      if (event.target instanceof HTMLElement && event.target.closest("input,select,textarea")) return;
      if (document.querySelector("[role=dialog]")) return;
      if (previewing || tempoRunning) {
        event.preventDefault();
        playbackController.stop();
        setPreviewing(false);
        if (tempoRunning) stopTempo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [previewing, tempoRunning, stopTempo]);

  // ── screen ──────────────────────────────────────────────────────────────────────────────────
  /** Focus follows the stage: the instruction is the first thing read, never an answer. */
  const instructionRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!session || choosing) return;
    instructionRef.current?.focus({ preventScroll: true });
  }, [session?.stage, session?.id, choosing]);

  if (choosing) {
    const total = draftView?.chords.length ?? 0;
    const options = kind === "builtin"
      ? BUILTIN_OPTIONS
      : progressions.map((entry) => ({ value: entry.key, label: entry.displayName ?? entry.name }));
    const reason = draftUnavailable ?? (draftLesson && !draftLesson.ok ? draftLesson.reason : undefined);
    return <div className="dojo-practice" data-testid="guided-choose">
      <DojoBackButton label="Chord Dojo" onBack={cancelChooser} />
      <h1>教材を変更</h1>
      <p className="dojo-practice-guide">教材とキー、2〜4 コードの範囲を選びます。決めた時だけ①から始まります。</p>
      <PracticeGuide>
        <div className="dojo-guided-setup">
          <label>種類 <select data-testid="guided-material-kind" value={kind} onChange={(event) => {
            const next = event.target.value as PickerState["kind"];
            setKind(next);
            resetPickerRange(next, builtinId, keyIndex, savedKey);
          }}>
            <option value="builtin">定番の進行</option>
            <option value="saved" disabled={progressions.length === 0}>自分の進行</option>
          </select></label>
          <label>教材 {kind === "builtin"
            ? <select data-testid="guided-material" value={builtinId} onChange={(event) => {
              const next = event.target.value;
              setBuiltinId(next);
              resetPickerRange(kind, next, keyIndex, savedKey);
            }}>{BUILTIN_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : <select data-testid="guided-material" value={savedKey} onChange={(event) => {
              const next = event.target.value;
              setSavedKey(next);
              resetPickerRange(kind, builtinId, keyIndex, next);
            }}>
              {progressions.length === 0 ? <option value="">（自分の進行はありません）</option> : null}
              {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>}</label>
          {kind === "builtin"
            ? <label>キー <select data-testid="guided-key" value={keyIndex} onChange={(event) => {
              const next = Number(event.target.value);
              setKeyIndex(next);
              resetPickerRange(kind, builtinId, next, savedKey);
            }}>{NAMES.map((name, index) => <option key={index} value={index}>{name}</option>)}</select></label>
            : null}
          <label>開始 <select data-testid="guided-range-start" value={range.start} onChange={(event) => {
            const start = Number(event.target.value);
            setRange((before) => ({ start, end: Math.min(Math.max(start + 1, before.end), Math.max(1, total - 1)) }));
          }}>
            {Array.from({ length: total }, (_, index) => <option key={index} value={index}>{index + 1}番目</option>)}
          </select></label>
          <label>終了 <select data-testid="guided-range-end" value={range.end} onChange={(event) => {
            const end = Number(event.target.value);
            setRange((before) => ({ start: Math.max(0, Math.min(before.start, end - 1)), end }));
          }}>
            {Array.from({ length: total }, (_, index) => <option key={index} value={index}>{index + 1}番目</option>)}
          </select></label>
        </div>
        {reason ? <p role="alert" data-testid="guided-rejected">{reason}</p> : null}
        <p className="dojo-muted" data-testid="guided-choose-summary">
          {draftView ? `${draftView.name}${draftView.keyLabel ? `（キー ${draftView.keyLabel}）` : ""}・${draftView.count} コード` : ""}
        </p>
      </PracticeGuide>
      <PracticeActions>
        <button type="button" className="dojo-primary" data-testid="guided-material-apply"
          disabled={!draftLesson || !draftLesson.ok} onClick={applyDraft}>この教材で始める</button>
        <button type="button" data-testid="guided-material-cancel" onClick={cancelChooser}>キャンセル</button>
      </PracticeActions>
    </div>;
  }

  if (!view || !lesson || !lesson.ok) {
    const reason = view && lesson && !lesson.ok
      ? lesson.reason
      : "この教材はガイドで使えません。別の教材を選んでください。";
    return <div className="dojo-practice" data-testid="guided-practice">
      <DojoBackButton label="Chord Dojo" onBack={onExit} />
      <p role="alert" data-testid="guided-rejected">{reason}</p>
      <PracticeActions>
        <button type="button" className="dojo-primary" data-testid="guided-change-material" onClick={openChooser}>教材を変更</button>
        <button type="button" onClick={onExit}>Chord Dojo へ戻る</button>
      </PracticeActions>
    </div>;
  }

  if (!session) {
    return <div className="dojo-practice" data-testid="guided-practice" aria-busy="true" />;
  }

  if (session.status === "ended") {
    return <div className="dojo-practice" data-testid="guided-result">
      <DojoBackButton label="Chord Dojo" onBack={onExit} />
      <h1>ガイド練習 の結果</h1>
      <PracticeGuide>
        <ul className="dojo-guided-results">
          {GUIDE_STAGES.map((stage) => {
            const outcome = session.outcomes.find((entry) => entry.stage === stage);
            return <li key={stage} data-testid={`guided-result-${stage}`}>
              {guidedStageLabel(stage)}: {outcome ? guidedStageResultText(outcome) : "取り組みなし"}
            </li>;
          })}
        </ul>
        <p>この結果は今回だけの記録です。通常の成績には加算されません。</p>
        <p>次回は、見本を見る前に同じ進行を試してみましょう。</p>
      </PracticeGuide>
      <PracticeActions>
        <button type="button" data-testid="guided-again-recall"
          onClick={() => setSession(restartGuidedSession(session.lesson, `${session.lesson.id}-${Date.now().toString(36)}`, "recall"))}>もう一度、思い出すから</button>
        <button type="button" data-testid="guided-again-all"
          onClick={() => setSession(startGuidedSession(session.lesson, `${session.lesson.id}-${Date.now().toString(36)}`))}>同じ設定で最初から</button>
        <button type="button" data-testid="guided-exit" onClick={onExit}>Chord Dojo へ戻る</button>
      </PracticeActions>
    </div>;
  }

  const stage = session.stage;
  const card = currentGuidedCard(session);
  const complete = guidedRoundComplete(session);
  const answers = guidedMaterialsVisible(session);
  const cardOpen = guidedCardAnswerVisible(session, session.cardIndex);
  const display = cardOpen ? frozenDisplay(card.event) : undefined;
  const snapshot = cardOpen
    ? targetSnapshot(`guide-${card.index}`, card.chord, card.notes,
      display ? { hands: { left: display.hands.left, right: display.hands.right }, labels: display.labels } : undefined,
      card.event.keyContext ?? session.lesson.keyLabel)
    : undefined;
  const stages: StageItem[] = GUIDE_STAGES.map((item, index) => ({
    num: ["①", "②", "③", "④", "⑤"][index]!,
    name: guidedStageLabel(item).replace(/^[①-⑤] /, ""),
    state: item === stage ? "on" : index + 1 < session.stageIndex ? "idle" : "off",
    ...(item === "tempo" && !session.lesson.tempoAvailable ? { title: "この教材はこの版のテンポ段階では扱えません" } : {}),
  }));
  const pending = previewing || tempoRunning;
  const title = answers ? `${view.name}${session.lesson.rangeLabel ? `（${session.lesson.rangeLabel}）` : ""}` : "ガイド練習";
  const tempoBlocked = !session.lesson.tempoAvailable || session.tempoSkipped;

  return <div className="dojo-practice" data-testid="guided-practice">
    <PracticeHead backLabel="Chord Dojo" onBack={onExit} kind="ガイド練習" title={title}
      degrees={answers ? session.lesson.cards.map((item) => item.chord.label).join(" / ") : undefined}
      stages={stages} progress={<>{session.stageIndex} / {GUIDE_STAGES.length}</>} progressLabel="ガイドの進み"
      extra={<button type="button" data-testid="guided-change-material" onClick={openChooser}>教材変更</button>} />
    <PracticeGuide>
      <p data-testid="guided-instruction" ref={instructionRef} tabIndex={-1}>{guidedStageInstruction(stage)}</p>
      <p className="dojo-muted" data-testid="guided-progress-line">現在のカード {Math.min(session.cardIndex + 1, session.lesson.cards.length)} / {session.lesson.cards.length}</p>
      {stage === "tempo" && tempoBlocked
        ? <p data-testid="guided-tempo-unavailable">この教材はテンポ段階では扱えません（対象外）。⑤ へ進めます。</p>
        : null}
      {stage === "tempo" && !tempoBlocked
        ? <p data-testid="guided-tempo-status">{tempoRunning ? `テンポで演奏中（${Math.min(session.cardIndex + 1, session.lesson.cards.length)}/${session.lesson.cards.length}）` : tempoSummary ? `${tempoSummary.filter(Boolean).length}/${tempoSummary.length} 合いました` : "まだ始めていません"}</p>
        : null}
      {stage === "tempo" && !tempoBlocked
        ? <div className="dojo-guided-bpm-row">
          <label>テンポ <input type="number" inputMode="numeric" min={30} max={240} step={1} data-testid="guided-bpm"
            aria-label="テンポ（30〜240 BPM）" value={bpmText} disabled={tempoRunning || previewing}
            onChange={(event) => changeBpm(event.target.value)} /> BPM</label>
          <span className="dojo-muted">この練習だけの速さです（保存しません）</span>
          {bpmError ? <span role="alert" data-testid="guided-bpm-error">{bpmError}</span> : null}
        </div>
        : null}
      {complete && stage !== "tempo" ? <p data-testid="guided-round-result">
        {stage === "listen" ? "聴きました"
          : stage === "apply" ? "試して終了しました（自己申告）"
            : session.hintUsed && session.selfConfirmed ? "見本を確認しながら、自分で確認して最後まで進みました"
              : session.hintUsed ? "見本を確認しながら最後まで弾きました"
                : session.selfConfirmed ? "自己確認で最後まで進みました"
                  : stage === "see" ? "見ながら最後まで弾きました"
                    : "見本なしで最後まで弾きました"}
      </p> : null}
      {flash ? <p data-testid="guided-feedback" data-ok={flash.ok}>{flash.message}</p> : null}
      {!answers && !cardOpen ? <p className="sr-only" data-testid="guided-hidden-note">答えを隠しています。表示されるのは、いま弾いた音だけです。</p> : null}
      {!connected ? <p className="dojo-muted" data-testid="guided-midi-off">MIDI が見つかりません。自分で確認するか、接続してください。</p> : null}
    </PracticeGuide>
    <div className="dojo-cards">
      {session.lesson.cards.map((item, index) => {
        const open = guidedCardAnswerVisible(session, index);
        const result = session.cardResults[index];
        const current = index === session.cardIndex;
        return <PracticeCard key={item.index} state={current ? "current" : result === "judged" ? "done" : "todo"}
          name={open ? item.chord.label : "?"}
          notes={open ? item.notes.join(" ") : "—"}
          label={open ? `${item.chord.label} を聴く` : `${index + 1}番目のコード`}
          onPress={() => void playCard(index, session.stage === "recall" || session.stage === "apply")}
          disabled={!open || pending || (stage === "tempo" && tempoRunning)}
          status={result === "judged" ? "✓" : result === "missed" ? "…" : undefined}
          testId={`guided-card-${index}`} nameTestId={`guided-card-name-${index}`} notesTestId={`guided-card-notes-${index}`} />;
      })}
    </div>
    {snapshot
      ? <GrandStaff compact snapshot={snapshot} />
      : null}
    <div className="dojo-keyboard" style={{ "--target-keyboard-width": "760px" } as CSSProperties}>
      <div className="dojo-keyboard-head"><b>鍵盤</b><span><i className="dojo-held-swatch" />押している音</span>{snapshot ? <span><i className="dojo-answer-swatch" />答え</span> : null}</div>
      <PracticeKeyboard appearance="dojo" hideLegend compactSummary octaveConvention="scientific"
        range={answerKeyboardRange(snapshot ? card.notes : [], Boolean(snapshot))}
        guideNotes={snapshot?.midiNotes ?? []}
        allowedPitchClasses={snapshot?.midiNotes.map(pc) ?? []}
        requiredPitchClasses={snapshot?.midiNotes.map(pc) ?? []}
        interactionMode={snapshot ? "practice" : "neutral-monitor"}
        level={snapshot ? 1 : 2}
        concealNoteNames={!snapshot}
        leftHandGuideNotes={snapshot?.notes.filter((note) => note.hand === "left").map((note) => note.midi) ?? []}
        rightHandGuideNotes={snapshot?.notes.filter((note) => note.hand === "right").map((note) => note.midi) ?? []}
        fingerLabels={snapshotFingerLabels(snapshot)} />
    </div>
    <PracticeActions>
      {stage === "listen"
        ? <button type="button" data-testid="guided-listen" disabled={previewing} onClick={() => void playRange()}>お手本を聴く</button>
        : null}
      {stage !== "listen"
        ? <button type="button" data-testid="guided-listen" disabled={previewing} onClick={() => {
          // An explicit audition is a hint, in ④ too: it stops the clock and the next start is the
          // top of the range (the round is marked as assisted; no answer is shown).
          if (tempoRunning) {
            stopTempo();
            setTempoSummary(undefined);
            tempoValues.current = [];
            setSession((before) => before && before.stage === "tempo" ? { ...retryGuidedRound(before), hintUsed: true } : before);
          }
          void playCard(tempoRunning ? 0 : (sessionRef.current?.cardIndex ?? 0), stage === "recall" || stage === "apply");
        }}>お手本を聴く</button>
        : null}
      {stage === "recall" || stage === "apply"
        ? <button type="button" data-testid="guided-hint" disabled={previewing} onClick={() => {
          if (tempoRunning) stopTempo();
          setSession((before) => before ? hintGuided(before) : before);
        }}>見本を確認</button>
        : null}
      {stage === "tempo" && !tempoBlocked
        ? <button type="button" className="dojo-primary" data-testid="guided-tempo" onClick={() => tempoRunning ? stopTempo() : beginTempo()}>{tempoRunning ? "止める" : "テンポで始める"}</button>
        : null}
      {(stage === "see" || stage === "recall") && !connected
        ? <>
          <button type="button" data-testid="guided-self-ok" disabled={!guidedTicket(session) || pending} onClick={() => {
            const live = sessionRef.current;
            const ticket = live ? guidedTicket(live) : undefined;
            if (!live || !ticket) return;
            const applied = recordGuidedCard(markGuidedSelfConfirmed(live), ticket, true, "自分で確認しました");
            if (applied.accepted) { setFlash({ ok: true, message: "自分で確認しました（自己申告）" }); setSession(applied.session); }
          }}>弾けた（自分で確認）</button>
          <button type="button" data-testid="guided-self-miss" disabled={!guidedTicket(session) || pending} onClick={() => {
            const live = sessionRef.current;
            const ticket = live ? guidedTicket(live) : undefined;
            if (!live || !ticket) return;
            const applied = recordGuidedCard(markGuidedSelfConfirmed(live), ticket, false, "自分でもう一度");
            if (applied.accepted) setSession(applied.session);
          }}>まだ</button>
        </>
        : null}
      {stage === "see" || stage === "recall"
        ? <button type="button" data-testid="guided-retry" disabled={pending} onClick={() => { setFlash(undefined); setSession((before) => before ? retryGuidedRound(before) : before); }}>もう一度</button>
        : null}
      <button type="button" data-testid="guided-next" disabled={pending} onClick={() => {
        setFlash(undefined);
        if (tempoRunning) stopTempo();
        setSession((before) => {
          if (!before) return before;
          if (before.stage === "apply") return advanceGuidedStage(markGuidedSelfConfirmed(before));
          return advanceGuidedStage(before);
        });
      }}>{stage === "apply" ? "試して終了" : "次へ"}</button>
      <button type="button" data-testid="guided-end" disabled={tempoRunning} onClick={() => {
        if (tempoRunning) stopTempo();
        setSession((before) => before ? endGuidedSession(before) : before);
      }}>ガイドを終了</button>
    </PracticeActions>
    <PracticeSafeArea />
    <p className="sr-only">{STAFF_HELP}</p>
  </div>;
}
