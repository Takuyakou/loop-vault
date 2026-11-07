import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUILTINS, builtinDisplayName } from "../../domain/chordDojo/builtins";
import {
  BENCHMARK_CONDITIONS, DEFAULT_SETTLE_MS, MAX_SETTLE_MS, MIN_SETTLE_MS, bankCounts, benchmarkQuestion, benchmarkRuns, benchmarkTooSoon, createEarRecordRepository,
  lastBenchmarks, recordsOfSession, thisAndLastWeek, type EarChordRecord, type EarKind, type EarLevel, type EarQuestion, type EarSession,
} from "../../domain/earPractice";
import type { SongIdea } from "../../domain/types";
import { DojoBackButton } from "../chord-dojo/DojoBackButton";
import { HOME_NAME } from "../chord-dojo/dojoNav";
import { availability, collectionChoices, makeQuestion, scanFor, type Recent } from "./earChoose";
import { EarBenchmarkResult } from "./EarBenchmarkResult";
import { EarRecordsView } from "./EarRecordsView";
import { EarRun } from "./EarRun";
import { dayLabel, pct, secText } from "./earFormat";
import { DEFAULT_EAR_SETTINGS, loadEarSettings, saveEarSettings, type EarSettings, type EarSource } from "./earSettings";
import "./ear-practice.css";

const LEVELS: ReadonlyArray<{ level: EarLevel; text: string }> = [
  { level: 1, text: "キーの中の三和音だけ(基本形)" },
  { level: 2, text: "借用・転回形・sus・dim・aug" },
  { level: 3, text: "セブンス(maj7・m7・7・m7♭5 など)" },
  { level: 4, text: "テンション・ベースがコードの外の分数コード" },
  { level: 5, text: "オルタード・mMaj7・♭9 / ♯9 / ♭13 / ♯11" },
];
const SOURCES: ReadonlyArray<{ id: EarSource; text: string }> = [
  { id: "bank", text: "出題用の進行" },
  { id: "builtin", text: "定番の進行" },
  { id: "collection", text: "自分の進行" },
];
const KEY_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

interface RunInfo {
  question: EarQuestion;
  name?: string;
  instance: number;
  /** The id of this run through the question (its start time). */
  playId: string;
  /** 腕試し: the level, the id of the whole benchmark and which of its questions this is. */
  benchmark?: { level: EarLevel; run: string; index: number };
}

