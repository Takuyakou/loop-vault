/**
 * P25 V23 Stage 1: the 「次のコード」 palette (proposal v4 §6.1–§6.3, the dimensions and states of the design's
 * 「寸法・色・状態」). It is a dialog over the preview; opening and closing move it (150ms in / 120ms out) and the
 * parent keeps it mounted until the leaving motion ends.
 */
import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { ChordSymbol } from "../../domain/types";
import type { NextChordSuggestion } from "../../domain/nextChordSuggestions/suggestNextChords";
import { cardHarmony } from "../correction-workspace/cardHarmony";
import { displayChordLabel, displayDegreeLabel } from "../../ui/chordText";
import type { PresenceRender } from "../motion/Presence";
import { roleColor } from "./TextUnifiedWorkspace";

export interface SuggestionAnchor {
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** P25 V24-5/V26-1: the preview's sides (the palette stays 14px in from them) and the working area's top and bottom. */
  readonly frame?: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
}

export type SuggestionLength = 1 | 2 | "bar";

interface Props {
  readonly presence: PresenceRender;
  readonly anchor: SuggestionAnchor;
  readonly suggestions: readonly NextChordSuggestion[];
  readonly keyLabel: string;
  readonly keyContext: string;
  readonly keyChords: readonly { readonly chord: ChordSymbol; readonly label: string }[];
  readonly length: SuggestionLength;
  readonly onLength: (value: SuggestionLength) => void;
  readonly canUndo: boolean;
  readonly onUndo: () => void;
  readonly onClose: () => void;
  readonly onPreview: (entry: { chord: ChordSymbol; label: string }) => void;
  readonly onAdd: (entry: { chord: ChordSymbol; label: string }) => void;
  readonly rejected: boolean;
}

/** The palette's room: the preview frame's sides, and the height from under the reading-settings row to 12px above the window's bottom. */
export function paletteBounds(): { left: number; right: number; top: number; bottom: number } | undefined {
  const preview = document.querySelector<HTMLElement>("[data-testid='standard-text-preview-scroll']");
  if (preview === null) return undefined;
  const rect = preview.getBoundingClientRect();
  const toolbar = document.querySelector<HTMLElement>("[data-testid='text-capture-toolbar']")?.getBoundingClientRect();
  return { left: rect.left, right: rect.right, top: Math.max(0, toolbar === undefined ? rect.top : toolbar.bottom), bottom: window.innerHeight - 12 };
}

/**
 * V26-2: the palette's tooltips are drawn on the top layer (a portal, above the popover layer), so the palette's own frame and
 * its scrolling part never cut them; they are shifted sideways to stay inside the window. A tip opens below its target, and
 * above it when the target is in the palette's lower half (so it does not cover the rows still to be read).
 */
function PaletteTip({ content, children }: { content: string; children: ReactElement<{ "aria-describedby"?: string }> }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number }>();
  useLayoutEffect(() => {
    if (!open || anchor.current === null || tip.current === null) { setPlace(undefined); return; }
    const target = anchor.current.getBoundingClientRect();
    const size = tip.current.getBoundingClientRect();
    const dialog = anchor.current.closest("[role='dialog']")?.getBoundingClientRect();
    const lowerHalf = dialog !== undefined && target.top + target.height / 2 > dialog.top + dialog.height / 2;
    const below = target.bottom + 6;
    const above = target.top - 6 - size.height;
    const fitsBelow = below + size.height <= window.innerHeight - 4;
    const fitsAbove = above >= 4;
    const useAbove = lowerHalf ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;
    const left = Math.max(4, Math.min(window.innerWidth - 4 - size.width, target.left + target.width / 2 - size.width / 2));
    setPlace({ left, top: useAbove ? Math.max(4, above) : Math.min(below, Math.max(4, window.innerHeight - 4 - size.height)) });
  }, [open, content]);
  const show = (event: { target: EventTarget }) => { if (event.target instanceof HTMLElement && event.target.matches(":focus-visible")) setOpen(true); };
  return (
    <span ref={anchor} className="lv-tooltip-anchor" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={show} onBlur={() => setOpen(false)}>
      {cloneElement(children, { "aria-describedby": id })}
      {createPortal(
        <span ref={tip} id={id} role="tooltip" style={{
          position: "fixed", left: place?.left ?? 0, top: place?.top ?? 0, display: open ? "block" : "none", visibility: place === undefined ? "hidden" : "visible",
          zIndex: "calc(var(--lv-z-toast, 80) + 10)" as unknown as number, width: "max-content", maxWidth: 240, boxSizing: "border-box", padding: "5px 9px",
          border: "1px solid rgba(150,170,195,.3)", borderRadius: 8, background: "#17243a", boxShadow: "0 8px 24px rgba(0,0,0,.4)", color: "#f2f6fc",
          fontSize: 12, fontWeight: 500, lineHeight: 1.4, textAlign: "left", whiteSpace: "normal", pointerEvents: "none",
        }}>{content}</span>,
        document.body,
      )}
    </span>
  );
}

