// P8.9-02 bottom bars declare their own height so the toast stack sits above them
// (replaces the P8.9-01 `:root:has(...)` rules and their hard-coded heights).
import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

const reservations = new Map<number, number>();
const listeners = new Set<() => void>();
let nextId = 1;
let snapshot = 0;

function publish() {
  snapshot = Math.max(0, ...reservations.values());
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The tallest space any mounted bottom bar currently reserves, in px. */
export function useReservedBottomSpace(): number {
  return useSyncExternalStore(subscribe, () => snapshot, () => 0);
}

/**
 * Space from the element's top edge to the bottom of the viewport, when the element
 * sits on the bottom edge; 0 when it is elsewhere on screen.
 */
export function bottomSpaceFor(rect: Pick<DOMRect, "top" | "bottom" | "height">, viewportHeight: number): number {
  if (rect.height <= 0 || rect.bottom < viewportHeight - 48) return 0;
  return Math.max(0, Math.ceil(viewportHeight - rect.top));
}

/** Reserve the bottom space an element occupies while it is mounted and visible. */
export function useReserveBottomSpace(ref: RefObject<HTMLElement | null>, enabled = true): void {
  const id = useRef(0);
  if (id.current === 0) id.current = nextId++;

  useEffect(() => {
    const element = ref.current;
    const key = id.current;
    if (!enabled || !element) return undefined;
    const measure = () => {
      const next = bottomSpaceFor(element.getBoundingClientRect(), window.innerHeight);
      if (reservations.get(key) === next) return;
      reservations.set(key, next);
      publish();
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      reservations.delete(key);
      publish();
    };
  }, [enabled, ref]);
}
