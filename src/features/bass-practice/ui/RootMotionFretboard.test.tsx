// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { ROOT_MOTION_GENERATOR_VERSION, ROOT_MOTION_MAX_ATTEMPTS, STANDARD_BASS_TUNINGS, generateRootMotionExercise } from "../domain";
import { RootMotionFretboard } from "./RootMotionFretboard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });

function eightNoteExercise(seed: string) {
  const generated = generateRootMotionExercise({
    generatorVersion: ROOT_MOTION_GENERATOR_VERSION, seed, level: 4, noteCount: 8, phraseLengthBeats: 16, tempo: 96,
    tuning: STANDARD_BASS_TUNINGS[4], stringCount: 4, fretRange: { min: 0, max: 12 }, pitchSpan: { minMidi: 28, maxMidi: 55 }, handedness: "right", maxAttempts: ROOT_MOTION_MAX_ATTEMPTS,
  });
  expect(generated.ok).toBe(true);
  if (!generated.ok) throw new Error(generated.error.message);
  return generated.exercise;
}

test("shows all eight roots in their ordered fretboard sequence", async () => {
  const exercise = eightNoteExercise("p519-06-fretboard");
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(<RootMotionFretboard exercise={exercise} handedness="right" language="ja" />));
  expect(container.querySelector("[data-testid='root-motion-fretboard-summary']")?.textContent).toContain("\u30b9\u30c6\u30c3\u30d7 8");
  expect(container.textContent).toContain("\u30eb\u30fc\u30c8\u306e\u9806\u756a");
  expect(Array.from(container.querySelectorAll("[data-root-motion-step-markers]")).some((marker) => marker.getAttribute("data-root-motion-step-markers")?.split("/").includes("8"))).toBe(true);
});

test("retains both real fingering positions when an eight-note chain changes physical location", async () => {
  const exercise = eightNoteExercise("continuity-0");
  const discontinuityIndex = exercise.fingering.findIndex((pair, index) => index > 0 && (
    exercise.fingering[index - 1]!.target.stringIndex !== pair.source.stringIndex
    || exercise.fingering[index - 1]!.target.fret !== pair.source.fret
  ));
  expect(discontinuityIndex).toBeGreaterThan(0);
  const previousTarget = exercise.fingering[discontinuityIndex - 1]!.target;
  const nextSource = exercise.fingering[discontinuityIndex]!.source;
  const sharedStep = String(discontinuityIndex + 1);

  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(<RootMotionFretboard exercise={exercise} handedness="right" language="en" />));
  const targetMarker = container.querySelector(`[data-root-motion-position="${previousTarget.stringIndex}:${previousTarget.fret}"]`);
  const sourceMarker = container.querySelector(`[data-root-motion-position="${nextSource.stringIndex}:${nextSource.fret}"]`);
  expect(targetMarker?.getAttribute("data-root-motion-step-markers")?.split("/")).toContain(sharedStep);
  expect(sourceMarker?.getAttribute("data-root-motion-step-markers")?.split("/")).toContain(sharedStep);
  const summary = container.querySelector("[data-testid='root-motion-fretboard-summary']")?.textContent;
  expect(summary).toContain(`Step ${sharedStep} target: string ${exercise.generatorSnapshot.tuning.length - previousTarget.stringIndex}, fret ${previousTarget.fret}.`);
  expect(summary).toContain(`Step ${sharedStep} source: string ${exercise.generatorSnapshot.tuning.length - nextSource.stringIndex}, fret ${nextSource.fret};`);
});