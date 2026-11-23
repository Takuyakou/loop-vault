import { displayChordLabel, displayDegreeLabel } from "../ui/chordText";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
  VoicingLoopIcon,
} from "../components/icons";
import { useNotify } from "../components/notifications";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { FirstCaptureGuide } from "../components/FirstCaptureGuide";
import { ChordName } from "../components/ChordName";
import { ProgressionMidiControl } from "../components/ProgressionMidiControl";
import { Button, IconButton, SegmentedControl } from "../components/ui";
import { displayKey } from "../domain/displayLabels";
import { degreeOf } from "../domain/harmony/degrees";
import { progressionFunctions } from "../domain/harmony/chordFunction";
import { beatsPerBar } from "../domain/midi";
import { buildProgressionMidi } from "../domain/midiExport";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import { resolveTimelineVoicings } from "../domain/voicing";
import type { PracticeFileV2 } from "../features/bass-practice/infra/repository/practiceRepository";
import { usePlaybackState } from "../hooks/usePlaybackState";
import { isProgressionMidiExportEnabled } from "../midiExport/featureFlag";
import type { BassPracticeMode, PracticeKind } from "./home/practiceActivity";
import type { PracticeWeekKind } from "./home/practiceWeek";
import type { DojoRecentEntry } from "./chord-dojo/dojoRecent";
import { useTimelinePlayhead } from "./home/timelinePlayhead";
import { keyCellOf } from "./vault/vaultShape";
import { LoopRoll } from "./home/LoopRoll";
import { auditionSavedChord } from "./chordAudition";
import { initialKey, keyTonic, keyWheel, MODE_NAMES, WHEEL_NAMES, type KeyMode, type KeyWheel } from "./home/homeKeys";
import {
  loadTodayLoopState,
  localDateKey,
  resolveTodayLoop,
  saveTodayLoopState,
  swapTodayLoop,
  undoTodayLoopSwap,
  type TodayLoopState,
} from "./home/todayLoop";
import { formatWhen, useHomeSummary, type HomeContinue, type HomeProgression, type HomeSummary } from "./home/useHomeSummary";
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
  /** P23-10 V12: with a key band cell (`major:0` …), the Vault opens on that key. */
  openVault: (keyCell?: string) => void;
  openChordDojo: (target?: ProgressionRef) => void;
  openBassPractice: (mode?: BassPracticeMode) => void;
  openVoicingLoop: (target: ProgressionRef) => void;
  /** P22-03 §1/§3: open the Voicing Loop itself (the picker) and resume the remembered Chord Dojo practice. */
  openVoicingLoopHome: () => void;
  resumeChordDojo: (entry: DojoRecentEntry) => void;
  updateProgressionBlock: (ideaId: string, blockId: string, changes: Partial<SavedProgressionBlock>) => boolean | "pending";
  /** P24-03: the empty-Vault guide's sample button. */
  onAddSamples?: () => void;
}

/** P22-03 §1: what the Bass Practice tabs call themselves (the Home's 「続きから」 uses the same words). */
const bassPracticeNames: Record<BassPracticeMode, string> = {
  degree: "度数",
  rhythm: "リズム",
  bassline: "コード進行のベース",
  "root-motion": "ルートの動き",
  midi: "MIDI のベースライン",
};

const practiceLabels: Record<PracticeKind | "edit", string> = {
  "chord-dojo": "Chord Dojo",
  "bass-practice": "Bass Practice",
  edit: "最後に更新",
};

/**
 * The Home's small line glyphs, drawn to the custom icon rules (24 grid, 1.8 stroke, round). Kept here rather than
 * from Lucide so the import box keeps its 26px icon.
 */
function Glyph({ d, size = 16, className }: { d: string; size?: 16 | 20; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d={d} />
    </svg>
  );
}
const PENCIL = "M4 20h4L18 10l-4-4L4 16zM13 7l4 4";
const ARROW = "M4 12h15M14 7l5 5-5 5";
const CLIPBOARD = "M7 4H6a2 2 0 00-2 2v13a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1M9 2.5h6v3.5H9zM8.5 11h7M8.5 14.5h7M8.5 18h4";
const CHEVRON = "M9.5 6l6 6-6 6";

