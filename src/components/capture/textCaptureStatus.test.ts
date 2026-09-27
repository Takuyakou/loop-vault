import { describe, expect, it } from "vitest";
import { textCaptureSaveReason, textCaptureStatus, textCaptureSummary } from "./textCaptureStatus";

const base = {
  bars: 0, annotations: 0, meterLabel: "4/4", bpm: null, keyLabel: null,
  errors: 0, warnings: 0, practiceLimits: 0, hasSource: false,
} as const;

describe("shared Text Capture status", () => {
  it("treats pristine empty text as a disabled, diagnostic-free source in both readers", () => {
    const standard = textCaptureStatus(base);
    const extended = textCaptureStatus({ ...base, annotations: 0 });
    expect(standard).toEqual(extended);
    expect(standard.saveState).toBe("empty");
    expect(textCaptureSummary(standard)).toBe("0小節 · 注記0 · 4/4 · BPM — · キー 未確定");
    expect(textCaptureSaveReason(standard)).toBe("コード進行を入れると保存できます");
  });

  it("keeps audition 120 out of the source status until BPM is explicitly supplied", () => {
    const implicit = textCaptureStatus({ ...base, bars: 2, hasSource: true });
    const explicit = textCaptureStatus({ ...base, bars: 2, bpm: 120, hasSource: true });
    expect(textCaptureSummary(implicit)).toContain("BPM —");
    expect(textCaptureSummary(explicit)).toContain("BPM 120");
  });

  it("uses the same save reason ordering for invalid, key-pending, and ready sources", () => {
    const invalid = textCaptureStatus({ ...base, hasSource: true, errors: 2 });
    const keyPending = textCaptureStatus({ ...base, hasSource: true });
    const ready = textCaptureStatus({ ...base, hasSource: true, keyLabel: "C major" });
    expect(textCaptureSaveReason(invalid)).toBe("エラー2件を修正すると保存できます");
    expect(textCaptureSaveReason(keyPending)).toContain("キーを決める");
    expect(textCaptureSaveReason(ready)).toBe("保存できます");
  });

  it("preserves extended annotations, warnings, meter, and practice limits in the common model", () => {
    const model = textCaptureStatus({ ...base, bars: 3, annotations: 2, meterLabel: "7/4",
      bpm: 88, warnings: 1, practiceLimits: 1, hasSource: true });
    expect(model).toMatchObject({ annotations: 2, warnings: 1, practiceLimits: 1 });
    expect(textCaptureSummary(model)).toBe("3小節 · 注記2 · 7/4 · BPM 88 · キー 未確定");
  });
});