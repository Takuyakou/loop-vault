// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChordTimelineItem, MidiProgressionAnalysis, ProgressionBlockCandidate } from "../domain/types";
import type { AnalysisInput } from "../domain/midi/types";
import {
  createEditableProgression,
  LEGACY_SIMILARITY_VOICE_ID,
} from "../domain/progressionEditing";
import { makeIdea } from "../domain/testFactory";
import { appCopy, progressionEditorCopy } from "../i18n";
import {
  createPlaybackController,
  type PlaybackAudioDriver,
} from "../audio/playbackController";
import {
  appendProgressionMemo,
  captureSimilarityContext,
  captureAnalysisIdentity,
  captureSaveTitle,
  CaptureView,
  isEditableKeyboardTarget,
  isMidiFileName,
  ProgressionCandidateCard,
  timelinePlaybackPosition,
  TimelineDetails,
} from "./CaptureView";

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

function playbackHarness() {
  const driver: PlaybackAudioDriver = {
    playChord: vi.fn(async (_chord, _sound, callbacks) => callbacks.onStarted?.()),
    playTimeline: vi.fn(async (_timeline, _bpm, _sound, callbacks) => callbacks.onStarted?.()),
    stop: vi.fn(),
  };
  return { controller: createPlaybackController(driver), driver };
}

