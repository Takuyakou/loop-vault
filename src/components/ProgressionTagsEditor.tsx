import { useMemo, useState, type FormEvent } from "react";
import {
  classifyProgression,
  progressionTagLabel,
  restoreAutoTag,
  suppressAutoTag,
} from "../domain/progressionClassification/mod";
import type { SavedProgressionBlock } from "../domain/types";
import { progressionTagsCopy } from "../i18n";
import { Plus, X } from "lucide-react";

interface ProgressionTagsEditorProps {
  block: SavedProgressionBlock;
  keySignature?: string;
  onChange: (changes: Pick<SavedProgressionBlock, "tags" | "suppressedAutoTags">) => void;
}

export function ProgressionTagsEditor({
  block,
  keySignature,
  onChange,
}: ProgressionTagsEditorProps) {
  const text = progressionTagsCopy.ja;
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
    <div className="lv-tags-editor">
      <section className="lv-tags-col">
        <h3 className="lv-tags-title">
          {text.manualTitle}
        </h3>
        <form className="lv-tags-add" onSubmit={addTag}>
          <input
            name="progression-tag"
            autoComplete="off"
            aria-label={text.manualTitle}
            className="lv-tags-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={text.placeholder}
            maxLength={80}
          />
          <button
            type="submit"
            className="lv-tags-add-btn"
            disabled={!input.trim()}
            aria-label={text.add}
            title={text.add}
          >
            <Plus aria-hidden="true" size={16} />
          </button>
        </form>
        <div className="lv-tags-list">
          {block.tags.length > 0 ? block.tags.map((tag) => (
            <span key={tag} className="lv-tag-chip" data-kind="manual">
              {displayManualTag(tag)}
              <button
                type="button"
                className="lv-tag-x"
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
          )) : <span className="lv-tags-empty">{text.noManualTags}</span>}
        </div>
      </section>

      <section className="lv-tags-col">
        <h3 className="lv-tags-title">
          {text.autoTitle}
        </h3>
        <div className="lv-tags-list">
          {derivedTags.length > 0 ? derivedTags.map((tag) => {
            const label = progressionTagLabel(tag.tagId);
            return (
              <span
                key={tag.tagId}
                className="lv-tag-chip"
                data-kind="auto"
                title={tag.reasons.join(" ")}
              >
                {label}
                <button
                  type="button"
                  className="lv-tag-x"
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
          }) : <span className="lv-tags-empty">{text.noAutoTags}</span>}
        </div>

        {(block.suppressedAutoTags?.length ?? 0) > 0 ? (
          <div className="lv-tags-suppressed">
            <p className="lv-tags-sub">{text.suppressedTitle}</p>
            <div className="lv-tags-list">
              {block.suppressedAutoTags?.map((tag) => {
                const label = progressionTagLabel(tag.tagId);
                return (
                  <button
                    key={`${tag.tagId}:${tag.taxonomyVersion}`}
                    type="button"
                    className="lv-tag-chip"
                    data-kind="off"
                    onClick={() => onChange({
                      tags: block.tags,
                      suppressedAutoTags: restoreAutoTag(block.suppressedAutoTags, tag.tagId),
                    })}
                    title={text.restore(label)}
                  >
                    {label}
                    <Plus aria-hidden="true" size={16} />
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

export function displayManualTag(tag: string): string {
  return tag.replace(/^[a-z][a-z0-9-]*:/, "");
}
