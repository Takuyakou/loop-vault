import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  AlertTriangle,
  Check,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  Square,
} from "lucide-react";
import {
  computePracticeKeyboardRange,
} from "../music-keyboard";
import {
  createPracticeTargetMatchEvaluator,
} from "../../domain/practiceTransposition";
import {
  practiceInputFromLiveState,
  type PracticeAction,
  type PracticeSessionContext,
} from "../../domain/practice";
import {
  currentMixOrderItem,
  currentMixSnapshot,
  findMixSnapshotDrift,
  mixSessionSummary,
  reduceMixSession,
  retryDirtyMixSession,
  retrySameMixSession,
  type MixProgressionCandidate,
  type MixSessionConfig,
  type MixSessionState,
} from "../../domain/practiceMix";
import type { AppLanguage } from "../../domain/types";
import type { GenerateStyleVoicingOptions } from "../../domain/voicingPractice";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import type { LiveMidiConnectionStatus } from "../../liveMidi/types";
import type { PracticeClock } from "../../practice/PracticeClock";
import { PracticeKeyboard } from "./PracticeKeyboard";

interface MixPracticeWorkspaceProps {
  initialState: MixSessionState;
  language: AppLanguage;
  practiceClock: Pick<PracticeClock, "start" | "stop" | "pause" | "resume">;
  candidates: readonly MixProgressionCandidate[];
  styleOptions?: GenerateStyleVoicingOptions;
  midiStatus: LiveMidiConnectionStatus;
  midiDeviceName?: string;
  midiError?: string;
  createSeed(): number;
  reloadSession(config: MixSessionConfig): MixSessionState | undefined;
  reconnectMidi(): void | Promise<void>;
  openSettings(): void;
  onExit(): void;
  onError(message: string): void;
}

const copy = {
  ja: {
    title: "ミックスセッション",
    ready: "準備できました",
    start: "この進行を開始",
    countIn: "カウントイン",
    current: "現在",
    progression: (current: number, total: number) => `${current} / ${total}進行`,
    cycle: (current: number, total: number) => `${current} / ${total}巡`,
    clean: "クリーン",
    dirty: "要再挑戦",
    next: "次の進行",
    pause: "一時停止",
    resume: "再開",
    end: "終了",
    summary: "ミックス練習 完了",
    summaryLine: (count: number, cycles: number) => `${count}進行を${cycles}巡しました`,
    retryDirty: "クリーンでなかった進行だけ、もう一巡",
    retrySame: "同じ選択でもう一度",
    close: "終了",
    currentChord: "現在のコード",
    keyboard: "練習鍵盤",
    flowStartFailed: "ミックスのフロー練習を開始できませんでした。",
    midi: "MIDI入力",
    connected: "接続済み",
    connecting: "接続中",
    disconnected: "未接続",
    reconnect: "再接続",
    settings: "設定",
    targetSource: "Target Source",
    resolved: "保存ボイシング",
    generatedClose: "自動（クローズ）",
    shell: "シェル 1-7",
    open: "オープン 1-7",
    rootless: "ルートレス A/B",
    snapshotChanged: "練習中の進行がVaultで変更または削除されました。現在のスナップショットでは続行できません。",
    reload: "最新データで再読込",
    reloadFailed: "最新データからミックスを再構築できませんでした。",
    exitAfterChange: "終了",
    confirmExit: "ミックス練習を終了しますか？結果は保存されません。",
  },
  en: {
    title: "Mix Session",
    ready: "Ready",
    start: "Start this progression",
    countIn: "Count-in",
    current: "Current",
    progression: (current: number, total: number) => `${current} / ${total} progressions`,
    cycle: (current: number, total: number) => `${current} / ${total} cycles`,
    clean: "Clean",
    dirty: "Retry",
    next: "Next progression",
    pause: "Pause",
    resume: "Resume",
    end: "End",
    summary: "Mix practice complete",
    summaryLine: (count: number, cycles: number) => `${count} progressions · ${cycles} cycles`,
    retryDirty: "Retry only progressions that were not clean",
    retrySame: "Repeat the same selection",
    close: "Finish",
    currentChord: "Current chord",
    keyboard: "Practice keyboard",
    flowStartFailed: "Could not start Mix Flow practice.",
    midi: "MIDI input",
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Disconnected",
    reconnect: "Reconnect",
    settings: "Settings",
    targetSource: "Target Source",
    resolved: "Saved voicing",
    generatedClose: "Automatic (close)",
    shell: "Shell 1-7",
    open: "Open 1-7",
    rootless: "Rootless A/B",
    snapshotChanged: "A progression in this Mix was changed or deleted in the Vault. The frozen session cannot continue silently.",
    reload: "Reload current data",
    reloadFailed: "The Mix could not be rebuilt from the current Vault data.",
    exitAfterChange: "End",
    confirmExit: "End Mix practice? Results are not saved.",
  },
} as const;

