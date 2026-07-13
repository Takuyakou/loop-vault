import { useEffect, useMemo, useRef, useState } from "react";
import { degreeSequence, matchProgression, normalizeQuery } from "../domain/harmony/degrees";
import { formatProgressionText } from "../domain/progressionText";
import type { SavedProgressionBlock, SongIdea } from "../domain/types";
import type { AppCopy, AppLanguage } from "../i18n";

type ProgressionEntry = { idea: SongIdea; block: SavedProgressionBlock };
type SortField = "capturedAt" | "updatedAt" | "key" | "bpm";

export function VaultView({
  ideas, openDetail, openCreate, openCapture, updateIdea, setToast, copy, language, showRomanNumerals,
}: {
  ideas: SongIdea[];
  openDetail: (id: string) => void;
  openCreate: () => void;
  openCapture: () => void;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  setToast: (toast: string) => void;
  copy: AppCopy;
  language: AppLanguage;
  showRomanNumerals: boolean;
}) {
  const [mode, setMode] = useState<"progression" | "idea">("progression");
  const [query, setQuery] = useState("");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [lengthBars, setLengthBars] = useState<"all" | "4" | "8" | "16">("all");
  const [sort, setSort] = useState<SortField>("capturedAt");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [playingId, setPlayingId] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => ideas.flatMap((idea) =>
    (idea.progressionBlocks ?? []).map((block) => ({ idea, block }))), [ideas]);
  const parsedQuery = useMemo(() => normalizeQuery(query), [query]);
  const visible = useMemo(() => entries
    .filter(({ block }) => !onlyPinned || block.pinned)
    .filter(({ block }) => lengthBars === "all" || block.lengthBars === Number(lengthBars))
    .filter(({ idea, block }) => {
      if (parsedQuery.kind !== "text") return matchProgression(block, parsedQuery);
      if (!parsedQuery.normalized) return true;
      return [idea.title, idea.genre ?? "", idea.moods.join(" "), idea.chordMemo,
        block.summaryText, block.memo ?? "", block.tags.join(" "), block.sourceFileName ?? ""]
        .join(" ").toLocaleLowerCase().includes(parsedQuery.normalized);
    })
    .sort((left, right) => {
      if (Boolean(left.block.pinned) !== Boolean(right.block.pinned)) return right.block.pinned ? 1 : -1;
      if (sort === "key") return keyOf(left).localeCompare(keyOf(right));
      if (sort === "bpm") return bpmOf(left) - bpmOf(right);
      const leftDate = sort === "updatedAt" ? left.idea.updatedAt : left.block.capturedAt;
      const rightDate = sort === "updatedAt" ? right.idea.updatedAt : right.block.capturedAt;
      return new Date(rightDate).getTime() - new Date(leftDate).getTime();
    }), [entries, lengthBars, onlyPinned, parsedQuery, sort]);
  useEffect(() => {
    setSelectedIndex((value) => Math.min(value, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select") || target?.isContentEditable) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const active = visible[selectedIndex];
      if (!active || mode !== "progression") return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((value) => Math.max(0, Math.min(visible.length - 1,
          value + (event.key === "ArrowDown" ? 1 : -1))));
      } else if (event.key === " ") {
        event.preventDefault();
        void togglePlayback(active);
      } else if (event.key === "Enter") {
        openDetail(active.idea.id);
      } else if (event.key.toLowerCase() === "c") {
        void copyProgression(active.block);
      } else if (event.key.toLowerCase() === "s") {
        togglePin(active);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mode, playingId, selectedIndex, visible]);

  async function togglePlayback(entry: ProgressionEntry) {
    if (playingId === entry.block.id) {
      const { stopPreview } = await import("../audio/chordPreview");
      stopPreview();
      setPlayingId(undefined);
      return;
    }
    const { previewChordTimeline } = await import("../audio/chordPreview");
    await previewChordTimeline(entry.block.chords, entry.block.bpm ?? entry.idea.bpm);
    setPlayingId(entry.block.id);
  }

  function togglePin(entry: ProgressionEntry) {
    updateIdea(entry.idea.id, {
      progressionBlocks: (entry.idea.progressionBlocks ?? []).map((block) =>
        block.id === entry.block.id ? { ...block, pinned: !block.pinned } : block),
    });
  }

  async function copyProgression(block: SavedProgressionBlock) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard is not available.");
      await navigator.clipboard.writeText(formatProgressionText(block.chords));
      setToast(language === "ja" ? "コード進行をコピーしました。" : "Copied progression.");
    } catch {
      setToast(language === "ja" ? "コピーできませんでした。" : "Could not copy progression.");
    }
  }

  return (
    <div className="py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--lv-accent)]">Vault</p>
          <h2 className="mt-2 text-2xl font-semibold">{language === "ja" ? "進行をすばやく取り出す" : "Retrieve progressions quickly"}</h2></div>
        <button className="lv-button-primary px-4 py-2 text-sm font-semibold" onClick={openCapture}>{language === "ja" ? "コード採集" : "Capture"}</button>
      </div>
      <div className="mb-3 flex gap-1 text-sm">
        <button className={mode === "progression" ? "bg-[var(--lv-surface-raised)] px-3 py-2" : "px-3 py-2 text-[var(--lv-text-muted)]"} onClick={() => setMode("progression")}>Progression</button>
        <button className={mode === "idea" ? "bg-[var(--lv-surface-raised)] px-3 py-2" : "px-3 py-2 text-[var(--lv-text-muted)]"} onClick={() => setMode("idea")}>Idea</button>
      </div>
      {mode === "progression" ? <>
        <div className="grid gap-2 border-y border-[var(--lv-border)] py-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input ref={searchRef} className="border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--lv-accent)]" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); event.currentTarget.blur(); } }} placeholder={language === "ja" ? "4-5-3-6 / IVmaj7 / Fmaj9 / タグで検索" : "4-5-3-6 / IVmaj7 / Fmaj9 / Search tags"} />
          <div className="flex gap-1">{(["all", "4", "8", "16"] as const).map((value) => <button key={value} className={lengthBars === value ? "bg-[var(--lv-surface-raised)] px-2 text-xs" : "px-2 text-xs text-[var(--lv-text-muted)]"} onClick={() => setLengthBars(value)}>{value === "all" ? "All" : `${value} bars`}</button>)}</div>
          <select className="border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-2 text-xs" value={sort} onChange={(event) => setSort(event.target.value as SortField)}><option value="capturedAt">{language === "ja" ? "採集日" : "Captured"}</option><option value="updatedAt">{language === "ja" ? "更新日" : "Updated"}</option><option value="key">Key</option><option value="bpm">BPM</option></select>
        </div>
        <div className="mt-3 flex items-center gap-2"><button className={onlyPinned ? "bg-[var(--lv-surface-raised)] px-3 py-1 text-xs text-[var(--lv-warning)]" : "border border-[var(--lv-border)] px-3 py-1 text-xs text-[var(--lv-text-muted)]"} onClick={() => setOnlyPinned((value) => !value)}>★ {language === "ja" ? "のみ" : "only"}</button><span className="text-xs text-[var(--lv-text-muted)]">{visible.length} {language === "ja" ? "件" : "items"}</span></div>
        {visible.length ? <div className="mt-4 overflow-hidden border border-[var(--lv-border)]">
          {visible.map((entry, index) => <ProgressionRow key={entry.block.id} entry={entry} selected={index === selectedIndex} playing={entry.block.id === playingId} showDegrees={showRomanNumerals} copy={copy} onSelect={() => setSelectedIndex(index)} onPreview={() => void togglePlayback(entry)} onOpen={() => openDetail(entry.idea.id)} onPin={() => togglePin(entry)} onCopy={() => void copyProgression(entry.block)} />)}
        </div> : <EmptyState language={language} openCreate={openCreate} />}
        <p className="mt-3 text-xs text-[var(--lv-text-muted)]">↑↓ {language === "ja" ? "移動" : "move"} · Space {language === "ja" ? "試聴/停止" : "preview/stop"} · Enter {language === "ja" ? "Ideaを開く" : "open"} · C {language === "ja" ? "コピー" : "copy"} · S ★ · / {language === "ja" ? "検索" : "search"} · Esc {language === "ja" ? "クリア" : "clear"}</p>
      </> : <IdeaList ideas={ideas} openDetail={openDetail} language={language} />}
    </div>
  );
}

