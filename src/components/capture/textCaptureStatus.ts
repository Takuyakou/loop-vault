
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

export function textCaptureSummary(model: TextCaptureStatusModel): string {
  return `${model.bars}小節 · 注記${model.annotations} · ${model.meterLabel} · BPM ${model.bpm ?? "—"} · キー ${model.keyLabel ?? "未確定"}`;
}

export function textCaptureSaveReason(model: TextCaptureStatusModel): string {
  if (model.saveState === "empty") return "コード進行を入れると保存できます";
  if (model.saveState === "invalid") return `エラー${model.errors}件を修正すると保存できます`;
  if (model.saveState === "key-pending") return "Bass Practice・Chord Context は保存後にキーを決めると使えます";
  return "保存できます";
}