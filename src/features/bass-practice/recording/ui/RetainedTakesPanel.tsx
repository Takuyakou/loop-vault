import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../../../components/ui";
import type { AppLanguage } from "../../../../i18n";
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
  readonly language?: AppLanguage;
  readonly repository?: PersistentRecordingTakeRepository;
  readonly takePlayer?: TakePlayer;
  readonly showWhenEmpty?: boolean;
  readonly enabledOverride?: boolean;
}

const RETAINED_TAKES_COPY = {
  ja: {
    sectionLabel: "保存した録音", heading: "保存した録音（ローカルのみ）", empty: "保存した録音はありません。「テイクを保持」で明示的に保存したものだけがここに残ります。",
    playedBefore: " · レビュー前に試聴済み", notPlayedBefore: " · レビュー前は未試聴", unavailable: "録音を利用できません。削除は可能です。",
    playing: "再生中…", play: "再生", confirmDelete: "削除を確定", cancel: "やめる", remove: "削除",
    privacy: "ローカルのみ・クラウド送信なし・自動分析や採点はありません。機能をOFFにしても保存済みデータは自動削除されません。",
  },
  en: {
    sectionLabel: "Saved recordings", heading: "Saved Recordings (Local Only)", empty: "No recordings are saved. Only takes you explicitly keep remain here.",
    playedBefore: " · heard before Review", notPlayedBefore: " · not heard before Review", unavailable: "Recording unavailable. You can still delete it.",
    playing: "Playing…", play: "Play", confirmDelete: "Confirm Delete", cancel: "Cancel", remove: "Delete",
    privacy: "Local only · no cloud upload · no automatic analysis or scoring. Turning the feature off does not automatically delete saved data.",
  },
} as const;

const MODE_LABELS: Record<StoredRecordingMetadata["mode"], string> = {
  degree: "Degree Echo",
  rhythm: "Rhythm Echo",
  bassline: "Bassline Echo",
  "root-motion": "Root Motion Echo",
};

export function RetainedTakesPanel({
  language = "ja",
  repository,
  takePlayer,
  showWhenEmpty = false,
  enabledOverride,
}: RetainedTakesPanelProps) {
  const enabled = enabledOverride ?? isBassPracticeRecordCompareEnabled();
  const copy = RETAINED_TAKES_COPY[language];
  const repoRef = useRef<PersistentRecordingTakeRepository>();
  if (!repoRef.current) repoRef.current = repository ?? createPersistentTakeRepository();
  const playerRef = useRef<TakePlayer>(takePlayer ?? new BrowserTakePlayer());
  const activePlaybackRef = useRef<PlaybackHandle | null>(null);

  const [takes, setTakes] = useState<readonly StoredRecordingMetadata[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);
  const [unavailableId, setUnavailableId] = useState<string>();
  const [confirmingId, setConfirmingId] = useState<string>();
  const [playingId, setPlayingId] = useState<string>();

  const refresh = useCallback(async () => {
    const repo = repoRef.current;
    if (!repo) return;
    setTakes(await repo.listStored());
    setUsedBytes(await repo.usedBytes());
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    void refresh();
    return () => {
      activePlaybackRef.current?.stop();
      activePlaybackRef.current = null;
    };
  }, [enabled, refresh]);

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
    <section aria-label={copy.sectionLabel} data-testid="retained-takes" className="mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">{copy.heading}</h3>
        <p data-testid="retained-capacity" className="text-xs text-[var(--lv-text-muted)]">
          {formatMb(usedBytes)} / {formatMb(TOTAL_QUOTA_BYTES)}
        </p>
      </div>
      {takes.length === 0 ? (
        <p data-testid="retained-empty" className="mt-2 text-xs text-[var(--lv-text-secondary)]">
          {copy.empty}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {takes.map((take) => (
            <li key={take.recordingId} data-testid="retained-take" data-recording-id={take.recordingId}
              className="rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[var(--lv-text)]">{MODE_LABELS[take.mode]}</span>
                <span className="text-[var(--lv-text-muted)]">{formatDate(take.createdAt, language)}</span>
              </div>
              <p className="mt-1 text-[var(--lv-text-secondary)]">
                {(take.durationMs / 1000).toFixed(1)}s · {formatKb(take.byteSize)} · {take.channelMode} ·
                {take.playedBackBeforeReview ? copy.playedBefore : copy.notPlayedBefore}
              </p>
              {unavailableId === take.recordingId ? (
                <p role="alert" data-testid="retained-take-unavailable" className="mt-1 text-[var(--lv-text-secondary)]">
                  {copy.unavailable}
                </p>
              ) : null}
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" size="sm" data-testid="retained-take-play" onClick={() => void play(take.recordingId)}>
                  {playingId === take.recordingId ? copy.playing : copy.play}
                </Button>
                {confirmingId === take.recordingId ? (
                  <>
                    <Button variant="danger" size="sm" data-testid="retained-take-confirm-delete" onClick={() => void remove(take.recordingId)}>
                      {copy.confirmDelete}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmingId(undefined)}>{copy.cancel}</Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" data-testid="retained-take-delete" onClick={() => setConfirmingId(take.recordingId)}>
                    {copy.remove}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-[var(--lv-text-muted)]">
        {copy.privacy}
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
function formatDate(iso: string, language: AppLanguage): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(language === "ja" ? "ja-JP" : "en-US");
}