const CONTROL = { height: 26, border: "1px solid rgba(150,170,195,.22)", borderRadius: 6, background: "transparent", color: "#f2f6fc", fontSize: 13, cursor: "pointer" } as const;

export function NextChordPalette({
  presence, anchor, suggestions, keyLabel, keyContext, keyChords, length, onLength, canUndo, onUndo, onClose, onPreview, onAdd, rejected,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<number>();
  const first = useRef<HTMLButtonElement>(null);
  // V24-5: the preview's frame is read again after the opening re-layout, so the palette cannot leave it.
  const [liveFrame, setLiveFrame] = useState(anchor.frame);
  useLayoutEffect(() => {
    const measure = () => {
      const next = paletteBounds();
      if (next !== undefined) setLiveFrame(next);
    };
    measure();
    const firstFrame = requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 320);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(firstFrame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
    };
  }, []);
  const frame = liveFrame;
  const width = Math.max(300, Math.min(600, (frame === undefined ? anchor.viewportWidth : frame.right - frame.left) - 28, anchor.viewportWidth - 28));
  const minLeft = frame === undefined ? 14 : frame.left + 14;
  const maxLeft = (frame === undefined ? anchor.viewportWidth - 14 : frame.right - 14) - width;
  const left = Math.max(14, Math.min(Math.max(minLeft, maxLeft), anchor.left));
  // V26-1: the sides are the preview's frame; the height is the whole working area (under the reading-settings row, to 12px above the window's bottom).
  const topBound = frame === undefined ? 8 : frame.top + 6;
  const bottomBound = frame === undefined ? anchor.viewportHeight - 12 : frame.bottom;
  // V25-6/V26-1: open below the 「＋」 when everything fits there, else above when everything fits there; when neither side fits
  // but the working area does, slide over the opener by the least; only a window too short for it all scrolls (toward the wider side).
  const spaceBelow = Math.max(0, bottomBound - (anchor.bottom + 6));
  const spaceAbove = Math.max(0, anchor.top - 6 - topBound);
  const area = Math.max(60, bottomBound - topBound);
  const wanted = natural ?? 480;
  let top: number;
  let maxHeight: number;
  if (wanted <= spaceBelow) { maxHeight = spaceBelow; top = anchor.bottom + 6; }
  else if (wanted <= spaceAbove) { maxHeight = spaceAbove; top = anchor.top - 6 - wanted; }
  else if (wanted <= area) {
    maxHeight = area;
    const overlapBelow = anchor.bottom + 6 + wanted - bottomBound;
    const overlapAbove = topBound + wanted - (anchor.top - 6);
    top = overlapBelow <= overlapAbove ? bottomBound - wanted : topBound;
  } else {
    const above = spaceAbove > spaceBelow;
    maxHeight = Math.max(60, above ? spaceAbove : spaceBelow);
    top = above ? Math.max(topBound, anchor.top - 6 - Math.min(wanted, maxHeight)) : anchor.bottom + 6;
  }
  const harmonyOf = (chord: ChordSymbol, context: string) => cardHarmony([{ id: "s", name: chord, start: 0 }], context).get("s");

  // V25-6: the whole height the palette would like (header row + all of the scrolling part).
  useLayoutEffect(() => {
    const measure = () => {
      if (headRef.current === null || bodyRef.current === null) return;
      const value = headRef.current.offsetHeight + bodyRef.current.scrollHeight + 2;
      setNatural((current) => current !== undefined && Math.abs(current - value) < 1 ? current : value);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    if (bodyRef.current !== null) observer.observe(bodyRef.current);
    return () => observer.disconnect();
  }, [suggestions, keyChords, length]);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (root.current?.contains(target)) return;
      if (target?.closest("[data-testid='text-suggestion-ghost']")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [onClose]);

  return createPortal(
    <div ref={root} role="dialog" aria-label="次のコード" className="lv-suggestion-palette lv-motion-pop" data-presence={presence.state}
      onTransitionEnd={presence.onTransitionEnd} tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z") {
          event.preventDefault(); event.stopPropagation(); if (canUndo) onUndo(); return;
        }
        if (!event.ctrlKey && !event.metaKey && !event.altKey && /^[123]$/.test(event.key)) {
          event.preventDefault(); event.stopPropagation(); onLength(event.key === "1" ? "bar" : Number(event.key) as 1 | 2);
        }
      }}
      style={{
        position: "fixed", left, top, width, zIndex: "var(--lv-z-popover, 60)" as unknown as number,
        maxHeight, display: "flex", flexDirection: "column", boxSizing: "border-box",
        background: "#0f1828", border: "1px solid rgba(66,216,198,.35)", borderRadius: 12,
        boxShadow: "0 14px 40px rgba(0,0,0,.55)", color: "#f2f6fc", whiteSpace: "normal",
      }}>
      <div ref={headRef} data-testid="text-suggestion-head" style={{ flex: "none", padding: "12px 14px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26, flex: "none" }}>
          <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", flex: "none" }}>{"次のコード"}</span>
          <span style={{ flex: 1 }} />
          <PaletteTip content={"長さ: 1 小節(1)"}>
            <button type="button" aria-pressed={length === "bar"} onClick={() => onLength("bar")} style={{
              height: 22, padding: "0 8px", border: 0, borderRadius: 6, background: length === "bar" ? "#123b3a" : "transparent",
              color: length === "bar" ? "#42d8c6" : "#c9d3e2", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer",
            }}>{"1 小節 1"}</button>
          </PaletteTip>
          <PaletteTip content={"長さ: 2 拍(2)"}>
            <button type="button" aria-pressed={length === 2} onClick={() => onLength(2)} style={{
              height: 22, padding: "0 8px", border: 0, borderRadius: 6, background: length === 2 ? "#123b3a" : "transparent",
              color: length === 2 ? "#42d8c6" : "#c9d3e2", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer",
            }}>{"2 拍 2"}</button>
          </PaletteTip>
          <PaletteTip content={"長さ: 1 拍(3)"}>
            <button type="button" aria-pressed={length === 1} onClick={() => onLength(1)} style={{
              height: 22, padding: "0 8px", border: 0, borderRadius: 6, background: length === 1 ? "#123b3a" : "transparent",
              color: length === 1 ? "#42d8c6" : "#c9d3e2", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer",
            }}>{"1 拍 3"}</button>
          </PaletteTip>
          <PaletteTip content={"1 つ戻す(Ctrl+Z)"}>
            <button type="button" aria-label="1 つ戻す(Ctrl+Z)" disabled={!canUndo} onClick={onUndo} style={{ ...CONTROL, padding: "0 8px", color: canUndo ? "#f2f6fc" : "#56657a", cursor: canUndo ? "pointer" : "default" }}><svg aria-hidden="true" width="14" height="13" viewBox="0 0 14 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              strokeLinejoin="round"><path d="M4.5 1.5 1.5 4.5l3 3" /><path d="M1.5 4.5h7a4 4 0 0 1 0 8H5" /></svg></button>
          </PaletteTip>
          <PaletteTip content={"閉じる(Esc)"}>
            <button type="button" aria-label="閉じる(Esc)" onClick={onClose} style={{ ...CONTROL, width: 26, border: 0, padding: 0, fontSize: 15, color: "#9fb0c6" }}>{"×"}</button>
          </PaletteTip>
        </div>
      </div>
      <div ref={bodyRef} data-testid="text-suggestion-scroll" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "18px 14px 12px", overflowY: "auto", overflowX: "clip", minHeight: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "#7f90aa" }}>{"おすすめ"}</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {suggestions.map((entry, index) => (
            <div key={`${entry.label}-${index}`} className="lv-suggestion-chip" data-category={entry.category}
              style={{ flex: "1 1 180px", minWidth: "max-content", height: 34, display: "flex", alignItems: "stretch", boxSizing: "border-box",
                border: `1px solid ${entry.category === "好み" ? "rgba(167,139,250,.45)" : "rgba(150,170,195,.2)"}`,
                borderRadius: 9, background: entry.category === "好み" ? "rgba(167,139,250,.06)" : "#111b2b" }}>
              <button ref={index === 0 ? first : undefined} type="button" data-testid="text-suggestion-preview"
                onClick={() => onPreview(entry)}
                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 9px 0 10px",
                  border: 0, borderRadius: "8px 0 0 8px", background: "transparent", color: "#f2f6fc", cursor: "pointer", textAlign: "left" }}>
                <span style={{ flex: "none", fontSize: 10, fontWeight: 700, color: roleColor(harmonyOf(entry.chord, keyContext)?.role), whiteSpace: "nowrap" }}>
                  {displayDegreeLabel(harmonyOf(entry.chord, keyContext)?.degree ?? "")}
                </span>
                <span data-testid="text-suggestion-name" style={{ flex: "none", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>{displayChordLabel(entry.label)}</span>
                <span style={{ flex: "none", marginLeft: "auto", padding: "0 6px", borderRadius: 999, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap",
                  color: entry.category === "好み" ? "#c4a8ff" : entry.category === "展開" ? "#f6b26b" : entry.category === "なめらか" ? "#42d8c6" : "#c9d3e2",
                  background: entry.category === "好み" ? "rgba(167,139,250,.18)" : entry.category === "展開" ? "rgba(246,178,107,.14)" : entry.category === "なめらか" ? "rgba(66,216,198,.12)" : "rgba(150,170,195,.16)" }}>{entry.category}</span>
                <span aria-hidden="true" style={{ width: 12, fontSize: 12, color: "#42d8c6" }} />
              </button>
              <PaletteTip content={rejected ? "この譜面には足せません" : `${displayChordLabel(entry.label)} を末尾に足す(Ctrl+Z で戻せます)`}>
                <button type="button" data-testid="text-suggestion-add" aria-label={`${displayChordLabel(entry.label)} を末尾に足す`}
                  onClick={() => onAdd(entry)}
                  style={{ width: 30, flex: "none", border: 0, borderLeft: "1px solid rgba(150,170,195,.16)", borderRadius: "0 8px 8px 0", background: "transparent",
                    color: "#c9d3e2", fontSize: 17, fontWeight: 600, cursor: "pointer" }}>{"＋"}</button>
              </PaletteTip>
            </div>
          ))}
        </div>

        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "#7f90aa" }}>{keyLabel}</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
          {keyChords.map((entry) => (
            <div key={entry.label} style={{ minWidth: 0, display: "flex", flexDirection: "column", border: "1px solid rgba(150,170,195,.18)",
              borderRadius: 8, background: "#111b2b", overflow: "hidden" }}>
              <button type="button" data-testid="text-key-chord-preview" onClick={() => onPreview(entry)}
                style={{ padding: "5px 4px 4px", border: 0, background: "transparent", color: "#f2f6fc", cursor: "pointer", textAlign: "center" }}>
                <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: roleColor(harmonyOf(entry.chord, keyContext)?.role) }}>
                  {displayDegreeLabel(harmonyOf(entry.chord, keyContext)?.degree ?? "")}
                </span>
                <span style={{ display: "block", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayChordLabel(entry.label)}</span>
              </button>
              <button type="button" data-testid="text-key-chord-add" aria-label={`${displayChordLabel(entry.label)} を末尾に足す`}
                onClick={() => onAdd(entry)}
                style={{ height: 22, border: 0, borderTop: "1px solid rgba(150,170,195,.16)", background: "transparent", color: "#c9d3e2", fontSize: 14, cursor: "pointer" }}>{"＋"}</button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
