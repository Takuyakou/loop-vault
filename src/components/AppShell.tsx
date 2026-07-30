import { useState, type ReactNode } from "react";
import type { AppCopy } from "../i18n";
import { playbackController, type PlaybackController } from "../audio/playbackController";
import { usePlaybackState } from "../hooks/usePlaybackState";
import {
  AudioWaveform,
  Check,
  CircleAlert,
  Dumbbell,
  History,
  Home,
  Layers3,
  LoaderCircle,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Piano,
  Plus,
  Settings,
} from "lucide-react";
import { MasterVolumeKnob } from "./MasterVolumeKnob";
import { GlobalPreviewSoundSelector } from "./GlobalPreviewSoundSelector";
import { Button, IconButton } from "./ui";

export type AppView =
  | "home"
  | "capture"
  | "library"
  | "detail"
  | "progression-detail"
  | "practice"
  | "history";
export type SaveStatus = "saved" | "saving" | "unsaved";

interface AppShellProps {
  view: AppView;
  setView: (view: AppView) => void;
  openCreate: () => void;
  openLiveMidi: () => void;
  openSettings: () => void;
  copy: AppCopy;
  saveStatus: SaveStatus;
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
  pageTitle: string;
  pageContext?: string;
  children?: ReactNode;
  controller?: PlaybackController;
}

const workspaceItems = [
  { view: "home", label: "Home", icon: Home },
  { view: "capture", label: "Chord Capture", icon: AudioWaveform },
  { view: "library", label: "Vault", icon: Layers3 },
  { view: "practice", label: "Practice", icon: Dumbbell },
] as const;

export function AppShell({
  children,
  controller = playbackController,
  copy,
  masterVolume,
  onMasterVolumeChange,
  openCreate,
  openLiveMidi,
  openSettings,
  pageContext,
  pageTitle,
  saveStatus,
  setView,
  view,
}: AppShellProps) {
  const playback = usePlaybackState(controller);
  const saveLabel = copy.save[saveStatus];
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 1100px)").matches,
  );

  return (
    <div className="flex h-screen min-h-[520px] min-w-0 overflow-hidden bg-[var(--lv-bg)] text-[var(--lv-text)]">
      <aside
        className={`flex shrink-0 flex-col border-r border-[var(--lv-border)] bg-[var(--lv-sidebar)] transition-[width] duration-150 ${
          collapsed ? "w-[var(--lv-sidebar-collapsed)]" : "w-[var(--lv-sidebar-expanded)]"
        }`}
        aria-label="Application sidebar"
        data-sidebar={collapsed ? "collapsed" : "expanded"}
      >
        <div className={`flex h-[var(--lv-topbar-height)] items-center border-b border-[var(--lv-border)] ${
          collapsed ? "justify-center px-2" : "gap-3 px-4"
        }`}>
          <img src="/loop-vault-icon.svg" alt="" width="34" height="34" className="h-[34px] w-[34px] shrink-0" />
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold uppercase text-[var(--lv-text)]">Loop Vault</p>
              <p className="truncate text-[11px] uppercase text-[var(--lv-text-muted)]">Music Workspace</p>
            </div>
          ) : null}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-4" aria-label={copy.nav.mainNavigation}>
          <SidebarGroup label="Workspace" collapsed={collapsed}>
            {workspaceItems.map((item) => (
              <SidebarItem
                key={item.view}
                active={isRouteActive(view, item.view)}
                collapsed={collapsed}
                icon={item.icon}
                label={item.label}
                onClick={() => setView(item.view)}
              />
            ))}
            <SidebarItem
              active={false}
              collapsed={collapsed}
              icon={Piano}
              label="Live MIDI"
              onClick={openLiveMidi}
            />
          </SidebarGroup>

          <SidebarGroup label="System" collapsed={collapsed} className="mt-5">
            <SidebarItem
              active={view === "history"}
              collapsed={collapsed}
              icon={History}
              label="History"
              onClick={() => setView("history")}
            />
            <SidebarItem
              active={false}
              collapsed={collapsed}
              icon={Settings}
              label="Settings"
              onClick={openSettings}
            />
          </SidebarGroup>
        </nav>

        <div className="border-t border-[var(--lv-border)] p-2">
          <IconButton
            variant="ghost"
            className={collapsed ? "mx-auto" : "ml-auto"}
            onClick={() => setCollapsed((current) => !current)}
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            data-sidebar-toggle
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" size={18} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={18} />
            )}
          </IconButton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[var(--lv-topbar-height)] shrink-0 items-center gap-3 border-b border-[var(--lv-border)] bg-[var(--lv-topbar)] px-4 lg:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-[var(--lv-text)]">{pageTitle}</p>
            {pageContext ? (
              <p className="truncate text-xs text-[var(--lv-text-muted)]">{pageContext}</p>
            ) : null}
          </div>
          <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5" data-global-actions>
            <GlobalPreviewSoundSelector copy={copy} />
            <MasterVolumeKnob
              value={masterVolume}
              onChange={onMasterVolumeChange}
              label={copy.nav.masterVolume}
            />
            <Button
              variant="primary"
              className="h-10 whitespace-nowrap px-3"
              onClick={openCreate}
              title={`+ ${copy.nav.new}`}
            >
              <Plus aria-hidden="true" size={16} />
              <span className="hidden sm:inline">{copy.nav.new}</span>
            </Button>
            {playback.status !== "idle" ? (
              <IconButton
                variant="ghost"
                onClick={() => controller.stop()}
                label={copy.nav.stopPlaying}
              >
                <Music aria-hidden="true" size={18} />
              </IconButton>
            ) : null}
            <span
              className="ml-1 inline-flex h-10 min-w-10 items-center justify-center gap-1.5 border-l border-[var(--lv-border)] pl-3 text-xs text-[var(--lv-text-muted)]"
              aria-live="polite"
              aria-label={saveLabel}
              title={saveLabel}
              data-save-status={saveStatus}
            >
              <SaveStatusIcon status={saveStatus} />
              <span className="hidden whitespace-nowrap xl:inline">{saveLabel}</span>
            </span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

function SidebarGroup({
  children,
  className = "",
  collapsed,
  label,
}: {
  children: ReactNode;
  className?: string;
  collapsed: boolean;
  label: string;
}) {
  return (
    <div className={className}>
      {!collapsed ? (
        <p className="mb-2 px-3 text-[11px] font-bold uppercase text-[var(--lv-text-muted)]">
          {label}
        </p>
      ) : (
        <span className="sr-only">{label}</span>
      )}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SidebarItem({
  active,
  collapsed,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: typeof Home;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`relative flex min-h-10 w-full items-center rounded-[var(--lv-radius-sm)] text-sm font-medium transition-colors ${
        collapsed ? "justify-center px-2" : "gap-3 px-3"
      } ${
        active
          ? "bg-[var(--lv-accent-soft)] text-[var(--lv-text)] before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-[var(--lv-accent)]"
          : "text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface)] hover:text-[var(--lv-text)]"
      }`}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="shrink-0" size={18} />
      {!collapsed ? <span className="min-w-0 truncate">{label}</span> : null}
    </button>
  );
}

function SaveStatusIcon({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />;
  }
  if (status === "unsaved") {
    return <CircleAlert aria-hidden="true" size={16} />;
  }
  return <Check aria-hidden="true" size={16} />;
}

function isRouteActive(view: AppView, target: typeof workspaceItems[number]["view"]): boolean {
  if (target === "library") {
    return view === "library" || view === "detail" || view === "progression-detail";
  }
  return view === target;
}
