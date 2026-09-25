// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { NextMovePreview } from "./ProgressionVoicingPracticeView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps ten fixed fingers while KEEP has a continuation band and empty slots show only their ID", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<NextMovePreview
      moves={[
        { hand: "left", finger: 5, from: 48, to: 48, semitones: 0, kind: "KEEP", estimated: false },
        { hand: "right", finger: 1, from: 60, to: 65, semitones: 5, kind: "MEDIUM", estimated: false },
        { hand: "right", finger: 2, to: 67, kind: "ADD", estimated: false },
      ]}
      loopWrap={false}
      hasNext
      accidentalStyle="sharp"
      language="ja"
    />));
    const groups = host.querySelectorAll("[data-testid='voicing-loop-next-move-hand-group']");
    expect(groups).toHaveLength(2);
    expect(groups[0]!.querySelectorAll("[data-testid='voicing-loop-finger-slot']")).toHaveLength(5);
    expect(groups[1]!.querySelectorAll("[data-testid='voicing-loop-finger-slot']")).toHaveLength(5);
    const keep = host.querySelector("[data-strength='KEEP']")!;
    expect(keep.getAttribute("data-finger")).toBe("L5");
    expect(keep.querySelector("[data-testid='voicing-loop-keep-band']")).not.toBeNull();
    expect(keep.getAttribute("aria-label")).toContain("押さえたまま");
    expect(keep.textContent).toContain("C4");
    const empty = host.querySelector("[data-strength='EMPTY']")!;
    expect(empty.textContent).toBe(empty.getAttribute("data-finger"));
    expect(empty.querySelectorAll("span")).toHaveLength(1);
    expect(groups[0]!.querySelector("[data-testid='voicing-loop-next-move-summary']")?.textContent).toContain("左手そのまま");
    expect(groups[1]!.querySelector("[data-testid='voicing-loop-next-move-summary']")?.textContent).toContain("右手");
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
