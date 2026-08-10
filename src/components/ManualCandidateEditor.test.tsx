// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { appCopy, progressionEditorCopy, quickChordEditorCopy } from "../i18n";
import { labelFromSymbol, makeChordSymbol } from "../domain/chords";
import { parseTextProgression } from "../domain/textProgression";
import {
  createTextProgressionDraft,
  textProgressionDraftEditable,
  textProgressionDraftTimeline,
} from "../domain/textProgressionDraft";
import type { EditableProgression } from "../domain/progressionEditing";
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

interface EditorOptions {
  timeline?: readonly ChordTimelineItem[];
  totalBars?: number;
  allowRangeAdjustment?: boolean;
  allowStructuralEdits?: boolean;
  showConfidenceReview?: boolean;
  createEditable?: (draft: ManualCandidateDraft) => EditableProgression;
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

async function mount(draft: ManualCandidateDraft, options: EditorOptions = {}): Promise<Harness> {
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
          timeline={options.timeline ?? timeline}
          totalBars={options.totalBars ?? TOTAL_BARS}
          copy={appCopy.ja}
          language="ja"
          {...(options.allowRangeAdjustment === undefined ? {} : { allowRangeAdjustment: options.allowRangeAdjustment })}
          {...(options.allowStructuralEdits === undefined ? {} : { allowStructuralEdits: options.allowStructuralEdits })}
          {...(options.showConfidenceReview === undefined ? {} : { showConfidenceReview: options.showConfidenceReview })}
          {...(options.createEditable === undefined ? {} : { createEditable: options.createEditable })}
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
  it("shows whether the Draft came from an automatic candidate", async () => {
    const draft: ManualCandidateDraft = {
      ...draftOf(14, 17),
      source: {
        type: "automatic-candidate",
        candidateId: "candidate-1",
        patternId: "pattern-1",
      },
    };
    const harness = await mount(draft);

    expect(harness.container.querySelector('[data-testid="draft-source"]')?.textContent)
      .toBe("自動候補から作成");
  });

  it("labels a text-derived Draft without claiming a manual MIDI range", async () => {
    const draft: ManualCandidateDraft = {
      ...draftOf(14, 17),
      source: { type: "text-progression" },
    };
    const harness = await mount(draft);

    expect(harness.container.querySelector('[data-testid="draft-source"]')?.textContent)
      .toBe("\u30c6\u30ad\u30b9\u30c8\u5165\u529b\u304b\u3089\u4f5c\u6210");
    const sourceChip = harness.container.querySelector<HTMLElement>('[data-testid="capture-voicing-source-chip"]');
    expect(sourceChip?.getAttribute("title")).toContain("\u30c6\u30ad\u30b9\u30c8\u5165\u529b");
    expect(sourceChip?.getAttribute("title")).not.toContain("MIDI");
  });
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
    await harness.render(harness.onChange.mock.calls[0][0] as ManualCandidateDraft);
    expect(action(harness, "undo").disabled).toBe(false);
  });

  it("undoes back to the original chords", async () => {
    const draft = draftOf(14, 17);
    const harness = await mount(draft);
    await click(action(harness, "split"));
    await harness.render(harness.onChange.mock.calls[0][0] as ManualCandidateDraft);
    await click(action(harness, "undo"));

    const undone = harness.onChange.mock.calls[harness.onChange.mock.calls.length - 1][0] as ManualCandidateDraft;
    expect(undone.events).toHaveLength(4);
    expect(undone.repairOperations.some((operation) => operation.type === "split-event")).toBe(false);
  });

  it("redoes what was undone", async () => {
    const harness = await mount(draftOf(14, 17));
    await click(action(harness, "split"));
    await harness.render(harness.onChange.mock.calls[0][0] as ManualCandidateDraft);
    await click(action(harness, "undo"));
    const undone: ManualCandidateDraft =
      harness.onChange.mock.calls[harness.onChange.mock.calls.length - 1][0];
    await harness.render(undone);
    await click(action(harness, "redo"));

    expect((harness.onChange.mock.calls[harness.onChange.mock.calls.length - 1][0] as ManualCandidateDraft).events)
      .toHaveLength(5);
  });

  it("shows the shared history and jumps back to the initial state", async () => {
    const harness = await mount(draftOf(14, 17));
    await click(action(harness, "split"));
    const changed: ManualCandidateDraft = harness.onChange.mock.calls[0][0];
    await harness.render(changed);

    const history = harness.container.querySelector('[data-testid="capture-edit-history"]')!;
    expect(history.querySelectorAll("button")).toHaveLength(2);
    await click(history.querySelector<HTMLButtonElement>("button")!);

    const jumped: ManualCandidateDraft =
      harness.onChange.mock.calls[harness.onChange.mock.calls.length - 1][0];
    expect(jumped.events).toHaveLength(4);
    expect(jumped.historyIndex).toBe(-1);
  });

  it("uses Ctrl+Z for Draft undo but leaves native input undo alone", async () => {
    const harness = await mount(draftOf(14, 17));
    await click(action(harness, "split"));
    const changed: ManualCandidateDraft = harness.onChange.mock.calls[0][0];
    await harness.render(changed);

    action(harness, "undo").focus();
    const beforeUndo = harness.onChange.mock.calls.length;
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
    })));
    expect(harness.onChange.mock.calls.length).toBe(beforeUndo + 1);
    const undoCall = harness.onChange.mock.calls[harness.onChange.mock.calls.length - 1];
    expect((undoCall?.[0] as ManualCandidateDraft).events)
      .toHaveLength(4);

    await harness.render(changed);
    const input = document.createElement("input");
    harness.container.querySelector("section")?.append(input);
    input.focus();
    const beforeNativeUndo = harness.onChange.mock.calls.length;
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
    })));
    expect(harness.onChange.mock.calls.length).toBe(beforeNativeUndo);
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
describe("text-derived draft restrictions", () => {
  it("hides structural actions, opens the quick replacement editor, and keeps a valid replacement saveable", async () => {
    const result = parseTextProgression("| Cmaj7 Dm7 Em7 Fmaj7 |");
    const draft = createTextProgressionDraft({ result, draftId: "text-grammar-lock" });
    const harness = await mount(draft, {
      timeline: textProgressionDraftTimeline(draft),
      totalBars: draft.lengthBars,
      allowRangeAdjustment: false,
      allowStructuralEdits: false,
      showConfidenceReview: false,
      createEditable: textProgressionDraftEditable,
    });

    for (const name of ["split", "merge", "insert", "delete"]) {
      expect(harness.container.querySelector(`button[data-action="${name}"]`)).toBeNull();
    }
    expect(harness.container.querySelectorAll("button[data-nudge]")).toHaveLength(0);
    expect(harness.container.querySelector("[data-draft-boundary-handles]")).toBeNull();
    expect(harness.container.querySelector("[data-chord-card]")?.textContent)
      .not.toContain(progressionEditorCopy.ja.review);

    const quickEdit = harness.container.querySelector<HTMLButtonElement>(
      `button[aria-label="${progressionEditorCopy.ja.quickEdit}"]`,
    );
    if (!quickEdit) throw new Error("Expected a Quick Editor trigger for text Draft replacement.");
    await click(quickEdit);
    const quickEditor = document.querySelector<HTMLElement>("[data-quick-chord-editor]");
    if (!quickEditor) throw new Error("Expected the Quick Editor to open for text Draft replacement.");
    const nextRoot = quickEditor.querySelector<HTMLButtonElement>(
      `button[aria-label="${quickChordEditorCopy.ja.nextRoot}"]`,
    );
    if (!nextRoot) throw new Error("Expected the Quick Editor root control.");
    await click(nextRoot);
    const apply = quickEditor.querySelector<HTMLButtonElement>("button.lv-button-primary");
    if (!apply) throw new Error("Expected the Quick Editor apply control.");
    await click(apply);

    const edited = harness.onChange.mock.calls[harness.onChange.mock.calls.length - 1]?.[0] as ManualCandidateDraft;
    expect(edited).toBeDefined();
    expect(edited.events.map((event) => event.durationBeats)).toEqual([1, 1, 1, 1]);
    await harness.render(edited);
    expect(action(harness, "save").disabled).toBe(false);
    await click(action(harness, "save"));
    expect(harness.onSave).toHaveBeenCalledWith(expect.objectContaining({
      source: { type: "text-progression" },
    }));
  });
});
