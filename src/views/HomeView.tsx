import { useEffect, useState } from "react";
import { displayKey, statusLabel } from "../domain/displayLabels";
import { pickFocus } from "../domain/focus";
import { degreeSequence } from "../domain/harmony/degrees";
import { monthlyStats } from "../domain/monthlyStats";
import { formatProgressionText } from "../domain/progressionText";
import type { TransitionResult } from "../domain/transition";
import type { ChordTimelineItem, SongIdea, Status } from "../domain/types";
import type { AppCopy, AppLanguage } from "../i18n";

const pipeline: Status[] = ["idea", "loop", "arrange", "mix", "done"];
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={"border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4 " + className}>{children}</section>; }
function StatusBadge({ status, language }: { status: Status; language: AppLanguage }) { return <span className="shrink-0 rounded bg-[var(--lv-surface-raised)] px-2 py-1 text-xs font-semibold uppercase text-teal-200">{statusLabel(status, language)}</span>; }
function labelStatus(status: Status, language: AppLanguage): string { return statusLabel(status, language); }
async function previewTimeline(chords: readonly ChordTimelineItem[], bpm?: number): Promise<void> { const { previewChordTimeline } = await import("../audio/chordPreview"); await previewChordTimeline(chords, bpm); }

export function HomeView({
  ideas,
  monthlyGoal,
  copy,
  language,
  showRomanNumerals,
  openDetail,
  openCapture,
  openCreate,
  openVault,
  updateNextAction,
  transitionIdea,
  setToast,
}: {
  ideas: SongIdea[];
  monthlyGoal: number;
  copy: AppCopy;
  language: AppLanguage;
  showRomanNumerals: boolean;
  openDetail: (id: string) => void;
  openCapture: () => void;
  openCreate: () => void;
  openVault: () => void;
  updateNextAction: (id: string, text: string, now?: Date) => void;
  transitionIdea: (id: string, to: Status, now?: Date) => TransitionResult;
  setToast: (toast: string) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const focus = pickFocus(ideas, now);
  const stats = monthlyStats(ideas, now, monthlyGoal);
  const progress = Math.min(100, (stats.doneCount / stats.goal) * 100);
  const focusBlock = focus.focus?.progressionBlocks?.[0];
  const focusDegrees = focusBlock && showRomanNumerals ? degreeSequence(focusBlock) : [];
  const focusPreview = focusBlock
    ? formatProgressionText(focusBlock.chords).split("\n")[0]
    : focus.focus?.chordMemo.split("\n").find((line) => line.trim());
  const recentProgressions = ideas
    .flatMap((idea) => (idea.progressionBlocks ?? []).map((block) => ({ idea, block })))
    .sort((left, right) => new Date(right.block.capturedAt).getTime() - new Date(left.block.capturedAt).getTime())
    .slice(0, 3);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  function completeNext(idea: SongIdea) {
    updateNextAction(idea.id, "", new Date());
    setToast(copy.toast.nextCompleted);
  }

  return (
    <div className="space-y-5 py-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--lv-accent)]">Home</p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{language === "ja" ? "次に鳴らすLoopを選ぶ。" : "Choose the loop to play next."}</h2>
      </div>

      <Panel className="border-teal-400/30 bg-[linear-gradient(135deg,rgba(20,23,21,0.96),rgba(8,10,9,0.96))] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--lv-accent)]">{copy.home.today}</p>
        {focus.focus ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold">{focus.focus.title}</h3>
                <p className="mt-2 text-sm text-[var(--lv-text-muted)]">
                  {focus.focus.bpm ? `${focus.focus.bpm} BPM` : language === "ja" ? "BPM未設定" : "BPM unset"}
                  {focus.focus.key ? ` · ${displayKey(focus.focus.key, language)}` : ""}
                  {` · ${labelStatus(focus.focus.status, language)}`}
                </p>
              </div>
              <StatusBadge status={focus.focus.status} language={language} />
            </div>
            {focusPreview ? <p className="mt-5 overflow-x-auto border-y border-[var(--lv-border)] py-4 font-mono text-sm text-teal-100">{focusPreview}</p> : null}
            {focusDegrees.length ? <p className="mt-2 font-mono text-xs text-[var(--lv-text-muted)]">{focusDegrees.join(" - ")}</p> : null}
            <p className="mt-5 text-sm text-[var(--lv-text-secondary)]"><span className="text-[var(--lv-text)]">{copy.home.nextAction}：</span>{focus.focus.nextAction.text}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {focusBlock ? (
                <button className="lv-button-ghost grid h-10 w-10 place-items-center" onClick={() => void previewTimeline(focusBlock.chords, focusBlock.bpm ?? focus.focus!.bpm)} aria-label={copy.common.preview} title={copy.common.preview}>▶</button>
              ) : null}
              <button className="lv-button-ghost px-4 py-2 text-sm font-medium" onClick={() => openDetail(focus.focus!.id)}>{language === "ja" ? "詳細を開く" : "Open details"}</button>
              <button className="lv-button-primary px-4 py-2 text-sm font-semibold" onClick={() => completeNext(focus.focus!)}>{language === "ja" ? "次の一手を完了" : "Complete next step"}</button>
            </div>
          </div>
        ) : (
          <div className="mt-4 max-w-xl">
            <p className="text-[var(--lv-text-secondary)]">{copy.home.noFocus}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="lv-button-primary px-4 py-2 text-sm font-semibold" onClick={openCapture}>{language === "ja" ? "コード採集を始める" : "Start capture"}</button>
              <button className="lv-button-ghost px-4 py-2 text-sm" onClick={openCreate}>{language === "ja" ? "新しいIdea" : "New Idea"}</button>
              <button className="lv-button-ghost px-4 py-2 text-sm" onClick={openVault}>{language === "ja" ? "Vaultを開く" : "Open Vault"}</button>
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-3 md:grid-cols-3">
        <Panel>
          <p className="text-[13px] text-[var(--lv-text-muted)]">{copy.home.monthlyFinish}</p>
          <p className="mt-2 text-2xl font-semibold">{stats.doneCount} <span className="text-base text-[var(--lv-text-muted)]">/ {stats.goal}</span></p>
          <div className="mt-4 h-2 overflow-hidden rounded bg-[var(--lv-surface-raised)]"><div className="h-full bg-[var(--lv-accent)]" style={{ width: `${progress}%` }} /></div>
          <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{language === "ja" ? `完成にしたネタ：${stats.doneCount}件 · 月間ゴール：${stats.goal}件 · ${copy.home.daysLeft(stats.remainingDays)}` : `${stats.doneCount} completed · Goal ${stats.goal} · ${copy.home.daysLeft(stats.remainingDays)}`}</p>
        </Panel>
        <Panel>
          <p className="text-[13px] text-[var(--lv-text-muted)]">{copy.home.needsNextAction}</p>
          <p className="mt-2 text-2xl font-semibold">{focus.needsNextAction.length}<span className="ml-1 text-sm text-[var(--lv-text-muted)]">{language === "ja" ? "件" : "items"}</span></p>
          <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{focus.needsNextAction.length ? (language === "ja" ? "次の一手を追加できます" : "Add the next step") : copy.home.allHaveNextAction}</p>
        </Panel>
        <Panel>
          <p className="text-[13px] text-[var(--lv-text-muted)]">{copy.home.stale}</p>
          <p className="mt-2 text-2xl font-semibold">{focus.stale.length}<span className="ml-1 text-sm text-[var(--lv-text-muted)]">{language === "ja" ? "件" : "items"}</span></p>
          <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{focus.stale.length ? (language === "ja" ? "7日以上動きがないネタ" : "No activity for 7+ days") : copy.home.noStale}</p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section>
          <h3 className="text-lg font-semibold">{language === "ja" ? "最近採集した進行" : "Recently captured progressions"}</h3>
          {recentProgressions.length ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recentProgressions.map(({ idea, block }) => (
                <article key={block.id} className="border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
                  <p className="line-clamp-1 font-medium">{block.summaryText || (language === "ja" ? "保存したコード進行" : "Saved progression")}</p>
                  <p className="mt-1 text-xs text-[var(--lv-text-muted)]">{idea.title}</p>
                  <p className="mt-4 line-clamp-2 font-mono text-xs text-teal-100">{formatProgressionText(block.chords).split("\n")[0]}</p>
                  <div className="mt-4 flex gap-2">
                    <button className="grid h-8 w-8 place-items-center rounded border border-cyan-400/60 text-cyan-100" onClick={() => void previewTimeline(block.chords, block.bpm ?? idea.bpm)} aria-label={copy.common.preview} title={copy.common.preview}>▶</button>
                    <button className="rounded border border-[var(--lv-border-strong)] px-3 py-1 text-xs" onClick={() => openDetail(idea.id)}>{language === "ja" ? "Vaultで開く" : "Open in Vault"}</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-[var(--lv-text-muted)]">{language === "ja" ? "保存済みの進行はまだありません。" : "No saved progressions yet."}</p>}
        </section>
        <aside className="space-y-4">
          <Panel>
            <h3 className="font-semibold">{copy.home.pipeline}</h3>
            <div className="mt-4 space-y-3">
              {pipeline.map((status) => <div key={status}><div className="flex justify-between text-sm"><span>{labelStatus(status, language)}</span><span className="text-[var(--lv-text-muted)]">{stats.pipelineCounts[status]}</span></div><div className="mt-1 h-1.5 rounded bg-[var(--lv-surface-raised)]"><div className="h-full rounded bg-cyan-400" style={{ width: `${Math.min(100, stats.pipelineCounts[status] * 18)}%` }} /></div></div>)}
            </div>
          </Panel>
          {focus.stale.length ? <Panel><h3 className="font-semibold">{copy.home.stale}</h3><div className="mt-3 space-y-2">{focus.stale.map((entry) => <div key={entry.idea.id} className="flex items-center justify-between gap-3 border-t border-[var(--lv-border)] pt-2"><button className="text-left text-sm font-medium" onClick={() => openDetail(entry.idea.id)}>{entry.idea.title}</button>{entry.suggestHold ? <button className="rounded border border-[var(--lv-border-strong)] px-2 py-1 text-xs" onClick={() => { const result = transitionIdea(entry.idea.id, "hold", new Date()); if (!result.ok) setToast(result.error.message); }}>{copy.home.suggestHold}</button> : null}</div>)}</div></Panel> : null}
        </aside>
      </div>
    </div>
  );
}
