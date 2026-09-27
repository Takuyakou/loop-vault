import type { AppLanguage } from "../../i18n";
import type { TextCaptureStatusModel } from "./textCaptureStatus";

export function TextCapturePreviewStatus({ model, language }: {
  readonly model: TextCaptureStatusModel;
  readonly language: AppLanguage;
}) {
  const ja = language === "ja";
  return <>
    {!model.errors && !model.warnings ? <span className="text-xs text-[var(--lv-text-muted)]">
      {ja ? "エラーなし" : "No errors"}
    </span> : null}
    {model.errors > 0 ? <span className="rounded border border-[var(--lv-danger)] px-2 py-1 text-xs text-[var(--lv-danger)]">
      {ja ? "エラー" : "Errors"} {model.errors}
    </span> : null}
    {model.warnings > 0 ? <span className="rounded border border-[var(--lv-warning)] px-2 py-1 text-xs text-[var(--lv-warning)]">
      {ja ? "注意" : "Warnings"} {model.warnings}
    </span> : null}
    {model.practiceLimits > 0 ? <span className="rounded border border-[var(--lv-border)] px-2 py-1 text-xs">
      {ja ? "練習制限あり" : "Practice limited"}
    </span> : null}
  </>;
}