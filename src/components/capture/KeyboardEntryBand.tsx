import { useRef, type CSSProperties } from "react";
import { KeyCap } from "./TextHelpKeyList";
import type { PresenceRender } from "../motion/Presence";

/**
 * P24-06: the 「鍵盤で入れる」 band (見本 KeysEntry.dc.html の「案」, V20).
 *
 * Connection line with the close ×, the three-octave keyboard (C3–C6) with the held keys pressed in, the chord being
 * held, the length buttons, もう一度・休符 and, apart from them, 1 つ戻す. The band never opens the shared connection
 * itself; 「つなぐ」 asks the header's one panel to open (P14's store), like every other screen.
 */
export interface KeyboardLengthChoice {
  readonly value: 1 | 2 | "bar";
  readonly label: string;
  /** P25-05 D: the key that picks this length (1 = one bar, 2 = two beats, 3 = one beat). */
  readonly keyCap: string;
  readonly disabled: boolean;
}

interface Props {
  readonly connected: boolean;
  readonly deviceName?: string;
  readonly onConnect: (anchor?: HTMLButtonElement | null) => void;
  readonly heldNotes: readonly number[];
  /** The held chord's name, read the way a card's notes are read again (`textCardRename`); none → 「—」. */
  readonly chordName?: string;
  readonly degree?: string;
  readonly roleColor?: string;
  readonly length: 1 | 2 | "bar";
  readonly lengths: readonly KeyboardLengthChoice[];
  readonly onLength: (value: 1 | 2 | "bar") => void;
  readonly onRepeat: () => void;
  readonly repeatEnabled: boolean;
  readonly onRest: () => void;
  readonly onUndo: () => void;
  readonly undoEnabled: boolean;
  readonly onClose: () => void;
  /** V20: set by the panel's `Presence` (the band rises in and sinks out like the card band). */
  readonly presence?: PresenceRender;
}

export const KEYS_LOW = 48;
export const KEYS_HIGH = 84;
const WHITE_PITCHES = [0, 2, 4, 5, 7, 9, 11];
const LINE = "rgb(150 170 195 / 28%)";