function ProgressionRow({ entry, selected, playing, showDegrees, copy, onSelect, onPreview, onOpen, onPin, onCopy }: { entry: ProgressionEntry; selected: boolean; playing: boolean; showDegrees: boolean; copy: AppCopy; onSelect: () => void; onPreview: () => void; onOpen: () => void; onPin: () => void; onCopy: () => void }) {
  const degrees = degreeSequence(entry.block);
  return <div className={`grid min-h-14 grid-cols-[32px_minmax(0,1fr)_70px_74px_minmax(50px,auto)_58px] items-center gap-2 border-b border-[var(--lv-border)] px-2 text-sm ${selected ? "bg-[var(--lv-surface-raised)]" : "hover:bg-[var(--lv-surface)]"} ${playing ? "border-l-2 border-l-[var(--lv-accent)]" : ""}`} onClick={onSelect}>
    <button className="lv-button-ghost grid h-8 w-8 place-items-center" onClick={onPreview} aria-label={playing ? copy.common.stop : copy.common.preview}>{playing ? "■" : "▶"}</button>
    <button className="min-w-0 text-left" onDoubleClick={onOpen}><p className="truncate font-mono">{entry.block.chords.map((item) => item.chord.label).join(" · ")}</p><p className="mt-1 truncate text-xs text-[var(--lv-text-muted)]">{showDegrees && degrees.length ? degrees.join(" · ") : entry.idea.title}{keyOf(entry) ? ` · ${keyOf(entry)}` : ""}</p></button>
    <span className="text-xs text-[var(--lv-text-muted)]">{bpmOf(entry) || "-"} BPM</span><span className="text-xs text-[var(--lv-text-muted)]">{formatDate(entry.block.capturedAt)}</span>
    <span className="truncate text-xs text-[var(--lv-text-muted)]">{entry.block.tags.join(" · ") || "-"}</span>
    <div className="flex items-center gap-2"><button className={entry.block.pinned ? "text-[var(--lv-warning)]" : "text-[var(--lv-text-muted)]"} onClick={onPin} aria-label="Pin">★</button><button className="lv-button-ghost text-xs" onClick={onCopy} aria-label="Copy">C</button></div>
  </div>;
}

