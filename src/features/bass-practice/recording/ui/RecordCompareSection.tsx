import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../components/ui";
import { isBassPracticeRecordCompareEnabled } from "../../application/featureFlag";
import type { ChannelMode } from "../domain/types";
import { useRecordCompareSession } from "./useRecordCompareSession";
import { useRecordChannel } from "../application/recordChannelStore";
import type { RecordingSessionController } from "../application/recordingSessionController";
import { BrowserTakePlayer, type PlaybackHandle, type TakePlayer, type TargetPlayer } from "../application/playback";
import { RetainedTakesPanel } from "./RetainedTakesPanel";

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
  readonly mode: "degree" | "rhythm" | "bassline";
  /** Stable exercise signature; changing it resets the recorder for a new take. */
  readonly resetKey?: string;
  /** Practice session id recorded in kept-take metadata (non-identifying). */
  readonly practiceSessionId?: string;
  /** Plays the exercise Target; when omitted, Hear Target is unavailable. */
  readonly targetPlayer?: TargetPlayer;
  /** Milliseconds of count-in before recording starts (0 = immediate). */
  readonly countInMs?: number;
  /** Injected in tests. */
  readonly controller?: RecordingSessionController;
  readonly takePlayer?: TakePlayer;
  readonly enabledOverride?: boolean;
  readonly isTypeSupported?: (mimeType: string) => boolean;
}

const CHANNELS: readonly { readonly value: ChannelMode; readonly label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "left", label: "Left / Input 1" },
  { value: "right", label: "Right / Input 2" },
  { value: "mono-sum", label: "Mono Sum" },
];

