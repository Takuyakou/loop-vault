import { Clipboard, Plus, Save, Tags } from "lucide-react";
import type { AdvisorSuggestion } from "../../domain/progressionAdvisor";
import type { AppLanguage } from "../../domain/types";

interface Props {
  suggestion: AdvisorSuggestion;
  language: AppLanguage;
  onAppend: () => void;
  onSave: () => void;
  onCopy: () => void;
  onApplyTags: () => void;
}

export function AdvisorSuggestionCard({ suggestion, language, onAppend, onSave, onCopy, onApplyTags }: Props) {
  const ja = language === "ja";
  return (
    <article className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase text-[var(--lv-accent)]">{strategyLabel(suggestion.strategy, language)}</p><h3 className="mt-1 font-semibold">{suggestion.label}</h3></div>
        <span className="text-xs text-[var(--lv-text-muted)]">8 bars · 4/4</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-1 text-center text-sm sm:grid-cols-4">
        {suggestion.events.map((event, index) => <span key={`${event.bar}-${event.startBeat}-${index}`} className="border border-[var(--lv-border)] px-2 py-2 font-semibold">{event.chord}</span>)}
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--lv-text-secondary)]">{suggestion.intent}</p>
      {suggestion.suggestedTagIds.length ? <p className="mt-2 text-xs text-[var(--lv-text-muted)]">{suggestion.suggestedTagIds.join(" · ")}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="lv-button-primary inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold" onClick={onAppend}><Plus aria-hidden="true" size={16} />{ja ? "下書きへ追加" : "Append to draft"}</button>
        <button type="button" className="lv-button-secondary inline-flex items-center gap-2 px-3 py-2 text-sm" onClick={onSave}><Save aria-hidden="true" size={16} />{ja ? "新しい進行として保存" : "Save as new"}</button>
        <button type="button" className="lv-button-ghost inline-flex h-9 w-9 items-center justify-center" aria-label={ja ? "コピー" : "Copy"} title={ja ? "コピー" : "Copy"} onClick={onCopy}><Clipboard aria-hidden="true" size={16} /></button>
        <button type="button" className="lv-button-ghost inline-flex h-9 w-9 items-center justify-center" aria-label={ja ? "タグを適用" : "Apply tags"} title={ja ? "タグを適用" : "Apply tags"} onClick={onApplyTags}><Tags aria-hidden="true" size={16} /></button>
      </div>
    </article>
  );
}

function strategyLabel(strategy: AdvisorSuggestion["strategy"], language: AppLanguage): string {
  const labels = language === "ja"
    ? { close_development: "自然な展開", contrast: "対照的", experimental: "実験的" }
    : { close_development: "Close development", contrast: "Contrast", experimental: "Experimental" };
  return labels[strategy];
}
