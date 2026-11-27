import { useEffect, type RefObject } from "react";
import type { TextTransport, TextTransportState } from "../../audio/textTransport";

/** P24-05: the card's place in the bar; the new preview writes it as data, the old one as inline style. */
function numeric(element: HTMLElement, name: "left" | "width"): number {
  const raw = element.dataset[name] ?? element.style[name];
  const value = Number.parseFloat(raw ?? "");
  return Number.isFinite(value) ? value : 0;
}

/** Paint only the active score bar and its line; React never renders per frame. */
export function useTextScorePlayhead(
  previewRef: RefObject<HTMLElement | null>, transport: TextTransport,
  state: TextTransportState, beatsPerBar: number, bars: number, sourceMatches: boolean,
) {
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || !bars || !Number.isFinite(beatsPerBar) || beatsPerBar <= 0) return;
    let frame = 0;
    let activeBar: HTMLElement | null = null;
    let activeBand: HTMLElement | null = null;
    let line: HTMLElement | null = null;
    const clear = () => {
      if (activeBar) { activeBar.dataset.playbackActive = "false"; activeBar.dataset.playheadVisible = "false"; }
      if (activeBand) activeBand.dataset.playbackActive = "false";
      activeBar = null; activeBand = null; line = null;
    };
    const paint = () => {
      const position = transport.position();
      const barNumber = Math.min(bars, Math.max(1, Math.floor(position / beatsPerBar) + 1));
      const progress = Math.max(0, Math.min(1, (position - (barNumber - 1) * beatsPerBar) / beatsPerBar));
      if (!sourceMatches) { clear(); return; }
      if (!activeBar || Number(activeBar.dataset.bar) !== barNumber) {
        clear();
        activeBar = preview.querySelector<HTMLElement>(`[data-testid='extended-text-bar'][data-bar='${barNumber}']`);
        line = activeBar?.querySelector<HTMLElement>("[data-testid='text-smooth-playhead']") ?? null;
        if (activeBar && state.status !== "stopped") activeBar.scrollIntoView?.({ block: "nearest" });
      }
      if (!activeBar) return;
      activeBar.dataset.playheadVisible = "true";
      activeBar.dataset.playbackActive = state.status === "playing" ? "true" : "false";
      if (line) line.style.left = `${progress * 100}%`;
      const percent = progress * 100;
      const nextBand = [...activeBar.querySelectorAll<HTMLElement>("[data-testid='text-preview-band']")]
        .find(band => percent >= numeric(band, "left") && percent < numeric(band, "left") + numeric(band, "width")) ?? null;
      if (nextBand !== activeBand) {
        if (activeBand) activeBand.dataset.playbackActive = "false";
        activeBand = nextBand;
      }
      if (activeBand) activeBand.dataset.playbackActive = state.status === "playing" ? "true" : "false";
    };
    const tick = () => { paint(); frame = requestAnimationFrame(tick); };
    paint();
    if (state.status === "playing") frame = requestAnimationFrame(tick);
    return () => { if (frame) cancelAnimationFrame(frame); clear(); };
  }, [previewRef, transport, state.status, state.positionBeats, state.bpm,
    state.snapshot, beatsPerBar, bars, sourceMatches]);
}
