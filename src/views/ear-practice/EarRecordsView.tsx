import { useMemo, useState } from "react";
import {
  EAR_KINDS, LEVEL_GUIDE, benchmarkRuns, degreeFiguresOf, levelGuide, soundedFiguresOf, thisAndLastWeek, weakKinds, weakMoves, weeklySeries,
  type EarChordRecord, type EarFigures, type EarKind, type EarLevel, type EarLevelGuide, type EarWeakSpot,
} from "../../domain/earPractice";
import { DojoBackButton } from "../chord-dojo/DojoBackButton";
import { EarChart } from "./EarChart";
import { countText, dayLabel, diffCount, diffRate, diffSeconds, pct, secText, type Diff } from "./earFormat";

const LEVELS: readonly EarLevel[] = [1, 2, 3, 4, 5];
const FIRST_TRY_HELP = "最初の答えで合った(聴き直しは何回でもよい・ヒントなし)コードの割合です。";

/** R7: the one line that says what each level asks for. */
const LEVEL_TEXT: Readonly<Record<EarLevel, string>> = {
  1: "キーの中の三和音だけ",
  2: "借用・転回形・sus・dim・aug",
  3: "セブンス(maj7・m7・7 など)",
  4: "テンション・分数コード",
  5: "オルタード・mMaj7 など",
};

function DiffText({ diff }: { diff: Diff | undefined }) {
  return diff ? <span className="ear-diff" data-better={String(diff.better)}>{diff.text}</span> : <span className="ear-diff">—</span>;
}

function Few({ figures }: { figures: EarFigures }) {
  return figures.few ? <small className="ear-few">{figures.measured === 0 ? "記録なし" : "まだ少ない"}</small> : null;
}