describe("ProgressionCandidateCard", () => {
  it("builds production similarity context from the key and optional AnalysisInput", () => {
    const editable = createEditableProgression(candidate({
      chords: [chord("Cmaj7", 1), chord("Cmaj7", 2)],
    }));
    const legacy = captureSimilarityContext(editable, "C major");
    const sourceId = editable.slots[0]!.id;
    const targetId = editable.slots[1]!.id;

    expect(legacy.segments?.[sourceId]).toMatchObject({
      key: "C major",
      enabledVoiceIds: [LEGACY_SIMILARITY_VOICE_ID],
      roleProfiles: {
        [LEGACY_SIMILARITY_VOICE_ID]: { role: "mixed", confidence: 1 },
      },
      weightedPcp: expect.any(Array),
      bassProfile: expect.any(Array),
    });
    expect(legacy.segments?.[sourceId].nextChord).toEqual(editable.slots[1]!.originalChord);
    expect(legacy.segments?.[targetId].previousChord).toEqual(editable.slots[0]!.originalChord);

    const analysisInput: AnalysisInput = {
      voices: [{
        id: "0:2",
        trackIndex: 0,
        channel: 2,
        explicitPrograms: [],
        dominantProgramExplicit: false,
        noteCount: 8,
        pitchRange: [48, 72],
        medianPitch: 60,
        avgDurationTick: 480,
        noteDensity: 1,
        maxPolyphony: 4,
        simultaneousOnsetRatio: 1,
        lowestVoiceShare: 0.5,
        highestVoiceShare: 0.5,
        inferredRole: "harmony",
        roleConfidence: 0.6,
        roleEvidence: {
          measured: {
            bass: 0,
            harmony: 1,
            pad: 0,
            melody: 0,
            percussion: 0,
            mixed: 0,
          },
        },
      }],
      enabledVoiceIds: ["0:2"],
      roleOverrides: { "0:2": "bass" },
    };
    const voiceAware = captureSimilarityContext(editable, "F minor", analysisInput);
    expect(voiceAware.segments?.[sourceId]).toMatchObject({
      key: "F minor",
      enabledVoiceIds: ["0:2"],
      roleProfiles: { "0:2": { role: "bass", confidence: 1 } },
    });
  });

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
    expect(markup).toContain("保存先を選ぶ");
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
    expect(markup).not.toContain("xl:grid-cols-[minmax(0,1fr)_20rem]");
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

    const alternativeButton = [...container.querySelectorAll<HTMLButtonElement>("[data-chord-inspector] button")]
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

  it("does not auto-apply propagation and undoes a selected batch in one step", async () => {
    const first = chord("Cmaj7", 1);
    first.alternatives = [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.72,
    }];
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ProgressionCandidateCard
          candidate={candidate({ chords: [first, chord("Cmaj7", 2), chord("Cmaj7", 3)] })}
          candidateIndex={0}
          bpm={96}
          onCopyProgression={vi.fn()}
          onPreviewChord={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          isExpanded
        />,
      );
    });

    const alternative = [...container.querySelectorAll<HTMLButtonElement>("[data-chord-inspector] button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternative?.click());
    const apply = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => apply?.click());

    let chordCards = container.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect([...chordCards].map((card) => card.textContent)).toEqual([
      expect.stringContaining("G7"),
      expect.stringContaining("Cmaj7"),
      expect.stringContaining("Cmaj7"),
    ]);

    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      '[data-correction-propagation] input[type="checkbox"]',
    );
    await act(async () => checkboxes[0]?.click());
    const applyPropagation = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("選択した区間へ適用"));
    await act(async () => applyPropagation?.click());

    chordCards = container.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect([...chordCards].map((card) => card.textContent)).toEqual([
      expect.stringContaining("G7"),
      expect.stringContaining("G7"),
      expect.stringContaining("Cmaj7"),
    ]);

    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="元に戻す"]');
    await act(async () => undo?.click());
    chordCards = container.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect([...chordCards].map((card) => card.textContent)).toEqual([
      expect.stringContaining("G7"),
      expect.stringContaining("Cmaj7"),
      expect.stringContaining("Cmaj7"),
    ]);

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

  it("stops candidate playback before keyboard undo and redo", async () => {
    const first = chord("Cmaj7", 1);
    first.alternatives = [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.72,
    }];
    const { controller, driver } = playbackHarness();
    const source = { kind: "capture" as const, id: "analysis:test:candidate:candidate-1" };
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
          onPreviewChord={vi.fn()}
          playbackSource={source}
          controller={controller}
          copy={appCopy.en}
          language="en"
          isExpanded
        />,
      );
    });

    const alternativeButton = [...container.querySelectorAll<HTMLButtonElement>("[data-chord-inspector] button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternativeButton?.click());
    const applyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Apply");
    await act(async () => applyButton?.click());

    await act(async () => {
      await controller.play(
        { kind: "capture", id: `${source.id}:inspector:slot:original` },
        { type: "chord", chord: first.chord },
      );
    });
    vi.mocked(driver.stop).mockClear();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
      }));
    });
    expect(driver.stop).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("idle");

    await act(async () => {
      await controller.play(
        { kind: "capture", id: `${source.id}:chord:0:G7` },
        { type: "chord", chord: first.chord },
      );
    });
    vi.mocked(driver.stop).mockClear();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }));
    });
    expect(driver.stop).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("idle");

    await act(async () => root.unmount());
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

  it("builds the initial save title in the documented priority order", () => {
    expect(captureSaveTitle(candidate(), "song.mid", "C major", appCopy.ja, "ja"))
      .toBe("song.mid · 1–4小節");
    expect(captureSaveTitle(candidate(), undefined, "C major", appCopy.en, "en"))
      .toBe("C major · Bars 1–4");
    expect(captureSaveTitle(candidate(), undefined, undefined, appCopy.en, "en"))
      .toBe("main - intro-like");
    expect(captureSaveTitle(candidate({ summaryText: "" }), undefined, undefined, appCopy.ja, "ja"))
      .toBe("保存した進行");
  });

  it("preserves an existing memo and appends progression text on a new line", () => {
    expect(appendProgressionMemo("Existing memo", "| C | G |"))
      .toBe("Existing memo\n| C | G |");
    expect(appendProgressionMemo("Existing memo\n", "| C | G |"))
      .toBe("Existing memo\n| C | G |");
  });

  it("updates the dirty baseline after appending an edited progression", async () => {
    const firstChord = chord("Cmaj7", 1);
    firstChord.alternatives = [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.75,
    }];
    const idea = makeIdea();
    const onAppend = vi.fn(() => true);
    const onDirtyChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProgressionCandidateCard
          candidate={candidate({ chords: [firstChord, chord("Am7", 2)] })}
          candidateIndex={0}
          bpm={96}
          ideas={[idea]}
          onAppend={onAppend}
          onCopyProgression={vi.fn()}
          onPreviewChord={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          isExpanded
          onDirtyChange={onDirtyChange}
        />,
      );
    });

    const alternativeButton = [...container.querySelectorAll<HTMLButtonElement>("[data-chord-inspector] button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternativeButton?.click());
    const applyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => applyButton?.click());
    expect(onDirtyChange).toHaveBeenLastCalledWith("candidate-1", true);

    const dropdown = container.querySelector<HTMLButtonElement>('button[aria-label="保存先を選ぶ"]');
    await act(async () => dropdown?.click());
    const appendItem = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent === "既存Ideaへ追加");
    await act(async () => appendItem?.click());
    const appendDialog = container.querySelector<HTMLFormElement>('form[role="dialog"]');
    expect(appendDialog?.id).toBeTruthy();
    expect(dropdown?.getAttribute("aria-expanded")).toBe("true");
    expect(dropdown?.getAttribute("aria-controls")).toBe(appendDialog?.id);
    expect(dropdown?.getAttribute("aria-haspopup")).toBe("dialog");
    const destination = container.querySelector<HTMLSelectElement>('[role="dialog"] select');
    await act(async () => {
      if (!destination) return;
      destination.value = idea.id;
      destination.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const save = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent === "保存");
    await act(async () => save?.click());

    expect(onAppend).toHaveBeenCalledWith(
      expect.objectContaining({ summaryText: "| G7 | Am7 |" }),
      idea.id,
      false,
      expect.any(Object),
      [],
    );
    expect(onDirtyChange).toHaveBeenLastCalledWith("candidate-1", false);

    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps dirty state and the append or memo popover when saving fails", async () => {
    const firstChord = chord("Cmaj7", 1);
    firstChord.alternatives = [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.75,
    }];
    const idea = makeIdea();
    const onAppend = vi.fn(() => false);
    const onCopyMemo = vi.fn(() => false);
    const onDirtyChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ProgressionCandidateCard
          candidate={candidate({ chords: [firstChord, chord("Am7", 2)] })}
          candidateIndex={0}
          bpm={96}
          ideas={[idea]}
          onAppend={onAppend}
          onCopyMemo={onCopyMemo}
          onCopyProgression={vi.fn()}
          onPreviewChord={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          isExpanded
          onDirtyChange={onDirtyChange}
        />,
      );
    });

    const alternativeButton = [...container.querySelectorAll<HTMLButtonElement>("[data-chord-inspector] button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternativeButton?.click());
    const applyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => applyButton?.click());
    expect(onDirtyChange).toHaveBeenLastCalledWith("candidate-1", true);

    const dropdown = container.querySelector<HTMLButtonElement>('button[aria-label="保存先を選ぶ"]');
    await act(async () => dropdown?.click());
    const appendItem = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent === "既存Ideaへ追加");
    await act(async () => appendItem?.click());
    let dialog = container.querySelector<HTMLFormElement>('form[role="dialog"]');
    expect(dropdown?.getAttribute("aria-expanded")).toBe("true");
    expect(dropdown?.getAttribute("aria-controls")).toBe(dialog?.id);

    let destination = dialog?.querySelector<HTMLSelectElement>("select");
    await act(async () => {
      if (!destination) return;
      destination.value = idea.id;
      destination.dispatchEvent(new Event("change", { bubbles: true }));
    });
    let save = [...dialog!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "保存");
    await act(async () => save?.click());
    expect(onAppend).toHaveBeenCalledTimes(1);
    expect(container.querySelector('form[role="dialog"]')).toBe(dialog);
    expect(onDirtyChange).toHaveBeenLastCalledWith("candidate-1", true);

    const cancel = [...dialog!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "キャンセル");
    await act(async () => cancel?.click());
    await act(async () => dropdown?.click());
    const memoItem = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent === "コードだけメモに追記");
    await act(async () => memoItem?.click());
    dialog = container.querySelector<HTMLFormElement>('form[role="dialog"]');
    expect(dropdown?.getAttribute("aria-expanded")).toBe("true");
    expect(dropdown?.getAttribute("aria-controls")).toBe(dialog?.id);
    expect(dropdown?.getAttribute("aria-haspopup")).toBe("dialog");

    destination = dialog?.querySelector<HTMLSelectElement>("select");
    await act(async () => {
      if (!destination) return;
      destination.value = idea.id;
      destination.dispatchEvent(new Event("change", { bubbles: true }));
    });
    save = [...dialog!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "保存");
    await act(async () => save?.click());
    expect(onCopyMemo).toHaveBeenCalledTimes(1);
    expect(container.querySelector('form[role="dialog"]')).toBe(dialog);
    expect(onDirtyChange).toHaveBeenLastCalledWith("candidate-1", true);

    await act(async () => root.unmount());
    container.remove();
  });
});

