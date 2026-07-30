import type { AppCopy } from "../i18n";
import { playbackController, type PlaybackController } from "../audio/playbackController";
import { usePlaybackState } from "../hooks/usePlaybackState";
import { Check, CircleAlert, Dumbbell, LoaderCircle, Music, Piano, Plus, Settings } from "lucide-react";
import { MasterVolumeKnob } from "./MasterVolumeKnob";
import { GlobalPreviewSoundSelector } from "./GlobalPreviewSoundSelector";
import { Button, IconButton } from "./ui";

export type AppView = "home" | "capture" | "library" | "detail" | "progression-detail" | "practice";
export type SaveStatus = "saved" | "saving" | "unsaved";

export function AppShell({ view, setView, openCreate, openLiveMidi, openSettings, copy, saveStatus, masterVolume, onMasterVolumeChange, controller = playbackController }: {
  view: AppView;
  setView: (view: AppView) => void;
  openCreate: () => void;
  openLiveMidi: () => void;
  openSettings: () => void;
  copy: AppCopy;
  saveStatus: SaveStatus;
  masterVolume: number;
  onMasterVolumeChange: (value: number) => void;
  controller?: PlaybackController;
}) {
  const playback = usePlaybackState(controller);
  const saveLabel = copy.save[saveStatus];

  return (
    <header className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--lv-border)] pb-4 md:gap-3">
      <div className="flex shrink-0 items-center gap-2.5">
        <img src="/loop-vault-icon.svg" alt="" width="32" height="32" className="h-8 w-8" />
        <p className="hidden text-xs uppercase tracking-[0.2em] text-[var(--lv-accent)] xl:block">Loop Vault</p>
      </div>
      <nav className="min-w-0 flex-1 overflow-x-auto" aria-label={copy.nav.mainNavigation}>
        <div className="flex w-max items-center gap-1 text-sm md:gap-2">
        <button type="button" className={tabClass(view === "home")} aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}>{copy.nav.home}</button>
        <button type="button" className={tabClass(view === "capture")} aria-current={view === "capture" ? "page" : undefined} onClick={() => setView("capture")}>{copy.nav.capture}</button>
        <button type="button" className={tabClass(view === "library" || view === "detail" || view === "progression-detail")} aria-current={view === "library" || view === "detail" || view === "progression-detail" ? "page" : undefined} onClick={() => setView("library")}>{copy.nav.library}</button>
        <button type="button" className={tabClass(view === "practice")} aria-current={view === "practice" ? "page" : undefined} onClick={() => setView("practice")}>
          <Dumbbell aria-hidden="true" className="mr-1 inline-block" size={16} />
          {copy.nav.practice}
        </button>
        </div>
      </nav>
      <div className="ml-auto flex w-full min-w-0 shrink-0 items-center justify-end gap-1 border-t border-[var(--lv-border)] pt-2 xl:w-auto xl:border-t-0 xl:pt-0 xl:gap-2" data-global-actions>
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
          {copy.nav.new}
        </Button>
        {playback.status !== "idle" ? (
          <Button variant="ghost" size="sm" className="h-10 min-h-10 px-2 lg:px-3" onClick={() => controller.stop()} aria-label={copy.nav.stopPlaying} title={copy.nav.stopPlaying}>
            <Music aria-hidden="true" size={16} />
            <span className="hidden lg:inline">{copy.nav.playing}</span>
          </Button>
        ) : null}
        <div className="ml-1 flex items-center gap-1 border-l border-[var(--lv-border)] pl-2 md:ml-2 md:gap-2 md:pl-4">
          <IconButton variant="ghost" onClick={openLiveMidi} label={copy.nav.liveMidi}>
            <Piano aria-hidden="true" size={20} />
          </IconButton>
          <IconButton variant="ghost" className="shrink-0" onClick={openSettings} label={copy.nav.settings}>
            <Settings aria-hidden="true" size={20} />
          </IconButton>
        </div>
        <span className="ml-1 inline-flex h-10 min-w-10 items-center justify-center gap-1.5 border-l border-[var(--lv-border)] pl-2 text-center text-xs text-[var(--lv-text-muted)] md:ml-2 md:min-w-24 md:pl-4 md:pr-2" aria-live="polite" aria-label={saveLabel} title={saveLabel} data-save-status={saveStatus}>
          <SaveStatusIcon status={saveStatus} />
          <span className="hidden whitespace-nowrap md:inline">{saveLabel}</span>
        </span>
      </div>
    </header>
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

function tabClass(active: boolean): string {
  return active
    ? "min-h-10 whitespace-nowrap rounded bg-[var(--lv-surface-raised)] px-3 py-2 font-medium text-[var(--lv-text)] shadow-[inset_0_-2px_0_var(--lv-accent)]"
    : "min-h-10 whitespace-nowrap rounded px-3 py-2 text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface)] hover:text-[var(--lv-text)]";
}