const refOf = (entry: HomeProgression): ProgressionRef => ({ ideaId: entry.idea.id, blockId: entry.block.id });

/** A key as the Home shows it: 「F♯メジャー」, or 「キーなし」. */
function keyLabel(key: string | undefined): string {
  return key ? displayChordLabel(displayKey(key)!) : "キーなし";
}

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
  openVoicingLoopHome,
  resumeChordDojo,
  updateProgressionBlock,
  onAddSamples,
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
  }, [storedIdeas, updateProgressionBlock]);

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
          {...(onAddSamples ? { onSamples: onAddSamples } : {})}
        />
      </div>
    );
  }

  const continueFrom = summary.continueFrom;
  const legacyContinueAction = (target: Extract<HomeContinue, { kind: "edit" }>) => {
    const ref = refOf(target.entry);
    if (target.via === "chord-dojo") openChordDojo(ref);
    else if (target.via === "bass-practice") openBassPractice();
    else openProgression(ref.ideaId, ref.blockId);
  };

  return (
    <div className="lv-home lv-home-board">
      <div className="lv-home-grid">
        <div className="lv-home-col" data-col="left">
          {loop ? (
            <TodayLoopCard
              entry={loop}
              showDegrees={showRomanNumerals}
              sound={sound}
              onSwap={swapLoop}
              onPin={() => togglePin(loop)}
              onVoicingLoop={() => openVoicingLoop(refOf(loop))}
              onChordDojo={() => openChordDojo(refOf(loop))}
              onOpen={() => openProgression(loop.idea.id, loop.block.id)}
              onPlaybackError={playbackError}
            />
          ) : null}

          {continueFrom?.kind === "voicing-loop" ? (
            <ContinueCard
              entry={continueFrom.entry}
              label={`Voicing Loop · ${formatWhen(continueFrom.at, now)}`}
              icon={<VoicingLoopIcon size={20} />}
              continueKind="voicing-loop"
              sound={sound}
              onContinue={() => openVoicingLoop(refOf(continueFrom.entry))}
              onPlaybackError={playbackError}
            />
          ) : continueFrom?.kind === "chord-dojo" ? (
            <RecentContinueCard
              kind="chord-dojo"
              label={`Chord Dojo · ${formatWhen(continueFrom.at, now)}`}
              title={continueFrom.title}
              subtitle={continueFrom.subtitle}
              onContinue={() => resumeChordDojo(continueFrom.recent)}
            />
          ) : continueFrom?.kind === "bass-practice" ? (
            <RecentContinueCard
              kind="bass-practice"
              label={`Bass Practice · ${formatWhen(continueFrom.at, now)}`}
              title={bassPracticeNames[continueFrom.mode]}
              onContinue={() => openBassPractice(continueFrom.mode)}
            />
          ) : continueFrom ? (
            <ContinueCard
              entry={continueFrom.entry}
              label={`${practiceLabels[continueFrom.via]} · ${formatWhen(continueFrom.at, now)}`}
              continueKind="edit"
              sound={sound}
              onContinue={() => legacyContinueAction(continueFrom)}
              onPlaybackError={playbackError}
            />
          ) : null}

          <section aria-label="最近入れた進行" className="lv-home-recent">
            <div className="lv-home-head">
              <span className="lv-home-title">最近入れた進行</span>
              <span className="flex-1" />
              <button type="button" className="lv-home-link" onClick={() => openVault()}>
                Vault ですべて見る<Glyph d={CHEVRON} />
              </button>
            </div>
            <div className="lv-home-recent-list">
              {summary.recent.map((entry) => (
                <RecentRow
                  key={entry.id}
                  entry={entry}
                  now={now}
                  sound={sound}
                  onOpen={() => openProgression(entry.idea.id, entry.block.id)}
                  onPractice={() => openVoicingLoop(refOf(entry))}
                  onPlaybackError={playbackError}
                />
              ))}
            </div>
          </section>
        </div>

        <div className="lv-home-col" data-col="right">
          <section aria-label="取り込む" className="lv-home-panel lv-home-import">
            <span className="lv-home-kicker">取り込む</span>
            <button type="button" className="lv-home-drop" onClick={() => openCapture("midi")}>
              <ImportIcon size={26} className="text-[var(--lv-accent)]" />
              <span className="text-[14px] font-semibold text-[var(--lv-text)]">MIDI から取り込む</span>
              <span className="text-[12px] text-[var(--lv-text-muted)]">取り込むを開いてファイルを選ぶ</span>
            </button>
            <button type="button" className="lv-home-row-button" onClick={() => openCapture("text")}>
              <span className="lv-home-text-icon"><Glyph d={CLIPBOARD} size={20} /></span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-semibold">コード譜のテキストを貼り付け</span>
                <span className="lv-home-text-demo" aria-hidden="true">
                  <span className="lv-home-text-src">Dm7 | G7 | Cmaj7</span>
                  <Glyph d={ARROW} className="lv-home-text-arrow" />
                  <span className="lv-home-text-chips">
                    <span data-fn="SD">Dm7</span><span data-fn="D">G7</span><span data-fn="T">Cmaj7</span>
                  </span>
                </span>
              </span>
            </button>
          </section>

          <PracticePanel
            summary={summary}
            now={now}
            bassPracticeAvailable={bassPracticeAvailable}
            openVoicingLoopHome={openVoicingLoopHome}
            openChordDojo={() => openChordDojo()}
            openBassPractice={() => openBassPractice()}
          />

          <DrawerPanel
            summary={summary}
            sound={sound}
            openProgression={openProgression}
            openVault={openVault}
            onPlaybackError={playbackError}
          />
        </div>
      </div>
    </div>
  );
}