describe("CaptureView saving", () => {
  it("keeps one portaled inspector mounted and cleans up responsive height tracking", async () => {
    const first = chord("Cmaj7", 1);
    first.alternatives = [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.72,
    }];
    const firstCandidate = candidate({ chords: [first, chord("Am7", 2)] });
    const secondCandidate = candidate({
      id: "candidate-2",
      startBar: 5,
      endBar: 8,
      chords: [chord("Fmaj7", 5), chord("Dm7", 6)],
    });
    const result: MidiProgressionAnalysis = {
      totalBars: 8,
      bpm: 100,
      fullTimeline: [...firstCandidate.chords, ...secondCandidate.chords],
      blockCandidates: [firstCandidate, secondCandidate],
      analyzedAt: "2026-07-16T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const observe = vi.fn();
    const disconnect = vi.fn();
    const originalResizeObserver = globalThis.ResizeObserver;
    const originalMatchMedia = window.matchMedia;
    const originalWidth = window.innerWidth;
    class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
    }
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: TestResizeObserver });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
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

      const host = container.querySelector<HTMLElement>("[data-responsive-inspector-host]");
      expect(host).not.toBeNull();
      Object.defineProperty(host, "getBoundingClientRect", {
        configurable: true,
        value: () => DOMRect.fromRect({ width: 768, height: 196 }),
      });

      let headers = container.querySelectorAll<HTMLButtonElement>("[data-candidate-toggle]");
      await act(async () => headers[0]?.click());
      expect(observe).toHaveBeenCalledWith(host);
      expect(document.documentElement.style.getPropertyValue("--lv-sticky-inspector-height")).toBe("196px");
      expect(host?.querySelectorAll("[data-chord-inspector]")).toHaveLength(1);
      expect(container.querySelectorAll("[data-chord-inspector]")).toHaveLength(1);
      expect(host?.querySelector("[data-chord-inspector]")?.getAttribute("data-inspector-state")).toBe("collapsed");

      const expand = [...host!.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "展開");
      await act(async () => expand?.click());
      expect(host?.querySelector("[data-chord-inspector]")?.getAttribute("data-inspector-state")).toBe("expanded");

      const input = host?.querySelector<HTMLInputElement>("input");
      await act(async () => {
        if (!input) return;
        input.value = "F#m9";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
      await act(async () => window.dispatchEvent(new Event("resize")));
      expect(document.documentElement.style.getPropertyValue("--lv-sticky-inspector-height")).toBe("");
      expect(host?.querySelector<HTMLInputElement>("input")?.value).toBe("F#m9");
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
      await act(async () => window.dispatchEvent(new Event("resize")));
      expect(document.documentElement.style.getPropertyValue("--lv-sticky-inspector-height")).toBe("196px");

      const chordOptions = container.querySelectorAll<HTMLButtonElement>('[role="option"]');
      await act(async () => chordOptions[1]?.click());
      expect(host?.querySelector("[data-chord-inspector]")?.getAttribute("data-inspector-state")).toBe("expanded");

      headers = container.querySelectorAll<HTMLButtonElement>("[data-candidate-toggle]");
      await act(async () => headers[1]?.click());
      expect(host?.querySelector("[data-chord-inspector]")?.getAttribute("data-inspector-state")).toBe("collapsed");

      const secondExpand = [...host!.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "展開");
      await act(async () => secondExpand?.click());
      const structureSelect = host?.querySelector<HTMLSelectElement>("select");
      structureSelect?.focus();
      await act(async () => structureSelect?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(host?.querySelector("[data-chord-inspector]")?.getAttribute("data-inspector-state")).toBe("collapsed");
      expect(document.activeElement).toBe(host?.querySelector("[data-inspector-toggle]"));

      await act(async () => secondExpand?.click());
      const directInput = host?.querySelector<HTMLInputElement>("input");
      directInput?.focus();
      await act(async () => directInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(host?.querySelector("[data-chord-inspector]")?.getAttribute("data-inspector-state")).toBe("collapsed");
      expect(document.activeElement).toBe(host?.querySelector("[data-inspector-toggle]"));

      headers = container.querySelectorAll<HTMLButtonElement>("[data-candidate-toggle]");
      expect(headers[1]?.getAttribute("aria-expanded")).toBe("true");
      await act(async () => host?.querySelector<HTMLButtonElement>("[data-inspector-toggle]")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      expect(headers[1]?.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(headers[1]);
      expect(document.documentElement.style.getPropertyValue("--lv-sticky-inspector-height")).toBe("");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      document.documentElement.style.removeProperty("--lv-sticky-inspector-height");
      Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: originalResizeObserver });
      Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }

    expect(disconnect).toHaveBeenCalled();
  });

  it("consumes Escape one layer at a time and restores focus without opening the dirty modal early", async () => {
    const first = chord("Cmaj7", 1);
    first.alternatives = [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.75,
    }];
    const capturedCandidate = candidate({ chords: [first, chord("Am7", 2)] });
    const result: MidiProgressionAnalysis = {
      totalBars: 4,
      bpm: 100,
      fullTimeline: capturedCandidate.chords,
      blockCandidates: [capturedCandidate],
      analyzedAt: "2026-07-16T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const container = document.createElement("div");
    document.body.append(container);
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

    const candidateHeader = container.querySelector<HTMLButtonElement>("[data-candidate-toggle]");
    await act(async () => candidateHeader?.click());
    const host = container.querySelector<HTMLElement>("[data-responsive-inspector-host]");
    const inspectorToggle = host?.querySelector<HTMLButtonElement>("[data-inspector-toggle]");
    await act(async () => inspectorToggle?.click());

    const alternative = [...host!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternative?.click());
    const apply = [...host!.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => apply?.click());

    const saveButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Vaultに保存");
    await act(async () => saveButton?.click());
    const popoverInput = container.querySelector<HTMLInputElement>('form[role="dialog"] input');
    expect(document.activeElement).toBe(popoverInput);

    await act(async () => popoverInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('form[role="dialog"]')).toBeNull();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    expect(candidateHeader?.getAttribute("aria-expanded")).toBe("true");
    expect(host?.querySelector("[data-chord-inspector]")?.getAttribute("data-inspector-state")).toBe("expanded");
    expect(document.activeElement).toBe(saveButton);

    await act(async () => saveButton?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    expect(candidateHeader?.getAttribute("aria-expanded")).toBe("true");
    expect(host?.querySelector("[data-chord-inspector]")?.getAttribute("data-inspector-state")).toBe("collapsed");
    expect(document.activeElement).toBe(inspectorToggle);

    await act(async () => inspectorToggle?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector('[aria-modal="true"]')?.textContent).toContain("未保存の候補を閉じますか？");
    expect(candidateHeader?.getAttribute("aria-expanded")).toBe("true");

    const close = [...document.querySelectorAll<HTMLButtonElement>('[aria-modal="true"] button')]
      .find((button) => button.textContent === "閉じる");
    await act(async () => close?.click());
    expect(candidateHeader?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(candidateHeader);

    await act(async () => root.unmount());
    container.remove();
  });

  it("does not open another candidate's save popover before dirty selection is confirmed", async () => {
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
    const container = document.createElement("div");
    document.body.append(container);
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

    let headers = container.querySelectorAll<HTMLButtonElement>('[data-candidate-toggle]');
    await act(async () => headers[0]?.click());
    const alternativeButton = [...container.querySelectorAll<HTMLButtonElement>("[data-chord-inspector] button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternativeButton?.click());
    const applyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => applyButton?.click());

    headers = container.querySelectorAll<HTMLButtonElement>('[data-candidate-toggle]');
    await act(async () => headers[1]?.click());
    headers = container.querySelectorAll<HTMLButtonElement>('[data-candidate-toggle]');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("未保存の候補を閉じますか？");
    expect(headers[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(headers[1]?.getAttribute("aria-expanded")).toBe("false");

    const cancel = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent === "キャンセル");
    await act(async () => cancel?.click());

    const saveButtons = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .filter((button) => button.textContent?.trim() === "Vaultに保存");
    await act(async () => saveButtons[1]?.click());
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector('form[role="dialog"]')).toBeNull();
    expect(document.querySelector('[aria-modal="true"]')?.textContent).toContain("未保存の候補を閉じますか？");

    const close = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent === "閉じる");
    await act(async () => close?.click());
    headers = container.querySelectorAll<HTMLButtonElement>('[data-candidate-toggle]');
    expect(headers[0]?.getAttribute("aria-expanded")).toBe("false");
    expect(headers[1]?.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => saveButtons[1]?.click());
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector('form[role="dialog"]')?.getAttribute("aria-modal")).toBe("false");
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("opens the new-Idea popover and saves with Ctrl+Enter outside IME composition", async () => {
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
    document.body.append(container);
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

    expect(createIdeaFromDraft).not.toHaveBeenCalled();
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("false");
    expect(saveButton?.getAttribute("aria-expanded")).toBe("true");
    expect(saveButton?.getAttribute("aria-controls")).toBe(dialog?.id);
    expect(dialog?.querySelector<HTMLInputElement>('input')?.value).toBe("song.mid · 1–4小節");
    expect(document.activeElement).toBe(dialog?.querySelector("input"));

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      isComposing: true,
    })));
    const legacyEscapeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    Object.defineProperty(legacyEscapeEvent, "keyCode", { value: 229 });
    await act(async () => document.dispatchEvent(legacyEscapeEvent));
    expect(container.querySelector('[role="dialog"]')).toBe(dialog);

    await act(async () => dialog?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
      isComposing: true,
    })));
    const legacyCompositionEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
    });
    Object.defineProperty(legacyCompositionEvent, "keyCode", { value: 229 });
    await act(async () => dialog?.dispatchEvent(legacyCompositionEvent));
    expect(createIdeaFromDraft).not.toHaveBeenCalled();

    await act(async () => dialog?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
    })));

    expect(createIdeaFromDraft).toHaveBeenCalledTimes(1);
    expect(createIdeaFromDraft).toHaveBeenCalledWith(expect.objectContaining({
      title: "song.mid · 1–4小節",
      progressionBlock: expect.objectContaining({ id: "candidate-1" }),
      nextAction: "採集したコード進行からループを作る",
    }));
    expect(feedbackSpies.append).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it("opens existing-Idea actions from the dropdown and has no persistent save aside", async () => {
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
    document.body.append(container);
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

    const saveOptions = container.querySelector<HTMLButtonElement>('button[aria-label="保存先を選ぶ"]');
    await act(async () => saveOptions?.click());

    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    expect(menu?.textContent).toContain("既存Ideaへ追加");
    expect(menu?.textContent).toContain("コードだけメモに追記");
    expect([...container.querySelectorAll("aside")].some((aside) => aside.textContent?.includes("この進行を保存"))).toBe(false);
    expect(createIdeaFromDraft).not.toHaveBeenCalled();

    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(saveOptions);
    expect(container.querySelector('[data-candidate-toggle]')?.getAttribute("aria-expanded")).toBe("true");

    await act(async () => saveOptions?.click());
    await act(async () => document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("appends edited chords to the existing memo and clears the saved dirty baseline", async () => {
    const firstChord = chord("Cmaj7", 1);
    firstChord.alternatives = [{
      chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
      confidence: 0.75,
    }];
    const firstCandidate = candidate({ chords: [firstChord, chord("Am7", 2)] });
    const secondCandidate = candidate({
      id: "candidate-2",
      startBar: 5,
      endBar: 8,
      chords: [chord("Fmaj7", 5), chord("G7", 6)],
    });
    const idea = makeIdea({ chordMemo: "Existing memo" });
    const updateIdea = vi.fn();
    const result: MidiProgressionAnalysis = {
      totalBars: 8,
      bpm: 100,
      fullTimeline: [...firstCandidate.chords, ...secondCandidate.chords],
      blockCandidates: [firstCandidate, secondCandidate],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CaptureView
          ideas={[idea]}
          analysis={{ status: "done", result }}
          analyzeMidiBytes={vi.fn()}
          clearAnalysis={vi.fn()}
          createIdeaFromDraft={vi.fn()}
          appendBlockToIdea={vi.fn()}
          updateIdea={updateIdea}
          setToast={vi.fn()}
          copy={appCopy.ja}
          language="ja"
          showRomanNumerals
        />,
      );
    });

    let headers = container.querySelectorAll<HTMLButtonElement>('[data-candidate-toggle]');
    await act(async () => headers[0]?.click());
    const alternativeButton = [...container.querySelectorAll<HTMLButtonElement>("[data-chord-inspector] button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternativeButton?.click());
    const applyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => applyButton?.click());

    const dropdown = container.querySelector<HTMLButtonElement>('button[aria-label="保存先を選ぶ"]');
    await act(async () => dropdown?.click());
    const memoItem = [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find((button) => button.textContent === "コードだけメモに追記");
    await act(async () => memoItem?.click());
    const destination = container.querySelector<HTMLSelectElement>('[role="dialog"] select');
    await act(async () => {
      if (!destination) return;
      destination.value = idea.id;
      destination.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const save = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent === "保存");
    await act(async () => save?.click());

    expect(updateIdea).toHaveBeenCalledWith(idea.id, {
      chordMemo: "Existing memo\n| G7 | Am7 |",
    });
    headers = container.querySelectorAll<HTMLButtonElement>('[data-candidate-toggle]');
    await act(async () => headers[1]?.click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(headers[1]?.getAttribute("aria-expanded")).toBe("true");

    await act(async () => root.unmount());
    container.remove();
  });

  it("appends final correction feedback only after an edited save succeeds", async () => {
    feedbackSpies.append.mockClear();
    const first = chord("Cmaj7", 1);
    first.alternatives = [
      {
        chord: { root: 7, quality: "dom7", tensions: [], label: "G7" },
        confidence: 0.75,
      },
      {
        chord: { root: 5, quality: "dom7", tensions: [], label: "F7" },
        confidence: 0.7,
      },
    ];
    const capturedCandidate = candidate({
      chords: [first, chord("Cmaj7", 2), chord("Cmaj7", 3)],
    });
    const result: MidiProgressionAnalysis = {
      sourceFingerprint: "fnv1a32-deadbeef",
      totalBars: 4,
      bpm: 100,
      fullTimeline: capturedCandidate.chords,
      blockCandidates: [capturedCandidate],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const container = document.createElement("div");
    document.body.append(container);
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

    const candidateHeader = container.querySelector<HTMLButtonElement>('[data-candidate-toggle][aria-expanded="false"]');
    await act(async () => candidateHeader?.click());
    const expandInspector = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "展開");
    await act(async () => expandInspector?.click());
    const firstAlternative = [...container.querySelectorAll<HTMLButtonElement>("[data-chord-inspector] button")]
      .find((button) => button.textContent?.includes("F7"));
    await act(async () => firstAlternative?.click());
    const applyButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => applyButton?.click());
    expect(container.textContent).toContain("同じ修正を適用できそうな区間が2件あります");
    const propagationCheckboxes = container.querySelectorAll<HTMLInputElement>(
      '[data-correction-propagation] input[type="checkbox"]',
    );
    await act(async () => propagationCheckboxes[0]?.click());
    const applyPropagation = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("選択した区間へ適用"));
    await act(async () => applyPropagation?.click());

    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="元に戻す"]');
    await act(async () => undo?.click());
    const alternativeButton = [...container.querySelectorAll<HTMLButtonElement>("[data-chord-inspector] button")]
      .find((button) => button.textContent?.includes("G7"));
    await act(async () => alternativeButton?.click());
    const applyReplacement = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "適用");
    await act(async () => applyReplacement?.click());
    const replacementCheckboxes = container.querySelectorAll<HTMLInputElement>(
      '[data-correction-propagation] input[type="checkbox"]',
    );
    await act(async () => replacementCheckboxes[0]?.click());
    const applyReplacementPropagation = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("選択した区間へ適用"));
    await act(async () => applyReplacementPropagation?.click());
    const expandedCandidateHeader = container.querySelector<HTMLButtonElement>("[data-candidate-toggle]");
    const inspectorToggle = container.querySelector<HTMLButtonElement>("[data-inspector-toggle]");
    await act(async () => inspectorToggle?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(async () => inspectorToggle?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    const confirmClose = [...document.querySelectorAll<HTMLButtonElement>('[aria-modal="true"] button')]
      .find((button) => button.textContent === "閉じる");
    await act(async () => confirmClose?.click());
    expect(expandedCandidateHeader?.getAttribute("aria-expanded")).toBe("false");
    const saveButton = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Vaultに保存");
    expect(saveButton).toBeDefined();
    await act(async () => saveButton?.click());
    const confirmSave = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent === "保存");
    expect(confirmSave).toBeDefined();
    await act(async () => confirmSave?.click());

    expect(feedbackSpies.append).not.toHaveBeenCalled();
    saveSucceeds = true;
    const retrySave = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find((button) => button.textContent === "保存");
    await act(async () => retrySave?.click());
    expect(createIdeaFromDraft).toHaveBeenCalledTimes(2);
    expect(createIdeaFromDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      progressionBlock: expect.objectContaining({
        chords: expect.arrayContaining([expect.objectContaining({ chord: expect.objectContaining({ label: "G7" }) })]),
      }),
    }));
    expect(feedbackSpies.append).toHaveBeenCalledTimes(1);
    expect(feedbackSpies.append).toHaveBeenCalledWith([
      expect.objectContaining({ corrected: "G7", editMethod: "alternative-selection" }),
      expect.objectContaining({
        eventType: "correction-propagation",
        analyzerVersion: "test",
        shownSegmentIds: expect.arrayContaining([
          expect.stringContaining(":2:1:"),
          expect.stringContaining(":3:1:"),
        ]),
        acceptedSegmentIds: [expect.stringContaining(":2:1:")],
        rejectedSegmentIds: [expect.stringContaining(":3:1:")],
        threshold: 0.86,
      }),
    ]);
    await act(async () => root.unmount());
    container.remove();
  });
});

