import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type PracticeWorkspaceMode = "chord-dojo" | "voicing-loop" | "bass-practice";

export function PracticeWorkspace({
  bassPractice,
  bassPracticeAvailable = true,
  chordDojo,
  mode,
  onModeChange,
  voicingLoop,
}: {
  bassPractice: ReactNode;
  bassPracticeAvailable?: boolean;
  chordDojo: ReactNode;
  mode: PracticeWorkspaceMode;
  onModeChange: (mode: PracticeWorkspaceMode) => void;
  voicingLoop: ReactNode;
}) {
  const compact = mode === "voicing-loop";

  return (
    <div className={compact ? "flex h-full min-h-0 min-w-0 flex-col gap-2" : "min-w-0 space-y-4"}>
      <div className="shrink-0 lg:hidden" data-practice-workspace-tabs>
        <PracticeModeTabs
          bassPracticeAvailable={bassPracticeAvailable}
          idPrefix="practice-workspace-tab"
          mode={mode}
          onModeChange={onModeChange}
        />
      </div>
      <div
        id="practice-workspace-panel"
        aria-label="Practice workspace"
        role="tabpanel"
        tabIndex={-1}
        className={`min-w-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-focus)] ${compact ? "min-h-0 flex-1 overflow-x-hidden overflow-y-auto" : ""}`}
      >
        {mode === "bass-practice"
          ? bassPractice
          : mode === "voicing-loop"
            ? voicingLoop
            : chordDojo}
      </div>
    </div>
  );
}

export function PracticeModeTabs({
  bassPracticeAvailable = true,
  idPrefix = "practice-header-tab",
  mode,
  onModeChange,
}: {
  bassPracticeAvailable?: boolean;
  idPrefix?: string;
  mode: PracticeWorkspaceMode;
  onModeChange: (mode: PracticeWorkspaceMode) => void;
}) {
  const chordTabRef = useRef<HTMLButtonElement>(null);
  const voicingTabRef = useRef<HTMLButtonElement>(null);
  const bassTabRef = useRef<HTMLButtonElement>(null);
  const availableModes: readonly PracticeWorkspaceMode[] = bassPracticeAvailable
    ? ["chord-dojo", "voicing-loop", "bass-practice"]
    : ["chord-dojo", "voicing-loop"];

  function selectMode(next: PracticeWorkspaceMode) {
    if (!availableModes.includes(next)) return;
    onModeChange(next);
    const target = next === "chord-dojo"
      ? chordTabRef
      : next === "voicing-loop"
        ? voicingTabRef
        : bassTabRef;
    target.current?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let next: PracticeWorkspaceMode | undefined;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const currentIndex = Math.max(0, availableModes.indexOf(mode));
      next = availableModes[(currentIndex + direction + availableModes.length) % availableModes.length];
    } else if (event.key === "Home") {
      next = availableModes[0];
    } else if (event.key === "End") {
      next = availableModes[availableModes.length - 1];
    }
    if (!next) return;
    event.preventDefault();
    selectMode(next);
  }

  const tabClassName = "min-h-10 px-4 text-sm";
  return (
      <nav className="flex w-fit max-w-full shrink-0 gap-1 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] bg-[var(--lv-surface)] p-1" aria-label="Practice mode" role="tablist">
        <button
          id={`${idPrefix}-chord-dojo`}
          ref={chordTabRef}
          type="button"
          className={`${tabClassName} rounded-[var(--lv-radius-sm)] font-semibold transition-colors ${mode === "chord-dojo" ? "bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"}`}
          aria-controls="practice-workspace-panel"
          aria-selected={mode === "chord-dojo"}
          onClick={() => selectMode("chord-dojo")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={mode === "chord-dojo" ? 0 : -1}
        >
          Chord Dojo
        </button>
        <button
          id={`${idPrefix}-voicing-loop`}
          ref={voicingTabRef}
          type="button"
          className={`${tabClassName} rounded-[var(--lv-radius-sm)] font-semibold transition-colors ${mode === "voicing-loop" ? "bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"}`}
          aria-controls="practice-workspace-panel"
          aria-selected={mode === "voicing-loop"}
          onClick={() => selectMode("voicing-loop")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={mode === "voicing-loop" ? 0 : -1}
        >
          Voicing Loop
        </button>
        {bassPracticeAvailable ? (
        <button
          id={`${idPrefix}-bass-practice`}
          ref={bassTabRef}
          type="button"
          className={`${tabClassName} rounded-[var(--lv-radius-sm)] font-semibold transition-colors ${mode === "bass-practice" ? "bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"}`}
          aria-controls="practice-workspace-panel"
          aria-selected={mode === "bass-practice"}
          onClick={() => selectMode("bass-practice")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={mode === "bass-practice" ? 0 : -1}
        >
          Bass Practice
        </button>
        ) : null}
      </nav>
  );
}
