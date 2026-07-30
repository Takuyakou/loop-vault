import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { PlayToggle } from "../components/PlayToggle";
import { usePreviewSound } from "../components/PreviewSoundProvider";
import { Badge, Button, Surface } from "../components/ui";
import { displayKey, statusLabel } from "../domain/displayLabels";
import { pickFocus } from "../domain/focus";
import { degreeSequence } from "../domain/harmony/degrees";
import { beatsPerBar } from "../domain/midi";
import { resolveTimelineVoicings } from "../domain/voicing";
import { monthlyStats } from "../domain/monthlyStats";
import { formatProgressionText } from "../domain/progressionText";
import type { TransitionResult } from "../domain/transition";
import type { SavedProgressionBlock, SongIdea, Status } from "../domain/types";
import type { AppCopy, AppLanguage } from "../i18n";

const pipeline: Status[] = ["idea", "loop", "arrange", "mix", "done"];

export function HomeView({
  ideas,
  monthlyGoal,
  copy,
  language,
  showRomanNumerals,
  openDetail,
  openCapture,
  openCreate,
  openVault,
  updateNextAction,
  transitionIdea,
  setToast,
}: {
  ideas: SongIdea[];
  monthlyGoal: number;
  copy: AppCopy;
  language: AppLanguage;
  showRomanNumerals: boolean;
  openDetail: (id: string) => void;
  openCapture: () => void;
  openCreate: () => void;
  openVault: () => void;
  updateNextAction: (id: string, text: string, now?: Date) => void;
  transitionIdea: (id: string, to: Status, now?: Date) => TransitionResult;
  setToast: (toast: string) => void;
}) {
  const { sound: previewSound } = usePreviewSound();
  const [now, setNow] = useState(() => new Date());
  const focus = pickFocus(ideas, now);
  const stats = monthlyStats(ideas, now, monthlyGoal);
  const progress = Math.min(100, (stats.doneCount / stats.goal) * 100);
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
    updateNextAction(idea.id, "", new Date());
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
                  {` · ${statusLabel(focus.focus.status, language)}`}
                </p>
              </>
            ) : (
              <h2 className="mt-2 text-xl font-bold text-[var(--lv-text)] sm:text-2xl">
                {copy.home.today}
              </h2>
            )}
          </div>
          {focus.focus ? (
            <Badge tone="teal">{statusLabel(focus.focus.status, language)}</Badge>
          ) : null}
        </div>

        {focus.focus ? (
          <>
            {focusBlock ? (
              <FocusChordCards
                block={focusBlock}
                degrees={focusDegrees}
                fallback={focusPreview}
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
                      explicitMidiNotesByEventId: resolveTimelineVoicings(focusBlock.chords),
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

      <section aria-label={copy.home.overviewLabel} className="border-b border-[var(--lv-border)] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p data-testid="home-overview-summary" className="text-sm font-medium text-[var(--lv-text-secondary)]">
            {copy.home.overviewSummary(stats.doneCount, stats.goal, focus.needsNextAction.length, focus.stale.length)}
          </p>
          <span className="text-xs text-[var(--lv-text-muted)]">{copy.home.daysLeft(stats.remainingDays)}</span>
        </div>
        <div
          aria-label={copy.home.monthlyFinish}
          aria-valuemax={stats.goal}
          aria-valuemin={0}
          aria-valuenow={stats.doneCount}
          className="mt-2 h-1.5 overflow-hidden rounded bg-[var(--lv-surface-raised)]"
          role="progressbar"
        >
          <div className="h-full bg-[var(--lv-accent)]" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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
                        explicitMidiNotesByEventId: resolveTimelineVoicings(block.chords),
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

        <aside className="space-y-3 text-sm">
          <Surface variant="raised" className="p-4">
            <h2 className="lv-section-title">{copy.home.pipeline}</h2>
            <div className="mt-4 space-y-3">
              {pipeline.map((status) => (
                <div key={status}>
                  <div className="flex justify-between text-xs">
                    <span>{statusLabel(status, language)}</span>
                    <span className="text-[var(--lv-text-muted)]">{stats.pipelineCounts[status]}</span>
                  </div>
                  <div className="mt-1.5 h-1 rounded bg-[var(--lv-bg-subtle)]">
                    <div
                      className="h-full rounded bg-[var(--lv-accent)]"
                      style={{ width: `${Math.min(100, stats.pipelineCounts[status] * 18)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Surface>
          {focus.stale.length ? (
            <Surface className="border-[color-mix(in_srgb,var(--lv-warning)_42%,var(--lv-border))] p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[var(--lv-warning)]">{copy.home.stale}</h2>
                <Badge tone="warning">{focus.stale.length}</Badge>
              </div>
              <div className="mt-2 space-y-2">
                {focus.stale.map((entry) => (
                  <div key={entry.idea.id} className="flex items-center justify-between gap-3 border-t border-[var(--lv-border)] pt-2">
                    <button
                      type="button"
                      className="min-w-0 truncate text-left text-xs font-medium hover:text-[var(--lv-accent)]"
                      onClick={() => openDetail(entry.idea.id)}
                      title={entry.idea.title}
                    >
                      {entry.idea.title}
                    </button>
                    {entry.suggestHold ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const result = transitionIdea(entry.idea.id, "hold", new Date());
                          if (!result.ok) setToast(result.error.message);
                        }}
                      >
                        {copy.home.suggestHold}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </Surface>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function FocusChordCards({
  block,
  degrees,
  fallback,
}: {
  block: SavedProgressionBlock;
  degrees: string[];
  fallback?: string;
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
        <div
          key={`${event.bar}:${event.beat}:${index}`}
          className="flex min-h-20 min-w-28 flex-col justify-between rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] p-3 first:border-[var(--lv-accent)] first:bg-[var(--lv-accent-soft)]"
        >
          <span className="text-[11px] text-[var(--lv-text-muted)]">
            {String(index + 1).padStart(2, "0")} · {event.bar} bar
          </span>
          <strong className="mt-2 text-lg text-[var(--lv-text)]">{event.chord.label}</strong>
          {degrees[index] ? (
            <span className="mt-1 text-xs text-[var(--lv-text-secondary)]">{degrees[index]}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
