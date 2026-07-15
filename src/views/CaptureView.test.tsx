// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChordTimelineItem, MidiProgressionAnalysis, ProgressionBlockCandidate } from "../domain/types";
import { makeIdea } from "../domain/testFactory";
import { appCopy } from "../i18n";
import { CaptureView, isEditableKeyboardTarget, isMidiFileName, ProgressionCandidateCard, ProgressionSaveDialog, TimelineDetails } from "./CaptureView";

const feedbackSpies = vi.hoisted(() => ({
  append: vi.fn(async () => undefined),
}));

vi.mock("../storage/analysisFeedbackStorage", () => ({
  appendAnalysisFeedback: feedbackSpies.append,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function chord(label: string, bar: number): ChordTimelineItem {
  return {
    bar,
    beat: 1,
    durationBeats: 4,
    chord: {
      root: 0,
      quality: "maj7",
      tensions: [],
      label,
    },
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  };
}

function candidate(overrides: Partial<ProgressionBlockCandidate> = {}): ProgressionBlockCandidate {
  return {
    id: "candidate-1",
    startBar: 1,
    endBar: 4,
    lengthBars: 4,
    chords: [chord("Cmaj7", 1), chord("Am7", 2)],
    summaryText: "main - intro-like",
    confidence: 0.95,
    labels: ["main", "intro-like"],
    warnings: ["ambiguous-bass"],
    ...overrides,
  };
}

describe("ProgressionCandidateCard", () => {
  it("keeps editing fields out of the default card view", () => {
    const markup = renderToStaticMarkup(
      <ProgressionCandidateCard
        candidate={candidate()}
        candidateIndex={0}
        bpm={96}
        ideas={[makeIdea()]}
        onCreate={vi.fn()}
        onAppend={vi.fn()}
        onCopyMemo={vi.fn()}
        onCopyProgression={vi.fn()}
        onPreview={vi.fn()}
        onPreviewChord={vi.fn()}
        copy={appCopy.ja}
        language="ja"
      />,
    );

    expect(markup).toContain("候補 1");
    expect(markup).toContain("Cmaj7");
    expect(markup.indexOf("Vaultに保存")).toBeLessThan(markup.indexOf("メイン"));
    expect(markup).not.toContain("低音の解釈に注意");
    expect(markup).toContain("編集");
    expect(markup).toContain("Vaultに保存");
    expect(markup).toContain("保存方法");
    expect(markup).toContain("コード進行をコピー");
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain("保存タイトル");
    expect(markup).not.toContain("ambiguous-bass");
    expect(markup).not.toContain("信頼度");
    expect(markup).not.toContain("既存Ideaへ追加");
  });

  it("shows rounded confidence only when review is useful", () => {
    const markup = renderToStaticMarkup(
      <ProgressionCandidateCard
        candidate={candidate({ confidence: 0.55 })}
        candidateIndex={0}
        bpm={96}
        ideas={[makeIdea()]}
        onCreate={vi.fn()}
        onAppend={vi.fn()}
        onCopyMemo={vi.fn()}
        onCopyProgression={vi.fn()}
        onPreview={vi.fn()}
        onPreviewChord={vi.fn()}
        copy={appCopy.ja}
        language="ja"
      />,
    );

    expect(markup).toContain("信頼度: 中");
    expect(markup).not.toContain("55%");
  });

  it("shows original and current chords in the inspector only when expanded", () => {
    const markup = renderToStaticMarkup(
      <ProgressionCandidateCard
        candidate={candidate()}
        candidateIndex={0}
        bpm={96}
        onCopyProgression={vi.fn()}
        onPreview={vi.fn()}
        onPreviewChord={vi.fn()}
        copy={appCopy.ja}
        language="ja"
        isExpanded
      />,
    );

    expect(markup).toContain("選択中のコード");
    expect(markup).toContain("元の検出値");
    expect(markup).toContain("現在のコード");
    expect(markup).toContain("編集するコードを選択");
  });

  it("renders the progression editor controls in English", () => {
    const markup = renderToStaticMarkup(
      <ProgressionCandidateCard
        candidate={candidate()}
        candidateIndex={0}
        bpm={96}
        onCopyProgression={vi.fn()}
        onPreview={vi.fn()}
        onPreviewChord={vi.fn()}
        copy={appCopy.en}
        language="en"
        isExpanded
      />,
    );

    expect(markup).toContain("Selected chord");
    expect(markup).toContain("Chord structure");
    expect(markup).toContain("Split chord");
    expect(markup).toContain("Save to Vault");
  });

  it("updates the inspector when a chord card is selected", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionCandidateCard
          candidate={candidate()}
          candidateIndex={0}
          bpm={96}
          onCopyProgression={vi.fn()}
          onPreview={vi.fn()}
          onPreviewChord={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          isExpanded
        />,
      );
    });

    const options = container.querySelectorAll<HTMLButtonElement>('[role="option"]');
    await act(async () => options[1]?.click());

    expect(container.querySelector("aside")?.textContent).toContain("Am7");
    expect(options[1]?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => root.unmount());
  });

  it("previews an analyzer alternative and applies it to the selected card", async () => {
    const alternative = {
      root: 7,
      quality: "dom7" as const,
      tensions: [],
      label: "G7",
    };
    const first = chord("Cmaj7", 1);
    first.alternatives = [{ chord: alternative, confidence: 0.72 }];
    const onPreviewChord = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionCandidateCard
          candidate={candidate({ chords: [first, chord("Am7", 2)] })}
          candidateIndex={0}
          bpm={96}
          onCopyProgression={vi.fn()}
          onPreview={vi.fn()}
          onPreviewChord={onPreviewChord}
          copy={appCopy.ja}
          language="ja"
          isExpanded
        />,
      );
    });

    const alternativeButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternativeButton?.click());
    expect(onPreviewChord).toHaveBeenCalledTimes(1);

    const applyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => applyButton?.click());

    expect(container.querySelector('[role="option"]')?.textContent).toContain("G7");
    expect(container.querySelector('[aria-label="編集済み"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("recognizes text editing targets for shortcut guards", () => {
    expect(isEditableKeyboardTarget(document.createElement("input"))).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement("select"))).toBe(true);
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(isEditableKeyboardTarget(editable)).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement("button"))).toBe(false);
  });

  it("splits, merges, and deletes chord slots while keeping the editor usable", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionCandidateCard
          candidate={candidate()}
          candidateIndex={0}
          bpm={96}
          onCopyProgression={vi.fn()}
          onPreview={vi.fn()}
          onPreviewChord={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          isExpanded
        />,
      );
    });

    const findButton = (label: string) => [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === label);
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
    await act(async () => findButton("コードを分割")?.click());
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(3);
    await act(async () => findButton("次と結合")?.click());
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
    await act(async () => findButton("コードを削除")?.click());
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);

    await act(async () => root.unmount());
  });

  it("focuses direct input with Enter and closes the inspector with Escape", async () => {
    const onCollapse = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionCandidateCard
          candidate={candidate()}
          candidateIndex={0}
          bpm={96}
          onCopyProgression={vi.fn()}
          onPreview={vi.fn()}
          onPreviewChord={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          isExpanded
          onCollapse={onCollapse}
        />,
      );
    });

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(document.activeElement?.tagName).toBe("INPUT");
    (document.activeElement as HTMLElement).blur();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onCollapse).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the save dialog with save methods and default next action", () => {
    const markup = renderToStaticMarkup(
      <ProgressionSaveDialog
        candidate={candidate()}
        title="Progression main"
        ideas={[makeIdea({ title: "Existing idea" })]}
        onTitleChange={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onAppend={vi.fn()}
        onCopyMemo={vi.fn()}
        copy={appCopy.ja}
        language="ja"
      />,
    );

    expect(markup).toContain("この進行を保存");
    expect(markup).toContain("新しいIdeaとして保存");
    expect(markup).toContain("既存Ideaへ追加");
    expect(markup).toContain("コードだけメモに追記");
    expect(markup).toContain("採集したコード進行からループを作る");
    expect(markup).toContain("この進行を確認済みとして保存");
    expect(markup).not.toContain("type=\"checkbox\" checked=\"\"");
    expect(markup).not.toContain("disabled=\"\"");
  });

  it("requires an idea when saving into an existing idea", () => {
    const markup = renderToStaticMarkup(
      <ProgressionSaveDialog
        candidate={candidate()}
        title="Progression main"
        ideas={[makeIdea({ title: "Existing idea" })]}
        onTitleChange={vi.fn()}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onAppend={vi.fn()}
        onCopyMemo={vi.fn()}
        copy={appCopy.ja}
        language="ja"
        initialMode="append"
      />,
    );

    expect(markup).toContain("追加先Idea");
    expect(markup).toContain("Existing idea");
    expect(markup).toContain("disabled=\"\"");
  });
});

