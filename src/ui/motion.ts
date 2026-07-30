export function preferredScrollBehavior(
  matchMedia: typeof window.matchMedia | undefined = globalThis.matchMedia,
): ScrollBehavior {
  return matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}
