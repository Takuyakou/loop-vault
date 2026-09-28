import type { TextCaptureStatusModel } from "./textCaptureStatus";

export function TextCapturePreviewStatus({ model }: {
  readonly model: TextCaptureStatusModel;
}) {
  return <>
    {!model.errors && !model.warnings ? <span className="text-xs text-[var(--lv-text-muted)]">
      {"エラーなし"}
    </span> : null}
    {model.errors > 0 ? <span className="rounded border border-[var(--lv-danger)] px-2 py-1 text-xs text-[var(--lv-danger)]">
      {"エラー"} {model.errors}
    </span> : null}
    {model.warnings > 0 ? <span className="rounded border border-[var(--lv-warning)] px-2 py-1 text-xs text-[var(--lv-warning)]">
      {"注意"} {model.warnings}
    </span> : null}
    {model.practiceLimits > 0 ? <span className="rounded border border-[var(--lv-border)] px-2 py-1 text-xs">
      {"練習制限あり"}
    </span> : null}
  </>;
}