import { useState } from "react";
import { isBassPracticeRecordCompareEnabled } from "../../application/featureFlag";
import type { ChannelMode } from "../domain/types";
import { useRecordCompareSession } from "./useRecordCompareSession";
import type { RecordingSessionController } from "../application/recordingSessionController";

/**
 * Shared Record & Compare panel for all three Echo modes (P5.17-02). It is
 * additive and opt-in: it renders only when the feature flag is on, and it does
 * nothing (beyond a compact opt-in) until the user chooses to record — so
 * microphone permission is requested only on explicit enable, and the initial
 * practice screen is unchanged. It is a mirror for self-review: no scoring,
 * accuracy, or analysis is ever shown.
 */

export interface RecordCompareSectionProps {
  readonly mode: "degree" | "rhythm" | "bassline";
  /** Stable exercise signature; changing it resets the recorder for a new take. */
  readonly resetKey?: string;
  /** Injected in tests. */
  readonly controller?: RecordingSessionController;
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
  controller,
  enabledOverride,
  isTypeSupported,
}: RecordCompareSectionProps) {
  const enabled = enabledOverride ?? isBassPracticeRecordCompareEnabled();
  const [optedIn, setOptedIn] = useState(false);
  const session = useRecordCompareSession({
    controllerFactory: controller ? () => controller : undefined,
    isTypeSupported,
    resetKey,
  });

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
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="record-compare-enable"
            className="min-h-9 rounded-[var(--lv-radius-sm)] border border-[var(--lv-accent)] px-3 text-xs font-semibold text-[var(--lv-accent)]"
            onClick={() => {
              setOptedIn(true);
              void session.enable().catch(() => undefined);
            }}
          >
            Record &amp; Compareを使う
          </button>
          <span className="self-center text-xs text-[var(--lv-text-muted)]">
            使わない場合はそのまま録音せず続けられます
          </span>
        </div>
      </section>
    );
  }

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
          value={session.state?.channelMode ?? "auto"}
          onChange={(event) => session.setChannel(event.target.value as ChannelMode)}
        >
          {CHANNELS.map((channel) => (
            <option key={channel.value} value={channel.value}>{channel.label}</option>
          ))}
        </select>
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" data-testid="record-start" disabled={status !== "ready"} onClick={() => {
          session.startCountIn();
          void session.record().catch(() => undefined);
        }}>Play / Record</button>
        <button type="button" data-testid="record-stop" disabled={status !== "recording"} onClick={() => void session.stop().catch(() => undefined)}>Stop</button>
        <button type="button" data-testid="hear-target" disabled={status !== "recorded"} onClick={() => session.playTarget()}>Hear Target</button>
        <button type="button" data-testid="hear-take" disabled={status !== "recorded"} onClick={() => session.playTake()}>Hear My Take</button>
        <button type="button" data-testid="record-retake" disabled={status !== "recorded"} onClick={() => session.retake()}>Retake</button>
        <button type="button" data-testid="record-discard" disabled={status !== "recorded"} onClick={() => session.discard()}>Discard</button>
        <button type="button" data-testid="record-keep" disabled={status !== "recorded"} onClick={() => void session.keep().catch(() => undefined)}>Keep Take</button>
        <button type="button" data-testid="record-skip" onClick={() => setOptedIn(false)}>録音せず続ける</button>
      </div>

      <p className="mt-2 text-[11px] text-[var(--lv-text-muted)]">
        ローカル保存のみ・cloud送信なし・自動分析や採点はありません。
      </p>
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