/** 「耳で弾く」: the choosing screen, and a run through the question it makes. */
export function EarPracticeView({ ideas, onExit }: { ideas: readonly SongIdea[]; onExit: () => void }) {
  const [settings, setSettings] = useState<EarSettings>(loadEarSettings);
  const scan = useMemo(() => scanFor(ideas), [ideas]);
  const [run, setRun] = useState<RunInfo>();
  const [reason, setReason] = useState<string>();
  const [records, setRecords] = useState<EarChordRecord[]>([]);
  const [recordsNotice, setRecordsNotice] = useState<string>();
  const recordsRef = useRef<EarChordRecord[]>([]);
  const repository = useMemo(() => createEarRecordRepository(), []);
  const [overlay, setOverlay] = useState<"records" | "benchmark-result">();
  const [finishedBenchmark, setFinishedBenchmark] = useState<{ level: EarLevel; run: string }>();
  /** A weak point being practised (the questions with many chords of this kind). */
  const [focus, setFocus] = useState<EarKind>();
  const recent = useRef<Recent>({ ids: [] });
  const instance = useRef(0);

  useEffect(() => {
    let alive = true;
    repository.load().then((loaded) => {
      if (!alive) return;
      recordsRef.current = loaded.records;
      setRecords(loaded.records);
      setRecordsNotice(loaded.notice);
    }, () => { if (alive) setRecordsNotice("耳の記録を読めませんでした。練習はできますが、記録は残りません。"); });
    return () => { alive = false; };
  }, [repository]);

  const update = useCallback((patch: Partial<EarSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveEarSettings(next);
      return next;
    });
  }, []);

  const nameOf = useCallback((question: EarQuestion): string | undefined => {
    if (question.source === "bank") return question.name || undefined;
    if (question.source === "builtin") {
      const entry = BUILTINS.find((candidate) => question.id.startsWith(`builtin:${candidate.id}`));
      return entry ? builtinDisplayName(entry) : undefined;
    }
    return scan.segments.find((segment) => segment.id === question.id)?.displayName;
  }, [scan]);

  const begin = useCallback((chosen: EarSettings, kind?: EarKind) => {
    const { question, reason: why } = makeQuestion(chosen, scan, recent.current, Math.random, kind);
    if (!question) {
      setReason(why);
      return;
    }
    setReason(undefined);
    recent.current = { ids: [...recent.current.ids, question.id].slice(-30), tonic: question.tonic };
    instance.current += 1;
    setRun({ question, name: nameOf(question), instance: instance.current, playId: new Date().toISOString() });
  }, [nameOf, scan]);

  const start = useCallback(() => begin(settings, settings.source === "bank" ? focus : undefined), [begin, focus, settings]);

  const again = useCallback(() => {
    setRun((current) => {
      if (!current) return current;
      instance.current += 1;
      return { ...current, instance: instance.current, playId: new Date().toISOString() };
    });
  }, []);

  /** 腕試し: the fixed question `index` of the level, in its fixed key. */
  const benchmarkStep = useCallback((level: EarLevel, runId: string, index: number) => {
    const question = benchmarkQuestion(level, index, BENCHMARK_CONDITIONS.bpm);
    if (!question) { setReason("このレベルの腕試しの問題がありません"); return; }
    setReason(undefined);
    instance.current += 1;
    setRun({ question, name: nameOf(question), instance: instance.current, playId: new Date().toISOString(), benchmark: { level, run: runId, index } });
  }, [nameOf]);

  const startBenchmark = useCallback((level: EarLevel) => benchmarkStep(level, new Date().toISOString(), 0), [benchmarkStep]);

  /** The question was played to the end: keep its records, then go on (the next benchmark question, or the result). */
  const finished = useCallback(async (session: EarSession, info: RunInfo) => {
    const added = recordsOfSession(session, {
      at: new Date(), play: info.playId,
      ...(info.benchmark ? { benchmark: { level: info.benchmark.level, run: info.benchmark.run } } : {}),
    });
    let all = [...recordsRef.current, ...added];
    try {
      all = await repository.append(added);
    } catch {
      setRecordsNotice("記録を保存できませんでした。この回の結果は、この画面を閉じるまでしか残りません。");
    }
    recordsRef.current = all;
    setRecords(all);
    const bench = info.benchmark;
    if (!bench) return;
    if (bench.index + 1 < BENCHMARK_CONDITIONS.questions) benchmarkStep(bench.level, bench.run, bench.index + 1);
    else { setFinishedBenchmark({ level: bench.level, run: bench.run }); setRun(undefined); setOverlay("benchmark-result"); }
  }, [benchmarkStep, repository]);

  useEffect(() => {
    if (run) return undefined;
    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.closest("input,select,textarea,button,summary")) return;
      if (overlay) {
        if (event.key === "Escape") { event.preventDefault(); setOverlay(undefined); }
        return;
      }
      if (event.key === "Enter") { event.preventDefault(); start(); }
      else if (event.key === "Escape") { event.preventDefault(); onExit(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExit, overlay, run, start]);

  if (run) {
    // 腕試し is played with fixed conditions whatever the settings say
    const runSettings: EarSettings = run.benchmark
      ? { ...settings, showFirstName: BENCHMARK_CONDITIONS.showFirstName, autoPlay: BENCHMARK_CONDITIONS.autoPlay, bpm: BENCHMARK_CONDITIONS.bpm, settleMs: DEFAULT_SETTLE_MS, showDegrees: false }
      : settings;
    return (
      <section className="dojo ear" data-testid="ear-practice" data-screen="run">
        <EarRun
          key={run.instance}
          question={run.question}
          settings={runSettings}
          records={records}
          playId={run.playId}
          onFinished={(session) => { void finished(session, run); }}
          onShowDegrees={(value) => update({ showDegrees: value })}
          {...(run.benchmark ? { benchmarkStep: { index: run.benchmark.index, total: BENCHMARK_CONDITIONS.questions } } : {})}
          {...(run.name ? { resultName: run.name } : {})}
          onExit={() => setRun(undefined)}
          onAgain={again}
          onNext={start}
          onShiftKeyboard={(delta) => update({ octaveShift: Math.max(-2, Math.min(2, settings.octaveShift + delta)) })}
        />
      </section>
    );
  }

  if (overlay === "records") {
    return (
      <EarRecordsView
        records={records}
        now={new Date()}
        {...(recordsNotice ? { notice: recordsNotice } : {})}
        onBack={() => setOverlay(undefined)}
        onPractice={(kind, level) => {
          const next: EarSettings = { ...settings, source: "bank", level, tonic: settings.tonic === "original" ? "random" : settings.tonic };
          update({ source: "bank", level, tonic: next.tonic });
          setFocus(kind);
          setOverlay(undefined);
          begin(next, kind);
        }}
      />
    );
  }
  if (overlay === "benchmark-result" && finishedBenchmark) {
    const runs = benchmarkRuns(records).filter((candidate) => candidate.level === finishedBenchmark.level);
    const at = runs.findIndex((candidate) => candidate.run === finishedBenchmark.run);
    return (
      <section className="dojo ear" data-testid="ear-practice" data-screen="benchmark-result">
        <EarBenchmarkResult
          level={finishedBenchmark.level}
          current={at >= 0 ? runs[at] : undefined}
          previous={at > 0 ? runs[at - 1] : undefined}
          onAgain={() => { setOverlay(undefined); startBenchmark(finishedBenchmark.level); }}
          onRecords={() => setOverlay("records")}
          onExit={() => setOverlay(undefined)}
        />
      </section>
    );
  }

  const now = new Date();
  const week = thisAndLastWeek(records, now).thisWeek.figures;
  const lastBenchmark = lastBenchmarks(records, settings.level).last;
  const tooSoon = benchmarkTooSoon(records, settings.level, now);
  const counts = availability(settings, scan);
  const all = bankCounts({ includeExtra: settings.includeExtra });
  const saved = settings.source === "collection" ? collectionChoices(scan, settings.level, settings.length) : [];
  const here = settings.source === "bank" ? counts.bank.total : settings.source === "builtin" ? counts.builtin : counts.collection;

  return (
    <section className="dojo ear" data-testid="ear-practice" data-screen="choose">
      <div className="ear-choose">
        <div className="ear-choose-main">
          <div className="dojo-page-head">
            <DojoBackButton label={HOME_NAME} onBack={onExit} />
            <h1>耳で弾く</h1>
          </div>
          <p className="dojo-muted">進行を1周聴いて、1コードずつ鍵盤で弾き返します。名前は弾いて合うと出ます。</p>

          <fieldset className="ear-field">
            <legend>問題</legend>
            <div className="ear-seg" role="radiogroup" aria-label="問題">
              {SOURCES.map((source) => (
                <button key={source.id} type="button" role="radio" aria-checked={settings.source === source.id}
                  data-on={settings.source === source.id || undefined} data-testid={`ear-source-${source.id}`}
                  onClick={() => update({ source: source.id, tonic: source.id === "collection" ? "original" : settings.tonic === "original" ? "random" : settings.tonic })}>
                  {source.text}
                </button>
              ))}
            </div>
            <p className="ear-hint" data-testid="ear-count">
              {settings.source === "bank"
                ? `出題用の進行 ${all.total}${all.extra ? `(追加 ${all.extra} を含む)` : ""} ・ このレベル・長さでは ${here} 個`
                : settings.source === "builtin"
                  ? `定番の進行 ・ このレベル・長さでは ${here} 個`
                  : `自分の進行 ・ このレベル・長さでは ${here} 個`}
              {settings.source === "collection" && counts.collectionUnusableMeter ? ` ・ 拍子が 1/4 などの進行は、今は出題できません(${counts.collectionUnusableMeter}件)` : ""}
            </p>
            {settings.source === "collection" && saved.length ? (
              <label className="ear-inline">保存した進行
                <select value={settings.collectionBlockId} data-testid="ear-collection" onChange={(event) => update({ collectionBlockId: event.target.value })}>
                  <option value="any">おまかせ</option>
                  {saved.map((choice) => <option key={choice.blockId} value={choice.blockId}>{choice.name}</option>)}
                </select>
              </label>
            ) : null}
          </fieldset>

          <fieldset className="ear-field">
            <legend>レベル</legend>
            <div className="ear-levels" role="radiogroup" aria-label="レベル">
              {LEVELS.map(({ level, text }) => (
                <button key={level} type="button" role="radio" aria-checked={settings.level === level} data-on={settings.level === level || undefined}
                  data-testid={`ear-level-${level}`} onClick={() => update({ level })}>
                  <b>{level}</b><span>{text}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="ear-row">
            <fieldset className="ear-field">
              <legend>長さ</legend>
              <div className="ear-seg" role="radiogroup" aria-label="長さ">
                {([4, 8, 16] as const).map((length) => (
                  <button key={length} type="button" role="radio" aria-checked={settings.length === length} data-on={settings.length === length || undefined}
                    data-testid={`ear-length-${length}`} onClick={() => update({ length })}>{length}小節</button>
                ))}
              </div>
            </fieldset>
            <label className="ear-inline">キー
              <select value={String(settings.tonic)} data-testid="ear-tonic"
                onChange={(event) => { const value = event.target.value; update({ tonic: value === "random" || value === "original" ? value : Number(value) }); }}>
                <option value="random">ランダム</option>
                {settings.source !== "bank" ? <option value="original">元のキー</option> : null}
                {KEY_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
              </select>
            </label>
            <label className="ear-inline">テンポ
              <input type="number" min={60} max={140} step={1} value={settings.bpm} data-testid="ear-bpm"
                onChange={(event) => { const value = Number(event.target.value); if (value >= 60 && value <= 140) update({ bpm: value }); }} />
            </label>
          </div>

          <details className="ear-details">
            <summary>詳しい設定</summary>
            <label><input type="checkbox" checked={settings.showDegrees} data-testid="ear-show-degrees" onChange={(event) => update({ showDegrees: event.target.checked })} /> 度数と機能を最初から見せる(学習用。見せたコードは成績に入りません)</label>
            <label><input type="checkbox" checked={settings.showFirstName} data-testid="ear-first-name" onChange={(event) => update({ showFirstName: event.target.checked })} /> 1つ目のコード名を見せる</label>
            <label><input type="checkbox" checked={settings.autoPlay} data-testid="ear-autoplay" onChange={(event) => update({ autoPlay: event.target.checked })} /> 次のコードに進んだら自動で鳴らす</label>
            <label><input type="checkbox" checked={settings.includeExtra} data-testid="ear-extra" onChange={(event) => update({ includeExtra: event.target.checked })} /> 追加の進行も出す</label>
            <label className="ear-inline">答えを確定するまでの時間
              <input type="number" min={MIN_SETTLE_MS} max={MAX_SETTLE_MS} step={50} value={settings.settleMs} data-testid="ear-settle"
                onChange={(event) => { const value = Number(event.target.value); if (value >= MIN_SETTLE_MS && value <= MAX_SETTLE_MS) update({ settleMs: value }); }} /> ms
            </label>
            <label><input type="checkbox" checked={settings.showClock} data-testid="ear-show-clock" onChange={(event) => update({ showClock: event.target.checked })} /> 時計のずれを表示する(機器の確認用)</label>
            <button type="button" onClick={() => setSettings(() => { saveEarSettings(DEFAULT_EAR_SETTINGS); return DEFAULT_EAR_SETTINGS; })}>初期値に戻す</button>
          </details>

          {focus && settings.source === "bank" ? (
            <p className="ear-notice" data-testid="ear-focus">苦手の練習: 「{focus}」のコードを多く含む問題を出しています
              <button type="button" data-testid="ear-focus-clear" onClick={() => setFocus(undefined)}>やめる</button></p>
          ) : null}
          {reason ? <p className="ear-notice" role="alert" data-testid="ear-reason">{reason}</p> : null}
          <div className="ear-actions">
            <button type="button" className="dojo-primary dojo-big" data-testid="ear-start" onClick={start}>始める <kbd>Enter</kbd></button>
          </div>
        </div>

        <aside className="ear-side" aria-label="腕試しと成績">
          <div className="dojo-card" data-testid="ear-benchmark-card">
            <h2>腕試し <small>レベル{settings.level}</small></h2>
            <p className="dojo-muted">同じ4問を、同じキー・テンポ{BENCHMARK_CONDITIONS.bpm}・1つ目のコード名ありで弾いて、前回と比べます。聴き直し・ヒントは使えます(数を記録します)。</p>
            {lastBenchmark ? (
              <p className="ear-line" data-testid="ear-benchmark-last">前回 {dayLabel(lastBenchmark.at)} ・ 一発 {pct(lastBenchmark.figures.firstTryRate)} ・ {secText(lastBenchmark.figures.medianSec)}</p>
            ) : <p className="ear-line">まだ腕試しをしていません。</p>}
            {tooSoon ? <p className="ear-notice" data-testid="ear-benchmark-soon">7日以上空けると比べやすくなります</p> : null}
            <button type="button" data-testid="ear-benchmark-start" onClick={() => startBenchmark(settings.level)}>レベル{settings.level}の腕試しを始める</button>
          </div>
          <div className="dojo-card" data-testid="ear-recent-card">
            <h2>今週の成績</h2>
            {week.measured ? (
              <p className="ear-line" data-testid="ear-recent">一発 {pct(week.firstTryRate)} ・ 秒数 {secText(week.medianSec)} ・ {week.measured}コード{week.few ? "(まだ少ない)" : ""}</p>
            ) : <p className="dojo-muted" data-testid="ear-recent">今週はまだ記録がありません。</p>}
            {recordsNotice ? <p className="ear-notice" role="status" data-testid="ear-records-notice">{recordsNotice}</p> : null}
            <button type="button" data-testid="ear-open-records" onClick={() => setOverlay("records")}>耳の記録を開く</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
