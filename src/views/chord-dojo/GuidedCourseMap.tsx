import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { playbackController } from "../../audio/playbackController";
import { usePreviewSound } from "../../components/PreviewSoundProvider";
import { symbol } from "../../domain/chordDojo/recipes";
import { coursePolicy, delayIds, sameDayEarIds, sameDayNameIds, type CourseLevel } from "../../domain/chordDojo/guidedCourse/bank";
import { STATIONS, type CourseFrontier, type StationId, type StationProgress, type StationState } from "../../domain/chordDojo/guidedCourse/frontier";
import { delayEligibility, evaluateStoreLevel, latestCompleteAttempt, nextDelayAvailableAt, restartCourseLevel, weakItemIdsFor } from "../../domain/chordDojo/guidedCourse/review";
import type { CourseStore } from "../../domain/chordDojo/guidedCourse/types";
import { advancedDemoItems, advancedSetIds, LV8_GROUPS } from "../../domain/chordDojo/guidedCourse/advanced/bank";
import { advancedLevelSpec, type AdvancedCourseLevel } from "../../domain/chordDojo/guidedCourse/advanced/levels";
import { advancedPlan, evaluateAdvancedLevel, latestAdvancedAttemptId, restartAdvancedLevel, weakAdvancedItemIdsFor } from "../../domain/chordDojo/guidedCourse/advanced/review";
import type { AdvancedStore } from "../../domain/chordDojo/guidedCourse/advanced/types";
import { DojoBackButton } from "./DojoBackButton";
import { roundState } from "./guidedRounds";
import { LevelRestartDialog } from "./LevelRestartDialog";
import "./guidedMap.css";

/**
 * P23-52 (mock ①): the course map entry screen for all nine stations (Lv1–Lv8 and 総合確認).
 * Copy, glyph notes and layout match `handoff/mocks/guided-ideal-mock.html` screen ①.
 */
export interface StationMeta {
  readonly id: StationId;
  readonly group: 0 | 1 | 2;
  readonly shortLabel: string;
  readonly name: string;
  readonly glyph: readonly number[];
  readonly asks: readonly string[];
  readonly hear: readonly (readonly [string, readonly number[] | readonly (readonly number[])[]])[];
}

const GROUPS: readonly (readonly [string, string])[] = [
  ["基礎", "コードを 1 つ弾く"],
  ["つなぐ", "進行にして弾く"],
  ["広げる", "響きを増やす"],
];

export const STATION_META: readonly StationMeta[] = [
  {
    id: 1,
    group: 0,
    shortLabel: "Lv1",
    name: "メジャーとマイナー",
    glyph: [60, 64, 67],
    asks: ["コード名を見て、3 つの音を弾く", "耳で聴いて、明るい・暗いを弾き分ける", "6 つの根音で確かめる"],
    hear: [["C", [60, 64, 67]], ["Cm", [60, 63, 67]]],
  },
  {
    id: 2,
    group: 0,
    shortLabel: "Lv2",
    name: "4種類のセブンス",
    glyph: [60, 64, 67, 71],
    asks: ["maj7・7・m7・m7♭5 を、コード名から弾く", "4 つの違い(3度・5度・7度)を聴き分ける", "6 つの根音で確かめる"],
    hear: [["Cmaj7", [60, 64, 67, 71]], ["C7", [60, 64, 67, 70]], ["Cm7", [60, 63, 67, 70]], ["Cm7♭5", [60, 63, 66, 70]]],
  },
  {
    id: 3,
    group: 0,
    shortLabel: "Lv3",
    name: "12キーで引き出す",
    glyph: [61, 65, 68, 72],
    asks: ["12 の根音すべてで、6 種類のコードを弾く", "コード名を見てから 3 秒以内に押さえる"],
    hear: [["D♭maj7", [61, 65, 68, 72]], ["F♯m7", [66, 69, 73, 76]]],
  },
  {
    id: 4,
    group: 1,
    shortLabel: "Lv4",
    name: "配置を選ぶ",
    glyph: [64, 67, 72],
    asks: ["同じコードを 2 通りの配置で聴き比べる", "分数コード(C/E など)は、指定の最低音で弾く"],
    hear: [["C", [60, 64, 67]], ["C/E", [52, 60, 67]]],
  },
  {
    id: 5,
    group: 1,
    shortLabel: "Lv5",
    name: "進行を覚えてつなぐ",
    glyph: [62, 65, 69, 72],
    asks: ["2〜4 コードの進行を、聴く → 見て弾く → 見ずに弾く", "途中のコードからでも始められるようにする"],
    hear: [["ii–V–I", [[62, 65, 69, 72], [55, 62, 65, 71], [60, 64, 67, 71]]]],
  },
  {
    id: 6,
    group: 1,
    shortLabel: "Lv6",
    name: "キーを変えて使う",
    glyph: [63, 67, 70, 74],
    asks: ["Lv5 の進行を、別のキーで弾く", "進行の型とキーだけを見て弾く"],
    hear: [["ii–V–I(E♭)", [[65, 68, 72, 75], [58, 65, 68, 74], [63, 67, 70, 74]]]],
  },
  {
    id: 7,
    group: 1,
    shortLabel: "Lv7",
    name: "耳から進行を弾く",
    glyph: [],
    asks: ["2〜4 コードの進行を、耳だけで再現する", "名前・度数・見本の鍵盤は出ない"],
    hear: [["例を聴く", [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 62, 65, 71]]]],
  },
  {
    id: 8,
    group: 2,
    shortLabel: "Lv8",
    name: "響きの語彙を広げる",
    glyph: [60, 64, 67, 70, 74],
    asks: ["6・add9・sus を足して聴き比べる", "9 の響き(m9・maj9・9)を足す", "13 とルートレスを使う"],
    hear: [["Csus4", [60, 65, 67]], ["Cadd9", [60, 64, 67, 74]], ["C9", [60, 64, 67, 70, 74]], ["C13", [60, 64, 70, 74, 81]]],
  },
  {
    id: "capstone",
    group: 2,
    shortLabel: "総合",
    name: "覚えた響きを取り出す",
    glyph: [],
    asks: ["12 の根音を含むコード名 24問", "初めて見る 4 コードの進行 5問", "初見の 8 小節 3問"],
    hear: [],
  },
];

