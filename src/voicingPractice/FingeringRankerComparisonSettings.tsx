import { setFingeringRankerMode, useFingeringRankerMode } from "./fingeringRankerMode";
export function FingeringRankerComparisonSettings() {
  const mode = useFingeringRankerMode();
  return <fieldset className="mb-4" data-testid="fingering-ranker-comparison">
    <legend className="text-xs font-semibold">運指方式（開発者比較）</legend>
    <select className="lv-input mt-2" aria-label="運指方式" value={mode}
      onChange={event => setFingeringRankerMode(event.currentTarget.value === "E1-T" ? "E1-T" : "CURRENT")}>
      <option value="E1-T">新方式（候補）</option>
      <option value="CURRENT">CURRENT（従来方式）</option>
    </select>
    <p className="mt-1 text-xs text-[var(--lv-text-muted)]">比較用・この起動中のみ有効。音と左右手配分は変更しません。手位置は相対的な計算指標です。</p>
  </fieldset>;
}
