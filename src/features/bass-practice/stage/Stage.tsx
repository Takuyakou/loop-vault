import { createContext, Fragment, useContext, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEchoActive } from "../ui/EchoPracticeFrame";
import { fretboardPositions } from "../domain/mapping";
import { STANDARD_BASS_TUNINGS } from "../domain/constants";
import "./stage.css";

/**
 * P23-62: the practice stage shared by every Bass practice. Pieces only — each practice decides what goes in
 * them. 1 聴く → 2 弾く → 3 結果, the お手本 / 自分 lane, the buttons right under the lane, the keys at the bottom.
 */

export type StageStep = 0 | 1 | 2;
const STEP_NAMES = ["聴く", "弾く", "結果"] as const;

export function StageFrame({ step, keys, tone, children, testId, state }: {
  readonly step: StageStep;
  /** The keys line at the very bottom (「Space 聴く · R 録って弾く」). */
  readonly keys?: string;
  /** "good" lights the stage green behind a good result. */
  readonly tone?: "good";
  readonly children: ReactNode;
  readonly testId?: string;
  /** Mirrors the practice's own state for tests (data-practice-state). */
  readonly state?: string;
}) {
  return (
    <div className="bp-frame" data-testid={testId} data-practice-state={state} data-stage-step={step}>
      <div className="bp-frame-scroll">
        <ol className="bp-steps" aria-label="練習の段階">
          {STEP_NAMES.map((name, index) => (
            <Fragment key={name}>
              {index > 0 ? <li className="bp-step-line" aria-hidden="true" /> : null}
              <li className="bp-step" data-state={index === step ? "current" : index < step ? "done" : "todo"} aria-current={index === step ? "step" : undefined}>
                <span className="bp-step-no" aria-hidden="true">{index + 1}</span>{name}
              </li>
            </Fragment>
          ))}
        </ol>
        <div className="bp-stage" data-tone={tone}>{children}</div>
      </div>
      <div className="bp-foot" aria-hidden={keys ? undefined : true}>{keys ?? ""}</div>
    </div>
  );
}

/** A quiet button; `tone` makes it the main (teal) one or the red 「止める」. */
export function StageButton({ tone, keyHint, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly tone?: "primary" | "record";
  readonly keyHint?: string;
}) {
  return (
    <button type="button" className="bp-btn" data-tone={tone} {...props}>
      {children}{keyHint ? <kbd aria-hidden="true">{keyHint}</kbd> : null}
    </button>
  );
}

