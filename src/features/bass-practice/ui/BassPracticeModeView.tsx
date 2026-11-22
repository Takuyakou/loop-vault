import { Chip, Popover } from "../../../components/ui/controls";
import { Select } from "../../../components/ui/controls";
import { MidiBassLibraryView } from "../midi/LibraryView";
import "./bassPractice.css";
import "./bassPracticeHome.css";
import { EchoPracticeFrame } from "./EchoPracticeFrame";
import { StageToolsSlot } from "../stage/Stage";
import { useRecordChannel } from "../recording/application/recordChannelStore";
import { RetainedTakesPanel } from "../recording/ui/RetainedTakesPanel";
import { useEffect, useRef, useState, type ComponentProps } from "react";
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
import { BassPracticeHome, BASS_HOME_MODE_NAMES, type BassHomeMode } from "./BassPracticeHome";
import { bassHomeData } from "../application/bassHomeData";
import { useMidiBassActivity } from "../midi/useActivity";
import type { PracticeFileV2 } from "../infra/repository/practiceRepository";
import { useMemo } from "react";
import { BasslinePracticeView, type BasslinePracticeViewProps } from "./BasslinePracticeView";
import { RhythmPracticeView } from "./RhythmPracticeView";
import { RootMotionPracticeView } from "./RootMotionPracticeView";

/** P22-03 §1: the same names the Home's 「続きから」 uses to open one practice. */
export type BassPracticeMode = "degree" | "rhythm" | "bassline" | "root-motion" | "midi";
type Mode = BassPracticeMode;
type BassPracticeModeViewProps = ComponentProps<typeof BassPracticeView> & {
  /** Opened from the Home's 「続きから」: the tab to show first (ignored when that practice is switched off). */
  readonly initialMode?: Mode;
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
  /** P23-25 P5: the practice file, so the home can read 7 days / last time from the records that exist. */
  readonly practiceFile?: PracticeFileV2 | undefined;
  /** P23-28 F8-1: grows each time the left menu opens Bass Practice without naming a practice — show the picker again. */
  readonly homeRequest?: number;
};

/** P23-62: the practices drawn on the shared stage (no right column, no badge, the input chip in the band). */
const STAGE_MODES: ReadonlySet<Mode> = new Set<Mode>(["degree", "rhythm", "root-motion", "bassline", "midi"]);

const CHANNEL_LABELS = { auto: "自動", left: "左 / 入力1", right: "右 / 入力2", "mono-sum": "モノラル合成" } as const;

/** P23-62: 「入力 自動」 — which input channel the take records, and the takes kept with 「録音を残す」. */
function InputChip() {
  const [channel, setChannel] = useRecordChannel();
  return (
    <Popover label="録音の入力" trigger={(props) => <Chip {...props} data-testid="bass-input-chip">入力 {CHANNEL_LABELS[channel]}</Chip>}>
      <div className="bp-tools-panel">
        <label>入力のチャンネル
          <Select aria-label="入力チャンネル" value={channel} onChange={(event) => setChannel(event.target.value as keyof typeof CHANNEL_LABELS)}>
            {(Object.keys(CHANNEL_LABELS) as (keyof typeof CHANNEL_LABELS)[]).map((value) => <option key={value} value={value}>{CHANNEL_LABELS[value]}</option>)}
          </Select>
        </label>
        <p>ベースはオーディオインターフェースからつなぎます。伴奏やクリックが録音に入らないよう、ヘッドホンで聴いてください。録音は判定にだけ使い、「録音を残す」を押した時だけ保存します。</p>
        <RetainedTakesPanel />
      </div>
    </Popover>
  );
}


/** P23-28 F1: the top band's one line — the name, the badge and the practice's own sentence. */
const MODE_INFO: Record<Mode, { readonly badge: string; readonly description: string }> = {
  degree: { badge: "自己評価 · 自動採点ではありません", description: "短いフレーズを聴き、歌い、度数で捉えてからベースで再現します。" },
  rhythm: { badge: "自己評価 · 自動採点ではありません", description: "リズムを聴き、思い出し、歌ってからベースで再現します。" },
  "root-motion": { badge: "自己評価 · 自動採点ではありません", description: "ルート間の動きを見分け、歌ってベースで再現します。" },
  bassline: { badge: "自己評価 · 自動採点ではありません", description: "コード進行を聴き、ベースラインを思い出して演奏します。" },
  midi: { badge: "弾き終わってから自動で判定（目安）", description: "MIDIのお手本を聴いて、ベースで弾いた録音を1音ずつ確かめます。" },
};

