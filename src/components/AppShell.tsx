// P8.9-02 app shell: integrated title bar (36px), sidebar (232px / 64px) and
// header (56px). Only the content area scrolls. Mock: RHome.dc.html / RHomeCompact.dc.html.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { AppCopy } from "../i18n";
import { playbackController, type PlaybackController } from "../audio/playbackController";
import { usePlaybackState } from "../hooks/usePlaybackState";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import {
  BassPracticeIcon,
  ChordDojoIcon,
  ErrorIcon,
  HomeIcon,
  ImportIcon,
  LiveMidiIcon,
  SettingsIcon,
  VaultIcon,
  VoicingLoopIcon,
  type IconComponent,
} from "./icons";
import { MasterVolumeKnob } from "./MasterVolumeKnob";
import { GlobalPreviewSoundSelector } from "./GlobalPreviewSoundSelector";
import { GlobalMetronomeButton } from "./GlobalMetronomeButton";
import { PlaybackLevelMeter } from "./PlaybackLevelMeter";
import { TitleBar } from "./shell/TitleBar";
import { loadSidebarCollapsed, saveSidebarCollapsed } from "./shell/shellPreferences";

export type AppView =
  | "home"
  | "capture"
  | "library"
  | "detail"
  | "progression-detail"
  | "practice"
  | "settings";
export type SaveStatus = "saved" | "saving" | "unsaved" | "error";

/** Below this window width the sidebar starts as icons only. */
export const SIDEBAR_NARROW_BELOW_PX = 1200;

interface AppShellProps {
  view: AppView;
  setView: (view: AppView) => void;
  openLiveMidi: () => void;
  openSettings: () => void;
  openVoicingLoop: () => void;
  openChordDojo?: () => void;
  openBassPractice?: () => void;
  onSearch?: () => void;
  voicingLoopActive?: boolean;
  bassPracticeActive?: boolean;
  bassPracticeAvailable?: boolean;
  settingsOpen?: boolean;
  /** 「標準のタイトルバーを使う」: the OS draws the title bar, so the shell does not. */
  standardTitleBar?: boolean;
  copy: AppCopy;
  saveStatus: SaveStatus;
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
  pageTitle: string;
  /** Small text beside the title, e.g. today's date on Home. */
  pageSubtitle?: string;
  pageNavigation?: ReactNode;
  children?: ReactNode;
  controller?: PlaybackController;
}

function narrowMedia(): MediaQueryList | undefined {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(`(max-width: ${SIDEBAR_NARROW_BELOW_PX - 1}px)`)
    : undefined;
}

