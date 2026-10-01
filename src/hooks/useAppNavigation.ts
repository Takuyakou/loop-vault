// P8.9-02: the app's screen routing, split out of App.tsx (audit §1).
// Owns which screen is shown, the selected Idea / progression, and the
// "leave with unsaved progression edits?" guard.
import { useRef, useState } from "react";
import type { AppView } from "../components/AppShell";

export interface ProgressionSelection {
  ideaId: string;
  blockId: string;
}

export interface UseAppNavigationOptions {
  /** Runs inside the leave guard just before the view changes (e.g. clear transient practice state). */
  onNavigate?: (nextView: AppView, previousView: AppView) => void;
}

export function useAppNavigation(options: UseAppNavigationOptions = {}) {
  const [view, setView] = useState<AppView>("home");
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedProgression, setSelectedProgression] = useState<ProgressionSelection>();
  const [progressionDetailDirty, setProgressionDetailDirty] = useState(false);
  // P10.0-06: the correction workspace keeps its edits only while it is shown (count of unsaved operations).
  const [captureWorkspaceDirty, setCaptureWorkspaceDirty] = useState(0);
  const [pendingProgressionLeave, setPendingProgressionLeave] = useState<(() => void)>();
  const onNavigateRef = useRef(options.onNavigate);
  onNavigateRef.current = options.onNavigate;

  function requestProgressionLeave(action: () => void) {
    if ((view === "progression-detail" && progressionDetailDirty) || (view === "capture" && captureWorkspaceDirty > 0)) {
      setPendingProgressionLeave(() => action);
      return;
    }
    action();
  }

  function navigateTo(nextView: AppView) {
    requestProgressionLeave(() => {
      onNavigateRef.current?.(nextView, view);
      setView(nextView);
    });
  }

  function openDetail(id: string) {
    setSelectedProgression(undefined);
    setSelectedId(id);
    setView("detail");
  }

  function openProgression(ideaId: string, blockId: string) {
    setSelectedId(ideaId);
    setSelectedProgression({ ideaId, blockId });
    setView("progression-detail");
  }

  return {
    view,
    setView,
    selectedId,
    setSelectedId,
    selectedProgression,
    setSelectedProgression,
    progressionDetailDirty,
    setProgressionDetailDirty,
    captureWorkspaceDirty,
    setCaptureWorkspaceDirty,
    pendingProgressionLeave,
    setPendingProgressionLeave,
    requestProgressionLeave,
    navigateTo,
    openDetail,
    openProgression,
  };
}