describe("CaptureView song mini map", () => {
  function analysisWithCandidates(): MidiProgressionAnalysis {
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
    return {
      totalBars: 8,
      bpm: 100,
      fullTimeline: [...firstCandidate.chords, ...secondCandidate.chords],
      blockCandidates: [firstCandidate, secondCandidate],
      analyzedAt: "2026-07-16T00:00:00.000Z",
      analyzerVersion: "test",
    };
  }

  async function renderCapture(result: MidiProgressionAnalysis, language: "ja" | "en" = "en") {
    const container = document.createElement("div");
    document.body.append(container);
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
          copy={appCopy[language]}
          language={language}
          showRomanNumerals
        />,
      );
    });
    return { container, root };
  }

  it("places the map between the file overview and candidate list, then opens and scrolls the timeline", async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const { container, root } = await renderCapture(analysisWithCandidates());

    try {
      const miniMap = container.querySelector<HTMLElement>("[data-song-minimap]");
      const overview = miniMap?.previousElementSibling;
      const candidateHeader = container.querySelector<HTMLElement>("[data-candidate-toggle]");
      expect(miniMap).not.toBeNull();
      expect(candidateHeader).not.toBeNull();
      expect(overview?.tagName).toBe("SECTION");
      expect(Boolean(miniMap!.compareDocumentPosition(candidateHeader!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

      const secondRange = container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-candidate="candidate-2"]',
      );
      expect(secondRange?.getAttribute("aria-label")).toBe("Candidate 2: bars 5-8");
      await act(async () => secondRange?.click());

      const details = container.querySelector<HTMLDetailsElement>("details");
      const headers = container.querySelectorAll<HTMLElement>("[data-candidate-toggle]");
      const targetBar = container.querySelector<HTMLElement>('[data-progression-bar="5"]');
      expect(details?.open).toBe(true);
      expect(headers[1]?.getAttribute("aria-expanded")).toBe("true");
      expect(secondRange?.getAttribute("aria-pressed")).toBe("true");
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(targetBar);
      expect(targetBar?.querySelector('button[aria-pressed="true"]')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it("waits for dirty confirmation before selecting or scrolling, and leaves state unchanged on cancel", async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const { container, root } = await renderCapture(analysisWithCandidates());

    try {
      const firstRange = container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-candidate="candidate-1"]',
      );
      const secondRange = container.querySelector<HTMLButtonElement>(
        '[data-song-minimap-candidate="candidate-2"]',
      );
      await act(async () => firstRange?.click());
      const alternativeButton = [...container.querySelectorAll<HTMLButtonElement>("[data-chord-inspector] button")]
        .find((button) => button.textContent?.includes("G7"));
      await act(async () => alternativeButton?.click());
      const applyButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === progressionEditorCopy.en.apply);
      await act(async () => applyButton?.click());
      scrollIntoView.mockClear();

      await act(async () => secondRange?.click());
      let dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(firstRange?.getAttribute("aria-pressed")).toBe("true");
      expect(secondRange?.getAttribute("aria-pressed")).toBe("false");
      expect(scrollIntoView).not.toHaveBeenCalled();

      const cancelButton = dialog?.querySelectorAll<HTMLButtonElement>("button")[0];
      await act(async () => cancelButton?.click());
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(firstRange?.getAttribute("aria-pressed")).toBe("true");
      expect(scrollIntoView).not.toHaveBeenCalled();

      await act(async () => secondRange?.click());
      dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      const confirmButton = dialog?.querySelectorAll<HTMLButtonElement>("button")[1];
      await act(async () => confirmButton?.click());
      expect(secondRange?.getAttribute("aria-pressed")).toBe("true");
      expect(container.querySelector<HTMLDetailsElement>("details")?.open).toBe(true);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(
        container.querySelector('[data-progression-bar="5"]'),
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    }
  });

  it("keeps an empty zero-bar analysis renderable", async () => {
    const { container, root } = await renderCapture({
      totalBars: 0,
      fullTimeline: [],
      blockCandidates: [],
      analyzedAt: "2026-07-16T00:00:00.000Z",
      analyzerVersion: "test",
    });
    expect(container.querySelector("[data-song-minimap-track]")).toBeNull();
    expect(container.textContent).toContain(appCopy.en.capture.songMiniMapEmpty);
    await act(async () => root.unmount());
    container.remove();
  });
});