describe("CaptureView saving", () => {
  it("keeps an edited candidate open when the user cancels the switch warning", async () => {
    const firstChord = chord("Cmaj7", 1);
    firstChord.alternatives = [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.75,
    }];
    const firstCandidate = candidate({
      id: "candidate-1",
      chords: [firstChord, chord("Am7", 2)],
    });
    const secondCandidate = candidate({
      id: "candidate-2",
      startBar: 5,
      endBar: 8,
      chords: [chord("Fmaj7", 5), chord("G7", 6)],
    });
    const result: MidiProgressionAnalysis = {
      totalBars: 8,
      bpm: 100,
      fullTimeline: [...firstCandidate.chords, ...secondCandidate.chords],
      blockCandidates: [firstCandidate, secondCandidate],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CaptureView
          ideas={[]}
          analysis={{ status: "done", result }}
          analyzeMidiBytes={vi.fn()}
          clearAnalysis={vi.fn()}
          createIdeaFromDraft={vi.fn()}
          appendBlockToIdea={vi.fn()}
          updateIdea={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          showRomanNumerals
        />,
      );
    });

    let headers = container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]');
    await act(async () => headers[0]?.click());
    const alternativeButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternativeButton?.click());
    const applyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => applyButton?.click());

    headers = container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]');
    await act(async () => headers[1]?.click());
    headers = container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(headers[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(headers[1]?.getAttribute("aria-expanded")).toBe("false");

    confirm.mockReturnValue(true);
    await act(async () => headers[1]?.click());
    headers = container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]');
    expect(headers[0]?.getAttribute("aria-expanded")).toBe("false");
    expect(headers[1]?.getAttribute("aria-expanded")).toBe("true");

    confirm.mockRestore();
    await act(async () => root.unmount());
  });

  it("saves a candidate to the Vault from the primary button in one click", async () => {
    feedbackSpies.append.mockClear();
    const capturedCandidate = candidate();
    const result: MidiProgressionAnalysis = {
      fileName: "song.mid",
      totalBars: 4,
      bpm: 100,
      fullTimeline: capturedCandidate.chords,
      blockCandidates: [capturedCandidate],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const createIdeaFromDraft = vi.fn(() => "11111111-1111-4111-8111-111111111111");
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CaptureView
          ideas={[]}
          analysis={{ status: "done", result }}
          analyzeMidiBytes={vi.fn()}
          clearAnalysis={vi.fn()}
          createIdeaFromDraft={createIdeaFromDraft}
          appendBlockToIdea={vi.fn()}
          updateIdea={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          showRomanNumerals
        />,
      );
    });

    const saveButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Vaultに保存");
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(createIdeaFromDraft).toHaveBeenCalledTimes(1);
    expect(createIdeaFromDraft).toHaveBeenCalledWith(expect.objectContaining({
      title: "コード進行 main - intro-like",
      progressionBlock: expect.objectContaining({ id: "candidate-1" }),
      nextAction: "採集したコード進行からループを作る",
    }));
    expect(feedbackSpies.append).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("appends final correction feedback only after an edited save succeeds", async () => {
    feedbackSpies.append.mockClear();
    const first = chord("Cmaj7", 1);
    first.alternatives = [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.75,
    }];
    const capturedCandidate = candidate({ chords: [first, chord("Am7", 2)] });
    const result: MidiProgressionAnalysis = {
      sourceFingerprint: "fnv1a32-save-failure",
      totalBars: 4,
      bpm: 100,
      fullTimeline: capturedCandidate.chords,
      blockCandidates: [capturedCandidate],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    let saveSucceeds = false;
    const createIdeaFromDraft = vi.fn(() => saveSucceeds
      ? "22222222-2222-4222-8222-222222222222"
      : undefined);
    await act(async () => {
      root.render(
        <CaptureView
          ideas={[]}
          analysis={{ status: "done", result }}
          analyzeMidiBytes={vi.fn()}
          clearAnalysis={vi.fn()}
          createIdeaFromDraft={createIdeaFromDraft}
          appendBlockToIdea={vi.fn(() => false)}
          updateIdea={vi.fn()}
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          showRomanNumerals
        />,
      );
    });

    const candidateHeader = container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
    await act(async () => candidateHeader?.click());
    const alternativeButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternativeButton?.click());
    const applyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => applyButton?.click());
    const saveButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Vaultに保存");
    await act(async () => saveButton?.click());

    expect(feedbackSpies.append).not.toHaveBeenCalled();
    saveSucceeds = true;
    await act(async () => saveButton?.click());
    expect(feedbackSpies.append).toHaveBeenCalledTimes(1);
    expect(feedbackSpies.append).toHaveBeenCalledWith([
      expect.objectContaining({ corrected: "G7", editMethod: "alternative-selection" }),
    ]);
    await act(async () => root.unmount());
  });
});

