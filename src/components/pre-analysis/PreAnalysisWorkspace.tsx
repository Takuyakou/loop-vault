import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Play,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  previewMidiNotes,
  stopPreview,
} from "../../audio/chordPreview";
import { usePreviewSound } from "../PreviewSoundProvider";
import {
  applyAnalysisSessionPreset,
  analysisSessionVoiceContributionPreset,
  resetAnalysisSessionAuto,
  setAnalysisSessionVoiceContributionPreset,
  sessionPreviewNotes,
  updateAnalysisSessionSource,
  updateAnalysisSessionVoice,
  type AnalysisSession,
  type AnalysisSessionWarningCode,
  type PreAnalysisSelectionPreset,
  type PreAnalysisVoiceRole,
} from "../../domain/midi/preAnalysis";
import type { AppLanguage } from "../../i18n";
import type { VoiceContributionPreset } from "../../domain/midi/types";
import { needsPreAnalysisReview } from "../../storage/preAnalysisSettings";
import {
  PreAnalysisPianoRoll,
  preAnalysisVoiceColor,
  visibleBeatCount as pianoRollVisibleBeatCount,
} from "./PreAnalysisPianoRoll";
import { PreAnalysisTimeScrollbar } from "./PreAnalysisTimeScrollbar";
import { Button, IconButton, StatusMessage } from "../ui";

type PianoRollDisplayScope = "analysis-targets" | "all-voices";

interface PreAnalysisWorkspaceProps {
  session: AnalysisSession;
  language: AppLanguage;
  busy?: boolean;
  onSessionChange: (session: AnalysisSession) => void;
  onAddMidi: () => void;
  onRemoveSource: (sourceId: string) => void;
  onAnalyze: () => void;
  onPlay?: () => void;
  onStop?: () => void;
}

