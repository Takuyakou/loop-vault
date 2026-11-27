/**
 * P25-03 C: the selected card's band (見本 Voicing.dc.html の「選んだカードの音」). The sound itself is
 * decided by the panel through `src/domain/textCardSound.ts` and `src/domain/voicingShapes`; this part only
 * draws it and reports what was pressed.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CARD_KEY_HIGH, CARD_KEY_LOW, type CardKeyRoles } from "../../domain/textCardSound";
import { dockNoteName } from "../../domain/dockNoteSpelling";
import type { ChordSymbol } from "../../domain/types";
import type { GeneratedShapeChoice } from "../../domain/voicingShapes";
import { KeyCap } from "./TextHelpKeyList";
import type { PresenceRender } from "../motion/Presence";

export type DockScope = "one" | "same" | "all";

export interface DockShapeButton {
  readonly id: GeneratedShapeChoice;
  readonly label: string;
  readonly key: string;
  readonly on: boolean;
  /** False when this chord falls back from the shape (the button is faded). */
  readonly direct: boolean;
  readonly title: string;
  readonly notes: readonly number[];
}

export interface DockChip {
  readonly on: boolean;
  readonly disabled: boolean;
  readonly sub: string;
  readonly title: string;
}

export interface TextCardDockProps {
  readonly rest: boolean;
  readonly degree?: string;
  readonly degreeColor: string;
  readonly root: string;
  readonly quality: string;
  readonly position: string;
  readonly scope: DockScope;
  readonly scopes: readonly { readonly id: DockScope; readonly label: string; readonly shortLabel?: string; readonly title: string }[];
  readonly undoEnabled: boolean;
  readonly midiOn: boolean;
  readonly midiConnected: boolean;
  readonly notes: readonly number[];
  readonly heldNotes: readonly number[];
  readonly previousNotes: readonly number[];
  readonly previousName?: string;
  /** P25 V24-10: the card's chord, for the band's note spelling (absent for a rest). */
  readonly chord?: ChordSymbol;
  /** V24-10: the screen key's text (C major, A minor, …) for the band's note direction. */
  readonly screenKey: string;
  readonly roles?: CardKeyRoles;
  readonly sourceText: string;
  readonly sourceColor: string;
  /** V15: one line; `title` carries the long words when there are any. */
  readonly notice?: { readonly text: string; readonly color: string; readonly title?: string };
  readonly shapes: readonly DockShapeButton[];
  readonly tension: DockChip;
  readonly spread: DockChip;
  readonly forms?: readonly { readonly form: "A" | "B"; readonly on: boolean; readonly disabled: boolean; readonly title?: string }[];
  readonly approachDisabled: boolean;
  /** V17: 「最初から」 is always there; it is faded and off until something was changed. */
  readonly resetEnabled: boolean;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onScope: (scope: DockScope) => void;
  readonly onUndo: () => void;
  readonly onToggleMidi: () => void;
  readonly onConnectMidi: () => void;
  readonly onPlay: () => void;
  readonly onClose: () => void;
  readonly onKey: (note: number) => void;
  readonly onShape: (shape: GeneratedShapeChoice) => void;
  readonly onTension: () => void;
  readonly onSpread: () => void;
  readonly onForm: (form: "A" | "B") => void;
  readonly onInvert: (direction: 1 | -1) => void;
  readonly onOctave: (direction: 1 | -1) => void;
  readonly onApproach: () => void;
  readonly onReset: () => void;
  /** P25-16 N3: set by the panel's `Presence` (the band rises in and sinks out). */
  readonly presence?: PresenceRender;
}

const LINE = "rgb(150 170 195 / 28%)";
const LINE_SOFT = "rgb(150 170 195 / 14%)";
const KIND_COLOR = { tone: "#42d8c6", tension: "#8bd7ff", other: "#ffd166" } as const;
const WHITE_PITCHES = new Set([0, 2, 4, 5, 7, 9, 11]);

/**
 * V15: how far the band squeezes so the five shapes stay whole inside it, tried in this order until they fit:
 * the white keys (C3–C7) from 22px down to 16px, then the key caps go (the key stays in the title), then the
 * names drop to 10px. Measured in the page, not guessed.
 */
const SQUEEZE_STEPS = 8;
export function dockSqueeze(step: number): { readonly white: number; readonly keys: boolean; readonly font: number } {
  return { white: Math.max(16, 22 - step), keys: step <= 6, font: step >= 8 ? 10 : 11 };
}

