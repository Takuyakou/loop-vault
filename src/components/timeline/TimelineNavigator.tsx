import type { PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { useRef } from "react";

/** Pointer position along a strip as 0…1 (clamped). */
export function fractionAt(clientX: number, left: number, width: number): number {
  if (width <= 0) return 0;
  return Math.min(1, Math.max(0, (clientX - left) / width));
}

/** Where a dragged window's left edge goes: it keeps the point it was grabbed at, and stays inside the strip. */
export function windowLeftFromDrag(pointerFraction: number, grabOffset: number, windowWidth: number): number {
  return Math.min(Math.max(0, 1 - windowWidth), Math.max(0, pointerFraction - grabOffset));
}

/**
 * A whole-song strip that shows where the viewport is (the frame) and where playback is (the head).
 * It draws nothing itself that changes while playing: the parent moves `frameRef` / `headRef` by
 * style (no React render per frame) and fills the strip with `children`.
 *
 *  - press outside the frame → `onSeek(fraction)` (jump there);
 *  - drag the frame → `onMoveWindow(leftFraction)` (scroll the viewport; playback is left alone).
 */
export function TimelineNavigator({ frameRef, headRef, containerRef, onSeek, onMoveWindow, children, label, testId, heightClass = "h-3" }: {
  readonly frameRef: RefObject<HTMLDivElement>;
  readonly headRef: RefObject<HTMLDivElement>;
  readonly containerRef: RefObject<HTMLDivElement>;
  readonly onSeek: (fraction: number) => void;
  readonly onMoveWindow: (leftFraction: number) => void;
  readonly children?: ReactNode;
  readonly label: string;
  readonly testId: string;
  /** Height of the strip (Tailwind class). Voicing Loop keeps the thin default. */
  readonly heightClass?: string;
}) {
  const drag = useRef<{ grabOffset: number; width: number } | undefined>(undefined);
  const frameFractions = () => {
    const frame = frameRef.current;
    return { left: Number.parseFloat(frame?.style.left || "0") / 100, width: Number.parseFloat(frame?.style.width || "100") / 100 };
  };
  const pointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = containerRef.current?.getBoundingClientRect();
    return box ? fractionAt(event.clientX, box.left, box.width) : 0;
  };
  return (
    <div ref={containerRef} className={`relative ${heightClass} min-w-[96px] flex-1 cursor-pointer touch-none overflow-hidden rounded bg-[var(--lv-bg)]`}
      data-testid={testId} role="group" aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const at = pointer(event);
        const frame = frameFractions();
        if (at >= frame.left && at <= frame.left + frame.width && frame.width < 1) drag.current = { grabOffset: at - frame.left, width: frame.width };
        else onSeek(at);
      }}
      onPointerMove={(event) => {
        if (!drag.current || event.buttons !== 1) return;
        onMoveWindow(windowLeftFromDrag(pointer(event), drag.current.grabOffset, drag.current.width));
      }}
      onPointerUp={() => { drag.current = undefined; }}
      onPointerCancel={() => { drag.current = undefined; }}
    >
      {children}
      <div ref={frameRef} data-navigator-frame className="pointer-events-none absolute inset-y-0 rounded-sm border border-[var(--lv-accent)] bg-[var(--lv-accent)]/15" style={{ left: "0%", width: "100%" }} />
      <div ref={headRef} data-navigator-head className="pointer-events-none absolute inset-y-0 w-px bg-[var(--lv-text)]" style={{ left: "0%" }} />
    </div>
  );
}
