import { useRef } from "react";
import type { ChordSymbol } from "../../domain/types";

/**
 * P24-06: the 「鍵盤で入れる」 band under the input's heading (the design's Keys screen).
 *
 * Connection line, the two-octave keyboard with the held notes, the chord the detector named, the length
 * buttons and the two small actions. The band never opens the shared connection itself; 「つなぐ」 asks the
 * header's one panel to open (P14's store), like every other screen.
 */
export interface KeyboardLengthChoice {
  readonly value: 1 | 2 | "bar";
  readonly label: string;
  readonly disabled: boolean;
}

interface Props {
  readonly connected: boolean;
  readonly deviceName?: string;
  readonly onConnect: (anchor?: HTMLButtonElement | null) => void;
  readonly heldNotes: readonly number[];
  readonly chord?: ChordSymbol;
  readonly detectionLabel?: string;
  readonly degree?: string;
  readonly roleColor?: string;
  readonly length: 1 | 2 | "bar";
  readonly lengths: readonly KeyboardLengthChoice[];
  readonly onLength: (value: 1 | 2 | "bar") => void;
  readonly onRest: () => void;
  readonly onUndo: () => void;
  readonly undoEnabled: boolean;
}

export function KeyboardEntryBand({
  connected, deviceName, onConnect, heldNotes, chord, detectionLabel, degree, roleColor, length, lengths,
  onLength, onRest, onUndo, undoEnabled,
}: Props) {
  const connectRef = useRef<HTMLButtonElement>(null);
  return (
    <div data-testid="keyboard-entry-band" style={{
      flex: "none", display: "flex", flexDirection: "column", gap: 10, margin: "10px 12px 4px",
      padding: "10px 12px 12px", border: "1px solid #1d4d4a", borderRadius: 12, background: "#0d1b24",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#a5b2c6" }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#36c990" : "#3a4a60" }} />
        {connected ? (
          <>
            <span data-testid="keyboard-device">{deviceName ?? "MIDI 鍵盤"}</span>
            <span style={{ color: "#7f90aa" }}>{"· 和音を押さえて離すと、最後に足されます"}</span>
          </>
        ) : (
          <>
            <span>{"つながっていません"}</span>
            <button ref={connectRef} type="button" data-testid="keyboard-connect" onClick={() => onConnect(connectRef.current)} style={{
              height: 24, padding: "0 8px", border: "1px solid rgb(150 170 195 / 34%)", borderRadius: 7,
              background: "transparent", color: "#c9d3e2", fontSize: 11, whiteSpace: "nowrap",
            }}>{"つなぐ"}</button>
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <KeyboardKeys notes={heldNotes} />
        {/* P24-fix-1: while nothing is held the band shows the keyboard alone. */}
        <div style={{ display: heldNotes.length === 0 ? "none" : "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          {chord === undefined ? null : (
            <span style={{ fontWeight: 700, lineHeight: 1.1, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 26 }}>{splitRoot(chord.label).root}</span>
              <span style={{ fontSize: 15, color: "#c9d3e2" }}>{splitRoot(chord.label).quality}</span>
            </span>
          )}
          {detectionLabel !== undefined && chord === undefined ? (
            <span data-testid="keyboard-held-notes" style={{ fontSize: 13, color: "#a5b2c6", whiteSpace: "nowrap" }}>
              {detectionLabel}
            </span>
          ) : null}
          {degree === undefined ? null : (
            <span data-testid="keyboard-held-degree" style={{ fontSize: 11, fontWeight: 700, color: roleColor ?? "#a5b2c6" }}>
              {degree}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#7f90aa" }}>{"長さ"}</span>
        <div role="group" aria-label="足すコードの長さ" style={{
          display: "flex", gap: 2, padding: 2, border: "1px solid rgb(150 170 195 / 14%)", borderRadius: 9, background: "#0a1019",
        }}>
          {lengths.map((choice) => {
            const on = choice.value === length;
            return <button key={String(choice.value)} type="button" data-testid={`keyboard-length-${String(choice.value)}`}
              aria-pressed={on} disabled={choice.disabled} onClick={() => onLength(choice.value)} style={{
                height: 26, padding: "0 10px", border: 0, borderRadius: 7,
                background: on ? "#123b3a" : "transparent", color: on ? "#42d8c6" : "#a5b2c6",
                fontSize: 12, fontWeight: on ? 700 : 500, whiteSpace: "nowrap",
                opacity: choice.disabled ? 0.45 : 1, cursor: choice.disabled ? "default" : "pointer",
              }}>{choice.label}</button>;
          })}
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" data-testid="keyboard-rest" onClick={onRest} style={SMALL_GHOST}>{"休符"}</button>
        <button type="button" data-testid="keyboard-undo" onClick={onUndo} disabled={!undoEnabled} style={{
          ...SMALL_GHOST, display: "flex", alignItems: "center", gap: 6, opacity: undoEnabled ? 1 : 0.45,
          cursor: undoEnabled ? "pointer" : "default",
        }}>{"1 つ戻す"}<span style={{ fontSize: 10, color: "#7f90aa" }}>{"Ctrl Z"}</span></button>
      </div>
    </div>
  );
}

const SMALL_GHOST = {
  height: 28, padding: "0 10px", border: "1px solid rgb(150 170 195 / 28%)", borderRadius: 8,
  background: "transparent", color: "#a5b2c6", fontSize: 12, whiteSpace: "nowrap",
} as const;

/** The design's two-octave keyboard: from the lowest held note's octave C (C3–B4 when nothing is held). */
function KeyboardKeys({ notes }: { readonly notes: readonly number[] }) {
  const held = new Set(notes);
  const startOctave = notes.length === 0 ? 3 : Math.floor(Math.min(...notes) / 12) - 1;
  const base = (startOctave + 1) * 12;
  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  const BLACK = [1, 3, 6, 8, 10];
  const whites = [0, 1].flatMap((octave) => WHITE.map((pitch, index) => ({
    midi: base + octave * 12 + pitch,
    x: (octave * 7 + index) * 18,
  })));
  const blacks = [0, 1].flatMap((octave) => BLACK.map((pitch) => {
    const position = WHITE.filter((value) => value < pitch).length;
    return { midi: base + octave * 12 + pitch, x: (octave * 7 + position) * 18 + 12 };
  }));
  return <svg role="img" aria-label={`押さえている音 ${notes.map(noteName).join(" ")}`.trim()} width="252" height="64"
    viewBox="0 0 252 64" data-testid="keyboard-keys" style={{ flex: "none" }}>
    {whites.map((key) => <rect key={key.midi} x={key.x} y={0} width={17} height={64} rx={2}
      fill={held.has(key.midi) ? "#42d8c6" : "#e8edf3"} stroke="#0a1019" strokeWidth={1} data-midi={key.midi} />)}
    {blacks.map((key) => <rect key={key.midi} x={key.x} y={0} width={11} height={38} rx={2}
      fill={held.has(key.midi) ? "#1f8f82" : "#1a2230"} data-midi={key.midi} />)}
  </svg>;
}

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
function noteName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function splitRoot(label: string): { root: string; quality: string } {
  const match = /^([A-G][#b]?)(.*)$/.exec(label);
  return match === null ? { root: label, quality: "" } : { root: match[1]!, quality: match[2]! };
}
