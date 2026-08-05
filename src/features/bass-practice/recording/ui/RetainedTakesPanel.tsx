import { useEffect, useRef, useState } from "react";
import { isBassPracticeRecordCompareEnabled } from "../../application/featureFlag";
import { TOTAL_QUOTA_BYTES, type StoredRecordingMetadata } from "../domain/persistence";
import { createPersistentTakeRepository } from "../application/createController";
import type { PersistentRecordingTakeRepository } from "../application/recordingStore";
import { BrowserTakePlayer, type PlaybackHandle, type TakePlayer } from "../application/playback";

/**
 * Manage kept takes (P5.17-03, brief §15/16). Lists retained recordings with
 * only honest facts — never a score — and lets the user play or delete them and
 * see capacity. A missing/corrupt binary shows "Recording unavailable" and stays
 * deletable, so one bad take never breaks the list. Renders nothing when empty
 * (additive) unless `showWhenEmpty` is set for a dedicated management view.
 */

export interface RetainedTakesPanelProps {
  readonly repository?: PersistentRecordingTakeRepository;
  readonly takePlayer?: TakePlayer;
  readonly showWhenEmpty?: boolean;
  readonly enabledOverride?: boolean;
}

const MODE_LABELS: Record<StoredRecordingMetadata["mode"], string> = {
  degree: "Degree Echo",
  rhythm: "Rhythm Echo",
  bassline: "Bassline Echo",
};

export function RetainedTakesPanel({
  repository,
  takePlayer,
  showWhenEmpty = false,
  enabledOverride,
}: RetainedTakesPanelProps) {
  const enabled = enabledOverride ?? isBassPracticeRecordCompareEnabled();
  const repoRef = useRef<PersistentRecordingTakeRepository>();
  if (!repoRef.current) repoRef.current = repository ?? createPersistentTakeRepository();
  const playerRef = useRef<TakePlayer>(takePlayer ?? new BrowserTakePlayer());
  const activePlaybackRef = useRef<PlaybackHandle | null>(null);

  const [takes, setTakes] = useState<readonly StoredRecordingMetadata[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);
  const [unavailableId, setUnavailableId] = useState<string>();
  const [confirmingId, setConfirmingId] = useState<string>();
  const [playingId, setPlayingId] = useState<string>();

  const refresh = async () => {
    const repo = repoRef.current;
    if (!repo) return;
    setTakes(await repo.listStored());
    setUsedBytes(await repo.usedBytes());
  };

  useEffect(() => {
    if (!enabled) return undefined;
    void refresh();
    return () => {
      activePlaybackRef.current?.stop();
      activePlaybackRef.current = null;
    };
    // eslint-disable-next-line
  }, [enabled]);

  if (!enabled) return null;
  if (takes.length === 0 && !showWhenEmpty) return null;

  const play = async (id: string) => {
    const repo = repoRef.current;
    if (!repo) return;
    const take = await repo.load(id);
    if (!take) {
      setUnavailableId(id);
      return;
    }
    setUnavailableId(undefined);
    activePlaybackRef.current?.stop();
    setPlayingId(id);
    activePlaybackRef.current = playerRef.current.play(take, () => {
      activePlaybackRef.current = null;
      setPlayingId(undefined);
    });
  };

  const remove = async (id: string) => {
    const repo = repoRef.current;
    if (!repo) return;
    await repo.remove(id);
    setConfirmingId(undefined);
    await refresh();
  };

  return (
    <section aria-label="保存した録音" data-testid="retained-takes" className="mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">保存した録音（ローカルのみ）</h3>
        <p data-testid="retained-capacity" className="text-xs text-[var(--lv-text-muted)]">
          {formatMb(usedBytes)} / {formatMb(TOTAL_QUOTA_BYTES)}
        </p>
      </div>
      {takes.length === 0 ? (
        <p data-testid="retained-empty" className="mt-2 text-xs text-[var(--lv-text-secondary)]">
          保存した録音はありません。Keep Takeで明示的に保存したものだけがここに残ります。
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {takes.map((take) => (
            <li key={take.recordingId} data-testid="retained-take" data-recording-id={take.recordingId}
              className="rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[var(--lv-text)]">{MODE_LABELS[take.mode]}</span>
                <span className="text-[var(--lv-text-muted)]">{formatDate(take.createdAt)}</span>
              </div>
              <p className="mt-1 text-[var(--lv-text-secondary)]">
                {(take.durationMs / 1000).toFixed(1)}s · {formatKb(take.byteSize)} · {take.channelMode} ·
                {take.playedBackBeforeReview ? " Review前に試聴済み" : " Review前は未試聴"}
              </p>
              {unavailableId === take.recordingId ? (
                <p role="alert" data-testid="retained-take-unavailable" className="mt-1 text-[var(--lv-text-secondary)]">
                  Recording unavailable — 削除できます。
                </p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <button type="button" data-testid="retained-take-play" onClick={() => void play(take.recordingId)}>
                  {playingId === take.recordingId ? "再生中…" : "再生"}
                </button>
                {confirmingId === take.recordingId ? (
                  <>
                    <button type="button" data-testid="retained-take-confirm-delete" onClick={() => void remove(take.recordingId)}>
                      削除を確定
                    </button>
                    <button type="button" onClick={() => setConfirmingId(undefined)}>やめる</button>
                  </>
                ) : (
                  <button type="button" data-testid="retained-take-delete" onClick={() => setConfirmingId(take.recordingId)}>
                    削除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-[var(--lv-text-muted)]">
        ローカルのみ・cloud送信なし・自動分析や採点はありません。機能をOFFにしても保存済みは自動削除されません。
      </p>
    </section>
  );
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatKb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("ja-JP");
}
