import type { AppCopy } from "../i18n";
import { playbackController, type PlaybackController } from "../audio/playbackController";
import { usePlaybackState } from "../hooks/usePlaybackState";

export type AppView = "home" | "capture" | "library" | "detail";
export type SaveStatus = "saved" | "saving" | "unsaved";

export function AppShell({ view, setView, openCreate, openSettings, copy, saveStatus, controller = playbackController }: {
  view: AppView;
  setView: (view: AppView) => void;
  openCreate: () => void;
  openSettings: () => void;
  copy: AppCopy;
  saveStatus: SaveStatus;
  controller?: PlaybackController;
}) {
  const playback = usePlaybackState(controller);
  const saveLabel = copy.save[saveStatus];
  const saveSymbol = saveStatus === "saved" ? "✓" : saveStatus === "saving" ? "●" : "!";

  return (
    <header className="flex min-w-0 items-center gap-2 border-b border-[var(--lv-border)] pb-4 md:gap-3">
      <div className="flex shrink-0 items-center gap-2.5">
        <img src="/loop-vault-icon.svg" alt="" className="h-8 w-8" />
        <p className="hidden text-xs uppercase tracking-[0.2em] text-[var(--lv-accent)] xl:block">Loop Vault</p>
      </div>
      <nav className="flex min-w-0 shrink items-center gap-1 text-sm md:gap-2" aria-label={copy.nav.mainNavigation}>
        <button className={tabClass(view === "home")} aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}>{copy.nav.home}</button>
        <button className={tabClass(view === "capture")} aria-current={view === "capture" ? "page" : undefined} onClick={() => setView("capture")}>{copy.nav.capture}</button>
        <button className={tabClass(view === "library" || view === "detail")} aria-current={view === "library" || view === "detail" ? "page" : undefined} onClick={() => setView("library")}>{copy.nav.library}</button>
      </nav>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 md:gap-2">
        <button className="whitespace-nowrap rounded bg-[var(--lv-accent)] px-2.5 py-2 text-sm font-semibold text-stone-950 md:px-3" onClick={openCreate}>{copy.nav.new}</button>
        {playback.status !== "idle" ? (
          <button className="lv-button-ghost inline-flex h-9 min-w-9 items-center justify-center gap-2 px-2 text-xs lg:px-3" onClick={() => controller.stop()} aria-label={copy.nav.stopPlaying} title={copy.nav.stopPlaying}>
            <span aria-hidden="true">♪</span>
            <span className="hidden lg:inline">{copy.nav.playing}</span>
          </button>
        ) : null}
        <span className="inline-flex h-9 min-w-9 items-center justify-center gap-1.5 px-1 text-center text-xs text-[var(--lv-text-muted)] lg:min-w-20 lg:px-2" aria-live="polite" aria-label={saveLabel} title={saveLabel} data-save-status={saveStatus}>
          <span aria-hidden="true">{saveSymbol}</span>
          <span className="hidden whitespace-nowrap lg:inline">{saveLabel}</span>
        </span>
        <button className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded border border-[var(--lv-border-strong)] text-lg text-[var(--lv-text-secondary)] hover:border-teal-300 hover:bg-[var(--lv-surface)] md:ml-2" onClick={openSettings} aria-label={copy.nav.settings} title={copy.nav.settings}>
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
    </header>
  );
}

function tabClass(active: boolean): string {
  return active
    ? "whitespace-nowrap rounded bg-[var(--lv-surface-raised)] px-2 py-2 text-[var(--lv-text)] md:px-3"
    : "whitespace-nowrap rounded px-2 py-2 text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface)] hover:text-[var(--lv-text)] md:px-3";
}
