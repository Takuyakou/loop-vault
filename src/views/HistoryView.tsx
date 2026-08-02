import { useMemo, useState } from "react";
import { Activity, AudioWaveform, Dumbbell, ExternalLink, SearchX } from "lucide-react";
import { formatProgressionText } from "../domain/progressionText";
import type { AppLanguage, SongIdea } from "../domain/types";
import { Button, EmptyState, Surface } from "../components/ui";
import type { PracticeHistorySummary } from "../features/bass-practice/application";

type HistoryEventType = "capture" | "idea-update" | "practice" | "status";

interface HistoryEvent {
  id: string;
  type: HistoryEventType;
  at: string;
  ideaId: string;
  blockId?: string;
  title: string;
  summary: string;
  source: string;
}

export function HistoryView({
  ideas,
  language,
  practiceHistory = [],
  practiceHistoryTotal = practiceHistory.length,
  openIdea,
  openProgression,
}: {
  ideas: readonly SongIdea[];
  language: AppLanguage;
  practiceHistory?: readonly PracticeHistorySummary[];
  practiceHistoryTotal?: number;
  openIdea: (ideaId: string) => void;
  openProgression: (ideaId: string, blockId: string) => void;
}) {
  const text = historyCopy[language];
  const events = useMemo(() => buildHistoryEvents(ideas, language), [ideas, language]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | HistoryEventType>("all");
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return events.filter((event) => {
      if (filter !== "all" && event.type !== filter) return false;
      if (!normalized) return true;
      return [event.title, event.summary, event.source]
        .some((value) => value.toLocaleLowerCase().includes(normalized));
    });
  }, [events, filter, query]);
  const visiblePracticeHistory = useMemo(() => {
    if (filter !== "all" && filter !== "practice") return [];
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return practiceHistory;
    return practiceHistory.filter((summary) => ["bass practice", "degree echo", "self-rated", summary.nextFocus]
      .some((value) => value.toLocaleLowerCase().includes(normalized)));
  }, [filter, practiceHistory, query]);
  const groups = useMemo(() => groupByDate(visible, language), [language, visible]);

  return (
    <div className="py-5">
      <div className="mb-4">
        <p className="lv-section-kicker">History</p>
        <h2 className="lv-section-title mt-2">{text.title}</h2>
        <p className="lv-section-description mt-2">{text.description}</p>
      </div>

      <Surface variant="raised" className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="text-xs font-semibold text-[var(--lv-text-secondary)]" htmlFor="history-search">
          {text.search}
          <input
            id="history-search"
            className="lv-input mt-1.5 min-h-10 w-full px-3 text-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text.searchPlaceholder}
          />
        </label>
        <label className="text-xs font-semibold text-[var(--lv-text-secondary)]" htmlFor="history-filter">
          {text.eventType}
          <select
            id="history-filter"
            className="lv-input mt-1.5 min-h-10 min-w-44 px-3 text-sm"
            value={filter}
            onChange={(event) => setFilter(event.target.value as "all" | HistoryEventType)}
          >
            <option value="all">{text.all}</option>
            <option value="capture">{text.capture}</option>
            <option value="idea-update">{text.ideaUpdate}</option>
            <option value="practice">{text.practice}</option>
            <option value="status">{text.status}</option>
          </select>
        </label>
      </Surface>

      <p className="mt-3 text-xs text-[var(--lv-text-muted)]" role="status" aria-live="polite">
        {text.count(visible.length + visiblePracticeHistory.length)}
      </p>

      {visiblePracticeHistory.length ? (
        <section className="mt-4" aria-labelledby="bass-practice-history-title" data-testid="bass-practice-history">
          <h3 id="bass-practice-history-title" className="mb-2 text-xs font-semibold uppercase text-[var(--lv-text-muted)]">Bass Practice · Self-rated</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {visiblePracticeHistory.map((summary) => (
              <Surface key={summary.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <strong>Degree Echo</strong>
                  <time className="text-xs text-[var(--lv-text-muted)]" dateTime={summary.at}>{formatTime(summary.at)}</time>
                </div>
                <p className="mt-2 text-sm text-[var(--lv-text-secondary)]">{summary.completedCount} / {summary.targetCount} completed</p>
                <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">Self-rated Good or Easy: {summary.goodOrEasyCount}</p>
                <p className="mt-1 text-sm text-[var(--lv-text-secondary)]">Self-rated independent: {summary.independentSuccessCount}</p>
                <p className="mt-1 text-xs text-[var(--lv-text-muted)]">Average listens: {summary.averageListenCount.toFixed(1)} · Transfers: {summary.transferCount} · Next focus: {summary.nextFocus}</p>
              </Surface>
            ))}
          </div>
          {practiceHistoryTotal > visiblePracticeHistory.length ? (
            <p className="mt-3 text-xs text-[var(--lv-text-muted)]">Showing the latest {visiblePracticeHistory.length} of {practiceHistoryTotal} saved Practice sessions.</p>
          ) : null}
        </section>
      ) : null}

      {groups.length === 0 && visiblePracticeHistory.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={<SearchX aria-hidden="true" size={20} />}
          title={events.length === 0 ? text.empty : text.noMatches}
          description={events.length === 0 ? text.emptyDescription : text.noMatchesDescription}
        />
      ) : groups.length ? (
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`history-date-${group.key}`}>
              <h3 id={`history-date-${group.key}`} className="mb-2 text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
                {group.label}
              </h3>
              <div className="border border-[var(--lv-border)]">
                {group.events.map((event) => (
                  <HistoryRow
                    key={event.id}
                    event={event}
                    text={text}
                    onOpen={() => event.blockId
                      ? openProgression(event.ideaId, event.blockId)
                      : openIdea(event.ideaId)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HistoryRow({
  event,
  onOpen,
  text,
}: {
  event: HistoryEvent;
  onOpen: () => void;
  text: typeof historyCopy.ja | typeof historyCopy.en;
}) {
  const Icon = event.type === "capture"
    ? AudioWaveform
    : event.type === "practice"
      ? Dumbbell
      : Activity;
  return (
    <article className="grid gap-3 border-b border-[var(--lv-border)] bg-[var(--lv-surface)] p-3 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
      <span className="grid h-9 w-9 place-items-center border border-[var(--lv-border-strong)] text-[var(--lv-accent)]">
        <Icon aria-hidden="true" size={16} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="font-semibold">{event.title}</p>
          <time className="text-xs text-[var(--lv-text-muted)]" dateTime={event.at}>{formatTime(event.at)}</time>
        </div>
        <p className="mt-1 break-words text-sm text-[var(--lv-text-secondary)]">{event.summary}</p>
        <p className="mt-1 truncate text-xs text-[var(--lv-text-muted)]">{text.source}: {event.source}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onOpen}>
        <ExternalLink aria-hidden="true" size={16} />
        {text.open}
      </Button>
    </article>
  );
}

export function buildHistoryEvents(
  ideas: readonly SongIdea[],
  language: AppLanguage,
): HistoryEvent[] {
  const text = historyCopy[language];
  return ideas.flatMap((idea) => {
    const blockEvents = (idea.progressionBlocks ?? []).flatMap((block) => {
      const source = block.sourceFileName ?? idea.title;
      const summary = block.summaryText || formatProgressionText(block.chords);
      const events: HistoryEvent[] = [{
        id: `capture:${idea.id}:${block.id}`,
        type: "capture",
        at: block.capturedAt,
        ideaId: idea.id,
        blockId: block.id,
        title: text.capturedTitle,
        summary,
        source,
      }];
      if (block.practice?.lastPracticedAt) {
        events.push({
          id: `practice:${idea.id}:${block.id}:${block.practice.lastPracticedAt}`,
          type: "practice",
          at: block.practice.lastPracticedAt,
          ideaId: idea.id,
          blockId: block.id,
          title: text.practicedTitle,
          summary,
          source: idea.title,
        });
      }
      return events;
    });
    const statusEvents = idea.statusHistory.map((entry, index): HistoryEvent => ({
      id: `status:${idea.id}:${index}:${entry.at}`,
      type: "status",
      at: entry.at,
      ideaId: idea.id,
      title: text.statusTitle,
      summary: `${idea.title} · ${entry.status}`,
      source: idea.title,
    }));
    const updateEvent: HistoryEvent[] = idea.updatedAt !== idea.createdAt
      ? [{
          id: `update:${idea.id}:${idea.updatedAt}`,
          type: "idea-update",
          at: idea.updatedAt,
          ideaId: idea.id,
          title: text.updatedTitle,
          summary: idea.title,
          source: idea.title,
        }]
      : [];
    return [...blockEvents, ...statusEvents, ...updateEvent];
  }).filter((event) => Number.isFinite(Date.parse(event.at)))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
}

function groupByDate(events: readonly HistoryEvent[], language: AppLanguage) {
  const groups = new Map<string, HistoryEvent[]>();
  for (const event of events) {
    const date = new Date(event.at);
    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const formatter = new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return [...groups].map(([key, grouped]) => ({
    key,
    label: formatter.format(new Date(`${key}T12:00:00`)),
    events: grouped,
  }));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const historyCopy = {
  ja: {
    title: "最近の操作",
    description: "採集、Idea更新、練習、状態変更を日付ごとに確認し、元の画面へ戻れます。",
    search: "履歴を検索",
    searchPlaceholder: "進行名、Idea名、MIDI名",
    eventType: "種類",
    all: "すべて",
    capture: "採集",
    ideaUpdate: "Idea更新",
    practice: "練習",
    status: "状態変更",
    source: "移動先",
    open: "開く",
    count: (count: number) => `${count}件`,
    empty: "履歴はまだありません",
    emptyDescription: "進行を採集したり練習すると、保存済みデータから履歴が表示されます。",
    noMatches: "一致する履歴がありません",
    noMatchesDescription: "検索語または種類を変更してください。",
    capturedTitle: "コード進行を採集",
    practicedTitle: "コード進行を練習",
    updatedTitle: "Ideaを更新",
    statusTitle: "ステータスを変更",
  },
  en: {
    title: "Recent activity",
    description: "Review captured progressions, Idea updates, practice, and status changes by date.",
    search: "Search history",
    searchPlaceholder: "Progression, Idea, or MIDI name",
    eventType: "Event type",
    all: "All",
    capture: "Capture",
    ideaUpdate: "Idea update",
    practice: "Practice",
    status: "Status change",
    source: "Destination",
    open: "Open",
    count: (count: number) => `${count} events`,
    empty: "No history yet",
    emptyDescription: "Captured and practiced progressions appear here from saved data.",
    noMatches: "No matching history",
    noMatchesDescription: "Change the search term or event type.",
    capturedTitle: "Captured a progression",
    practicedTitle: "Practiced a progression",
    updatedTitle: "Updated an Idea",
    statusTitle: "Changed status",
  },
} as const;
