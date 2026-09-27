import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  playbackController,
  samePlaybackSource,
} from "../audio/playbackController";
import type { PreviewSound } from "../audio/chordPreview";
import { PlayToggle } from "../components/PlayToggle";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { Button, Surface } from "../components/ui";
import { voiceChordForPreview } from "../domain/chordVoicing";
import { voiceTextChordForAudition } from "../domain/textChordTones";
import { displayKey } from "../domain/displayLabels";
import { pickFocus } from "../domain/focus";
import { degreeSequence } from "../domain/harmony/degrees";
import { beatsPerBar } from "../domain/midi";
import {
  resolveTimelineVoicings,
  resolveVoicingForUse,
} from "../domain/voicing";
import { formatProgressionText } from "../domain/progressionText";
import { usePlaybackState } from "../hooks/usePlaybackState";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import type { AppCopy, AppLanguage } from "../i18n";


export function HomeView({
  bassPracticeCard,
  ideas,
  copy,
  language,
  showRomanNumerals,
  openDetail,
  openCapture,
  openCreate,
  openVault,
  updateNextAction,
  setToast,
}: {
  bassPracticeCard?: ReactNode;
  ideas: SongIdea[];
  copy: AppCopy;
  language: AppLanguage;
  showRomanNumerals: boolean;
  openDetail: (id: string) => void;
  openCapture: () => void;
  openCreate: () => void;
  openVault: () => void;
  updateNextAction: (id: string, text: string, now?: Date) => boolean | "pending";
  setToast: (toast: string) => void;
}) {
  const { sound: previewSound } = usePreviewSound();
  const [now, setNow] = useState(() => new Date());
  const focus = pickFocus(ideas, now);
  const focusBlock = focus.focus?.progressionBlocks?.[0];
  const focusDegrees = focusBlock && showRomanNumerals ? degreeSequence(focusBlock) : [];
  const focusPreview = focusBlock
    ? formatProgressionText(focusBlock.chords).split("\n")[0]
    : focus.focus?.chordMemo.split("\n").find((line) => line.trim());
  const recentProgressions = ideas
    .flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => ({ idea, block })))
    .sort((left, right) => new Date(right.block.capturedAt).getTime() - new Date(left.block.capturedAt).getTime())
    .slice(0, 3);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  function completeNext(idea: SongIdea) {
    if (updateNextAction(idea.id, "", new Date()) !== true) return;
    setToast(copy.toast.nextCompleted);
  }

  return (
    <div className="space-y-4">
      <Surface variant="primary" className="overflow-hidden p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="lv-section-kicker">{copy.home.today}</p>
            {focus.focus ? (
              <>
                <h2 className="mt-2 break-words text-xl font-bold text-[var(--lv-text)] sm:text-2xl">
                  {focus.focus.title}
                </h2>
                <p className="mt-1.5 text-xs text-[var(--lv-text-muted)]">
                  {focus.focus.bpm ? `${focus.focus.bpm} BPM` : copy.home.bpmUnset}
                  {focus.focus.key ? ` · ${displayKey(focus.focus.key, language)}` : ""}
                </p>
              </>
            ) : (
              <h2 className="mt-2 text-xl font-bold text-[var(--lv-text)] sm:text-2xl">
                {copy.home.today}
              </h2>
            )}
          </div>
        </div>

        {focus.focus ? (
          <>
            {focusBlock ? (
              <FocusChordCards
                block={focusBlock}
                degrees={focusDegrees}
                fallback={focusPreview}
                ideaId={focus.focus.id}
                sound={previewSound}
                playLabel={copy.common.preview}
                stopLabel={copy.common.stop}
                onPlaybackError={(error) => setToast(
                  error instanceof Error ? error.message : copy.toast.chordPreviewFailed,
                )}
              />
            ) : focusPreview ? (
              <p className="mt-5 break-words border-y border-[var(--lv-border)] py-4 text-sm text-[var(--lv-text-secondary)]">
                {focusPreview}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-4 border-t border-[var(--lv-border)] pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--lv-text-muted)]">
                  {copy.home.nextAction}
                </p>
                <p className="mt-1 break-words text-sm font-medium text-[var(--lv-text)]">
                  {focus.focus.nextAction.text}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {focusBlock ? (
                  <PlayToggle
                    source={{ kind: "home", id: `idea:${focus.focus.id}:block:${focusBlock.id}` }}
                    request={{
                      type: "timeline",
                      timeline: focusBlock.chords,
                      bpm: focusBlock.bpm ?? focus.focus.bpm,
                      sound: previewSound,
                      beatsPerBar: beatsPerBar(focusBlock.timeSignature),
                      explicitMidiNotesByEventId: resolveTimelineVoicings(focusBlock.chords, Boolean(focusBlock.textSource)),
                    }}
                    playLabel={copy.common.preview}
                    stopLabel={copy.common.stop}
                    className="lv-button-secondary grid h-10 w-10 place-items-center"
                    showLabel={false}
                    onError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
                  />
                ) : null}
                <Button variant="secondary" onClick={() => openDetail(focus.focus!.id)}>
                  {copy.home.openDetails}
                </Button>
                <Button variant="primary" onClick={() => completeNext(focus.focus!)}>
                  <Check aria-hidden="true" size={16} />
                  {copy.home.completeNextAction}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4 max-w-2xl">
            <p className="text-sm leading-6 text-[var(--lv-text-secondary)]">{copy.home.noFocus}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" onClick={openCapture}>{copy.home.startCapture}</Button>
              <Button variant="ghost" onClick={openCreate}>{copy.home.newIdea}</Button>
              <Button variant="ghost" onClick={openVault}>{copy.home.openVault}</Button>
            </div>
          </div>
        )}
      </Surface>

      {bassPracticeCard}

      <div className="grid min-h-0 gap-4">
        <Surface className="min-w-0 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="lv-section-title">{copy.home.recentProgressions}</h2>
            <button
              type="button"
              className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[var(--lv-accent)] hover:text-[var(--lv-text)]"
              onClick={openVault}
            >
              {copy.home.openVault}
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          </div>
          {recentProgressions.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {recentProgressions.map(({ idea, block }) => (
                <article key={block.id} className="min-w-0 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] p-4">
                  <p className="line-clamp-1 font-semibold" title={block.summaryText || copy.home.savedProgression}>
                    {block.summaryText || copy.home.savedProgression}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--lv-text-muted)]" title={idea.title}>{idea.title}</p>
                  <p className="mt-3 line-clamp-2 break-words text-sm font-medium text-[var(--lv-accent)]">
                    {formatProgressionText(block.chords).split("\n")[0]}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <PlayToggle
                      source={{ kind: "home", id: `idea:${idea.id}:block:${block.id}` }}
                      request={{
                        type: "timeline",
                        timeline: block.chords,
                        bpm: block.bpm ?? idea.bpm,
                        sound: previewSound,
                        beatsPerBar: beatsPerBar(block.timeSignature),
                        explicitMidiNotesByEventId: resolveTimelineVoicings(block.chords, Boolean(block.textSource)),
                      }}
                      playLabel={copy.common.preview}
                      stopLabel={copy.common.stop}
                      className="lv-button-secondary grid h-9 w-9 place-items-center"
                      showLabel={false}
                      onError={(error) => setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed)}
                    />
                    <Button variant="secondary" size="sm" onClick={() => openDetail(idea.id)}>
                      {copy.home.openInVault}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--lv-text-muted)]">{copy.home.noSavedProgressions}</p>
          )}
        </Surface>

      </div>
    </div>
  );
}

