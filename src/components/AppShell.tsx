import type { AppCopy } from "../i18n";
import { playbackController, type PlaybackController } from "../audio/playbackController";
import { usePlaybackState } from "../hooks/usePlaybackState";

export type AppView = "home" | "capture" | "library" | "detail";

export function AppShell({ view, setView, openCreate, openSettings, copy, saveLabel, controller = playbackController }: {
  view: AppView;
  setView: (view: AppView) => void;
  openCreate: () => void;
  openSettings: () => void;
  copy: AppCopy;
  saveLabel: string;
  controller?: PlaybackController;
}) {
  const playback = usePlaybackState(controller);
  return (
    <header className="flex flex-col gap-4 border-b border-[var(--lv-border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <img src="/loop-vault-icon.svg" alt="" className="h-8 w-8" />
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--lv-accent)]">Loop Vault</p>
      </div>
      <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Main navigation">
        <button className={tabClass(view === "home")} onClick={() => setView("home")}>{copy.nav.home}</button>
        <button className={tabClass(view === "capture")} onClick={() => setView("capture")}>{copy.nav.capture}</button>
        <button className={tabClass(view === "library")} onClick={() => setView("library")}>{copy.nav.library}</button>
        <button className="rounded bg-[var(--lv-accent)] px-3 py-2 font-semibold text-stone-950" onClick={openCreate}>{copy.nav.new}</button>
        {playback.status !== "idle" ? (
          <button className="lv-button-ghost inline-flex min-h-9 items-center gap-2 px-3 text-xs" onClick={() => controller.stop()} aria-label={copy.common.stop} title={copy.common.stop}>
            <span aria-hidden="true">♪</span>
            <span>{copy.common.stop}</span>
          </button>
        ) : null}
        <span className="min-w-20 px-2 py-2 text-center text-xs text-[var(--lv-text-muted)]" aria-live="polite">{saveLabel}</span>
        <button className="grid h-9 w-9 place-items-center rounded border border-[var(--lv-border-strong)] text-lg text-[var(--lv-text-secondary)] hover:border-teal-300 hover:bg-[var(--lv-surface)]" onClick={openSettings} aria-label={copy.nav.settings} title={copy.nav.settings}>⚙</button>
      </nav>
    </header>
  );
}

function tabClass(active: boolean): string {
  return active
    ? "rounded bg-[var(--lv-surface-raised)] px-3 py-2 text-[var(--lv-text)]"
    : "rounded px-3 py-2 text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface)] hover:text-[var(--lv-text)]";
}
