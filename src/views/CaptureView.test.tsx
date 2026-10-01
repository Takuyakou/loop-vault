// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChordTimelineItem, MidiProgressionAnalysis, ProgressionBlockCandidate } from "../domain/types";
import { makeIdea } from "../domain/testFactory";
import { appCopy } from "../i18n";
import { analyzeScenario, p10Scenario } from "../testing/p10SyntheticCapture";
import type { AnalysisState } from "../store/vaultStore";
import {
  appendProgressionMemo,
  captureAnalysisIdentity,
  captureSaveTitle,
  CaptureAnalysisProgress,
  CaptureView,
  isEditableKeyboardTarget,
  isMidiFileName,
  persistCopiedProgressionMemo,
} from "./CaptureView";

/**
 * CaptureView after P10.0-07: a MIDI result opens in the correction workspace (the
 * old result screen and its candidate cards are gone). The save tests go through
 * the same useCaptureSave path the old screen used, now from the workspace.
 */

const feedbackSpies = vi.hoisted(() => ({
  append: vi.fn(async () => undefined),
  appendLabelCorrections: vi.fn(async () => 0),
}));

vi.mock("../storage/analysisFeedbackStorage", () => ({
  appendAnalysisFeedback: feedbackSpies.append,
}));

vi.mock("../storage/labelCorrectionLogStorage", () => ({
  appendLabelCorrectionLogs: feedbackSpies.appendLabelCorrections,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function chord(label: string, bar: number): ChordTimelineItem {
  return {
    bar,
    beat: 1,
    durationBeats: 4,
    chord: { root: 0, quality: "maj7", tensions: [], label },
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

/** A real synthetic analysis with its source notes, so the workspace opens. */
function workspaceAnalysis(id = "plain-8"): AnalysisState {
  const { result, sourceData, sourceVoices } = analyzeScenario(p10Scenario(id));
  return { status: "done", result: { ...result, fileName: `${id}.mid`, sourceFingerprint: "fnv1a32-p10test" }, sourceData, sourceVoices } as AnalysisState;
}

async function renderCapture(analysis: AnalysisState, overrides: Partial<Parameters<typeof CaptureView>[0]> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <CaptureView
      ideas={[]}
      analysis={analysis}
      analyzeMidiBytes={vi.fn()}
      clearAnalysis={vi.fn()}
      createIdeaFromDraft={vi.fn()}
      appendBlockToIdea={vi.fn()}
      updateIdea={vi.fn()}
      setToast={vi.fn()}
      copy={appCopy.ja}
      showRomanNumerals
      {...overrides}
    />,
  ));
  return {
    container,
    root,
    async dispose() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const buttons = (scope: ParentNode, text: string) => [...scope.querySelectorAll<HTMLButtonElement>("button")]
  .filter((button) => button.textContent?.trim() === text);

/** A range (the first recommended one, or the first segment band), then 「Vaultに保存」 in the save form. */
async function openSaveForRecommendedRange(container: HTMLElement, from: "recommended" | "segment" = "recommended") {
  const picker = container.querySelector<HTMLButtonElement>(from === "recommended" ? '[data-testid="correction-recommended"] button' : '[data-testid="correction-segment"]');
  await act(async () => picker?.click());
  const saveForm = container.querySelector<HTMLElement>('[data-testid="correction-save-form"]')!;
  await act(async () => buttons(saveForm, "Vaultに保存")[0]?.click());
}

describe("CaptureView helpers", () => {
  it("recognizes text editing targets for shortcut guards", () => {
    expect(isEditableKeyboardTarget(document.createElement("input"))).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement("select"))).toBe(true);
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(isEditableKeyboardTarget(editable)).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement("button"))).toBe(false);
  });

  it("builds the initial save title in the documented priority order", () => {
    expect(captureSaveTitle(candidate(), "song.mid", "C major", appCopy.ja))
      .toBe("song.mid · 1–4小節");
    expect(captureSaveTitle(candidate(), undefined, "C major", appCopy.ja))
      .toBe("C major · 1–4小節");
    expect(captureSaveTitle(candidate(), undefined, undefined, appCopy.ja))
      .toBe("main - intro-like");
    expect(captureSaveTitle(candidate({ summaryText: "" }), undefined, undefined, appCopy.ja))
      .toBe("保存した進行");
  });

  it("preserves an existing memo and appends progression text on a new line", () => {
    expect(appendProgressionMemo("Existing memo", "| C | G |"))
      .toBe("Existing memo\n| C | G |");
    expect(appendProgressionMemo("Existing memo\n", "| C | G |"))
      .toBe("Existing memo\n| C | G |");
  });

  it.each([false, "pending"] as const)(
    "does not announce or report a copied memo for %s persistence",
    (outcome) => {
      const idea = makeIdea({ chordMemo: "Existing memo" });
      const updateIdea = vi.fn(() => outcome);
      const onCopied = vi.fn();
      expect(persistCopiedProgressionMemo(idea, candidate(), updateIdea, onCopied)).toBe(false);
      expect(updateIdea).toHaveBeenCalledWith(idea.id, {
        chordMemo: expect.stringContaining("Existing memo\n"),
      });
      expect(onCopied).not.toHaveBeenCalled();
    },
  );

  it("renders an honest indeterminate analysis progress stage", () => {
    const markup = renderToStaticMarkup(
      <CaptureAnalysisProgress stage="analyzing" copy={appCopy.ja} />,
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain("解析中");
    expect(markup).not.toContain("%");
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
    expect(captureAnalysisIdentity(base)).not.toBe(captureAnalysisIdentity({ ...base, analyzedAt: "2026-07-15T00:01:00.000Z" }));
    expect(captureAnalysisIdentity(base)).not.toBe(captureAnalysisIdentity({ ...base, sourceAssetId: "22222222-2222-4222-8222-222222222222" }));
    expect(captureAnalysisIdentity({ ...base, sourceFingerprint: "sha256-stable" })).toBe("fingerprint:sha256-stable");
  });

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

describe("CaptureView result (the correction workspace, P10.0-07)", () => {
  it("opens the workspace for an analysis with its source notes, with no old candidate cards", async () => {
    const view = await renderCapture(workspaceAnalysis());
    expect(view.container.querySelector('[data-testid="correction-workspace"]')).not.toBeNull();
    expect(view.container.querySelector("[data-candidate-toggle]")).toBeNull();
    expect(view.container.querySelectorAll('[data-testid="correction-card"]').length).toBeGreaterThan(0);
    await view.dispose();
  });

  it("shows a notice and a way back for a result without its source notes", async () => {
    const { result } = analyzeScenario(p10Scenario("plain-8"));
    const view = await renderCapture({ status: "done", result });
    expect(view.container.querySelector('[data-testid="correction-workspace"]')).toBeNull();
    expect(view.container.textContent).toContain("この解析結果は修正作業場で開けません");
    expect(buttons(view.container, "MIDI を選び直す")).toHaveLength(1);
    await view.dispose();
  });

  it("keeps an empty zero-bar analysis renderable", async () => {
    const analysis = workspaceAnalysis();
    const empty = { ...analysis, result: { ...analysis.result!, totalBars: 0, fullTimeline: [], blockCandidates: [] } } as AnalysisState;
    const view = await renderCapture(empty);
    expect(view.container.querySelector('[data-testid="correction-workspace"]')).not.toBeNull();
    expect(view.container.querySelectorAll('[data-testid="correction-card"]')).toHaveLength(0);
    expect(view.container.textContent).toContain("カードがありません");
    await view.dispose();
  });

  it("renders an actionable alert when aggregate persistence rejects the save", async () => {
    const message = "Vault全体が16 MiBを超えるため保存できません。不要な項目を削除してください。";
    const createIdeaFromDraft = vi.fn((draft: { progressionMetadata?: { onPersistenceError?: (message: string) => void } }) => {
      draft.progressionMetadata?.onPersistenceError?.(message);
      return undefined;
    });
    const view = await renderCapture(workspaceAnalysis(), { createIdeaFromDraft });
    await openSaveForRecommendedRange(view.container);
    const dialog = view.container.querySelector<HTMLElement>('[role="dialog"]');
    await act(async () => {
      dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
      await Promise.resolve();
    });
    expect(createIdeaFromDraft).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(message);
    await view.dispose();
  });

  it("appends correction feedback only after a save with a person's name succeeds", async () => {
    feedbackSpies.append.mockClear();
    feedbackSpies.appendLabelCorrections.mockClear();
    let saveSucceeds = false;
    const createIdeaFromDraft = vi.fn(() => saveSucceeds ? "22222222-2222-4222-8222-222222222222" : undefined);
    const setToast = vi.fn();
    const view = await renderCapture(workspaceAnalysis(), { createIdeaFromDraft, setToast });

    // A person picks the second name candidate for the first card.
    const candidates = view.container.querySelectorAll<HTMLButtonElement>('[data-testid="correction-name-candidates"] button');
    const picked = candidates[1]!.querySelector(".lv-cw-alt-name")!.textContent!;
    await act(async () => candidates[1]!.click());
    expect(view.container.querySelector('[data-testid="correction-inspector-name"]')?.textContent).toBe(picked);

    // The segment band covers the renamed first card.
    await openSaveForRecommendedRange(view.container, "segment");
    const save = () => buttons(document.body, "保存").find((button) => button.closest('[role="dialog"]'));
    await act(async () => save()?.click());
    expect(createIdeaFromDraft).toHaveBeenCalledTimes(1);
    expect(feedbackSpies.append).not.toHaveBeenCalled();
    expect(feedbackSpies.appendLabelCorrections).not.toHaveBeenCalled();

    saveSucceeds = true;
    feedbackSpies.append.mockRejectedValueOnce(new Error("feedback write failed"));
    await act(async () => save()?.click());
    expect(createIdeaFromDraft).toHaveBeenCalledTimes(2);
    expect(createIdeaFromDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        progressionBlock: expect.objectContaining({
          chords: expect.arrayContaining([expect.objectContaining({ chord: expect.objectContaining({ label: picked }) })]),
        }),
      }),
      { stayOnCapture: true },
    );
    expect(feedbackSpies.append).toHaveBeenCalledTimes(1);
    expect(feedbackSpies.append).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ corrected: picked }),
      expect.objectContaining({ eventType: "progression-save", userEdited: true }),
    ]));
    expect(feedbackSpies.appendLabelCorrections).toHaveBeenCalledTimes(1);
    expect(feedbackSpies.appendLabelCorrections).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ schemaVersion: 1, finalSavedLabel: picked }),
    ]));
    await act(async () => Promise.resolve());
    expect(setToast).toHaveBeenCalledWith("feedback write failed", "error");
    // Saved: the workspace stays, the range is marked.
    expect(view.container.querySelector('[data-testid="correction-save-range"]')?.textContent).toContain("保存済み");
    await view.dispose();
  });
});
