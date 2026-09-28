import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../components/ui";
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
 * unchanged. It is a mirror for self-review: no scoring, accuracy, or analysis.
 *
 * Target and My Take never play at once, and reaching Review without hearing My
 * Take forces an explicit hear-or-skip choice (contract 01).
 */

export interface RecordCompareSectionProps {
  readonly mode: "degree" | "rhythm" | "bassline" | "root-motion";
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
  const copy = RECORD_COMPARE_COPY.ja;
  const [optedIn, setOptedIn] = useState(false);
  const [listenBackSkipped, setListenBackSkipped] = useState(false);
  const [preparingRecording, setPreparingRecordingState] = useState(false);
  const [channel, setChannel] = useRecordChannel();
  const session = useRecordCompareSession({
    controllerFactory: controller ? () => controller : undefined,
    isTypeSupported,
    resetKey,
  });
  const sessionStatus = session.state?.status ?? "idle";
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
  const activePlaybackRef = useRef<PlaybackHandle | null>(null);
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
    activePlaybackRef.current?.stop();
    activePlaybackRef.current = null;
  };
  const notifyPlaybackStart = () => {
    try { onPlaybackStart?.(); } catch { /* An owning surface cannot break Record & Compare playback. */ }
  };
  const clearCountIn = () => {
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

  if (!enabled) return null;

  const status = session.state?.status ?? "idle";
  const controlsLocked = preparingRecording || isLiveCaptureStatus(status);


  if (!optedIn) {
    return (
      <section
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
      </section>
    );
  }

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
          if (recordingGenerationRef.current !== generation) stopRecordingAccompaniment();
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
    activePlaybackRef.current = targetPlayer.play(() => {
      activePlaybackRef.current = null;
      session.playbackEnded();
    });
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

  const needsListenChoice = status === "recorded"
    && !(session.state?.heardTake ?? false)
    && !listenBackSkipped;

  return (
    <section
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
        <select
          aria-label={copy.inputChannel}
          className="lv-input mt-1 w-full max-w-xs"
          value={channel}
          disabled={controlsLocked}
          onChange={(event) => setChannel(event.target.value as ChannelMode)}
        >
          {CHANNELS.map((channel) => (
            <option key={channel.value} value={channel.value}>{channel.label.ja}</option>
          ))}
        </select>
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
    </section>
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