/** V16: the right side's word column (形・部品・位置). */
const ROW_LABEL: CSSProperties = { fontSize: 11, color: "#7f90aa", whiteSpace: "nowrap" };

const ghostButton: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", height: 32, padding: 0,
  border: `1px solid ${LINE}`, borderRadius: 8, background: "transparent", color: "#c9d3e2", fontSize: 12, whiteSpace: "nowrap",
};

function Arrow({ left }: { readonly left: boolean }) {
  return <svg aria-hidden="true" width="10" height="12" viewBox="0 0 10 12" fill="none" stroke="currentColor" strokeWidth="1.6"
    strokeLinecap="round" strokeLinejoin="round"><path d={left ? "M7 1.5 2.5 6 7 10.5" : "M3 1.5 7.5 6 3 10.5"} /></svg>;
}

function KeyboardIcon() {
  return <svg aria-hidden="true" width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="1.4">
    <rect x="1" y="1" width="12" height="10" rx="1.5" /><path d="M5 1v6M9 1v6" /></svg>;
}

function pct(note: number): number {
  return Math.round(((Math.min(CARD_KEY_HIGH, Math.max(CARD_KEY_LOW, note)) - CARD_KEY_LOW) / (CARD_KEY_HIGH - CARD_KEY_LOW)) * 1000) / 10;
}

