import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  AlertTriangle,
  Check,
  Dumbbell,
  Heart,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Square,
} from "lucide-react";
import { playbackController } from "../audio/playbackController";
import {
  computePracticeKeyboardRange,
  formatMidiNoteForDisplay,
} from "../components/music-keyboard";
import { PracticeKeyboard } from "../components/practice/PracticeKeyboard";
import { voiceChordForPreview } from "../domain/chordVoicing";
import { degreeOf } from "../domain/harmony/degrees";
import {
  buildPracticeChordRequirements,
  createPracticeSessionState,
  practiceInputFromLiveState,
  practiceProgressState,
  progressionFingerprint,
  recommendPracticeBlocks,
  recordPracticeRound,
  reducePracticeSession,
  resetPracticeProgress,
  type DojoPracticeLevel,
  type PracticeLeniency,
  type PracticeMode,
  type PracticeRecommendation,
  type PracticeSessionState,
} from "../domain/practice";
import type { AppLanguage, SavedProgressionBlock, SongIdea } from "../domain/types";
import { resolveVoicingForUse } from "../domain/voicing";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { PracticeClock } from "../practice/PracticeClock";

interface PracticeTarget {
  ideaId: string;
  blockId: string;
}

interface PracticeViewProps {
  ideas: readonly SongIdea[];
  initialTarget?: PracticeTarget;
  language: AppLanguage;
  updateProgressionBlock: (
    ideaId: string,
    blockId: string,
    changes: Partial<SavedProgressionBlock>,
  ) => boolean;
  openProgression: (ideaId: string, blockId: string) => void;
  openSettings: () => void;
  setToast: (message: string) => void;
}

type QueueFilter = "recommended" | "favorite" | "unstarted" | "confirmation" | "l1" | "l2" | "l3";

