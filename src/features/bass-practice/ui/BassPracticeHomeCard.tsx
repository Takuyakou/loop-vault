import { ArrowRight, Headphones } from "lucide-react";
import { Button, Surface } from "../../../components/ui";
import type { PracticeHomeSummary } from "../application";

export function BassPracticeHomeCard({ onOpen, summary }: { onOpen: () => void; summary?: PracticeHomeSummary }) {
  return (
    <Surface className="p-4" aria-labelledby="bass-practice-home-title" data-testid="bass-practice-home-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--lv-radius-md)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]">
            <Headphones aria-hidden="true" size={20} />
          </span>
          <div className="min-w-0">
            <p className="lv-section-kicker">今日のベース練習</p>
            <h2 id="bass-practice-home-title" className="mt-1 text-base font-semibold text-[var(--lv-text)]">
              {summary?.firstRun ? "最初のDegree Echoセッションを始める" : `Degree Echo: 復習 ${summary?.dueCount ?? 0}問`}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--lv-text-muted)]">
              自己評価式 · 今日 {summary?.completedToday ?? 0}問完了 · 次の焦点: {summary?.nextFocus ?? "degree recall"}。自動採点ではありません。
            </p>
          </div>
        </div>
        <Button variant="secondary" className="shrink-0" onClick={onOpen}>
          練習を開く
          <ArrowRight aria-hidden="true" size={16} />
        </Button>
      </div>
    </Surface>
  );
}