export function AppShell({
  children,
  controller = playbackController,
  copy,
  masterVolume,
  onMasterVolumeChange,
  onSearch = () => undefined,
  openLiveMidi,
  openSettings,
  openVoicingLoop,
  openChordDojo,
  openBassPractice,
  pageNavigation,
  pageTitle,
  pageSubtitle,
  saveStatus,
  settingsOpen = false,
  standardTitleBar = false,
  setView,
  view,
  voicingLoopActive = false,
  bassPracticeActive = false,
  bassPracticeAvailable = true,
}: AppShellProps) {
  const playback = usePlaybackState(controller);
  const [manualCollapsed, setManualCollapsed] = useState(() => loadSidebarCollapsed());
  const [narrow, setNarrow] = useState(() => narrowMedia()?.matches ?? false);
  const collapsed = manualCollapsed ?? narrow;

  useEffect(() => {
    const media = narrowMedia();
    if (!media) return undefined;
    const update = () => setNarrow(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k" && !event.isComposing) {
        event.preventDefault();
        onSearchRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setManualCollapsed(next);
    saveSidebarCollapsed(next);
  };
  const practiceView = view === "practice";
  const chordDojoActive = practiceView && !voicingLoopActive && !bassPracticeActive;

  return (
    <div className="lv-app-frame" data-standard-title-bar={standardTitleBar || undefined} data-sidebar-collapsed={collapsed}>
      {standardTitleBar ? null : <TitleBar onSearch={onSearch} />}
      <div className="lv-app-body">
        <aside
          className="lv-sidebar"
          aria-label="サイドバー"
          data-sidebar={collapsed ? "collapsed" : "expanded"}
        >
          <nav className="lv-sidebar-nav" aria-label="メインメニュー">
            <NavItem nav="home" label="ホーム" icon={HomeIcon} collapsed={collapsed} active={!settingsOpen && view === "home"} onClick={() => setView("home")} />
            <NavItem nav="capture" label="取り込む" icon={ImportIcon} collapsed={collapsed} active={!settingsOpen && view === "capture"} onClick={() => setView("capture")} />
            <NavItem nav="vault" label="Vault" icon={VaultIcon} collapsed={collapsed} active={!settingsOpen && (view === "library" || view === "detail" || view === "progression-detail")} onClick={() => setView("library")} />
            {collapsed ? <div className="lv-sidebar-rule" role="separator" /> : <p className="lv-sidebar-heading">練習</p>}
            <NavItem nav="voicing-loop" label="Voicing Loop" icon={VoicingLoopIcon} collapsed={collapsed} active={!settingsOpen && voicingLoopActive} onClick={openVoicingLoop} />
            <NavItem nav="chord-dojo" label="Chord Dojo" icon={ChordDojoIcon} collapsed={collapsed} active={!settingsOpen && chordDojoActive} onClick={openChordDojo ?? (() => setView("practice"))} />
            {bassPracticeAvailable ? (
              <NavItem nav="bass-practice" label="Bass Practice" icon={BassPracticeIcon} collapsed={collapsed} active={!settingsOpen && bassPracticeActive} onClick={openBassPractice ?? (() => setView("practice"))} />
            ) : null}
            <div className="lv-sidebar-rule" role="separator" />
            <NavItem nav="live-midi" label="Live MIDI" icon={LiveMidiIcon} collapsed={collapsed} active={false} onClick={openLiveMidi} />
            <NavItem nav="settings" label="設定" icon={SettingsIcon} collapsed={collapsed} active={settingsOpen} onClick={openSettings} />
          </nav>
          <div className="lv-sidebar-footer">
            <button
              type="button"
              className="lv-sidebar-toggle"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "サイドバーを広げる" : "サイドバーを狭める"}
              title={collapsed ? "サイドバーを広げる" : "サイドバーを狭める"}
              aria-expanded={!collapsed}
              data-sidebar-toggle
            >
              <SidebarToggleGlyph collapsed={collapsed} />
            </button>
          </div>
        </aside>

        <div className="lv-app-column">
          <header className="lv-app-header">
            <div className="lv-app-header-leading">
              <p className="lv-app-header-title">{pageTitle}</p>
              {pageSubtitle ? <span className="lv-app-header-subtitle">{pageSubtitle}</span> : null}
              {view === "capture" ? <div id="capture-mode-tabs-host" data-testid="capture-mode-tabs-frame" className="shrink-0" /> : null}
              {pageNavigation && collapsed ? <div className="hidden min-w-0 lg:block">{pageNavigation}</div> : null}
            </div>
            <div className="lv-app-header-actions" data-global-actions>
              <MidiStatusChip onOpen={openLiveMidi} />
              <GlobalPreviewSoundSelector copy={copy} />
              <GlobalMetronomeButton />
              <div className="lv-volume-group" role="group" aria-label={copy.nav.masterVolume}>
                <MasterVolumeKnob value={masterVolume} onChange={onMasterVolumeChange} label={copy.nav.masterVolume} />
                <PlaybackLevelMeter
                  label={copy.nav.previewLevel}
                  masterVolume={masterVolume}
                  status={playback.status}
                  stopLabel={copy.nav.stopPlaying}
                  onStop={() => controller.stop()}
                />
              </div>
              <SaveStatusMark status={saveStatus} copy={copy} />
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}

function NavItem({
  active,
  collapsed,
  icon: Icon,
  label,
  nav,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: IconComponent;
  label: string;
  nav: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`lv-nav-item${collapsed ? " lv-tooltip-host" : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      data-nav={nav}
      onClick={onClick}
    >
      <Icon size={19} />
      {collapsed ? <span aria-hidden="true" className="lv-tooltip lv-tooltip-right">{label}</span> : <span className="lv-nav-label">{label}</span>}
    </button>
  );
}

function SidebarToggleGlyph({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 5.5h15v13h-15zM9.5 5.5v13" />
      <path d={collapsed ? "M13 10l2 2-2 2" : "M15 10l-2 2 2 2"} />
    </svg>
  );
}

/** Reads the existing Live MIDI state only; never asks for MIDI access. Opens Live MIDI on click. */
function MidiStatusChip({ onOpen }: { onOpen: () => void }) {
  const status = useStore(defaultLiveMidiStore, (state) => state.status);
  const device = useStore(defaultLiveMidiStore, (state) => state.selected?.name);
  const label = status === "connected" ? device ?? "MIDI 接続中"
    : status === "connecting" ? "MIDI 接続しています"
      : status === "error" ? "MIDI エラー"
        : "MIDI 未接続";
  return (
    <button type="button" className="lv-midi-chip" data-midi-status={status} onClick={onOpen} title={`MIDI 入力：${label}（Live MIDI を開く）`}>
      <span className="lv-midi-dot" aria-hidden="true" />
      <span className="lv-midi-label">{label}</span>
    </button>
  );
}

/** Saved = nothing shown. Saving / unsaved / error show a small mark at the header end. */
function SaveStatusMark({ copy, status }: { status: SaveStatus; copy: AppCopy }) {
  const label = copy.save[status];
  return (
    <span
      className="lv-save-status"
      role="status"
      aria-live="polite"
      aria-label={status === "saved" ? undefined : label}
      data-save-status={status}
    >
      {status === "saved" ? null : (
        <>
          {status === "error" ? <ErrorIcon size={14} /> : <span className="lv-save-dot" aria-hidden="true" />}
          <span className="hidden whitespace-nowrap xl:inline">{label}</span>
        </>
      )}
    </span>
  );
}
