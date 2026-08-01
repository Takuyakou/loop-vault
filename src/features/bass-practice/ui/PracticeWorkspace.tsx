import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type PracticeWorkspaceMode = "chord-dojo" | "bass-practice";

export function PracticeWorkspace({
  bassPractice,
  chordDojo,
  mode,
  onModeChange,
}: {
  bassPractice: ReactNode;
  chordDojo: ReactNode;
  mode: PracticeWorkspaceMode;
  onModeChange: (mode: PracticeWorkspaceMode) => void;
}) {
  const chordTabRef = useRef<HTMLButtonElement>(null);
  const bassTabRef = useRef<HTMLButtonElement>(null);

  function selectMode(next: PracticeWorkspaceMode) {
    onModeChange(next);
    (next === "chord-dojo" ? chordTabRef : bassTabRef).current?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let next: PracticeWorkspaceMode | undefined;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      next = mode === "chord-dojo" ? "bass-practice" : "chord-dojo";
    } else if (event.key === "Home") {
      next = "chord-dojo";
    } else if (event.key === "End") {
      next = "bass-practice";
    }
    if (!next) return;
    event.preventDefault();
    selectMode(next);
  }

  return (
    <div className="min-w-0 space-y-4">
      <nav className="flex w-fit max-w-full gap-1 rounded-[var(--lv-radius-md)] border border-[var(--lv-border)] bg-[var(--lv-surface)] p-1" aria-label="Practice mode" role="tablist">
        <button
          id="practice-tab-chord-dojo"
          ref={chordTabRef}
          type="button"
          className={`min-h-10 rounded-[var(--lv-radius-sm)] px-4 text-sm font-semibold transition-colors ${mode === "chord-dojo" ? "bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"}`}
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
          id="practice-tab-bass-practice"
          ref={bassTabRef}
          type="button"
          className={`min-h-10 rounded-[var(--lv-radius-sm)] px-4 text-sm font-semibold transition-colors ${mode === "bass-practice" ? "bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : "text-[var(--lv-text-secondary)] hover:text-[var(--lv-text)]"}`}
          aria-controls="practice-workspace-panel"
          aria-selected={mode === "bass-practice"}
          onClick={() => selectMode("bass-practice")}
          onKeyDown={handleTabKeyDown}
          role="tab"
          tabIndex={mode === "bass-practice" ? 0 : -1}
        >
          Bass Practice
        </button>
      </nav>
      <div
        id="practice-workspace-panel"
        aria-labelledby={mode === "chord-dojo" ? "practice-tab-chord-dojo" : "practice-tab-bass-practice"}
        role="tabpanel"
        tabIndex={-1}
        className="min-w-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-focus)]"
      >
        {mode === "bass-practice" ? bassPractice : chordDojo}
      </div>
    </div>
  );
}