export function PreAnalysisWorkspace({
  session,
  language,
  busy = false,
  onSessionChange,
  onAddMidi,
  onRemoveSource,
  onAnalyze,
  onPlay,
  onStop,
}: PreAnalysisWorkspaceProps) {
  const copy = workspaceCopy(language);
  const [selectedVoiceId, setSelectedVoiceId] = useState(
    session.voices[0]?.id,
  );
  const [zoom, setZoom] = useState(1);
  const [viewportStartBeat, setViewportStartBeat] = useState(0);
  const [pianoRollDisplayScope, setPianoRollDisplayScope] =
    useState<PianoRollDisplayScope>("analysis-targets");
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [follow, setFollow] = useState(true);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [playbackError, setPlaybackError] = useState<string>();
  const autoExpanded = needsPreAnalysisReview(session);
  const [detailsExpanded, setDetailsExpanded] = useState(autoExpanded);
  const [highlightedSourceId, setHighlightedSourceId] = useState(
    session.latestSourceId,
  );
  const playheadTimerRef = useRef<ReturnType<typeof globalThis.setInterval>>();
  const { sound: previewSound } = usePreviewSound();
  const includedCount = session.voices.filter((voice) =>
    voice.included && !voice.isDrum && !voice.duplicateOf).length;
  const voiceContributionPreset = analysisSessionVoiceContributionPreset(session);
  const recommended = useMemo(() => {
    const harmony = session.voices.filter((voice) =>
      voice.included && !voice.isDrum && voice.assignedRole === "harmony").length;
    const bass = session.voices.filter((voice) =>
      voice.included && !voice.isDrum && voice.assignedRole === "bass").length;
    const excluded = session.voices.length - includedCount;
    return copy.recommendation(harmony, bass, excluded);
  }, [copy, includedCount, session.voices]);

  useEffect(() => () => {
    stopPreview();
    if (playheadTimerRef.current) {
      globalThis.clearInterval(playheadTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (autoExpanded) setDetailsExpanded(true);
  }, [autoExpanded]);

  useEffect(() => {
    const latestSourceId = session.latestSourceId;
    if (!latestSourceId) {
      setHighlightedSourceId(undefined);
      return undefined;
    }
    setHighlightedSourceId(latestSourceId);
    const newestVoice = session.voices.find((voice) =>
      voice.sourceId === latestSourceId);
    if (newestVoice) setSelectedVoiceId(newestVoice.id);
    const timer = globalThis.setTimeout(
      () => setHighlightedSourceId(undefined),
      1800,
    );
    return () => globalThis.clearTimeout(timer);
  }, [session.latestSourceId]);

  useEffect(() => {
    const selected = session.voices.find((voice) =>
      voice.id === selectedVoiceId);
    if (
      selected
      && (
        pianoRollDisplayScope === "all-voices"
        || selected.included
      )
    ) return;
    const fallback = pianoRollDisplayScope === "analysis-targets"
      ? session.voices.find((voice) => voice.included && voice.visible)
      : session.voices.find((voice) => voice.visible);
    setSelectedVoiceId(fallback?.id ?? session.voices[0]?.id);
  }, [pianoRollDisplayScope, selectedVoiceId, session.voices]);

  useEffect(() => {
    const totalBeats = sessionDuration(session);
    const visibleBeats = Math.min(
      totalBeats,
      pianoRollVisibleBeatCount(session, zoom),
    );
    const maxStartBeat = Math.max(0, totalBeats - visibleBeats);
    setViewportStartBeat((current) => Math.min(current, maxStartBeat));
  }, [session, zoom]);

  function stopSessionPlayback() {
    onStop?.();
    stopPreview();
    if (playheadTimerRef.current) {
      globalThis.clearInterval(playheadTimerRef.current);
      playheadTimerRef.current = undefined;
    }
    setPlaybackActive(false);
  }

  async function playSession() {
    if (onPlay) {
      setPlaybackActive(true);
      onPlay();
      return;
    }
    setPlaybackError(undefined);
    const master = session.sources.find((source) =>
      source.id === session.masterSourceId) ?? session.sources[0];
    const bpm = master?.tempoMap[0]?.bpm ?? 96;
    const totalBeats = sessionDuration(session);
    const playbackStartBeat = playheadBeat >= totalBeats ? 0 : playheadBeat;
    const previewNotes = sessionPreviewNotes(session, playbackStartBeat);
    if (!previewNotes.length) {
      setPlaybackError(copy.noAudibleVoices);
      return;
    }
    setPlayheadBeat(playbackStartBeat);
    setPlaybackActive(true);
    try {
      await previewMidiNotes(previewNotes, bpm, previewSound, {
        onStarted() {
          setPlaybackActive(true);
          const startedAt = performanceNow();
          playheadTimerRef.current = globalThis.setInterval(() => {
            const elapsedBeats = (
              performanceNow() - startedAt
            ) / 1000 * bpm / 60;
            const nextBeat = Math.min(
              totalBeats,
              playbackStartBeat + elapsedBeats,
            );
            setPlayheadBeat(nextBeat);
            if (follow) {
              setViewportStartBeat(viewportStartForBeat(
                session,
                zoom,
                nextBeat,
              ));
            }
          }, 50);
        },
        onEnded() {
          if (playheadTimerRef.current) {
            globalThis.clearInterval(playheadTimerRef.current);
            playheadTimerRef.current = undefined;
          }
          setPlaybackActive(false);
        },
      });
    } catch {
      stopSessionPlayback();
      setPlaybackError(copy.playbackFailed);
    }
  }

  function setPreset(preset: PreAnalysisSelectionPreset) {
    stopSessionPlayback();
    onSessionChange(applyAnalysisSessionPreset(session, preset));
  }

  function setVoiceContributionPreset(preset: VoiceContributionPreset) {
    stopSessionPlayback();
    onSessionChange(setAnalysisSessionVoiceContributionPreset(session, preset));
  }

  function moveVoiceContributionPreset(
    event: KeyboardEvent<HTMLButtonElement>,
    current: VoiceContributionPreset,
  ) {
    const presets: readonly VoiceContributionPreset[] = ["standard", "harmonic-core"];
    const currentIndex = presets.indexOf(current);
    const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? (currentIndex + 1) % presets.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? (currentIndex + presets.length - 1) % presets.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? presets.length - 1
            : undefined;
    if (nextIndex === undefined) return;

    event.preventDefault();
    const nextPreset = presets[nextIndex];
    setVoiceContributionPreset(nextPreset);
    event.currentTarget.closest<HTMLElement>("[role='radiogroup']")
      ?.querySelector<HTMLButtonElement>(
        `[data-analysis-contribution-preset='${nextPreset}']`,
      )?.focus();
  }

  function updateVoice(
    voiceId: string,
    changes: Parameters<typeof updateAnalysisSessionVoice>[2],
  ) {
    if (
      changes.muted !== undefined
      || changes.solo !== undefined
      || changes.assignedRole !== undefined
      || changes.included !== undefined
    ) {
      stopSessionPlayback();
    }
    const next = updateAnalysisSessionVoice(session, voiceId, changes);
    const selectionChanged = changes.assignedRole !== undefined
      || changes.included !== undefined;
    onSessionChange(selectionChanged ? { ...next, preset: "custom" } : next);
  }

  function setTimelinePosition(beat: number) {
    const nextBeat = clamp(beat, 0, sessionDuration(session));
    stopSessionPlayback();
    setPlayheadBeat(nextBeat);
    setViewportStartBeat(viewportStartForBeat(session, zoom, nextBeat));
  }

  function setViewportPosition(beat: number) {
    const visibleBeats = Math.min(
      sessionDuration(session),
      pianoRollVisibleBeatCount(session, zoom),
    );
    const maxStart = Math.max(0, sessionDuration(session) - visibleBeats);
    const nextStart = clamp(beat, 0, maxStart);
    stopSessionPlayback();
    setViewportStartBeat(nextStart);
    setPlayheadBeat(nextStart);
  }

  return (
    <section
      className="py-1"
      data-testid="pre-analysis-workspace"
      data-pre-analysis-mode={detailsExpanded ? "expanded" : "compact"}
    >
      <div className="lv-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="lv-section-kicker">
              MIDI ANALYSIS
            </p>
            <h2 className="mt-1.5 text-xl font-bold">{copy.loadedMidi}</h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--lv-text-secondary)]">
              {copy.description}
            </p>
          </div>
          <div
            className="flex w-full flex-wrap items-center justify-end gap-2 xl:w-auto"
            data-testid="pre-analysis-primary-actions"
          >
            <Button
              variant="secondary"
              className="justify-start px-3"
              aria-expanded={detailsExpanded}
              aria-controls="pre-analysis-part-details"
              onClick={() => setDetailsExpanded((expanded) => !expanded)}
            >
              {detailsExpanded
                ? <ChevronDown size={16} aria-hidden="true" />
                : <ChevronRight size={16} aria-hidden="true" />}
              <span className="min-w-0 truncate">{copy.partDetails}</span>
              <span className="ml-auto shrink-0 text-xs text-[var(--lv-text-muted)]">
                {copy.voiceCount(session.voices.length)}
              </span>
            </Button>
            <Button
              variant="secondary"
              className="justify-start px-3"
              data-testid="pre-analysis-add-midi"
              onClick={onAddMidi}
            >
              <Plus size={16} aria-hidden="true" />
              {copy.addMidi}
            </Button>
            <Button
              variant="primary"
              className="min-w-28"
              data-testid="pre-analysis-analyze"
              disabled={busy || includedCount === 0}
              onClick={onAnalyze}
              aria-describedby={includedCount === 0 ? "pre-analysis-disabled-reason" : undefined}
            >
              {busy ? copy.preparing : copy.analyze}
            </Button>
            <p className="w-full text-right text-xs leading-5 text-[var(--lv-text-secondary)]" aria-live="polite">
              {copy.targetSummary(includedCount, session.voices.length)}
            </p>
            {includedCount === 0 ? (
              <p id="pre-analysis-disabled-reason" className="w-full text-right text-xs text-[var(--lv-warning)]">
                {copy.selectAtLeastOne}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2" aria-label={copy.loadedMidi}>
          {session.sources.map((source) => (
            <div
              key={source.id}
              className={`min-w-0 max-w-full rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] px-3 py-2 ${
                highlightedSourceId === source.id ? "bg-[var(--lv-accent-soft)]" : ""
              }`}
              data-source-id={source.id}
              data-new-source={highlightedSourceId === source.id || undefined}
            >
              <p className="max-w-72 truncate text-sm font-semibold" title={source.displayName}>
                {source.displayName}
              </p>
              <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
                {sourceSummary(source)}
              </p>
            </div>
          ))}
        </div>

        {!detailsExpanded ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-l-2 border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] px-4 py-3">
            <p className="text-sm text-[var(--lv-text-secondary)]">
              {copy.compactSummary(session.voices.find((voice) =>
                voice.included)?.displayName ?? copy.unknownVoice)}
            </p>
            <span className="text-xs text-[var(--lv-text-muted)]">
              {copy.optionalDetails}
            </span>
          </div>
        ) : null}

        {detailsExpanded ? (
          <div id="pre-analysis-part-details">
            <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-[var(--lv-border)] py-3">
              <Button
                variant={playbackActive ? "danger" : "primary"}
                className={playbackActive
                  ? "border-rose-300/70 bg-rose-500/10 px-4 text-rose-100"
                  : "bg-[var(--lv-accent)] px-4 text-stone-950"}
                data-testid="pre-analysis-playback-toggle"
                title={playbackActive ? copy.stop : copy.play}
                aria-label={playbackActive ? copy.stop : copy.play}
                onClick={() => {
                  if (playbackActive) {
                    stopSessionPlayback();
                  } else {
                    void playSession();
                  }
                }}
              >
                {playbackActive
                  ? <Square size={16} aria-hidden="true" />
                  : <Play size={16} fill="currentColor" aria-hidden="true" />}
                {playbackActive ? copy.stop : copy.play}
              </Button>
              <label className="ml-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(event) => setFollow(event.currentTarget.checked)}
                />
                Follow
              </label>
              <span className="ml-auto text-sm text-[var(--lv-text-muted)]">
                {formatBeatTime(playheadBeat)} / {formatBeatTime(sessionDuration(session))}
              </span>
            </div>
            {playbackError ? (
              <p className="mt-3 text-sm text-red-200" role="alert">
                {playbackError}
              </p>
            ) : null}

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0">
                <PreAnalysisPianoRoll
                  session={session}
                  language={language}
                  selectedVoiceId={selectedVoiceId}
                  zoom={zoom}
                  viewportStartBeat={viewportStartBeat}
                  playheadBeat={playheadBeat}
                  showAnalysisTargetsOnly={
                    pianoRollDisplayScope === "analysis-targets"
                  }
                  onSelectVoice={setSelectedVoiceId}
                  onViewportStartChange={setViewportPosition}
                  onPlayheadBeatChange={(beat) => {
                    stopSessionPlayback();
                    setPlayheadBeat(beat);
                  }}
                />
                <PreAnalysisTimeScrollbar
                  language={language}
                  totalBeats={sessionDuration(session)}
                  visibleBeats={pianoRollVisibleBeatCount(session, zoom)}
                  viewportStartBeat={viewportStartBeat}
                  positionBeat={playheadBeat}
                  beatsPerBar={sessionBeatsPerBar(session)}
                  onPositionBeatChange={setTimelinePosition}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-[var(--lv-text-muted)]" htmlFor="pre-analysis-zoom">
                      {copy.zoom}
                    </label>
                    <input
                      id="pre-analysis-zoom"
                      className="w-40 accent-[var(--lv-accent)] sm:w-48"
                      type="range"
                      min="1"
                      max="8"
                      step="1"
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.currentTarget.value))}
                    />
                    <span className="text-xs text-[var(--lv-text-muted)]">{zoom}x</span>
                  </div>
                  <div
                    className="flex items-center gap-1"
                    role="group"
                    aria-label={copy.pianoRollDisplay}
                  >
                    <span className="mr-1 text-xs text-[var(--lv-text-muted)]">
                      {copy.display}
                    </span>
                    <button
                      type="button"
                      className={displayScopeClass(
                        pianoRollDisplayScope === "analysis-targets",
                      )}
                      data-piano-roll-scope="analysis-targets"
                      aria-pressed={
                        pianoRollDisplayScope === "analysis-targets"
                      }
                      onClick={() =>
                        setPianoRollDisplayScope("analysis-targets")}
                    >
                      {copy.analysisTargets}
                    </button>
                    <button
                      type="button"
                      className={displayScopeClass(
                        pianoRollDisplayScope === "all-voices",
                      )}
                      data-piano-roll-scope="all-voices"
                      aria-pressed={pianoRollDisplayScope === "all-voices"}
                      onClick={() => setPianoRollDisplayScope("all-voices")}
                    >
                      {copy.allVoices}
                    </button>
                  </div>
                </div>
              </div>

              <aside className="min-w-0 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] bg-[var(--lv-bg-subtle)] p-4">
                <h3 className="text-sm font-semibold">{copy.preset}</h3>
                <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={copy.preset}>
                  {presetOptions(copy).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      data-analysis-preset={option.value}
                      aria-checked={session.preset === option.value}
                      className={`border px-3 py-2 text-left text-sm ${
                        session.preset === option.value
                          ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)]"
                          : "border-[var(--lv-border)] hover:border-[var(--lv-border-strong)]"
                      }`}
                      onClick={() => setPreset(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 border-t border-[var(--lv-border)] pt-4">
                  <h4 id="pre-analysis-voice-contribution" className="text-sm font-semibold">
                    {copy.voiceContributionPreset}
                  </h4>
                  <div
                    className="mt-2 grid grid-cols-2 gap-2"
                    role="radiogroup"
                    aria-labelledby="pre-analysis-voice-contribution"
                    aria-describedby="pre-analysis-harmonic-core-description"
                  >
                    {voiceContributionOptions(copy).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        data-analysis-contribution-preset={option.value}
                        aria-checked={voiceContributionPreset === option.value}
                        tabIndex={voiceContributionPreset === option.value ? 0 : -1}
                        onKeyDown={(event) => moveVoiceContributionPreset(event, option.value)}
                        className={`border px-3 py-2 text-left text-sm ${
                          voiceContributionPreset === option.value
                            ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)]"
                            : "border-[var(--lv-border)] hover:border-[var(--lv-border-strong)]"
                        }`}
                        onClick={() => setVoiceContributionPreset(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p
                    id="pre-analysis-harmonic-core-description"
                    className="mt-2 text-xs text-[var(--lv-text-secondary)]"
                  >
                    {copy.harmonicCoreDescription}
                  </p>
                </div>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"
                  onClick={() => onSessionChange(resetAnalysisSessionAuto(session))}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  {copy.resetAuto}
                </button>

                <h3 className="mt-6 text-sm font-semibold">{copy.analysisParts}</h3>
                <div className="mt-3 max-h-[430px] overflow-y-auto border-y border-[var(--lv-border)]">
                  {session.sources.map((source) => {
                    const sourceVoices = session.voices.filter((voice) =>
                      voice.sourceId === source.id);
                    return (
                      <section
                        key={source.id}
                        className={`border-b border-[var(--lv-border)] py-3 last:border-b-0 ${
                          highlightedSourceId === source.id ? "bg-[var(--lv-accent-soft)]" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2 px-1">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={source.displayName}>
                            {source.displayName}
                          </span>
                          <IconToggle
                            active={source.visible}
                            label={source.visible ? copy.hideSource : copy.showSource}
                            onClick={() => onSessionChange(updateAnalysisSessionSource(
                              session,
                              source.id,
                              { visible: !source.visible },
                            ))}
                            activeIcon={<Eye size={16} />}
                            inactiveIcon={<EyeOff size={16} />}
                          />
                          <IconToggle
                            active={source.muted}
                            label={source.muted ? copy.unmuteSource : copy.muteSource}
                            onClick={() => {
                              stopSessionPlayback();
                              onSessionChange(updateAnalysisSessionSource(
                                session,
                                source.id,
                                { muted: !source.muted },
                              ));
                            }}
                            activeIcon={<VolumeX size={16} />}
                            inactiveIcon={<Volume2 size={16} />}
                          />
                          <IconButton
                            variant="ghost"
                            size="sm"
                            className="h-9 min-h-9 w-9 text-[var(--lv-text-muted)] hover:text-red-300"
                            title={copy.removeSource}
                            label={`${copy.removeSource}: ${source.displayName}`}
                            disabled={session.sources.length === 1}
                            onClick={() => {
                              stopSessionPlayback();
                              onRemoveSource(source.id);
                            }}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </IconButton>
                        </div>
                        <div className="mt-2 grid gap-1">
                          {sourceVoices.map((voice) => {
                            const voiceIndex = session.voices.findIndex((entry) =>
                              entry.id === voice.id);
                            const color = preAnalysisVoiceColor(voiceIndex);
                            return (
                              <div
                                key={voice.id}
                                className={`grid grid-cols-[auto_auto_auto_auto_minmax(0,1fr)] items-center gap-2 border-l-2 px-2 py-2 ${
                                  selectedVoiceId === voice.id ? "bg-[var(--lv-accent-soft)]" : ""
                                }`}
                                style={{ borderLeftColor: color }}
                                data-voice-id={voice.id}
                                data-voice-channel={voice.channel}
                                data-voice-color={color}
                                data-selected={selectedVoiceId === voice.id || undefined}
                              >
                                <input
                                  type="checkbox"
                                  checked={!voice.isDrum && voice.included}
                                  disabled={
                                    voice.isDrum
                                    || (session.preset !== "custom" && Boolean(voice.duplicateOf))
                                  }
                                  aria-label={copy.includeVoice(voice.displayName)}
                                  onChange={(event) => {
                                    const included = event.currentTarget.checked;
                                    const assignedRole = included
                                      && voice.assignedRole === "exclude"
                                      ? selectableRoleFor(voice.autoRole)
                                      : voice.assignedRole;
                                    updateVoice(voice.id, {
                                      included,
                                      assignedRole,
                                    });
                                  }}
                                />
                                <button
                                  type="button"
                                    className="h-8 w-8 border border-[var(--lv-border)] text-xs"
                                  aria-pressed={voice.solo}
                                  aria-label={copy.soloVoice(voice.displayName)}
                                  title={copy.solo}
                                  onClick={() => {
                                    stopSessionPlayback();
                                    onSessionChange({
                                      ...session,
                                      voices: session.voices.map((entry) => ({
                                        ...entry,
                                        solo: entry.id === voice.id ? !voice.solo : false,
                                      })),
                                    });
                                  }}
                                >
                                  S
                                </button>
                                <IconToggle
                                  active={voice.muted}
                                  label={voice.muted
                                    ? copy.unmuteVoice(voice.displayName)
                                    : copy.muteVoice(voice.displayName)}
                                  onClick={() => updateVoice(voice.id, {
                                    muted: !voice.muted,
                                  })}
                                  activeIcon={<VolumeX size={16} />}
                                  inactiveIcon={<Volume2 size={16} />}
                                />
                                <IconToggle
                                  active={voice.visible}
                                  label={voice.visible
                                    ? copy.hideVoice(voice.displayName)
                                    : copy.showVoice(voice.displayName)}
                                  onClick={() => updateVoice(voice.id, {
                                    visible: !voice.visible,
                                  })}
                                  activeIcon={<Eye size={16} />}
                                  inactiveIcon={<EyeOff size={16} />}
                                />
                                <button
                                  type="button"
                                  className="min-w-0 text-left"
                                  aria-pressed={selectedVoiceId === voice.id}
                                  onClick={() => setSelectedVoiceId(voice.id)}
                                >
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="size-2.5 shrink-0"
                                      style={{ backgroundColor: color }}
                                      aria-hidden="true"
                                    />
                                    <span className="truncate text-sm font-medium">
                                      {voice.displayName}
                                    </span>
                                  </span>
                                  <span className="mt-1 block text-xs text-[var(--lv-text-muted)]">
                                    {voiceMetadata(voice, copy)}
                                  </span>
                                </button>
                                <span className="col-span-4 col-start-2 flex flex-wrap items-center gap-2">
                                  <select
                                    className="min-h-9 border border-[var(--lv-border)] bg-[var(--lv-bg)] px-2 py-1 text-xs"
                                    aria-label={copy.roleFor(voice.displayName)}
                                    value={voice.isDrum ? "exclude" : voice.assignedRole}
                                    disabled={
                                      voice.isDrum
                                      || (session.preset !== "custom" && Boolean(voice.duplicateOf))
                                    }
                                    onChange={(event) => {
                                      const assignedRole = event.currentTarget.value as PreAnalysisVoiceRole;
                                      updateVoice(voice.id, {
                                        assignedRole,
                                        included: assignedRole !== "exclude",
                                      });
                                    }}
                                  >
                                    {roleOptions(copy).map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                  <span className="text-[10px] text-[var(--lv-text-muted)]">
                                    {copy.roleConfidence(confidenceBucketForVoice(voice))}
                                  </span>
                                  {(voice.autoRoleEvidenceKinds ?? []).map((kind) => (
                                    <span
                                      key={kind}
                                      className="border border-sky-400/50 px-2 py-0.5 text-[10px] text-sky-100"
                                    >
                                      {roleEvidenceLabel(kind, language)}
                                    </span>
                                  ))}
                                  {confidenceBucketForVoice(voice) === "low" ? (
                                    <span className="border border-amber-400/60 px-2 py-0.5 text-[10px] text-amber-200">
                                      {copy.review}
                                    </span>
                                  ) : null}
                                  {voice.hasProgramChanges ? (
                                    <span className="border border-sky-400/50 px-2 py-0.5 text-[10px] text-sky-200">
                                      {copy.programChanges}
                                    </span>
                                  ) : null}
                                  {voice.duplicateOf ? (
                                    <span className="border border-slate-400/50 px-2 py-0.5 text-[10px] text-slate-300">
                                      {copy.duplicateExcluded}
                                    </span>
                                  ) : null}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </aside>
            </div>

            {session.warnings.length ? (
              <StatusMessage className="mt-5" tone="warning" title={copy.warnings}>
                <ul className="mt-2 grid gap-1 text-sm text-amber-100/80">
                  {[...new Set(session.warnings.map((warning) =>
                    warningLabel(warning.code, language)))].map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </StatusMessage>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 border-t border-[var(--lv-border)] pt-5">
          <p className="text-sm text-[var(--lv-text-secondary)]">{recommended}</p>
        </div>
      </div>
    </section>
  );
}

function IconToggle({
  active,
  label,
  onClick,
  activeIcon,
  inactiveIcon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  activeIcon: ReactNode;
  inactiveIcon: ReactNode;
}) {
  return (
    <IconButton
      variant="ghost"
      size="sm"
      className="h-8 min-h-8 w-8 text-[var(--lv-text-muted)] hover:text-[var(--lv-text)]"
      label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {active ? activeIcon : inactiveIcon}
    </IconButton>
  );
}

function sessionDuration(session: AnalysisSession): number {
  return Math.max(0, ...session.sources.map((source) => source.durationBeats));
}

function viewportStartForBeat(
  session: AnalysisSession,
  zoom: number,
  beat: number,
): number {
  const totalBeats = sessionDuration(session);
  const visibleBeats = Math.min(
    totalBeats,
    pianoRollVisibleBeatCount(session, zoom),
  );
  const maxStart = Math.max(0, totalBeats - visibleBeats);
  return clamp(beat - visibleBeats / 2, 0, maxStart);
}

function sessionBeatsPerBar(session: AnalysisSession): number {
  const source = session.sources.find((candidate) =>
    candidate.id === session.masterSourceId) ?? session.sources[0];
  const meter = source?.timeSignatures[0];
  return meter ? meter.numerator * 4 / meter.denominator : 4;
}

function displayScopeClass(active: boolean): string {
  return active
    ? "border border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] px-2.5 py-1.5 text-xs text-[var(--lv-text)]"
    : "border border-[var(--lv-border)] px-2.5 py-1.5 text-xs text-[var(--lv-text-secondary)] hover:border-[var(--lv-border-strong)]";
}

function formatBeatTime(beats: number): string {
  const seconds = Math.max(0, Math.round(beats / 2));
  return formatClock(seconds);
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function confidenceBucketForVoice(
  voice: AnalysisSession["voices"][number],
): "high" | "medium" | "low" {
  if (voice.autoRoleConfidenceBucket) return voice.autoRoleConfidenceBucket;
  if (voice.autoRoleConfidence >= 0.75) return "high";
  if (voice.autoRoleConfidence >= 0.45) return "medium";
  return "low";
}

function roleEvidenceLabel(kind: string, language: AppLanguage): string {
  const labels = language === "ja"
    ? {
        "channel-10": "Channel 10",
        "dominant-program": "主要プログラム",
        "track-name-hint": "トラック名ヒント",
        "low-pitch-center": "低い音域",
        "high-pitch-center": "高い音域",
        "time-weighted-monophony": "単音傾向",
        "time-weighted-polyphony": "和音傾向",
        "sustained-duration": "持続音",
        "stepwise-motion": "順次進行",
        "percussion-soft-signature": "打楽器傾向",
        "mixed-fallback": "混在の可能性",
        "manual-override": "手動指定",
      }
    : {
        "channel-10": "Channel 10",
        "dominant-program": "Dominant program",
        "track-name-hint": "Track-name hint",
        "low-pitch-center": "Low register",
        "high-pitch-center": "High register",
        "time-weighted-monophony": "Monophonic pattern",
        "time-weighted-polyphony": "Polyphonic pattern",
        "sustained-duration": "Sustained duration",
        "stepwise-motion": "Stepwise motion",
        "percussion-soft-signature": "Percussion pattern",
        "mixed-fallback": "Mixed fallback",
        "manual-override": "Manual override",
      };
  return labels[kind as keyof typeof labels] ?? (language === "ja" ? "追加の根拠" : "Additional evidence");
}

function selectableRoleFor(
  role: PreAnalysisVoiceRole,
): Exclude<PreAnalysisVoiceRole, "exclude"> {
  return role === "exclude" ? "harmony" : role;
}

function sourceSummary(source: AnalysisSession["sources"][number]): string {
  const bpm = source.tempoMap[0]?.bpm ?? 120;
  const meter = source.timeSignatures[0];
  const durationSeconds = Math.max(
    0,
    Math.round(source.durationBeats * 60 / bpm),
  );
  return [
    `SMF ${source.smfType}`,
    formatClock(durationSeconds),
    `${Math.round(bpm)} BPM`,
    meter ? `${meter.numerator}/${meter.denominator}` : "4/4",
  ].join(" · ");
}

function voiceMetadata(
  voice: AnalysisSession["voices"][number],
  copy: ReturnType<typeof workspaceCopy>,
): string {
  const range = voice.minPitch !== undefined && voice.maxPitch !== undefined
    ? `${midiPitchName(voice.minPitch)}–${midiPitchName(voice.maxPitch)}`
    : copy.unknownRange;
  return [
    voice.trackName ? voice.trackName : undefined,
    `T${voice.trackIndex + 1} / Ch${voice.channel + 1}`,
    copy.notes(voice.noteCount),
    range,
  ].filter(Boolean).join(" · ");
}

function midiPitchName(pitch: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

function performanceNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function presetOptions(copy: ReturnType<typeof workspaceCopy>): {
  value: PreAnalysisSelectionPreset;
  label: string;
}[] {
  return [
    { value: "auto", label: copy.auto },
    { value: "harmony-bass", label: copy.harmonyBass },
    { value: "accompaniment-only", label: copy.accompaniment },
    { value: "all-pitched", label: copy.allPitched },
    { value: "custom", label: copy.custom },
  ];
}

function voiceContributionOptions(copy: ReturnType<typeof workspaceCopy>): {
  value: VoiceContributionPreset;
  label: string;
}[] {
  return [
    { value: "standard", label: copy.standardContribution },
    { value: "harmonic-core", label: copy.harmonicCore },
  ];
}

function roleOptions(copy: ReturnType<typeof workspaceCopy>): {
  value: PreAnalysisVoiceRole;
  label: string;
}[] {
  return [
    { value: "harmony", label: copy.harmony },
    { value: "bass", label: copy.bass },
    { value: "melody-weak", label: copy.melodyWeak },
    { value: "exclude", label: copy.exclude },
  ];
}

function warningLabel(code: AnalysisSessionWarningCode, language: AppLanguage): string {
  const ja: Record<AnalysisSessionWarningCode, string> = {
    "tempo-map-mismatch": "追加MIDIのテンポマップがmasterと異なります。masterのテンポを使用します。",
    "time-signature-mismatch": "追加MIDIの拍子がmasterと異なります。",
    "duration-mismatch": "追加MIDIの長さがmasterと大きく異なります。",
    "start-position-mismatch": "追加MIDIの開始位置がmasterと一致しない可能性があります。自動補正は行いません。",
    "exact-duplicate": "完全に同じVoiceを検出し、解析の二重加算から除外しました。",
    "near-duplicate": "よく似たVoiceがあります。自動除外せず両方を残しています。",
  };
  const en: Record<AnalysisSessionWarningCode, string> = {
    "tempo-map-mismatch": "An added MIDI has a different tempo map. The master tempo will be used.",
    "time-signature-mismatch": "An added MIDI has a different time signature.",
    "duration-mismatch": "An added MIDI is substantially different in length.",
    "start-position-mismatch": "An added MIDI may start at a different position. No automatic alignment is applied.",
    "exact-duplicate": "An exact duplicate Voice was excluded from double counting.",
    "near-duplicate": "A similar Voice was found. Both remain included for review.",
  };
  return (language === "ja" ? ja : en)[code];
}

function workspaceCopy(language: AppLanguage) {
  if (language === "ja") {
    return {
      title: "解析するパートを確認",
      description: "コード解析を始める前に、使うVoiceと役割を確認します。ファイル名とMIDI内容はこの画面だけで使用します。",
      addMidi: "MIDIを追加",
      partDetails: "パート詳細",
      voiceCount: (count: number) => `${count} Voice`,
      analysisParts: "解析するパート",
      compactSummary: (name: string) => `解析対象: ${name} 1パート`,
      optionalDetails: "必要なときだけパート詳細を調整できます",
      unknownVoice: "Voice",
      play: "再生",
      stop: "停止",
      zoom: "ズーム",
      pianoRollDisplay: "ピアノロールの表示対象",
      display: "表示",
      analysisTargets: "解析対象",
      allVoices: "全Voice",
      preset: "解析プリセット",
      auto: "おまかせ（推奨）",
      harmonyBass: "和声＋ベース",
      accompaniment: "伴奏のみ",
      allPitched: "全パート",
      custom: "カスタム",
      voiceContributionPreset: "和声コアの重み",
      standardContribution: "標準",
      harmonicCore: "和声コア",
      harmonicCoreDescription: "テンションを取りこぼす代わりに、メロディ由来の誤検出を減らします",
      resetAuto: "自動推定に戻す",
      loadedMidi: "読み込んだMIDI",
      hideSource: "ファイルを非表示",
      showSource: "ファイルを表示",
      muteSource: "ファイルをミュート",
      unmuteSource: "ファイルのミュートを解除",
      removeSource: "MIDIを削除",
      hideVoice: (name: string) => `${name}を非表示`,
      showVoice: (name: string) => `${name}を表示`,
      includeVoice: (name: string) => `${name}を解析対象にする`,
      soloVoice: (name: string) => `${name}をSolo`,
      muteVoice: (name: string) => `${name}をミュート`,
      unmuteVoice: (name: string) => `${name}のミュートを解除`,
      roleFor: (name: string) => `${name}の解析役割`,
      roleConfidence: (bucket: "high" | "medium" | "low") => `信頼度: ${bucket === "high" ? "High" : bucket === "medium" ? "Medium" : "Low"}`,
      notes: (count: number) => `${count} notes`,
      unknownRange: "音域不明",
      solo: "Solo",
      harmony: "和声",
      bass: "ベース",
      melodyWeak: "メロディ（弱い証拠）",
      exclude: "除外",
      review: "\u8981\u78ba\u8a8d",
      programChanges: "音色変更あり",
      duplicateExcluded: "重複除外",
      warnings: "確認事項",
      analyze: "この構成で解析",
      preparing: "準備中…",
      noAudibleVoices: "再生できるVoiceがありません。Solo / Muteを確認してください。",
      playbackFailed: "MIDIパートを再生できませんでした。",
      recommendation: (harmony: number, bass: number, excluded: number) =>
        `解析対象: 和声 ${harmony} / ベース ${bass}・除外 ${excluded}`,
      targetSummary: (included: number, total: number) =>
        `${total} Voice中 ${included} Voiceを解析します`,
      selectAtLeastOne: "解析するVoiceを1つ以上選んでください。",
    };
  }
  return {
    title: "Review parts for analysis",
    description: "Confirm which Voices and roles to use before chord analysis. File names and MIDI content stay in this runtime screen.",
    addMidi: "Add MIDI",
    partDetails: "Part details",
    voiceCount: (count: number) => `${count} Voices`,
    analysisParts: "Parts for analysis",
    compactSummary: (name: string) => `Analysis target: 1 ${name} part`,
    optionalDetails: "Open part details only when you need to adjust the input",
    unknownVoice: "Voice",
    play: "Play",
    stop: "Stop",
    zoom: "Zoom",
    pianoRollDisplay: "Piano roll display scope",
    display: "Display",
    analysisTargets: "Analysis targets",
    allVoices: "All Voices",
    preset: "Analysis preset",
    auto: "Auto (recommended)",
    harmonyBass: "Harmony + bass",
    accompaniment: "Accompaniment only",
    allPitched: "All parts",
    custom: "Custom",
    voiceContributionPreset: "Voice contribution",
    standardContribution: "Standard",
    harmonicCore: "Harmonic Core",
    harmonicCoreDescription: "Reduces melody-derived false detections at the cost of some missed tensions.",
    resetAuto: "Reset to auto",
    loadedMidi: "Loaded MIDI",
    hideSource: "Hide file",
    showSource: "Show file",
    muteSource: "Mute file",
    unmuteSource: "Unmute file",
    removeSource: "Remove MIDI",
    hideVoice: (name: string) => `Hide ${name}`,
    showVoice: (name: string) => `Show ${name}`,
    includeVoice: (name: string) => `Include ${name} in analysis`,
    soloVoice: (name: string) => `Solo ${name}`,
    muteVoice: (name: string) => `Mute ${name}`,
    unmuteVoice: (name: string) => `Unmute ${name}`,
    roleFor: (name: string) => `Analysis role for ${name}`,
    roleConfidence: (bucket: "high" | "medium" | "low") => `Confidence: ${bucket === "high" ? "High" : bucket === "medium" ? "Medium" : "Low"}`,
    notes: (count: number) => `${count} notes`,
    unknownRange: "range unknown",
    solo: "Solo",
    harmony: "Harmony",
    bass: "Bass",
    melodyWeak: "Melody (weak evidence)",
    exclude: "Exclude",
    review: "Review",
    programChanges: "Program changes",
    duplicateExcluded: "Duplicate excluded",
    warnings: "Review notes",
    analyze: "Analyze this configuration",
    preparing: "Preparing…",
    noAudibleVoices: "No audible Voice. Check Solo and Mute.",
    playbackFailed: "The MIDI parts could not be played.",
    recommendation: (harmony: number, bass: number, excluded: number) =>
      `Included: ${harmony} harmony / ${bass} bass · ${excluded} excluded`,
    targetSummary: (included: number, total: number) =>
      `${included} of ${total} Voices will be analyzed`,
    selectAtLeastOne: "Select at least one Voice to analyze.",
  };
}
