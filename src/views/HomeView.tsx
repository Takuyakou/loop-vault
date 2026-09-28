import { useCallback, useEffect, useMemo, useState } from "react";
import {
  playbackController,
  samePlaybackSource,
  type PlayingSource,
} from "../audio/playbackController";
import type { PreviewSound } from "../audio/chordPreview";
import {
  BassPracticeIcon,
  ChordDojoIcon,
  FavoriteIcon,
  ImportIcon,
  PlayIcon,
  StopIcon,
  SwapIcon,
} from "../components/icons";
import { useNotify } from "../components/notifications";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { FirstCaptureGuide } from "../components/FirstCaptureGuide";
import { Button, IconButton } from "../components/ui";
import { voiceChordForPreview } from "../domain/chordVoicing";
import { displayKey } from "../domain/displayLabels";
import { degreeOf } from "../domain/harmony/degrees";
import { beatsPerBar } from "../domain/midi";
import { voiceTextChordForAudition } from "../domain/textChordTones";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import { resolveTimelineVoicings, resolveVoicingForUse } from "../domain/voicing";
import type { PracticeFileV2 } from "../features/bass-practice/infra/repository/practiceRepository";
import { usePlaybackState } from "../hooks/usePlaybackState";
import type { PracticeKind } from "./home/practiceActivity";
import { useTimelinePlayhead } from "./home/timelinePlayhead";
import {
  loadTodayLoopState,
  localDateKey,
  resolveTodayLoop,
  saveTodayLoopState,
  swapTodayLoop,
  undoTodayLoopSwap,
  type TodayLoopState,
} from "./home/todayLoop";
import { formatWhen, useHomeSummary, type HomeProgression } from "./home/useHomeSummary";
import {
  progressionBars,
  progressionBpm,
  progressionKey,
  progressionName,
  progressionSourceKind,
  progressionSourceLabels,
} from "./vault/progressionFacts";

type ProgressionRef = { ideaId: string; blockId: string };

export interface HomeViewProps {
  ideas: SongIdea[];
  storedIdeas?: SongIdea[];
  practiceFile?: PracticeFileV2;
  bassPracticeAvailable: boolean;
  showRomanNumerals: boolean;
  openProgression: (ideaId: string, blockId: string) => void;
  openCapture: (mode: "midi" | "text") => void;
  openVault: () => void;
  openChordDojo: (target?: ProgressionRef) => void;
  openBassPractice: () => void;
  openVoicingLoop: (target: ProgressionRef) => void;
  updateProgressionBlock: (ideaId: string, blockId: string, changes: Partial<SavedProgressionBlock>) => boolean | "pending";
}

const practiceLabels: Record<PracticeKind | "edit", string> = {
  "chord-dojo": "Chord Dojo",
  "bass-practice": "Bass Practice",
  edit: "最後に更新",
};

