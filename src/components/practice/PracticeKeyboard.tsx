import { memo, useMemo } from "react";
import { useStore } from "zustand";
import {
  formatMidiNoteForDisplay,
  PianoKeyboardVisualizer,
  type KeyboardRange,
  type NoteAccidentalStyle,
} from "../music-keyboard";
import { heldNotes, sustainedNotes } from "../../domain/liveMidi";
import type {
  PracticeMatchState,
  PracticeSessionLevel,
} from "../../domain/practice";
import type { AppLanguage } from "../../domain/types";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";

interface PracticeKeyboardProps {
  range: KeyboardRange;
  guideNotes: readonly number[];
  leftHandGuideNotes?: readonly number[];
  rightHandGuideNotes?: readonly number[];
  allowedPitchClasses: readonly number[];
  requiredPitchClasses: readonly number[];
  level: PracticeSessionLevel;
  language: AppLanguage;
  accidentalStyle?: NoteAccidentalStyle;
  matchState?: PracticeMatchState;
  concealNoteNames?: boolean;
  interactionMode?: "practice" | "neutral-monitor";
  centerWhenFitted?: boolean;
}

const copy = {
  ja: {
    input: "入力",
    missing: "あと",
    matched: "一致",
    foreign: "構成外音があります",
    notes: (count: number) => `${count}音`,
  },
  en: {
    input: "Input",
    missing: "Missing",
    matched: "Matched",
    foreign: "Foreign note detected",
    notes: (count: number) => `${count} notes`,
  },
} as const;
const ALL_PITCH_CLASSES = Object.freeze(Array.from({ length: 12 }, (_, index) => index));

export const PracticeKeyboard = memo(function PracticeKeyboard({
  range,
  guideNotes,
  leftHandGuideNotes = [],
  rightHandGuideNotes = [],
  allowedPitchClasses,
  requiredPitchClasses,
  level,
  language,
  accidentalStyle = "flat",
  matchState = "empty",
  concealNoteNames = false,
  interactionMode = "practice",
  centerWhenFitted = false,
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
  const guideBassNote = guideNotes.length > 0 ? Math.min(...guideNotes) : undefined;
  const visualMatchState = matchState === "empty" ? "idle" : matchState;

  return (
    <div>
      <PianoKeyboardVisualizer
        minMidiNote={range.minMidiNote}
        maxMidiNote={range.maxMidiNote}
        guideNotes={guideNotes}
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
        octaveConvention="fl-studio"
        accidentalStyle={accidentalStyle}
        matchState={visualMatchState}
        language={language}
        concealNoteNames={concealNoteNames}
        interactionMode={interactionMode}
        centerWhenFitted={centerWhenFitted}
      />
      <p
        className={`mt-3 min-h-5 text-sm ${
          foreignNotes.length > 0 ? "text-amber-200" : "text-[var(--lv-text-muted)]"
        }`}
        aria-live="polite"
      >
        {inputSummary({
          accidentalStyle,
          foreignCount: foreignNotes.length,
          guideNotes,
          heldNotes: currentHeldNotes,
          language,
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
  accidentalStyle,
  foreignCount,
  guideNotes,
  heldNotes: currentHeldNotes,
  language,
  level,
  matchState,
  missingPitchClasses,
  neutralMonitor,
}: {
  accidentalStyle: NoteAccidentalStyle;
  foreignCount: number;
  guideNotes: readonly number[];
  heldNotes: readonly number[];
  language: AppLanguage;
  level: PracticeSessionLevel;
  matchState: PracticeMatchState;
  missingPitchClasses: readonly number[];
  neutralMonitor: boolean;
}): string {
  const text = copy[language];
  if (neutralMonitor) {
    const input = currentHeldNotes.length > 0
      ? currentHeldNotes
        .map((note) => formatMidiNoteForDisplay(note, "fl-studio", accidentalStyle))
        .join(" · ")
      : "-";
    return `${text.input}: ${input}`;
  }
  if (foreignCount > 0 || matchState === "wrong") return text.foreign;
  if (matchState === "match") return text.matched;

  if (level === 1) {
    const input = currentHeldNotes.length > 0
      ? currentHeldNotes
        .map((note) => formatMidiNoteForDisplay(note, "fl-studio", accidentalStyle))
        .join(" · ")
      : "-";
    const missing = missingPitchClasses
      .map((pitchClass) => guideNotes.find(
        (note) => positivePitchClass(note) === positivePitchClass(pitchClass),
      ))
      .filter((note): note is number => note !== undefined)
      .map((note) => formatMidiNoteForDisplay(note, "fl-studio", accidentalStyle));
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
