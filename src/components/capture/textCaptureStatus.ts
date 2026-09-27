import type { AppLanguage } from "../../i18n";

export interface TextCaptureStatusModel {
  readonly bars: number;
  readonly annotations: number;
  readonly meterLabel: string;
  readonly bpm: number | null;
  readonly keyLabel: string | null;
  readonly errors: number;
  readonly warnings: number;
  readonly practiceLimits: number;
  readonly saveState: "empty" | "invalid" | "key-pending" | "ready";
}

export function textCaptureStatus(input: Omit<TextCaptureStatusModel, "saveState"> & { readonly hasSource: boolean }): TextCaptureStatusModel {
  const { hasSource, ...fields } = input;
  return {
    ...fields,
    saveState: !hasSource ? "empty" : fields.errors > 0 ? "invalid" : !fields.keyLabel ? "key-pending" : "ready",
  };
}

export function textCaptureSummary(model: TextCaptureStatusModel, language: AppLanguage): string {
  if (language === "ja") {
    return `${model.bars}小節 · 注記${model.annotations} · ${model.meterLabel} · BPM ${model.bpm ?? "—"} · キー ${model.keyLabel ?? "未確定"}`;
  }
  return `${model.bars} bars · ${model.annotations} annotations · ${model.meterLabel} · BPM ${model.bpm ?? "—"} · Key ${model.keyLabel ?? "unset"}`;
}

export function textCaptureSaveReason(model: TextCaptureStatusModel, language: AppLanguage): string {
  if (model.saveState === "empty") return language === "ja" ? "コード進行を入れると保存できます" : "Enter a progression to save it";
  if (model.saveState === "invalid") return language === "ja"
    ? `エラー${model.errors}件を修正すると保存できます` : `Fix ${model.errors} errors before saving`;
  if (model.saveState === "key-pending") return language === "ja"
    ? "Bass Practice・Chord Context は保存後にキーを決めると使えます"
    : "Set a key after saving to use Bass Practice and Chord Context";
  return language === "ja" ? "保存できます" : "Ready to save";
}