describe("TimelineDetails", () => {
  it("offers full playback, stop, piano sound feedback, and clickable chords", () => {
    const result: MidiProgressionAnalysis = {
      fileName: "song.mid",
      totalBars: 2,
      bpm: 100,
      fullTimeline: [chord("Cmaj7", 1), chord("Am7", 2)],
      blockCandidates: [],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };

    const markup = renderToStaticMarkup(
      <TimelineDetails
        result={result}
        copy={appCopy.ja}
        language="ja"
        previewSound="piano"
        onPreviewSoundChange={vi.fn()}
        onPreview={vi.fn()}
        onPreviewChord={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(markup).toContain("曲全体を再生");
    expect(markup).toContain("lv-summary-no-marker");
    expect(markup).toContain('aria-label="停止"');
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="試聴音色"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("ピアノ");
    expect(markup).toContain("エレピ");
    expect(markup).toContain("Cmaj7");
    expect(markup).toContain("Am7");
    expect(markup).toContain("<button");
  });

  it("uses the same preview sound selector as progression candidates", async () => {
    const result: MidiProgressionAnalysis = {
      fileName: "song.mid",
      totalBars: 2,
      bpm: 100,
      fullTimeline: [chord("Cmaj7", 1), chord("Am7", 2)],
      blockCandidates: [],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const onPreviewSoundChange = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TimelineDetails
          result={result}
          copy={appCopy.ja}
          language="ja"
          previewSound="piano"
          onPreviewSoundChange={onPreviewSoundChange}
          onPreview={vi.fn()}
          onPreviewChord={vi.fn()}
          onStop={vi.fn()}
        />,
      );
    });

    const electricPianoButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "エレピ");
    await act(async () => electricPianoButton?.click());

    expect(onPreviewSoundChange).toHaveBeenCalledWith("electric-piano");
    await act(async () => root.unmount());
  });
});

describe("isMidiFileName", () => {
  it("accepts .mid and .midi files case-insensitively", () => {
    expect(isMidiFileName("idea.mid")).toBe(true);
    expect(isMidiFileName("Idea.MIDI")).toBe(true);
    expect(isMidiFileName("C:\\loops\\hook.Mid")).toBe(true);
  });

  it("rejects non-MIDI files", () => {
    expect(isMidiFileName("bounce.wav")).toBe(false);
    expect(isMidiFileName("notes.mid.txt")).toBe(false);
  });
});