export function HomeView({
  ideas,
  storedIdeas = ideas,
  practiceFile,
  bassPracticeAvailable,
  showRomanNumerals,
  openProgression,
  openCapture,
  openVault,
  openChordDojo,
  openBassPractice,
  openVoicingLoop,
  updateProgressionBlock,
}: HomeViewProps) {
  const notify = useNotify();
  const { sound } = usePreviewSound();
  const [now, setNow] = useState(() => new Date());
  const summary = useHomeSummary(ideas, practiceFile, now);
  const date = localDateKey(now);
  const [loopState, setLoopState] = useState<TodayLoopState>(() => loadTodayLoopState());
  const resolvedLoop = useMemo(
    () => resolveTodayLoop(summary.loopCandidates, loopState, date),
    [date, loopState, summary.loopCandidates],
  );
  const loop = summary.progressions.find((entry) => entry.id === resolvedLoop.id);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (resolvedLoop.state === loopState) return;
    setLoopState(resolvedLoop.state);
    saveTodayLoopState(resolvedLoop.state);
  }, [loopState, resolvedLoop.state]);

  const playbackError = useCallback((error: unknown) => notify({
    tone: "error",
    message: error instanceof Error ? error.message : "コードを試聴できませんでした。",
  }), [notify]);

  const togglePin = useCallback((entry: HomeProgression) => {
    const stored = storedIdeas.find((idea) => idea.id === entry.idea.id)
      ?.progressionBlocks?.find((block) => block.id === entry.block.id);
    if (!stored) return;
    const pinned = !stored.pinned;
    if (updateProgressionBlock(entry.idea.id, stored.id, { pinned }) === false) return;
    notify({ tone: "success", message: pinned ? "お気に入りに追加しました" : "お気に入りから外しました" });
  }, [notify, storedIdeas, updateProgressionBlock]);

  const swapLoop = useCallback(() => {
    const result = swapTodayLoop(summary.loopCandidates, loopState, date);
    if (!result.id || !result.previousId || result.id === result.previousId) {
      notify({ tone: "info", message: "ほかに入れ替えられる進行がありません" });
      return;
    }
    const { id: swappedId, previousId } = result;
    if (playbackController.getState().source?.id.startsWith("today-loop:")) playbackController.stop();
    setLoopState(result.state);
    saveTodayLoopState(result.state);
    notify({
      tone: "info",
      message: "今日のループを入れ替えました",
      action: {
        label: "元に戻す",
        onClick: () => setLoopState((current) => {
          const restored = undoTodayLoopSwap(current, date, swappedId, previousId);
          saveTodayLoopState(restored);
          return restored;
        }),
      },
    });
  }, [date, loopState, notify, summary.loopCandidates]);

  if (!summary.progressions.length) {
    return (
      <div className="lv-home">
        <FirstCaptureGuide
          className="mx-auto mt-6 max-w-2xl"
          onMidi={() => openCapture("midi")}
          onText={() => openCapture("text")}
        />
      </div>
    );
  }

  const continueFrom = summary.continueFrom;
  const continueAction = () => {
    if (!continueFrom) return;
    const ref = { ideaId: continueFrom.entry.idea.id, blockId: continueFrom.entry.block.id };
    if (continueFrom.via === "chord-dojo") openChordDojo(ref);
    else if (continueFrom.via === "bass-practice") openBassPractice();
    else openProgression(ref.ideaId, ref.blockId);
  };

  return (
    <div className="lv-home">
      <div className="lv-home-grid">
        {continueFrom ? (
          <ContinueCard
            entry={continueFrom.entry}
            label={`${practiceLabels[continueFrom.via]} · ${formatWhen(continueFrom.at, now)}`}
            sound={sound}
            onContinue={continueAction}
            onPlaybackError={playbackError}
          />
        ) : null}

        <section aria-label="取り込む" className="lv-home-card lv-home-import" data-tone="quiet">
          <span className="lv-home-kicker">取り込む</span>
          <button type="button" className="lv-home-drop" onClick={() => openCapture("midi")}>
            <ImportIcon size={26} className="text-[var(--lv-accent)]" />
            <span className="text-[13px] font-semibold text-[var(--lv-text)]">MIDI から取り込む</span>
            <span className="text-[11px] text-[var(--lv-text-muted)]">コード採集を開いてファイルを選ぶ</span>
          </button>
          <button type="button" className="lv-home-row-button" onClick={() => openCapture("text")}>
            <ImportIcon size={16} className="text-[var(--lv-text-secondary)]" />
            <span className="flex-1">コード譜のテキストを貼り付け</span>
          </button>
        </section>

        {loop ? (
          <TodayLoopCard
            entry={loop}
            showDegrees={showRomanNumerals}
            sound={sound}
            onSwap={swapLoop}
            onPin={() => togglePin(loop)}
            onOpen={() => openProgression(loop.idea.id, loop.block.id)}
            onPlaybackError={playbackError}
          />
        ) : null}

        <section aria-label="今日の練習" className="lv-home-card lv-home-practice">
          <div className="flex items-center gap-2.5">
            <span className="lv-home-kicker">今日の練習</span>
            <span className="flex-1" />
            <span
              className="inline-flex items-center gap-2 text-[11px] text-[var(--lv-record)]"
              title={summary.activity.streakDays ? `${summary.activity.streakDays}日連続で練習しています` : "直近5日の練習"}
              data-testid="home-practice-streak"
            >
              <span className="flex gap-[3px]" aria-hidden="true">
                {summary.activity.recentDays.map((day) => (
                  <span key={day.date} className="lv-home-dot" data-practiced={day.practiced} data-today={day.today} />
                ))}
              </span>
              {summary.activity.streakDays ? <span className="font-semibold">{summary.activity.streakDays}日連続</span> : null}
            </span>
          </div>
          <PracticeRow
            kind="chord-dojo"
            title="Chord Dojo"
            count={summary.activity.today["chord-dojo"]}
            unit="進行"
            onOpen={() => openChordDojo()}
          />
          {bassPracticeAvailable ? (
            <div data-testid="bass-practice-home-card">
              <PracticeRow
                kind="bass-practice"
                title="Bass Practice"
                count={summary.activity.today["bass-practice"]}
                unit="問"
                onOpen={openBassPractice}
              />
            </div>
          ) : null}
        </section>

        <section aria-label="最近の進行" className="lv-home-card lv-home-recent" data-tone="quiet">
          <div className="flex items-center gap-2.5 pb-1.5">
            <span className="lv-home-kicker">最近の進行</span>
            <span className="flex-1" />
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-[var(--lv-accent)] hover:text-[var(--lv-text)]"
              onClick={openVault}
            >
              Vault ですべて見る
            </button>
          </div>
          {summary.recent.map((entry) => (
            <RecentRow
              key={entry.id}
              entry={entry}
              now={now}
              sound={sound}
              onOpen={() => openProgression(entry.idea.id, entry.block.id)}
              onPractice={() => openVoicingLoop({ ideaId: entry.idea.id, blockId: entry.block.id })}
              onPlaybackError={playbackError}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

function ContinueCard({ entry, label, sound, onContinue, onPlaybackError }: {
  entry: HomeProgression;
  label: string;
  sound: PreviewSound;
  onContinue: () => void;
  onPlaybackError: (error: unknown) => void;
}) {
  const { idea, block } = entry;
  const source: PlayingSource = { kind: "home", id: `continue:${entry.id}` };
  const perBar = beatsPerBar(block.timeSignature);
  const current = useTimelinePlayhead(source, block.chords, progressionBpm(idea, block), perBar);
  const bars = progressionBars(block);
  const currentBar = current >= 0 ? block.chords[current]?.bar : undefined;
  const cells = barCells(block, 16);
  return (
    <section aria-label="続きから" className="lv-home-card lv-home-continue" data-testid="home-continue">
      <div className="flex items-center gap-2.5">
        <span className="lv-home-kicker" data-accent="true">続きから</span>
        <span className="text-[11px] text-[var(--lv-text-muted)]">{label}</span>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[28px] font-bold leading-tight" title={progressionName(idea, block)}>{progressionName(idea, block)}</h2>
          <ProgressionMeta idea={idea} block={block} bars={bars} className="mt-1.5" />
        </div>
        <TimelinePlayButton
          source={source}
          block={block}
          idea={idea}
          sound={sound}
          className="lv-button-neutral inline-flex h-[38px] items-center gap-2 px-3.5 text-[13px] font-semibold"
          showLabel
          onError={onPlaybackError}
        />
        <Button variant="primary" className="h-[38px] font-bold" onClick={onContinue}>続きをやる</Button>
      </div>
      <div className="lv-home-strip" aria-label="進行の帯">
        {cells.map((cell) => (
          <div
            key={cell.bar}
            className="lv-home-strip-cell"
            data-hold={!cell.chords.length}
            data-current={currentBar === cell.bar}
          >
            {cell.chords.map((index) => (
              <StripChord key={index} entry={entry} index={index} sound={sound} onPlaybackError={onPlaybackError} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function TodayLoopCard({ entry, showDegrees, sound, onSwap, onPin, onOpen, onPlaybackError }: {
  entry: HomeProgression;
  showDegrees: boolean;
  sound: PreviewSound;
  onSwap: () => void;
  onPin: () => void;
  onOpen: () => void;
  onPlaybackError: (error: unknown) => void;
}) {
  const { idea, block } = entry;
  const source: PlayingSource = { kind: "home", id: `today-loop:${entry.id}` };
  const current = useTimelinePlayhead(source, block.chords, progressionBpm(idea, block), beatsPerBar(block.timeSignature));
  const key = progressionKey(idea, block);
  const pinned = Boolean(block.pinned);
  return (
    <section aria-label="今日のループ" className="lv-home-card lv-home-loop" data-testid="home-today-loop" data-progression-id={entry.id}>
      <div className="flex items-center gap-2.5">
        <span className="lv-home-kicker">今日のループ</span>
        <span className="text-[11px] text-[var(--lv-text-muted)]">Vault から1つ · 毎日かわる</span>
        <span className="flex-1" />
        <Button variant="neutral" size="sm" className="!min-h-7 gap-1.5 !px-2.5 text-[11px]" onClick={onSwap}>
          <SwapIcon size={13} />
          他のループ
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <TimelinePlayButton
          source={source}
          block={block}
          idea={idea}
          sound={sound}
          className="lv-home-loop-play"
          playLabel="今日のループを再生"
          onError={onPlaybackError}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold" title={progressionName(idea, block)}>{progressionName(idea, block)}</p>
          <ProgressionMeta idea={idea} block={block} bars={progressionBars(block)} className="mt-0.5" />
        </div>
        <IconButton
          label={pinned ? "お気に入りから外す" : "お気に入りに追加"}
          tooltip="styled"
          variant="ghost"
          aria-pressed={pinned}
          className={pinned ? "text-[var(--lv-accent)]" : "text-[var(--lv-text-secondary)]"}
          onClick={onPin}
        >
          <FavoriteIcon size={17} fill={pinned ? "currentColor" : "none"} />
        </IconButton>
        <button type="button" className="shrink-0 text-xs font-semibold text-[var(--lv-accent)] hover:text-[var(--lv-text)]" onClick={onOpen}>
          詳しく見る
        </button>
      </div>
      <div className="lv-home-chips">
        {block.chords.slice(0, 8).map((event, index) => (
          <ChordChip
            key={event.eventId ?? `${event.bar}:${event.beat}:${index}`}
            entry={entry}
            index={index}
            degree={showDegrees ? degreeOf(event.chord, key)?.label : undefined}
            current={current === index}
            sound={sound}
            onPlaybackError={onPlaybackError}
          />
        ))}
      </div>
    </section>
  );
}

function ChordChip({ entry, index, degree, current, sound, onPlaybackError }: {
  entry: HomeProgression;
  index: number;
  degree?: string;
  current: boolean;
  sound: PreviewSound;
  onPlaybackError: (error: unknown) => void;
}) {
  const event = entry.block.chords[index];
  const source: PlayingSource = { kind: "home", id: `chip:${entry.id}:${index}` };
  return (
    <button
      type="button"
      className="lv-home-chip"
      data-current={current}
      data-home-loop-chord={index}
      aria-label={`試聴: ${event.chord.label}`}
      title={`試聴: ${event.chord.label}`}
      onClick={() => previewChord(entry, index, source, sound, onPlaybackError)}
    >
      <span className="lv-home-chip-name">{event.chord.label}</span>
      <span className="lv-home-chip-sub">{degree ?? `${event.bar}小節`}</span>
    </button>
  );
}

/** 続きから: one chord of the bar strip; plays like a 今日のループ chip and lights while it sounds. */
function StripChord({ entry, index, sound, onPlaybackError }: {
  entry: HomeProgression;
  index: number;
  sound: PreviewSound;
  onPlaybackError: (error: unknown) => void;
}) {
  const label = entry.block.chords[index].chord.label;
  const source: PlayingSource = { kind: "home", id: `strip:${entry.id}:${index}` };
  const playback = usePlaybackState();
  const playing = playback.status !== "idle" && samePlaybackSource(playback.source, source);
  return (
    <button
      type="button"
      className="lv-home-strip-chord"
      data-playing={playing}
      aria-label={`試聴: ${label}`}
      title={label.length > 7 ? label : undefined}
      onClick={() => previewChord(entry, index, source, sound, onPlaybackError)}
    >
      {label}
    </button>
  );
}

/** The same chord audition for 今日のループ chips and the 続きから strip (saved voicing first). */
function previewChord(entry: HomeProgression, index: number, source: PlayingSource, sound: PreviewSound, onError: (error: unknown) => void) {
  const event = entry.block.chords[index];
  const notes = resolveVoicingForUse(
    event.chord,
    event.voicingMemory,
    entry.block.textSource ? [...voiceTextChordForAudition(event.chord)] : voiceChordForPreview(event.chord).notes,
  ).midiNotes;
  void playbackController.toggle(source, { type: "chord", chord: event.chord, sound, explicitMidiNotes: notes }).catch(onError);
}

function PracticeRow({ kind, title, count, unit, onOpen }: {
  kind: PracticeKind;
  title: string;
  count: number;
  unit: string;
  onOpen: () => void;
}) {
  const circumference = 2 * Math.PI * 15;
  return (
    <button type="button" className="lv-home-practice-row w-full" onClick={onOpen} data-practice-kind={kind}>
      <span className="lv-home-practice-icon" data-kind={kind}>
        {kind === "chord-dojo" ? <ChordDojoIcon size={18} /> : <BassPracticeIcon size={18} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold">{title}</span>
        <span className="truncate text-[11px] text-[var(--lv-text-muted)]">
          {count ? `今日 ${count}${unit}` : "今日はまだ"}
        </span>
      </span>
      <span className="relative h-[34px] w-[34px] shrink-0" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--lv-surface-raised)" strokeWidth="3.5" />
          {count ? (
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--lv-record)" strokeWidth="3.5" strokeDasharray={`${circumference} ${circumference}`} />
          ) : null}
        </svg>
        <span className="lv-home-mono absolute inset-0 grid place-items-center text-[10px] text-[var(--lv-text-secondary)]">{count}</span>
      </span>
    </button>
  );
}

function RecentRow({ entry, now, sound, onOpen, onPractice, onPlaybackError }: {
  entry: HomeProgression;
  now: Date;
  sound: PreviewSound;
  onOpen: () => void;
  onPractice: () => void;
  onPlaybackError: (error: unknown) => void;
}) {
  const { idea, block } = entry;
  return (
    <div className="lv-home-recent-row" data-testid="home-recent-row" onClick={onOpen}>
      <span onClick={(event) => event.stopPropagation()}>
        <TimelinePlayButton
          source={{ kind: "home", id: `recent:${entry.id}` }}
          block={block}
          idea={idea}
          sound={sound}
          className="lv-home-round-play"
          playLabel={`${progressionName(idea, block)} を試聴`}
          iconSize={12}
          onError={onPlaybackError}
        />
      </span>
      <button type="button" className="lv-home-recent-name" onClick={(event) => { event.stopPropagation(); onOpen(); }}>
        <span className="truncate text-[13px] font-semibold">{progressionName(idea, block)}</span>
        <ProgressionMeta idea={idea} block={block} bars={progressionBars(block)} className="!text-[11px] !text-[var(--lv-text-muted)]" inline />
      </button>
      <span className="lv-home-recent-chips" aria-hidden="true">
        {block.chords.slice(0, 6).map((event, index) => (
          <span key={event.eventId ?? index} className="lv-home-recent-chip">{event.chord.label}</span>
        ))}
      </span>
      <span className="lv-home-recent-src w-20 shrink-0 text-[11px] text-[var(--lv-text-muted)]">
        {progressionSourceLabels[progressionSourceKind(block)]}
      </span>
      <span className="w-12 shrink-0 text-right text-[11px] text-[var(--lv-text-muted)]">{formatWhen(entry.touchedAt, now, false)}</span>
      <span className="lv-home-recent-actions" onClick={(event) => event.stopPropagation()}>
        <Button variant="neutral" size="sm" className="!min-h-[30px]" onClick={onPractice}>練習</Button>
      </span>
    </div>
  );
}

function ProgressionMeta({ idea, block, bars, className = "", inline = false }: {
  idea: SongIdea;
  block: SavedProgressionBlock;
  bars: number;
  className?: string;
  inline?: boolean;
}) {
  const key = progressionKey(idea, block);
  const bpm = progressionBpm(idea, block);
  const items = [key ? displayKey(key) : "キーなし", bpm ? `BPM ${bpm}` : "BPM なし", `${bars}小節`];
  if (inline) return <span className={`truncate text-xs text-[var(--lv-text-secondary)] ${className}`}>{items.join(" · ")}</span>;
  return (
    <div className={`lv-home-meta ${className}`}>
      {items.map((item, index) => <span key={index} className={index ? "lv-home-mono" : undefined}>{item}</span>)}
    </div>
  );
}

function TimelinePlayButton({ source, block, idea, sound, className, playLabel = "試聴", showLabel = false, iconSize = 16, onError }: {
  source: PlayingSource;
  block: SavedProgressionBlock;
  idea: SongIdea;
  sound: PreviewSound;
  className: string;
  playLabel?: string;
  showLabel?: boolean;
  iconSize?: number;
  onError: (error: unknown) => void;
}) {
  const playback = usePlaybackState();
  const active = playback.status !== "idle" && samePlaybackSource(playback.source, source);
  const label = active ? "停止" : playLabel;
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-pressed={active}
      aria-busy={active && playback.status === "starting"}
      title={label}
      onClick={() => void playbackController.toggle(source, {
        type: "timeline",
        timeline: block.chords,
        bpm: progressionBpm(idea, block),
        sound,
        beatsPerBar: beatsPerBar(block.timeSignature),
        explicitMidiNotesByEventId: resolveTimelineVoicings(block.chords, Boolean(block.textSource)),
      }).catch(onError)}
    >
      {active ? <StopIcon size={iconSize} /> : <PlayIcon size={iconSize} />}
      {showLabel ? <span>{active ? "停止" : "試聴"}</span> : null}
    </button>
  );
}

/** One cell per bar from the block's first bar; a cell names the chords that start in it. */
/** One cell per bar with the indexes of the chords that start in it (empty = held over). */
function barCells(block: SavedProgressionBlock, limit: number): { bar: number; chords: number[] }[] {
  if (!block.chords.length) return [];
  const first = Math.min(...block.chords.map((item) => item.bar));
  const count = Math.min(limit, Math.max(1, progressionBars(block)));
  return Array.from({ length: count }, (_, offset) => {
    const bar = first + offset;
    return { bar, chords: block.chords.flatMap((item, index) => item.bar === bar ? [index] : []) };
  });
}
