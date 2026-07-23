import { memo, useMemo } from "react";
import {
  createPianoKeyboardGeometry,
  KEYBOARD_HEIGHT,
} from "./keyboardGeometry";
import { createKeyboardDisplayState, pianoKeyVisualState } from "./keyVisualState";
import { notesOutsideKeyboardRange } from "./keyboardRange";
import { formatMidiNoteForDisplay } from "./noteDisplay";
import { PianoKey } from "./PianoKey";
import type {
  NoteAccidentalStyle,
  PianoKeyVisualState,
} from "./types";

export interface PianoKeyboardVisualizerProps {
  minMidiNote: number;
  maxMidiNote: number;
  guideNotes: readonly number[];
  leftHandGuideNotes?: readonly number[];
  rightHandGuideNotes?: readonly number[];
  heldNotes: readonly number[];
  sustainedNotes: readonly number[];
  allowedPitchClasses: readonly number[];
  requiredPitchClasses: readonly number[];
  guideBassNote?: number;
  heldBassNote?: number;
  showGuide: boolean;
  showCLabels: boolean;
  octaveConvention: "fl-studio";
  accidentalStyle?: NoteAccidentalStyle;
  matchState?: "idle" | "partial" | "match" | "wrong";
  language: "ja" | "en";
}

const copy = {
  ja: {
    guide: "お手本",
    leftGuide: "左手の目安",
    rightGuide: "右手の目安",
    held: "押鍵中",
    foreign: "構成外",
    sustain: "ペダル保持",
    outside: "範囲外の入力",
    keyboard: (count: number, guide: number, held: number, foreign: number, sustained: number) =>
      `${count}鍵のピアノ鍵盤。お手本${guide}音、押鍵中${held}音、構成外${foreign}音、ペダル保持${sustained}音。`,
  },
  en: {
    guide: "Guide",
    leftGuide: "Left-hand guide",
    rightGuide: "Right-hand guide",
    held: "Held",
    foreign: "Foreign",
    sustain: "Sustain",
    outside: "Input outside visible range",
    keyboard: (count: number, guide: number, held: number, foreign: number, sustained: number) =>
      `${count}-key piano keyboard. ${guide} guide, ${held} held, ${foreign} foreign, ${sustained} sustained notes.`,
  },
} as const;

