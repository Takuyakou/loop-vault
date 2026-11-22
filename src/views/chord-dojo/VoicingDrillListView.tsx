import { useEffect } from "react";
import { useStore } from "zustand";
import { DRILL_SETS, drillSetRevision, type CSet } from "../../domain/chordDojo/voicingDrill";
import { drillBestOfSet, drillKeyName, drillPriorRevisions, formatDrillLap } from "../../domain/chordDojo/voicingDrillProgress";
import { voicingDrillRecordsStore, type VoicingDrillRecords } from "../../domain/chordDojo/voicingDrillRecords";
import { DojoBackButton } from "./DojoBackButton";
import { HOME_BACK_LABEL } from "./dojoNav";
import { CardHeading, FnDegrees, FnLegend } from "./PracticeFrame";
import { DRILL_STAGE_LABELS } from "./voicingDrillLabels";
import "./voicingDrill.css";

/**
 * P19 ボイシングドリル: choosing a set. The four stages (① 循環コード ② ダイアトニックの進行 ③ テンションの形
 * ④ 短い転調の進行) with their sets; each set shows its name, the degrees in order, how many cards, and the fastest lap
 * of the current content (the key it was played in), or 「まだ記録はありません」.
 */
const stageSets = (stage: 1 | 2 | 3 | 4): readonly CSet[] => DRILL_SETS.filter((set) => set.stage === stage);

/** 「12.4 秒・F♯」 or 「まだ記録はありません」. */
function bestLine(set: CSet, file: VoicingDrillRecords) {
  const best = drillBestOfSet(file, set.id, drillSetRevision(set.id));
  return best ? `${formatDrillLap(best.totalMs)}・${drillKeyName(best.key)}` : "まだ記録はありません";
}

export function VoicingDrillListView({ onBack, onOpen, initialStage }: { onBack: () => void; onOpen: (setId: string) => void; /** P20: the home's stage chip opens the list at that stage. */ initialStage?: 1 | 2 | 3 | 4 }) {
  const file = useStore(voicingDrillRecordsStore, (state) => state.file);
  const ready = useStore(voicingDrillRecordsStore, (state) => state.ready);
  const error = useStore(voicingDrillRecordsStore, (state) => state.error);
  useEffect(() => { void voicingDrillRecordsStore.getState().initialize(); }, []);
  useEffect(() => {
    if (!initialStage) return undefined;
    const frame = requestAnimationFrame(() => document.querySelector(`[data-testid="drill-stage-section-${initialStage}"]`)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [initialStage]);
  return <section className="dojo" data-testid="drill-list" data-dojo-screen="voicing-drill-list">
    <div className="dojo-choose-page dojo-drill-page">
      <div className="dojo-page-head"><DojoBackButton label={HOME_BACK_LABEL} onBack={onBack} /><h1>ボイシングドリル</h1><FnLegend /></div>
      <p className="dojo-muted dojo-drill-lead">左手はルート 1 音、右手は決まった形です。形どおりに押さえると 1 枚進みます。選んだキーで 1 周の秒数を記録します。</p>
      {error ? <p className="dojo-notice" role="alert">{error}</p> : null}
      {!ready && !error ? <p className="dojo-muted" role="status">記録を読み込んでいます…</p> : null}
      {([1, 2, 3, 4] as const).map((stage) => <section className="dojo-drill-stage" key={stage} data-testid={`drill-stage-section-${stage}`}>
        <h2>{DRILL_STAGE_LABELS[stage]}</h2>
        <div className="dojo-drill-sets">
          {stageSets(stage).map((set) => {
            const revision = drillSetRevision(set.id);
            const prior = drillPriorRevisions(file, set.id, revision);
            return <article className="dojo-card dojo-drill-set dojo-card-whole" key={set.id} data-drill-set={set.id} data-stage={stage}>
              {/* P22-01 §3-2: the set's name is the primary (still 「練習する」 by its test id), widened to the whole card. */}
              <CardHeading level={3} name={set.name} focusKey={`drill:${set.id}`} testId={`drill-open-${set.id}`} onPress={() => onOpen(set.id)} />
              <p className="dojo-drill-degrees" data-testid={`drill-degrees-${set.id}`}><FnDegrees degrees={set.degrees} mode="major" /></p>
              <p className="dojo-drill-meta"><span>{set.cards.length} 枚</span><span data-testid={`drill-best-${set.id}`} data-best-ms={drillBestOfSet(file, set.id, revision)?.totalMs}>{bestLine(set, file)}</span></p>
              {prior.length ? <p className="dojo-muted dojo-drill-prior" data-testid={`drill-prior-${set.id}`}>中身が変わる前の記録: {prior.map(({ best }) => `${formatDrillLap(best.totalMs)}・${drillKeyName(best.key)}`).join(" / ")}</p> : null}
            </article>;
          })}
        </div>
      </section>)}
    </div>
  </section>;
}
