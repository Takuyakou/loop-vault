import { displayChordLabel } from "../../ui/chordText";
import { ResumeBand, ResumeGoButton } from "../../components/ui";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { openMidiPanel } from "../../liveMidi/midiPanel";
import { JAZZ_PROGRESSIONS_ITEMS } from "../../domain/chordDojo/jazzProgressions";
import { ORIGINAL_IDS } from "../../domain/chordDojo/originalPractice";
import { DRILL_KEY_NAMES, drillSetById, drillSetRevision } from "../../domain/chordDojo/voicingDrill";
import { drillEntryFor } from "../../domain/chordDojo/voicingDrillRecords";
import { formatDrillSeconds } from "../../domain/chordDojo/voicingDrillProgress";
import type { PracticeChoice } from "../../domain/master251/scheduler";
import { withCells } from "../../domain/master251/model";
import { masterProgressForRange } from "../../domain/master251/register";
import type { DojoStore, ItemRecord, Task } from "../../domain/chordDojo/store";
import { DojoKeyGrid } from "./DojoKeyGrid";
import { keyDisplay } from "./presentation";
import { Master251Card } from "./Master251View";
import { completionOf, drillStageCounts, earHomeScore, newestDrillBest } from "./dojoHomeProgress";
import { DOJO_STAGE_LABEL, dojoRecentLabels, dojoRecentStore, dojoRecentTitle, relativeDayLabel, type DojoRecentEntry } from "./dojoRecent";
import { useHomeRecords } from "./useHomeRecords";
import "./dojoHome.css";
import { StandardArt, EarArt, DrillArt, ChevronRight } from "./dojoHomeArt";

const JAZZ_IDS = JAZZ_PROGRESSIONS_ITEMS.map((item) => item.id);

export interface HomePlanRow { readonly name: string; readonly tasks: readonly { readonly key: string; readonly label: string; readonly detail?: string }[] }
export interface HomeWantedItem { readonly task: Task; readonly label: string; readonly days?: number }

export interface DojoHomeProps {
  readonly file: DojoStore;
  readonly today: NonNullable<DojoStore["today"]>;
  readonly progressions: readonly { readonly key: string; readonly name: string }[];
  readonly connected: boolean;
  readonly midiBusy: boolean;
  readonly midiError?: string;
  readonly wanted: readonly HomeWantedItem[];
  readonly shapeRecord?: ItemRecord;
  readonly homeShapeLabel: string;
  readonly keyLimit: number;
  readonly planRows: readonly HomePlanRow[];
  readonly startLabel: string;
  readonly budgetMinutes: number;
  readonly reviewLimit: number;
  readonly budgetDisabled: boolean;
  readonly startToday: () => void;
  readonly onStandard: () => void;
  readonly onJazz: () => void;
  readonly onOriginal: () => void;
  readonly onMaster: (choice?: PracticeChoice) => void;
  readonly onEar: (records?: boolean) => void;
  readonly onDrill: (stage?: 1 | 2 | 3 | 4) => void;
  /** P23-40: the guided course summary behind the same home card (no material selection). */
  readonly course?: {
    readonly level: number;
    readonly block: string;
    readonly remaining: number;
    /** How many questions the current set has (the current stop shows 「済んだ数/全部」). */
    readonly total?: number;
    readonly label: string;
    readonly levelText?: string;
    readonly hint?: string;
    readonly status?: "start" | "resume" | "done";
  };
  readonly onGuide: () => void;
  readonly onSaved: () => void;
  readonly onVoicing: () => void;
  readonly onShape: () => void;
  readonly onWanted: (task: Task) => void;
  readonly onResume: (entry: DojoRecentEntry) => void;
  readonly onChangeBudget: (minutes: number) => void;
  readonly onChangeReviewLimit: (limit: number) => void;
  /** The source progression changed or disappeared; shown in the one home banner. */
  readonly sourceChanged?: boolean;
}

const shortFlow = ["復習", "型", "登録した音", "進行"];

/** P23-31b Z3: the short visible names of the drill's four stages (the aria-label/title keeps the long ones). */
const DRILL_STAGE_SHORT: Record<1 | 2 | 3 | 4, string> = {
  1: "① 循環コード",
  2: "② ダイアトニック",
  3: "③ テンションの形",
  4: "④ 短い転調",
};