export function KeyboardEntryBand({
  connected, deviceName, onConnect, heldNotes, chordName, degree, roleColor, length, lengths,
  onLength, onRepeat, repeatEnabled, onRest, onUndo, undoEnabled, onClose, presence,
}: Props) {
  const connectRef = useRef<HTMLButtonElement>(null);
  const held = [...new Set(heldNotes)].sort((a, b) => a - b);
  return (
    <div data-testid="keyboard-entry-band" className={presence ? "lv-motion-rise" : undefined}
      data-presence={presence?.state} onTransitionEnd={presence?.onTransitionEnd} style={{
        flex: "none", display: "flex", flexDirection: "column", gap: 10, margin: "4px 12px 10px",
        padding: "10px 12px 12px", border: "1px solid #1d4d4a", borderRadius: 12, background: "#0d1b24",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28, fontSize: 12, color: "#a5b2c6", whiteSpace: "nowrap" }}>
        <span aria-hidden="true" style={{ flex: "none", width: 7, height: 7, borderRadius: "50%", background: connected ? "#36c990" : "#3a4a60" }} />
        {connected ? (
          <>
            <span data-testid="keyboard-device" style={{ color: "#c9d3e2" }}>{deviceName ?? "MIDI 鍵盤"}</span>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", color: "#7f90aa" }}>{"· 押さえて離すと、最後に足されます"}</span>
          </>
        ) : (
          <>
            <span>{"MIDI 未接続"}</span>
            <button ref={connectRef} type="button" data-testid="keyboard-connect" onClick={() => onConnect(connectRef.current)} style={{
              height: 24, padding: "0 8px", border: "1px solid rgb(150 170 195 / 34%)", borderRadius: 7,
              background: "transparent", color: "#c9d3e2", fontSize: 11, whiteSpace: "nowrap",
            }}>{"つなぐ"}</button>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="lv-dock-ghost" data-testid="keyboard-close" aria-label="閉じる" title="閉じる (Esc)" onClick={onClose} style={{
          flex: "none", display: "grid", placeItems: "center", width: 28, height: 28, padding: 0, border: 0, borderRadius: 8,
          background: "transparent", color: "#a5b2c6",
        }}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 14 }}>
        <KeyboardKeys notes={held} />
        <div data-testid="keyboard-held-chord" style={{
          flex: "1 1 140px", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
          padding: "6px 14px", border: "1px solid rgb(150 170 195 / 14%)", borderRadius: 10, background: "#0d1522",
        }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11, color: "#7f90aa", whiteSpace: "nowrap" }}>
            {"押さえている和音"}
            {degree === undefined ? null : <span data-testid="keyboard-held-degree" style={{ fontWeight: 700, color: roleColor ?? "#a5b2c6" }}>{degree}</span>}
          </span>
          <b data-testid="keyboard-held-name" style={{ fontSize: 26, lineHeight: 1.1, color: "#f2f6fc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {held.length > 0 && chordName !== undefined ? chordName : "—"}
          </b>
          <span data-testid="keyboard-held-notes" style={{ minHeight: 18, fontSize: 12, lineHeight: "18px", color: "#a5b2c6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {held.map(noteName).join(" · ")}
          </span>
        </div>
      </div>
      {/* 長さ → 足す物(もう一度・休符) together; 1 つ戻す apart at the right end. V21: when one row is too narrow the two
          groups stack (row 1 長さ, row 2 もう一度・休符・1 つ戻す); a word never folds. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 14, rowGap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#7f90aa", whiteSpace: "nowrap" }}>{"長さ"}</span>
          <div role="group" aria-label="足すコードの長さ" style={{
            display: "flex", gap: 2, padding: 3, border: `1px solid ${LINE}`, borderRadius: 10, background: "#0d1522",
          }}>
            {lengths.map((choice) => {
              const on = choice.value === length;
              return <button key={String(choice.value)} type="button" data-testid={`keyboard-length-${String(choice.value)}`}
                aria-pressed={on} disabled={choice.disabled} onClick={() => onLength(choice.value)} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  height: 28, padding: "0 12px", border: `1px solid ${on ? "#42d8c6" : "transparent"}`, borderRadius: 7,
                  background: on ? "#123b3a" : "transparent", color: on ? "#42d8c6" : "#c9d3e2",
                  fontSize: 13, fontWeight: on ? 700 : 500, whiteSpace: "nowrap",
                  opacity: choice.disabled ? 0.45 : 1, cursor: choice.disabled ? "default" : "pointer",
                }}><KeyCap>{choice.keyCap}</KeyCap>{choice.label}</button>;
            })}
          </div>
        </div>
        <div style={{ display: "flex", flex: "1 1 auto", flexWrap: "wrap", alignItems: "center", gap: 8, rowGap: 6 }}>
          <button type="button" data-testid="keyboard-repeat" onClick={onRepeat} disabled={!repeatEnabled}
            title="前のコードを、今の長さでもう一度足します(テキストの % と同じ)" style={{ ...ACTION, opacity: repeatEnabled ? 1 : 0.45, cursor: repeatEnabled ? "pointer" : "default" }}>
            <KeyCap>{"R"}</KeyCap>{"もう一度"}
          </button>
          <button type="button" data-testid="keyboard-rest" onClick={onRest} style={ACTION}>
            <KeyCap>{"0"}</KeyCap>{"休符"}
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="keyboard-undo" onClick={onUndo} disabled={!undoEnabled} aria-label="1 つ戻す(Backspace)" title="1 つ戻す(Backspace)" style={{
            ...ACTION, opacity: undoEnabled ? 1 : 0.45, cursor: undoEnabled ? "pointer" : "default",
          }}><KeyCap>{"Back"}</KeyCap>{"戻す"}</button>
        </div>
      </div>
    </div>
  );
}

const ACTION: CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 12px", border: `1px solid ${LINE}`, borderRadius: 9,
  background: "transparent", color: "#e6ecf5", fontSize: 13, whiteSpace: "nowrap",
};

const PRESSED_WHITE = "inset 0 3px 4px rgb(0 0 0 / 35%), 0 0 0 2px #ccfbf1, 0 0 12px rgb(94 234 212 / 55%)";
const PRESSED_BLACK = "0 0 0 2px #ccfbf1, 0 0 10px rgb(94 234 212 / 60%)";
const KEY_NAME: CSSProperties = { position: "absolute", left: -6, right: -6, bottom: 4, textAlign: "center", fontSize: 10, fontWeight: 800, lineHeight: "12px", color: "#04201c" };

/** V20: three octaves C3–C6, the held keys sunk 3px in #5eead4 with their names; small chevrons mark notes outside the range. */
function KeyboardKeys({ notes }: { readonly notes: readonly number[] }) {
  const held = new Set(notes);
  const whites: number[] = [];
  for (let note = KEYS_LOW; note <= KEYS_HIGH; note += 1) if (WHITE_PITCHES.includes(note % 12)) whites.push(note);
  const step = 100 / whites.length;
  const below = notes.some((note) => note < KEYS_LOW);
  const above = notes.some((note) => note > KEYS_HIGH);
  return (
    <div style={{ position: "relative", flex: "0 1 380px", minWidth: 240, maxWidth: 380 }}>
      <div role="img" aria-label={`押さえている音 ${notes.map(noteName).join(" ")}`.trim()} data-testid="keyboard-keys" style={{
        position: "relative", height: 72, borderRadius: 4, overflow: "hidden", background: "#070c13",
      }}>
        {whites.map((note, index) => {
          const on = held.has(note);
          return <span key={note} data-midi={note} data-held={on || undefined} style={{
            position: "absolute", top: on ? 3 : 0, bottom: 0, left: `${index * step}%`, width: `calc(${step}% - 1px)`, borderRadius: "0 0 3px 3px",
            background: on ? "#5eead4" : "#eef2f7", boxShadow: on ? PRESSED_WHITE : undefined, zIndex: on ? 1 : undefined,
          }}>
            {on ? <span style={KEY_NAME}>{noteName(note)}</span>
              : note % 12 === 0 ? <span style={{ position: "absolute", left: 0, right: 0, bottom: 3, textAlign: "center", fontSize: 8, color: "#56657a" }}>{noteName(note)}</span> : null}
          </span>;
        })}
        {whites.slice(1).flatMap((next, index) => {
          const note = next - 1;
          if (WHITE_PITCHES.includes(note % 12)) return [];
          const on = held.has(note);
          const at = (index + 1) * step;
          return [<span key={note} data-midi={note} data-held={on || undefined} style={{
            position: "absolute", top: on ? 2 : 0, height: "60%", left: `calc(${at}% - ${on ? 6 : 5}px)`, width: on ? 12 : 10, borderRadius: "0 0 2px 2px",
            background: on ? "#5eead4" : "#141b26", boxShadow: on ? PRESSED_BLACK : undefined, zIndex: on ? 3 : 2,
          }}>
            {on ? <span style={{ ...KEY_NAME, bottom: 3, fontSize: 9, lineHeight: "11px" }}>{noteName(note)}</span> : null}
          </span>];
        })}
      </div>
      {below ? <span data-testid="keyboard-out-low" aria-label="C3 より下の音" style={{ ...OUT_MARK, left: -10 }}><Chevron left /></span> : null}
      {above ? <span data-testid="keyboard-out-high" aria-label="C6 より上の音" style={{ ...OUT_MARK, right: -10 }}><Chevron left={false} /></span> : null}
    </div>
  );
}

const OUT_MARK: CSSProperties = { position: "absolute", top: 30, display: "flex", color: "#5eead4" };

/** The small mark outside the end key for a held note beyond C3–C6. */
function Chevron({ left }: { readonly left: boolean }) {
  return <svg aria-hidden="true" width="7" height="12" viewBox="0 0 7 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round"><path d={left ? "M5.5 1.5 1.5 6l4 4.5" : "M1.5 1.5 5.5 6l-4 4.5"} /></svg>;
}

const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
function noteName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