export function RecordCompareSection({
  mode,
  resetKey,
  practiceSessionId,
  targetPlayer,
  countInMs = 0,
  controller,
  takePlayer,
  enabledOverride,
  isTypeSupported,
}: RecordCompareSectionProps) {
  const enabled = enabledOverride ?? isBassPracticeRecordCompareEnabled();
  const [optedIn, setOptedIn] = useState(false);
  const [listenBackSkipped, setListenBackSkipped] = useState(false);
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

  const stopPlayback = () => {
    activePlaybackRef.current?.stop();
    activePlaybackRef.current = null;
  };
  const clearCountIn = () => {
    if (countInTimerRef.current !== undefined) {
      clearTimeout(countInTimerRef.current);
      countInTimerRef.current = undefined;
    }
  };

  useEffect(() => () => {
    stopPlayback();
    clearCountIn();
  }, []);

  if (!enabled) return null;

  const status = session.state?.status ?? "idle";

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
          自分の演奏を録音してTargetと聴き比べできます。ローカルのみ・自動採点や分析はありません。
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
            Record &amp; Compareを使う
          </Button>
          <span className="self-center text-xs text-[var(--lv-text-muted)]">
            使わない場合はそのまま録音せず続けられます
          </span>
        </div>
        <RetainedTakesPanel enabledOverride={enabled} />
      </section>
    );
  }

  const startRecording = () => {
    setListenBackSkipped(false);
    session.startCountIn();
    clearCountIn();
    if (countInMs > 0) {
      countInTimerRef.current = setTimeout(() => {
        countInTimerRef.current = undefined;
        void session.record().catch(() => undefined);
      }, countInMs);
    } else {
      void session.record().catch(() => undefined);
    }
  };

  const cancelCountIn = () => {
    clearCountIn();
    session.cancelCountIn();
  };

  const hearTarget = () => {
    if (!targetPlayer) return;
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
    stopPlayback();
    session.playTake();
    activePlaybackRef.current = playerRef.current.play(take, () => {
      activePlaybackRef.current = null;
      session.playbackEnded();
    });
  };

  const retake = () => {
    stopPlayback();
    clearCountIn();
    setListenBackSkipped(false);
    session.retake();
  };

  const discard = () => {
    stopPlayback();
    session.discard();
  };

  const needsListenChoice = status === "recorded"
    && !(session.state?.heardTake ?? false)
    && !listenBackSkipped;

  return (
    <section
      aria-label="Record & Compare"
      data-testid="record-compare"
      data-record-state={status}
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
          マイクの使用が許可されませんでした。録音せずに続けられます。
        </p>
      ) : null}
      {status === "error" ? (
        <p role="alert" className="mt-2 text-xs">
          録音を利用できませんでした。従来どおり自己評価を続けられます。
        </p>
      ) : null}
      {session.state?.saveFailed ? (
        <p role="alert" className="mt-2 text-xs">保存できませんでしたが、この録音は再生できます。</p>
      ) : null}

      <label className="mt-2 block text-xs text-[var(--lv-text-secondary)]">
        入力チャンネル
        <select
          aria-label="入力チャンネル"
          className="lv-input mt-1 w-full max-w-xs"
          value={channel}
          onChange={(event) => setChannel(event.target.value as ChannelMode)}
        >
          {CHANNELS.map((channel) => (
            <option key={channel.value} value={channel.value}>{channel.label}</option>
          ))}
        </select>
      </label>

      {status === "counting-in" ? (
        <div className="mt-3 flex items-center gap-2" data-testid="record-countin">
          <span className="text-xs text-[var(--lv-accent)]">カウントイン中…</span>
          <Button variant="ghost" size="sm" data-testid="record-cancel-countin" onClick={cancelCountIn}>キャンセル</Button>
        </div>
      ) : null}

      {needsListenChoice ? (
        <div className="mt-3 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] p-2" role="status" data-testid="listen-choice">
          <p className="text-xs text-[var(--lv-text-secondary)]">
            Reviewへ進む前に、My Takeを聴くか聴き返しをスキップしてください。
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" size="sm" data-testid="listen-choice-hear" onClick={hearTake}>My Takeを聴く</Button>
            <Button variant="ghost" size="sm" data-testid="listen-choice-skip" onClick={() => setListenBackSkipped(true)}>聴き返しをスキップ</Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" data-testid="record-start" disabled={status !== "ready"} onClick={startRecording}>Play / Record</Button>
        <Button variant="secondary" size="sm" data-testid="record-stop" disabled={status !== "recording"} onClick={() => void session.stop().catch(() => undefined)}>Stop</Button>
        <Button variant="secondary" size="sm" data-testid="hear-target" disabled={status !== "recorded" || !targetPlayer} onClick={hearTarget}>Hear Target</Button>
        <Button variant="secondary" size="sm" data-testid="hear-take" disabled={status !== "recorded"} onClick={hearTake}>Hear My Take</Button>
        <Button variant="ghost" size="sm" data-testid="record-retake" disabled={status !== "recorded"} onClick={retake}>Retake</Button>
        <Button variant="danger" size="sm" data-testid="record-discard" disabled={status !== "recorded"} onClick={discard}>Discard</Button>
        <Button variant="primary" size="sm" data-testid="record-keep" disabled={status !== "recorded"} onClick={() => void session.keep({
          practiceSessionId: practiceSessionId ?? "practice-session",
          exerciseSignature: resetKey ?? `${mode}-exercise`,
          mode,
          inputDeviceName: "Input",
          playedBackBeforeReview: session.state?.heardTake ?? false,
        }).catch(() => undefined)}>Keep Take</Button>
        <Button variant="ghost" size="sm" data-testid="record-skip" onClick={() => { stopPlayback(); clearCountIn(); setOptedIn(false); }}>録音せず続ける</Button>
      </div>

      <p className="mt-2 text-[11px] text-[var(--lv-text-muted)]">
        ローカル保存のみ・cloud送信なし・自動分析や採点はありません。
      </p>

      <RetainedTakesPanel enabledOverride={enabled} />
    </section>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    idle: "準備中",
    unavailable: "この環境では録音を利用できません",
    "requesting-permission": "マイクの許可を確認中…",
    "permission-denied": "許可されませんでした",
    "device-missing": "入力デバイスが見つかりません",
    ready: "録音できます",
    "counting-in": "カウントイン中…",
    starting: "録音開始中…",
    recording: "録音中…",
    stopping: "停止中…",
    recorded: "録音済み — 聴き比べできます",
    "playing-target": "Targetを再生中…",
    "playing-take": "My Takeを再生中…",
    saving: "保存中…",
    saved: "保存しました",
    discarded: "破棄しました",
    error: "録音エラー",
  };
  return labels[status] ?? status;
}
