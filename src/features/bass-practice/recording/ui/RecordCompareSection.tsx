import { EchoRail } from "../../ui/EchoPracticeFrame";
import type { RecordingTake } from "../application/ports";
import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { Button, Select } from "../../../../components/ui";
import { isBassPracticeRecordCompareEnabled } from "../../application/featureFlag";
import type { ChannelMode } from "../domain/types";
import { useRecordCompareSession } from "./useRecordCompareSession";
import { useRecordChannel } from "../application/recordChannelStore";
import type { RecordingSessionController } from "../application/recordingSessionController";
import { BrowserTakePlayer, type PlaybackHandle, type TakePlayer, type TargetPlayer } from "../application/playback";
import { RetainedTakesPanel } from "./RetainedTakesPanel";
import type { PersistentRecordingTakeRepository } from "../application/recordingStore";

/**
 * Shared Record & Compare panel for all three Echo modes (P5.17-02). It is
 * additive and opt-in: it renders only when the feature flag is on, does nothing
 * (beyond a compact opt-in) until the user chooses to record, and requests
 * microphone permission only on enable — so the initial practice screen is
 * unchanged. Legacy modes remain a mirror for self-review with no analysis. MIDI bass
 * alone can observe an explicitly completed take for local post-record feedback.
 *
 * Target and My Take never play at once, and reaching Review without hearing My
 * Take forces an explicit hear-or-skip choice (contract 01).
 */

export interface MidiRecordingCommands { start(): void; stop(): void; playTake(): void; playOverlay(): void; keep(): void; }

export interface RecordCompareSectionProps {
  readonly midiRecording?: { statusText?: string; durationMs: number; startOffsetMs?: () => number; commands: MutableRefObject<MidiRecordingCommands | null>; onCompleted: (take: RecordingTake) => void; onCanceled: () => void; onCountIn?: () => void; };
  readonly mode: "degree" | "rhythm" | "bassline" | "root-motion" | "midi-bassline";
  /** Stable exercise signature; changing it resets the recorder for a new take. */
  readonly resetKey?: string;
  /** Practice session id recorded in kept-take metadata (non-identifying). */
  readonly practiceSessionId?: string;
  /** Plays the exercise Target; when omitted, Hear Target is unavailable. */
  readonly targetPlayer?: TargetPlayer;
  /** Lets an owning practice surface release unrelated accompaniment before target/take playback. */
  readonly onPlaybackStart?: () => void;
  /** Preloads optional accompaniment only; it must not schedule audible playback. */
  readonly onRecordingPrepare?: () => boolean | void | Promise<boolean | void>;
  /** Schedules optional accompaniment at the confirmed recording boundary; it is never routed into capture. */
  readonly onRecordingStart?: () => boolean | void | Promise<boolean | void>;
  /** Stops optional accompaniment when recording is stopped, discarded, reset, or unmounted. */
  readonly onRecordingStop?: () => void;
  /** Reports whether count-in/capture is live so owning controls can remain stable. */
  readonly onRecordingActivityChange?: (active: boolean) => void;
  /** Receives the opaque id returned by the existing P5.17 take repository. */
  readonly onTakeKept?: (retainedTakeReference: string) => void;
  /** Reports a successfully recorded but not-yet-kept ephemeral take. */
  readonly onUnkeptTakeChange?: (hasUnkeptTake: boolean) => void;
  /** Milliseconds of count-in before recording starts (0 = immediate). */
  readonly countInMs?: number;
  /** Disables only new recording start; retained takes and playback stay available. */
  readonly recordStartDisabledReason?: string;
  /** Injected in tests. */
  readonly controller?: RecordingSessionController;
  readonly takePlayer?: TakePlayer;
  /** Injected only to make retained-take availability independently testable. */
  readonly retainedTakeRepository?: PersistentRecordingTakeRepository;
  readonly enabledOverride?: boolean;
  readonly isTypeSupported?: (mimeType: string) => boolean;
}

