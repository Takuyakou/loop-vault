// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../../audio/playbackController";
import { parseChordLabel } from "../../domain/chords";
import type { VaultProgression } from "../../domain/chordDojo/collect";
import type { Task } from "../../domain/chordDojo/store";
import { GuidedPracticeView } from "./GuidedPracticeView";

/**
 * P23-35-fix-2: the adapter layer. The browser sees the same view, but the audition request
 * (notes and the length of each event) is only checkable here: a spy on the existing playback
 * controller. The expected notes and beats are literals of the fixture below, not recomputed from
 * `voiceChordForPreview`/`progressionTarget`.
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const occurrence = (eventId: string) => ({
  ideaId: "idea-fix2", blockId: "block-fix2", eventId,
  source: "saved" as const, voicingKey: `notes:${eventId}`,
});

/** Four authored cards with uneven lengths; the second one runs across a bar line. */
const progression: VaultProgression = {
  key: "vault:fix2-1",
  blockId: "block-fix2",
  ideaId: "idea-fix2",
  name: "手書きの進行",
  keyContext: "C",
  beatsPerBar: 4,
  chords: [
    { chord: parseChordLabel("Cmaj7")!, notes: [48, 55, 59, 64], beats: 2, source: occurrence("e0") },
    { chord: parseChordLabel("Cmaj7/E")!, notes: [52, 55, 59, 60], beats: 6, source: occurrence("e1") },
    { chord: parseChordLabel("Dm7")!, notes: [50, 57, 60, 65], beats: 4, source: occurrence("e2") },
    { chord: parseChordLabel("G7")!, notes: [55, 59, 62, 65], beats: 4, source: occurrence("e3") },
  ],
  chordBars: [1, 1, 2, 3],
  chordBeatRanges: [{ start: 0, end: 2 }, { start: 2, end: 8 }, { start: 8, end: 12 }, { start: 12, end: 16 }],
  legacyConfirmed: true,
  pinned: false,
  capturedAt: "2026-11-10T00:00:00.000Z",
};

const HERO = { kind: "progression", key: progression.key, review: false, roots: [0], seconds: 120 } as Task;

function renderGuide(task: Task = HERO) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<GuidedPracticeView material={{ task }} progressions={[progression]} bpm={80} settleMs={60} onChangeMaterial={() => undefined} onExit={() => undefined} />);
  });
  return { container, root };
}

const button = (container: ParentNode, testId: string) => {
  const element = container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`no ${testId}`);
  return element;
};

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("P23-35-fix-2 the guide's audition adapter", () => {
  it("asks the existing player for the whole range with the fixture's notes and beats", async () => {
    const play = vi.spyOn(playbackController, "play").mockResolvedValue(undefined);
    const { container, root } = renderGuide();
    try {
      expect(container.querySelector('[data-testid="guided-practice"]')).not.toBeNull();
      await click(button(container, "guided-listen"));
      expect(play).toHaveBeenCalledTimes(1);
      const [, request] = play.mock.calls[0]!;
      expect(request).toMatchObject({ type: "timeline", bpm: 80 });
      if (request.type !== "timeline") throw new Error("expected a timeline request");
      expect(request.timeline.map((event) => event.chord.label)).toEqual(["Cmaj7", "Cmaj7/E", "Dm7", "G7"]);
      expect(request.timeline.map((event) => event.durationBeats)).toEqual([2, 6, 4, 4]);
      expect(Object.values(request.explicitMidiNotesByEventId ?? {})).toEqual([
        [48, 55, 59, 64], [52, 55, 59, 60], [50, 57, 60, 65], [55, 59, 62, 65],
      ]);
    } finally {
      act(() => root.unmount());
    }
  });

  it("shows the authored pitches in ② and only counts the whole range as listened after it ends", async () => {
    vi.spyOn(playbackController, "play").mockImplementation(async (...args) => {
      // Finish the range immediately, as the real player does at its end.
      args[2]?.onEnded?.("completed");
    });
    const { container, root } = renderGuide();
    try {
      // ① hears the whole range; the mocked player reports its natural end.
      await click(button(container, "guided-listen"));
      await click(button(container, "guided-next"));
      const names = [...container.querySelectorAll('[data-testid^="guided-card-name-"]')].map((node) => node.textContent);
      const notes = [...container.querySelectorAll('[data-testid^="guided-card-notes-"]')].map((node) => node.textContent);
      expect(names).toEqual(["Cmaj7", "Cmaj7/E", "Dm7", "G7"]);
      expect(notes).toEqual(["48 55 59 64", "52 55 59 60", "50 57 60 65", "55 59 62 65"]);
      await click(button(container, "guided-next"));
      expect(container.querySelector('[data-testid="guided-hidden-note"]')).not.toBeNull();
      // P25 V1: no MIDI here, and the practice no longer says only that (the header and the Dojo home do).
      expect(container.querySelector('[data-testid="guided-midi-off"]')).toBeNull();
      await click(button(container, "guided-next"));
      await click(button(container, "guided-next"));
      await click(button(container, "guided-next"));
      expect(container.querySelector('[data-testid="guided-result"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="guided-result-listen"]')?.textContent).toContain("取り組み済み");
    } finally {
      act(() => root.unmount());
    }
  });
});
