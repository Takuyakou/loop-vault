import type { ReactNode } from "react";

interface Props {
  readonly dialect: "standard" | "extended";
  readonly draftActive: boolean;
  readonly children: ReactNode;
}

/** Both readers occupy the same flat Capture workspace. */
export function TextCaptureShell({ dialect, draftActive, children }: Props) {
  return <section className="lv-text-capture-root" data-testid="text-progression-capture" data-text-dialect={dialect}>
    {draftActive ? <p data-testid="text-draft-authoritative" className="mb-2 border border-[var(--lv-border)] px-3 py-2 text-xs text-[var(--lv-text-muted)]">
      {"変換後のDraftが現在の正本です。保存または破棄してから入力を変更してください。"}
    </p> : null}
    {children}
  </section>;
}
