import { useMemo, useState } from "react";
import {
  EAR_KINDS, LEVEL_GUIDE, benchmarkRuns, degreeFiguresOf, levelGuide, soundedFiguresOf, thisAndLastWeek, weakKinds, weakMoves, weeklySeries,
  type EarChordRecord, type EarFigures, type EarKind, type EarLevel, type EarWeakSpot,
} from "../../domain/earPractice";
import { DojoBackButton } from "../chord-dojo/DojoBackButton";
import { EarChart } from "./EarChart";
import { countText, dayLabel, diffCount, diffRate, diffSeconds, pct, secText, type Diff } from "./earFormat";

const LEVELS: readonly EarLevel[] = [1, 2, 3, 4, 5];
const FIRST_TRY_HELP = "最初の答えで合った(聴き直しは何回でもよい・ヒントなし)コードの割合です。";

function DiffText({ diff }: { diff: Diff | undefined }) {
  return diff ? <span className="ear-diff" data-better={String(diff.better)}>{diff.text}</span> : <span className="ear-diff">—</span>;
}

function Few({ figures }: { figures: EarFigures }) {
  return figures.few ? <small className="ear-few">{figures.measured === 0 ? "記録なし" : "まだ少ない"}</small> : null;
}

/** The level where a kind of chord was measured most (practising it starts there). */
export function levelForKind(records: readonly EarChordRecord[], kind: string): EarLevel {
  const counts = new Map<EarLevel, number>();
  for (const record of records) if (record.kind === kind && !record.given && !record.manual) counts.set(record.level, (counts.get(record.level) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 1;
}

/** 「耳の記録」: how the practice is going, from the records alone. */
export function EarRecordsView({ records, notice, now, onBack, onPractice }: {
  records: readonly EarChordRecord[];
  notice?: string;
  now: Date;
  onBack: () => void;
  onPractice: (kind: EarKind, level: EarLevel) => void;
}) {
  const [level, setLevel] = useState<EarLevel | "all">("all");
  const { thisWeek, lastWeek } = useMemo(() => thisAndLastWeek(records, now), [records, now]);
  const series = useMemo(() => weeklySeries(records, now, level), [records, now, level]);
  const weak = useMemo(() => weakKinds(records), [records]);
  const moves = useMemo(() => weakMoves(records), [records]);
  const sounded = useMemo(() => soundedFiguresOf(records), [records]);
  const withDegrees = useMemo(() => degreeFiguresOf(records), [records]);
  const guides = useMemo(() => LEVELS.map((value) => levelGuide(records, value)), [records]);
  const runs = useMemo(() => benchmarkRuns(records), [records]);
  const a = thisWeek.figures;
  const b = lastWeek.figures;
  const rows: Array<{ id: string; label: string; help?: string; now: string; before: string; diff?: Diff }> = [
    { id: "first", label: "一発", help: FIRST_TRY_HELP, now: pct(a.firstTryRate), before: pct(b.firstTryRate), diff: diffRate(a.firstTryRate, b.firstTryRate) },
    { id: "clean", label: "聴き直しなしで一発", help: "最初の答えで合い、聴き直しもしなかったコードの割合です。", now: pct(a.cleanRate), before: pct(b.cleanRate), diff: diffRate(a.cleanRate, b.cleanRate) },
    { id: "sec", label: "秒数(中央値)", help: "ヒントを見なかったコードの、正解までの秒数の中央値です。", now: secText(a.medianSec), before: secText(b.medianSec), diff: diffSeconds(a.medianSec, b.medianSec) },
    { id: "nohint", label: "ヒントなし", now: pct(a.noHintRate), before: pct(b.noHintRate), diff: diffRate(a.noHintRate, b.noHintRate) },
    { id: "replay", label: "聴き直し(1コードあたり)", now: countText(a.replayAvg), before: countText(b.replayAvg), diff: diffCount(a.replayAvg, b.replayAvg, 1) },
  ];
  const rateMax = 1;
  const secondsMax = Math.max(4, Math.ceil(Math.max(0, ...series.map((week) => week.figures.medianSec ?? 0)) * 1.2));

  return (
    <section className="dojo ear" data-testid="ear-records" data-screen="records">
      <div className="ear-records">
        <div className="dojo-page-head">
          <DojoBackButton label="耳で弾く" onBack={onBack} />
          <h1>耳の記録</h1>
        </div>
        {notice ? <p className="ear-notice" role="status" data-testid="ear-records-notice">{notice}</p> : null}
        {records.length === 0 ? (
          <p className="ear-empty" data-testid="ear-records-empty">まだ記録がありません。1問を最後まで弾くと、ここに出ます。</p>
        ) : null}

        <div className="dojo-card" data-testid="ear-week-card">
          <h2>今週と先週 <small>週は月曜はじまり</small></h2>
          <table className="ear-table">
            <thead><tr><th scope="col"><span className="sr-only">項目</span></th><th scope="col">今週</th><th scope="col">先週</th><th scope="col">差</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid={`ear-week-${row.id}`} data-few={a.few || undefined}>
                  <th scope="row" title={row.help}>{row.label}</th>
                  <td className={a.few ? "ear-faint" : undefined}>{row.now}</td>
                  <td className={b.few ? "ear-faint" : undefined}>{row.before}</td>
                  <td><DiffText diff={row.diff} /></td>
                </tr>
              ))}
              <tr><th scope="row">測ったコード</th><td>{a.measured}<Few figures={a} /></td><td>{b.measured}<Few figures={b} /></td><td /></tr>
            </tbody>
          </table>
          {withDegrees.chords > 0 ? (
            <p className="ear-help" data-testid="ear-degree-shown">度数と機能を見てから弾いたコード {withDegrees.chords} ・ 一発 {pct(withDegrees.firstTryRate)}(ヒントを見たのと同じなので、上の数字には入れていません)</p>
          ) : null}
          {sounded.chords > 0 ? (
            <p className="ear-help" data-testid="ear-sounded">鳴った音で判定したコード {sounded.chords} ・ 一発 {pct(sounded.firstTryRate)}(難しさが違うので、上の数字には入れていません)</p>
          ) : null}
        </div>

        <div className="dojo-card" data-testid="ear-weeks-card">
          <h2>週ごとの変化 <small>直近12週・白抜きの点は「まだ少ない」(10コード未満)</small></h2>
          <div className="ear-filter" role="radiogroup" aria-label="レベル">
            {(["all", ...LEVELS] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={level === value} data-on={level === value || undefined}
                data-testid={`ear-records-level-${value}`} onClick={() => setLevel(value)}>{value === "all" ? "すべて" : `レベル${value}`}</button>
            ))}
          </div>
          <div className="ear-charts">
            <EarChart testId="ear-chart-rate" title="一発の割合" max={rateMax} format={(value) => pct(value)}
              points={series.map((week) => ({ label: dayLabel(week.weekStart), ...(week.figures.firstTryRate !== undefined ? { value: week.figures.firstTryRate } : {}), few: week.figures.few }))} />
            <EarChart testId="ear-chart-seconds" title="秒数の中央値" max={secondsMax} format={(value) => `${Number.isInteger(value) ? value : value.toFixed(1)}s`} extraLabel="聴き直し"
              points={series.map((week) => ({
                label: dayLabel(week.weekStart),
                ...(week.figures.medianSec !== undefined ? { value: week.figures.medianSec } : {}),
                few: week.figures.few,
                extra: week.figures.replayAvg === undefined ? "—" : week.figures.replayAvg.toFixed(1),
              }))} />
          </div>
          <p className="ear-help">秒数の下の「聴き直し」は、1コードあたりの平均です。聴き直しが減ったのに秒数が伸びたときは、弾くのに迷っているのかもしれません。</p>
        </div>

        <div className="ear-two">
          <div className="dojo-card" data-testid="ear-weak-card">
            <h2>苦手なコードの種類 <small>8コード以上あるものから、一発の割合が低い順に3つ</small></h2>
            {weak.length ? (
              <ol className="ear-weak">
                {weak.map((spot: EarWeakSpot) => (
                  <li key={String(spot.key)} data-testid="ear-weak-item">
                    <span><b>{spot.name}</b> ・ 一発 {pct(spot.firstTryRate)} ・ {spot.measured}コード</span>
                    <button type="button" data-testid="ear-weak-practice" onClick={() => onPractice(spot.key as EarKind, levelForKind(records, spot.key as string))}>
                      このまとまりを多く含む問題で練習する
                    </button>
                  </li>
                ))}
              </ol>
            ) : <p className="dojo-muted" data-testid="ear-weak-none">まだ出せません(1つの種類が8コードに届くと出ます)。</p>}
            <p className="ear-help">種類のまとまり: {EAR_KINDS.join("・")}</p>
          </div>

          <div className="dojo-card" data-testid="ear-moves-card">
            <h2>コードの動き <small>前のコードからのルートの動き(出題用の進行)</small></h2>
            {moves.length ? (
              <ol className="ear-weak">
                {moves.map((spot) => (
                  <li key={String(spot.key)} data-testid="ear-move-item"><span><b>{spot.name}</b> ・ 一発 {pct(spot.firstTryRate)} ・ {spot.measured}コード</span></li>
                ))}
              </ol>
            ) : <p className="dojo-muted" data-testid="ear-moves-none">まだ出せません(1つの動きが8コードに届くと出ます)。</p>}
          </div>
        </div>

        <div className="dojo-card" data-testid="ear-guide-card">
          <h2>レベルの目安 <small>測ったコード{LEVEL_GUIDE.chords}以上・違う進行{LEVEL_GUIDE.progressions}つ以上で出ます。レベルは閉じません</small></h2>
          <ul className="ear-guide">
            {guides.map((guide) => (
              <li key={guide.level} data-testid={`ear-guide-${guide.level}`} data-state={guide.state}>
                <span className="ear-guide-line">
                  <b>レベル{guide.level}</b> ・ {guide.chords === 0 ? "まだ測っていません ・ 0コード" : `一発 ${pct(guide.firstTryRate)} ・ ${secText(guide.medianSec)} ・ ${guide.chords}コード`}
                </span>
                {guide.state === "stable" ? <span className="ear-guide-say">このレベルは安定しています。次のレベルへ進めます</span> : null}
                {guide.state === "on-track" ? <span className="ear-guide-say">順調です(あと{guide.needChords}コード・進行{guide.needProgressions}つで目安が出ます)</span> : null}
              </li>
            ))}
          </ul>
          <p className="ear-help">一発と秒数は直近{LEVEL_GUIDE.window}コードで見ます。目安は一発 {Math.round(LEVEL_GUIDE.rate * 100)}% 以上・秒数の中央値 {LEVEL_GUIDE.seconds}秒以下です。</p>
        </div>

        <div className="dojo-card" data-testid="ear-bench-card">
          <h2>腕試しの記録 <small>同じ問題・同じキー・同じ条件</small></h2>
          {runs.length === 0 ? <p className="dojo-muted" data-testid="ear-bench-none">まだ腕試しをしていません。選ぶ画面から始められます。</p> : null}
          {LEVELS.map((value) => {
            const own = runs.filter((run) => run.level === value);
            if (!own.length) return null;
            return (
              <div className="ear-charts" key={value} data-testid={`ear-bench-level-${value}`}>
                <EarChart testId={`ear-bench-rate-${value}`} title={`レベル${value} 一発の割合`} max={1} format={(v) => pct(v)}
                  points={own.map((run) => ({ label: dayLabel(run.at), ...(run.figures.firstTryRate !== undefined ? { value: run.figures.firstTryRate } : {}) }))} />
                <EarChart testId={`ear-bench-seconds-${value}`} title={`レベル${value} 秒数の中央値`} max={Math.max(4, Math.ceil(Math.max(0, ...own.map((run) => run.figures.medianSec ?? 0)) * 1.2))}
                  format={(v) => `${Number.isInteger(v) ? v : v.toFixed(1)}s`}
                  points={own.map((run) => ({ label: dayLabel(run.at), ...(run.figures.medianSec !== undefined ? { value: run.figures.medianSec } : {}) }))} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
