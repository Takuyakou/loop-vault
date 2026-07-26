// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { appCopy } from "../i18n";
import { labelFromSymbol, makeChordSymbol } from "../domain/chords";
import type { ChordTimelineItem } from "../domain/types";
import { createManualDraft, type ManualCandidateDraft } from "../domain/midi/manualDraft";
import { ManualCandidateEditor } from "./ManualCandidateEditor";

/**
 * The draft editor.
 *
 * The chord operations are the existing editor's, tested where they live; what
 * matters here is that they are reachable from a draft, that moving the range
 * asks before losing work, and that a draft which cannot be read back cannot be
 * saved.
 */
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function chord(root: number) {
  const symbol = makeChordSymbol(root, "maj7", []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

const TOTAL_BARS = 108;
const timeline: ChordTimelineItem[] = Array.from({ length: TOTAL_BARS }, (_unused, index) => ({
  bar: index + 1,
  beat: 1,
  durationBeats: 4,
  chord: chord((index * 5) % 12),
  confidence: 0.9,
  alternatives: [],
  warnings: [],
}));

function draftOf(startBar: number, endBar: number): ManualCandidateDraft {
  return createManualDraft({
    timeline,
    range: { startBar, startBeat: 1, endBar, endBeat: 4 },
    now: "2026-07-26T00:00:00.000Z",
  });
}

interface Harness {
  container: HTMLElement;
  root: Root;
  onChange: ReturnType<typeof vi.fn>;
  onDiscard: ReturnType<typeof vi.fn>;
  onReselect: ReturnType<typeof vi.fn>;
  onSave: ReturnType<typeof vi.fn>;
  render(draft: ManualCandidateDraft): Promise<void>;
}

async function mount(draft: ManualCandidateDraft): Promise<Harness> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onChange = vi.fn();
  const onDiscard = vi.fn();
  const onReselect = vi.fn();
  const onSave = vi.fn();
  const harness: Harness = {
    container, root, onChange, onDiscard, onReselect, onSave,
    async render(next) {
      await act(async () => root.render(
        <ManualCandidateEditor
          draft={next}
          timeline={timeline}
          totalBars={TOTAL_BARS}
          copy={appCopy.ja}
          language="ja"
          onChange={onChange}
          onDiscard={onDiscard}
          onReselect={onReselect}
          onSave={onSave}
        />,
      ));
    },
  };
  await harness.render(draft);
  return harness;
}

const action = (harness: Harness, name: string) => harness.container
  .querySelector<HTMLButtonElement>(`button[data-action="${name}"]`)!;
const nudge = (harness: Harness, name: string) => harness.container
  .querySelector<HTMLButtonElement>(`button[data-nudge="${name}"]`)!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); };

describe("opening a draft in the editor", () => {
  it("shows the range, the length and that it is unsaved", async () => {
    const harness = await mount(draftOf(14, 32));

    expect(harness.container.textContent).toContain("14小節1拍目 〜 32小節4拍目");
    expect(harness.container.textContent).toContain("19小節");
    expect(harness.container.textContent).toContain("未保存");
  });

  it("offers both edges in both units and both directions", async () => {
    const harness = await mount(draftOf(14, 32));

    expect(harness.container.querySelectorAll("button[data-nudge]")).toHaveLength(8);
  });

  it("lets the user go back to the timeline", async () => {
    const harness = await mount(draftOf(14, 32));
    await click(harness.container.querySelectorAll<HTMLButtonElement>("button")[8]);

    expect(harness.onReselect).toHaveBeenCalled();
  });
});