function StepGroup({ label, children, extra }: { readonly label: string; readonly children: ReactNode; readonly extra?: ReactNode }) {
  return <div role="group" aria-label={label} style={{ display: "flex", alignItems: "center", height: 30, border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden" }}>
    <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 9px", fontSize: 11, color: "#a5b2c6" }}>{label}{extra}</span>
    {children}
  </div>;
}

function StepButton({ label, title, onClick, text }: { readonly label: string; readonly title: string; readonly onClick: () => void; readonly text: string }) {
  return <button type="button" className="lv-dock-step" aria-label={label} title={title} onClick={onClick} style={{
    width: 30, height: 30, padding: 0, border: 0, borderLeft: "1px solid rgb(150 170 195 / 20%)", background: "transparent", color: "#f2f6fc", fontSize: 13,
  }}>{text}</button>;
}

export function TextCardDock(props: TextCardDockProps) {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(1440);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => setWidth(node.getBoundingClientRect().width || 1440);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [step, setStep] = useState(0);
  const shapesRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { setStep(0); }, [width]);
  useLayoutEffect(() => {
    const grid = shapesRef.current;
    if (!grid || step >= SQUEEZE_STEPS || grid.clientWidth === 0) return;
    const over = grid.scrollWidth > grid.clientWidth + 0.5
      || [...grid.querySelectorAll<HTMLElement>("[data-shape]")].some((button) => button.scrollWidth > button.clientWidth + 0.5);
    if (over) setStep(step + 1);
  });
  const squeeze = dockSqueeze(step);
  const white = squeeze.white;
  const black = Math.round(white * 0.62);
  const wide = width >= 1160;
  const roomy = width >= 1000;
  const { rest, midiOn } = props;
  // V24-10: the note names use the chord's degrees and the screen key's direction.
  const chordTones = props.roles?.tonePitchClasses;
  const noteName = (note: number): string => dockNoteName(note, props.root, props.screenKey, chordTones);
  const shown = midiOn ? props.heldNotes : props.notes;
  const lineColor = midiOn ? "#ffd166" : LINE;
  const whites: ReactNode[] = []; const blacks: ReactNode[] = [];
  let whiteIndex = 0;
  for (let note = CARD_KEY_LOW; note <= CARD_KEY_HIGH; note += 1) {
    const on = shown.includes(note);
    const kind = props.roles?.kindOf(note) ?? "other";
    const isTone = props.roles?.tonePitchClasses.has(((note % 12) + 12) % 12) ?? false;
    const tick = !midiOn && props.previousNotes.includes(note) ? "#a48bff" : "transparent";
    const fill = midiOn ? "#ffd166" : KIND_COLOR[kind];
    const title = `${noteName(note)}${on ? " · 押すと外す" : isTone ? " · コードの音。押すと足す" : " · 押すと足す"}`;
    const label = on && !midiOn ? (props.roles?.degreeOf(note) ?? noteName(note).replace(/\d+$/, "")) : "";
    const ghost = !on && isTone && !midiOn;
    const common = { type: "button" as const, "aria-label": title, "aria-pressed": on, title, "data-note": note, "data-kind": on ? kind : undefined,
      onClick: () => props.onKey(note) };
    if (WHITE_PITCHES.has(((note % 12) + 12) % 12)) {
      whites.push(<button key={note} {...common} data-testid="text-dock-key" style={{
        position: "absolute", top: 0, left: whiteIndex * white, width: white, height: 78, padding: 0, border: 0,
        borderRight: "1px solid #0a1019", borderRadius: "0 0 4px 4px", background: on ? fill : "#e6ebf2",
      }}>
        <span aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: tick }} />
        <span aria-hidden="true" data-ghost={ghost || undefined} style={{ position: "absolute", left: Math.round((white - 8) / 2), bottom: 20, width: 5, height: 5,
          border: `1.5px solid ${ghost ? "#1a8f83" : "transparent"}`, borderRadius: "50%" }} />
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 4, textAlign: "center", fontSize: 10, fontWeight: 700, lineHeight: "12px",
          color: on ? "#06110f" : "#56657a" }}>{on ? label : note % 12 === 0 ? noteName(note) : ""}</span>
      </button>);
      whiteIndex += 1;
    } else {
      blacks.push(<button key={note} {...common} data-testid="text-dock-key" style={{
        position: "absolute", top: 0, left: whiteIndex * white - Math.round(black / 2), width: black, height: 48, padding: 0, border: 0,
        borderRadius: "0 0 3px 3px", background: on ? fill : "#1a2433", zIndex: 1,
      }}>
        <span aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, background: tick }} />
        <span aria-hidden="true" data-ghost={ghost || undefined} style={{ position: "absolute", left: Math.max(1, Math.round((black - 8) / 2)), bottom: 16, width: 5, height: 5,
          border: `1.5px solid ${ghost ? "#42d8c6" : "transparent"}`, borderRadius: "50%" }} />
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 3, textAlign: "center", fontSize: 9, fontWeight: 700, lineHeight: "11px", color: "#06110f" }}>{label}</span>
      </button>);
    }
  }
  const keyboardWidth = whiteIndex * white;
  const shapeKeys = squeeze.keys;
  const shapeFont = squeeze.font;
  const outside = props.notes.filter((note) => note < CARD_KEY_LOW || note > CARD_KEY_HIGH);
  const listed = [...new Set([...shown, ...(midiOn ? [] : outside)])].sort((a, b) => a - b);
  return (
    <section ref={ref} aria-label="選んだカードの音" data-testid="text-card-dock" data-midi={midiOn || undefined}
      className={props.presence ? "lv-motion-rise" : undefined} data-presence={props.presence?.state} onTransitionEnd={props.presence?.onTransitionEnd} style={{
      flex: "none", display: "flex", flexDirection: "column", gap: 10, padding: "8px 16px 10px",
      borderTop: `1px solid ${lineColor}`, background: "#0d1522", minWidth: 0, overflow: "hidden",
    }}>
      <div data-testid="text-dock-head" style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 36, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" className="lv-dock-ghost" aria-label="前のカード" onClick={props.onPrev} style={{ ...ghostButton, width: 30, height: 30 }}><Arrow left /></button>
          <button type="button" className="lv-dock-ghost" aria-label="次のカード" onClick={props.onNext} style={{ ...ghostButton, width: 30, height: 30 }}><Arrow left={false} /></button>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          {rest ? <span data-testid="text-dock-name" style={{ fontWeight: 700, fontSize: 15, color: "#c9d3e2" }}>{"休符"}</span> : <>
            {props.degree ? <span style={{ fontSize: 12, fontWeight: 700, color: props.degreeColor }}>{props.degree}</span> : null}
            <span data-testid="text-dock-name" style={{ fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 24 }}>{props.root}</span><span style={{ fontSize: 15, color: "#c9d3e2" }}>{props.quality}</span>
            </span>
          </>}
          {roomy ? <span style={{ fontSize: 12, color: "#a5b2c6", whiteSpace: "nowrap" }}>{props.position}</span> : null}
        </div>
        {rest ? null : (
          <div role="group" aria-label="直す範囲" style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 6, padding: 3,
            border: `1px solid ${LINE_SOFT}`, borderRadius: 10, background: "#0a1019" }}>
            {props.scopes.map((scope) => {
              const on = scope.id === props.scope;
              return <button key={scope.id} type="button" aria-pressed={on} title={scope.title} data-scope={scope.id}
                onClick={() => props.onScope(scope.id)} style={{
                  height: 28, padding: "0 12px", border: 0, borderRadius: 7, background: on ? "#123b3a" : "transparent",
                  boxShadow: on ? "inset 0 0 0 1px #42d8c6" : "none", color: on ? "#42d8c6" : "#a5b2c6", fontSize: 12,
                  fontWeight: on ? 700 : 500, whiteSpace: "nowrap",
                }}>{wide ? scope.label : (scope.shortLabel ?? scope.label)}</button>;
            })}
          </div>
        )}
        {rest ? null : <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="lv-dock-ghost" aria-label="元に戻す" title="元に戻す (Ctrl+Z)" disabled={!props.undoEnabled}
            onClick={props.onUndo} style={{ ...ghostButton, width: 32, opacity: props.undoEnabled ? 1 : 0.4 }}>
            <svg aria-hidden="true" width="14" height="13" viewBox="0 0 14 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              strokeLinejoin="round"><path d="M4.5 1.5 1.5 4.5l3 3" /><path d="M1.5 4.5h7a4 4 0 0 1 0 8H5" /></svg>
          </button>
          {/* V17: right of the undo button, always there; faded and off while nothing was changed. */}
          <button type="button" className="lv-dock-ghost" data-testid="text-dock-reset" onClick={props.onReset} disabled={!props.resetEnabled}
            title="このカードを最初の音(基本のおすすめ)に戻します"
            style={{ ...ghostButton, padding: "0 10px", color: "#a5b2c6", opacity: props.resetEnabled ? 1 : 0.4 }}>{"最初から"}</button>
        </div>}
        <span style={{ flex: 1 }} />
        {rest ? null : <>
          <button type="button" aria-pressed={midiOn} data-testid="text-dock-midi" onClick={props.onToggleMidi} style={{
            display: "flex", alignItems: "center", gap: 7, height: 32, padding: "0 10px", borderRadius: 8, fontSize: 12, whiteSpace: "nowrap",
            border: `1px solid ${midiOn ? "#ffd166" : LINE}`, background: midiOn ? "#2a2410" : "transparent", color: midiOn ? "#ffd166" : "#c9d3e2",
          }}><KeyboardIcon />{wide ? "MIDI 鍵盤で弾いて入れる" : "MIDI で入れる"}<KeyCap>{"M"}</KeyCap></button>
          <button type="button" data-testid="text-dock-play" onClick={props.onPlay} disabled={props.notes.length === 0} style={{
            display: "flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px", border: "1px solid #42d8c6", borderRadius: 8,
            background: "#123b3a", color: "#42d8c6", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
          }}><svg aria-hidden="true" width="11" height="12" viewBox="0 0 11 12" fill="currentColor"><path d="M1 1v10l9-5z" /></svg>{"鳴らす"}
            <kbd className="lv-text-kbd" style={{ color: "#42d8c6", borderColor: "rgb(66 216 198 / 45%)" }}>{"Enter"}</kbd></button>
        </>}
        <button type="button" className="lv-dock-ghost" aria-label="閉じる" title="閉じる (Esc)" data-testid="text-dock-close" onClick={props.onClose}
          style={{ ...ghostButton, width: 28, border: 0, color: "#a5b2c6" }}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
        </button>
      </div>
      {rest ? null : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 20, minWidth: 0 }}>
          <div data-testid="text-dock-left" style={{ flex: "none", width: keyboardWidth, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, height: 20, whiteSpace: "nowrap", minWidth: 0 }}>
              <span data-testid="text-dock-source" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: midiOn ? "#ffd166" : props.sourceColor }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: midiOn ? "#ffd166" : props.sourceColor }} />
                {midiOn ? "鍵盤から入れています" : props.sourceText}
              </span>
              <span data-testid="text-dock-notes" style={{ fontFamily: "'Cascadia Mono', Consolas, ui-monospace, monospace", fontSize: 13, color: "#f2f6fc" }}>
                {listed.map(noteName).join(" · ")}
              </span>
            </div>
            <div aria-label="鳴らす音。押すと足す・外す" data-testid="text-dock-keyboard" style={{
              position: "relative", width: keyboardWidth, height: 78, borderRadius: 6, overflow: "hidden", background: "#0a1019",
              boxShadow: `0 0 0 1px ${midiOn ? "#ffd166" : "rgb(150 170 195 / 22%)"}`,
            }}>{whites}{blacks}</div>
            {/* P25-16 review 2: the notice (left) and the legend (right) sit under the keyboard, so neither is clipped by the right column.
                V15: the notice is one line (the long words are its title). V18: with MIDI on the row keeps its place, empty. */}
            <div data-testid="text-dock-under" aria-hidden={midiOn || undefined}
              style={{ display: "flex", alignItems: "center", gap: 10, height: 15, minWidth: 0, visibility: midiOn ? "hidden" : undefined }}>
              {props.notice ? (
                <span data-testid="text-dock-notice" {...(props.notice.title === undefined ? {} : { title: props.notice.title })} style={{
                  flex: 1, minWidth: 0, fontSize: 11, lineHeight: "15px", color: props.notice.color,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{props.notice.text}</span>
              ) : <span style={{ flex: 1 }} />}
              <span data-testid="text-dock-legend" style={{ flex: "none", display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "#a5b2c6", whiteSpace: "nowrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: "#42d8c6" }} />{"コードの音"}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: "#8bd7ff" }} />{"テンション"}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span aria-hidden="true" style={{ width: 5, height: 5, border: "1.5px solid #42d8c6", borderRadius: "50%" }} />{"足せる音"}</span>
                {props.previousName ? <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span aria-hidden="true" style={{ width: 12, height: 4, background: "#a48bff" }} />{`前の ${props.previousName}`}</span> : null}
              </span>
            </div>
          </div>
          {/* V18: the three rows and the MIDI face share one cell; the rows keep the height, the face fades in over them. */}
          <div data-testid="text-dock-right" style={{ flex: 1, minWidth: 0, display: "grid" }}>
            <div className="lv-dock-face" data-off={midiOn || undefined} aria-hidden={midiOn || undefined}
              style={{ gridArea: "1 / 1", display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", alignItems: "center", columnGap: 12, rowGap: 10, minWidth: 0 }}>
              <span style={ROW_LABEL}>{"形"}</span>
              <div ref={shapesRef} role="group" aria-label="形" data-testid="text-dock-shapes" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(max-content, 1fr))", gap: 8, minWidth: 0 }}>
                {props.shapes.map((shape) => (
                  <button key={shape.id} type="button" className="lv-dock-card" aria-pressed={shape.on} title={shapeKeys ? shape.title : `${shape.title}(キー ${shape.key})`} data-shape={shape.id} data-direct={shape.direct}
                    onClick={() => props.onShape(shape.id)} style={{
                      opacity: shape.direct ? 1 : 0.55, display: "flex", flexDirection: "column", justifyContent: "space-between", height: 52,
                      boxSizing: "border-box", padding: "9px 8px 6px", border: `1px solid ${shape.on ? "#42d8c6" : LINE}`, borderRadius: 8,
                      background: shape.on ? "#123b3a" : "#111b2a", color: "#f2f6fc", textAlign: "left",
                    }}>
                    <span aria-hidden="true" style={{ position: "relative", display: "block", height: 10, borderRadius: 5, background: "rgb(150 170 195 / 13%)" }}>
                      {shape.notes.map((note) => <span key={note} style={{ position: "absolute", top: 2, left: `${pct(note)}%`, width: 6, height: 6, marginLeft: -3,
                        borderRadius: "50%", background: shape.on ? "#42d8c6" : "#8fa1b8" }} />)}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: shapeFont, lineHeight: "15px" }}>
                      <span data-testid="text-dock-shape-name" style={{ flex: 1, whiteSpace: "nowrap", color: shape.on ? "#f2f6fc" : "#c9d3e2" }}>{shape.label}</span>
                      {shapeKeys ? <KeyCap>{shape.key}</KeyCap> : null}
                    </span>
                  </button>
                ))}
              </div>
              <span style={ROW_LABEL}>{"部品"}</span>
              <div role="group" aria-label="部品" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <ChipButton label="テンションを足す" chip={props.tension} onColor="#8bd7ff" onBg="#10314a" onClick={props.onTension} testId="text-dock-tension" />
                <ChipButton label="広げる" chip={props.spread} onColor="#42d8c6" onBg="#123b3a" onClick={props.onSpread} testId="text-dock-spread" />
                {props.forms ? <>
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#7f90aa", whiteSpace: "nowrap" }}>{"並び"}</span>
                  {props.forms.map((form) => (
                    <button key={form.form} type="button" aria-pressed={form.on} disabled={form.disabled} data-form={form.form}
                      {...(form.title === undefined ? {} : { title: form.title })} onClick={() => props.onForm(form.form)} style={{
                        width: 30, height: 28, padding: 0, border: `1px solid ${form.on ? "#42d8c6" : LINE}`, borderRadius: 7,
                        background: form.on ? "#123b3a" : "transparent", color: form.on ? "#42d8c6" : "#a5b2c6", fontSize: 12, fontWeight: 700,
                        opacity: form.disabled ? 0.4 : 1,
                      }}>{form.form}</button>
                  ))}
                </> : null}
              </div>
              <span style={ROW_LABEL}>{"位置"}</span>
              <div role="group" aria-label="位置" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <StepGroup label="転回">
                  <StepButton label="転回を下げる" title="いちばん上の音を 1 オクターブ下へ (↓)" text="↓" onClick={() => props.onInvert(-1)} />
                  <StepButton label="転回を上げる" title="いちばん下の音を 1 オクターブ上へ (↑)" text="↑" onClick={() => props.onInvert(1)} />
                </StepGroup>
                <StepGroup label="高さ" extra={<KeyCap>{"Shift"}</KeyCap>}>
                  <StepButton label="1 オクターブ下げる" title="1 オクターブ下げる (Shift+↓)" text="↓" onClick={() => props.onOctave(-1)} />
                  <StepButton label="1 オクターブ上げる" title="1 オクターブ上げる (Shift+↑)" text="↑" onClick={() => props.onOctave(1)} />
                </StepGroup>
                <button type="button" className="lv-dock-ghost" data-testid="text-dock-approach" title="1 つ前のカードの音から、なるべく動かない転回と高さにします (S)"
                  disabled={props.approachDisabled}
                  onClick={props.onApproach} style={{ ...ghostButton, height: 30, gap: 6, padding: "0 9px", opacity: props.approachDisabled ? 0.4 : 1 }}>
                  {"前のコードに近づける"}<KeyCap>{"S"}</KeyCap></button>
              </div>
            </div>
            <div className="lv-dock-face" data-off={midiOn ? undefined : true} aria-hidden={midiOn ? undefined : true}
              data-testid="text-dock-midi-face" style={{ gridArea: "1 / 1", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, padding: "10px 14px",
                border: "1px solid #6b5a1e", borderRadius: 10, background: "#1d1a10", minWidth: 0 }}>
              {props.midiConnected ? (
                <span style={{ fontSize: 12, lineHeight: 1.6, color: "#e8dcb8" }}>{"和音を押さえて離すと、このカードに入り、次のカードへ進みます。続けて弾けば、進行を順に弾き直せます。"}</span>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "#e8dcb8" }}>{"MIDI 未接続"}</span>
                  <button type="button" data-testid="text-dock-connect" onClick={props.onConnectMidi} style={{ ...ghostButton, height: 30, padding: "0 10px" }}>{"つなぐ"}</button>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" className="lv-dock-ghost" onClick={props.onToggleMidi} style={{ ...ghostButton, height: 30, gap: 6, padding: "0 10px" }}>{"やめる"}<KeyCap>{"Esc"}</KeyCap></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ChipButton({ label, chip, onColor, onBg, onClick, testId }: {
  readonly label: string; readonly chip: DockChip; readonly onColor: string; readonly onBg: string; readonly onClick: () => void; readonly testId: string;
}) {
  return <button type="button" className="lv-dock-ghost" aria-pressed={chip.on} disabled={chip.disabled} title={chip.title} data-testid={testId}
    onClick={onClick} style={{
      height: 28, padding: "0 12px", border: `1px solid ${chip.on ? onColor : LINE}`, borderRadius: 14, background: chip.on ? onBg : "transparent",
      color: chip.on ? onColor : "#c9d3e2", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", opacity: chip.disabled ? 0.45 : 1,
      display: "flex", alignItems: "center", gap: 7,
    }}>{label}<span style={{ fontSize: 11, fontWeight: 700, color: chip.on ? onColor : "#7f90aa" }}>{chip.sub}</span></button>;
}

/** C1: the one line shown when cards exist but none is chosen. */
export function TextCardDockClosed() {
  return <div data-testid="text-card-dock-closed" style={{
    flex: "none", display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 16px", borderTop: `1px solid ${LINE_SOFT}`,
    background: "#0d1522", fontSize: 12, color: "#a5b2c6",
  }}>
    <svg aria-hidden="true" width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1" y="1" width="14" height="10" rx="1.5" /><path d="M5 1v6M8 1v6M11 1v6" /></svg>
    <span>{"カードを選ぶと、ここでそのカードの音を直せます"}</span>
  </div>;
}
