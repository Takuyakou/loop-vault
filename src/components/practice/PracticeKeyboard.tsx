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
  DojoPracticeLevel,
  PracticeMatchState,
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
  level: DojoPracticeLevel;
  language: AppLanguage;
  accidentalStyle?: NoteAccidentalStyle;
  matchState?: PracticeMatchState;
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
  const missingPitchClasses = requiredPitchClasses.filter(
    (pitchClass) => !heldPitchClasses.has(positivePitchClass(pitchClass)),
  );
  const foreignNotes = currentHeldNotes.filter(
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
        allowedPitchClasses={allowedPitchClasses}
        requiredPitchClasses={requiredPitchClasses}
        guideBassNote={guideBassNote}
        heldBassNote={heldBassNote}
        showGuide={level === 1}
        showCLabels
        octaveConvention="fl-studio"
        accidentalStyle={accidentalStyle}
        matchState={visualMatchState}
        language={language}
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
}: {
  accidentalStyle: NoteAccidentalStyle;
  foreignCount: number;
  guideNotes: readonly number[];
  heldNotes: readonly number[];
  language: AppLanguage;
  level: DojoPracticeLevel;
  matchState: PracticeMatchState;
  missingPitchClasses: readonly number[];
}): string {
  const text = copy[language];
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

  return `${text.input}: ${text.notes(currentHeldNotes.length)}${
    missingPitchClasses.length > 0
      ? ` · ${text.missing}: ${text.notes(missingPitchClasses.length)}`
      : ""
  }`;
}

function positivePitchClass(note: number): number {
  return ((note % 12) + 12) % 12;
}
