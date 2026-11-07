import type { EarBenchmarkResult as Result } from "../../domain/earPractice";
import { countText, dayLabel, diffCount, diffRate, diffSeconds, pct, secText, type Diff } from "./earFormat";

function DiffText({ diff }: { diff: Diff | undefined }) {
  return diff ? <span className="ear-diff" data-better={String(diff.better)}>{diff.text}</span> : <span className="ear-diff">—</span>;
}

/** The result of a 腕試し next to the one before it (the hints and the listens are written beside, so a difference in the conditions can be read). */
export function EarBenchmarkResult({ level, current, previous, onAgain, onRecords, onExit }: {
  level: number;
  current: Result | undefined;
  previous: Result | undefined;
  onAgain: () => void;
  onRecords: () => void;
  onExit: () => void;
}) {
  const a = current?.figures;
  const b = previous?.figures;
  const rows: Array<{ id: string; label: string; now: string; before: string; diff: Diff | undefined }> = [
    { id: "first", label: "一発", now: pct(a?.firstTryRate), before: pct(b?.firstTryRate), diff: diffRate(a?.firstTryRate, b?.firstTryRate) },
    { id: "clean", label: "聴き直しなしで一発", now: pct(a?.cleanRate), before: pct(b?.cleanRate), diff: diffRate(a?.cleanRate, b?.cleanRate) },
    { id: "sec", label: "秒数(中央値)", now: secText(a?.medianSec), before: secText(b?.medianSec), diff: diffSeconds(a?.medianSec, b?.medianSec) },
    { id: "hints", label: "ヒントの数", now: current ? String(current.hints) : "—", before: previous ? String(previous.hints) : "—", diff: diffCount(current?.hints, previous?.hints) },
    { id: "replays", label: "聴き直しの合計", now: current ? String(current.replays) : "—", before: previous ? String(previous.replays) : "—", diff: diffCount(current?.replays, previous?.replays) },
  ];
  return (
    <div className="ear-run ear-result ear-bench-result" data-testid="ear-benchmark-result">
      <div className="ear-head">
        <h1>腕試しの結果・レベル{level}</h1>
        <span className="ear-badge ear-badge-plain">4問・固定のキー・テンポ90</span>
      </div>
      {current ? (
        <table className="ear-table" data-testid="ear-benchmark-table">
          <thead><tr><th scope="col"><span className="sr-only">項目</span></th><th scope="col">今回</th><th scope="col">{previous ? `前回(${dayLabel(previous.at)})` : "前回"}</th><th scope="col">差</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-testid={`ear-benchmark-${row.id}`}>
                <th scope="row">{row.label}</th><td>{row.now}</td><td>{row.before}</td><td><DiffText diff={row.diff} /></td>
              </tr>
            ))}
            <tr><th scope="row">測ったコード</th><td>{current.figures.measured}</td><td>{previous ? previous.figures.measured : "—"}</td><td /></tr>
          </tbody>
        </table>
      ) : (
        <p className="ear-notice" role="alert" data-testid="ear-benchmark-missing">結果を出せませんでした(記録を保存できなかった可能性があります)。</p>
      )}
      <p className="ear-help" data-testid="ear-benchmark-note">
        {previous ? "聴き直し・ヒントは使ってもかまいません。使った数を並べているので、条件の違いも読めます。" : "前回の腕試しはありません。今回の結果が、次からの比べる基準になります。"}
        {current && previous ? ` 平均の聴き直し: 今回 ${countText(current.figures.replayAvg)} / 前回 ${countText(previous.figures.replayAvg)}(1コードあたり)` : ""}
      </p>
      <div className="ear-actions">
        <button type="button" onClick={onAgain} data-testid="ear-benchmark-again">もう一度測る</button>
        <button type="button" onClick={onRecords} data-testid="ear-benchmark-records">耳の記録を見る</button>
        <button type="button" className="dojo-primary" onClick={onExit} data-testid="ear-benchmark-exit">選ぶ画面へ <kbd>Esc</kbd></button>
      </div>
    </div>
  );
}