/**
 * P23-62/P23-63: 「?」 in the band — each staged practice's own keys. 1–4 is a rating (度数・リズム・ルートの動き
 * only), T transfers to another key (度数 only), and コード進行のベース records and advances with N.
 */
const STAGE_KEYS: Partial<Record<Mode, string>> = {
  degree: "Space 聴く・止める · H ヒント · R 録って弾く・録り直す · Esc 止める · 1–4 評価を変える · N 次へ · T 別のキーで",
  rhythm: "Space 聴く・止める · H ヒント · R 録って弾く・録り直す · Esc 止める · 1–4 評価を変える · N 次へ",
  "root-motion": "Space 聴く・止める · H ヒント · R 録って弾く・録り直す · Esc 止める · 1–4 評価を変える · N 次へ",
  bassline: "Space 聴く・お手本 · H ヒント · R 録って弾く・録り直す · Esc 止める · N 記録して次へ",
  midi: "Space 聴く・止める · R 録って弾く・もう一度 · Esc 止める · N 次の区間",
};

/**
 * Keep enabled mode views mounted while switching tabs.  Degree Echo owns a
 * live Practice session, so unmounting it merely to reveal another mode would
 * incorrectly mark that session abandoned.
 */
export function BassPracticeModeView({ onRhythmAttemptCompleted, chordContextSnapshot, resolveSavedChordNotes, chordContextSnapshots, vaultPickerCandidates, vaultSourceBasslines, onChordContextHistoryRecorded, sourceBasslineHistory, onSourceBasslineHistoryRecorded, onSourceBasslineWindowBarsChange, onRootMotionHistoryRecorded, onRootMotionNoteCountChange, practiceFile, homeRequest, initialMode, ...degreeProps }: BassPracticeModeViewProps) {
  const [instrument, setInstrument] = useState<DegreeUiSettings>(() => ({ stringCount: degreeProps.initialSettings?.stringCount ?? 4, handedness: degreeProps.initialSettings?.handedness ?? "right", fretRange: degreeProps.initialSettings?.fretRange ?? { min: 0, max: 12 }, singEnabled: degreeProps.initialSettings?.singEnabled ?? true, singingReferenceMode: degreeProps.initialSettings?.singingReferenceMode ?? "auto" }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsSlot, setToolsSlot] = useState<HTMLElement | null>(null);
  const [settingsError, setSettingsError] = useState<string>();
  const sharedSettings = { ...degreeProps.initialSettings, ...instrument, version: 1 as const, sessionTargetCount: degreeProps.initialSettings?.sessionTargetCount ?? 8 };
  const changeSettings = async (next: DegreeUiSettings) => {
    try { await degreeProps.onSettingsChange?.(next); setInstrument(next); setSettingsError(undefined); }
    catch { setSettingsError("設定を保存できませんでした。元の設定を保持しています。"); }
  };
  // P23-25 P1/P2: the home comes first; the practices keep running (hidden) behind it.
  const midiAttempts = useMidiBassActivity();
  const homeData = useMemo(() => bassHomeData({ file: practiceFile, midiAttempts }), [practiceFile, midiAttempts]);
  const midiEnabled = isBassPracticeMidiBasslineEnabled();
  const degreeEnabled = isBassPracticeDegreeEchoEnabled();
  const rhythmEnabled = isBassPracticeRhythmEchoEnabled();
  const basslineEnabled = isBassPracticeBasslineEchoEnabled();
  const chordContextEnabled = isBassPracticeChordContextEnabled();
  const rootMotionEnabled = isBassPracticeRootMotionEnabled();
  const firstEnabledMode: Mode = degreeEnabled ? "degree" : rhythmEnabled ? "rhythm" : basslineEnabled ? "bassline" : rootMotionEnabled ? "root-motion" : "midi";
  const enabledChordContextSnapshot = chordContextEnabled ? chordContextSnapshot : undefined;
  const isEnabled = (candidate: Mode | undefined): candidate is Mode => candidate !== undefined
    && (candidate === "degree" ? degreeEnabled
      : candidate === "rhythm" ? rhythmEnabled
        : candidate === "bassline" ? basslineEnabled
          : candidate === "root-motion" ? rootMotionEnabled
            : midiEnabled);
  const [mode, setMode] = useState<Mode>(() => (isEnabled(initialMode) ? initialMode : enabledChordContextSnapshot && basslineEnabled ? "bassline" : firstEnabledMode));
  useEffect(() => { if (enabledChordContextSnapshot && basslineEnabled) setMode("bassline"); }, [basslineEnabled, enabledChordContextSnapshot?.signature]);
  const enabledModes: BassHomeMode[] = [
    ...(degreeEnabled ? (["degree"] as const) : []),
    ...(rhythmEnabled ? (["rhythm"] as const) : []),
    ...(rootMotionEnabled ? (["root-motion"] as const) : []),
    ...(basslineEnabled ? (["bassline"] as const) : []),
    ...(midiEnabled ? (["midi"] as const) : []),
  ];
  // A practice asked for by name (the Home's 続きから, a saved progression, a chord-context handoff) skips the home.
  const [showHome, setShowHome] = useState(() => !isEnabled(initialMode) && !(enabledChordContextSnapshot && basslineEnabled));
  useEffect(() => { if (isEnabled(initialMode)) setShowHome(false); }, [initialMode, degreeEnabled, rhythmEnabled, basslineEnabled, rootMotionEnabled, midiEnabled]);
  // P23-28 F8-1: the left menu's Bass Practice is pressed again while a practice is open — come back to the picking screen.
  const homeRequestRef = useRef(homeRequest);
  useEffect(() => {
    if (homeRequest === homeRequestRef.current) return;
    homeRequestRef.current = homeRequest;
    setShowHome(true);
  }, [homeRequest]);
  if (!degreeEnabled && !rhythmEnabled && !basslineEnabled && !rootMotionEnabled && !midiEnabled) return null;

  return (
    <div className="bass-practice-shell">
      {/* P23-25 P1: the practices stay mounted (a hidden Degree Echo keeps its session); the home is shown over them. */}
      <div className="bass-stage bass-home-stage" hidden={!showHome}>
        <BassPracticeHome
          modes={enabledModes}
          info={homeData.info}
          {...(homeData.resume ? { resume: homeData.resume } : {})}
          instrument={instrument}
          onInstrumentChange={(next) => void changeSettings({ ...sharedSettings, ...next })}
          week={homeData.week}
          active={showHome}
          onOpen={(next) => { setMode(next); setShowHome(false); }}
        />
      </div>
      <StageToolsSlot value={toolsSlot}>
      <div className="bass-stage" hidden={showHome}>
        <header className="bass-modebar">
          <button type="button" className="bass-mode-back" onClick={() => setShowHome(true)}>‹ Bass Practice</button>
          <span className="bass-mode-kicker">{mode === "midi" ? "弾いて確かめる" : "聴いてまねる"}</span>
          <div className="bass-mode-name">{BASS_HOME_MODE_NAMES[mode]}</div>
          {STAGE_MODES.has(mode) ? null : <span data-midi-feedback={mode === "midi"} className="bass-mode-badge">{MODE_INFO[mode].badge}</span>}
          {STAGE_MODES.has(mode) ? <span className="bass-mode-desc" aria-hidden="true" /> : <span className="bass-mode-desc">{MODE_INFO[mode].description}</span>}
          <div className="bass-mode-tools">
            {/* P23-62: the open practice's own chips (条件) are drawn here by <StageTools>. */}
            <span ref={setToolsSlot} className="bass-mode-slot" />
            {STAGE_MODES.has(mode) ? <InputChip /> : null}
            <Chip aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>{STAGE_MODES.has(mode) ? "" : "⚙ "}{instrument.stringCount}弦・{instrument.handedness === "right" ? "右利き" : "左利き"}・{instrument.fretRange.min}〜{instrument.fretRange.max}{STAGE_MODES.has(mode) ? "" : "フレット"}</Chip>
            <Popover label="キー操作" trigger={props => <Chip {...props} aria-label="キー操作">?</Chip>}>
              {STAGE_MODES.has(mode)
                ? <p className="text-xs" data-stage-keys>{STAGE_KEYS[mode]}</p>
                : <p className="text-xs">Space 聴く / 停止 · R 録音 · H ヒント · 1–4 自己評価 · N 次へ · Esc 停止（各練習の既存操作を優先）</p>}
            </Popover>
          </div>
        </header>
      {settingsOpen ? <fieldset className="flex flex-wrap gap-3 rounded border p-3"><legend>共通の設定</legend>
        <label>弦数<Select aria-label="共通の弦数" className="" value={instrument.stringCount} onChange={(e) => void changeSettings({ ...instrument, stringCount: Number(e.target.value) as 4 | 5 })}><option value={4}>4弦</option><option value={5}>5弦</option></Select></label>
        <label>利き手<Select aria-label="共通の利き手" className="" value={instrument.handedness} onChange={(e) => void changeSettings({ ...instrument, handedness: e.target.value as "left" | "right" })}><option value="right">右利き</option><option value="left">左利き</option></Select></label>
        <label>フレット<Select aria-label="共通のフレット範囲" className="" value={`${instrument.fretRange.min}-${instrument.fretRange.max}`} onChange={(e) => { const [min, max] = e.target.value.split("-").map(Number); void changeSettings({ ...instrument, fretRange: { min, max } }); }}><option value="0-7">0〜7</option><option value="0-12">0〜12</option><option value="5-17">5〜17</option></Select></label>
        <button type="button" onClick={() => setSettingsOpen(false)}>閉じる</button>
      </fieldset> : null}
      {settingsError ? <p role="alert">{settingsError}</p> : null}
      {degreeEnabled ? <div className="bass-mode-panel" hidden={mode !== "degree"}><EchoPracticeFrame active={mode === "degree" && !showHome} rail={false}><BassPracticeView {...degreeProps} initialSettings={sharedSettings} onSettingsChange={changeSettings} /></EchoPracticeFrame></div> : null}
      {mode === "rhythm" && rhythmEnabled ? <div className="bass-mode-panel"><EchoPracticeFrame rail={false} active={!showHome}><RhythmPracticeView onAttemptCompleted={onRhythmAttemptCompleted} /></EchoPracticeFrame></div> : null}
      {mode === "root-motion" && rootMotionEnabled ? <div className="bass-mode-panel"><EchoPracticeFrame rail={false} active={!showHome}><RootMotionPracticeView initialSettings={sharedSettings} vaultSnapshots={chordContextEnabled ? (chordContextSnapshot ? [chordContextSnapshot, ...(chordContextSnapshots ?? []).filter((snapshot) => snapshot.signature !== chordContextSnapshot.signature)] : chordContextSnapshots) : undefined} onHistoryRecorded={onRootMotionHistoryRecorded} onNoteCountChange={onRootMotionNoteCountChange} /></EchoPracticeFrame></div> : null}
      {mode === "bassline" && basslineEnabled ? <div className="bass-mode-panel"><EchoPracticeFrame rail={false} active={!showHome}><BasslinePracticeView instrument={instrument} initialWindowBars={degreeProps.initialSettings?.sourceBasslineWindowBars} chordContextSnapshot={enabledChordContextSnapshot} resolveSavedChordNotes={resolveSavedChordNotes} chordContextSnapshots={chordContextEnabled ? chordContextSnapshots : undefined} vaultPickerCandidates={chordContextEnabled ? vaultPickerCandidates : undefined} vaultSourceBasslines={vaultSourceBasslines} chordContextEnabled={chordContextEnabled} onChordContextHistoryRecorded={onChordContextHistoryRecorded} sourceBasslineHistory={sourceBasslineHistory} onSourceBasslineHistoryRecorded={onSourceBasslineHistoryRecorded} onSourceBasslineWindowBarsChange={onSourceBasslineWindowBarsChange} /></EchoPracticeFrame></div> : null}
        {mode === "midi" && midiEnabled ? <div className="bass-mode-panel min-w-0"><MidiBassLibraryView instrument={instrument} /></div> : null}
      </div>
      </StageToolsSlot>
    </div>
  );
}