function FocusChordCards({
  block,
  degrees,
  fallback,
  ideaId,
  sound,
  playLabel,
  stopLabel,
  onPlaybackError,
}: {
  block: SavedProgressionBlock;
  degrees: string[];
  fallback?: string;
  ideaId: string;
  sound: PreviewSound;
  playLabel: string;
  stopLabel: string;
  onPlaybackError: (error: unknown) => void;
}) {
  if (!block.chords.length) {
    return fallback ? (
      <p className="mt-5 break-words text-sm text-[var(--lv-text-secondary)]">{fallback}</p>
    ) : null;
  }

  return (
    <div
      className="mt-5 flex gap-2 overflow-x-auto pb-1"
      aria-label="Chord progression"
      data-testid="home-focus-chords"
    >
      {block.chords.map((event, index) => (
        <FocusChordCard
          key={`${event.bar}:${event.beat}:${index}`}
          blockId={block.id}
          textDerived={Boolean(block.textSource)}
          event={event}
          ideaId={ideaId}
          index={index}
          sound={sound}
          playLabel={playLabel}
          stopLabel={stopLabel}
          onPlaybackError={onPlaybackError}
        >
          <span className="text-[11px] text-[var(--lv-text-muted)]">
            {String(index + 1).padStart(2, "0")} · {event.bar} bar
          </span>
          <strong className="mt-2 text-lg text-[var(--lv-text)]">{event.chord.label}</strong>
          {degrees[index] ? (
            <span className="mt-1 text-xs text-[var(--lv-text-secondary)]">{degrees[index]}</span>
          ) : null}
        </FocusChordCard>
      ))}
    </div>
  );
}

function FocusChordCard({
  blockId,
  textDerived,
  event,
  ideaId,
  index,
  sound,
  playLabel,
  stopLabel,
  onPlaybackError,
  children,
}: {
  blockId: string;
  textDerived: boolean;
  event: SavedProgressionBlock["chords"][number];
  ideaId: string;
  index: number;
  sound: PreviewSound;
  playLabel: string;
  stopLabel: string;
  onPlaybackError: (error: unknown) => void;
  children: ReactNode;
}) {
  const playback = usePlaybackState();
  const source = {
    kind: "home" as const,
    id: `idea:${ideaId}:block:${blockId}:chord:${event.eventId ?? `${event.bar}:${event.beat}:${index}`}`,
  };
  const playing = playback.status !== "idle"
    && samePlaybackSource(playback.source, source);
  const actionLabel = playing ? stopLabel : playLabel;
  const explicitMidiNotes = resolveVoicingForUse(
    event.chord,
    event.voicingMemory,
    textDerived ? [...voiceTextChordForAudition(event.chord)] : voiceChordForPreview(event.chord).notes,
  ).midiNotes;

  return (
    <button
      type="button"
      className={`relative flex min-h-20 min-w-28 flex-col justify-between overflow-hidden rounded-[var(--lv-radius-md)] border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-focus)] ${
        playing
          ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)]"
          : index === 0
            ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] hover:bg-[var(--lv-surface-raised)]"
            : "border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] hover:border-[var(--lv-accent)] hover:bg-[var(--lv-surface-raised)]"
      }`}
      data-home-focus-chord={index}
      data-playing={playing}
      aria-label={`${actionLabel}: ${event.chord.label}`}
      aria-pressed={playing}
      aria-busy={playing && playback.status === "starting"}
      title={`${actionLabel}: ${event.chord.label}`}
      onClick={() => void playbackController.toggle(source, {
        type: "chord",
        chord: event.chord,
        sound,
        explicitMidiNotes,
      }).catch(onPlaybackError)}
    >
      {children}
      {playing ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-1 bg-[var(--lv-accent)]"
        />
      ) : null}
    </button>
  );
}