describe("moving the range", () => {
  it("extends the end by a bar without asking when nothing has been edited", async () => {
    const harness = await mount(draftOf(14, 32));
    await click(nudge(harness, "end-bar-1"));

    const next = harness.onChange.mock.calls[0][0] as ManualCandidateDraft;
    expect(next.selectedRange.endBar).toBe(33);
    expect(next.lengthBars).toBe(20);
  });

  it("trims the start by a beat", async () => {
    const harness = await mount(draftOf(14, 32));
    await click(nudge(harness, "start-beat-1"));

    const next = harness.onChange.mock.calls[0][0] as ManualCandidateDraft;
    expect(next.selectedRange.startBeat).toBe(2);
  });

  it("asks before losing chord edits", async () => {
    const harness = await mount({ ...draftOf(14, 32), isDirty: true });
    await click(nudge(harness, "end-bar-1"));

    // Neither answer is safe to assume: keeping an edit can put it in a bar the
    // new range has no room for, and discarding throws away the user's work.
    expect(harness.container.querySelector('[role="alertdialog"]')).toBeTruthy();
    expect(harness.onChange).not.toHaveBeenCalled();

    await click([...harness.container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "編集を残す")!);
    expect(harness.onChange).toHaveBeenCalled();
  });

  it("can be cancelled", async () => {
    const harness = await mount({ ...draftOf(14, 32), isDirty: true });
    await click(nudge(harness, "end-bar-1"));
    await click([...harness.container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === appCopy.ja.common.cancel)!);

    expect(harness.container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(harness.onChange).not.toHaveBeenCalled();
  });

  it("leaves the draft alone when the new range holds nothing", async () => {
    const harness = await mount(draftOf(105, 108));
    // Pushing the end past the last bar clamps rather than emptying the draft.
    for (let press = 0; press < 6; press += 1) await click(nudge(harness, "end-bar-1"));

    expect(harness.container.textContent).toContain("小節");
  });
});

describe("chord operations", () => {
  it("offers split, merge, insert, delete, undo and redo", async () => {
    const harness = await mount(draftOf(14, 17));

    for (const name of ["split", "merge", "insert", "delete", "undo", "redo"]) {
      expect(action(harness, name)).toBeTruthy();
    }
  });

  it("splits the selected chord", async () => {
    const harness = await mount(draftOf(14, 17));
    await click(action(harness, "split"));

    const next = harness.onChange.mock.calls[0][0] as ManualCandidateDraft;
    expect(next.events).toHaveLength(5);
    expect(next.isDirty).toBe(true);
    expect(next.repairOperations.some((operation) => operation.type === "split-event")).toBe(true);
  });

  it("merges the selected chord with the next one", async () => {
    const harness = await mount(draftOf(14, 17));
    await click(action(harness, "merge"));

    const next = harness.onChange.mock.calls[0][0] as ManualCandidateDraft;
    expect(next.events).toHaveLength(3);
    expect(next.repairOperations.some((operation) => operation.type === "merge-events")).toBe(true);
  });

  it("deletes the selected chord", async () => {
    const harness = await mount(draftOf(14, 17));
    await click(action(harness, "delete"));

    expect((harness.onChange.mock.calls[0][0] as ManualCandidateDraft).events).toHaveLength(3);
  });

  it("starts with undo and redo unavailable and enables undo after an edit", async () => {
    const harness = await mount(draftOf(14, 17));
    expect(action(harness, "undo").disabled).toBe(true);
    expect(action(harness, "redo").disabled).toBe(true);

    await click(action(harness, "split"));
    expect(action(harness, "undo").disabled).toBe(false);
  });

  it("undoes back to the original chords", async () => {
    const draft = draftOf(14, 17);
    const harness = await mount(draft);
    await click(action(harness, "split"));
    await click(action(harness, "undo"));

    const undone = harness.onChange.mock.calls[harness.onChange.mock.calls.length - 1][0] as ManualCandidateDraft;
    expect(undone.events).toHaveLength(4);
    expect(undone.repairOperations.some((operation) => operation.type === "undo")).toBe(true);
  });

  it("redoes what was undone", async () => {
    const harness = await mount(draftOf(14, 17));
    await click(action(harness, "split"));
    await click(action(harness, "undo"));
    await click(action(harness, "redo"));

    expect((harness.onChange.mock.calls[harness.onChange.mock.calls.length - 1][0] as ManualCandidateDraft).events)
      .toHaveLength(5);
  });
});

describe("validation before saving", () => {
  it("allows saving a clean draft", async () => {
    const harness = await mount(draftOf(14, 32));
    expect(action(harness, "save").disabled).toBe(false);

    await click(action(harness, "save"));
    expect(harness.onSave).toHaveBeenCalled();
  });

  it("blocks saving a chord with no length and says which one", async () => {
    const draft = draftOf(14, 17);
    draft.events[1] = { ...draft.events[1], durationBeats: 0 };
    const harness = await mount(draft);

    expect(action(harness, "save").disabled).toBe(true);
    expect(harness.container.textContent).toContain("長さがありません");
  });

  it("warns about a gap but still allows saving", async () => {
    const draft = draftOf(14, 17);
    draft.events[1] = { ...draft.events[1], durationBeats: 2 };
    const harness = await mount(draft);

    expect(harness.container.textContent).toContain("空きがあります");
    expect(action(harness, "save").disabled).toBe(false);
  });

  it("discards on request", async () => {
    const harness = await mount(draftOf(14, 32));
    await click(action(harness, "discard"));

    expect(harness.onDiscard).toHaveBeenCalled();
  });
});
