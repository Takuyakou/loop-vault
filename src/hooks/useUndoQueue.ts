import { useCallback, useEffect, useRef, useState } from "react";

export interface UndoableAction<T = unknown> {
  id: string;
  label: string;
  payload: T;
  expiresAt: number;
  focusTarget?: HTMLElement | null;
  undo(): boolean | void;
  commit?(): boolean | void;
}

export interface UndoRequest<T> {
  label: string;
  payload: T;
  focusTarget?: HTMLElement | null;
  undo(): boolean | void;
  commit?(): boolean | void;
}

export interface UseUndoQueueOptions {
  durationMs?: number;
  now?: () => number;
  idFactory?: () => string;
}

export function useUndoQueue(options: UseUndoQueueOptions = {}) {
  const durationMs = options.durationMs ?? 5000;
  const now = options.now ?? Date.now;
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const [actions, setActions] = useState<UndoableAction[]>([]);
  const actionsRef = useRef<UndoableAction[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeAction = useCallback((id: string) => {
    actionsRef.current = actionsRef.current.filter((action) => action.id !== id);
    setActions(actionsRef.current);
  }, []);

  const clearWhere = useCallback(
    (predicate: (action: UndoableAction) => boolean) => {
      const removed = actionsRef.current.filter(predicate);
      if (removed.length === 0) return;
      for (const action of removed) {
        const timer = timersRef.current.get(action.id);
        if (timer) clearTimeout(timer);
        timersRef.current.delete(action.id);
      }
      actionsRef.current = actionsRef.current.filter(
        (action) => !predicate(action),
      );
      setActions(actionsRef.current);
    },
    [],
  );

  const clearAll = useCallback(() => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    actionsRef.current = [];
    setActions([]);
  }, []);

  const commitAction = useCallback((action: UndoableAction): boolean => {
    try {
      return action.commit?.() !== false;
    } catch {
      return false;
    }
  }, []);

  const commitAll = useCallback((): boolean => {
    const pending = [...actionsRef.current];
    let committedAll = true;
    for (const action of pending) {
      if (commitAction(action)) {
        clearWhere((candidate) => candidate.id === action.id);
      } else {
        committedAll = false;
      }
    }
    return committedAll;
  }, [clearWhere, commitAction]);

  const enqueue = useCallback(<T,>(request: UndoRequest<T>): string => {
    const id = idFactory();
    const action: UndoableAction<T> = {
      ...request,
      id,
      expiresAt: now() + durationMs,
      focusTarget: request.focusTarget ?? currentFocusTarget(),
    };
    actionsRef.current = [
      ...actionsRef.current,
      action as UndoableAction,
    ];
    setActions(actionsRef.current);
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      const current = actionsRef.current.find((candidate) => candidate.id === id);
      if (current && commitAction(current)) removeAction(id);
    }, durationMs);
    timersRef.current.set(id, timer);
    return id;
  }, [commitAction, durationMs, idFactory, now, removeAction]);

  const undo = useCallback((id: string): boolean => {
    const action = actionsRef.current.find((candidate) => candidate.id === id);
    if (!action) return false;
    try {
      if (action.undo() === false) return false;
    } catch {
      return false;
    }
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    removeAction(id);
    return true;
  }, [removeAction]);

  useEffect(() => () => {
    const pending = [...actionsRef.current];
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    actionsRef.current = [];
    for (const action of pending) commitAction(action);
  }, [commitAction]);

  return {
    actions,
    enqueue,
    undo,
    clearAll,
    clearWhere,
    commitAll,
  };
}

function currentFocusTarget(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLElement && activeElement !== document.body
    ? activeElement
    : null;
}
