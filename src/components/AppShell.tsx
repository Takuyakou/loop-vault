import type { AppCopy } from "../i18n";
import { playbackController, type PlaybackController } from "../audio/playbackController";
import { usePlaybackState } from "../hooks/usePlaybackState";
import { Check, CircleAlert, LoaderCircle, Music, Piano, Plus, Settings } from "lucide-react";

export type AppView = "home" | "capture" | "library" | "detail" | "progression-detail";
export type SaveStatus = "saved" | "saving" | "unsaved";

export function AppShell({ view, setView, openCreate, openLiveMidi, openSettings, copy, saveStatus, controller = playbackController }: {
  view: AppView;
  setView: (view: AppView) => void;
  openCreate: () => void;
  openLiveMidi: () => void;
  openSettings: () => void;
  copy: AppCopy;
  saveStatus: SaveStatus;
  controller?: PlaybackController;
}) {
  const playback = usePlaybackState(controller);
  const saveLabel = copy.save[saveStatus];

  return (
    <header className="flex min-w-0 flex-wrap items-center gap-2 border-b border-[var(--lv-border)] pb-4 sm:flex-nowrap md:gap-3">
      <div className="flex shrink-0 items-center gap-2.5">
        <img src="/loop-vault-icon.svg" alt="" className="h-8 w-8" />
        <p className="hidden text-xs uppercase tracking-[0.2em] text-[var(--lv-accent)] xl:block">Loop Vault</p>
      </div>
      <nav className="flex min-w-0 shrink items-center gap-1 text-sm md:gap-2" aria-label={copy.nav.mainNavigation}>
        <button className={tabClass(view === "home")} aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}>{copy.nav.home}</button>
        <button className={tabClass(view === "capture")} aria-current={view === "capture" ? "page" : undefined} onClick={() => setView("capture")}>{copy.nav.capture}</button>
        <button className={tabClass(view === "library" || view === "detail" || view === "progression-detail")} aria-current={view === "library" || view === "detail" || view === "progression-detail" ? "page" : undefined} onClick={() => setView("library")}>{copy.nav.library}</button>
      </nav>
      <div className="ml-auto flex w-full min-w-0 shrink-0 items-center justify-end gap-1 border-t border-[var(--lv-border)] pt-2 sm:w-auto sm:border-t-0 sm:pt-0 md:gap-2">
        <button
          className="lv-button-primary inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-2.5 text-sm font-semibold md:px-3"
          onClick={openCreate}
          title={`+ ${copy.nav.new}`}
        >
          <Plus aria-hidden="true" size={16} />
          {copy.nav.new}
        </button>
        {playback.status !== "idle" ? (
          <button className="lv-button-ghost inline-flex h-9 min-w-9 items-center justify-center gap-2 px-2 text-xs lg:px-3" onClick={() => controller.stop()} aria-label={copy.nav.stopPlaying} title={copy.nav.stopPlaying}>
            <Music aria-hidden="true" size={16} />
            <span className="hidden lg:inline">{copy.nav.playing}</span>
          </button>
        ) : null}
        <div className="ml-1 flex items-center gap-1 border-l border-[var(--lv-border)] pl-2 md:ml-2 md:gap-2 md:pl-4">
          <button className="lv-button-ghost grid h-9 w-9 place-items-center" onClick={openLiveMidi} aria-label={copy.nav.liveMidi} title={copy.nav.liveMidi}>
            <Piano aria-hidden="true" size={20} />
          </button>
          <button className="lv-button-ghost grid h-9 w-9 shrink-0 place-items-center" onClick={openSettings} aria-label={copy.nav.settings} title={copy.nav.settings}>
            <Settings aria-hidden="true" size={20} />
          </button>
        </div>
        <span className="ml-1 inline-flex h-9 min-w-9 items-center justify-center gap-1.5 border-l border-[var(--lv-border)] pl-2 text-center text-xs text-[var(--lv-text-muted)] md:ml-2 md:pl-4 lg:min-w-24 lg:pr-2" aria-live="polite" aria-label={saveLabel} title={saveLabel} data-save-status={saveStatus}>
          <SaveStatusIcon status={saveStatus} />
          <span className="hidden whitespace-nowrap lg:inline">{saveLabel}</span>
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
    ? "whitespace-nowrap rounded bg-[var(--lv-surface-raised)] px-2 py-2 text-[var(--lv-text)] md:px-3"
    : "whitespace-nowrap rounded px-2 py-2 text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface)] hover:text-[var(--lv-text)] md:px-3";
}