const copy = {
  ja: {
    eyebrow: "CHORD DOJO",
    title: "進行を、自分の手で覚える",
    queue: "練習キュー",
    recommended: "おすすめ",
    favorite: "Favorite",
    unstarted: "未着手",
    confirmation: "確認待ち",
    noProgressions: "保存済みのコード進行がありません。",
    noMatches: "この条件に合う進行はありません。",
    openDetail: "進行を開く",
    selectPrompt: "左の練習キューから進行を選んでください。",
    level: "レベル",
    l1: "L1 見て弾く",
    l2: "L2 名前で弾く",
    l3: "L3 度数で弾く",
    leniency: "判定",
    easy: "ゆるい",
    normal: "ふつう",
    strict: "きびしい",
    step: "ステップ",
    flow: "フロー",
    midi: "MIDI入力",
    connected: "接続済み",
    connecting: "接続中",
    disconnected: "未接続",
    reconnect: "再接続",
    settings: "設定",
    start: "練習を開始",
    pause: "一時停止",
    resume: "再開",
    end: "終了",
    current: "いま",
    next: "つぎ",
    guide: "お手本",
    generated: "自動生成",
    source: "元MIDI",
    sourceInferred: "元MIDIから推定",
    practice: "鍵盤で記録",
    held: "押している音",
    bass: "Bass",
    partial: "あと少し",
    match: "合っています",
    wrong: "構成外の音があります",
    ready: "準備完了",
    clean: "クリーン",
    round: (value: number) => `${value}周目`,
    bpm: "BPM",
    targetTempo: (value: number) => `段位目標 ${value} BPM`,
    flowUnsupported: "フローモードは現在4/4に対応しています。ステップモードは利用できます。",
    l3NeedsKey: "L3を使うには進行のKeyを設定してください。",
    chordAsBlock: "このPhaseでは和音として押さえてください。アルペジオ練習は今後対応予定です。",
    noSound: "音源なしコントローラ向けの内蔵音源／MIDI Thruは今回の対象外です。",
    provisional: "仮クリア",
    confirmationDue: "別日確認",
    confirmed: (level: number) => `L${level} 確定`,
    stale: "進行更新・要確認",
    staleConfirm: "進行のコード内容が変更されています。この進行の練習段位を新しく開始しますか？",
    staleReset: "練習段位を現在の進行に合わせてリセットしました。",
    saved: "練習進捗を保存しました。",
    saveFailed: "練習進捗を保存できませんでした。",
    flowSuggestion: "1周完了。フローで弾いてみますか？",
    miniSummaryEmpty: "コード情報なし",
  },
  en: {
    eyebrow: "CHORD DOJO",
    title: "Turn progressions into muscle memory",
    queue: "Practice queue",
    recommended: "Recommended",
    favorite: "Favorite",
    unstarted: "Unstarted",
    confirmation: "Confirmation",
    noProgressions: "No saved chord progressions yet.",
    noMatches: "No progressions match this filter.",
    openDetail: "Open progression",
    selectPrompt: "Choose a progression from the practice queue.",
    level: "Level",
    l1: "L1 See and play",
    l2: "L2 Play by name",
    l3: "L3 Play by degree",
    leniency: "Judgement",
    easy: "Easy",
    normal: "Normal",
    strict: "Strict",
    step: "Step",
    flow: "Flow",
    midi: "MIDI input",
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Not connected",
    reconnect: "Reconnect",
    settings: "Settings",
    start: "Start practice",
    pause: "Pause",
    resume: "Resume",
    end: "End",
    current: "Now",
    next: "Next",
    guide: "Guide",
    generated: "Generated",
    source: "Source MIDI",
    sourceInferred: "Inferred from MIDI",
    practice: "Keyboard capture",
    held: "Held notes",
    bass: "Bass",
    partial: "Almost there",
    match: "Matched",
    wrong: "A foreign tone is held",
    ready: "Ready",
    clean: "Clean",
    round: (value: number) => `Round ${value}`,
    bpm: "BPM",
    targetTempo: (value: number) => `Level target ${value} BPM`,
    flowUnsupported: "Flow currently supports 4/4. Step mode is still available.",
    l3NeedsKey: "Set a key on the progression to use L3.",
    chordAsBlock: "Play the notes as a held chord in this phase. Arpeggio practice is planned later.",
    noSound: "Built-in sound and MIDI Thru for silent controllers are outside this phase.",
    provisional: "Provisional",
    confirmationDue: "Confirm another day",
    confirmed: (level: number) => `L${level} confirmed`,
    stale: "Progression changed",
    staleConfirm: "The chord content changed. Start practice progress again for the current progression?",
    staleReset: "Practice progress was reset for the current progression.",
    saved: "Practice progress saved.",
    saveFailed: "Could not save practice progress.",
    flowSuggestion: "Round complete. Try it in Flow mode?",
    miniSummaryEmpty: "No chord data",
  },
} as const;

