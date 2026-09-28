import { useCallback, useEffect, useRef, useState } from "react";

export interface VaultKeyboardActions<T> {
  visible: readonly T[];
  enabled: boolean;
  onPlay: (entry: T) => void;
  onOpen: (entry: T) => void;
  onCopy: (entry: T) => void;
  onPin: (entry: T) => void;
}

/** Row selection and window-level shortcuts: / search, ↑↓ select, Space play, Enter open, C copy, S favorite. */
export function useVaultKeyboardSelection<T>({ visible, enabled, onPlay, onOpen, onCopy, onPin }: VaultKeyboardActions<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedIndex((value) => Math.min(value, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  const handleKey = useCallback((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, button, a, [role='button']") || target?.isContentEditable) return;
    if (event.key === "/") {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }
    const active = visible[selectedIndex];
    if (!active || !enabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((value) => Math.max(0, Math.min(visible.length - 1,
        value + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === " ") {
      event.preventDefault();
      onPlay(active);
    } else if (event.key === "Enter") {
      onOpen(active);
    } else if (event.key.toLowerCase() === "c") {
      onCopy(active);
    } else if (event.key.toLowerCase() === "s") {
      onPin(active);
    }
  }, [enabled, onCopy, onOpen, onPin, onPlay, selectedIndex, visible]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return { selectedIndex, setSelectedIndex, searchRef };
}

/** Fixed-height virtual window that keeps the keyboard-selected row in view. */
export function useVirtualRowWindow(count: number, selectedIndex: number, rowHeight: number, viewportHeight: number, overscan = 6) {
  const [scrollTop, setScrollTop] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rowTop = selectedIndex * rowHeight;
    const rowBottom = rowTop + rowHeight;
    if (rowTop < viewport.scrollTop) viewport.scrollTop = rowTop;
    else if (rowBottom > viewport.scrollTop + viewportHeight) {
      viewport.scrollTop = rowBottom - viewportHeight;
    }
  }, [rowHeight, selectedIndex, viewportHeight]);

  return { viewportRef, start, end, onScroll: (event: { currentTarget: HTMLElement }) => setScrollTop(event.currentTarget.scrollTop) };
}
