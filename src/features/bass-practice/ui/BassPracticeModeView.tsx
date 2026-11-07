import { Chip, Popover } from "../../../components/ui/controls";
import { Select } from "../../../components/ui/controls";
import { MidiBassLibraryView } from "../midi/LibraryView";
import "./bassPractice.css";
import { EchoPracticeFrame } from "./EchoPracticeFrame";
import { useEffect, useState, type ComponentProps } from "react";
import {
  isBassPracticeBasslineEchoEnabled,
  isBassPracticeChordContextEnabled,
  isBassPracticeDegreeEchoEnabled,
  isBassPracticeRhythmEchoEnabled,
  isBassPracticeRootMotionEnabled,
  isBassPracticeMidiBasslineEnabled,
} from "../application/featureFlag";
import type { ChordContextHistoryEntry, RootMotionHistoryEntry, RootMotionNoteCount, RhythmPracticeAttempt, SourceBasslineHistoryEntry, SourceBasslineWindowBars, VaultChordContextSnapshot } from "../domain";
import type { VaultPickerCandidateView, VaultSourceBasslineCandidateView } from "../application/vaultPickerCandidates";
import { BassPracticeView, type DegreeUiSettings } from "./BassPracticeView";
import { BasslinePracticeView, type BasslinePracticeViewProps } from "./BasslinePracticeView";
import { RhythmPracticeView } from "./RhythmPracticeView";
import { RootMotionPracticeView } from "./RootMotionPracticeView";

type Mode = "degree" | "rhythm" | "bassline" | "root-motion" | "midi";
type BassPracticeModeViewProps = ComponentProps<typeof BassPracticeView> & {
  readonly onRhythmAttemptCompleted?: (attempt: RhythmPracticeAttempt) => Promise<void>;
  readonly chordContextSnapshot?: VaultChordContextSnapshot;
  readonly resolveSavedChordNotes?: BasslinePracticeViewProps["resolveSavedChordNotes"];
  readonly chordContextSnapshots?: readonly VaultChordContextSnapshot[];
  /** Live-title candidates are picker-only and never cross into Practice persistence. */
  readonly vaultPickerCandidates?: readonly VaultPickerCandidateView[];
  readonly vaultSourceBasslines?: readonly VaultSourceBasslineCandidateView[];
  readonly onChordContextHistoryRecorded?: (entry: ChordContextHistoryEntry) => Promise<void>;
  readonly sourceBasslineHistory?: readonly SourceBasslineHistoryEntry[];
  readonly onSourceBasslineHistoryRecorded?: (entry: SourceBasslineHistoryEntry) => Promise<void>;
  readonly onSourceBasslineWindowBarsChange?: (bars: SourceBasslineWindowBars) => Promise<void>;
  readonly onRootMotionHistoryRecorded?: (entry: RootMotionHistoryEntry) => Promise<void>;
  readonly onRootMotionNoteCountChange?: (noteCount: RootMotionNoteCount) => Promise<void>;
};

/**
 * Keep enabled mode views mounted while switching tabs.  Degree Echo owns a
 * live Practice session, so unmounting it merely to reveal another mode would
 * incorrectly mark that session abandoned.
 */
