// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisSession } from "../domain/midi/preAnalysis/types";
import type { ProgressionBlockCandidate } from "../domain/types";
import { sourceBasslineAnalysisAuthority, type SourceBasslineSnapshotV1 } from "../domain/sourceBassline";
import { appCopy } from "../i18n";
import { ProgressionCandidateCard } from "./CaptureView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
afterEach(() => host?.remove());

const candidate: ProgressionBlockCandidate = {
  id: "candidate",
  startBar: 1,
  endBar: 2,
  lengthBars: 2,
  chords: [{
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: { root: 0, quality: "maj7", tensions: [], label: "Cmaj7" },
    confidence: 1,
    alternatives: [],
    warnings: [],
  }],
  summaryText: "Synthetic",
  confidence: 1,
  labels: [],
  warnings: [],
};

function session(): AnalysisSession {
  return {
    id: "session",
    masterSourceId: "source",
    sources: [{ id: "source", displayName: "Synthetic", smfType: 1, ppq: 480, durationBeats: 8, durationTick: 3840, tempoMap: [{ beat: 0, bpm: 120 }], timeSignatures: [{ beat: 0, numerator: 4, denominator: 4 }], bytes: new Uint8Array(), visible: true, muted: false }],
    voices: [{ id: "bass", sourceId: "source", trackIndex: 0, channel: 0, programNumbers: [33], displayName: "Bass candidate", hasProgramChanges: false, isDrum: false, noteCount: 2, autoRole: "bass", autoRoleConfidence: 1, assignedRole: "bass", included: true, visible: true, muted: false, solo: false }],
    notes: [
      { sourceId: "source", voiceId: "bass", trackIndex: 0, channel: 0, pitch: 36, velocity: 0.8, startBeat: 0, durationBeats: 1, startTick: 0, durationTick: 480, ticksPerQuarter: 480 },
      { sourceId: "source", voiceId: "bass", trackIndex: 0, channel: 0, pitch: 38, velocity: 0.8, startBeat: 7, durationBeats: 1, startTick: 3360, durationTick: 480, ticksPerQuarter: 480 },
    ],
    controlChanges: [],
    preset: "custom",
    warnings: [],
  };
}

describe("Capture source bassline save integration", () => {
  it("passes a validated snapshot only after explicit Voice, range and opt-in, then resets opt-in", async () => {
    host = document.createElement("div");
    document.body.append(host);
    const onCreate = vi.fn<(
      (...args: [unknown, unknown, unknown, unknown, unknown, unknown, SourceBasslineSnapshotV1?]) => boolean
    )>(() => true);
    const root = createRoot(host);
    const analysisSession = session();
    const sourceFingerprint = sourceBasslineAnalysisAuthority(analysisSession);
    if (!sourceFingerprint) throw new Error("Synthetic analysis authority is required.");
    const card = (fingerprint: string, generation = 1) => (
      <ProgressionCandidateCard
        candidate={candidate}
        candidateIndex={0}
        bpm={96}
        sourceBasslineSession={analysisSession}
        sourceBasslineAnalysisGeneration={generation}
        sourceFingerprint={fingerprint}
        onCreate={onCreate}
        onAppend={vi.fn(() => true)}
        onCopyMemo={vi.fn(() => true)}
        onCopyProgression={vi.fn()}
        onPreviewChord={vi.fn()}
        copy={appCopy.ja}
        isExpanded
      />
    );
    await act(async () => root.render(card(sourceFingerprint)));
    const panel = host.querySelector('[data-testid="source-bassline-capture-panel"]')!;
    const chordCard = host.querySelector("[data-chord-card]")!;
    const details = host.querySelector("[data-chord-inspector]")!;
    expect(chordCard.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(panel.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const selects = panel.querySelectorAll<HTMLSelectElement>("select");
    const optIn = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(selects[0]!.value).toBe("");
    expect(optIn.checked).toBe(false);
    await act(async () => {
      selects[0]!.value = "bass";
      selects[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const currentSelects = panel.querySelectorAll<HTMLSelectElement>("select");
    await act(async () => {
      currentSelects[1]!.value = "candidate:1:2";
      currentSelects[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => optIn.click());
    expect(optIn.checked).toBe(true);

    await act(async () => root.render(card("changed-analysis-fingerprint")));
    expect(optIn.checked).toBe(false);
    expect(selects[0]!.value).toBe("");
    expect(selects[1]!.value).toBe("");
    expect(optIn.disabled).toBe(true);
    await act(async () => root.render(card(sourceFingerprint)));
    expect(selects[0]!.value).toBe("");

    await act(async () => {
      selects[0]!.value = "bass";
      selects[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      selects[1]!.value = "candidate:1:2";
      selects[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => optIn.click());
    expect(optIn.checked).toBe(true);

    await act(async () => root.render(card(sourceFingerprint, 2)));
    expect(selects[0]!.value).toBe("");
    expect(selects[1]!.value).toBe("");
    expect(optIn.checked).toBe(false);
    expect(optIn.disabled).toBe(true);

    await act(async () => {
      selects[0]!.value = "bass";
      selects[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      selects[1]!.value = "candidate:1:2";
      selects[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => optIn.click());
    expect(optIn.checked).toBe(true);

    const open = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Vaultに保存")!;
    expect(open.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await act(async () => open.click());
    const form = host.querySelector<HTMLFormElement>('form[role="dialog"]')!;
    await act(async () => form.requestSubmit());
    expect(onCreate).toHaveBeenCalledOnce();
    const stored = onCreate.mock.calls[0]![6];
    expect(stored?.sourceKind).toBe("selected-bass-voice");
    expect(stored?.notes).toHaveLength(2);
    expect(JSON.stringify(stored)).not.toMatch(/voiceId|sourceId|displayName|path|filename|device|bytes/i);
    expect(optIn.checked).toBe(false);
    await act(async () => root.unmount());
  });
});
