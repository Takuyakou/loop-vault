// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalysisSessionVoice } from "../../domain/midi/preAnalysis/types";
import type { SourceBasslineCaptureAssessment } from "../../domain/sourceBassline";
import { SourceBasslineCapturePanel } from "./SourceBasslineCapturePanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const voice = {
  id: "voice-a",
  displayName: "Bass candidate 1",
} as AnalysisSessionVoice;
const available = {
  bars: 2,
  noteCount: 4,
  hasSimultaneousNotes: true,
  hasOverlappingNotes: true,
  rangeKey: "candidate:1:2",
  snapshot: {} as SourceBasslineCaptureAssessment["snapshot"],
} satisfies SourceBasslineCaptureAssessment;
let host: HTMLDivElement;

afterEach(() => host?.remove());

function render(overrides: Partial<React.ComponentProps<typeof SourceBasslineCapturePanel>> = {}) {
  host = document.createElement("div");
  host.style.width = "320px";
  document.body.append(host);
  const onVoiceChange = vi.fn();
  const onRangeChange = vi.fn();
  const onOptInChange = vi.fn();
  const root = createRoot(host);
  act(() => root.render(
    <SourceBasslineCapturePanel
      voices={[voice]}
      selectedVoiceId=""
      assessment={{ ...available, snapshot: undefined, reason: "select-voice" }}
      rangeSelected={false}
      optedIn={false}
      onVoiceChange={onVoiceChange}
      onRangeChange={onRangeChange}
      onOptInChange={onOptInChange}
      {...overrides}
    />,
  ));
  return { onVoiceChange, onRangeChange, onOptInChange };
}

describe("SourceBasslineCapturePanel", () => {
  it("defaults OFF with no silent Voice or range selection and native keyboard controls", () => {
    render();
    const selects = host.querySelectorAll("select");
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(selects[0]?.value).toBe("");
    expect(selects[1]?.value).toBe("");
    expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(true);
    expect(selects[0]?.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("emits explicit Voice, range, and opt-in choices through semantic controls", () => {
    const events = render({
      selectedVoiceId: voice.id,
      assessment: available,
      rangeSelected: true,
    });
    const voiceSelect = host.querySelectorAll("select")[0]!;
    const rangeSelect = host.querySelectorAll("select")[1]!;
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    act(() => {
      voiceSelect.value = voice.id;
      voiceSelect.dispatchEvent(new Event("change", { bubbles: true }));
      rangeSelect.value = available.rangeKey;
      rangeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      toggle.click();
    });
    expect(events.onVoiceChange).toHaveBeenCalledWith(voice.id);
    expect(events.onRangeChange).toHaveBeenCalledWith(true);
    expect(events.onOptInChange).toHaveBeenCalledWith(true);
  });

  it("keeps JA/EN disclosure, live facts, and narrow-width wrapping semantics", () => {
    render({
      selectedVoiceId: voice.id,
      assessment: available,
      rangeSelected: true,
      optedIn: true,
    });
    expect(host.textContent).toContain("元ベースラインを練習用に保存");
    expect(host.textContent).toContain("Vault書き出しに含まれます");
    expect(host.textContent).toContain("4音・2小節・同時発音あり・重なりあり");
    expect(host.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(host.querySelector("section")?.className).toContain("min-w-0");
    expect(host.querySelector("select")?.className).toContain("max-w-full");
  });

  it("disables Voice selection with an explicit described reason when no Voice is eligible", () => {
    render({ voices: [] });
    const voiceSelect = host.querySelector<HTMLSelectElement>("select");
    expect(voiceSelect?.disabled).toBe(true);
    const describedBy = voiceSelect?.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(describedBy.length).toBeGreaterThanOrEqual(2);
    expect(describedBy.some((id) => document.getElementById(id)?.textContent
      ?.includes("保存可能なBass Voiceがありません。"))).toBe(true);
  });

  it("describes disabled range and opt-in controls", () => {
    const expectedReason = "先にBass Voiceを選択してください。";
    render();
    const rangeSelect = host.querySelectorAll<HTMLSelectElement>("select")[1]!;
    const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(rangeSelect.disabled).toBe(true);
    expect(toggle.disabled).toBe(true);
    for (const control of [rangeSelect, toggle]) {
      const descriptions = control.getAttribute("aria-describedby")?.split(" ") ?? [];
      expect(descriptions.some((id) => document.getElementById(id)?.textContent?.includes(expectedReason)))
        .toBe(true);
    }
  });
});
