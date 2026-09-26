import type { ReactNode } from "react";
import type { AppLanguage } from "../../i18n";

interface Props {
  readonly language: AppLanguage;
  readonly dialect: "standard" | "extended";
  readonly draftActive: boolean;
  readonly modeSelector: ReactNode;
  readonly children: ReactNode;
}

/** One compact product identity and syntax switch for both text readers. */
export function TextCaptureShell({ language, dialect, draftActive, modeSelector, children }: Props) {
  const ja = language === "ja";
  return <section className="border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-4" data-testid="text-progression-capture">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">
          {ja ? "テキスト進行" : "Text progression"}
        </p>
        <h2 className="mt-1 text-2xl font-semibold">{ja ? "コード進行を入力" : "Enter chord progression"}</h2>
        <p className="mt-1 text-sm text-[var(--lv-text-muted)]">
          {ja ? "進行を入力し、譜面を確認して試聴します。" : "Enter a progression, inspect the score, and audition it."}
        </p>
      </div>
      {draftActive ? <p data-testid="text-draft-authoritative" className="border border-[var(--lv-border)] px-3 py-2 text-xs text-[var(--lv-text-muted)]">
        {ja ? "変換後のDraftが現在の正本です。保存または破棄してから入力を変更してください。"
          : "The converted Draft is authoritative. Save or discard it before editing text."}
      </p> : null}
    </header>
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--lv-border)] pt-3">
      {modeSelector}
      <span className="text-xs text-[var(--lv-text-muted)]" data-testid="text-mode-legend">
        {dialect === "extended"
          ? ja ? "拡張: | 小節、% 再発音、= 保持、_ 休符" : "Extended: | bars, % reattack, = hold, _ rest"
          : ja ? "通常: 4/4、各小節1・2・4セル" : "Standard: 4/4, 1, 2, or 4 cells per bar"}
      </span>
    </div>
    {children}
  </section>;
}
