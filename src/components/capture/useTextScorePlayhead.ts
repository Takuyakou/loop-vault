import { useEffect, type RefObject } from "react";
import type { TextTransport, TextTransportState } from "../../audio/textTransport";

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
    const positionLabel = document.querySelector<HTMLElement>("[data-testid='text-transport-position']");
    const clear = () => {
      if (activeBar) { activeBar.dataset.playbackActive = "false"; activeBar.dataset.playheadVisible = "false"; }
      if (activeBand) activeBand.dataset.playbackActive = "false";
      activeBar = null; activeBand = null; line = null;
    };
    const paint = () => {
      const position = transport.position();
      const barNumber = Math.min(bars, Math.max(1, Math.floor(position / beatsPerBar) + 1));
      const progress = Math.max(0, Math.min(1, (position - (barNumber - 1) * beatsPerBar) / beatsPerBar));
      if (positionLabel) {
        const precise = `${barNumber}小節目 · ${position.toFixed(2)}拍`;
        positionLabel.textContent = `${barNumber}小節目`;
        positionLabel.title = precise;
        positionLabel.setAttribute("aria-label", precise);
      }
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
        .find(band => percent >= Number.parseFloat(band.style.left)
          && percent < Number.parseFloat(band.style.left) + Number.parseFloat(band.style.width)) ?? null;
      if (nextBand !== activeBand) {
        if (activeBand) activeBand.dataset.playbackActive = "false";
        activeBand = nextBand;
      }
      if (activeBand) activeBand.dataset.playbackActive = state.status === "playing" ? "true" : "false";
      if (positionLabel && activeBand?.dataset.chord) {
        positionLabel.textContent += ` · ${activeBand.dataset.chord}`;
        positionLabel.title += ` · ${activeBand.dataset.chord}`;
        positionLabel.setAttribute("aria-label", positionLabel.title);
      }
    };
    const tick = () => { paint(); frame = requestAnimationFrame(tick); };
    paint();
    if (state.status === "playing") frame = requestAnimationFrame(tick);
    return () => { if (frame) cancelAnimationFrame(frame); clear(); };
  }, [previewRef, transport, state.status, state.positionBeats, state.bpm,
    state.snapshot, beatsPerBar, bars, sourceMatches]);
}