function IdeaList({ ideas, openDetail, language }: { ideas: SongIdea[]; openDetail: (id: string) => void; language: AppLanguage }) {
  return <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">{ideas.map((idea) => <button key={idea.id} className="min-h-24 border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3 text-left hover:border-[var(--lv-accent)]" onClick={() => openDetail(idea.id)}><p className="truncate font-semibold">{idea.title}</p><p className="mt-2 text-xs text-[var(--lv-text-muted)]">{idea.bpm ?? "-"} BPM · {idea.key ?? "Key -"}</p><p className="mt-2 truncate text-xs text-[var(--lv-text-secondary)]">{idea.nextAction.text || (language === "ja" ? "次の一手なし" : "No next step")}</p></button>)}</div>;
}

function EmptyState({ language, openCreate }: { language: AppLanguage; openCreate: () => void }) { return <div className="py-16 text-center"><p className="text-[var(--lv-text-muted)]">{language === "ja" ? "条件に合う進行はありません。" : "No matching progressions."}</p><button className="lv-button-secondary mt-4 px-3 py-2 text-sm" onClick={openCreate}>{language === "ja" ? "新しいIdea" : "New idea"}</button></div>; }
function keyOf(entry: ProgressionEntry): string { return entry.block.detectedKey ?? entry.idea.key ?? ""; }
function bpmOf(entry: ProgressionEntry): number { return entry.block.bpm ?? entry.idea.bpm ?? 0; }
function formatDate(value: string): string { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value)); }
