// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { generatedExercise } from "../domain/testFixtures";
import { STANDARD_BASS_TUNINGS } from "../domain";
import { DegreeFretboard } from "./DegreeFretboard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("DegreeFretboard", () => {
  test("keeps answer markers hidden until Hint 4", async () => {
    const container = await renderFretboard(0, 4, "right");
    expect(container.querySelector("[data-testid='degree-fretboard-summary']")?.textContent)
      .toContain("ヒント4まで非表示");
    expect(container.textContent).toContain("マーカーはヒント4で表示");
  });

  test("reveals text-equivalent markers at Hint 4", async () => {
    const container = await renderFretboard(4, 4, "right");
    const summary = container.querySelector("[data-testid='degree-fretboard-summary']")?.textContent ?? "";
    expect(summary).toContain("1番目");
    expect(summary).toContain("弦");
    expect(summary).toContain("フレット");
    expect(container.textContent).toContain("丸印は答えの候補位置");

    const degreeToggle = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Degree");
    const noteToggle = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent === "Note Name");
    expect(degreeToggle?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => noteToggle?.click());
    expect(noteToggle?.getAttribute("aria-pressed")).toBe("true");
    expect(degreeToggle?.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector("[role='group']")?.getAttribute("aria-label"))
      .toBe("フレットボード表示");
  });

  test("supports five strings and reverses the visual fret order for left-handed display", async () => {
    const container = await renderFretboard(4, 5, "left");
    expect(container.textContent).toContain("5弦");
    expect(container.textContent).toContain("左利き表示");
    const labels = Array.from(container.querySelectorAll("[aria-hidden='true'] > div"))
      .slice(1, 14)
      .map((node) => node.textContent?.trim());
    expect(labels[0]).toBe("12");
    expect(labels[labels.length - 1]).toBe("0");
  });
});

async function renderFretboard(
  hintLevel: 0 | 4,
  stringCount: 4 | 5,
  handedness: "right" | "left",
) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const exercise = generatedExercise({
    tuning: STANDARD_BASS_TUNINGS[stringCount],
    handedness,
  });
  await act(async () => root?.render(
    <DegreeFretboard
      exercise={exercise}
      handedness={handedness}
      hintLevel={hintLevel}
    />,
  ));
  return container;
}