export const PianoKeyboardVisualizer = memo(function PianoKeyboardVisualizer({
  minMidiNote,
  maxMidiNote,
  guideNotes,
  leftHandGuideNotes = [],
  rightHandGuideNotes = [],
  heldNotes,
  sustainedNotes,
  allowedPitchClasses,
  requiredPitchClasses: _requiredPitchClasses,
  guideBassNote,
  heldBassNote,
  showGuide,
  showCLabels,
  octaveConvention: _octaveConvention,
  accidentalStyle = "flat",
  matchState = "idle",
  language,
}: PianoKeyboardVisualizerProps) {
  const text = copy[language];
  const range = useMemo(
    () => ({ minMidiNote, maxMidiNote }),
    [maxMidiNote, minMidiNote],
  );
  const geometry = useMemo(() => createPianoKeyboardGeometry(range), [range]);
  const display = useMemo(
    () => createKeyboardDisplayState(
      heldNotes,
      sustainedNotes,
      showGuide ? guideNotes : [],
      allowedPitchClasses,
    ),
    [allowedPitchClasses, guideNotes, heldNotes, showGuide, sustainedNotes],
  );
  const guide = useMemo(() => new Set(display.guideNotes), [display.guideNotes]);
  const leftGuide = useMemo(() => new Set(leftHandGuideNotes), [leftHandGuideNotes]);
  const rightGuide = useMemo(() => new Set(rightHandGuideNotes), [rightHandGuideNotes]);
  const held = useMemo(() => new Set(display.heldNotes), [display.heldNotes]);
  const sustained = useMemo(() => new Set(display.sustainedNotes), [display.sustainedNotes]);
  const allowed = useMemo(
    () => new Set(allowedPitchClasses.map((pitchClass) => positiveModulo(pitchClass, 12))),
    [allowedPitchClasses],
  );
  const outside = useMemo(
    () => notesOutsideKeyboardRange([...display.heldNotes, ...display.sustainedNotes], range),
    [display.heldNotes, display.sustainedNotes, range],
  );
  const visibleKeys = geometry.keys.filter((key) => !key.black);
  const blackKeys = geometry.keys.filter((key) => key.black);
  const ariaLabel = text.keyboard(
    geometry.keys.length,
    display.guideNotes.length,
    display.heldNotes.length,
    display.foreignHeldNotes.length,
    display.sustainedNotes.length,
  );

  return (
    <div data-match-state={matchState}>
      <div className="relative overflow-x-auto border border-[var(--lv-border)] bg-[#09090b] p-2">
        {outside.below.length > 0 ? (
          <OutsideIndicator
            direction="left"
            label={text.outside}
            notes={outside.below}
            accidentalStyle={accidentalStyle}
          />
        ) : null}
        {outside.above.length > 0 ? (
          <OutsideIndicator
            direction="right"
            label={text.outside}
            notes={outside.above}
            accidentalStyle={accidentalStyle}
          />
        ) : null}
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox={`0 0 ${geometry.width} ${KEYBOARD_HEIGHT}`}
          width={geometry.width}
          height={KEYBOARD_HEIGHT}
          className="block h-[clamp(9rem,22vw,13rem)] max-w-none"
          style={{ minWidth: `${geometry.width}px` }}
          preserveAspectRatio="none"
        >
          <g data-key-layer="white">
            {visibleKeys.map((key) => (
              <PianoKey
                key={key.note}
                geometry={key}
                visualState={pianoKeyVisualState(key.note, {
                  guideNotes: guide,
                  heldNotes: held,
                  sustainedNotes: sustained,
                  allowedPitchClasses: allowed,
                })}
                showCLabel={showCLabels}
                guideBass={showGuide && guideBassNote === key.note}
                heldBass={heldBassNote === key.note}
                guideHand={showGuide
                  ? leftGuide.has(key.note)
                    ? "left"
                    : rightGuide.has(key.note)
                      ? "right"
                      : undefined
                  : undefined}
                accidentalStyle={accidentalStyle}
              />
            ))}
          </g>
          <g data-key-layer="black">
            {blackKeys.map((key) => (
              <PianoKey
                key={key.note}
                geometry={key}
                visualState={pianoKeyVisualState(key.note, {
                  guideNotes: guide,
                  heldNotes: held,
                  sustainedNotes: sustained,
                  allowedPitchClasses: allowed,
                })}
                showCLabel={showCLabels}
                guideBass={showGuide && guideBassNote === key.note}
                heldBass={heldBassNote === key.note}
                guideHand={showGuide
                  ? leftGuide.has(key.note)
                    ? "left"
                    : rightGuide.has(key.note)
                      ? "right"
                      : undefined
                  : undefined}
                accidentalStyle={accidentalStyle}
              />
            ))}
          </g>
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--lv-text-muted)]">
        {showGuide && (leftHandGuideNotes.length > 0 || rightHandGuideNotes.length > 0) ? (
          <>
            {leftHandGuideNotes.length > 0 ? (
              <Legend visualState="guide" label={text.leftGuide} guideHand="left" />
            ) : null}
            {rightHandGuideNotes.length > 0 ? (
              <Legend visualState="guide" label={text.rightGuide} guideHand="right" />
            ) : null}
          </>
        ) : showGuide ? (
          <Legend visualState="guide" label={text.guide} />
        ) : null}
        <Legend visualState="held-correct" label={text.held} />
        <Legend visualState="held-foreign" label={text.foreign} />
        <Legend visualState="sustained" label={text.sustain} />
      </div>
    </div>
  );
});

function OutsideIndicator({
  direction,
  label,
  notes,
  accidentalStyle,
}: {
  direction: "left" | "right";
  label: string;
  notes: readonly number[];
  accidentalStyle: NoteAccidentalStyle;
}) {
  return (
    <div
      data-outside-direction={direction}
      className={`pointer-events-none absolute top-3 z-10 border border-amber-300 bg-[#18181b]/95 px-2 py-1 text-xs text-amber-100 ${
        direction === "left" ? "left-3" : "right-3"
      }`}
    >
      {direction === "left" ? "← " : ""}
      {label}: {notes.map((note) => formatMidiNoteForDisplay(note, "fl-studio", accidentalStyle)).join(" · ")}
      {direction === "right" ? " →" : ""}
    </div>
  );
}

function Legend({
  visualState,
  label,
  guideHand,
}: {
  visualState: PianoKeyVisualState;
  label: string;
  guideHand?: "left" | "right";
}) {
  const className = visualState === "guide"
    ? guideHand === "right"
      ? "border-2 border-teal-200 bg-teal-300/30"
      : "border-2 border-teal-700 bg-teal-800/30"
    : visualState === "held-correct"
      ? "border-2 border-teal-100 bg-teal-300"
      : visualState === "held-foreign"
        ? "border-2 border-amber-100 bg-amber-300"
        : "border border-sky-200 bg-[repeating-linear-gradient(135deg,#0369a1_0_3px,#7dd3fc_3px_5px)]";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-3 w-3 ${className}`} />
      {label}
    </span>
  );
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