/**
 * P23-47-fix-4: the course's nine stops, in order. `short` is what the home's rail shows (two short lines at most; the
 * second line starts at the second part); `full` is the level's own name (the level box of the course uses it).
 */
const GUIDE_STOPS: readonly { readonly level: string; readonly short: readonly string[]; readonly full: string }[] = [
  { level: "Lv1", short: ["メジャーと", "マイナー"], full: "メジャーとマイナー" },
  { level: "Lv2", short: ["4種類の", "セブンス"], full: "4種類のセブンス" },
  { level: "Lv3", short: ["12キーで", "引き出す"], full: "12キーで引き出す" },
  { level: "Lv4", short: ["配置を選ぶ"], full: "配置を選ぶ" },
  { level: "Lv5", short: ["進行を", "つなぐ"], full: "進行を覚えてつなぐ" },
  { level: "Lv6", short: ["キーを", "変える"], full: "キーを変えて使う" },
  { level: "Lv7", short: ["耳から進行"], full: "耳から進行を弾く" },
  { level: "Lv8", short: ["響きを", "広げる"], full: "響きの語彙を広げる" },
  { level: "総合", short: ["取り出す"], full: "覚えた響きを取り出す" },
];

/** Where the course is: 1–8 for a level, 9 for 総合確認. */
function guideStop(course: DojoHomeProps["course"]): number {
  if (!course) return 1;
  if (course.levelText?.startsWith("総合")) return 9;
  return Math.max(1, Math.min(8, course.level));
}

/** Segments as many as the total (a bar in the number's own shape). More than 24 would be dust: one plain bar then. */
function Pips({ done, total }: { readonly done: number; readonly total: number }) {
  if (total < 1 || total > 24) return <span className="dojo-home-p20-pips" data-plain="true" aria-hidden="true"><i data-on={total > 0 && done >= total ? "true" : undefined} style={{ flex: "1 1 auto" }} /></span>;
  return <span className="dojo-home-p20-pips" aria-hidden="true">{Array.from({ length: total }, (_, index) => <i key={index} data-on={index < done ? "true" : undefined} />)}</span>;
}

/**
 * P23-47-fix-4: the guided course is its own group under the four cards, as Bass Practice puts 「MIDI のベースライン」
 * under its four echoes: a group label, then one wide card. The card says where the course is (the level, what is left,
 * and what pressing it does) and shows the nine stops with their names.
 */
interface HomeStatSnapshot {
  readonly jazzDone?: number;
  readonly originalDone?: number;
  readonly mastered?: number;
  readonly earLast?: number;
  readonly drillBestMs?: number;
  readonly guideDone?: number;
  readonly guideRemaining?: number;
}

type HomeStatKey = keyof HomeStatSnapshot;
type RolledHomeStats = Partial<Record<HomeStatKey, boolean>>;

/** P23-58 A10: in-session memory of the stats last seen on Chord Dojo home. */
let lastSeenHomeStats: HomeStatSnapshot | null = null;

