import { useEffect, useState } from "react";
import type { MetricsSummary } from "../domain/correction/metrics";
import {
  clearCorrectionMetrics,
  isCorrectionMetricsEnabled,
  readCorrectionMetricsSummary,
  setCorrectionMetricsEnabled,
} from "../storage/correctionMetricsStorage";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "./ui";

/** 設定の「開発者向け」: the correction workspace's local metrics (spec v2.5 §13). */
export function CorrectionMetricsSettings() {
  const [enabled, setEnabled] = useState(isCorrectionMetricsEnabled);
  const [summary, setSummary] = useState<MetricsSummary>();
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    let active = true;
    void readCorrectionMetricsSummary().then((next) => { if (active) setSummary(next); });
    return () => { active = false; };
  }, []);
  const averages = summary && summary.count > 0
    ? `最近 ${Math.min(20, summary.count)} 件の平均：直した回数 ${summary.recentAverageEdits ?? "－"}・最初の保存まで ${summary.recentAverageSecondsToFirstSave === null ? "－" : `${summary.recentAverageSecondsToFirstSave} 秒`}`
    : "まだ記録はありません。";
  return (
    <div className="lv-settings-divider" data-testid="settings-correction-metrics">
      <h3 className="lv-settings-subtitle">修正作業場の計測</h3>
      <label className="lv-settings-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => { setEnabled(event.target.checked); setCorrectionMetricsEnabled(event.target.checked); }}
          data-testid="settings-correction-metrics-enabled"
        />
        <span>
          <strong>計測する</strong>
          <span>取り込みごとに、直した回数や保存までの時間をこの端末の中だけに記録します。曲名・ファイル名・コード名は記録しません。</span>
        </span>
      </label>
      <p className="mt-2 text-[var(--lv-text-muted)]" data-testid="settings-correction-metrics-summary">
        {summary ? `${summary.count} 件・${averages}` : "読み込み中…"}
      </p>
      <Button className="mt-2" variant="neutral" disabled={!summary?.count} onClick={() => setConfirmClear(true)}>計測を消す</Button>
      <ConfirmDialog
        open={confirmClear}
        title="計測を消しますか？"
        description="この端末に記録した修正作業場の計測をすべて消します。Vault の進行は消えません。"
        confirmLabel="消す"
        cancelLabel="戻る"
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void clearCorrectionMetrics().then(readCorrectionMetricsSummary).then(setSummary);
        }}
      />
    </div>
  );
}