export function MixPracticeWorkspace({
  initialState,
  language,
  practiceClock,
  candidates,
  styleOptions,
  midiStatus,
  midiDeviceName,
  midiError,
  createSeed,
  reloadSession,
  reconnectMidi,
  openSettings,
  onExit,
  onError,
}: MixPracticeWorkspaceProps) {
  const text = copy[language];
  const [state, setState] = useState(initialState);
  const [beat, setBeat] = useState(1);
  const [countingIn, setCountingIn] = useState(false);
  const [clockStarting, setClockStarting] = useState(false);
  const [flowClockReady, setFlowClockReady] = useState(false);
  const latestStateRef = useRef(initialState);
  const clockGenerationRef = useRef(0);
  const pendingClockGenerationRef = useRef<number>();
  const resumableClockGenerationRef = useRef<number>();
  const flowClockReadyRef = useRef(false);
  const handledDriftRef = useRef("");
  const betweenHeadingRef = useRef<HTMLHeadingElement>(null);
  const liveNotes = useStore(defaultLiveMidiStore, (store) => store.notes);

  const snapshot = currentMixSnapshot(state);
  const orderItem = currentMixOrderItem(state);
  const practice = state.currentPracticeSession;
  const context = useMemo<PracticeSessionContext | undefined>(() => {
    if (!snapshot) return undefined;
    const matchInput = createPracticeTargetMatchEvaluator(snapshot.targetPlan);
    return {
      events: snapshot.events,
      requirements: snapshot.targetPlan.requirements,
      ...(matchInput ? { matchInput } : {}),
    };
  }, [snapshot]);
  const eventIndex = practice?.currentEventIndex ?? 0;
  const currentEvent = snapshot?.events[eventIndex];
  const currentPlanEvent = snapshot?.targetPlan.events[eventIndex];
  const currentRequirement = snapshot?.targetPlan.requirements[eventIndex];
  const keyboardRange = useMemo(
    () => computePracticeKeyboardRange(
      snapshot?.targetPlan.events.map((event) => event.midiNotes) ?? [],
    ),
    [snapshot],
  );
  const summary = useMemo(() => mixSessionSummary(state), [state]);
  const cleanCount = state.results.filter((result) => result.result === "clean").length;
  const dirtyCount = state.results.filter((result) => result.result === "dirty").length;
  const snapshotDrift = useMemo(
    () => findMixSnapshotDrift(
      state.snapshots,
      candidates,
      state.config,
      styleOptions,
    ),
    [candidates, state.config, state.snapshots, styleOptions],
  );
  const snapshotDriftKey = snapshotDrift
    .map((item) => `${item.reference.ideaId}:${item.reference.blockId}:${item.reason}`)
    .join("|");

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (
      state.status !== "running"
      || !context
      || !currentRequirement
      || countingIn
      || snapshotDrift.length > 0
      || (state.config.mode === "flow" && !flowClockReady)
    ) {
      return;
    }
    dispatchPractice({
      type: "MIDI_STATE_CHANGED",
      input: practiceInputFromLiveState(liveNotes, performance.now()),
    }, context);
  }, [
    context,
    countingIn,
    currentRequirement,
    flowClockReady,
    liveNotes,
    snapshotDrift.length,
    state.status,
  ]);

  useEffect(() => {
    const candidate = practice?.provisionalCandidate;
    if (!candidate || state.status !== "running" || !context) return undefined;
    const timer = globalThis.setTimeout(() => {
      dispatchPractice({
        type: "STABLE_DEADLINE",
        nowMs: performance.now(),
      }, context);
    }, Math.max(0, candidate.sinceMs + 100 - performance.now()));
    return () => globalThis.clearTimeout(timer);
  }, [context, practice?.provisionalCandidate, state.status]);

  useEffect(() => {
    if (midiStatus !== "disconnected" && midiStatus !== "error") return;
    const current = latestStateRef.current;
    if (current.status !== "running" && current.status !== "paused") return;
    if (current.config.mode === "flow") {
      invalidateClock();
    }
    if (current.status === "running" && context) {
      replaceState(reduceMixSession(current, { type: "PAUSE" }, context));
    }
  }, [context, midiStatus, practiceClock]);

  useEffect(() => {
    if (snapshotDrift.length === 0) {
      handledDriftRef.current = "";
      return;
    }
    if (handledDriftRef.current === snapshotDriftKey) return;
    handledDriftRef.current = snapshotDriftKey;
    const current = latestStateRef.current;
    invalidateClock();
    if (current.status === "running" && context) {
      replaceState(reduceMixSession(current, { type: "PAUSE" }, context));
    }
  }, [context, practiceClock, snapshotDrift.length, snapshotDriftKey]);

  useEffect(() => {
    if (state.status === "between-progressions") {
      betweenHeadingRef.current?.focus();
    }
  }, [state.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      const element = event.target;
      if (
        element instanceof Element
        && element.matches("input, textarea, select, [contenteditable=true]")
      ) return;
      event.preventDefault();
      if (latestStateRef.current.status === "running") {
        pause();
      } else if (globalThis.confirm(text.confirmExit)) {
        finish();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [context, text.confirmExit]);

  useEffect(() => () => {
    clockGenerationRef.current += 1;
    pendingClockGenerationRef.current = undefined;
    resumableClockGenerationRef.current = undefined;
    flowClockReadyRef.current = false;
    practiceClock.stop();
  }, [practiceClock]);

  function replaceState(next: MixSessionState): void {
    latestStateRef.current = next;
    setState(next);
  }

  function dispatchPractice(
    action: PracticeAction,
    activeContext = context,
  ): void {
    if (!activeContext) return;
    const next = reduceMixSession(
      latestStateRef.current,
      { type: "PRACTICE_ACTION", action },
      activeContext,
    );
    replaceState(next);
    if (next.status === "between-progressions" || next.status === "summary") {
      invalidateClock();
    }
  }

  async function startCurrent(): Promise<void> {
    if (
      !context
      || clockStarting
      || midiStatus !== "connected"
      || snapshotDrift.length > 0
    ) return;
    const before = latestStateRef.current;
    const nextAttackRevision = requiredAttackRevision();
    const next = reduceMixSession(before, {
      type: "START_CURRENT",
      requiredAttackRevision: nextAttackRevision,
    }, context);
    replaceState(next);
    if (next.config.mode !== "flow") return;
    await startFlowClock(next, context, before.status === "between-progressions");
  }

  async function startFlowClock(
    runningState: MixSessionState,
    activeContext: PracticeSessionContext,
    useCountIn: boolean,
  ): Promise<boolean> {
    const generation = clockGenerationRef.current + 1;
    clockGenerationRef.current = generation;
    pendingClockGenerationRef.current = generation;
    resumableClockGenerationRef.current = undefined;
    setCountingIn(useCountIn);
    setFlowClockReadyState(false);
    setClockStarting(true);
    const activeSnapshot = currentMixSnapshot(runningState);
    try {
      await practiceClock.start({
        events: activeSnapshot?.events ?? [],
        bpm: runningState.config.bpm,
        beatsPerBar: 4,
        countInBars: useCountIn ? 1 : 0,
        callbacks: {
          onTargetOpen: (targetIndex) => {
            if (!isActiveGeneration(generation)) return;
            setCountingIn(false);
            dispatchPractice({ type: "FLOW_TARGET_OPEN", eventIndex: targetIndex });
          },
          onTargetClose: (targetIndex) => {
            if (!isActiveGeneration(generation)) return;
            dispatchPractice({ type: "FLOW_TARGET_CLOSE", eventIndex: targetIndex });
          },
          onRoundCompleted: () => {
            if (!isActiveGeneration(generation)) return;
            dispatchPractice({ type: "ROUND_COMPLETED" });
          },
          onBeat: (nextBeat) => {
            if (isActiveGeneration(generation)) setBeat(nextBeat);
          },
          onCountInBeat: (nextBeat) => {
            if (isActiveGeneration(generation)) {
              setCountingIn(true);
              setBeat(nextBeat);
            }
          },
        },
      });
      if (!isCurrentRunningGeneration(generation)) return false;
      pendingClockGenerationRef.current = undefined;
      resumableClockGenerationRef.current = generation;
      setFlowClockReadyState(true);
      setClockStarting(false);
      return true;
    } catch {
      if (clockGenerationRef.current !== generation) return false;
      clockGenerationRef.current += 1;
      pendingClockGenerationRef.current = undefined;
      resumableClockGenerationRef.current = undefined;
      practiceClock.stop();
      setCountingIn(false);
      setFlowClockReadyState(false);
      setClockStarting(false);
      const current = latestStateRef.current;
      if (current.status === "running") {
        replaceState(reduceMixSession(
          current,
          { type: "PAUSE" },
          activeContext,
        ));
      }
      onError(text.flowStartFailed);
      return false;
    }
  }

  function isActiveGeneration(generation: number): boolean {
    return generation === clockGenerationRef.current
      && pendingClockGenerationRef.current === undefined
      && flowClockReadyRef.current
      && latestStateRef.current.status === "running";
  }

  function isCurrentRunningGeneration(generation: number): boolean {
    return generation === clockGenerationRef.current
      && latestStateRef.current.status === "running";
  }

  function requiredAttackRevision(): number {
    return practiceInputFromLiveState(
      defaultLiveMidiStore.getState().notes,
      performance.now(),
    ).attackRevision + 1;
  }

  function setFlowClockReadyState(next: boolean): void {
    flowClockReadyRef.current = next;
    setFlowClockReady(next);
  }

  function invalidateClock(): void {
    clockGenerationRef.current += 1;
    pendingClockGenerationRef.current = undefined;
    resumableClockGenerationRef.current = undefined;
    practiceClock.stop();
    setCountingIn(false);
    setFlowClockReadyState(false);
    setClockStarting(false);
  }

  function pause(): void {
    if (
      !context
      || latestStateRef.current.status !== "running"
    ) return;
    const current = latestStateRef.current;
    if (current.config.mode === "flow") {
      if (pendingClockGenerationRef.current !== undefined || !flowClockReadyRef.current) {
        invalidateClock();
      } else {
        practiceClock.pause();
        resumableClockGenerationRef.current = clockGenerationRef.current;
        setFlowClockReadyState(false);
        setClockStarting(false);
      }
    }
    replaceState(reduceMixSession(
      current,
      { type: "PAUSE" },
      context,
    ));
  }

  async function resume(): Promise<void> {
    if (
      !context
      || latestStateRef.current.status !== "paused"
      || midiStatus !== "connected"
      || clockStarting
      || snapshotDrift.length > 0
    ) return;
    const current = latestStateRef.current;
    if (current.config.mode !== "flow") {
      replaceState(reduceMixSession(
        current,
        { type: "RESUME", requiredAttackRevision: requiredAttackRevision() },
        context,
      ));
      return;
    }
    if (
      resumableClockGenerationRef.current === clockGenerationRef.current
      && pendingClockGenerationRef.current === undefined
    ) {
      replaceState(reduceMixSession(
        current,
        { type: "RESUME", requiredAttackRevision: requiredAttackRevision() },
        context,
      ));
      setFlowClockReadyState(true);
      practiceClock.resume();
      return;
    }
    const restarted = reduceMixSession(
      current,
      {
        type: "RESTART_CURRENT",
        requiredAttackRevision: requiredAttackRevision(),
      },
      context,
    );
    replaceState(restarted);
    await startFlowClock(
      restarted,
      context,
      current.currentOrderIndex > 0,
    );
  }

  function finish(): void {
    invalidateClock();
    if (context) {
      replaceState(reduceMixSession(
        latestStateRef.current,
        { type: "END" },
        context,
      ));
    }
    onExit();
  }

  function retryDirty(): void {
    const next = retryDirtyMixSession(latestStateRef.current, createSeed());
    if (!next) return;
    invalidateClock();
    setBeat(1);
    replaceState(next);
  }

  function retrySame(): void {
    const next = retrySameMixSession(latestStateRef.current, createSeed());
    invalidateClock();
    setBeat(1);
    replaceState(next);
  }

  function reloadCurrentSession(): void {
    const next = reloadSession(latestStateRef.current.config);
    if (!next) {
      onError(text.reloadFailed);
      return;
    }
    invalidateClock();
    handledDriftRef.current = "";
    setBeat(1);
    replaceState(next);
  }

  function openSettingsSafely(): void {
    if (latestStateRef.current.status === "running" && context) {
      pause();
    }
    openSettings();
  }

  if (snapshotDrift.length > 0) {
    return (
      <section
        data-testid="mix-session"
        aria-labelledby="mix-session-title"
      >
        <p className="text-xs font-semibold uppercase text-[var(--lv-accent)]">
          {text.title}
        </p>
        <h3 id="mix-session-title" className="mt-1 text-xl font-semibold">
          {text.snapshotChanged}
        </h3>
        <section
          className="mt-4 border border-amber-700 bg-amber-950/20 p-4"
          role="alert"
          data-testid="mix-snapshot-drift"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              aria-hidden="true"
              size={20}
              className="mt-0.5 shrink-0 text-amber-200"
            />
            <ul className="space-y-1 text-sm text-amber-100">
              {snapshotDrift.map((item) => (
                <li key={`${item.reference.ideaId}:${item.reference.blockId}`}>
                  {item.title}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="lv-button-primary px-4 py-2 text-sm"
              onClick={reloadCurrentSession}
            >
              {text.reload}
            </button>
            <button
              type="button"
              className="lv-button-ghost px-4 py-2 text-sm"
              onClick={finish}
            >
              {text.exitAfterChange}
            </button>
          </div>
        </section>
      </section>
    );
  }

  if (state.status === "summary") {
    return (
      <section data-testid="mix-summary" aria-labelledby="mix-summary-title">
        <h3 id="mix-summary-title" className="text-xl font-semibold">{text.summary}</h3>
        <p className="mt-2 text-sm text-[var(--lv-text-muted)]">
          {text.summaryLine(state.snapshots.length, state.config.cycles)}
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <SummaryList label={text.clean} snapshots={summary.clean} clean />
          <SummaryList label={text.dirty} snapshots={summary.dirty} />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {summary.dirty.length > 0 ? (
            <button
              type="button"
              className="lv-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
              onClick={retryDirty}
            >
              <RotateCcw aria-hidden="true" size={16} /> {text.retryDirty}
            </button>
          ) : null}
          <button
            type="button"
            className="lv-button-ghost px-4 py-2 text-sm"
            onClick={retrySame}
          >
            {text.retrySame}
          </button>
          <button
            type="button"
            className="lv-button-ghost px-4 py-2 text-sm"
            onClick={finish}
          >
            {text.close}
          </button>
        </div>
      </section>
    );
  }

  const readyForCurrent = state.status === "ready"
    || state.status === "between-progressions";
  return (
    <section data-testid="mix-session" aria-labelledby="mix-session-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--lv-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--lv-accent)]">
            {text.title}
          </p>
          <h3
            id="mix-session-title"
            ref={betweenHeadingRef}
            tabIndex={state.status === "between-progressions" ? -1 : undefined}
            className="mt-1 text-xl font-semibold"
            aria-live="polite"
          >
            {readyForCurrent && state.status === "between-progressions"
              ? text.next
              : text.current}
            {" · "}
            {snapshot?.title ?? "-"}
          </h3>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <span>{text.progression(orderItem?.progressionIndex ?? 1, state.snapshots.length)}</span>
          <span>{text.cycle(orderItem?.cycle ?? 1, state.config.cycles)}</span>
          <span>L{state.config.level}</span>
          <span>{state.config.mode === "flow" ? `BPM ${state.config.bpm}` : "Step"}</span>
          <span>{text.targetSource}: {targetSourceLabel(state.config.targetSource, text)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--lv-border)] py-4">
        <span className="text-xs font-semibold text-[var(--lv-text-muted)]">{text.midi}</span>
        <span className={`inline-flex items-center gap-1.5 text-sm ${
          midiStatus === "connected" ? "text-teal-200" : "text-amber-200"
        }`}>
          <span className={`h-2 w-2 rounded-full ${
            midiStatus === "connected" ? "bg-teal-300" : "bg-amber-300"
          }`} />
          {midiStatus === "connected"
            ? `${text.connected}${midiDeviceName ? ` · ${midiDeviceName}` : ""}`
            : midiStatus === "connecting"
              ? text.connecting
              : text.disconnected}
        </span>
        {midiError ? <span className="text-xs text-amber-200">{midiError}</span> : null}
        <button
          type="button"
          className="lv-button-ghost ml-auto inline-flex h-9 items-center gap-2 px-3 text-sm"
          onClick={() => void reconnectMidi()}
        >
          <RefreshCw aria-hidden="true" size={16} /> {text.reconnect}
        </button>
        <button
          type="button"
          className="lv-button-ghost inline-flex h-9 items-center gap-2 px-3 text-sm"
          onClick={openSettingsSafely}
        >
          <Settings aria-hidden="true" size={16} /> {text.settings}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span>{text.clean} {cleanCount}</span>
        <span>{text.dirty} {dirtyCount}</span>
        {countingIn ? (
          <span className="font-semibold text-teal-200" aria-live="assertive">
            {text.countIn} {beat}
          </span>
        ) : null}
      </div>

      {readyForCurrent ? (
        <div className="mt-8 border-y border-[var(--lv-border)] py-8 text-center">
          <p className="text-sm text-[var(--lv-text-muted)]">{text.ready}</p>
          <p className="mt-2 text-2xl font-semibold">{snapshot?.title}</p>
          <button
            type="button"
            className="lv-button-primary mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm"
            disabled={
              clockStarting
              || midiStatus !== "connected"
              || snapshotDrift.length > 0
            }
            onClick={() => void startCurrent()}
          >
            <Play aria-hidden="true" size={16} /> {text.start}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(10rem,0.5fr)_minmax(0,2fr)]">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
                {text.currentChord}
              </p>
              <p className="mt-2 break-words text-3xl font-semibold" aria-live="polite">
                {state.config.level === 3
                  ? currentEvent?.romanNumeral ?? "-"
                  : currentEvent?.chord.label ?? "-"}
              </p>
              <p className="mt-3 text-sm text-[var(--lv-text-muted)]">
                {Math.min(eventIndex + 1, snapshot?.events.length ?? 0)}
                {" / "}
                {snapshot?.events.length ?? 0}
              </p>
            </div>
            <div aria-label={text.keyboard}>
              <PracticeKeyboard
                range={keyboardRange}
                guideNotes={currentPlanEvent?.midiNotes ?? []}
                leftHandGuideNotes={currentPlanEvent?.leftHandNotes ?? []}
                rightHandGuideNotes={currentPlanEvent?.rightHandNotes ?? []}
                allowedPitchClasses={currentRequirement?.allowedPitchClasses ?? []}
                requiredPitchClasses={currentRequirement?.requiredPitchClasses ?? []}
                level={state.config.level}
                language={language}
                matchState={practice?.lastMatch?.state}
              />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[var(--lv-border)] pt-4">
            {state.status === "running" ? (
              <button
                type="button"
                className="lv-button-ghost inline-flex items-center gap-2 px-4 py-2 text-sm"
                onClick={pause}
              >
                <Pause aria-hidden="true" size={16} /> {text.pause}
              </button>
            ) : null}
            {state.status === "paused" ? (
              <button
                type="button"
                className="lv-button-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
                disabled={
                  clockStarting
                  || midiStatus !== "connected"
                  || snapshotDrift.length > 0
                }
                onClick={() => void resume()}
              >
                <Play aria-hidden="true" size={16} /> {text.resume}
              </button>
            ) : null}
            <button
              type="button"
              className="lv-button-ghost inline-flex items-center gap-2 px-4 py-2 text-sm"
              onClick={() => {
                if (globalThis.confirm(text.confirmExit)) finish();
              }}
            >
              <Square aria-hidden="true" size={16} /> {text.end}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function targetSourceLabel(
  source: MixSessionConfig["targetSource"],
  text: typeof copy.ja | typeof copy.en,
): string {
  if (source.type === "resolved-voicing") return text.resolved;
  if (source.type === "generated-close") return text.generatedClose;
  if (source.styleId === "shell-17") return text.shell;
  if (source.styleId === "open-17") return text.open;
  return text.rootless;
}

function SummaryList({
  label,
  snapshots,
  clean = false,
}: {
  label: string;
  snapshots: readonly {
    readonly title: string;
    readonly reference: { readonly ideaId: string; readonly blockId: string };
  }[];
  clean?: boolean;
}) {
  return (
    <section>
      <h4 className="text-sm font-semibold">{label} {snapshots.length}</h4>
      <ul className="mt-2 space-y-2">
        {snapshots.map((snapshot) => (
          <li
            key={`${snapshot.reference.ideaId}:${snapshot.reference.blockId}`}
            className="flex items-center gap-2 border-b border-[var(--lv-border)] py-2 text-sm"
          >
            {clean
              ? <Check aria-hidden="true" size={16} className="text-teal-200" />
              : <span aria-hidden="true" className="text-amber-200">○</span>}
            <span>{snapshot.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
