import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChordTimelineItem, ProgressionBlockCandidate } from "../domain/types";
import { makeIdea } from "../domain/testFactory";
import { appCopy } from "../i18n";
import { isMidiFileName, ProgressionCandidateCard, ProgressionSaveDialog } from "./CaptureView";

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
    expect(markup).toContain("低音の解釈に注意");
    expect(markup).toContain("編集");
    expect(markup).toContain("保存");
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
