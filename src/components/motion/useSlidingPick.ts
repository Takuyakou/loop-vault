import { useCallback, useLayoutEffect, useRef } from "react";

function place(node: HTMLElement) {
  const pressed = node.querySelector<HTMLElement>(":scope > [aria-pressed='true']");
  if (!pressed || pressed.offsetWidth === 0) { delete node.dataset.pick; return; }
  node.style.setProperty("--lv-pick-x", `${pressed.offsetLeft}px`);
  node.style.setProperty("--lv-pick-y", `${pressed.offsetTop}px`);
  node.style.setProperty("--lv-pick-w", `${pressed.offsetWidth}px`);
  node.style.setProperty("--lv-pick-h", `${pressed.offsetHeight}px`);
  node.dataset.pick = "on";
}

/**
 * P25-16 N3 (4・5): the chosen frame of a two-way choice slides to the pressed button instead of jumping. Put the
 * returned ref on the group (class `lv-motion-pick`); it measures the group's `[aria-pressed="true"]` button and
 * hands the place to the CSS. `chosen` is what is chosen now.
 */
export function useSlidingPick(chosen: string | undefined) {
  const node = useRef<HTMLElement | null>(null);
  const observer = useRef<ResizeObserver>();
  useLayoutEffect(() => { if (node.current) place(node.current); }, [chosen]);
  return useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect();
    node.current = element;
    if (!element) return;
    place(element);
    if (typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(() => place(element));
    observer.current.observe(element);
  }, []);
}
