import { useMemo, useState, type FormEvent } from "react";
import {
  classifyProgression,
  progressionTagLabel,
  restoreAutoTag,
  suppressAutoTag,
} from "../domain/progressionClassification/mod";
import type { SavedProgressionBlock } from "../domain/types";
import { progressionTagsCopy, type AppLanguage } from "../i18n";
import { Plus, RotateCcw, X } from "lucide-react";

interface ProgressionTagsEditorProps {
  block: SavedProgressionBlock;
  keySignature?: string;
  language: AppLanguage;
  onChange: (changes: Pick<SavedProgressionBlock, "tags" | "suppressedAutoTags">) => void;
}

export function ProgressionTagsEditor({
  block,
  keySignature,
  language,
  onChange,
}: ProgressionTagsEditorProps) {
  const text = progressionTagsCopy[language];
  const [input, setInput] = useState("");
  const classification = useMemo(
    () => classifyProgression({ block, key: keySignature }),
    [block, keySignature],
  );
  const derivedTags = [
    ...classification.sourceTags,
    ...classification.featureTags,
    ...classification.useTags,
    ...classification.moodTags,
  ];

  function addTag(event: FormEvent) {
    event.preventDefault();
    const tag = input.trim();
    if (!tag || block.tags.includes(tag)) return;
    onChange({
      tags: [...block.tags, tag],
      suppressedAutoTags: block.suppressedAutoTags ?? [],
    });
    setInput("");
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section>
        <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
          {text.manualTitle}
        </p>
        <form className="mt-2 flex gap-2" onSubmit={addTag}>
          <input
            className="min-w-0 flex-1 border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] px-3 py-2 text-sm"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={text.placeholder}
            maxLength={80}
          />
          <button
            type="submit"
            className="lv-button-secondary grid h-9 w-9 place-items-center disabled:opacity-40"
            disabled={!input.trim()}
            aria-label={text.add}
            title={text.add}
          >
            <Plus aria-hidden="true" size={16} />
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {block.tags.length > 0 ? block.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 bg-[var(--lv-surface-raised)] px-2 py-1 text-xs">
              {displayManualTag(tag)}
              <button
                type="button"
                className="grid h-5 w-5 place-items-center text-[var(--lv-text-muted)] hover:text-[var(--lv-text)]"
                onClick={() => onChange({
                  tags: block.tags.filter((entry) => entry !== tag),
                  suppressedAutoTags: block.suppressedAutoTags ?? [],
                })}
                aria-label={text.remove(displayManualTag(tag))}
                title={text.remove(displayManualTag(tag))}
              >
                <X aria-hidden="true" size={16} />
              </button>
            </span>
          )) : <span className="text-sm text-[var(--lv-text-muted)]">{text.noManualTags}</span>}
        </div>
      </section>

      <section>
        <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
          {text.autoTitle}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {derivedTags.length > 0 ? derivedTags.map((tag) => {
            const label = progressionTagLabel(tag.tagId, language);
            return (
              <span
                key={tag.tagId}
                className="inline-flex items-center gap-1 border border-teal-400/40 bg-teal-300/10 px-2 py-1 text-xs text-teal-100"
                title={tag.reasons.join(" ")}
              >
                {label}
                <button
                  type="button"
                  className="grid h-5 w-5 place-items-center text-teal-200 hover:text-white"
                  onClick={() => onChange({
                    tags: block.tags,
                    suppressedAutoTags: suppressAutoTag(block.suppressedAutoTags, tag.tagId),
                  })}
                  aria-label={text.suppress(label)}
                  title={text.suppress(label)}
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </span>
            );
          }) : <span className="text-sm text-[var(--lv-text-muted)]">{text.noAutoTags}</span>}
        </div>

        {(block.suppressedAutoTags?.length ?? 0) > 0 ? (
          <div className="mt-3 border-t border-[var(--lv-border)] pt-3">
            <p className="text-xs text-[var(--lv-text-muted)]">{text.suppressedTitle}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {block.suppressedAutoTags?.map((tag) => {
                const label = progressionTagLabel(tag.tagId, language);
                return (
                  <button
                    key={`${tag.tagId}:${tag.taxonomyVersion}`}
                    type="button"
                    className="inline-flex items-center gap-1 border border-[var(--lv-border)] px-2 py-1 text-xs text-[var(--lv-text-secondary)]"
                    onClick={() => onChange({
                      tags: block.tags,
                      suppressedAutoTags: restoreAutoTag(block.suppressedAutoTags, tag.tagId),
                    })}
                    title={text.restore(label)}
                  >
                    <RotateCcw aria-hidden="true" size={16} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function displayManualTag(tag: string): string {
  return tag.replace(/^[a-z][a-z0-9-]*:/, "");
}
