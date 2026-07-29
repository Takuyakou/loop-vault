import {
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  previewMidiNotes,
  stopPreview,
} from "../../audio/chordPreview";
import { usePreviewSound } from "../PreviewSoundProvider";
import {
  applyAnalysisSessionPreset,
  resetAnalysisSessionAuto,
  sessionPreviewNotes,
  updateAnalysisSessionSource,
  updateAnalysisSessionVoice,
  type AnalysisSession,
  type AnalysisSessionWarningCode,
  type PreAnalysisSelectionPreset,
  type PreAnalysisVoiceRole,
} from "../../domain/midi/preAnalysis";
import type { AppLanguage } from "../../i18n";
import { PreAnalysisPianoRoll } from "./PreAnalysisPianoRoll";

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
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [follow, setFollow] = useState(true);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [playbackError, setPlaybackError] = useState<string>();
  const playheadTimerRef = useRef<ReturnType<typeof globalThis.setInterval>>();
  const { sound: previewSound } = usePreviewSound();
  const includedCount = session.voices.filter((voice) =>
    voice.included && !voice.duplicateOf).length;
  const recommended = useMemo(() => {
    const harmony = session.voices.filter((voice) =>
      voice.included && voice.assignedRole === "harmony").length;
    const bass = session.voices.filter((voice) =>
      voice.included && voice.assignedRole === "bass").length;
    const excluded = session.voices.length - includedCount;
    return copy.recommendation(harmony, bass, excluded);
  }, [copy, includedCount, session.voices]);

  useEffect(() => () => {
    stopPreview();
    if (playheadTimerRef.current) {
      globalThis.clearInterval(playheadTimerRef.current);
    }
  }, []);

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
      onPlay();
      return;
    }
    stopSessionPlayback();
    setPlaybackError(undefined);
    const master = session.sources.find((source) =>
      source.id === session.masterSourceId) ?? session.sources[0];
    const bpm = master?.tempoMap[0]?.bpm ?? 96;
    const previewNotes = sessionPreviewNotes(session, viewportStartBeat);
    if (!previewNotes.length) {
      setPlaybackError(copy.noAudibleVoices);
      return;
    }
    try {
      await previewMidiNotes(previewNotes, bpm, previewSound, {
        onStarted() {
          setPlaybackActive(true);
          const startedAt = performanceNow();
          playheadTimerRef.current = globalThis.setInterval(() => {
            const elapsedBeats = (
              performanceNow() - startedAt
            ) / 1000 * bpm / 60;
            setPlayheadBeat(Math.min(
              sessionDuration(session),
              viewportStartBeat + elapsedBeats,
            ));
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
    onSessionChange(applyAnalysisSessionPreset(session, preset));
  }

  function updateVoice(
    voiceId: string,
    changes: Parameters<typeof updateAnalysisSessionVoice>[2],
  ) {
    if (changes.muted !== undefined || changes.solo !== undefined) {
      stopSessionPlayback();
    }
    const next = updateAnalysisSessionVoice(session, voiceId, changes);
    onSessionChange({ ...next, preset: "custom" });
  }

  return (
    <main className="py-5" data-testid="pre-analysis-workspace">
      <section className="border-y border-[var(--lv-border)] py-5">
        <div className="flex flex-wrap items-start justify-between gap-4 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">
              MIDI SOURCE
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{copy.title}</h2>
            <p className="mt-2 max-w-3xl text-sm text-[var(--lv-text-muted)]">
              {copy.description}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 border border-[var(--lv-border-strong)] px-3 py-2 text-sm hover:border-[var(--lv-accent)]"
            onClick={onAddMidi}
          >
            <Plus size={16} aria-hidden="true" />
            {copy.addMidi}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-y border-[var(--lv-border)] py-3">
          <button
            type="button"
            className="border border-[var(--lv-border-strong)] px-3 py-2 text-sm disabled:opacity-40"
            onClick={() => void playSession()}
          >
            <Volume2 size={16} className="mr-2 inline" aria-hidden="true" />
            {copy.play}
          </button>
          <button
            type="button"
            className="border border-[var(--lv-border-strong)] p-2 disabled:opacity-40"
            title={copy.stop}
            aria-label={copy.stop}
            disabled={!playbackActive && !onStop}
            onClick={stopSessionPlayback}
          >
            <Square size={16} aria-hidden="true" />
          </button>
          <label className="ml-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={follow}
              onChange={(event) => setFollow(event.currentTarget.checked)}
            />
            Follow
          </label>
          <span className="ml-auto text-sm text-[var(--lv-text-muted)]">
            {formatBeatTime(viewportStartBeat)} / {formatBeatTime(sessionDuration(session))}
          </span>
        </div>
        {playbackError ? (
          <p className="mt-3 text-sm text-red-200" role="alert">
            {playbackError}
          </p>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <PreAnalysisPianoRoll
              session={session}
              language={language}
              selectedVoiceId={selectedVoiceId}
              zoom={zoom}
              viewportStartBeat={viewportStartBeat}
              playheadBeat={playheadBeat}
              onSelectVoice={setSelectedVoiceId}
              onViewportStartChange={setViewportStartBeat}
            />
            <div className="mt-3 flex items-center gap-3">
              <label className="text-sm text-[var(--lv-text-muted)]" htmlFor="pre-analysis-zoom">
                {copy.zoom}
              </label>
              <input
                id="pre-analysis-zoom"
                className="w-48 accent-[var(--lv-accent)]"
                type="range"
                min="1"
                max="8"
                step="1"
                value={zoom}
                onChange={(event) => setZoom(Number(event.currentTarget.value))}
              />
              <span className="text-xs text-[var(--lv-text-muted)]">{zoom}x</span>
            </div>
          </div>

          <aside className="min-w-0 border-l border-[var(--lv-border)] pl-4">
            <h3 className="text-sm font-semibold">{copy.preset}</h3>
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={copy.preset}>
              {presetOptions(copy).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
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
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"
              onClick={() => onSessionChange(resetAnalysisSessionAuto(session))}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {copy.resetAuto}
            </button>

            <h3 className="mt-6 text-sm font-semibold">{copy.loadedMidi}</h3>
            <div className="mt-3 max-h-[430px] overflow-y-auto border-y border-[var(--lv-border)]">
              {session.sources.map((source) => {
                const sourceVoices = session.voices.filter((voice) =>
                  voice.sourceId === source.id);
                return (
                  <section key={source.id} className="border-b border-[var(--lv-border)] py-3 last:border-b-0">
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
                      <button
                        type="button"
                        className="p-1.5 text-[var(--lv-text-muted)] hover:text-red-300 disabled:opacity-30"
                        title={copy.removeSource}
                        aria-label={copy.removeSource}
                        disabled={session.sources.length === 1}
                        onClick={() => {
                          stopSessionPlayback();
                          onRemoveSource(source.id);
                        }}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-2 grid gap-1">
                      {sourceVoices.map((voice) => (
                        <div
                          key={voice.id}
                          className={`grid grid-cols-[auto_auto_auto_auto_minmax(0,1fr)] items-center gap-2 px-1 py-2 ${
                            selectedVoiceId === voice.id ? "bg-[var(--lv-accent-soft)]" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={voice.included}
                            aria-label={copy.includeVoice(voice.displayName)}
                            onChange={(event) => updateVoice(voice.id, {
                              included: event.currentTarget.checked,
                            })}
                          />
                          <button
                            type="button"
                            className="w-7 border border-[var(--lv-border)] py-1 text-xs"
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
                            onClick={() => setSelectedVoiceId(voice.id)}
                          >
                            <span className="block truncate text-sm font-medium">
                              {voice.displayName}
                            </span>
                            <span className="block text-xs text-[var(--lv-text-muted)]">
                              T{voice.trackIndex + 1} / Ch{voice.channel + 1} · {voice.noteCount} notes
                            </span>
                          </button>
                          <span className="col-span-4 col-start-2 flex flex-wrap items-center gap-2">
                            <select
                              className="border border-[var(--lv-border)] bg-[var(--lv-bg)] px-2 py-1 text-xs"
                              aria-label={copy.roleFor(voice.displayName)}
                              value={voice.assignedRole}
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
                            {voice.autoRoleConfidence < 0.45 ? (
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
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </aside>
        </div>

        {session.warnings.length ? (
          <div className="mt-5 border-y border-amber-400/30 py-3" role="status">
            <p className="text-sm font-semibold text-amber-200">{copy.warnings}</p>
            <ul className="mt-2 grid gap-1 text-sm text-amber-100/80">
              {[...new Set(session.warnings.map((warning) =>
                warningLabel(warning.code, language)))].map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--lv-border)] pt-5">
          <p className="text-sm text-[var(--lv-text-secondary)]">{recommended}</p>
          <button
            type="button"
            className="bg-[var(--lv-accent)] px-5 py-3 font-semibold text-stone-950 disabled:opacity-40"
            disabled={busy || includedCount === 0}
            onClick={onAnalyze}
          >
            {busy ? copy.preparing : copy.analyze}
          </button>
        </div>
      </section>
    </main>
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
    <button
      type="button"
      className="p-1.5 text-[var(--lv-text-muted)] hover:text-[var(--lv-text)]"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
    >
      {active ? activeIcon : inactiveIcon}
    </button>
  );
}

function sessionDuration(session: AnalysisSession): number {
  return Math.max(0, ...session.sources.map((source) => source.durationBeats));
}

function formatBeatTime(beats: number): string {
  const seconds = Math.max(0, Math.round(beats / 2));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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
      play: "再生",
      stop: "停止",
      zoom: "ズーム",
      preset: "解析プリセット",
      auto: "おまかせ（推奨）",
      harmonyBass: "和声＋ベース",
      accompaniment: "伴奏のみ",
      allPitched: "全パート",
      custom: "カスタム",
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
      solo: "Solo",
      harmony: "和声",
      bass: "ベース",
      melodyWeak: "メロディ（弱い証拠）",
      exclude: "除外",
      review: "要確認",
      programChanges: "音色変更あり",
      duplicateExcluded: "重複除外",
      warnings: "確認事項",
      analyze: "この構成で解析",
      preparing: "準備中...",
      noAudibleVoices: "再生できるVoiceがありません。Solo / Muteを確認してください。",
      playbackFailed: "MIDIパートを再生できませんでした。",
      recommendation: (harmony: number, bass: number, excluded: number) =>
        `解析対象: 和声 ${harmony} / ベース ${bass}・除外 ${excluded}`,
    };
  }
  return {
    title: "Review parts for analysis",
    description: "Confirm which Voices and roles to use before chord analysis. File names and MIDI content stay in this runtime screen.",
    addMidi: "Add MIDI",
    play: "Play",
    stop: "Stop",
    zoom: "Zoom",
    preset: "Analysis preset",
    auto: "Auto (recommended)",
    harmonyBass: "Harmony + bass",
    accompaniment: "Accompaniment only",
    allPitched: "All parts",
    custom: "Custom",
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
    preparing: "Preparing...",
    noAudibleVoices: "No audible Voice. Check Solo and Mute.",
    playbackFailed: "The MIDI parts could not be played.",
    recommendation: (harmony: number, bass: number, excluded: number) =>
      `Included: ${harmony} harmony / ${bass} bass · ${excluded} excluded`,
  };
}
