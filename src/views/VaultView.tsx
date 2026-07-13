import { useState } from "react";
import { displayKey, statusLabel } from "../domain/displayLabels";
import { filterAndSortIdeas, type IdeaFilters } from "../domain/libraryFilters";
import { formatProgressionText } from "../domain/progressionText";
import type { ChordTimelineItem, SavedProgressionBlock, SongIdea, Status } from "../domain/types";
import type { AppCopy, AppLanguage } from "../i18n";

type SortKey = "updatedAt" | "createdAt" | "bpm";
const statuses: Status[] = ["idea", "loop", "arrange", "mix", "done", "hold", "abandoned"];
const inputClass = "w-full rounded border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none focus:border-teal-400";
function StatusBadge({ status, language }: { status: Status; language: AppLanguage }) { return <span className="shrink-0 rounded bg-stone-800 px-2 py-1 text-xs font-semibold uppercase text-teal-200">{statusLabel(status, language)}</span>; }
function labelStatus(status: Status, language: AppLanguage): string { return statusLabel(status, language); }
function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }
function EmptyState({ openCreate, copy }: { openCreate: () => void; copy: AppCopy }) { return <div className="grid min-h-96 place-items-center py-10"><div className="max-w-md text-center"><h2 className="text-2xl font-semibold">{copy.startup.emptyTitle}</h2><button className="mt-5 rounded bg-teal-400 px-4 py-2 font-semibold text-stone-950" onClick={openCreate}>{copy.startup.emptyButton}</button></div></div>; }
async function writeClipboardText(text: string): Promise<void> { if (!navigator.clipboard?.writeText) throw new Error("Clipboard is not available."); await navigator.clipboard.writeText(text); }
async function previewTimeline(chords: readonly ChordTimelineItem[], bpm?: number): Promise<void> { const { previewChordTimeline } = await import("../audio/chordPreview"); await previewChordTimeline(chords, bpm); }
async function stopPreviewTimeline(): Promise<void> { const { stopPreview } = await import("../audio/chordPreview"); stopPreview(); }
function matchesProgressionQuery(idea: SongIdea, query: string): boolean { const needle = query.trim().toLocaleLowerCase(); if (!needle) return true; return [idea.title, idea.chordMemo, idea.nextAction.text].some((value) => value.toLocaleLowerCase().includes(needle)) || (idea.progressionBlocks ?? []).some((block) => [block.summaryText, block.tags.join(" "), block.chords.map((item) => item.chord.label).join(" ")].some((value) => value.toLocaleLowerCase().includes(needle))); }