export function StagePlayButton({ playing, label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly playing: boolean;
  readonly label: string;
}) {
  return (
    <button type="button" className="bp-play" aria-label={label} {...props}>
      {playing
        ? <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><rect x="5" y="5" width="12" height="12" rx="2" fill="currentColor" /></svg>
        : <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M8 5.5v15l12-7.5z" fill="currentColor" /></svg>}
    </button>
  );
}

export type LaneNoteKind = "hide" | "ref" | "ok" | "pitch" | "early" | "late" | "miss" | "extra";
export interface LaneNote {
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly kind: LaneNoteKind;
  /** The big text (度数・✓・✗). */
  readonly text?: string;
  /** The small text after it (音名・ms). */
  readonly sub?: string;
  /** What a screen reader hears for the note. */
  readonly label: string;
}
export interface LaneRow { readonly label: "お手本" | "自分"; readonly notes: readonly LaneNote[]; }

/**
 * The lane. Beats are spread over the width; a long phrase scrolls sideways (at least `minBeatPx` a beat).
 * `beatsPerBar` draws the stronger bar lines and the numbers on top (「1 2 3 4」 for one bar, 「1 小節 2 小節」 for more).
 */
export function StageLane({ lengthBeats, beatsPerBar, rows, playhead, wide, minBeatPx = 40, chords }: {
  readonly lengthBeats: number;
  readonly beatsPerBar: number;
  readonly rows: readonly LaneRow[];
  /** The chord names above the rows (コード進行のベース, the MIDI bassline's accompaniment). */
  readonly chords?: readonly { readonly startBeat: number; readonly label: string }[];
  readonly playhead?: number;
  readonly wide?: boolean;
  readonly minBeatPx?: number;
}) {
  const beats = Math.max(1, lengthBeats);
  const bars = Math.ceil(beats / beatsPerBar);
  const percent = (beat: number) => `${(beat / beats) * 100}%`;
  const labels = bars <= 1
    ? Array.from({ length: Math.ceil(beats) }, (_, beat) => ({ at: beat, text: String(beat + 1) }))
    : Array.from({ length: bars }, (_, bar) => ({ at: bar * beatsPerBar, text: `${bar + 1} 小節` }));
  const grid = Array.from({ length: Math.ceil(beats) }, (_, beat) => beat);
  return (
    <div className="bp-lane" data-wide={wide ? "true" : undefined} data-testid="bp-lane">
      <div className="bp-lane-scroll" tabIndex={0} role="group" aria-label="レーン(横にスクロールできます)">
        <div className="bp-lane-inner" style={{ minWidth: `${76 + beats * minBeatPx}px` }}>
          <div className="bp-lane-beats" aria-hidden="true">
            {labels.map((label) => <span key={label.at} style={{ left: percent(label.at) }}>{label.text}</span>)}
          </div>
          {chords?.length ? (
            <div className="bp-lane-row" data-row="chords" role="group" aria-label="コードの段">
              <em>コード</em>
              <div className="bp-lane-track">
                {chords.map((chord) => <span key={`${chord.startBeat}-${chord.label}`} className="bp-lane-chord" style={{ left: `calc(${percent(chord.startBeat)} + 2px)` }}>{chord.label}</span>)}
              </div>
            </div>
          ) : null}
          {rows.map((row) => (
            <div key={row.label} className="bp-lane-row" role="group" aria-label={`${row.label}の段`}>
              <em>{row.label}</em>
              <div className="bp-lane-track">
                {grid.map((beat) => <span key={beat} className="bp-lane-grid" data-bar={beat % beatsPerBar === 0 ? "true" : undefined} style={{ left: percent(beat) }} aria-hidden="true" />)}
                {row.notes.map((note, index) => {
                  const width = (Math.max(0.12, note.durationBeats) / beats) * 100;
                  return (
                    <span
                      key={`${index}-${note.startBeat}`}
                      className="bp-note"
                      data-kind={note.kind}
                      data-narrow={width < 4 ? "true" : undefined}
                      role="img"
                      aria-label={note.label}
                      title={note.label}
                      style={{ left: `calc(${percent(note.startBeat)} + 2px)`, width: `calc(${width}% - 4px)` }}
                    >
                      {note.text ? <span>{note.text}</span> : null}{note.sub ? <small>{note.sub}</small> : null}
                    </span>
                  );
                })}
                {playhead !== undefined ? <span className="bp-playhead" style={{ left: percent(Math.min(beats, playhead)) }} aria-hidden="true" /> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface HintChip { readonly id: string; readonly label: string; readonly openLabel?: string; }

/** The hints, opened one at a time and in order. `open` is how many are open. */
export function StageHints({ chips, open, disabled, onOpen }: {
  readonly chips: readonly HintChip[];
  readonly open: number;
  readonly disabled?: boolean;
  readonly onOpen: () => void;
}) {
  return (
    <div className="bp-hints" role="group" aria-label="ヒント">
      <span aria-hidden="true">ヒント</span>
      {chips.map((chip, index) => {
        const state = index < open ? "open" : index === open ? "next" : "locked";
        return (
          <button
            key={chip.id}
            type="button"
            className="bp-hint"
            data-state={state}
            data-hint={chip.id}
            aria-pressed={index < open}
            disabled={state !== "next" || disabled}
            onClick={state === "next" ? onOpen : undefined}
          >
            {index < open ? chip.openLabel ?? chip.label : chip.label}
          </button>
        );
      })}
    </div>
  );
}

/** The input level while a take runs: four bars, lit up to the level. */
export function StageMeter({ level }: { readonly level: number }) {
  const lit = Math.min(4, Math.round(Math.min(1, level * 4) * 4));
  return <span className="bp-meter" aria-hidden="true">{[0, 1, 2, 3].map((bar) => <i key={bar} data-on={bar < lit ? "true" : undefined} />)}</span>;
}

/** 「1 2 3 4」 with the current count in white. */
export function StageCount({ beats, current }: { readonly beats: number; readonly current: number }) {
  return (
    <p className="bp-count" aria-live="polite" aria-label={`カウント ${current}`}>
      {Array.from({ length: beats }, (_, index) => index + 1).map((n) => n === current ? <b key={n}>{n}</b> : <span key={n}>{n}</span>)}
    </p>
  );
}

export interface ResultFact { readonly text: string; readonly tone?: "ok" | "ng" | "warn" | "mute"; }

export function StageResultHead({ big, label, facts }: { readonly big: string; readonly label: string; readonly facts: readonly ResultFact[] }) {
  return (
    <>
      <p className="bp-big" data-testid="bp-result-big"><b>{big}</b><span>{label}</span></p>
      <ul className="bp-facts" data-testid="bp-result-facts">
        {facts.map((fact) => <li key={fact.text}>{fact.tone ? <i data-tone={fact.tone} aria-hidden="true" /> : null}{fact.text}</li>)}
      </ul>
    </>
  );
}

export type StageRating = "again" | "hard" | "good" | "easy";
const RATING_LABELS: Readonly<Record<StageRating, string>> = { again: "もう一度", hard: "難しい", good: "良い", easy: "簡単" };
export const STAGE_RATINGS: readonly StageRating[] = ["again", "hard", "good", "easy"];

/** 「評価」 and the four choices. With a judged take one is chosen already; it can be changed (1–4). */
export function StageRatingChoice({ value, onChange, prompt }: {
  readonly value?: StageRating;
  readonly onChange: (rating: StageRating) => void;
  readonly prompt: string;
}) {
  return (
    <div className="bp-rating" role="group" aria-label="評価">
      <span>{prompt}</span>
      <span className="bp-rating-seg">
        {STAGE_RATINGS.map((rating, index) => (
          <button key={rating} type="button" data-review-rating={rating} aria-pressed={value === rating} onClick={() => onChange(rating)}>
            {RATING_LABELS[rating]}<span className="sr-only"> ({index + 1})</span>
          </button>
        ))}
      </span>
    </div>
  );
}

export interface FretDot { readonly midiNote: number; readonly label: string; readonly tone?: "warn"; }

/**
 * A small fretboard (0–12 or the chosen range). Strings top to bottom from the highest; left-handed mirrors it.
 * Each note takes its first playable place inside the range.
 */
export function StageFretboard({ dots, stringCount, fretRange, handedness }: {
  readonly dots: readonly FretDot[];
  readonly stringCount: 4 | 5;
  readonly fretRange: { readonly min: number; readonly max: number };
  readonly handedness: "right" | "left";
}) {
  const tuning = STANDARD_BASS_TUNINGS[stringCount];
  const first = Math.max(0, fretRange.min);
  const last = Math.max(first + 4, fretRange.max);
  const span = last - first + 1;
  const x = (fret: number) => {
    const at = ((fret - first) + 0.5) / span * 100;
    return `${handedness === "left" ? 100 - at : at}%`;
  };
  const wire = (fret: number) => {
    const at = (fret - first) / span * 100;
    return `${handedness === "left" ? 100 - at : at}%`;
  };
  const placed = placeInOneHand(dots, tuning, first, last);
  const strings = [...tuning.keys()].reverse();
  return (
    <div className="bp-fret" role="img" aria-label={`指板: ${placed.map((dot) => `${dot.label} ${stringCount - dot.position.stringIndex}弦 ${dot.position.fret}フレット`).join("、")}`} data-testid="bp-fretboard">
      {strings.map((stringIndex) => (
        <div key={stringIndex} className="bp-fret-string">
          {Array.from({ length: span + 1 }, (_, i) => first + i).map((fret) => <span key={fret} className="bp-fret-wire" data-nut={fret === 0 && first === 0 ? "true" : undefined} style={{ left: wire(fret) }} />)}
          {placed.filter((dot) => dot.position.stringIndex === stringIndex).map((dot, index) => (
            <i key={`${dot.label}-${index}`} className="bp-fret-dot" data-tone={dot.tone} style={{ left: x(dot.position.fret) }}>{dot.label}</i>
          ))}
        </div>
      ))}
      <div className="bp-fret-numbers" aria-hidden="true">
        {[3, 5, 7, 9, 12].filter((fret) => fret >= first && fret <= last).map((fret) => <span key={fret} style={{ left: x(fret) }}>{fret}</span>)}
      </div>
    </div>
  );
}

const ToolsSlotContext = createContext<HTMLElement | null>(null);
/** P23-62: the place in the top band where the open practice puts its own chips (条件 など). */
export const StageToolsSlot = ToolsSlotContext.Provider;
/** Draws `children` in the top band while this practice is the one on screen. */
export function StageTools({ children }: { readonly children: ReactNode }) {
  const slot = useContext(ToolsSlotContext);
  const active = useEchoActive();
  return slot && active ? createPortal(children, slot) : null;
}

/**
 * One place for each note, kept inside one hand: the lowest 5-fret window (from `first`) where every note has a
 * place, then the lowest fret inside it. Notes that fit no common window take their own lowest fret.
 */
function placeInOneHand<T extends FretDot>(dots: readonly T[], tuning: readonly number[], first: number, last: number) {
  const options = dots.map((dot) => fretboardPositions(dot.midiNote, tuning, { min: first, max: last }));
  for (let low = first; low <= last; low += 1) {
    const high = low + 4;
    if (options.every((choices) => choices.some((choice) => choice.fret >= low && choice.fret <= high))) {
      return dots.map((dot, index) => ({ ...dot, position: [...options[index]].filter((choice) => choice.fret >= low && choice.fret <= high).sort((a, b) => a.fret - b.fret || a.stringIndex - b.stringIndex)[0] }));
    }
  }
  return dots.flatMap((dot, index) => {
    const position = [...options[index]].sort((a, b) => a.fret - b.fret)[0];
    return position ? [{ ...dot, position }] : [];
  });
}

/** 「C♯2」: a MIDI note spelled with sharps (noteName spells with flats). */
export function sharpNoteName(midiNote: number): string {
  return ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][midiNote % 12] + String(Math.floor(midiNote / 12) - 1);
}

/** 「E♭3」: the app's flat and sharp signs in a note name. */
export function displayNoteName(name: string): string {
  return name.replace(/^([A-G])b/, "$1♭").replace(/^([A-G])#/, "$1♯");
}

/** 「C メジャー」 from the practice's key and scale (Bb → B♭). */
export function keyLabel(key: string, scale: "major" | "minor"): string {
  return `${key.replace(/b$/, "♭").replace(/#$/, "♯")} ${scale === "major" ? "メジャー" : "マイナー"}`;
}