const CHANNELS: readonly { readonly value: ChannelMode; readonly label: Record<"ja", string> }[] = [
  { value: "auto", label: { ja: "自動" } },
  { value: "left", label: { ja: "左 / 入力1" } },
  { value: "right", label: { ja: "右 / 入力2" } },
  { value: "mono-sum", label: { ja: "モノラル合成" } },
];

const RECORD_COMPARE_COPY = {
  ja: {
    description: "自分の演奏を録音してお手本と聴き比べできます。ローカルのみで、自動採点や分析は行いません。",
    headphones: "録音中に伴奏を鳴らす場合は、スピーカー音の回り込みを減らすためヘッドホンを使用してください。アプリの音は録音へ内部ミックスされません。",
    enable: "Record & Compareを使う", optional: "使わない場合は録音せずそのまま続けられます",
    permissionDenied: "マイクの使用が許可されませんでした。録音せずに続けられます。", recordingError: "録音を利用できませんでした。これまでどおり自己評価を続けられます。",
    saveFailed: "保存できませんでしたが、この録音は再生できます。", inputChannel: "入力チャンネル", countingIn: "カウントイン中…", cancel: "キャンセル",
    listenChoice: "レビューへ進む前に、自分のテイクを聴くか聴き返しをスキップしてください。", hearTake: "自分のテイクを聴く", skipListen: "聴き返しをスキップ",
    start: "演奏 / 録音", stop: "停止", hearTarget: "お手本を聴く", retake: "録り直す", discard: "破棄", keep: "テイクを保持", skipRecord: "録音せず続ける",
    privacy: "ローカル保存のみ・クラウド送信なし・自動分析や採点はありません。",
  },
} as const;

