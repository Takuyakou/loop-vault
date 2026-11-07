import { useEffect, useMemo, useRef, useState } from "react";
import type { EarKeySignature } from "../../domain/earPractice";
import { SIGNATURE_STEPS } from "../chord-dojo/GrandStaff";
import { displayChordLabel } from "./label";
import { GAP, layoutScore, type PlacedChord, type PlacedNote, type PlacedRow, type ScoreChordInput } from "./scoreLayout";

/** What is written under a chord name: the marks and the seconds (or what the chord was). */
export interface ScoreAnnotation {
  marks: ReadonlyArray<"ok" | "retry" | "name" | "key">;
  text: string;
}

const MARK_TEXT = { ok: "✓", retry: "△", name: "名", key: "鍵" } as const;

const accidentalGlyph = (kind: "flat" | "sharp") => (kind === "flat" ? "♭" : "♯");
const TREBLE_CLEF = "M 101 118 C 87 106 82 92 99 84 C 117 76 129 88 120 99 C 109 112 93 101 96 90 M 108 125 C 112 113 103 90 101 72 C 99 51 113 39 116 49 C 125 63 97 75 91 90";
const BASS_CLEF = "M 95 174 C 113 159 130 181 111 194 C 104 200 96 203 90 208 M 99 178 a 4 4 0 1 1 -1 -1";
const K = GAP / 12;

function Head({ note, value, tone }: { note: PlacedNote; value: PlacedChord["value"]; tone: string }) {
  const open = value === "whole" || value === "half" || value === "dotted-half" || value === "none";
  return (
    <g className="ear-score-note" data-tone={tone} data-midi={note.midi} data-step={note.step} data-alter={note.alter} data-octave={note.octave} data-staff={note.staff}>
      {note.ledgers.map((y) => <line key={y} className="ear-score-ledger" x1={note.x - 10} x2={note.x + 10} y1={y} y2={y} />)}
      {note.accidental ? <text className="ear-score-accidental" data-accidental={note.accidental} x={note.accidentalX} y={note.y + 5.5} textAnchor="middle">{note.accidental}</text> : null}
      <ellipse className="ear-score-head" data-open={open || undefined} cx={note.x} cy={note.y} rx={value === "whole" || value === "none" ? 7 : 6} ry={4.6} transform={`rotate(-18 ${note.x} ${note.y})`} />
    </g>
  );
}