export function stationLabel(id: StationId): string {
  return id === "capstone" ? "総合確認" : `Lv${id}`;
}

export function isBasicStation(id: StationId): id is CourseLevel {
  return typeof id === "number" && id <= 3;
}

/**
 * Computes the nine stations' progress from both stores for `courseFrontier`.
 */
export function buildStationProgress(basic: CourseStore, advanced: AdvancedStore, now: Date): StationProgress[] {
  const nowIso = now.toISOString();
  return STATIONS.map((id) => {
    if (isBasicStation(id)) {
      const ev = evaluateStoreLevel(basic, id);
      const sameDayPassed = ev.sameDayPassed && ev.mode === "midi" && (ev.speed === undefined || ev.speed.ok);
      const delayEligible = sameDayPassed && ev.dates.sameDayCompletedAt !== undefined
        && delayEligibility(ev.dates.sameDayCompletedAt, nowIso).eligible;
      return { id, sameDayPassed, delayPassed: ev.passed, delayEligible };
    }
    const ev = evaluateAdvancedLevel(advanced, id);
    const sameDayPassed = ev.sameDayPassed && ev.mode === "midi";
    if (id === 8) {
      const plan = advancedPlan(advanced, 8, now);
      const delayEligible = sameDayPassed && plan.kind === "start" && plan.block === "delay";
      return { id, sameDayPassed, delayPassed: ev.passed, delayEligible };
    }
    const delayEligible = sameDayPassed && ev.dates.sameDayCompletedAt !== undefined
      && delayEligibility(ev.dates.sameDayCompletedAt, nowIso).eligible;
    return { id, sameDayPassed, delayPassed: ev.passed, delayEligible };
  });
}

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

function MiniKeyboardSvg({ notes, lo, hi, w, h }: { readonly notes: readonly number[]; readonly lo: number; readonly hi: number; readonly w: number; readonly h: number }) {
  const whites: number[] = [];
  for (let m = lo; m <= hi; m += 1) if (WHITE_PCS.has(m % 12)) whites.push(m);
  const ww = w / whites.length;
  const bh = Math.round(h * 0.62);
  const x = (m: number) => WHITE_PCS.has(m % 12) ? whites.indexOf(m) * ww + ww / 2 : whites.indexOf(m - 1) * ww + ww;
  const blacks: number[] = [];
  for (let m = lo; m <= hi; m += 1) if (!WHITE_PCS.has(m % 12)) blacks.push(m);
  const active = [...new Set(notes)].filter((n) => n >= lo && n <= hi);
  return <svg width={w} height={h + 4} viewBox={`0 0 ${w} ${h + 4}`} role="img" aria-hidden="true">
    {whites.map((m, i) => <rect key={m} x={i * ww + 0.6} y={0} width={ww - 1.2} height={h} rx={2} fill="#e3e9f0" />)}
    {blacks.map((m) => <rect key={m} x={x(m) - ww * 0.3} y={0} width={ww * 0.6} height={bh} rx={1.5} fill="#182231" />)}
    {active.map((m) => {
      const isWhite = WHITE_PCS.has(m % 12);
      const cx = x(m);
      const cy = isWhite ? h - 9 : bh - 8;
      return <circle key={m} cx={cx} cy={cy} r={3.6} fill="#42d8c6" stroke="#0a3b36" strokeWidth={1} />;
    })}
  </svg>;
}