/** R3: the thin 12-week line under a card (one dot per week that has a value; a gap breaks the line). */
function Spark({ points }: { points: readonly (number | undefined)[] }) {
  const known = points.filter((value): value is number => value !== undefined);
  const top = Math.max(...known, 0.0001);
  const step = points.length > 1 ? 100 / (points.length - 1) : 100;
  const dots = points.flatMap((value, index) => (value === undefined ? [] : [{ x: index * step, y: 26 - (value / top) * 22 }]));
  const path = dots.map((dot, index) => `${index ? "L" : "M"}${dot.x.toFixed(1)} ${dot.y.toFixed(1)}`).join(" ");
  return (
    <svg className="ear-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true" data-points={dots.length}>
      {dots.length > 1 ? <path d={path} fill="none" stroke="var(--lv-accent)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" /> : null}
      {dots.map((dot, index) => <circle key={index} cx={dot.x} cy={dot.y} r="1.6" fill="var(--lv-accent)" vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

/** R8: one bar, with the guide's position marked; accent when the guide is met, faint when it is not. */
function GuideBar({ kind, value }: { kind: "rate" | "sec"; value?: number }) {
  const max = kind === "rate" ? 1 : 8;
  const guide = kind === "rate" ? LEVEL_GUIDE.rate : LEVEL_GUIDE.seconds;
  const filled = value === undefined ? 0 : Math.min(1, value / max);
  const met = value !== undefined && (kind === "rate" ? value >= guide : value <= guide);
  return (
    <span className="ear-bar" data-met={met || undefined} aria-hidden="true">
      <span className="ear-bar-fill" style={{ width: `${filled * 100}%` }} />
      <span className="ear-bar-guide" style={{ left: `${(guide / max) * 100}%` }} />
    </span>
  );
}

/** R9: the one line under a level's cards (the words the screen already had, plus the two missing ones). */
export function guideNote(guide: EarLevelGuide): string {
  if (guide.state === "stable") return "このレベルは安定しています。次のレベルへ進めます";
  if (guide.state === "on-track") return `順調です(あと${guide.needChords}コード・進行${guide.needProgressions}つで目安が出ます)`;
  if (guide.chords === 0) return "まだ測っていません ・ 0コード";
  if (guide.needChords > 0 || guide.needProgressions > 0) return `あと ${guide.needChords} コード・進行 ${guide.needProgressions} つで目安が出ます`;
  const rateGap = guide.firstTryRate === undefined ? 0 : Math.max(0, Math.round((LEVEL_GUIDE.rate - guide.firstTryRate) * 100));
  const secondGap = guide.medianSec === undefined ? 0 : Math.max(0, Math.ceil(guide.medianSec - LEVEL_GUIDE.seconds));
  const parts: string[] = [];
  if (rateGap > 0) parts.push(`一発あと ${rateGap} %`);
  if (secondGap > 0) parts.push(`秒数あと ${secondGap} 秒`);
  return parts.length ? `目安まで、${parts.join(" ・ ")}です` : "このレベルは安定しています。次のレベルへ進めます";
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
  const weeks = useMemo(() => weeklySeries(records, now, "all"), [records, now]);
  const weak = useMemo(() => weakKinds(records), [records]);
  const moves = useMemo(() => weakMoves(records), [records]);
  const sounded = useMemo(() => soundedFiguresOf(records), [records]);
  const withDegrees = useMemo(() => degreeFiguresOf(records), [records]);
  const guides = useMemo(() => LEVELS.map((value) => levelGuide(records, value)), [records]);
  const runs = useMemo(() => benchmarkRuns(records), [records]);
  const a = thisWeek.figures;
  const b = lastWeek.figures;
  // R2/R3: the five cards keep the figures the table had; each has its own 12-week line.
  const cards: Array<{ id: string; label: string; help?: string; value: string; unit?: string; before: string; diff?: Diff; spark: readonly (number | undefined)[]; faint: boolean }> = [
    {
      id: "first", label: "一発", help: FIRST_TRY_HELP,
      value: a.firstTryRate === undefined ? "—" : String(Math.round(a.firstTryRate * 100)), unit: "%",
      before: pct(b.firstTryRate), diff: diffRate(a.firstTryRate, b.firstTryRate),
      spark: weeks.map((week) => week.figures.firstTryRate), faint: a.few,
    },
    {
      id: "clean", label: "聴き直しなしで一発", help: "最初の答えで合い、聴き直しもしなかったコードの割合です。",
      value: a.cleanRate === undefined ? "—" : String(Math.round(a.cleanRate * 100)), unit: "%",
      before: pct(b.cleanRate), diff: diffRate(a.cleanRate, b.cleanRate),
      spark: weeks.map((week) => week.figures.cleanRate), faint: a.few,
    },
    {
      id: "sec", label: "秒数(中央値)", help: "ヒントを見なかったコードの、正解までの秒数の中央値です。",
      value: a.medianSec === undefined ? "—" : a.medianSec.toFixed(1), unit: "秒",
      before: secText(b.medianSec), diff: diffSeconds(a.medianSec, b.medianSec),
      spark: weeks.map((week) => week.figures.medianSec), faint: a.few,
    },
    {
      id: "nohint", label: "ヒントなし",
      value: a.noHintRate === undefined ? "—" : String(Math.round(a.noHintRate * 100)), unit: "%",
      before: pct(b.noHintRate), diff: diffRate(a.noHintRate, b.noHintRate),
      spark: weeks.map((week) => week.figures.noHintRate), faint: a.few,
    },
    {
      id: "replay", label: "聴き直し(1コードあたり)",
      value: countText(a.replayAvg), unit: "回",
      before: countText(b.replayAvg), diff: diffCount(a.replayAvg, b.replayAvg, 1),
      spark: weeks.map((week) => week.figures.replayAvg), faint: a.few,
    },
  ];
  const rateMax = 1;
  const secondsMax = Math.max(4, Math.ceil(Math.max(0, ...series.map((week) => week.figures.medianSec ?? 0)) * 1.2));

  return (
    <section className="dojo ear" data-testid="ear-records" data-screen="records">
      <div className="ear-records">
        <div className="dojo-page-head ear-records-head">
          <DojoBackButton label="耳で弾く" onBack={onBack} />
          <h1>耳の記録</h1>
          <span className="ear-records-week-note">週は月曜はじまり</span>
        </div>
        {notice ? <p className="ear-notice" role="status" data-testid="ear-records-notice">{notice}</p> : null}

        {/* R13: with no record at all, say so and offer the way in. The cards below stay. */}
        {records.length === 0 ? (
          <div className="ear-records-empty-face" data-testid="ear-records-empty-face">
            <p className="ear-empty" data-testid="ear-records-empty">まだ記録がありません。1問を最後まで弾くと、ここに出ます。</p>
            <button type="button" className="dojo-primary" data-testid="ear-records-start" onClick={onBack}>耳で弾くを始める</button>
          </div>
        ) : null}

        {/* R2-R5: this week in five cards. */}
        <div className="dojo-card" data-testid="ear-week-card">
          <div className="ear-week-head">
            <div>
              <h2>今週 <small>先週との差つき。下の線は直近 12 週です。</small></h2>
            </div>
            <span className="ear-week-count">測ったコード 今週 {a.measured} ・ 先週 {b.measured}<Few figures={a} /></span>
          </div>
          <div className="ear-week-cards">
            {cards.map((card) => (
              <div key={card.id} className="ear-week-card" data-testid={`ear-week-${card.id}`} data-few={card.faint || undefined} title={card.help}>
                <span className="ear-week-name">{card.label}</span>
                <span className="ear-week-value" data-faint={card.faint || undefined}>
                  {card.value}{card.unit && card.value !== "—" ? <small>{card.unit}</small> : null}
                  <DiffText diff={card.diff} />
                </span>
                <span className="ear-week-before">先週 {card.before}</span>
                <Spark points={card.spark} />
              </div>
            ))}
          </div>
          {withDegrees.chords > 0 ? (
            <p className="ear-help" data-testid="ear-degree-shown">度数と機能を見てから弾いたコード {withDegrees.chords} ・ 一発 {pct(withDegrees.firstTryRate)}(ヒントを見たのと同じなので、上の数字には入れていません)</p>
          ) : null}
          {sounded.chords > 0 ? (
            <p className="ear-help" data-testid="ear-sounded">鳴った音で判定したコード {sounded.chords} ・ 一発 {pct(sounded.firstTryRate)}(難しさが違うので、上の数字には入れていません)</p>
          ) : null}
        </div>

        {/* R6-R9: the level guide, one card per level. */}
        <div className="dojo-card" data-testid="ear-guide-card">
          <h2>レベルの目安 <small>測ったコード{LEVEL_GUIDE.chords}以上・違う進行{LEVEL_GUIDE.progressions}つ以上で出ます。レベルは閉じません</small></h2>
          <p className="ear-help">一発と秒数は直近{LEVEL_GUIDE.window}コードで見ます。目安は一発 {Math.round(LEVEL_GUIDE.rate * 100)}% 以上・秒数の中央値 {LEVEL_GUIDE.seconds}秒以下です。</p>
          <div className="ear-guide">
            {guides.map((guide) => (
              <div key={guide.level} className="ear-guide-card" data-testid={`ear-guide-${guide.level}`} data-state={guide.state}>
                <div className="ear-guide-top">
                  <b className="ear-guide-no">{guide.level}</b>
                  <span className="ear-guide-name">レベル {guide.level}</span>
                  <span className="ear-guide-state">{guide.state === "stable" ? "安定" : guide.state === "on-track" ? "順調" : ""}</span>
                </div>
                <p className="ear-guide-text">{LEVEL_TEXT[guide.level]}</p>
                <div className="ear-guide-figures">
                  <span className="ear-guide-figure">
                    <span className="ear-guide-figure-label">一発</span>
                    <GuideBar kind="rate" value={guide.firstTryRate} />
                    <b>{pct(guide.firstTryRate)}</b>
                  </span>
                  <span className="ear-guide-figure">
                    <span className="ear-guide-figure-label">秒数</span>
                    <GuideBar kind="sec" value={guide.medianSec} />
                    <b>{secText(guide.medianSec)}</b>
                  </span>
                </div>
                <p className="ear-guide-counts">{guide.chords}コード ・ 進行 {guide.progressions} つ</p>
                <p className="ear-guide-say">{guideNote(guide)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* R10: the week-by-week charts, with the level switch. */}
        <div className="dojo-card" data-testid="ear-weeks-card">
          <div className="ear-weeks-head">
            <h2>週ごとの変化 <small>直近12週・白抜きの点は「まだ少ない」(10コード未満)</small></h2>
            <div className="ear-filter" role="radiogroup" aria-label="レベル">
              {(["all", ...LEVELS] as const).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={level === value} data-on={level === value || undefined}
                  data-testid={`ear-records-level-${value}`} onClick={() => setLevel(value)}>{value === "all" ? "すべて" : `レベル${value}`}</button>
              ))}
            </div>
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