describe("Capture playback isolation", () => {
  it("stops sound changes only for Capture playback in both selectors", async () => {
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
    const { controller, driver } = playbackHarness();
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
          copy={appCopy.en}
          language="en"
          showRomanNumerals
          controller={controller}
        />,
      );
    });

    const clickSound = async (groupIndex: number, label: string) => {
      const groups = container.querySelectorAll<HTMLElement>('[role="group"][aria-label="Preview sound"]');
      const button = [...(groups[groupIndex]?.querySelectorAll("button") ?? [])]
        .find((item) => item.textContent?.trim() === label);
      await act(async () => button?.click());
    };
    const play = async (kind: "home" | "capture", id: string) => {
      await act(async () => {
        await controller.play(
          { kind, id },
          { type: "chord", chord: capturedCandidate.chords[0]!.chord },
        );
      });
      vi.mocked(driver.stop).mockClear();
    };

    await play("home", "today-focus");
    await clickSound(0, "Electric piano");
    expect(driver.stop).not.toHaveBeenCalled();
    expect(controller.getState().source).toEqual({ kind: "home", id: "today-focus" });

    await act(async () => controller.stop());
    await play("capture", "candidate-preview");
    await clickSound(0, "Piano");
    expect(driver.stop).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("idle");

    await play("home", "vault-focus");
    await clickSound(1, "Electric piano");
    expect(driver.stop).not.toHaveBeenCalled();
    expect(controller.getState().source).toEqual({ kind: "home", id: "vault-focus" });

    await act(async () => controller.stop());
    await play("capture", "full-timeline");
    await clickSound(1, "Piano");
    expect(driver.stop).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("idle");

    await act(async () => root.unmount());
  });

  it("builds a collision-resistant fallback identity for legacy analyses", () => {
    const base: MidiProgressionAnalysis = {
      fileName: "song.mid",
      sourceAssetId: "11111111-1111-4111-8111-111111111111",
      totalBars: 4,
      fullTimeline: [],
      blockCandidates: [],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "legacy",
    };

    expect(captureAnalysisIdentity(base)).not.toBe(captureAnalysisIdentity({
      ...base,
      analyzedAt: "2026-07-15T00:01:00.000Z",
    }));
    expect(captureAnalysisIdentity(base)).not.toBe(captureAnalysisIdentity({
      ...base,
      sourceAssetId: "22222222-2222-4222-8222-222222222222",
    }));
    expect(captureAnalysisIdentity({
      ...base,
      sourceFingerprint: "sha256-stable",
    })).toBe("fingerprint:sha256-stable");
  });
});