function ContinueCard({ entry, label, icon, continueKind, sound, onContinue, onPlaybackError }: {
  entry: HomeProgression;
  label: string;
  icon?: ReactNode;
  continueKind: "voicing-loop" | "edit";
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
    <section aria-label="続きから" className="lv-home-continue" data-testid="home-continue" data-continue-kind={continueKind}>
      <div className="lv-home-continue-row">
        <span className="lv-home-continue-icon" data-kind={continueKind}>{icon ?? <PencilMark />}</span>
        <div className="min-w-0 flex-1">
          <p className="lv-home-continue-label"><span className="lv-home-kicker" data-accent="true">続きから</span>{label}</p>
          <div className="lv-home-continue-what">
            <h2 className="truncate" title={progressionName(idea, block)}>{progressionName(idea, block)}</h2>
            <ProgressionMeta idea={idea} block={block} bars={bars} inline />
          </div>
        </div>
        <TimelinePlayButton
          source={source}
          block={block}
          idea={idea}
          sound={sound}
          className="lv-button-neutral inline-flex h-9 items-center gap-2 px-3.5 text-[13px] font-semibold"
          showLabel
          onError={onPlaybackError}
        />
        <Button variant="primary" className="h-9 font-bold" onClick={onContinue}>続きをやる</Button>
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

function PencilMark() {
  return <Glyph d={PENCIL} size={20} />;
}

/**
 * P22-03 §1: the 「続きから」 of a practice that has no Vault progression of its own (Chord Dojo, Bass Practice).
 * P23-61 §1: the card is one row tall — no empty bar strip below it (that used to keep the taller height).
 */
function RecentContinueCard({ kind, label, title, subtitle, onContinue }: {
  kind: "chord-dojo" | "bass-practice";
  label: string;
  title: string;
  subtitle?: string;
  onContinue: () => void;
}) {
  return (
    <section aria-label="続きから" className="lv-home-continue" data-testid="home-continue" data-continue-kind={kind}>
      <div className="lv-home-continue-row">
        <span className="lv-home-continue-icon" data-kind={kind}>
          {kind === "chord-dojo" ? <ChordDojoIcon size={20} /> : <BassPracticeIcon size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="lv-home-continue-label"><span className="lv-home-kicker" data-accent="true">続きから</span>{label}</p>
          <div className="lv-home-continue-what">
            <h2 className="truncate" title={title}>{title}</h2>
            {subtitle ? <span className="lv-home-meta-inline" title={subtitle}>{subtitle}</span> : null}
          </div>
        </div>
        <Button variant="primary" className="h-9 font-bold" onClick={onContinue}>続きをやる</Button>
      </div>
    </section>
  );
}

function TodayLoopCard({ entry, showDegrees, sound, onSwap, onPin, onVoicingLoop, onChordDojo, onOpen, onPlaybackError }: {
  entry: HomeProgression;
  showDegrees: boolean;
  sound: PreviewSound;
  onSwap: () => void;
  onPin: () => void;
  onVoicingLoop: () => void;
  onChordDojo: () => void;
  onOpen: () => void;
  onPlaybackError: (error: unknown) => void;
}) {
  const { idea, block } = entry;
  const source: PlayingSource = { kind: "home", id: `today-loop:${entry.id}` };
  const current = useTimelinePlayhead(source, block.chords, progressionBpm(idea, block), beatsPerBar(block.timeSignature));
  const key = progressionKey(idea, block);
  const pinned = Boolean(block.pinned);
  const roles = useMemo(() => chordRoles(block, key), [block, key]);
  const [midiExportEnabled] = useState(isProgressionMidiExportEnabled);
  const notify = useNotify();
  const midiExport = useMemo(() => {
    if (!midiExportEnabled) return undefined;
    try {
      return { result: buildProgressionMidi(block, { ideaBpm: idea.bpm }) };
    } catch {
      return { disabledReason: "この進行はMIDIに書き出せません。" };
    }
  }, [block, idea.bpm, midiExportEnabled]);
  return (
    <section aria-label="今日のループ" className="lv-home-loop" data-testid="home-today-loop" data-progression-id={entry.id}>
      <div className="flex items-start gap-4">
        <TimelinePlayButton
          source={source}
          block={block}
          idea={idea}
          sound={sound}
          className="lv-home-loop-play"
          playLabel="今日のループを再生"
          iconSize={20}
          onError={onPlaybackError}
        />
        <div className="min-w-0 flex-1">
          <span className="lv-home-kicker" data-accent="true">今日のループ</span>
          <h2 className="lv-home-loop-title" data-selectable title={progressionName(idea, block)}>{progressionName(idea, block)}</h2>
          <ProgressionMeta idea={idea} block={block} bars={progressionBars(block)} className="mt-0.5" />
        </div>
        <div className="lv-home-loop-tools">
          <IconButton
            label={pinned ? "お気に入りから外す" : "お気に入りに追加"}
            tooltip="styled"
            variant="ghost"
            aria-pressed={pinned}
            className={pinned ? "text-[var(--lv-accent)]" : "text-[var(--lv-text-secondary)]"}
            onClick={onPin}
          >
            <FavoriteIcon size={20} fill={pinned ? "currentColor" : "none"} />
          </IconButton>
          <Button variant="neutral" size="sm" className="!min-h-8 shrink-0 gap-1.5 !px-2.5 text-[12px]" onClick={onSwap}>
            <SwapIcon size={16} />
            他のループ
          </Button>
          {midiExport ? (
            <ProgressionMidiControl
              label="MIDI を DAW へ"
              result={midiExport.result}
              disabledReason={midiExport.disabledReason}
              setToast={(message, tone) => notify({ message, tone })}
            />
          ) : null}
        </div>
      </div>
      <div className="lv-home-chips">
        {block.chords.slice(0, 8).map((event, index) => (
          <ChordChip
            key={event.eventId ?? `${event.bar}:${event.beat}:${index}`}
            entry={entry}
            index={index}
            role={roles[index]}
            degree={showDegrees ? displayDegreeLabel(degreeOf(event.chord, key)?.label) : undefined}
            current={current === index}
            sound={sound}
            onPlaybackError={onPlaybackError}
          />
        ))}
      </div>
      <LoopRoll
        block={block}
        limit={8}
        source={source}
        current={current}
        bpm={progressionBpm(idea, block)}
        beatsPerBar={beatsPerBar(block.timeSignature)}
      />
      <div className="lv-home-loop-actions">
        <Button variant="neutral" className="lv-home-go" onClick={onVoicingLoop}>
          <VoicingLoopIcon size={16} />Voicing Loop で弾く
        </Button>
        <Button variant="neutral" className="lv-home-go" onClick={onChordDojo}>
          <ChordDojoIcon size={16} />Chord Dojo で覚える
        </Button>
        <Button variant="neutral" className="lv-home-go" onClick={onOpen} title="進行のページを開きます。コード名・音・タグ・メモを直して保存できます">
          <Glyph d={PENCIL} />開いて編集
        </Button>
      </div>
    </section>
  );
}

/** T1: the role of each chord (T / SD / SDm / D), only when the progression's key is known. */
function chordRoles(block: SavedProgressionBlock, key: string | undefined): string[] {
  const tonic = keyTonic(key);
  if (!tonic) return block.chords.map(() => "");
  return progressionFunctions(block.chords.map(({ chord }) => ({
    rootPc: chord.root,
    quality: chord.quality,
    tensions: chord.tensions,
    ...(chord.bass === undefined ? {} : { bassPc: chord.bass }),
  })), tonic).map((result) => result.kind);
}

function ChordChip({ entry, index, role, degree, current, sound, onPlaybackError }: {
  entry: HomeProgression;
  index: number;
  role?: string;
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
      style={{ flexGrow: Math.max(1, event.durationBeats) }}
      data-current={current}
      data-fn={role || undefined}
      data-home-loop-chord={index}
      aria-label={`試聴: ${event.chord.label}`}
      title={`試聴: ${event.chord.label}`}
      onClick={() => previewChord(entry, index, source, sound, onPlaybackError)}
    >
      <span className="lv-home-chip-sub">{degree ?? `${event.bar}小節`}</span>
      <ChordName label={event.chord.label} className="lv-home-chip-name" />
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
      title={label.length > 7 ? displayChordLabel(label) : undefined}
      onClick={() => previewChord(entry, index, source, sound, onPlaybackError)}
    >
      <ChordName label={label} />
    </button>
  );
}

/** 最近入れた進行 (N2): one small chord; it plays and the row does not open. */
function RecentChord({ entry, index, sound, onPlaybackError }: {
  entry: HomeProgression;
  index: number;
  sound: PreviewSound;
  onPlaybackError: (error: unknown) => void;
}) {
  const label = entry.block.chords[index].chord.label;
  const source: PlayingSource = { kind: "home", id: `recent-chord:${entry.id}:${index}` };
  const playback = usePlaybackState();
  const playing = playback.status !== "idle" && samePlaybackSource(playback.source, source);
  return (
    <button
      type="button"
      className="lv-home-recent-chip"
      data-playing={playing}
      aria-label={`試聴: ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        previewChord(entry, index, source, sound, onPlaybackError);
      }}
    >
      <ChordName label={label} />
    </button>
  );
}

function previewChord(entry: HomeProgression, index: number, source: PlayingSource, sound: PreviewSound, onError: (error: unknown) => void) {
  void auditionSavedChord(entry.block, index, source, sound).catch(onError);
}

function PracticePanel({ summary, now, bassPracticeAvailable, openVoicingLoopHome, openChordDojo, openBassPractice }: {
  summary: HomeSummary;
  now: Date;
  bassPracticeAvailable: boolean;
  openVoicingLoopHome: () => void;
  openChordDojo: () => void;
  openBassPractice: () => void;
}) {
  const voicingLast = summary.lastVoicingPractice;
  const voicingEntry = voicingLast
    ? summary.progressions.find((entry) => entry.idea.id === voicingLast.reference.ideaId && entry.block.id === voicingLast.reference.blockId)
    : undefined;
  const voicingSub = voicingLast
    ? ["前回", voicingEntry ? `${progressionName(voicingEntry.idea, voicingEntry.block)} ・` : undefined, formatWhen(Date.parse(voicingLast.at), now, false)].filter(Boolean).join(" ")
    : undefined;
  const countedSub = (kind: PracticeKind) => {
    const count = summary.activity.today[kind];
    if (count) return `今日 ${count} 回`;
    const last = summary.lastPractised[kind];
    return last ? `今日はまだ ・ 前回 ${formatWhen(last, now, false)}` : "今日はまだ";
  };
  return (
    <section aria-label="練習" className="lv-home-panel lv-home-practice">
      <div className="lv-home-head">
        <span className="lv-home-title">練習</span>
        <span className="flex-1" />
        <span className="lv-home-hint">この 7 日</span>
      </div>
      <PracticeRow kind="voicing-loop" title="Voicing Loop" sub={voicingSub} week={summary.practiceWeek["voicing-loop"]} onOpen={openVoicingLoopHome} />
      <PracticeRow kind="chord-dojo" title="Chord Dojo" sub={countedSub("chord-dojo")} week={summary.practiceWeek["chord-dojo"]} onOpen={openChordDojo} />
      {bassPracticeAvailable ? (
        <div data-testid="bass-practice-home-card">
          <PracticeRow kind="bass-practice" title="Bass Practice" sub={countedSub("bass-practice")} week={summary.practiceWeek["bass-practice"]} onOpen={openBassPractice} />
        </div>
      ) : null}
    </section>
  );
}

/** One practice row (P23-09 P1/P2): name, 「前回 …」 or today's count, and the last 7 days (oldest left, today right). */
function PracticeRow({ kind, title, sub, week, onOpen }: {
  kind: PracticeWeekKind;
  title: string;
  sub?: string;
  week: readonly boolean[];
  onOpen: () => void;
}) {
  const days = week.filter(Boolean).length;
  return (
    <button type="button" className="lv-home-practice-row w-full" onClick={onOpen} data-practice-kind={kind} data-testid="home-practice-row">
      <span className="lv-home-practice-icon" data-kind={kind}>
        {kind === "chord-dojo" ? <ChordDojoIcon size={20} /> : kind === "bass-practice" ? <BassPracticeIcon size={20} /> : <VoicingLoopIcon size={20} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-semibold">{title}</span>
        {sub ? <span className="truncate text-[12px] text-[var(--lv-text-muted)]">{sub}</span> : null}
      </span>
      <span className="lv-home-week" data-testid="home-practice-week" title="この 7 日の練習した日">
        <span className="sr-only">この 7 日で {days} 日</span>
        {week.map((practised, index) => <i key={index} aria-hidden="true" data-practised={practised} />)}
      </span>
    </button>
  );
}

type DrawerTab = "opened" | "keys";

function DrawerPanel({ summary, sound, openProgression, openVault, onPlaybackError }: {
  summary: HomeSummary;
  sound: PreviewSound;
  openProgression: (ideaId: string, blockId: string) => void;
  openVault: (keyCell?: string) => void;
  onPlaybackError: (error: unknown) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("opened");
  const top = summary.topOpened;
  const most = Math.max(1, ...top.map((entry) => entry.count));
  return (
    <section aria-label="自分の引き出し" className="lv-home-panel lv-home-drawer">
      <div className="lv-home-head">
        <span className="lv-home-title">自分の引き出し</span>
        <span className="flex-1" />
        <SegmentedControl<DrawerTab>
          label="自分の引き出し"
          value={tab}
          onChange={setTab}
          options={[{ value: "opened", label: "よく開く" }, { value: "keys", label: "キーで聴く" }]}
        />
      </div>
      {tab === "opened" ? (
        <div className="lv-home-drawer-body" data-testid="home-drawer-opened">
          <span className="lv-home-hint">この 1 週間でよく開いた進行</span>
          {top.length ? top.map(({ progression, count }, index) => (
            <button
              key={progression.id}
              type="button"
              className="lv-home-rank"
              data-testid="home-top-opened-row"
              onClick={() => openProgression(progression.idea.id, progression.block.id)}
            >
              <span className="lv-home-rank-no">{index + 1}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px] font-semibold">{progressionName(progression.idea, progression.block)}</span>
                <span className="lv-home-rank-chords">
                  {progression.block.chords.slice(0, 4).map((event, chordIndex) => (
                    <span key={event.eventId ?? chordIndex}>{displayChordLabel(event.chord.label)}</span>
                  ))}
                </span>
              </span>
              <span className="lv-home-rank-bar" aria-hidden="true"><i style={{ width: `${Math.round((count / most) * 100)}%` }} /></span>
              <span className="lv-home-mono text-[12px] text-[var(--lv-text-secondary)]">{count} 回</span>
            </button>
          )) : <p className="lv-home-empty">今週はまだ開いていません</p>}
        </div>
      ) : (
        <KeyDrawer progressions={summary.progressions} sound={sound} openVault={openVault} onPlaybackError={onPlaybackError} />
      )}
    </section>
  );
}

const WHEEL_SLOTS = Array.from({ length: 12 }, (_, slot) => slot);

/** 「キーで聴く」 (D3–D6): the wheel, the chosen key's progressions (▶ plays one), and the way to the rest in the Vault. */
function KeyDrawer({ progressions, sound, openVault, onPlaybackError }: {
  progressions: HomeProgression[];
  sound: PreviewSound;
  openVault: (keyCell?: string) => void;
  onPlaybackError: (error: unknown) => void;
}) {
  const wheel = useMemo(() => keyWheel(progressions), [progressions]);
  const [chosen, setChosen] = useState(() => initialKey(wheel));
  const { mode, slot } = chosen;
  const entries = wheel[mode][slot]!;
  const name = WHEEL_NAMES[mode][slot]!;
  return (
    <div className="lv-home-keys" data-testid="home-drawer-keys">
      <div className="lv-home-wheel">
        <KeyWheelSvg
          wheel={wheel}
          mode={mode}
          slot={slot}
          onPick={(next) => setChosen({ mode, slot: next })}
          onToggleMode={() => setChosen({ mode: mode === "major" ? "minor" : "major", slot })}
        />
        <span className="lv-home-legend" aria-hidden="true"><i /><i /><i />濃いほど多い</span>
      </div>
      <div className="lv-home-keys-side">
        <p className="lv-home-hint" data-testid="home-key-count">
          {entries.length ? `${name} ${MODE_NAMES[mode]}の進行 ・ ${entries.length} 件` : `${name} ${MODE_NAMES[mode]}`}
        </p>
        {entries.length ? entries.slice(0, 3).map((entry) => (
          <TimelinePlayButton
            key={entry.id}
            source={{ kind: "home", id: `key:${entry.id}` }}
            block={entry.block}
            idea={entry.idea}
            sound={sound}
            className="lv-home-key-row"
            playLabel={`${progressionName(entry.idea, entry.block)} を試聴`}
            onError={onPlaybackError}
          >
            <span className="truncate text-left text-[13px] font-semibold">{progressionName(entry.idea, entry.block)}</span>
            <span className="text-[12px] text-[var(--lv-text-muted)]">{progressionBars(entry.block)}小節</span>
          </TimelinePlayButton>
        )) : <p className="lv-home-empty">このキーの進行はまだありません。</p>}
        {entries.length > 3 ? (
          <button type="button" className="lv-home-link self-end" onClick={() => openVault(keyCellOf(progressionKey(entries[0]!.idea, entries[0]!.block)))}>
            ほか {entries.length - 3} 件を Vault で見る<Glyph d={CHEVRON} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The wheel: 12 keys on the circle of fifths; the middle names the chosen key and switches メジャー ⇄ マイナー. */
function KeyWheelSvg({ wheel, mode, slot, onPick, onToggleMode }: {
  wheel: KeyWheel;
  mode: KeyMode;
  slot: number;
  onPick: (slot: number) => void;
  onToggleMode: () => void;
}) {
  const counts = wheel[mode].map((entries) => entries.length);
  const most = Math.max(1, ...counts);
  const point = (radius: number, angle: number) => `${75 + radius * Math.cos(angle)},${75 + radius * Math.sin(angle)}`;
  return (
    <svg viewBox="0 0 150 150" width="150" height="150" className="lv-home-wheel-svg" role="group" aria-label="キーごとの進行の数">
      {WHEEL_SLOTS.map((index) => {
        const from = ((index * 30 - 105) * Math.PI) / 180;
        const to = ((index * 30 - 75) * Math.PI) / 180;
        const middle = (from + to) / 2;
        const count = counts[index]!;
        const selected = index === slot;
        const label = WHEEL_NAMES[mode][index]!;
        const pick = () => onPick(index);
        return (
          <g
            key={index}
            role="button"
            tabIndex={0}
            aria-label={`${label} ${MODE_NAMES[mode]}・${count} 件`}
            aria-pressed={selected}
            className="lv-home-wheel-key"
            data-key-slot={index}
            data-count={count}
            data-selected={selected}
            onClick={pick}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              pick();
            }}
          >
            <path
              d={`M${point(72, from)}A72,72 0 0 1 ${point(72, to)}L${point(40, to)}A40,40 0 0 0 ${point(40, from)}Z`}
              style={selected || !count ? undefined : { fill: `rgb(66 216 198 / ${Math.round((0.22 + 0.58 * (count / most)) * 100)}%)` }}
            />
            <text x={75 + 56 * Math.cos(middle)} y={75 + 56 * Math.sin(middle) + 4} textAnchor="middle">{label}</text>
          </g>
        );
      })}
      <g
        role="button"
        tabIndex={0}
        className="lv-home-wheel-center"
        aria-label={`${MODE_NAMES[mode === "major" ? "minor" : "major"]}に切り替える`}
        onClick={onToggleMode}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onToggleMode();
        }}
      >
        <title>{`${MODE_NAMES[mode === "major" ? "minor" : "major"]}に切り替える`}</title>
        <circle cx="75" cy="75" r="37" />
        <text x="75" y="76" textAnchor="middle" className="lv-home-wheel-name">{WHEEL_NAMES[mode][slot]}</text>
        <text x="75" y="91" textAnchor="middle" className="lv-home-wheel-mode">{MODE_NAMES[mode]}</text>
        <text x="75" y="104" textAnchor="middle" className="lv-home-wheel-swap">⇄</text>
      </g>
    </svg>
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
          onError={onPlaybackError}
        />
      </span>
      <button type="button" className="lv-home-recent-name" onClick={(event) => { event.stopPropagation(); onOpen(); }}>
        <span className="truncate text-[14px] font-semibold">{progressionName(idea, block)}</span>
        <span className="truncate text-[12px] text-[var(--lv-text-muted)]">
          <i className="lv-home-src-mark" data-source={progressionSourceKind(block)}>{progressionSourceLabels[progressionSourceKind(block)]}</i>
          {[keyLabel(progressionKey(idea, block)), `${progressionBars(block)}小節`, formatWhen(entry.touchedAt, now, false)].join(" ・ ")}
        </span>
      </button>
      <span className="lv-home-recent-chips">
        {block.chords.slice(0, 4).map((event, index) => (
          <RecentChord key={event.eventId ?? index} entry={entry} index={index} sound={sound} onPlaybackError={onPlaybackError} />
        ))}
      </span>
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
  const bpm = progressionBpm(idea, block);
  const items = [keyLabel(progressionKey(idea, block)), bpm ? `BPM ${bpm}` : "BPM なし", `${bars}小節`];
  if (inline) return <span className={`lv-home-meta-inline ${className}`}>{items.join(" ・ ")}</span>;
  return (
    <div className={`lv-home-meta ${className}`}>
      {items.map((item, index) => <span key={index} className={index ? "lv-home-mono" : undefined}>{item}</span>)}
    </div>
  );
}

function TimelinePlayButton({ source, block, idea, sound, className, playLabel = "試聴", showLabel = false, iconSize = 16, onError, children }: {
  source: PlayingSource;
  block: SavedProgressionBlock;
  idea: SongIdea;
  sound: PreviewSound;
  className: string;
  playLabel?: string;
  showLabel?: boolean;
  iconSize?: number;
  onError: (error: unknown) => void;
  children?: ReactNode;
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
      {children ? <span className="lv-home-key-play">{active ? <StopIcon size={iconSize} /> : <PlayIcon size={iconSize} />}</span> : active ? <StopIcon size={iconSize} /> : <PlayIcon size={iconSize} />}
      {showLabel ? <span>{active ? "停止" : "試聴"}</span> : null}
      {children}
    </button>
  );
}

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
