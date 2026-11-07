import { memo, useMemo } from "react";
import { useStore } from "zustand";
import {
  formatMidiNoteForDisplay,
  PianoKeyboardVisualizer,
  type KeyboardRange,
  type KeyboardOctaveConvention,
  type NoteAccidentalStyle,
} from "../music-keyboard";
import { heldNotes, sustainedNotes } from "../../domain/liveMidi";
import type {
  PracticeMatchState,
  PracticeSessionLevel,
} from "../../domain/practice";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";

interface PracticeKeyboardProps {
  range: KeyboardRange;
  octaveConvention?: KeyboardOctaveConvention;
  guideNotes: readonly number[];
  referenceBassNote?: number;
  leftHandGuideNotes?: readonly number[];
  rightHandGuideNotes?: readonly number[];
  allowedPitchClasses: readonly number[];
  requiredPitchClasses: readonly number[];
  level: PracticeSessionLevel;
  accidentalStyle?: NoteAccidentalStyle;
  matchState?: PracticeMatchState;
  concealNoteNames?: boolean;
  interactionMode?: "practice" | "neutral-monitor";
  centerWhenFitted?: boolean;
  fingerLabels?: ReadonlyMap<number, string>;
  keyboardLayout?: "default" | "wide-61" | "wide-88";
  compactSummary?: boolean;
  hideLegend?: boolean;
  appearance?: "default" | "dojo";
  colorGuideHands?: boolean;
  markScale?: number;
  /** Dojo appearance: the height the keys are drawn at, in pixels (128 when not given). */
  dojoHeight?: number;
}

const copy = {
  ja: {
    input: "入力",
    missing: "あと",
    matched: "一致",
    foreign: "構成外音があります",
    notes: (count: number) => `${count}音`,
  },
} as const;
const ALL_PITCH_CLASSES = Object.freeze(Array.from({ length: 12 }, (_, index) => index));

export const PracticeKeyboard = memo(function PracticeKeyboard({
  range,
  octaveConvention = "fl-studio",
  guideNotes,
  referenceBassNote,
  leftHandGuideNotes = [],
  rightHandGuideNotes = [],
  allowedPitchClasses,
  requiredPitchClasses,
  level,
  accidentalStyle = "flat",
  matchState = "empty",
  concealNoteNames = false,
  interactionMode = "practice",
  centerWhenFitted = false,
  fingerLabels,
  keyboardLayout = "default",
  compactSummary = false,
  hideLegend = false,
  appearance = "default",
  colorGuideHands = false,
  markScale = 1,
  dojoHeight,
}: PracticeKeyboardProps) {
  const liveNoteState = useStore(defaultLiveMidiStore, (state) => state.notes);
  const currentHeldNotes = useMemo(() => heldNotes(liveNoteState), [liveNoteState]);
  const currentSustainedNotes = useMemo(
    () => sustainedNotes(liveNoteState),
    [liveNoteState],
  );
  const heldPitchClasses = useMemo(
    () => new Set(currentHeldNotes.map(positivePitchClass)),
    [currentHeldNotes],
  );
  const missingPitchClasses = interactionMode === "neutral-monitor" ? [] : requiredPitchClasses.filter(
    (pitchClass) => !heldPitchClasses.has(positivePitchClass(pitchClass)),
  );
  const foreignNotes = interactionMode === "neutral-monitor" ? [] : currentHeldNotes.filter(
    (note) => !allowedPitchClasses.includes(positivePitchClass(note)),
  );
  const heldBassNote = currentHeldNotes[0];
  const displayGuideNotes = useMemo(() => referenceBassNote === undefined ? guideNotes
    : [...new Set([...guideNotes, referenceBassNote])], [guideNotes, referenceBassNote]);
  const guideBassNote = referenceBassNote ?? (guideNotes.length > 0 ? Math.min(...guideNotes) : undefined);
  const visualMatchState = matchState === "empty" ? "idle" : matchState;

  const compactWideLayout = keyboardLayout !== "default";
  return (
    <div className={compactWideLayout ? "min-w-0" : ""}>
      <PianoKeyboardVisualizer
        minMidiNote={range.minMidiNote}
        maxMidiNote={range.maxMidiNote}
        guideNotes={displayGuideNotes}
        leftHandGuideNotes={leftHandGuideNotes}
        rightHandGuideNotes={rightHandGuideNotes}
        heldNotes={currentHeldNotes}
        sustainedNotes={currentSustainedNotes}
        allowedPitchClasses={interactionMode === "neutral-monitor" ? ALL_PITCH_CLASSES : allowedPitchClasses}
        requiredPitchClasses={interactionMode === "neutral-monitor" ? [] : requiredPitchClasses}
        guideBassNote={guideBassNote}
        heldBassNote={heldBassNote}
        showGuide={level === 1}
        showCLabels
        octaveConvention={octaveConvention}
        accidentalStyle={accidentalStyle}
        matchState={visualMatchState}
        concealNoteNames={concealNoteNames}
        interactionMode={interactionMode}
        centerWhenFitted={centerWhenFitted}
        fingerLabels={fingerLabels}
        layout={keyboardLayout}
        hideLegend={hideLegend}
        appearance={appearance}
        colorGuideHands={colorGuideHands}
        markScale={markScale}
        {...(dojoHeight === undefined ? {} : { dojoHeight })}
      />
      {level === 1 && referenceBassNote !== undefined ? (
        <p className={`${compactWideLayout ? "mt-1" : "mt-2"} text-xs text-[var(--lv-text-muted)]`} data-testid="slash-bass-reference">
          {"BASS：独立したベース参照（左手の練習対象外）"}
          {` · ${formatMidiNoteForDisplay(referenceBassNote, "fl-studio", accidentalStyle)}`}
        </p>
      ) : null}
      <p
        className={`${compactSummary ? "sr-only" : compactWideLayout ? "mt-1 min-h-4 text-xs" : "mt-3 min-h-5 text-sm"} ${
          foreignNotes.length > 0 ? "text-amber-200" : "text-[var(--lv-text-muted)]"
        }`}
        aria-live="polite"
      >
        {inputSummary({
          octaveConvention,
          accidentalStyle,
          foreignCount: foreignNotes.length,
          guideNotes,
          heldNotes: currentHeldNotes,
          level,
          matchState,
          missingPitchClasses,
          neutralMonitor: interactionMode === "neutral-monitor",
        })}
      </p>
    </div>
  );
});