export function PracticeView({
  ideas,
  initialTarget,
  language,
  updateProgressionBlock,
  openProgression,
  openSettings,
  setToast,
}: PracticeViewProps) {
  const text = copy[language];
  const localDate = localDateString(new Date());
  const recommendations = useMemo(
    () => recommendPracticeBlocks(ideas, localDate),
    [ideas, localDate],
  );
  const [filter, setFilter] = useState<QueueFilter>("recommended");
  const [target, setTarget] = useState<PracticeTarget | undefined>(initialTarget);
  const [level, setLevel] = useState<DojoPracticeLevel>(1);
  const [leniency, setLeniency] = useState<PracticeLeniency>("normal");
  const [mode, setMode] = useState<PracticeMode>("step");
  const [bpm, setBpm] = useState(60);
  const [session, setSession] = useState<PracticeSessionState>();
  const [beat, setBeat] = useState(1);
  const clockRef = useRef(new PracticeClock());
  const ownsMidiRef = useRef(false);
  const persistedRoundRef = useRef(0);
  const latestSessionRef = useRef<PracticeSessionState>();
  const latestBlockRef = useRef<SavedProgressionBlock>();
  const latestSelectedRef = useRef<PracticeRecommendation>();
  const active = useStore(defaultLiveMidiStore, (state) => state.active);
  const midiStatus = useStore(defaultLiveMidiStore, (state) => state.status);
  const selectedDevice = useStore(defaultLiveMidiStore, (state) => state.selected);
  const liveNotes = useStore(defaultLiveMidiStore, (state) => state.notes);
  const midiError = useStore(defaultLiveMidiStore, (state) => state.error);

  useEffect(() => {
    if (initialTarget) setTarget(initialTarget);
  }, [initialTarget]);

  useEffect(() => {
    ownsMidiRef.current = !defaultLiveMidiStore.getState().active;
    if (ownsMidiRef.current) void defaultLiveMidiStore.getState().activate();
    return () => {
      clockRef.current.stop();
      const current = latestSessionRef.current;
      const currentBlock = latestBlockRef.current;
      const currentSelected = latestSelectedRef.current;
      if (
        current
        && current.status !== "completed"
        && currentBlock
        && currentSelected
      ) {
        updateProgressionBlock(currentSelected.ideaId, currentBlock.id, {
          practice: recordPracticeRound(currentBlock, {
            level: current.level,
            bpm: current.bpm,
            targetTempo: current.targetTempo,
            consecutiveCleanFlowRounds: current.consecutiveCleanFlowRounds,
            nowIso: new Date().toISOString(),
            localDate: localDateString(new Date()),
          }),
        });
      }
      if (ownsMidiRef.current) void defaultLiveMidiStore.getState().deactivate();
    };
  }, [updateProgressionBlock]);

  const selected = recommendations.find(
    (item) => item.ideaId === target?.ideaId && item.block.id === target.blockId,
  ) ?? recommendations[0];
  const selectedIdea = selected
    ? ideas.find((idea) => idea.id === selected.ideaId)
    : undefined;
  const block = selected?.block;
  const currentTarget = block?.chords[session?.currentEventIndex ?? 0];
  const nextTarget = block && block.chords.length > 1
    ? block.chords[((session?.currentEventIndex ?? 0) + 1) % block.chords.length]
    : undefined;
  const keySignature = block?.detectedKey ?? selectedIdea?.key;
  const l3Available = Boolean(keySignature);
  const flowAvailable = !block?.timeSignature || block.timeSignature === "4/4";
  const requirements = useMemo(
    () => block?.chords.map((event) => buildPracticeChordRequirements(event.chord, leniency)) ?? [],
    [block, leniency],
  );
  const sessionContext = useMemo(
    () => ({ events: block?.chords ?? [], requirements }),
    [block?.chords, requirements],
  );
  const currentRequirement = requirements[session?.currentEventIndex ?? 0];
  const resolvedGuides = useMemo(
    () => block?.chords.map((event) => resolveVoicingForUse(
      event.chord,
      event.voicingMemory,
      voiceChordForPreview(event.chord).notes,
    )) ?? [],
    [block?.chords],
  );
  const guide = resolvedGuides[session?.currentEventIndex ?? 0];
  const keyboardRange = useMemo(
    () => computePracticeKeyboardRange(resolvedGuides.map((resolved) => resolved.midiNotes)),
    [resolvedGuides],
  );
  const filtered = recommendations.filter((item) => matchesQueueFilter(item, filter, localDate));
  const running = session?.status === "running";
  const paused = session?.status === "paused";

  useEffect(() => {
    latestSessionRef.current = session;
    latestBlockRef.current = block;
    latestSelectedRef.current = selected;
  }, [block, selected, session]);

  useEffect(() => {
    if (!running || !currentRequirement) return;
    const input = practiceInputFromLiveState(liveNotes, performance.now());
    setSession((current) => current
      ? reducePracticeSession(current, { type: "MIDI_STATE_CHANGED", input }, sessionContext)
      : current);
  }, [currentRequirement, liveNotes, running, sessionContext]);

  useEffect(() => {
    const candidate = session?.provisionalCandidate;
    if (!candidate || !running) return undefined;
    const delay = Math.max(0, candidate.sinceMs + 100 - performance.now());
    const timer = globalThis.setTimeout(() => {
      setSession((current) => current
        ? reducePracticeSession(
            current,
            { type: "STABLE_DEADLINE", nowMs: performance.now() },
            sessionContext,
          )
        : current);
    }, delay);
    return () => globalThis.clearTimeout(timer);
  }, [running, session?.provisionalCandidate, sessionContext]);

  useEffect(() => {
    if (midiStatus !== "disconnected" && midiStatus !== "error") return;
    clockRef.current.pause();
    setSession((current) => current
      ? reducePracticeSession(current, { type: "DEVICE_DISCONNECTED" }, sessionContext)
      : current);
  }, [midiStatus, sessionContext]);

  useEffect(() => {
    if (
      !block
      || session?.mode !== "flow"
      || !session.lastRoundWasClean
      || session.roundNumber <= persistedRoundRef.current
    ) return;
    persistedRoundRef.current = session.roundNumber;
    persistProgress(block, session);
  }, [block, session]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      const element = event.target as HTMLElement | null;
      if (element?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setSession((current) => {
          if (!current || current.status === "running") return current;
          const delta = event.key === "ArrowLeft" ? -1 : 1;
          return {
            ...current,
            currentEventIndex: Math.max(
              0,
              Math.min(current.eventResults.length - 1, current.currentEventIndex + delta),
            ),
          };
        });
      } else if (event.key === "Escape") {
        setSession((current) => {
          if (!current || current.status !== "running") return current;
          clockRef.current.pause();
          return reducePracticeSession(current, { type: "PAUSE" }, sessionContext);
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sessionContext]);

  function selectRecommendation(item: PracticeRecommendation) {
    endSession();
    setTarget({ ideaId: item.ideaId, blockId: item.block.id });
    const confirmed = item.block.practice?.confirmedLevel;
    const suggested = confirmed && confirmed < 3 ? (confirmed + 1) as DojoPracticeLevel : 1;
    setLevel(item.stale ? 1 : suggested);
    setBpm(Math.min(60, targetTempoFor(item.block)));
    setSession(undefined);
  }

  async function startSession() {
    if (!selected || !block || block.chords.length === 0) return;
    if (practiceProgressState(block, localDate) === "stale") {
      if (!globalThis.confirm(text.staleConfirm)) return;
      if (!updateProgressionBlock(selected.ideaId, block.id, { practice: resetPracticeProgress(block) })) {
        setToast(text.saveFailed);
        return;
      }
      setToast(text.staleReset);
    }
    if (!defaultLiveMidiStore.getState().active) {
      ownsMidiRef.current = true;
      await defaultLiveMidiStore.getState().activate();
    }
    playbackController.stop();
    const next = createPracticeSessionState({
      blockId: block.id,
      progressionFingerprint: progressionFingerprint(block),
      level,
      mode,
      leniency,
      bpm,
      targetTempo: targetTempoFor(block),
      eventCount: block.chords.length,
    });
    persistedRoundRef.current = 0;
    setSession(reducePracticeSession(next, { type: "START_SESSION" }, sessionContext));
    if (mode === "flow") {
      await clockRef.current.start({
        events: block.chords,
        bpm,
        beatsPerBar: 4,
        callbacks: {
          onTargetOpen: (eventIndex) => setSession((current) => current
            ? reducePracticeSession(current, { type: "FLOW_TARGET_OPEN", eventIndex }, sessionContext)
            : current),
          onTargetClose: (eventIndex) => setSession((current) => current
            ? reducePracticeSession(current, { type: "FLOW_TARGET_CLOSE", eventIndex }, sessionContext)
            : current),
          onRoundCompleted: () => setSession((current) => current
            ? reducePracticeSession(current, { type: "ROUND_COMPLETED" }, sessionContext)
            : current),
          onBeat: setBeat,
        },
      });
    }
  }

  function pauseSession() {
    clockRef.current.pause();
    setSession((current) => current
      ? reducePracticeSession(current, { type: "PAUSE" }, sessionContext)
      : current);
  }

  function resumeSession() {
    clockRef.current.resume();
    setSession((current) => current
      ? reducePracticeSession(current, { type: "RESUME" }, sessionContext)
      : current);
  }

  function endSession(save = true) {
    clockRef.current.stop();
    if (save && block && session) persistProgress(block, session);
    setSession((current) => current
      ? reducePracticeSession(current, { type: "END_SESSION" }, sessionContext)
      : current);
  }

  function persistProgress(targetBlock: SavedProgressionBlock, current: PracticeSessionState) {
    if (!selected) return;
    const practice = recordPracticeRound(targetBlock, {
      level: current.level,
      bpm: current.bpm,
      targetTempo: current.targetTempo,
      consecutiveCleanFlowRounds: current.consecutiveCleanFlowRounds,
      nowIso: new Date().toISOString(),
      localDate: localDateString(new Date()),
    });
    if (updateProgressionBlock(selected.ideaId, targetBlock.id, { practice })) {
      setToast(text.saved);
    } else {
      setToast(text.saveFailed);
    }
  }

  async function reconnectMidi() {
    const store = defaultLiveMidiStore.getState();
    if (!store.active) {
      ownsMidiRef.current = true;
      await store.activate();
      return;
    }
    await store.refreshDevices();
    const refreshed = defaultLiveMidiStore.getState();
    const preferred = refreshed.preferences.preferredInput;
    const device = refreshed.devices.find((candidate) => (
      candidate.backendId === preferred?.backendId
      || candidate.name === preferred?.name
    ));
    if (device) await refreshed.selectDevice(device.backendId);
  }

  return (
    <div className="py-5">
      <div className="border-b border-[var(--lv-border)] pb-4">
        <p className="text-xs font-semibold uppercase text-[var(--lv-accent)]">{text.eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold text-[var(--lv-text)]">{text.title}</h2>
      </div>

      <div className="grid min-h-[36rem] gap-0 border-x border-b border-[var(--lv-border)] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border-b border-[var(--lv-border)] bg-[var(--lv-surface)] lg:border-b-0 lg:border-r">
          <div className="border-b border-[var(--lv-border)] p-3">
            <div className="flex items-center gap-2">
              <Dumbbell aria-hidden="true" size={16} className="text-[var(--lv-accent)]" />
              <h3 className="text-sm font-semibold">{text.queue}</h3>
            </div>
            <select
              className="lv-input mt-3 w-full text-sm"
              value={filter}
              onChange={(event) => setFilter(event.target.value as QueueFilter)}
              aria-label={text.queue}
            >
              <option value="recommended">{text.recommended}</option>
              <option value="favorite">{text.favorite}</option>
              <option value="unstarted">{text.unstarted}</option>
              <option value="confirmation">{text.confirmation}</option>
              <option value="l1">L1</option>
              <option value="l2">L2</option>
              <option value="l3">L3</option>
            </select>
          </div>
          <div className="max-h-[37rem] overflow-y-auto">
            {recommendations.length === 0 ? (
              <p className="p-4 text-sm text-[var(--lv-text-muted)]">{text.noProgressions}</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-[var(--lv-text-muted)]">{text.noMatches}</p>
            ) : filtered.map((item) => (
              <QueueItem
                key={`${item.ideaId}:${item.block.id}`}
                item={item}
                active={selected?.ideaId === item.ideaId && selected.block.id === item.block.id}
                localDate={localDate}
                language={language}
                onClick={() => selectRecommendation(item)}
              />
            ))}
          </div>
        </aside>

        <section className="min-w-0 bg-[var(--lv-bg)] p-4 sm:p-6">
          {!selected || !block ? (
            <div className="grid min-h-80 place-items-center text-sm text-[var(--lv-text-muted)]">
              {text.selectPrompt}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--lv-border)] pb-4">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--lv-text-muted)]">{selected.ideaTitle}</p>
                  <h3 className="mt-1 truncate text-lg font-semibold">{block.summaryText}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <PracticeBadge block={block} localDate={localDate} language={language} />
                    {block.pinned ? (
                      <span className="inline-flex items-center gap-1 border border-[var(--lv-border)] px-2 py-1 text-xs">
                        <Heart aria-hidden="true" size={16} /> {text.favorite}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  className="lv-button-ghost px-3 py-2 text-sm"
                  onClick={() => openProgression(selected.ideaId, block.id)}
                >
                  {text.openDetail}
                </button>
              </div>

              <div className="grid gap-4 border-b border-[var(--lv-border)] py-4 xl:grid-cols-[1fr_auto_auto]">
                <div>
                  <p className="mb-2 text-xs font-semibold text-[var(--lv-text-muted)]">{text.level}</p>
                  <div className="flex flex-wrap gap-1">
                    {([1, 2, 3] as const).map((value) => (
                      <button
                        key={value}
                        className={segmentClass(level === value)}
                        disabled={running || (value === 3 && !l3Available)}
                        title={value === 3 && !l3Available ? text.l3NeedsKey : undefined}
                        onClick={() => setLevel(value)}
                      >
                        {value === 1 ? text.l1 : value === 2 ? text.l2 : text.l3}
                      </button>
                    ))}
                  </div>
                  {!l3Available ? <p className="mt-2 text-xs text-amber-200">{text.l3NeedsKey}</p> : null}
                </div>
                <label className="text-xs font-semibold text-[var(--lv-text-muted)]">
                  {text.leniency}
                  <select
                    className="lv-input mt-2 block min-w-28 text-sm"
                    value={leniency}
                    disabled={running}
                    onChange={(event) => setLeniency(event.target.value as PracticeLeniency)}
                  >
                    <option value="easy">{text.easy}</option>
                    <option value="normal">{text.normal}</option>
                    <option value="strict">{text.strict}</option>
                  </select>
                </label>
                <div>
                  <p className="mb-2 text-xs font-semibold text-[var(--lv-text-muted)]">Mode</p>
                  <div className="flex gap-1">
                    <button className={segmentClass(mode === "step")} disabled={running} onClick={() => setMode("step")}>
                      {text.step}
                    </button>
                    <button
                      className={segmentClass(mode === "flow")}
                      disabled={running || !flowAvailable}
                      title={!flowAvailable ? text.flowUnsupported : undefined}
                      onClick={() => setMode("flow")}
                    >
                      {text.flow}
                    </button>
                  </div>
                </div>
              </div>

              {!flowAvailable ? (
                <p className="border-b border-[var(--lv-border)] py-3 text-sm text-amber-200">{text.flowUnsupported}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 border-b border-[var(--lv-border)] py-4">
                <span className="text-xs font-semibold text-[var(--lv-text-muted)]">{text.midi}</span>
                <span className={`inline-flex items-center gap-1.5 text-sm ${
                  midiStatus === "connected" ? "text-teal-200" : "text-amber-200"
                }`}>
                  <span className={`h-2 w-2 rounded-full ${
                    midiStatus === "connected" ? "bg-teal-300" : "bg-amber-300"
                  }`} />
                  {midiStatus === "connected"
                    ? `${text.connected}${selectedDevice ? ` · ${selectedDevice.name}` : ""}`
                    : midiStatus === "connecting"
                      ? text.connecting
                      : text.disconnected}
                </span>
                {midiError ? <span className="text-xs text-amber-200">{midiError}</span> : null}
                <button
                  className="lv-button-ghost ml-auto inline-flex h-9 items-center gap-2 px-3 text-sm"
                  onClick={() => void reconnectMidi()}
                >
                  <RefreshCw aria-hidden="true" size={16} /> {text.reconnect}
                </button>
                <button
                  className="lv-button-ghost inline-flex h-9 items-center gap-2 px-3 text-sm"
                  onClick={openSettings}
                >
                  <Settings aria-hidden="true" size={16} /> {text.settings}
                </button>
              </div>

              <div className="py-5">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[var(--lv-accent)]">{text.current}</p>
                    <p className="mt-2 text-3xl font-semibold">
                      {currentTarget
                        ? level === 3
                          ? degreeOf(currentTarget.chord, keySignature)?.label ?? "-"
                          : currentTarget.chord.label
                        : "-"}
                    </p>
                    <div className="mt-3 flex items-baseline gap-2 text-sm text-[var(--lv-text-muted)]">
                      <span className="text-xs font-semibold uppercase">{text.next}</span>
                      <span>{nextTarget
                        ? level === 3
                          ? degreeOf(nextTarget.chord, keySignature)?.label ?? "-"
                          : nextTarget.chord.label
                        : "-"}</span>
                    </div>
                  </div>
                  <div className="flex h-fit flex-wrap items-center gap-x-3 gap-y-1 border-l border-[var(--lv-border)] pl-4 text-sm">
                    <span className="font-semibold">{text.round(session?.roundNumber ?? 1)}</span>
                    {mode === "flow" ? <span>{text.bpm} {bpm} · Beat {beat}</span> : null}
                    <span className="text-[var(--lv-text-muted)]">{text.clean} {session?.consecutiveCleanFlowRounds ?? 0}/2</span>
                  </div>
                </div>

                {level === 1 && guide ? (
                  <div className="mt-4 border border-[var(--lv-border)] bg-[var(--lv-surface)] px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--lv-text-muted)]">{text.guide}</p>
                      <span className="border border-[var(--lv-border)] px-2 py-1 text-xs text-[var(--lv-text-muted)]">
                        {guide.origin === "practice-override"
                          ? text.practice
                          : guide.origin === "source-verified"
                            ? text.source
                            : guide.origin === "source-auto"
                              ? text.sourceInferred
                            : text.generated}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm">
                      {guide.midiNotes
                        .map((note) => formatMidiNoteForDisplay(note, "fl-studio", "flat"))
                        .join(" · ")}
                    </p>
                  </div>
                ) : null}

                <div className="mt-4">
                  <PracticeKeyboard
                    range={keyboardRange}
                    guideNotes={guide?.midiNotes ?? []}
                    allowedPitchClasses={currentRequirement?.allowedPitchClasses ?? []}
                    requiredPitchClasses={currentRequirement?.requiredPitchClasses ?? []}
                    level={level}
                    language={language}
                    matchState={session?.lastMatch?.state}
                  />
                </div>

                <div className="mt-3 flex min-h-10 items-center gap-3 border-y border-[var(--lv-border)] py-2.5">
                  <MatchState state={session?.lastMatch?.state} text={text} />
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  {mode === "flow" ? (
                    <label className="text-xs font-semibold text-[var(--lv-text-muted)]">
                      {text.bpm}
                      <input
                        className="lv-input mt-2 block w-24 text-sm"
                        type="number"
                        min={40}
                        max={300}
                        value={bpm}
                        disabled={running}
                        onChange={(event) => setBpm(Math.max(40, Math.min(300, Number(event.target.value))))}
                      />
                    </label>
                  ) : null}
                  <span className="pb-2 text-xs text-[var(--lv-text-muted)]">{text.targetTempo(targetTempoFor(block))}</span>
                  <div className="ml-auto flex gap-2">
                    {!running && !paused ? (
                      <button
                        className="lv-button-primary inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold"
                        disabled={!active || midiStatus !== "connected" || block.chords.length === 0}
                        onClick={() => void startSession()}
                      >
                        <Play aria-hidden="true" size={16} /> {text.start}
                      </button>
                    ) : null}
                    {running ? (
                      <button className="lv-button-ghost inline-flex h-10 items-center gap-2 px-4 text-sm" onClick={pauseSession}>
                        <Pause aria-hidden="true" size={16} /> {text.pause}
                      </button>
                    ) : null}
                    {paused ? (
                      <button className="lv-button-primary inline-flex h-10 items-center gap-2 px-4 text-sm" onClick={resumeSession}>
                        <Play aria-hidden="true" size={16} /> {text.resume}
                      </button>
                    ) : null}
                    {session && session.status !== "completed" ? (
                      <button className="lv-button-ghost inline-flex h-10 items-center gap-2 px-4 text-sm" onClick={() => endSession()}>
                        <Square aria-hidden="true" size={16} /> {text.end}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-4 text-xs text-[var(--lv-text-muted)]">{text.chordAsBlock}</p>
                <p className="mt-1 text-xs text-[var(--lv-text-muted)]">{text.noSound}</p>
                {session?.lastRoundWasClean && mode === "step" ? (
                  <p className="mt-3 text-sm text-teal-200">{text.flowSuggestion}</p>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function QueueItem({
  item,
  active,
  localDate,
  language,
  onClick,
}: {
  item: PracticeRecommendation;
  active: boolean;
  localDate: string;
  language: AppLanguage;
  onClick: () => void;
}) {
  const state = practiceProgressState(item.block, localDate);
  return (
    <button
      className={`w-full border-b border-[var(--lv-border)] p-3 text-left ${
        active ? "bg-[var(--lv-surface-raised)]" : "hover:bg-[var(--lv-surface-raised)]"
      }`}
      onClick={onClick}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{item.ideaTitle}</span>
        {item.favorite ? <Heart aria-hidden="true" size={16} className="shrink-0 text-amber-200" /> : null}
      </span>
      <span className="mt-1 block truncate text-xs text-[var(--lv-text-muted)]">
        {item.block.chords.slice(0, 4).map((event) => event.chord.label).join(" · ") || copy[language].miniSummaryEmpty}
      </span>
      <span className={`mt-2 inline-flex border px-1.5 py-0.5 text-[10px] ${
        state === "confirmation-due"
          ? "border-teal-500 text-teal-200"
          : state === "stale"
            ? "border-amber-500 text-amber-200"
            : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"
      }`}>
        {stateLabel(item.block, state, language)}
      </span>
    </button>
  );
}

function PracticeBadge({
  block,
  localDate,
  language,
}: {
  block: SavedProgressionBlock;
  localDate: string;
  language: AppLanguage;
}) {
  const state = practiceProgressState(block, localDate);
  const outlined = state === "provisional" || state === "confirmation-due";
  return (
    <span className={`inline-flex items-center gap-1 border px-2 py-1 text-xs ${
      state === "stale"
        ? "border-amber-500 text-amber-200"
        : outlined
          ? "border-teal-400 text-teal-200"
          : state === "confirmed"
            ? "border-teal-300 bg-teal-300 text-black"
            : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"
    }`}>
      {state === "stale" ? <AlertTriangle aria-hidden="true" size={16} /> : null}
      {state === "confirmed" ? <Check aria-hidden="true" size={16} /> : null}
      {stateLabel(block, state, language)}
    </span>
  );
}

function MatchState({
  state,
  text,
}: {
  state: PracticeSessionState["lastMatch"] extends infer _Value
    ? "empty" | "partial" | "match" | "wrong" | undefined
    : never;
  text: typeof copy.ja | typeof copy.en;
}) {
  const label = state === "match"
    ? text.match
    : state === "wrong"
      ? text.wrong
      : state === "partial"
        ? text.partial
        : text.ready;
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${
      state === "match" ? "text-teal-200" : state === "wrong" ? "text-amber-200" : "text-[var(--lv-text-secondary)]"
    }`}>
      {state === "match" ? <Check aria-hidden="true" size={16} /> : null}
      {state === "wrong" ? <AlertTriangle aria-hidden="true" size={16} /> : null}
      {label}
    </span>
  );
}

function stateLabel(
  block: SavedProgressionBlock,
  state: ReturnType<typeof practiceProgressState>,
  language: AppLanguage,
): string {
  const text = copy[language];
  if (state === "stale") return text.stale;
  if (state === "confirmation-due") return text.confirmationDue;
  if (state === "provisional") return text.provisional;
  if (state === "confirmed") return text.confirmed(block.practice?.confirmedLevel ?? 1);
  return text.unstarted;
}

function matchesQueueFilter(
  item: PracticeRecommendation,
  filter: QueueFilter,
  localDate: string,
): boolean {
  const state = practiceProgressState(item.block, localDate);
  if (filter === "recommended") return true;
  if (filter === "favorite") return item.favorite;
  if (filter === "unstarted") return state === "unstarted";
  if (filter === "confirmation") return state === "confirmation-due";
  const targetLevel = Number(filter.slice(1));
  return item.block.practice?.confirmedLevel === targetLevel
    || item.block.practice?.provisional?.level === targetLevel;
}

function segmentClass(active: boolean): string {
  return active
    ? "rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-40"
    : "rounded border border-[var(--lv-border)] px-3 py-2 text-sm text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)] disabled:opacity-40";
}

function targetTempoFor(block: SavedProgressionBlock): number {
  return block.bpm ? Math.max(60, Math.round(block.bpm * 0.7)) : 60;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