describe("TimelineDetails", () => {
  it("derives the active chord and progress from controller time", () => {
    const chords = [chord("Cmaj7", 1), chord("Am7", 2)];
    expect(timelinePlaybackPosition(chords, 120, 1_000, 1_250)).toEqual({
      index: 0,
      progress: 0.125,
    });
    expect(timelinePlaybackPosition(chords, 120, 1_000, 3_250)).toEqual({
      index: 1,
      progress: 0.125,
    });
  });

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

    const { controller } = playbackHarness();
    const markup = renderToStaticMarkup(
      <TimelineDetails
        result={result}
        copy={appCopy.ja}
        language="ja"
        previewSound="piano"
        onPreviewSoundChange={vi.fn()}
        controller={controller}
      />,
    );

    expect(markup).toContain("曲全体を再生");
    expect(markup).not.toContain('aria-label="停止"');
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="試聴音色"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("ピアノ");
    expect(markup).toContain("エレピ");
    expect(markup).toContain("Cmaj7");
    expect(markup).toContain("Am7");
    expect(markup).toContain("<button");
  });

  it("uses the main playback button to stop without a separate square button", async () => {
    const result: MidiProgressionAnalysis = {
      fileName: "song.mid",
      totalBars: 2,
      bpm: 100,
      fullTimeline: [chord("Cmaj7", 1), chord("Am7", 2)],
      blockCandidates: [],
      analyzedAt: "2026-07-15T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const { controller, driver } = playbackHarness();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TimelineDetails
          result={result}
          copy={appCopy.ja}
          language="ja"
          previewSound="piano"
          onPreviewSoundChange={vi.fn()}
          controller={controller}
        />,
      );
    });

    const playbackButton = () => container.querySelector<HTMLButtonElement>("button.lv-button-primary");
    await act(async () => playbackButton()?.click());
    expect(driver.playTimeline).toHaveBeenCalledTimes(1);
    expect(playbackButton()?.textContent).toContain("停止");
    expect(container.querySelectorAll("button.lv-button-ghost")).toHaveLength(0);

    await act(async () => playbackButton()?.click());
    expect(playbackButton()?.textContent).toContain("曲全体を再生");
    expect(driver.stop).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
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
    const { controller } = playbackHarness();
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
          controller={controller}
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
