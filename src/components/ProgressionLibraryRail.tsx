import { useMemo, type ReactNode } from "react";
import {
  progressionTagLabel,
  progressionTaxonomy,
  type ProgressionIndexEntry,
  type ProgressionTagCategory,
} from "../domain/progressionClassification/mod";
import { smartLibraryCopy, type AppLanguage } from "../i18n";
import { Clock3, Layers3, Star } from "lucide-react";

export type ProgressionLibraryScope = "all" | "favorites" | "recent";

interface ProgressionLibraryRailProps {
  entries: readonly ProgressionIndexEntry[];
  selectedTagIds: readonly string[];
  scope: ProgressionLibraryScope;
  language: AppLanguage;
  onToggleTag: (tagId: string) => void;
  onScopeChange: (scope: ProgressionLibraryScope) => void;
}

const categories: ProgressionTagCategory[] = ["feature", "use", "mood", "source", "collection"];

export function ProgressionLibraryRail({
  entries,
  selectedTagIds,
  scope,
  language,
  onToggleTag,
  onScopeChange,
}: ProgressionLibraryRailProps) {
  const text = smartLibraryCopy[language];
  const counts = useMemo(() => countTags(entries), [entries]);
  const selected = new Set(selectedTagIds);
  const recentCount = entries.filter((entry) => isRecent(entry.createdAt)).length;

  return (
    <nav aria-label={text.filters} className="space-y-1">
      <ScopeButton active={scope === "all"} count={entries.length} onClick={() => onScopeChange("all")}>
        <Layers3 aria-hidden="true" size={16} />
        {text.all}
      </ScopeButton>
      <ScopeButton
        active={scope === "favorites"}
        count={entries.filter((entry) => entry.favorite).length}
        onClick={() => onScopeChange("favorites")}
      >
        <Star aria-hidden="true" size={16} />
        {text.favorites}
      </ScopeButton>
      <ScopeButton active={scope === "recent"} count={recentCount} onClick={() => onScopeChange("recent")}>
        <Clock3 aria-hidden="true" size={16} />
        {text.recent}
      </ScopeButton>

      <div className="pt-3">
        {categories.map((category) => {
          const tagIds = tagsForCategory(category, counts);
          if (tagIds.length === 0) return null;
          return (
            <details key={category} open className="border-t border-[var(--lv-border)] py-2">
              <summary className="cursor-pointer select-none py-1 text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
                {text[category]}
              </summary>
              <div className="mt-1 space-y-0.5">
                {tagIds.map((tagId) => (
                  <button
                    key={tagId}
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left text-sm ${selected.has(tagId) ? "bg-teal-300/10 text-teal-100" : "text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface-raised)]"}`}
                    onClick={() => onToggleTag(tagId)}
                    aria-pressed={selected.has(tagId)}
                  >
                    <span className="truncate">{tagLabel(tagId, language)}</span>
                    <span className="text-xs text-[var(--lv-text-muted)]">{counts.get(tagId)}</span>
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </nav>
  );
}

function ScopeButton({
  active,
  count,
  children,
  onClick,
}: {
  active: boolean;
  count: number;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-2 py-2 text-sm ${active ? "bg-[var(--lv-surface-raised)] text-[var(--lv-text)]" : "text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface)]"}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
      <span className="ml-auto text-xs text-[var(--lv-text-muted)]">{count}</span>
    </button>
  );
}

function countTags(entries: readonly ProgressionIndexEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tagId of new Set(entry.effectiveTags)) {
      counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
    }
  }
  return counts;
}

function tagsForCategory(category: ProgressionTagCategory, counts: Map<string, number>): string[] {
  const stable = progressionTaxonomy
    .filter((tag) => tag.category === category && (counts.get(tag.id) ?? 0) > 0)
    .map((tag) => tag.id);
  const dynamic = [...counts.keys()]
    .filter((tagId) => tagId.startsWith(`${category}.`) && !stable.includes(tagId))
    .sort();
  return [...stable, ...dynamic];
}

function tagLabel(tagId: string, language: AppLanguage): string {
  const known = progressionTagLabel(tagId, language);
  return known === tagId ? tagId.replace(/^[^.]+\./, "") : known;
}

export function isRecent(value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const age = now - new Date(value).getTime();
  return age >= 0 && age <= 30 * 24 * 60 * 60 * 1_000;
}