function Row({ row, signature, annotations, tone, playingIndex, onPlay, labelFor }: {
  row: PlacedRow;
  signature: EarKeySignature | undefined;
  annotations: ReadonlyMap<number, ScoreAnnotation>;
  tone: string;
  playingIndex: number | undefined;
  onPlay: (index: number) => void;
  labelFor: (index: number) => string;
}) {
  const staffLines = (top: number) => Array.from({ length: 5 }, (_, i) => top + i * GAP);
  const bassBottom = row.bassTop + 4 * GAP;
  const sigY = (staff: "treble" | "bass", octave: number, step: number) => {
    const bottomIndex = staff === "treble" ? 4 * 7 + 2 : 2 * 7 + 4;
    const top = staff === "treble" ? row.trebleTop : row.bassTop;
    return top + 4 * GAP - (octave * 7 + step - bottomIndex) * (GAP / 2);
  };
  return (
    <g transform={`translate(0 ${row.y})`} className="ear-score-row" data-testid="ear-score-row" data-bars={row.bars.length}>
      {[row.trebleTop, row.bassTop].flatMap((top) => staffLines(top).map((y) => <line key={`${top}-${y}`} className="ear-score-line" x1={6} x2={row.right + 2} y1={y} y2={y} />))}
      <line className="ear-score-barline" x1={6} x2={6} y1={row.trebleTop} y2={bassBottom} />
      <path className="ear-score-brace" transform={`translate(-1 ${row.trebleTop}) scale(0.7 ${(bassBottom - row.trebleTop) / 154}) translate(-61 -55)`} d="M 69 55 C 55 72 73 123 61 132 C 73 141 55 190 69 209" vectorEffect="non-scaling-stroke" />
      <g className="ear-score-clef" transform={`translate(${10 - 88 * K} ${row.trebleTop + 4 * GAP}) scale(${K}) translate(0 -104)`}><path d={TREBLE_CLEF} vectorEffect="non-scaling-stroke" /></g>
      <g className="ear-score-clef" transform={`translate(${10 - 88 * K} ${bassBottom}) scale(${K}) translate(0 -214)`}>
        <path d={BASS_CLEF} vectorEffect="non-scaling-stroke" /><circle cx="125" cy="172" r="2.4" /><circle cx="125" cy="184" r="2.4" />
      </g>
      {signature && signature.count > 0 ? (
        <g className="ear-score-key" data-testid="ear-score-key" data-key-accidental={signature.accidental} data-key-count={signature.count}>
          {(["treble", "bass"] as const).flatMap((staff) => SIGNATURE_STEPS[signature.accidental][staff].slice(0, signature.count).map(([octave, step], i) => (
            <text key={`${staff}${i}`} className="ear-score-accidental" x={44 + i * 11} y={sigY(staff, octave, step) + 5.5} textAnchor="middle">{accidentalGlyph(signature.accidental)}</text>
          )))}
        </g>
      ) : null}
      {row.bars.map((bar, barIndex) => (
        <g key={`${bar.bar}-${barIndex}`} className="ear-score-bar" data-bar={bar.bar}>
          <line className="ear-score-barline" x1={bar.x + bar.width} x2={bar.x + bar.width} y1={row.trebleTop} y2={bassBottom} />
          {row.isLast && barIndex === row.bars.length - 1 ? <line className="ear-score-barline ear-score-barline-end" x1={bar.x + bar.width - 4} x2={bar.x + bar.width - 4} y1={row.trebleTop} y2={bassBottom} /> : null}
          {bar.chords.map((chord) => {
            const annotation = annotations.get(chord.index);
            return (
              <g key={chord.index} className="ear-score-chord" data-chord-index={chord.index} data-value={chord.value} data-playing={playingIndex === chord.index || undefined}>
                <rect className="ear-score-hit" role="button" tabIndex={0} x={chord.x} y={2} width={chord.width} height={row.height - 4} rx={5}
                  aria-label={`${labelFor(chord.index)} を鳴らす`} data-testid={`ear-score-chord-${chord.index}`}
                  onClick={() => onPlay(chord.index)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onPlay(chord.index); } }} />
                <text className="ear-score-name" x={chord.cx} y={16} textAnchor="middle">{displayChordLabel(chord.label)}</text>
                {annotation ? (
                  <text className="ear-score-sub" x={chord.cx} y={32} textAnchor="middle" data-testid={`ear-score-sub-${chord.index}`}>
                    {annotation.marks.map((mark) => <tspan key={mark} className="ear-score-mark" data-mark={mark}>{MARK_TEXT[mark]} </tspan>)}
                    <tspan>{annotation.text}</tspan>
                  </text>
                ) : null}
                {chord.stems.map((stem) => (
                  <g key={stem.staff}>
                    <line className="ear-score-stem" x1={stem.x} x2={stem.x} y1={stem.y1} y2={stem.y2} />
                    {stem.flag ? <path className="ear-score-flag" d={stem.flag.up ? `M ${stem.x} ${stem.flag.y} c 1 8 9 9 8 20` : `M ${stem.x} ${stem.flag.y} c 1 -8 9 -9 8 -20`} /> : null}
                  </g>
                ))}
                {chord.notes.map((note) => <Head key={`${note.midi}-${note.staff}`} note={note} value={chord.value} tone={tone} />)}
                {chord.dots.map((dot, i) => <circle key={i} className="ear-score-dot" cx={dot.x} cy={dot.y} r={1.8} />)}
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

/**
 * The whole progression on a grand staff: key signature, bars, chord names with their marks and seconds, and the notes.
 * What is drawn is decided by `layoutScore`; pressing a chord asks the parent to sound it.
 */
export function ProgressionScore({ chords, beatsPerBar, signature, annotations, tone, playingIndex, onPlay, labelFor }: {
  chords: readonly ScoreChordInput[];
  beatsPerBar: number;
  signature: EarKeySignature | undefined;
  annotations: ReadonlyMap<number, ScoreAnnotation>;
  /** `sounded` (what the app played) or `played` (what the player held). */
  tone: "sounded" | "played";
  playingIndex?: number | undefined;
  onPlay: (index: number) => void;
  labelFor: (index: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [windowWidth, setWindowWidth] = useState(() => globalThis.innerWidth || 1440);
  useEffect(() => {
    const element = ref.current;
    const measure = () => { if (element) setWidth(Math.floor(element.clientWidth)); setWindowWidth(globalThis.innerWidth || 1440); };
    measure();
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const layout = useMemo(() => layoutScore({ chords, beatsPerBar, signature, width, windowWidth }), [chords, beatsPerBar, signature, width, windowWidth]);
  return (
    <div className="ear-progression-score" ref={ref} data-testid="ear-progression-score" data-per-row={layout.perRow} data-rows={layout.rows.length} data-writable={layout.writable} data-tone={tone}>
      <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="進行の譜面">
        {layout.rows.map((row, index) => (
          <Row key={index} row={row} signature={signature} annotations={annotations} tone={tone}
            playingIndex={playingIndex} onPlay={onPlay} labelFor={labelFor} />
        ))}
      </svg>
    </div>
  );
}
