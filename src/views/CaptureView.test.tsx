// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChordTimelineItem, MidiProgressionAnalysis, ProgressionBlockCandidate } from "../domain/types";
import { makeIdea } from "../domain/testFactory";
import { appCopy } from "../i18n";
import { CaptureView, isMidiFileName, ProgressionCandidateCard, ProgressionSaveDialog, TimelineDetails } from "./CaptureView";

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
  it("saves a candidate to the Vault from the primary button in one click", async () => {
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
        onPreview={vi.fn()}
        onPreviewChord={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(markup).toContain("曲全体を再生");
    expect(markup).toContain('aria-label="停止"');
    expect(markup).toContain("試聴音色: ピアノ");
    expect(markup).toContain("Cmaj7");
    expect(markup).toContain("Am7");
    expect(markup).toContain("<button");
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