export function RecordCompareSection({
  mode,
  midiRecording,
  resetKey,
  practiceSessionId,
  targetPlayer,
  onPlaybackStart,
  onRecordingPrepare,
  onRecordingStart,
  onRecordingStop,
  onRecordingActivityChange,
  onTakeKept,
  onUnkeptTakeChange,
  countInMs = 0,
  recordStartDisabledReason,
  controller,
  takePlayer,
  retainedTakeRepository,
  enabledOverride,
  isTypeSupported,
}: RecordCompareSectionProps) {
  const enabled = enabledOverride ?? isBassPracticeRecordCompareEnabled();
  const copy = mode === "midi-bassline" ? { ...RECORD_COMPARE_COPY.ja, description:"この練習だけ、録音が終わってから音の高さとタイミングを端末内で確かめます。録音は「残す」を押すまで保存しません。", privacy:"ローカルのみ・クラウド送信なし。録音後の判定は目安です。", start:"録って弾く", retake:"もう一度録る", keep:"残す" } : RECORD_COMPARE_COPY.ja;
  const [optedIn, setOptedIn] = useState(false);
  const [listenBackSkipped, setListenBackSkipped] = useState(false);
  const [preparingRecording, setPreparingRecordingState] = useState(false);
  const [channel, setChannel] = useRecordChannel();
  const [midiRetryGeneration, setMidiRetryGeneration] = useState(0);
  const midiRetryPending = useRef(false);
  const session = useRecordCompareSession({
    controllerFactory: controller ? () => controller : undefined,
    isTypeSupported,
    resetKey: mode === "midi-bassline" ? `${resetKey ?? mode}:retry:${midiRetryGeneration}` : resetKey,
  });
  const sessionStatus = session.state?.status ?? "idle";
  // A new interval owns a fresh idle controller, not the preceding opt-in.
  useEffect(() => { if (mode === "midi-bassline") setOptedIn(false); }, [mode, resetKey]);
  // Push the shared channel into the controller whenever it can accept it, so
  // Practice Settings and the panel stay in sync without racing live capture.
  useEffect(() => {
    try {
      session.setChannel(channel);
    } catch {
      /* not a channel-pickable state right now; re-applied on the next change */
    }
    // session delegates to the live controller; only channel/status drive this.
  }, [channel, sessionStatus]);
  const playerRef = useRef<TakePlayer>(takePlayer ?? new BrowserTakePlayer());
  const overlayGeneration = useRef(0);
  const enablingRef = useRef(false);
  const activePlaybackRef = useRef<PlaybackHandle | null>(null);
  const midiTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const midiRef = useRef(midiRecording); midiRef.current = midiRecording;
  const [inputLevel, setInputLevel] = useState(0);
  const countInTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onRecordingStopRef = useRef(onRecordingStop);
  const onRecordingActivityRef = useRef(onRecordingActivityChange);
  const onUnkeptTakeRef = useRef(onUnkeptTakeChange);
  const recordingActivityRef = useRef(false);
  const preparingRecordingRef = useRef(false);
  const unkeptTakeRef = useRef(false);
  const recordingGenerationRef = useRef(0);
  useEffect(() => { onRecordingStopRef.current = onRecordingStop; }, [onRecordingStop]);
  useEffect(() => { onRecordingActivityRef.current = onRecordingActivityChange; }, [onRecordingActivityChange]);
  useEffect(() => { onUnkeptTakeRef.current = onUnkeptTakeChange; }, [onUnkeptTakeChange]);

  const stopPlayback = () => {
    overlayGeneration.current += 1;
    activePlaybackRef.current?.stop();
    activePlaybackRef.current = null;
  };
  const notifyPlaybackStart = () => {
    try { onPlaybackStart?.(); } catch { /* An owning surface cannot break Record & Compare playback. */ }
  };
  const clearCountIn = () => {
    if (midiTimerRef.current !== undefined) { clearTimeout(midiTimerRef.current); midiTimerRef.current = undefined; }
    if (countInTimerRef.current !== undefined) {
      clearTimeout(countInTimerRef.current);
      countInTimerRef.current = undefined;
    }
  };

  const stopRecordingAccompaniment = () => {
    try { onRecordingStopRef.current?.(); } catch { /* Optional playback must not affect capture cleanup. */ }
  };
  const setRecordingActivity = (active: boolean) => {
    if (recordingActivityRef.current === active) return;
    recordingActivityRef.current = active;
    try { onRecordingActivityRef.current?.(active); } catch { /* Owning controls must not break capture cleanup. */ }
  };
  const setPreparingRecording = (preparing: boolean) => {
    if (preparingRecordingRef.current === preparing) return;
    preparingRecordingRef.current = preparing;
    setPreparingRecordingState(preparing);
  };
  const setUnkeptTake = (hasUnkeptTake: boolean) => {
    if (unkeptTakeRef.current === hasUnkeptTake) return;
    unkeptTakeRef.current = hasUnkeptTake;
    try { onUnkeptTakeRef.current?.(hasUnkeptTake); } catch { /* History state cannot break recorder cleanup. */ }
  };

  useEffect(() => () => {
    recordingGenerationRef.current += 1;
    setPreparingRecording(false);
    setRecordingActivity(false);
    setUnkeptTake(false);
    stopPlayback();
    clearCountIn();
    stopRecordingAccompaniment();
  }, []);


  useEffect(() => {
    if (recordingActivityRef.current && !preparingRecordingRef.current && !isLiveCaptureStatus(sessionStatus)) {
      stopRecordingAccompaniment();
      setRecordingActivity(false);
    }
    const hasUnkeptTake = session.currentTake() !== undefined
      && sessionStatus !== "saved" && sessionStatus !== "discarded";
    setUnkeptTake(hasUnkeptTake);
  }, [session, sessionStatus]);

  useEffect(() => {
    if (mode !== "midi-bassline" || sessionStatus !== "recording") { setInputLevel(0); return; }
    const timer = setInterval(() => setInputLevel(session.inputLevel()), 80); return () => clearInterval(timer);
  }, [mode, sessionStatus]);
  useEffect(() => {
    if (!midiRecording || !enabled) return;
    midiRecording.commands.current = {
      start: () => { if (controlsLocked || preparingRecordingRef.current || enablingRef.current || recordStartDisabledReason) return;
        if (mode === "midi-bassline" && ["discarded", "error", "permission-denied", "device-missing"].includes(sessionStatus)) {
          // Keep terminal status visible until the user retries, then recreate
          // through the existing hook lifecycle and reuse the first-start path.
          if (midiRetryPending.current) return;
          setOptedIn(false); midiRetryPending.current = true;
          setMidiRetryGeneration(generation => generation + 1); return;
        }
        if (status === "recorded" || status === "saved") session.retake(); if (!optedIn) { setOptedIn(true); enablingRef.current = true; void session.enable().then(beginRecordingFlow).catch(() => undefined).finally(() => { enablingRef.current = false; }); } else if (sessionStatus === "ready" || sessionStatus === "recorded" || sessionStatus === "saved") beginRecordingFlow(); },
      stop: () => { cancelCountIn(); stopRecording(); midiRef.current?.onCanceled(); },
      playTake: hearTake,
      playOverlay: () => {
        const take = session.currentTake(); if (!take || !targetPlayer || controlsLocked) return;
        notifyPlaybackStart(); stopPlayback(); const generation = overlayGeneration.current;
        void (async () => {
          if (targetPlayer.prepare && !(await targetPlayer.prepare())) return;
          if (generation !== overlayGeneration.current) return;
          const target = targetPlayer.play(() => undefined);
          const own = playerRef.current.play(take, () => { target.stop(); session.playbackEnded(); }, target.audioDelayMs);
          session.playTake(); activePlaybackRef.current = { stop() { own.stop(); target.stop(); } };
        })().catch(() => { if (generation === overlayGeneration.current) session.playbackEnded(); });
      },
      keep: () => { void session.keep({ practiceSessionId:practiceSessionId??"midi-bass", exerciseSignature:resetKey??"midi-bass",mode,inputDeviceName:"Input",playedBackBeforeReview:session.state?.heardTake??false }).catch(()=>undefined); },
    };
    return () => { midiRecording.commands.current = null; };
  });
  const status = session.state?.status ?? "idle";
  const controlsLocked = preparingRecording || isLiveCaptureStatus(status);
  useEffect(() => {
    if (mode === "midi-bassline" && midiRetryPending.current && sessionStatus === "idle") {
      midiRetryPending.current = false;
      midiRecording?.commands.current?.start();
    }
  }, [mode, midiRecording, sessionStatus]);

  if (!enabled) return null;

  const beginRecordingFlow = () => {
    setListenBackSkipped(false);
    clearCountIn();
    const generation = recordingGenerationRef.current + 1;
    recordingGenerationRef.current = generation;
    setRecordingActivity(true);
    setPreparingRecording(true);
    void (async () => {
      let prepared: boolean;
      try {
        const prepareResult = await onRecordingPrepare?.();
        prepared = prepareResult !== false;
      } catch {
        prepared = false;
      }
      if (!prepared || recordingGenerationRef.current !== generation) {
        stopRecordingAccompaniment();
        setPreparingRecording(false);
        setRecordingActivity(false);
        return;
      }
      try {
        session.startCountIn();
        midiRef.current?.onCountIn?.();
        setPreparingRecording(false);
      } catch {
        stopRecordingAccompaniment();
        setPreparingRecording(false);
        setRecordingActivity(false);
        return;
      }
      const beginRecording = () => {
        void (async () => {
          let started;
          try {
            started = await session.record();
          } catch {
            stopRecordingAccompaniment();
            setRecordingActivity(false);
            return;
          }
          if (started?.status !== "recording" || recordingGenerationRef.current !== generation) {
            stopRecordingAccompaniment();
            setRecordingActivity(false);
            return;
          }
          try {
            await onRecordingStart?.();
          } catch {
            // Capture is already live. Keep controls locked until its normal stop path.
            stopRecordingAccompaniment();
            return;
          }
          if (recordingGenerationRef.current !== generation) { stopRecordingAccompaniment(); return; }
          const midi = midiRef.current;
          if (mode === "midi-bassline" && midi) midiTimerRef.current = setTimeout(() => {
            midiTimerRef.current = undefined;
            if (recordingGenerationRef.current !== generation) return;
            stopRecordingAccompaniment();
            void session.stop().then(() => { if (recordingGenerationRef.current !== generation) return; const take = session.currentTake(); if (take) midiRef.current?.onCompleted(take); }).catch(() => setRecordingActivity(false));
          }, midi.durationMs + (midi.startOffsetMs?.() ?? 0));
        })();
      };
      if (countInMs > 0) {
        countInTimerRef.current = setTimeout(() => {
          countInTimerRef.current = undefined;
          if (recordingGenerationRef.current === generation) beginRecording();
        }, countInMs);
      } else {
        beginRecording();
      }
    })();
  };
  const startRecording = () => {
    runRecordStartGuard(recordStartDisabledReason, beginRecordingFlow);
  };

  const cancelCountIn = () => {
    recordingGenerationRef.current += 1;
    clearCountIn();
    stopRecordingAccompaniment();
    setPreparingRecording(false);
    if (session.state?.status === "counting-in") session.cancelCountIn();
    setRecordingActivity(false);
  };

  const stopRecording = () => {
    if (mode === "midi-bassline") midiRef.current?.onCanceled();
    recordingGenerationRef.current += 1;
    clearCountIn();
    stopRecordingAccompaniment();
    if (preparingRecordingRef.current) {
      setPreparingRecording(false);
      setRecordingActivity(false);
      return;
    }
    if (session.state?.status !== "recording" && session.state?.status !== "starting") {
      setRecordingActivity(false);
      return;
    }
    void session.stop().catch(() => {
      setRecordingActivity(false);
    });
  };

  const hearTarget = () => {
    if (!targetPlayer) return;
    notifyPlaybackStart();
    stopPlayback();
    session.playTarget();
    const play = () => { activePlaybackRef.current = targetPlayer.play(() => {
      activePlaybackRef.current = null; session.playbackEnded();
    }); };
    if (targetPlayer.prepare) { const generation=overlayGeneration.current; void targetPlayer.prepare().then(ready=>{if(ready&&generation===overlayGeneration.current)play();}).catch(()=>session.playbackEnded()); } else play();
  };

  const hearTake = () => {
    const take = session.currentTake();
    if (!take) return;
    notifyPlaybackStart();
    stopPlayback();
    session.playTake();
    activePlaybackRef.current = playerRef.current.play(take, () => {
      activePlaybackRef.current = null;
      session.playbackEnded();
    });
  };

  const retake = () => {
    recordingGenerationRef.current += 1;
    stopPlayback();
    clearCountIn();
    stopRecordingAccompaniment();
    setRecordingActivity(false);
    setListenBackSkipped(false);
    session.retake();
  };

  const discard = () => {
    recordingGenerationRef.current += 1;
    stopPlayback();
    stopRecordingAccompaniment();
    setRecordingActivity(false);
    session.discard();
  };

  // MIDI presents a recording-status rail. Capture is still enabled lazily by
  // the existing bottom-bar command, so rendering never requests a microphone.
  if (mode === "midi-bassline") {
    return <EchoRail><section aria-label="録音" data-testid="record-compare" data-record-mode={mode} data-record-state={preparingRecording ? "preparing-accompaniment" : status} className="bass-midi-recording-rail rounded-[var(--lv-radius-md)] border border-[var(--lv-accent)] p-3 text-sm space-y-2">
      <h3 className="font-semibold">録音</h3>
      <label className="block text-xs">{copy.inputChannel}<Select aria-label={copy.inputChannel} wrapperClassName="mt-1 w-full" className="w-full" value={channel} disabled={controlsLocked} onChange={event=>setChannel(event.target.value as ChannelMode)}>{CHANNELS.map(option=><option key={option.value} value={option.value}>{option.label.ja}</option>)}</Select></label>
      <label htmlFor="bass-input-meter" className="block text-xs">入力レベル</label><meter id="bass-input-meter" min={0} max={1} value={Math.min(1,inputLevel*4)} className="w-full" />
      <p aria-live="polite" data-testid="record-compare-status" className="text-xs text-[var(--lv-text-muted)]">{midiRecording?.statusText ?? (status==="idle"?"待機中":status==="recorded"?"録音済み・まだ保存していません":statusLabel(status))}</p>
      {status==="recorded"?<div className="flex gap-2"><Button variant="primary" size="sm" data-testid="record-keep" onClick={()=>void session.keep({practiceSessionId:practiceSessionId??"practice-session",exerciseSignature:resetKey??`${mode}-exercise`,mode,inputDeviceName:"Input",playedBackBeforeReview:session.state?.heardTake??false}).then(reference=>{if(reference)onTakeKept?.(reference);}).catch(()=>undefined)}>残す</Button><Button size="sm" data-testid="record-discard" onClick={discard}>破棄</Button></div>:null}
      {status==="permission-denied"?<p role="alert">{copy.permissionDenied}</p>:status==="error"?<p role="alert">{copy.recordingError}</p>:null}
      {session.state?.saveFailed?<p role="alert">{copy.saveFailed}</p>:null}
      {recordStartDisabledReason?<p className="text-xs text-[var(--lv-warning)]">{recordStartDisabledReason}</p>:null}
      <p className="text-xs text-[var(--lv-text-muted)]">{status==="recorded"||status==="saved"?"『残す』を押した録音だけ、端末に保存します。":"伴奏を鳴らして録る時は、ヘッドホンを使ってください。録音は端末の中だけで判定し、『残す』を押した時だけ保存します。"}</p>
      <RetainedTakesPanel repository={retainedTakeRepository} enabledOverride={enabled} />
    </section></EchoRail>;
  }

  if (!optedIn) {
    return (
      <EchoRail><section
        aria-label="Record & Compare"
        data-testid="record-compare"
        data-record-state="off"
        className="mt-4 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] p-3 text-sm"
      >
        <p className="font-semibold text-[var(--lv-text)]">Record &amp; Compare</p>
        <p className="mt-1 text-xs text-[var(--lv-text-secondary)]">
          {copy.description}
        </p>
        <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
          {copy.headphones}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            data-testid="record-compare-enable"
            onClick={() => {
              setOptedIn(true);
              void session.enable().catch(() => undefined);
            }}
          >
            {copy.enable}
          </Button>
          <span className="self-center text-xs text-[var(--lv-text-muted)]">
            {copy.optional}
          </span>
        </div>
        <RetainedTakesPanel repository={retainedTakeRepository} enabledOverride={enabled} />
      </section></EchoRail>
    );
  }

  const needsListenChoice = status === "recorded"
    && !(session.state?.heardTake ?? false)
    && !listenBackSkipped;

  return (
    <EchoRail><section
      aria-label="Record & Compare"
      data-testid="record-compare"
      data-record-state={preparingRecording ? "preparing-accompaniment" : status}
      data-record-mode={mode}
      className="mt-4 rounded-[var(--lv-radius-md)] border border-[var(--lv-accent)] p-3 text-sm"
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold text-[var(--lv-text)]">Record &amp; Compare</p>
        <p aria-live="polite" data-testid="record-compare-status" className="text-xs text-[var(--lv-text-muted)]">
          {statusLabel(status)}
        </p>
      </div>

      {status === "permission-denied" ? (
        <p role="alert" className="mt-2 text-xs">
          {copy.permissionDenied}
        </p>
      ) : null}
      {status === "error" ? (
        <p role="alert" className="mt-2 text-xs">
          {copy.recordingError}
        </p>
      ) : null}
      {session.state?.saveFailed ? (
        <p role="alert" className="mt-2 text-xs">{copy.saveFailed}</p>
      ) : null}

      <label className="mt-2 block text-xs text-[var(--lv-text-secondary)]">
        {copy.inputChannel}
        <Select
          aria-label={copy.inputChannel}
          className="mt-1 w-full max-w-xs"
          value={channel}
          disabled={controlsLocked}
          onChange={(event) => setChannel(event.target.value as ChannelMode)}
        >
          {CHANNELS.map((channel) => (
            <option key={channel.value} value={channel.value}>{channel.label.ja}</option>
          ))}
        </Select>
      </label>

      {status === "counting-in" ? (
        <div className="mt-3 flex items-center gap-2" data-testid="record-countin">
          <span className="text-xs text-[var(--lv-accent)]">{copy.countingIn}</span>
          <Button variant="ghost" size="sm" data-testid="record-cancel-countin" onClick={cancelCountIn}>{copy.cancel}</Button>
        </div>
      ) : null}

      {needsListenChoice ? (
        <div className="mt-3 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] p-2" role="status" data-testid="listen-choice">
          <p className="text-xs text-[var(--lv-text-secondary)]">
            {copy.listenChoice}
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" size="sm" data-testid="listen-choice-hear" onClick={hearTake}>{copy.hearTake}</Button>
            <Button variant="ghost" size="sm" data-testid="listen-choice-skip" onClick={() => setListenBackSkipped(true)}>{copy.skipListen}</Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" data-testid="record-start" aria-describedby={recordStartDisabledReason ? "record-start-disabled-reason" : undefined} disabled={status !== "ready" || preparingRecording || Boolean(recordStartDisabledReason)} onClick={startRecording}>{copy.start}</Button>
        <Button variant="secondary" size="sm" data-testid="record-stop" disabled={!preparingRecording && status !== "recording" && status !== "starting"} onClick={stopRecording}>{copy.stop}</Button>
        <Button variant="secondary" size="sm" data-testid="hear-target" disabled={status !== "recorded" || !targetPlayer} onClick={hearTarget}>{copy.hearTarget}</Button>
        <Button variant="secondary" size="sm" data-testid="hear-take" disabled={status !== "recorded"} onClick={hearTake}>{copy.hearTake}</Button>
        <Button variant="ghost" size="sm" data-testid="record-retake" disabled={status !== "recorded"} onClick={retake}>{copy.retake}</Button>
        <Button variant="danger" size="sm" data-testid="record-discard" disabled={status !== "recorded"} onClick={discard}>{copy.discard}</Button>
        <Button variant="primary" size="sm" data-testid="record-keep" disabled={status !== "recorded"} onClick={() => void session.keep({
          practiceSessionId: practiceSessionId ?? "practice-session",
          exerciseSignature: resetKey ?? `${mode}-exercise`,
          mode,
          inputDeviceName: "Input",
          playedBackBeforeReview: session.state?.heardTake ?? false,
        }).then((retainedTakeReference) => {
          if (retainedTakeReference) onTakeKept?.(retainedTakeReference);
        }).catch(() => undefined)}>{copy.keep}</Button>
        <Button variant="ghost" size="sm" data-testid="record-skip" disabled={controlsLocked} onClick={() => { recordingGenerationRef.current += 1; stopPlayback(); clearCountIn(); stopRecordingAccompaniment(); setPreparingRecording(false); setRecordingActivity(false); setOptedIn(false); }}>{copy.skipRecord}</Button>
      </div>

      {recordStartDisabledReason ? <p id="record-start-disabled-reason" role="status" className="mt-2 text-xs text-[var(--lv-warning)]">{recordStartDisabledReason}</p> : null}

      <p className="mt-2 text-[11px] text-[var(--lv-text-muted)]">
        {copy.privacy}
      </p>

      <RetainedTakesPanel repository={retainedTakeRepository} enabledOverride={enabled} />
    </section></EchoRail>
  );
}

function isLiveCaptureStatus(status: string): boolean {
  return status === "counting-in" || status === "starting" || status === "recording" || status === "stopping";
}

export function runRecordStartGuard(reason: string | undefined, start: () => void): boolean {
  if (reason) return false;
  start();
  return true;
}

function statusLabel(status: string): string {
  const labels: Record<"ja", Record<string, string>> = {
    ja: {
      idle: "準備中", unavailable: "この環境では録音を利用できません", "requesting-permission": "マイクの許可を確認中…",
      "permission-denied": "許可されませんでした", "device-missing": "入力デバイスが見つかりません", ready: "録音できます",
      "counting-in": "カウントイン中…", starting: "録音開始中…", recording: "録音中…", stopping: "停止中…",
      recorded: "録音済み — 聴き比べできます", "playing-target": "お手本を再生中…", "playing-take": "自分のテイクを再生中…",
      saving: "保存中…", saved: "保存しました", discarded: "破棄しました", error: "録音エラー",
    },
  };
  return labels.ja[status] ?? status;
}