export function VaultView({
  ideas,
  openDetail,
  openCreate,
  openCapture,
  setToast,
  copy,
  language,
}: {
  ideas: SongIdea[];
  openDetail: (id: string) => void;
  openCreate: () => void;
  openCapture: () => void;
  setToast: (toast: string) => void;
  copy: AppCopy;
  language: AppLanguage;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [genre, setGenre] = useState("");
  const [mood, setMood] = useState("");
  const [sort, setSort] = useState<SortKey>("updatedAt");
  const [mode, setMode] = useState<"idea" | "progression">("idea");
  const [quickFilter, setQuickFilter] = useState<"all" | "with-progression" | "without-progression" | "no-next" | "recent">("all");
  const filters: IdeaFilters = {
    query: "",
    statuses: status === "all" ? [] : [status],
    genres: genre ? [genre] : [],
    moods: mood ? [mood] : [],
  };
  const visible = filterAndSortIdeas(ideas, filters, { field: sort, direction: sort === "bpm" ? "asc" : "desc" })
    .filter((idea) => !query.trim() || matchesProgressionQuery(idea, query))
    .filter((idea) => {
      const blocks = idea.progressionBlocks ?? [];
      if (quickFilter === "with-progression") return blocks.length > 0;
      if (quickFilter === "without-progression") return blocks.length === 0;
      if (quickFilter === "no-next") return !idea.nextAction.text.trim();
      if (quickFilter === "recent") return blocks.some((block) => Date.now() - new Date(block.capturedAt).getTime() < 30 * 24 * 60 * 60 * 1000);
      return true;
    });
  const progressions = visible
    .flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => ({ idea, block })))
    .sort((left, right) => new Date(right.block.capturedAt).getTime() - new Date(left.block.capturedAt).getTime());

  async function copyProgression(block: SavedProgressionBlock) {
    try {
      await writeClipboardText(formatProgressionText(block.chords));
      setToast(language === "ja" ? "Chord Dripで使えるコード進行をコピーしました。" : "Copied progression text.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : (language === "ja" ? "コピーできませんでした。" : "Could not copy progression."));
    }
  }

  return (
    <div className="py-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">Vault</p>
          <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{language === "ja" ? "採集した進行を探す" : "Find captured progressions"}</h2>
        </div>
        <div className="flex rounded border border-stone-700 p-1 text-sm">
          <button className={mode === "idea" ? "rounded bg-teal-400 px-3 py-1.5 font-semibold text-stone-950" : "rounded px-3 py-1.5 text-stone-300"} onClick={() => setMode("idea")}>Idea</button>
          <button className={mode === "progression" ? "rounded bg-teal-400 px-3 py-1.5 font-semibold text-stone-950" : "rounded px-3 py-1.5 text-stone-300"} onClick={() => setMode("progression")}>Progression</button>
        </div>
      </div>
      <div className="grid gap-2 border-b border-stone-800 pb-4 md:grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_0.8fr]">
        <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === "ja" ? "タイトル・コード進行・次の一手を検索" : "Search titles, progressions, or next steps"} />
        <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as Status | "all")}>
          <option value="all">{language === "ja" ? "すべてのStatus" : "All statuses"}</option>
          {statuses.map((entry) => <option key={entry} value={entry}>{labelStatus(entry, language)}</option>)}
        </select>
        <input className={inputClass} value={genre} onChange={(event) => setGenre(event.target.value)} placeholder={copy.library.genre} />
        <input className={inputClass} value={mood} onChange={(event) => setMood(event.target.value)} placeholder={copy.library.mood} />
        <select className={inputClass} value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
          <option value="updatedAt">{copy.library.updated}</option>
          <option value="createdAt">{copy.library.created}</option>
          <option value="bpm">{copy.library.bpm}</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["all", "with-progression", "without-progression", "no-next", "recent"] as const).map((entry) => (
          <button key={entry} className={quickFilter === entry ? "rounded bg-stone-700 px-3 py-1.5 text-xs text-stone-50" : "rounded border border-stone-800 px-3 py-1.5 text-xs text-stone-400"} onClick={() => setQuickFilter(entry)}>
            {language === "ja" ? ({ all: "すべて", "with-progression": "進行あり", "without-progression": "進行なし", "no-next": "次の一手なし", recent: "最近採集" }[entry]) : ({ all: "All", "with-progression": "With progression", "without-progression": "No progression", "no-next": "No next step", recent: "Recently captured" }[entry])}
          </button>
        ))}
      </div>
      {mode === "idea" && visible.length === 0 ? (
        <EmptyState openCreate={openCreate} copy={copy} />
      ) : null}
      {mode === "idea" && visible.length > 0 ? (
        <div className="grid gap-3 py-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((idea) => {
            const progressionBlocks = idea.progressionBlocks ?? [];
            const firstBlock = progressionBlocks[0];
            const extraBlockCount = Math.max(0, progressionBlocks.length - 1);
            const progressionPreview = firstBlock
              ? formatProgressionText(firstBlock.chords).split("\n")[0]
              : "";

            return (
              <article key={idea.id} className="border border-stone-800 bg-stone-900 p-4 hover:border-teal-400">
                <div className="flex items-start justify-between gap-3">
                  <button className="text-left text-lg font-semibold" onClick={() => openDetail(idea.id)}>{idea.title}</button>
                  <StatusBadge status={idea.status} language={language} />
                </div>
                <p className="mt-2 text-sm text-stone-400">{idea.bpm ? `${idea.bpm} BPM` : copy.library.bpmUnset} {idea.key ? ` · ${displayKey(idea.key, language)}` : ""}</p>
                {firstBlock ? (
                  <div className="mt-4 border border-stone-800 bg-stone-950 p-3">
                    <p className="line-clamp-1 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300">
                      {firstBlock.summaryText || (language === "ja" ? "保存したコード進行" : "Saved progression")}
                    </p>
                    <p className="mt-2 line-clamp-2 font-mono text-sm text-stone-200">{progressionPreview}</p>
                  </div>
                ) : <div className="mt-4 border border-dashed border-stone-700 p-3 text-sm text-stone-400">{language === "ja" ? "コード進行はまだありません" : "No progression yet"}</div>}
                <p className="mt-4 line-clamp-2 text-sm text-stone-300">{idea.nextAction.text ? `${copy.home.nextAction}：${idea.nextAction.text}` : copy.library.noNextAction}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {progressionBlocks.length > 0 ? (
                    <span className="inline-block rounded bg-cyan-400 px-2 py-1 text-xs font-semibold text-stone-950">
                      {language === "ja" ? `進行 ${progressionBlocks.length}件` : `${progressionBlocks.length} progression${progressionBlocks.length === 1 ? "" : "s"}`}{extraBlockCount > 0 ? ` · +${extraBlockCount}` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {firstBlock ? <><button className="grid h-8 w-8 place-items-center rounded border border-cyan-400/60 text-cyan-100" onClick={() => void previewTimeline(firstBlock.chords, firstBlock.bpm ?? idea.bpm)} aria-label={copy.common.preview} title={copy.common.preview}>▶</button><button className="grid h-8 w-8 place-items-center rounded border border-stone-700 text-stone-300" onClick={() => void stopPreviewTimeline()} aria-label={copy.common.stop} title={copy.common.stop}>■</button></> : <button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={openCapture}>{language === "ja" ? "MIDIから追加" : "Add from MIDI"}</button>}
                  <button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={() => openDetail(idea.id)}>{copy.common.open}</button>
                  {firstBlock ? <button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={() => void copyProgression(firstBlock)}>{copy.capture.copyProgression}</button> : null}
                </div>
                <p className="mt-4 text-xs text-stone-500">{language === "ja" ? "更新" : "Updated"} {formatDate(idea.updatedAt)}</p>
              </article>
            );
          })}
        </div>
      ) : null}
      {mode === "progression" ? (
        progressions.length ? <div className="grid gap-3 py-5 md:grid-cols-2 xl:grid-cols-3">{progressions.map(({ idea, block }) => <article key={block.id} className="border border-stone-800 bg-stone-900 p-4"><p className="font-semibold">{block.summaryText || (language === "ja" ? "保存したコード進行" : "Saved progression")}</p><button className="mt-1 text-left text-xs text-teal-200 hover:underline" onClick={() => openDetail(idea.id)}>{idea.title}</button><p className="mt-3 font-mono text-sm text-stone-100">{formatProgressionText(block.chords).split("\n")[0]}</p><p className="mt-2 text-xs text-stone-500">{idea.bpm ? `${idea.bpm} BPM` : copy.library.bpmUnset}{idea.key ? ` · ${displayKey(idea.key, language)}` : ""}{block.startBar ? ` · ${language === "ja" ? `${block.startBar}-${block.endBar}小節` : `Bars ${block.startBar}-${block.endBar}`}` : ""}</p><div className="mt-4 flex gap-2"><button className="grid h-8 w-8 place-items-center rounded border border-cyan-400/60 text-cyan-100" onClick={() => void previewTimeline(block.chords, block.bpm ?? idea.bpm)} aria-label={copy.common.preview} title={copy.common.preview}>▶</button><button className="grid h-8 w-8 place-items-center rounded border border-stone-700 text-stone-300" onClick={() => void stopPreviewTimeline()} aria-label={copy.common.stop} title={copy.common.stop}>■</button><button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={() => openDetail(idea.id)}>{language === "ja" ? "親Ideaを開く" : "Open parent Idea"}</button><button className="rounded border border-stone-700 px-3 py-1 text-xs" onClick={() => void copyProgression(block)}>{copy.capture.copyProgression}</button></div></article>)}</div> : <div className="py-14 text-center"><p className="text-stone-400">{language === "ja" ? "保存済みの進行はまだありません。" : "No saved progressions yet."}</p><button className="mt-4 rounded bg-teal-400 px-4 py-2 text-sm font-semibold text-stone-950" onClick={openCapture}>{language === "ja" ? "コード採集を始める" : "Start capture"}</button></div>
      ) : null}
    </div>
  );
}