function GuideCard(props: DojoHomeProps & { readonly rolled?: RolledHomeStats }) {
  const course = props.course;
  const stop = guideStop(course);
  const done = course?.status === "done";
  const resume = course?.status === "resume";
  const levelText = course?.levelText ?? (course ? `Lv${course.level}` : "Lv1");
  const remaining = course?.remaining ?? 0;
  const total = resume && course?.total !== undefined && course.total >= remaining ? course.total : undefined;
  const rest = course ? (course.label.startsWith(levelText) ? course.label.slice(levelText.length).trim() : course.label) : "";
  const status = remaining > 0 ? `${GUIDE_STOPS[stop - 1]!.full}・残り ${remaining} 問` : rest || (course?.label ?? "");
  return <article className="dojo-home-p20-card dojo-home-guide" data-testid="home-guide" data-wide="true">
    <div className="dojo-home-guide-head">
      <h2><button type="button" className="dojo-card-primary" aria-label="ガイド練習" data-focus-key="home:guide:open" onClick={props.onGuide}>ガイド練習</button></h2>
      <p className="dojo-home-p20-desc">コードを、名前・耳・進行の中で弾けるようにします</p>
      <div className="dojo-home-guide-now">
        <b data-testid="home-guide-material">{levelText}</b>
        {resume
          ? <span data-testid="home-guide-status" data-rolled={props.rolled?.guideRemaining ? "true" : undefined}>{status}</span>
          : <span data-testid="home-guide-hint">{course?.hint ?? "最初の響き C を見本で聴けます"}</span>}
        {/* The whole card is the button (its name opens it); this is what pressing it does, drawn as the filled button. */}
        <span className="dojo-home-guide-go" aria-hidden="true">{resume ? "続きから" : done ? "開く" : "始める"}</span>
      </div>
    </div>
    <ol className="dojo-home-guide-rail" aria-label="ガイド練習の段">
      {GUIDE_STOPS.map((item, index) => {
        const state = done || index + 1 < stop ? "done" : index + 1 === stop ? "now" : "todo";
        const width = state === "done" ? 100 : state === "now" && total ? Math.round((total - remaining) / total * 100) : 0;
        return <li key={item.level} data-state={state} aria-current={state === "now" ? "step" : undefined} title={`${item.level} ${item.full}`}>
          <span className="dojo-home-guide-level">{item.level}{state === "now" && total ? <span data-testid="home-guide-count" data-rolled={props.rolled?.guideDone ? "true" : undefined}>{total - remaining}/{total}</span> : null}</span>
          <span className="dojo-home-guide-bar" aria-hidden="true"><i style={{ width: `${width}%` }} /></span>
          <span className="dojo-home-guide-name">{item.short[0]}{item.short[1] ? <><wbr />{item.short[1]}</> : null}</span>
        </li>;
      })}
    </ol>
  </article>;
}

interface RecentView {
  readonly entry: DojoRecentEntry;
  readonly practice: string;
  readonly item?: string;
  readonly stage?: string;
  readonly key?: string;
  readonly status: "ok" | "loading" | "error" | "missing";
}

