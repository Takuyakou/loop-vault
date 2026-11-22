export function preferredScrollBehavior(
  matchMedia: typeof window.matchMedia | undefined = globalThis.matchMedia,
): ScrollBehavior {
  return matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

/** P23-03: the content fades in (0.18 s) when the view changes. No-op with reduced motion or without WAAPI (tests). */
export function fadeInView(
  element: HTMLElement | null | undefined,
  matchMedia: typeof window.matchMedia | undefined = globalThis.matchMedia,
): void {
  if (!element || typeof element.animate !== "function") return;
  if (matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" });
}