export function BassPracticeModeView({ onRhythmAttemptCompleted, chordContextSnapshot, resolveSavedChordNotes, chordContextSnapshots, vaultPickerCandidates, vaultSourceBasslines, onChordContextHistoryRecorded, sourceBasslineHistory, onSourceBasslineHistoryRecorded, onSourceBasslineWindowBarsChange, onRootMotionHistoryRecorded, onRootMotionNoteCountChange, ...degreeProps }: BassPracticeModeViewProps) {
  const [instrument, setInstrument] = useState<DegreeUiSettings>(() => ({ stringCount: degreeProps.initialSettings?.stringCount ?? 4, handedness: degreeProps.initialSettings?.handedness ?? "right", fretRange: degreeProps.initialSettings?.fretRange ?? { min: 0, max: 12 }, singEnabled: degreeProps.initialSettings?.singEnabled ?? true, singingReferenceMode: degreeProps.initialSettings?.singingReferenceMode ?? "auto" }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState<string>();
  const sharedSettings = { ...degreeProps.initialSettings, ...instrument, version: 1 as const, sessionTargetCount: degreeProps.initialSettings?.sessionTargetCount ?? 8 };
  const changeSettings = async (next: DegreeUiSettings) => {
    try { await degreeProps.onSettingsChange?.(next); setInstrument(next); setSettingsError(undefined); }
    catch { setSettingsError("設定を保存できませんでした。元の設定を保持しています。"); }
  };
  const midiEnabled = isBassPracticeMidiBasslineEnabled();
  const degreeEnabled = isBassPracticeDegreeEchoEnabled();
  const rhythmEnabled = isBassPracticeRhythmEchoEnabled();
  const basslineEnabled = isBassPracticeBasslineEchoEnabled();
  const chordContextEnabled = isBassPracticeChordContextEnabled();
  const rootMotionEnabled = isBassPracticeRootMotionEnabled();
  const firstEnabledMode: Mode = degreeEnabled ? "degree" : rhythmEnabled ? "rhythm" : basslineEnabled ? "bassline" : rootMotionEnabled ? "root-motion" : "midi";
  const enabledChordContextSnapshot = chordContextEnabled ? chordContextSnapshot : undefined;
  const [mode, setMode] = useState<Mode>(() => enabledChordContextSnapshot && basslineEnabled ? "bassline" : firstEnabledMode);
  useEffect(() => { if (enabledChordContextSnapshot && basslineEnabled) setMode("bassline"); }, [basslineEnabled, enabledChordContextSnapshot?.signature]);

  if (!degreeEnabled && !rhythmEnabled && !basslineEnabled && !rootMotionEnabled && !midiEnabled) return null;
  if (degreeEnabled && !rhythmEnabled && !basslineEnabled && !rootMotionEnabled && !midiEnabled) return <BassPracticeView {...degreeProps} initialSettings={sharedSettings} onSettingsChange={changeSettings} />;

  const tabClass = (selected: boolean) =>
    `min-h-10 rounded-[var(--lv-radius-sm)] border px-4 text-sm font-semibold transition-colors ${
      selected
        ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]"
        : "border-[var(--lv-border)] bg-[var(--lv-surface)] text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"
    }`;

  return (
    <div className="bass-practice-shell">
      <div className="bass-modebar"><div role="tablist" aria-label="Bass Practice のモード" className="flex flex-wrap gap-2">
        {degreeEnabled ? <button type="button" role="tab" aria-selected={mode === "degree"} className={tabClass(mode === "degree")} onClick={() => setMode("degree")}>Degree Echo</button> : null}
        {rhythmEnabled ? <button type="button" role="tab" aria-selected={mode === "rhythm"} className={tabClass(mode === "rhythm")} onClick={() => setMode("rhythm")}>Rhythm Echo</button> : null}
        {basslineEnabled ? <button type="button" role="tab" aria-selected={mode === "bassline"} className={tabClass(mode === "bassline")} onClick={() => setMode("bassline")}>Bassline Echo</button> : null}
        {rootMotionEnabled ? <button type="button" role="tab" aria-selected={mode === "root-motion"} className={tabClass(mode === "root-motion")} onClick={() => setMode("root-motion")}>Root Motion Echo</button> : null}
        {midiEnabled ? <button type="button" role="tab" aria-selected={mode === "midi"} className={tabClass(mode === "midi")} onClick={() => setMode("midi")}>MIDI のベースライン</button> : null}
      </div>
      <span data-midi-feedback={mode === "midi"} className="text-xs text-[var(--lv-accent)]">{mode === "midi" ? "弾き終わってから自動で判定（目安）" : "自己評価 · 自動採点ではありません"}</span>
      </div><div className="bass-settings-shortcuts"><Chip aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>⚙ {instrument.stringCount}弦・{instrument.handedness === "right" ? "右利き" : "左利き"}・{instrument.fretRange.min}〜{instrument.fretRange.max}フレット</Chip>
      <Popover label="キー操作" trigger={props=><Chip {...props} aria-label="キー操作">⌨ キー操作</Chip>}><p className="text-xs">Space 聴く / 停止 · R 録音 · H ヒント · 1–4 自己評価 · N 次へ · Esc 停止（各練習の既存操作を優先）</p></Popover>
      </div>
      {settingsOpen ? <fieldset className="flex flex-wrap gap-3 rounded border p-3"><legend>共通の設定</legend>
        <label>弦数<Select aria-label="共通の弦数" className="" value={instrument.stringCount} onChange={(e) => void changeSettings({ ...instrument, stringCount: Number(e.target.value) as 4 | 5 })}><option value={4}>4弦</option><option value={5}>5弦</option></Select></label>
        <label>利き手<Select aria-label="共通の利き手" className="" value={instrument.handedness} onChange={(e) => void changeSettings({ ...instrument, handedness: e.target.value as "left" | "right" })}><option value="right">右利き</option><option value="left">左利き</option></Select></label>
        <label>フレット<Select aria-label="共通のフレット範囲" className="" value={`${instrument.fretRange.min}-${instrument.fretRange.max}`} onChange={(e) => { const [min, max] = e.target.value.split("-").map(Number); void changeSettings({ ...instrument, fretRange: { min, max } }); }}><option value="0-7">0〜7</option><option value="0-12">0〜12</option><option value="5-17">5〜17</option></Select></label>
        <button type="button" onClick={() => setSettingsOpen(false)}>閉じる</button>
      </fieldset> : null}
      {settingsError ? <p role="alert">{settingsError}</p> : null}
      {degreeEnabled ? <div className="bass-mode-panel" hidden={mode !== "degree"}><EchoPracticeFrame active={mode === "degree"}><BassPracticeView {...degreeProps} initialSettings={sharedSettings} onSettingsChange={changeSettings} /></EchoPracticeFrame></div> : null}
      {mode === "rhythm" && rhythmEnabled ? <div className="bass-mode-panel"><EchoPracticeFrame><RhythmPracticeView onAttemptCompleted={onRhythmAttemptCompleted} /></EchoPracticeFrame></div> : null}
      {mode === "root-motion" && rootMotionEnabled ? <div className="bass-mode-panel"><EchoPracticeFrame><RootMotionPracticeView initialSettings={sharedSettings} vaultSnapshots={chordContextEnabled ? (chordContextSnapshot ? [chordContextSnapshot, ...(chordContextSnapshots ?? []).filter((snapshot) => snapshot.signature !== chordContextSnapshot.signature)] : chordContextSnapshots) : undefined} onHistoryRecorded={onRootMotionHistoryRecorded} onNoteCountChange={onRootMotionNoteCountChange} /></EchoPracticeFrame></div> : null}
      {mode === "bassline" && basslineEnabled ? <div className="bass-mode-panel"><EchoPracticeFrame><BasslinePracticeView instrument={instrument} initialWindowBars={degreeProps.initialSettings?.sourceBasslineWindowBars} chordContextSnapshot={enabledChordContextSnapshot} resolveSavedChordNotes={resolveSavedChordNotes} chordContextSnapshots={chordContextEnabled ? chordContextSnapshots : undefined} vaultPickerCandidates={chordContextEnabled ? vaultPickerCandidates : undefined} vaultSourceBasslines={vaultSourceBasslines} chordContextEnabled={chordContextEnabled} onChordContextHistoryRecorded={onChordContextHistoryRecorded} sourceBasslineHistory={sourceBasslineHistory} onSourceBasslineHistoryRecorded={onSourceBasslineHistoryRecorded} onSourceBasslineWindowBarsChange={onSourceBasslineWindowBarsChange} /></EchoPracticeFrame></div> : null}
      {mode === "midi" && midiEnabled ? <div className="bass-mode-panel min-w-0"><MidiBassLibraryView instrument={instrument} /></div> : null}
    </div>
  );
}
