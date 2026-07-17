// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeChordSymbol } from "../domain/chords";
import { createLiveChordStabilizerState, createLiveNoteState, emptyLiveChordDetection } from "../domain/liveMidi";
import { appCopy } from "../i18n";
import { defaultLiveMidiStore } from "../liveMidi/defaultLiveMidiStore";
import { LiveMidiMiniMode } from "./LiveMidiMiniMode";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  defaultLiveMidiStore.setState({
    notes: createLiveNoteState(),
    stabilizer: createLiveChordStabilizerState(),
    instant: emptyLiveChordDetection(),
    provisionalChord: undefined,
    confirmedChord: emptyLiveChordDetection(),
    history: [],
  });
  document.body.replaceChildren();
});

describe("LiveMidiMiniMode", () => {
  it("renders provisional chord text while notes and bass come from the immediate frame", async () => {
    const chord = makeChordSymbol(0, "maj");
    defaultLiveMidiStore.setState({
      instant: {
        kind: "chord",
        chord,
        alternatives: [],
        label: "C",
        notes: [60, 64, 67],
        noteNames: ["C", "E", "G"],
        bass: 60,
      },
      provisionalChord: {
        kind: "chord",
        chord,
        alternatives: [],
        label: "C",
        notes: [60, 64, 67],
        noteNames: ["C", "E", "G"],
        bass: 60,
      },
      confirmedChord: emptyLiveChordDetection(),
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => root.render(createElement(LiveMidiMiniMode, {
      copy: appCopy.en.liveMidi,
      onBack: vi.fn(),
    })));

    expect(container.textContent).toContain("C");
    expect(container.textContent).toContain("Notes: C · E · G");
    expect(container.textContent).toContain("Bass: C");

    await act(async () => {
      defaultLiveMidiStore.setState({
        instant: {
          kind: "notes",
          alternatives: [],
          label: "C · E",
          notes: [60, 64],
          noteNames: ["C", "E"],
          bass: 60,
        },
      });
    });
    expect(container.textContent).toContain("Notes: C · E");
    expect(container.textContent).toContain("Bass: C");

    await act(async () => root.unmount());
  });
});
