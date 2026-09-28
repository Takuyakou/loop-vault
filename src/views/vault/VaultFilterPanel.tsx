import { useState, type ReactNode } from "react";
import { displayKey } from "../../domain/displayLabels";
import { progressionTagLabel } from "../../domain/progressionClassification/mod";
import { progressionSourceLabels, type ProgressionSourceKind } from "./progressionFacts";
import {
  lengthBucketLabels,
  lengthBuckets,
  sourceKinds,
  type LengthBucket,
  type VaultFilters,
  type VaultResult,
} from "./vaultLibrary";

const TAG_LIMIT = 8;

export interface VaultFilterPanelProps {
  filters: VaultFilters;
  counts: VaultResult["counts"];
  activeCount: number;
  onToggle: <K extends "keys" | "lengths" | "tags" | "sources">(facet: K, value: VaultFilters[K][number]) => void;
  onFavorite: (favorite: boolean) => void;
  onClear: () => void;
}

/** Left filter rail: counts per option; OR inside a section, AND across sections. */
export function VaultFilterPanel({ filters, counts, activeCount, onToggle, onFavorite, onClear }: VaultFilterPanelProps) {
  const [showAllTags, setShowAllTags] = useState(false);
  const keys = [...new Set([...counts.keys.keys(), ...filters.keys])].sort((left, right) => shortKey(left).localeCompare(shortKey(right)));
  const tags = [...new Set([...counts.tags.keys(), ...filters.tags])]
    .sort((left, right) => (counts.tags.get(right) ?? 0) - (counts.tags.get(left) ?? 0) || tagLabel(left).localeCompare(tagLabel(right), "ja"));
  const hiddenTags = showAllTags ? 0 : Math.max(0, tags.length - TAG_LIMIT);
  const shownTags = hiddenTags ? tags.filter((tag, index) => index < TAG_LIMIT || filters.tags.includes(tag)) : tags;

  return (
    <div className="lv-vault-filters" data-testid="vault-filters">
      <div className="lv-vault-filters-head">
        <span className="text-[13px] font-bold">絞り込み</span>
        {activeCount ? <span className="lv-vault-count-badge">{activeCount}</span> : null}
        <span className="flex-1" />
        {activeCount ? (
          <button type="button" className="text-[11px] text-[var(--lv-accent)] hover:text-[var(--lv-text)]" onClick={onClear}>すべて解除</button>
        ) : null}
      </div>

      <FilterOption
        label="お気に入り"
        count={counts.favorite}
        pressed={filters.favorite}
        onClick={() => onFavorite(!filters.favorite)}
      />

      <FilterSection title="取り込み元" selected={filters.sources.length}>
        {sourceKinds.map((source: ProgressionSourceKind) => (
          <FilterOption
            key={source}
            label={progressionSourceLabels[source]}
            count={counts.sources.get(source) ?? 0}
            pressed={filters.sources.includes(source)}
            onClick={() => onToggle("sources", source)}
          />
        ))}
      </FilterSection>

      <FilterSection title="キー" selected={filters.keys.length}>
        {keys.length ? (
          <div className="lv-vault-key-grid">
            {keys.map((key) => {
              const count = counts.keys.get(key) ?? 0;
              const pressed = filters.keys.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className="lv-vault-key"
                  aria-pressed={pressed}
                  aria-label={`${displayKey(key)} ${count}件`}
                  title={displayKey(key)}
                  disabled={!count && !pressed}
                  onClick={() => onToggle("keys", key)}
                >
                  <span className="text-xs font-semibold">{shortKey(key)}</span>
                  <span className="lv-vault-option-count">{count || ""}</span>
                </button>
              );
            })}
          </div>
        ) : <p className="px-2.5 text-[11px] text-[var(--lv-text-muted)]">キーのある進行がありません</p>}
      </FilterSection>

      <FilterSection title="長さ" selected={filters.lengths.length}>
        {lengthBuckets.map((bucket: LengthBucket) => (
          <FilterOption
            key={bucket}
            label={lengthBucketLabels[bucket]}
            count={counts.lengths.get(bucket) ?? 0}
            pressed={filters.lengths.includes(bucket)}
            onClick={() => onToggle("lengths", bucket)}
          />
        ))}
      </FilterSection>

      <FilterSection title="タグ" selected={filters.tags.length}>
        {shownTags.length ? shownTags.map((tag) => (
          <FilterOption
            key={tag}
            label={tagLabel(tag)}
            count={counts.tags.get(tag) ?? 0}
            pressed={filters.tags.includes(tag)}
            onClick={() => onToggle("tags", tag)}
          />
        )) : <p className="px-2.5 text-[11px] text-[var(--lv-text-muted)]">タグがありません</p>}
        {tags.length > TAG_LIMIT ? (
          <button type="button" className="ml-8 self-start py-0.5 text-[11px] text-[var(--lv-accent)]" onClick={() => setShowAllTags((value) => !value)}>
            {hiddenTags ? `ほか ${hiddenTags}件を表示` : "少なく表示"}
          </button>
        ) : null}
      </FilterSection>
    </div>
  );
}

function FilterSection({ title, selected, children }: { title: string; selected: number; children: ReactNode }) {
  return (
    <section className="lv-vault-filter-section" aria-label={title}>
      <p className="lv-vault-filter-title">
        <span className="flex-1">{title}</span>
        {selected ? <span className="text-[10px] font-semibold text-[var(--lv-accent)]">{selected}件選択</span> : null}
      </p>
      {children}
    </section>
  );
}

function FilterOption({ label, count, pressed, onClick }: { label: string; count: number; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="lv-vault-option"
      aria-pressed={pressed}
      disabled={!count && !pressed}
      title={label}
      onClick={onClick}
    >
      <span className="lv-vault-check" aria-hidden="true">{pressed ? "✓" : ""}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className="lv-vault-option-count">{count}</span>
    </button>
  );
}

/** C / Am / F#m for the key grid; the full name stays in the title. */
export function shortKey(key: string): string {
  const match = /^([A-G](?:#|b)?)(?:\s*(major|minor)|(m))?$/i.exec(key.trim());
  if (!match) return key;
  return `${match[1]}${match[2]?.toLowerCase() === "minor" || match[3] ? "m" : ""}`;
}

export function tagLabel(tagId: string): string {
  const label = progressionTagLabel(tagId);
  return label === tagId ? tagId.replace(/^[^.]+\./, "") : label;
}