function StationGlyph({ meta }: { readonly meta: StationMeta }) {
  if (meta.glyph.length > 0) {
    return <span className="gc-st-glyph"><MiniKeyboardSvg notes={meta.glyph} lo={60} hi={76} w={96} h={36} /></span>;
  }
  if (meta.id === "capstone") {
    return <span className="gc-st-glyph">
      <svg width="96" height="40" viewBox="0 0 96 40" aria-hidden="true">
        <g fill="none" stroke="#42d8c6" strokeWidth="2" strokeLinecap="round" opacity="0.85">
          <path d="M14 12h68M14 20h68M14 28h68" stroke="#3a4a60" />
          <circle cx="30" cy="20" r="4" fill="#42d8c6" />
          <circle cx="50" cy="12" r="4" fill="#42d8c6" />
          <circle cx="68" cy="28" r="4" fill="#42d8c6" />
        </g>
      </svg>
    </span>;
  }
  return <span className="gc-st-glyph">
    <svg width="96" height="40" viewBox="0 0 96 40" aria-hidden="true">
      <g fill="none" stroke="#42d8c6" strokeWidth="2" strokeLinecap="round" opacity="0.85">
        <path d="M38 14v12h5l7 6V8l-7 6z" fill="#42d8c6" stroke="none" />
        <path d="M56 15a7 7 0 0 1 0 10M61 10a13 13 0 0 1 0 20" />
      </g>
    </svg>
  </span>;
}

function SpeakerSvg() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 6v4h2.6L8.5 13V3L5.1 6z" />
    <path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M12.8 3.8a6 6 0 0 1 0 8.4" />
  </svg>;
}

const STATE_TAG: Record<StationState, string> = {
  done: "修了",
  due: "確認できます",
  waiting: "確認待ち",
  now: "いまここ",
  locked: "まだ",
};