export function DojoHome(props: DojoHomeProps) {
  const { file, today, progressions, connected, midiBusy, wanted, shapeRecord, homeShapeLabel, keyLimit, planRows, startLabel } = props;
  const recent = useStore(dojoRecentStore, (state) => state.entries);
  const records = useHomeRecords();
  const [details, setDetails] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const jazz = records.jazz.state === "ready" ? completionOf(JAZZ_IDS, { laps: records.jazz.file.laps }) : undefined;
  const original = records.original.state === "ready" ? completionOf(ORIGINAL_IDS, { laps: records.original.file.laps }) : undefined;
  const drillBest = records.drill.state === "ready" ? newestDrillBest(records.drill.file) : undefined;
  const recentDrill = recent.find((entry) => entry.kind === "drill");
  const recentDrillEntry = recentDrill && records.drill.state === "ready" && recentDrill.key !== undefined && recentDrill.stage
    ? drillEntryFor(records.drill.file, recentDrill.id, drillSetRevision(recentDrill.id), recentDrill.key, recentDrill.stage)
    : undefined;
  const drill = recentDrill
    ? { setId: recentDrill.id, stage: recentDrill.stage ?? "see", key: recentDrill.key ?? 0, bestMs: recentDrillEntry?.best?.totalMs }
    : drillBest;
  const ear = records.ear.state === "ready" ? earHomeScore(records.ear.file) : undefined;
  const earError = records.ear.state === "error";
  const drillError = records.drill.state === "error";
  const completionMissing = records.jazz.state === "error" || records.original.state === "error";

  const describe = (entry: DojoRecentEntry): RecentView => {
    const labels = dojoRecentLabels(entry, {
      progressions,
      voicingSymbol: (id) => file.voicings[id]?.occurrences.slice(-1)[0]?.harmony.symbol,
    });
    // A drill entry also waits for (or fails to read) its own record file; the other kinds are missing when the item is gone.
    const status: RecentView["status"] = entry.kind === "drill" && records.drill.state === "loading" ? "loading"
      : entry.kind === "drill" && records.drill.state === "error" ? "error"
        : labels.exists ? "ok" : "missing";
    return {
      entry,
      practice: labels.practice,
      ...(labels.item !== undefined ? { item: labels.item } : {}),
      ...(labels.stage !== undefined ? { stage: labels.stage } : {}),
      ...(labels.key !== undefined ? { key: labels.key } : {}),
      status,
    };
  };

  const views = recent.map(describe).filter((view) => view.status !== "missing");
  const main = views[0];
  const others = views.slice(1, 3);
  const mainDisabled = !main || main.status !== "ok";
  const mainRef = useRef<RecentView | undefined>(main);
  mainRef.current = main;
  // Enter resumes only when nothing is focused (a button/link keeps its own Enter; an input/IME or a panel is left alone).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return;
      if (document.querySelector("[role=dialog]")) return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      if (target?.closest("input,select,textarea,button,a,summary,[contenteditable=true]")) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && active.closest("input,select,textarea,button,a,summary,[contenteditable=true]")) return;
      const current = mainRef.current;
      if (!current || current.status !== "ok") return;
      event.preventDefault();
      props.onResume(current.entry);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [props.onResume]);

  const titleOf = (view: RecentView) => dojoRecentTitle(view);
  const statusText = (status: RecentView["status"]) => status === "loading" ? "読み込み中" : status === "error" ? "今は開けません" : "";
  const todayCounts = shortFlow.map((name, index) => ({ name, count: planRows[index]?.tasks.length ?? 0 }));
  const minutes = Math.max(1, Math.ceil(today.tasks.reduce((sum, task) => sum + task.seconds, 0) / 60));
  const themeChordLabels = today.lesson?.chords.slice(0, 3).map((card) => card.chord.label) ?? [];
  const budgetSummary = `今の計画：約${Math.ceil(today.tasks.reduce((sum, task) => sum + task.seconds, 0) / 60)}分・確認 ${(today.lesson?.budget.previousReviews ?? 0) + today.tasks.filter((task) => task.review).length}/${props.reviewLimit}`;
  // P23-47-fix-4: the 12 keys of the home's shape, counted by the same states the key grid draws.
  const shapeCounts = { fast: 0, slow: 0, self: 0, pending: 0 };
  for (let root = 0; root < 12; root += 1) shapeCounts[keyDisplay(shapeRecord, root, keyLimit).state] += 1;

  // P23-47-fix-4: the first read of the records (and the course summary) shows the home only when it is ready,
  // so numbers do not pop in a moment later. Waiting is capped at 250ms; a slower read shows the home as before.
  const loaded = Object.values(records).every((record) => record.state !== "loading") && props.course !== undefined;
  const [waited, setWaited] = useState(loaded);
  useEffect(() => {
    if (loaded || waited) return;
    const timer = window.setTimeout(() => setWaited(true), 250);
    return () => window.clearTimeout(timer);
  }, [loaded, waited]);

  // P23-58 A10: roll digits once when returning to Home with a stat that changed since last seen in this session.
  const masteredCount = Object.values(masterProgressForRange(withCells(file.master251)).cells).filter((c) => c.status === "master").length;
  const guideRem = props.course?.remaining;
  const guideTot = props.course?.status === "resume" && props.course.total !== undefined && guideRem !== undefined && props.course.total >= guideRem ? props.course.total : undefined;
  const guideDoneCount = guideTot !== undefined && guideRem !== undefined ? guideTot - guideRem : undefined;
  const [rolled, setRolled] = useState<RolledHomeStats>({});
  const checkedRollRef = useRef(false);
  useEffect(() => {
    if (!loaded || checkedRollRef.current) return;
    checkedRollRef.current = true;
    const current: HomeStatSnapshot = {
      jazzDone: jazz?.done,
      originalDone: original?.done,
      mastered: masteredCount,
      earLast: typeof ear?.last === "number" ? ear.last : undefined,
      drillBestMs: drill?.bestMs,
      guideDone: guideDoneCount,
      guideRemaining: guideRem,
    };
    if (lastSeenHomeStats !== null) {
      const next: RolledHomeStats = {};
      (Object.keys(current) as HomeStatKey[]).forEach((key) => {
        if (current[key] !== undefined && lastSeenHomeStats![key] !== current[key]) {
          next[key] = true;
        }
      });
      if (Object.keys(next).length > 0) setRolled(next);
    }
    lastSeenHomeStats = current;
  }, [drill?.bestMs, ear?.last, guideDoneCount, guideRem, jazz?.done, loaded, masteredCount, original?.done]);

  return <div className="dojo-home-p20" data-testid="dojo-home" data-loading={!loaded && !waited ? "true" : undefined}>
    <ResumeBand screen="cd" testId="home-resume" label="続きから"
      title={main ? titleOf(main) : "まずは「ガイド練習」か「定番の進行」から"}
      tags={main?.item ? [main.item] : undefined}
      when={main ? relativeDayLabel(main.entry.at) : "練習を始めると、ここから続けられます"}
      note={main !== undefined && main.status !== "ok" ? statusText(main.status) : undefined}
      extra={others.length ? <><span className="lv-resume-band-extra-label">ほかの最近</span>{others.map((view, index) => <button type="button" className="lv-resume-band-chip" key={`${view.entry.kind}:${view.entry.id}`} data-testid={`home-recent-${index}`} data-focus-key={`home:recent:${index}`} data-focus-fallback="home:resume:go" disabled={view.status !== "ok"} title={titleOf(view)} onClick={() => props.onResume(view.entry)}><span className="lv-resume-band-chip-text">{view.practice}{view.item ? ` · ${view.item}` : ""}</span></button>)}</> : undefined}>
      {main ? <ResumeGoButton label="続ける" data-testid="home-resume-go" data-primary="true" data-focus-key="home:resume:go" data-focus-fallback="home:standard:open" disabled={mainDisabled} onClick={() => props.onResume(main.entry)} />
        : <button type="button" className="dojo-home-p20-primary" data-primary="true" data-focus-key="home:resume:start" onClick={props.onGuide}>ガイド練習を始める</button>}
    </ResumeBand>

    {/* P23-31 D1: the MIDI notice sits between 続きから and the four cards (the mock's order). */}
    {!bannerDismissed && (props.midiError || !connected || props.sourceChanged) ? <div className="dojo-home-p20-midi" data-testid="home-midi-banner" data-midi-kind={midiBusy ? "connecting" : "off"} role="status">
      <div className="dojo-home-p20-banner-rows">
        {props.midiError ? <p role="alert"><b>MIDI 接続でエラーが起きました。</b>{props.midiError}</p> : null}
        {!connected ? <p><b>MIDI 鍵盤がつながっていません。</b>{midiBusy ? "MIDI 接続を確認しています。" : "答えを見て「弾けた/まだ」を押す形で進みます。"}</p> : null}
        {props.sourceChanged ? <p><b>元の進行が変更または削除されています。</b>この練習は開始時に固定した音で続けます。</p> : null}
      </div>
      <button type="button" onClick={(event) => openMidiPanel(event.currentTarget)}>MIDI 設定</button>
      <button type="button" aria-label="この注意を閉じる" onClick={() => setBannerDismissed(true)}>×</button>
    </div> : null}

    <div className="dojo-home-p20-body">
      <div className="dojo-home-p20-left">
        <div className="dojo-home-p20-main">
          <article className="dojo-home-p20-card" data-testid="home-standard">
            <span className="dojo-home-art-box"><StandardArt /></span>
            <div className="dojo-home-card-body">
              <h2><button type="button" className="dojo-card-primary" aria-label="定番の進行" data-focus-key="home:standard:open" onClick={props.onStandard}>定番の進行</button><ChevronRight /></h2>
              <p className="dojo-home-p20-desc">J-POP・ジャズ・ネオソウルなどの進行を、12 キー・ランダムキーで弾く</p>
              {completionMissing ? <p className="dojo-home-p20-small-warn">記録を読めませんでした</p> : null}
              {/* P23-47-fix-4: the card's two lists are two rows — the name, how many have a completed lap, and one segment each. */}
              <div className="dojo-home-p20-links dojo-home-p20-rows">
                <button type="button" className="dojo-home-p20-row" data-testid="home-open-jazz" data-focus-key="home:standard:jazz" data-focus-fallback="home:standard:open" onClick={props.onJazz}>
                  <span className="dojo-home-p20-row-name">Jazz Progressions</span>
                  <span className="dojo-home-p20-row-count"><em>完奏</em><b data-testid="home-jazz-count" data-rolled={rolled.jazzDone ? "true" : undefined}>{jazz ? `${jazz.done} / ${jazz.total}` : "—"}</b></span>
                  <ChevronRight />
                  <Pips done={jazz?.done ?? 0} total={jazz?.total ?? JAZZ_IDS.length} />
                </button>
                <button type="button" className="dojo-home-p20-row" data-testid="home-open-original" data-focus-key="home:standard:original" data-focus-fallback="home:standard:open" onClick={props.onOriginal}>
                  <span className="dojo-home-p20-row-name">Original Practice</span>
                  <span className="dojo-home-p20-row-count"><em>完奏</em><b data-testid="home-original-count" data-rolled={rolled.originalDone ? "true" : undefined}>{original ? `${original.done} / ${original.total}` : "—"}</b></span>
                  <ChevronRight />
                  <Pips done={original?.done ?? 0} total={original?.total ?? ORIGINAL_IDS.length} />
                </button>
              </div>
            </div>
          </article>

          <Master251Card home store={file.master251} masteredRolled={rolled.mastered} onContinue={props.onMaster} description="Form A〜D × 12 キーで、2-5-1 を考えずに弾けるようにする" />

          <article className="dojo-home-p20-card" data-testid="home-ear">
            <span className="dojo-home-art-box"><EarArt score={earError ? undefined : ear?.last} /></span>
            <div className="dojo-home-card-body">
              <h2><button type="button" className="dojo-card-primary" aria-label="耳で弾く" data-testid="ear-open" data-focus-key="home:ear:start" onClick={() => props.onEar(false)}>耳で弾く</button><ChevronRight /></h2>
              <p className="dojo-home-p20-desc">流れた進行を聴いて、鍵盤で弾き当てる</p>
              {earError || typeof ear?.last !== "number"
                ? <div className="dojo-home-p20-stat" data-none="true"><b data-testid="home-ear-last">{earError ? "—" : "まだ"}</b>{earError ? null : <span>1 回弾くと、点が付きます</span>}</div>
                : <div className="dojo-home-p20-stat"><b><span data-testid="home-ear-last" data-rolled={rolled.earLast ? "true" : undefined}>{ear.last}</span><small> 点</small></b><span>前回{ear.lastAt ? ` ・ ${relativeDayLabel(ear.lastAt)}` : ""}</span></div>}
              {/* P23-47-fix-4: the score is a first-try rate (0–100), so it is drawn on a 100-wide scale; the white mark is the best. */}
              {!earError && typeof ear?.last === "number"
                ? <>
                  <div className="dojo-home-p20-scale" data-testid="home-ear-scale" aria-hidden="true">
                    <i style={{ width: `${Math.max(0, Math.min(100, ear.last))}%` }} />
                    {ear.best !== undefined ? <u style={{ left: `${Math.max(0, Math.min(100, ear.best))}%` }} /> : null}
                  </div>
                  {ear.best !== undefined ? <div className="dojo-home-p20-scale-cap"><span data-testid="home-ear-best" style={{ left: `clamp(30px, ${Math.max(0, Math.min(100, ear.best))}%, calc(100% - 30px))` }}>ベスト <b>{ear.best}</b></span></div> : null}
                </>
                : <div className="dojo-home-p20-scale" data-empty="true" aria-hidden="true" />}
              {earError ? <p className="dojo-home-p20-small-warn">記録を読めませんでした</p> : null}
              <div className="dojo-home-p20-links">
                <button type="button" className="dojo-home-p20-link" data-focus-key="home:ear:records" data-focus-fallback="home:ear:start" data-testid="home-ear-records" onClick={() => props.onEar(true)}>記録を見る</button>
              </div>
            </div>
          </article>

          <article className="dojo-home-p20-card" data-testid="home-drill">
            <span className="dojo-home-art-box"><DrillArt /></span>
            <div className="dojo-home-card-body">
              <h2><button type="button" className="dojo-card-primary" aria-label="ボイシングドリル" data-focus-key="home:drill:open" onClick={() => props.onDrill()}>ボイシングドリル</button><ChevronRight /></h2>
              <p className="dojo-home-p20-desc">決まった押さえ方を、考えずに素早く押さえる。打ち込み・リアルタイム入力の練習</p>
              <div className="dojo-home-p20-stat" data-none={drillError || drill?.bestMs === undefined ? "true" : undefined}>
                {drillError || drill?.bestMs === undefined
                  ? <b data-testid="home-drill-best">{drillError ? "—" : "まだ"}</b>
                  : <b data-testid="home-drill-best" data-rolled={rolled.drillBestMs ? "true" : undefined}>{formatDrillSeconds(drill.bestMs)}<small> 秒</small></b>}
                <span>{drillError ? "" : drill?.bestMs !== undefined ? "自己ベスト" : "1 周弾くと、自己ベストが付きます"}</span>
              </div>
              {drill && !drillError ? <p className="dojo-home-p20-next" data-testid="home-drill-which">{drillSetById(drill.setId)?.name ?? drill.setId}・{DOJO_STAGE_LABEL[drill.stage]}・{DRILL_KEY_NAMES[drill.key]}</p> : null}
              {drillError ? <span className="dojo-home-p20-small-warn">記録を読めませんでした</span> : null}
              <div className="dojo-home-p20-links dojo-home-p20-stage-links">{drillStageCounts.map((stage) => <button type="button" className="dojo-home-p20-link" key={stage.stage} data-testid={`home-drill-stage-${stage.stage}`} data-focus-key={`home:drill:stage:${stage.stage}`} data-focus-fallback="home:drill:open" aria-label={`${stage.label} ${stage.count} 組`} title={`${stage.label} ${stage.count} 組`} onClick={() => props.onDrill(stage.stage)}>{DRILL_STAGE_SHORT[stage.stage]}</button>)}</div>
            </div>
          </article>

        </div>
        {/* P23-47-fix-4: the guided course is its own group under the four cards (Bass Practice's 「弾いて確かめる」). */}
        <div className="dojo-home-p20-section-title dojo-home-guide-group">順番に学ぶ<span className="dojo-home-p20-hint">見本を見て弾き、Lv1 から段を進めます</span></div>
        <GuideCard {...props} rolled={rolled} />
      </div>

      <aside className="dojo-home-p20-sub">
        <section className="dojo-home-p20-mini dojo-home-p20-today" data-testid="home-today">
          <div className="dojo-home-mini-head">
            <h3>今日のおまかせ</h3>
            <small>目安 {minutes} 分</small>
          </div>
          {/* P23-31b H6: the theme's chords are chips. P23-47-fix-4: the minutes are in the head; the mix is the bar below. */}
          <p data-testid="dojo-theme">
            テーマ
            {themeChordLabels.length
              ? themeChordLabels.map((label, index) => <span key={`${label}-${index}`}>{" "}<span className="dojo-home-theme-chip">{displayChordLabel(label)}</span></span>)
              : " なし"}
          </p>
          <div className="dojo-home-today-mix" data-testid="home-today-mix" aria-hidden="true">{todayCounts.map((item, index) => item.count ? <i key={item.name} data-flow={index} style={{ flexGrow: item.count }} /> : null)}</div>
          <div className="dojo-home-today-flows">{todayCounts.map((item, index) => <div key={item.name} data-flow={index} data-empty={item.count === 0 || undefined}><i aria-hidden="true" /><span>{item.name}</span><b>{item.count}</b></div>)}</div>
          <div className="dojo-home-mini-actions">
            <button type="button" className="dojo-home-today-start" data-testid="practice-start" data-focus-key="home:today:start" aria-label="始める" title={startLabel} onClick={props.startToday}>始める</button>
            <button type="button" className="dojo-home-p20-link" data-testid="home-today-details" data-focus-key="home:today:details" data-focus-fallback="home:today:start" aria-expanded={details || undefined} onClick={() => setDetails((open) => !open)}>{details ? "閉じる" : "中身を見る"}</button>
          </div>
          {details ? <div className="dojo-home-p20-today-details" data-testid="home-today-details-body">
            {today.lesson ? <div className="dojo-home-p20-theme dojo-theme">
              <h4>{today.lesson.source.name}</h4>
              <p>{today.lesson.source.keyContext ?? "元のキー"} · {today.lesson.source.rangeLabel}</p>
              <p>{today.lesson.chords.map((card) => displayChordLabel(card.chord.label)).join(" → ")}</p>
              <small>目安 約{Math.ceil(today.lesson.budget.estimatedSeconds / 60)}分 / 上限{Math.ceil(today.lesson.budget.limitSeconds / 60)}分</small>
              {today.lesson.skips.length ? <details><summary>今回外した練習と理由</summary>{today.lesson.skips.map((skip, index) => <p key={index}>{skip.unit}：{skip.reason}</p>)}</details> : null}
            </div> : <p className="dojo-home-p20-muted">{today.legacyResumeTask !== undefined ? "以前の課題をこの練習の終わりまで続けます。" : "この時間枠で安全に練習できる進行はありません。"}</p>}
            <div className="dojo-home-p20-plan">{planRows.map((row) => <div key={row.name} data-empty={row.tasks.length===0||undefined}><b>{row.name}</b><div>{row.tasks.length ? row.tasks.map((task) => <span key={task.key} title={task.detail}>{task.label}</span>) : <small>今日はありません</small>}</div><small>{row.tasks.length}</small></div>)}</div>
            {today.planningSkips?.length ? <details><summary>今回外した練習と理由</summary>{today.planningSkips.map((skip, index) => <p key={index}>{skip.unit}：{skip.reason}</p>)}</details> : null}
            <div className="dojo-home-p20-budget"><label>1回の目安 <input aria-label="計画の時間枠" type="number" min="0" max="150" step="1" disabled={props.budgetDisabled} value={props.budgetMinutes} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 150) props.onChangeBudget(value); }} />分</label><label>確認の上限 <input aria-label="今日の確認上限" type="number" min="0" max="6" disabled={props.budgetDisabled} value={props.reviewLimit} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 6) props.onChangeReviewLimit(value); }} />件</label><p className="dojo-budget-summary">{budgetSummary}</p></div>
          </div> : null}
        </section>

        <section className="dojo-home-p20-mini" data-testid="home-shape">
          <div className="dojo-home-mini-head">
            <h3><button type="button" className="dojo-card-primary" aria-label="型の一覧" data-focus-key="home:shape" onClick={props.onShape}>コードの型</button></h3>
            <small>{homeShapeLabel}</small>
            <button type="button" className="dojo-home-mini-link" data-focus-key="home:shape:list" data-focus-fallback="home:shape" aria-label="型の一覧を開く" onClick={props.onShape}>一覧 <ChevronRight /></button>
          </div>
          <div data-testid="home-shape-keys"><DojoKeyGrid record={shapeRecord} limit={keyLimit} /></div>
          <p className="dojo-home-mini-legend" data-testid="home-shape-counts">
            <span data-state="fast"><i aria-hidden="true" />速く弾けた <b>{shapeCounts.fast}</b></span>
            <span data-state="slow"><i aria-hidden="true" />遅かった <b>{shapeCounts.slow}</b></span>
            {shapeCounts.self ? <span data-state="self"><i aria-hidden="true" />自分で判定 <b>{shapeCounts.self}</b></span> : null}
            <span data-state="pending"><i aria-hidden="true" />まだ <b>{shapeCounts.pending}</b></span>
          </p>
        </section>

        <section className="dojo-home-p20-mini" data-testid="home-saved">
          <div className="dojo-home-one-line">
            <h3><button type="button" className="dojo-card-primary" aria-label="自分の進行" data-focus-key="home:saved" onClick={props.onSaved}>自分の進行</button></h3>
            <span className="dojo-home-one-line-what">Vault の進行で練習</span>
            <span className="dojo-home-one-line-count"><b data-testid="home-saved-count" data-zero={progressions.length === 0 || undefined}>{progressions.length}</b> 件</span>
            <ChevronRight />
          </div>
        </section>

        <section className="dojo-home-p20-mini" data-testid="home-wanted">
          <div className="dojo-home-one-line">
            <h3><button type="button" className="dojo-card-primary" aria-label="登録した音" data-focus-key="home:voicing" onClick={props.onVoicing}>登録した音</button></h3>
            <span className="dojo-home-one-line-what">使いたい音を覚える</span>
            <span className="dojo-home-one-line-count"><b data-testid="home-wanted-count" data-zero={wanted.length === 0 || undefined}>{wanted.length}</b> 個</span>
            <ChevronRight />
          </div>
          {wanted.length ? <div className="dojo-home-p20-wanted">{wanted.slice(0, 2).map((item) => <button type="button" className="dojo-home-p20-link" key={item.task.key} data-testid="home-wanted-item" data-focus-key={`home:wanted:${item.task.key}`} data-focus-fallback="home:voicing" onClick={() => props.onWanted(item.task)}><span>{item.label}</span><small>{item.days === undefined ? "未練習" : `${item.days}日前`}</small></button>)}</div> : null}
        </section>
      </aside>
    </div>
  </div>;
}