function inputSummary({
  octaveConvention,
  accidentalStyle,
  foreignCount,
  guideNotes,
  heldNotes: currentHeldNotes,
  level,
  matchState,
  missingPitchClasses,
  neutralMonitor,
}: {
  octaveConvention: KeyboardOctaveConvention;
  accidentalStyle: NoteAccidentalStyle;
  foreignCount: number;
  guideNotes: readonly number[];
  heldNotes: readonly number[];
  level: PracticeSessionLevel;
  matchState: PracticeMatchState;
  missingPitchClasses: readonly number[];
  neutralMonitor: boolean;
}): string {
  const text = copy.ja;
  if (neutralMonitor) {
    const input = currentHeldNotes.length > 0
      ? currentHeldNotes
        .map((note) => formatMidiNoteForDisplay(note, octaveConvention, accidentalStyle))
        .join(" · ")
      : "-";
    return `${text.input}: ${input}`;
  }
  if (foreignCount > 0 || matchState === "wrong") return text.foreign;
  if (matchState === "match") return text.matched;

  if (level === 1) {
    const input = currentHeldNotes.length > 0
      ? currentHeldNotes
        .map((note) => formatMidiNoteForDisplay(note, octaveConvention, accidentalStyle))
        .join(" · ")
      : "-";
    const missing = missingPitchClasses
      .map((pitchClass) => guideNotes.find(
        (note) => positivePitchClass(note) === positivePitchClass(pitchClass),
      ))
      .filter((note): note is number => note !== undefined)
      .map((note) => formatMidiNoteForDisplay(note, octaveConvention, accidentalStyle));
    return `${text.input}: ${input}${
      missing.length > 0 ? ` · ${text.missing}: ${missing.join(" · ")}` : ""
    }`;
  }

  if (level >= 4) {
    return `${text.input}: ${text.notes(currentHeldNotes.length)}`;
  }

  return `${text.input}: ${text.notes(currentHeldNotes.length)}${
    missingPitchClasses.length > 0
      ? ` · ${text.missing}: ${text.notes(missingPitchClasses.length)}`
      : ""
  }`;
}

function positivePitchClass(note: number): number {
  return ((note % 12) + 12) % 12;
}