function localTimeText(iso: string | undefined): string {
  if (iso === undefined) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function delayQuestionCount(id: StationId, advanced: AdvancedStore, now: Date): number {
  if (isBasicStation(id)) return delayIds(id).length;
  if (id === 8) {
    const plan = advancedPlan(advanced, 8, now);
    if (plan.kind === "start" && plan.block === "delay") return plan.itemIds.length;
    return advancedLevelSpec(8).groups?.[0]?.delay.questions ?? 10;
  }
  return advancedLevelSpec(id).delay.questions;
}

function sameDayQuestionCount(id: StationId, advanced: AdvancedStore, now: Date): number {
  if (isBasicStation(id)) {
    const p = coursePolicy(id);
    return p.questions + (p.ear?.questions ?? 0);
  }
  if (id === 8) {
    const plan = advancedPlan(advanced, 8, now);
    if (plan.kind === "start") return plan.itemIds.length;
    return advancedSetIds(8, "sameDay", LV8_GROUPS[0]!.id).length;
  }
  return advancedLevelSpec(id).sameDay.questions;
}

interface StepRow {
  readonly title: string;
  readonly rule: string;
  readonly value: string;
  readonly status: "ok" | "cur" | "";
}

function stepsFor(id: StationId, state: StationState, basic: CourseStore, advanced: AdvancedStore): readonly StepRow[] {
  if (isBasicStation(id)) {
    const p = coursePolicy(id);
    const ev = evaluateStoreLevel(basic, id);
    const active = basic.active?.level === id ? basic.active : undefined;
    const activeAnswered = active === undefined ? 0 : new Set(basic.trials.filter((t) => t.attemptId === active.attemptId && t.result !== "invalid").map((t) => t.itemId)).size;
    const nameTotal = sameDayNameIds(id).length;
    const earTotal = sameDayEarIds(id).length;
    const delayTotal = delayIds(id).length;
    const hasSameDay = latestCompleteAttempt(basic, id, "sameDay") !== undefined;
    const namePassed = hasSameDay && ev.blocks.name.independentCorrect >= p.pass && (ev.speed === undefined || ev.speed.ok);
    const nameRule = p.speed !== undefined
      ? `${p.questions}問中 ${p.pass}問・${Math.round(p.speed.ofCorrect * 100)}%を ${Math.round(p.speed.limitMs / 1000)}秒以内`
      : `${p.questions}問中 ${p.pass}問で合格`;
    const nameVal = hasSameDay
      ? `${ev.blocks.name.correct} / ${nameTotal}`
      : active?.block === "sameDay" && activeAnswered > 0 ? `${Math.min(activeAnswered, nameTotal)} / ${nameTotal}` : "—";
    const rows: StepRow[] = [{
      title: "コード名から弾く",
      rule: nameRule,
      value: nameVal,
      status: namePassed ? "ok" : state === "now" && (!hasSameDay || !namePassed) ? "cur" : "",
    }];
    if (p.ear !== undefined) {
      const earPassed = hasSameDay && (ev.blocks.ear?.independentCorrect ?? 0) >= p.ear.pass;
      const earVal = hasSameDay
        ? `${ev.blocks.ear?.correct ?? 0} / ${earTotal}`
        : active?.block === "sameDay" && activeAnswered > nameTotal ? `${activeAnswered - nameTotal} / ${earTotal}` : "—";
      rows.push({
        title: "耳で弾く",
        rule: `${p.ear.questions}問中 ${p.ear.pass}問で合格`,
        value: earVal,
        status: earPassed ? "ok" : state === "now" && namePassed && !earPassed ? "cur" : "",
      });
    }
    const delayVal = ev.passed
      ? `${ev.blocks.delay.correct} / ${delayTotal}`
      : state === "due" ? "今日できます" : "—";
    rows.push({
      title: "別の日にもう一度",
      rule: `${p.delay.questions}問中 ${p.delay.pass}問で合格`,
      value: delayVal,
      status: ev.passed ? "ok" : state === "due" ? "cur" : "",
    });
    return rows;
  }

  const spec = advancedLevelSpec(id);
  const ev = evaluateAdvancedLevel(advanced, id);
  if (id === 8 && spec.groups !== undefined) {
    return spec.groups.map((group) => {
      const entry = ev.groups?.find((g) => g.group === group.id);
      const passed = entry?.passed === true;
      const val = passed
        ? "合格"
        : entry !== undefined && entry.sameDay.evaluated > 0
          ? `${entry.sameDay.independentCorrect}/${entry.sameDay.required}`
          : "—";
      return {
        title: group.label,
        rule: `コード名 ${group.name.pass}/${group.name.questions}・耳 ${group.ear.pass}/${group.ear.questions}・別日 ${group.delay.pass}/${group.delay.questions}`,
        value: val,
        status: passed ? "ok" : state === "now" && !passed ? "cur" : "",
      };
    });
  }

  const sameLabel: Record<AdvancedCourseLevel, string> = {
    4: "配置を選んで弾く",
    5: "進行を弾く",
    6: "12キーで弾く",
    7: "耳で進行を弾く",
    8: "今日の確認",
    capstone: "コード名・進行・初見",
  };
  const sameRule = id === "capstone"
    ? spec.sameDay.parts.map((part) => `${part.pass}/${part.questions}`).join("・") + " で合格"
    : `${spec.sameDay.questions}問中 ${spec.sameDay.pass}問で合格`;
  const delayRule = id === "capstone"
    ? `コード名 ${spec.delay.parts[0]!.pass}/${spec.delay.parts[0]!.questions}・耳 ${spec.delay.parts[1]!.pass}/${spec.delay.parts[1]!.questions}`
    : `${spec.delay.questions}問中 ${spec.delay.pass}問で合格`;
  const active = advanced.attempts.find((a) => a.attemptId === advanced.active && a.level === id && !a.practice);
  const activeCount = active === undefined ? 0 : new Set(advanced.trials.filter((t) => t.attemptId === active.attemptId && t.result !== "invalid").map((t) => t.itemId)).size;
  const sameVal = ev.sameDay.attemptId !== undefined
    ? `${ev.sameDay.correct} / ${ev.sameDay.required}`
    : active?.block === "sameDay" && activeCount > 0 ? `${activeCount} / ${active.itemIds.length}` : "—";
  const delayVal = ev.passed
    ? `${ev.delay.correct} / ${ev.delay.required}`
    : state === "due" ? "今日できます" : "—";
  return [
    {
      title: sameLabel[id],
      rule: sameRule,
      value: sameVal,
      status: ev.sameDayPassed ? "ok" : state === "now" ? "cur" : "",
    },
    {
      title: "別の日にもう一度",
      rule: delayRule,
      value: delayVal,
      status: ev.passed ? "ok" : state === "due" ? "cur" : "",
    },
  ];
}

function inProgressInfo(id: StationId, basic: CourseStore, advanced: AdvancedStore): { round: number; totalRounds: number; bars: readonly ("full" | "part" | "empty")[] } | undefined {
  if (isBasicStation(id)) {
    const active = basic.active;
    if (active === undefined || active.level !== id) return undefined;
    const ids = active.block === "delay" ? delayIds(id) : sameDayNameIds(id);
    const answered = new Set(basic.trials.filter((t) => t.attemptId === active.attemptId && t.result !== "invalid").map((t) => t.itemId));
    const count = ids.filter((itemId) => answered.has(itemId)).length;
    if (count === 0) return undefined;
    const position = Math.min(count + 1, ids.length);
    const rs = roundState(position, ids.length, ids.map((itemId) => answered.has(itemId) ? true : undefined));
    return { round: rs.round, totalRounds: rs.rounds, bars: rs.bars };
  }
  const active = advanced.attempts.find((a) => a.attemptId === advanced.active && a.level === id && !a.practice);
  if (active === undefined) return undefined;
  const answered = new Set(advanced.trials.filter((t) => t.attemptId === active.attemptId && t.result !== "invalid").map((t) => t.itemId));
  const count = active.itemIds.filter((itemId) => answered.has(itemId)).length;
  if (count === 0 || count >= active.itemIds.length) return undefined;
  const rs = roundState(count + 1, active.itemIds.length, active.itemIds.map((itemId) => answered.has(itemId) ? true : undefined));
  return { round: rs.round, totalRounds: rs.rounds, bars: rs.bars };
}

function waitingAvailableAt(id: StationId, basic: CourseStore, advanced: AdvancedStore): string | undefined {
  if (isBasicStation(id)) {
    const completed = evaluateStoreLevel(basic, id).dates.sameDayCompletedAt;
    return completed === undefined ? undefined : nextDelayAvailableAt(completed);
  }
  const completed = evaluateAdvancedLevel(advanced, id).dates.sameDayCompletedAt;
  return completed === undefined ? undefined : nextDelayAvailableAt(completed);
}

/** P23-55: weak items (wrong + slow name answers) from the station's latest same-day attempt. */
function mapWeakIds(id: StationId, state: StationState, basic: CourseStore, advanced: AdvancedStore, now: Date): readonly string[] {
  if (state !== "waiting" && state !== "due") return [];
  if (isBasicStation(id)) {
    const attemptId = latestCompleteAttempt(basic, id, "sameDay")?.attemptId;
    return attemptId === undefined ? [] : weakItemIdsFor(basic, id, "sameDay", attemptId).ids;
  }
  if (id === 8) {
    const plan = advancedPlan(advanced, 8, now);
    const group = ("group" in plan ? plan.group : undefined) ?? LV8_GROUPS[0]?.id;
    if (group !== undefined) {
      const attemptId = latestAdvancedAttemptId(advanced, 8, "sameDay", group);
      if (attemptId !== undefined) {
        const ids = weakAdvancedItemIdsFor(advanced, attemptId).ids;
        if (ids.length > 0) return ids;
      }
    }
    const collected: string[] = [];
    for (const entry of LV8_GROUPS) {
      const attemptId = latestAdvancedAttemptId(advanced, 8, "sameDay", entry.id);
      if (attemptId === undefined) continue;
      for (const itemId of weakAdvancedItemIdsFor(advanced, attemptId).ids) {
        if (!collected.includes(itemId)) collected.push(itemId);
      }
    }
    return collected;
  }
  const attemptId = latestAdvancedAttemptId(advanced, id, "sameDay");
  return attemptId === undefined ? [] : weakAdvancedItemIdsFor(advanced, attemptId).ids;
}

export interface GuidedCourseMapProps {
  readonly basicStore: CourseStore;
  readonly advancedStore: AdvancedStore;
  readonly frontier: CourseFrontier;
  readonly now: Date;
  readonly demoLevels?: readonly StationId[];
  readonly onExit: () => void;
  readonly onStartOfficial: (station: StationId, block?: "sameDay" | "delay") => void;
  readonly onOpenDemo: (station: StationId) => void;
  readonly onOpenPractice: (station: StationId) => void;
  readonly onOpenWeakPractice?: (station: StationId, itemIds: readonly string[]) => void;
  readonly onRestartBasic: (next: CourseStore) => Promise<void>;
  readonly onRestartAdvanced: (next: AdvancedStore) => Promise<void>;
}

export function GuidedCourseMap(props: GuidedCourseMapProps) {
  const { basicStore, advancedStore, frontier, now } = props;
  const { sound } = usePreviewSound();
  const activeResume = useMemo<{ readonly station: StationId; readonly block: "sameDay" | "delay" } | undefined>(() => {
    if (basicStore.active !== undefined) {
      return { station: basicStore.active.level, block: basicStore.active.block };
    }
    const adv = advancedStore.attempts.find((entry) => entry.attemptId === advancedStore.active && !entry.practice);
    if (adv !== undefined) {
      return { station: adv.level, block: adv.block };
    }
    return undefined;
  }, [advancedStore.active, advancedStore.attempts, basicStore.active]);
  const initialStation: StationId = activeResume?.station ?? frontier.current ?? frontier.due ?? 1;
  const [selected, setSelected] = useState<StationId>(initialStation);
  const [hearIndex, setHearIndex] = useState(0);
  const [dueDismissed, setDueDismissed] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const [restartBusy, setRestartBusy] = useState(false);
  const [restartError, setRestartError] = useState<string | undefined>();
  const playToken = useRef(0);

  useEffect(() => () => { playToken.current += 1; playbackController.stop(); }, []);

  const meta = useMemo(() => STATION_META.find((entry) => entry.id === selected) ?? STATION_META[0]!, [selected]);
  const state: StationState = frontier.states.get(selected) ?? "locked";
  const hasDemo = useMemo(() => {
    if (props.demoLevels !== undefined) return props.demoLevels.includes(selected);
    if (isBasicStation(selected)) return selected === 1 || selected === 2;
    return advancedDemoItems(selected).length > 0;
  }, [props.demoLevels, selected]);

  const progress = useMemo(() => inProgressInfo(selected, basicStore, advancedStore), [advancedStore, basicStore, selected]);
  const steps = useMemo(() => stepsFor(selected, state, basicStore, advancedStore), [advancedStore, basicStore, selected, state]);
  const weakIds = useMemo(() => mapWeakIds(selected, state, basicStore, advancedStore, now), [advancedStore, basicStore, now, selected, state]);

  const firstPendingBefore = useMemo(() => {
    const idx = STATIONS.indexOf(selected);
    let pendingCount = 0;
    let first: StationId | undefined;
    for (let i = 0; i < idx; i += 1) {
      const id = STATIONS[i]!;
      const st = frontier.states.get(id);
      if (st === "waiting" || st === "due") {
        pendingCount += 1;
        if (first === undefined) first = id;
      }
    }
    return pendingCount >= 2 ? first : undefined;
  }, [frontier.states, selected]);

  const playHear = useCallback(async (idx: number) => {
    setHearIndex(idx);
    const entry = meta.hear[idx];
    if (entry === undefined) return;
    const token = ++playToken.current;
    playbackController.stop();
    const notesOrSeq = entry[1];
    const seq: readonly (readonly number[])[] = Array.isArray(notesOrSeq[0])
      ? (notesOrSeq as readonly (readonly number[])[])
      : [notesOrSeq as readonly number[]];
    for (const chord of seq) {
      if (token !== playToken.current) return;
      try {
        await playbackController.play(
          { kind: "practice", id: `course-map:${String(meta.id)}:${idx}` },
          { type: "chord", chord: symbol(0, "maj"), sound, explicitMidiNotes: [...chord] },
        );
      } catch {
        return;
      }
      if (seq.length > 1) await new Promise((resolve) => setTimeout(resolve, 680));
    }
  }, [meta, sound]);

  const resumeHere = activeResume !== undefined && activeResume.station === selected ? activeResume : undefined;

  const primaryAction = useMemo(() => {
    if (state === "now") {
      return {
        label: progress !== undefined ? "続きから弾く" : "始める",
        warn: false,
        onClick: () => props.onStartOfficial(selected, resumeHere?.block ?? "sameDay"),
      };
    }
    if (state === "due") {
      return {
        label: "別の日の確認を始める",
        warn: true,
        onClick: () => props.onStartOfficial(selected, "delay"),
      };
    }
    if (resumeHere !== undefined) {
      return {
        label: progress !== undefined ? "続きから弾く" : "結果を見る",
        warn: false,
        onClick: () => props.onStartOfficial(selected, resumeHere.block),
      };
    }
    return undefined;
  }, [progress, props, resumeHere, selected, state]);

  useEffect(() => {
    if (primaryAction === undefined || restartOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (document.querySelector("[role=dialog]")) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input,select,textarea,button,a,summary,[contenteditable='true']")) return;
      event.preventDefault();
      primaryAction.onClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primaryAction, restartOpen]);

  const confirmRestart = async () => {
    if (restartBusy) return;
    setRestartBusy(true);
    setRestartError(undefined);
    try {
      if (isBasicStation(selected)) {
        await props.onRestartBasic(restartCourseLevel(basicStore, selected, new Date()));
      } else {
        await props.onRestartAdvanced(restartAdvancedLevel(advancedStore, selected, new Date()));
      }
      setRestartOpen(false);
    } catch (error) {
      setRestartError(error instanceof Error ? error.message : "保存できませんでした。もう一度お試しください。");
    } finally {
      setRestartBusy(false);
    }
  };

  const activeHear = meta.hear.length > 0 ? meta.hear[Math.min(hearIndex, meta.hear.length - 1)] : undefined;
  const previewNotes: readonly number[] = activeHear === undefined
    ? []
    : Array.isArray(activeHear[1][0])
      ? (activeHear[1] as readonly (readonly number[])[])[activeHear[1].length - 1]!
      : (activeHear[1] as readonly number[]);

  const dueStation = frontier.due;
  const dueCount = dueStation === undefined ? 0 : delayQuestionCount(dueStation, advancedStore, now);
  const dueMinutes = Math.max(1, Math.ceil(dueCount * 0.3));
  const waitAt = state === "waiting" ? localTimeText(waitingAvailableAt(selected, basicStore, advancedStore)) : "";
  const freshCount = sameDayQuestionCount(selected, advancedStore, now);

  return <div className="guided-course gc-map-screen" data-testid="guided-course">
    <div className="gc-map" data-testid="course-map">
      <div className="gc-map-head">
        <DojoBackButton label="Chord Dojo" onBack={props.onExit} />
        <h2>ガイド練習</h2>
        <p>コードを、名前から・耳から・進行の中で弾けるようにする 8 つの段</p>
      </div>

      {dueStation !== undefined && !dueDismissed ? <div className="gc-due" data-testid="course-due">
        <i className="gc-due-dot" aria-hidden="true" />
        <div className="gc-due-copy">
          <b>{stationLabel(dueStation)} の「別の日にもう一度」ができます</b>
          <span>{dueCount}問、{dueMinutes}分ほど。受かると {stationLabel(dueStation)} は修了です。</span>
        </div>
        <div className="gc-due-actions">
          <button
            type="button"
            className="gc-btn gc-btn-warn"
            data-testid="course-due-start"
            onClick={() => props.onStartOfficial(dueStation, "delay")}
          >確認を始める</button>
          <button
            type="button"
            className="gc-btn gc-btn-quiet"
            data-testid="course-due-later"
            onClick={() => setDueDismissed(true)}
          >あとで</button>
        </div>
      </div> : null}

      <div className="gc-rail">
        {GROUPS.map(([gTitle, gSub], groupIndex) => <section key={gTitle} className="gc-grp">
          <header><b>{gTitle}</b><span>{gSub}</span></header>
          <div className="gc-stations">
            {STATION_META.filter((entry) => entry.group === groupIndex).map((entry) => {
              const st = frontier.states.get(entry.id) ?? "locked";
              return <button
                key={String(entry.id)}
                type="button"
                className="gc-st"
                data-testid={`course-station-${String(entry.id)}`}
                data-state={st}
                aria-pressed={entry.id === selected}
                onClick={() => { setSelected(entry.id); setHearIndex(0); }}
              >
                <span className="gc-st-lv">{entry.shortLabel}</span>
                <StationGlyph meta={entry} />
                <span className="gc-st-nm">{entry.name}</span>
                <span className="gc-tag" data-kind={st}>{STATE_TAG[st]}</span>
              </button>;
            })}
          </div>
        </section>)}
      </div>

      <div className="gc-detail">
        <section className="gc-map-panel" data-testid="course-map-detail">
          <h3><small>{meta.shortLabel}</small>{meta.name}</h3>
          <ul className="gc-asks">
            {meta.asks.map((ask) => <li key={ask}>{ask}</li>)}
          </ul>

          {meta.hear.length > 0 ? <>
            <div className="gc-hear">
              <span className="gc-hear-label">この段の響き</span>
              {meta.hear.map(([label], idx) => <button
                key={label}
                type="button"
                className="gc-hear-chip"
                aria-pressed={idx === Math.min(hearIndex, meta.hear.length - 1)}
                onClick={() => void playHear(idx)}
              >
                <SpeakerSvg />{label}
              </button>)}
            </div>
            <div className="gc-pv">
              <MiniKeyboardSvg notes={previewNotes} lo={48} hi={83} w={560} h={74} />
            </div>
          </> : null}

          <div className="gc-cta">
            {state === "now" ? <>
              <div className="gc-cta-where">
                {progress !== undefined
                  ? <>
                    <span>区切り {progress.round} / {progress.totalRounds} の途中です</span>
                    <span className="gc-cta-bars" aria-hidden="true">
                      {progress.bars.map((bar, i) => <i key={i} data-bar={bar} />)}
                    </span>
                  </>
                  : <span>{freshCount}問。途中でやめても続きから始められます</span>}
              </div>
              {hasDemo ? <button type="button" className="gc-btn gc-btn-sec" data-testid="course-map-demo" onClick={() => props.onOpenDemo(selected)}>見本を見る</button> : null}
              <button type="button" className="gc-btn gc-btn-pri gc-btn-lg" data-testid="course-map-go" onClick={() => props.onStartOfficial(selected, "sameDay")}>
                {progress !== undefined ? "続きから弾く" : "始める"} <kbd className="gc-kbd">Enter</kbd>
              </button>
            </> : state === "due" ? <>
              <div className="gc-cta-where">同じ日の確認は合格しています</div>
              {weakIds.length > 0 && props.onOpenWeakPractice !== undefined ? <button type="button" className="gc-btn gc-btn-sec" data-testid="course-map-weak" onClick={() => props.onOpenWeakPractice?.(selected, weakIds)}>迷った・間違えた問題を練習（{weakIds.length}問）</button> : null}
              <button type="button" className="gc-btn gc-btn-sec" data-testid="course-map-practice" onClick={() => props.onOpenPractice(selected)}>自由に練習する</button>
              <button type="button" className="gc-btn gc-btn-warn gc-btn-lg" data-testid="course-map-go" onClick={() => props.onStartOfficial(selected, "delay")}>別の日の確認を始める</button>
            </> : state === "waiting" ? <>
              <div className="gc-cta-where">{waitAt} から別の日の確認ができます</div>
              {weakIds.length > 0 && props.onOpenWeakPractice !== undefined ? <button type="button" className="gc-btn gc-btn-sec" data-testid="course-map-weak" onClick={() => props.onOpenWeakPractice?.(selected, weakIds)}>迷った・間違えた問題を練習（{weakIds.length}問）</button> : null}
              <button type="button" className="gc-btn gc-btn-sec" data-testid="course-map-practice" onClick={() => props.onOpenPractice(selected)}>自由に練習する</button>
              {resumeHere !== undefined ? <button type="button" className="gc-btn gc-btn-pri gc-btn-lg" data-testid="course-map-go" onClick={() => props.onStartOfficial(selected, resumeHere.block)}>{progress !== undefined ? "続きから弾く" : "結果を見る"}</button> : null}
            </> : state === "done" ? <>
              <div className="gc-cta-where">修了しました</div>
              <button type="button" className="gc-btn gc-btn-sec" data-testid="course-map-practice" onClick={() => props.onOpenPractice(selected)}>自由に練習する</button>
              <button type="button" className="gc-btn gc-btn-sec" data-testid="course-restart" onClick={() => { setRestartError(undefined); setRestartOpen(true); }}>このレベルを最初から</button>
              {resumeHere !== undefined ? <button type="button" className="gc-btn gc-btn-pri gc-btn-lg" data-testid="course-map-go" onClick={() => props.onStartOfficial(selected, resumeHere.block)}>{progress !== undefined ? "続きから弾く" : "結果を見る"}</button> : null}
            </> : <>
              <div className="gc-cta-where" data-testid="course-map-locked-reason">
                {firstPendingBefore !== undefined
                  ? `${stationLabel(firstPendingBefore)} の別の日の確認が終わると始められます`
                  : "前の段の同じ日の確認に受かると始められます"}
              </div>
              {hasDemo ? <button type="button" className="gc-btn gc-btn-sec" data-testid="course-map-demo" onClick={() => props.onOpenDemo(selected)}>見本だけ見る</button> : null}
              <button type="button" className="gc-btn gc-btn-sec" data-testid="course-map-practice" onClick={() => props.onOpenPractice(selected)}>自由に練習する</button>
              {resumeHere !== undefined ? <button type="button" className="gc-btn gc-btn-pri gc-btn-lg" data-testid="course-map-go" onClick={() => props.onStartOfficial(selected, resumeHere.block)}>{progress !== undefined ? "続きから弾く" : "結果を見る"}</button> : null}
            </>}
          </div>
        </section>

        <section className="gc-map-panel" data-testid="course-map-steps">
          <b className="gc-steps-title">修了までの道のり</b>
          <div className="gc-steps">
            {steps.map((step, i) => <div key={step.title} className="gc-step" data-step={step.status || undefined}>
              <span className="gc-step-n">{step.status === "ok" ? "✓" : i + 1}</span>
              <div className="gc-step-body">
                <b>{step.title}</b>
                <span>{step.rule}</span>
              </div>
              <div className="gc-step-val">
                {step.value}
                {step.status === "cur" && state === "now" ? <small>いまここ</small> : null}
              </div>
            </div>)}
          </div>
          <p className="gc-steps-foot">「別の日にもう一度」は、次の日以降にできます。待っている間も、次の段を始められます。</p>
        </section>
      </div>
    </div>

    {restartOpen ? createPortal(<LevelRestartDialog
      levelLabel={stationLabel(selected)}
      sentence="このレベルは合格済みです。新しい周回を最初から始めます。これまでの合格記録は残ります。"
      practice={false}
      continueLabel="キャンセル"
      confirmLabel={`${stationLabel(selected)}を最初から`}
      busy={restartBusy}
      error={restartError}
      onCancel={() => { if (!restartBusy) setRestartOpen(false); }}
      onConfirm={() => void confirmRestart()}
    />, document.body) : null}
  </div>;
}
