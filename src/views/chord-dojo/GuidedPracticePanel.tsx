import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayingMark } from "../../components/ui";
import { playbackController } from "../../audio/playbackController";
import type { PreviewSound } from "../../audio/chordPreview";
import { symbol } from "../../domain/chordDojo/recipes";
import { NOTE_NAMES } from "../../domain/chordDojo/guidedCourse/advanced/build";
import { advancedLevelSpec, FAMILY_LABEL, type AdvancedCourseLevel } from "../../domain/chordDojo/guidedCourse/advanced/levels";
import { LV8_GROUPS } from "../../domain/chordDojo/guidedCourse/advanced/bank";
import { LV6_PRACTICE_FAMILIES, LV12_KEYS, lv6PracticeItemId, practiceMaterials, type PracticeMaterial } from "../../domain/chordDojo/guidedCourse/advanced/practice";
import { familyChords } from "../../domain/chordDojo/guidedCourse/advanced/build";
import type { ProgressionFamily } from "../../domain/chordDojo/guidedCourse/advanced/levels";
import { CourseKeyboard } from "./CourseKeyboard";

/**
 * P23-46 guided practice panel: pick one short material, listen with the card and keyboard moving
 * together, then play it yourself. It never starts a long set; the official confirmation is a separate
 * explicit action.
 */
export interface GuidedPracticePanelProps {
  readonly level: AdvancedCourseLevel;
  readonly group?: string | undefined;
  readonly onGroupChange: (group: string) => void;
  readonly mode: "official" | "practice";
  readonly sound: PreviewSound;
  readonly connected: boolean;
  readonly paused?: boolean;
  readonly playbackGapMs?: number;
  readonly official?: { readonly count: number; readonly blockLabel: string; readonly onStart: () => void } | undefined;
  readonly onPractice: (material: PracticeMaterial) => void;
  readonly onReturnOfficial?: (() => void) | undefined;
  readonly onGoPractice?: (() => void) | undefined;
  readonly basicsPassed: boolean;
}

const LEVEL_PRACTICE_HINT: Readonly<Record<string, string>> = {
  "4": "分数コードの最低音と、つなぎで残す音・動かす音を確かめます。",
  "5": "1つの進行を聴いて、カードと鍵盤を追いながら自分で弾きます。",
  "6": "型を選んでキーを変え、同じ進行を別のキーで弾きます。",
  "7": "2コードの機能とベースの線から始め、同じ終止の3〜4コードへ伸ばします。",
  "8": "元の和音と特徴音を足した和音を聴き比べ、進行の中で使います。",
  capstone: "コード名・進行・初見の譜面の順に、覚えた響きを取り出します。",
};

function chordName(pitchClass: number): string {
  return NOTE_NAMES[((pitchClass % 12) + 12) % 12]!;
}

function DemoPlayer(props: {
  readonly material: PracticeMaterial;
  readonly sound: PreviewSound;
  readonly connected: boolean;
  readonly paused?: boolean;
  readonly playbackGapMs?: number;
  readonly onPractice: (material: PracticeMaterial) => void;
}) {
  const { material, sound } = props;
  const all = useMemo(() => [...(material.cadence ?? []), ...material.chords], [material]);
  const [index, setIndex] = useState(-1);
  const [phase, setPhase] = useState<"idle" | "cadence" | "chords" | "playing">("idle");
  const [playing, setPlaying] = useState(false);
  const [tempoBpm, setTempoBpm] = useState(90);
  const [tempoBeat, setTempoBeat] = useState(0);
  const token = useRef(0);
  const gapMs = props.playbackGapMs ?? 900;

  useEffect(() => () => { token.current += 1; playbackController.stop(); }, []);
  useEffect(() => { setIndex(-1); setPhase("idle"); token.current += 1; playbackController.stop(); }, [material.id]);
  // P23-47: the restart confirmation stops the demo; cancelling leaves it ready to replay.
  useEffect(() => {
    if (props.paused !== true) return;
    token.current += 1;
    playbackController.stop();
    setPlaying(false);
    setPhase("idle");
  }, [props.paused]);

  const run = useCallback(async (fromChord: number, withCadence: boolean) => {
    token.current += 1;
    const my = token.current;
    const cadenceLength = withCadence ? material.cadence?.length ?? 0 : 0;
    const sequence = withCadence ? all : material.chords;
    const start = withCadence ? 0 : fromChord;
    setPlaying(true);
    for (let position = start; position < sequence.length; position += 1) {
      if (token.current !== my) return;
      const chord = sequence[position]!;
      const inCadence = position < cadenceLength;
      setPhase(inCadence ? "cadence" : "chords");
      setIndex(inCadence ? -1 : position - cadenceLength);
      try {
        await playbackController.play(
          { kind: "practice", id: `advanced:practice:${material.id}` },
          { type: "chord", chord: symbol(chord.root, chord.quality), sound, explicitMidiNotes: chord.referenceNotes },
        );
      } catch {
        // A missing audio device must not stop the visual walkthrough.
      }
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
    if (token.current !== my) return;
    setPlaying(false);
    setPhase("playing");
  }, [all, gapMs, material, sound]);

  const stop = useCallback(() => {
    token.current += 1;
    playbackController.stop();
    setPlaying(false);
    setPhase("idle");
    setTempoBeat(0);
  }, []);

  /** Guided tempo pass: four beats per chord at the chosen BPM, played along by the learner. */
  const tempoPass = useCallback(async () => {
    token.current += 1;
    const my = token.current;
    const beatMs = 60_000 / tempoBpm;
    setPlaying(true);
    setPhase("chords");
    for (let position = 0; position < material.chords.length; position += 1) {
      if (token.current !== my) return;
      setIndex(position);
      const chord = material.chords[position]!;
      try {
        await playbackController.play(
          { kind: "practice", id: `advanced:practice:tempo:${material.id}` },
          { type: "chord", chord: symbol(chord.root, chord.quality), sound, explicitMidiNotes: chord.referenceNotes },
        );
      } catch {
        // Keep the visual tempo pass even without an audio device.
      }
      for (let beat = 0; beat < 4; beat += 1) {
        if (token.current !== my) return;
        setTempoBeat(beat + 1);
        await new Promise((resolve) => setTimeout(resolve, beatMs));
      }
    }
    if (token.current !== my) return;
    setPlaying(false);
    setPhase("idle");
    setTempoBeat(0);
  }, [material, sound, tempoBpm]);

  const current = index >= 0 ? material.chords[index] : phase === "cadence" ? material.cadence?.[0] : undefined;
  const guideNotes = current?.referenceNotes ?? [];

  return <div className="gc-card ac-practice-demo" data-testid="advanced-practice-demo">
    <section className="gc-card-top">
      <p className="gc-chord" data-testid="advanced-practice-title">{material.label}</p>
      <p className="ac-note" data-testid="advanced-practice-detail">{material.detail}</p>
      <p className="gc-instruction" data-testid="advanced-practice-phase">
        {phase === "cadence" ? "基準のカデンツ" : phase === "chords" ? "進行（本題）" : playing ? "再生中" : "見本を聴いて、鍵盤とカードを追いましょう"}
        {playing && tempoBeat > 0 ? ` ・ ${tempoBeat} / 4 拍` : ""}
      </p>
      <ol className="ac-cards" data-testid="advanced-practice-cards">
        {(material.cadence ?? []).length > 0 ? <li className="ac-card" data-testid="advanced-practice-cadence"><b>カデンツ</b><span>{material.cadence!.length}コード</span></li> : null}
        {material.chords.map((chord, position) => <li
          key={`${chord.label}-${position}`}
          className="ac-card"
          data-current={position === index}
          data-testid={`advanced-practice-card-${position}`}
        >
          <button type="button" className="ac-card-button" onClick={() => void run(position, false)} aria-label={`${position + 1}枚目 ${chord.label} から聴く`}>
            <b>{chord.label}</b>
            <span>{position === index ? "いま" : `${position + 1}`}</span>
          </button>
        </li>)}
      </ol>
      {material.commonPitchClasses !== undefined && material.commonPitchClasses.length > 0
        ? <p className="ac-note" data-testid="advanced-practice-common">残す音: {material.commonPitchClasses.map(chordName).join("・")}</p>
        : null}
      {material.movedLabel === undefined ? null : <p className="ac-note" data-testid="advanced-practice-moved">動かす音: {material.movedLabel}</p>}
      {material.bassMotion !== undefined
        ? <p className="ac-note" data-testid="advanced-practice-bass">最低音: {chordName(material.bassMotion[0])} → {chordName(material.bassMotion[1])}</p>
        : null}
    </section>
    <div className="gc-card-mid gc-keyboard">
      <div className="gc-keyboard-head"><b>鍵盤</b><span>{index >= 0 ? `${index + 1}枚目` : "見本の音名"}</span></div>
      <CourseKeyboard guideNotes={guideNotes} showNames />
    </div>
    <div className="gc-card-bottom">
      <div className="gc-listen-row">
        <button type="button" className="dojo-primary" data-testid="advanced-practice-play" data-playing={playing ? "true" : undefined} disabled={playing} onClick={() => void run(0, true)}>{playing ? <><PlayingMark />再生中</> : "はじめから聴く"}</button>
        <button type="button" data-testid="advanced-practice-stop" disabled={!playing} onClick={stop}>止める</button>
        <button type="button" data-testid="advanced-practice-replay" disabled={playing} onClick={() => void run(0, false)}>進行だけもう一度</button>
      </div>
      <div className="gc-listen-row">
        <label className="ac-tempo">
          <span>テンポ</span>
          <select data-testid="advanced-practice-tempo" value={tempoBpm} disabled={playing} onChange={(event) => setTempoBpm(Number(event.currentTarget.value))}>
            {[60, 80, 90, 100, 120].map((choice) => <option key={choice} value={choice}>{choice} BPM</option>)}
          </select>
        </label>
        <button type="button" data-testid="advanced-practice-tempo-run" disabled={playing} onClick={() => void tempoPass()}>テンポで通す</button>
      </div>
      <div className="gc-actions">
        <button type="button" className="dojo-primary" data-testid="advanced-practice-run" onClick={() => props.onPractice(material)}>自分で弾く</button>
      </div>
    </div>
  </div>;
}

export function GuidedPracticePanel(props: GuidedPracticePanelProps) {
  const spec = advancedLevelSpec(props.level);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [lv6Family, setLv6Family] = useState<ProgressionFamily>(LV6_PRACTICE_FAMILIES[0]!);
  const [lv6Key, setLv6Key] = useState<number>(0);

  const materials = useMemo(() => {
    if (props.level === 6) {
      return LV6_PRACTICE_FAMILIES.map((family) => ({
        id: `lv6-prac-${family}`,
        level: 6 as const,
        kind: "progression" as const,
        label: FAMILY_LABEL[family],
        detail: "キーを選んで同じ型を弾く",
        chords: familyChords(family, lv6Key),
        itemIds: [lv6PracticeItemId(family, lv6Key)],
        family,
        keyRoot: lv6Key,
      }));
    }
    return practiceMaterials(props.level, props.group);
  }, [lv6Key, props.group, props.level]);

  const selected = materials.find((material) => material.id === selectedId) ?? materials[0];
  useEffect(() => {
    if (selectedId === undefined && selected !== undefined) setSelectedId(selected.id);
  }, [selected, selectedId]);
  useEffect(() => {
    if (props.level === 6) setSelectedId(`lv6-prac-${lv6Family}`);
  }, [lv6Family, props.level]);

  const practiceLabel = selected?.label ?? spec.label;
  void practiceLabel;
  return <div className="ac-practice-panel" data-testid="advanced-practice-panel">
    <p className="gc-panel-kicker">{props.mode === "practice" ? "自由練習" : "今日の確認"}</p>
    <h2>{props.mode === "practice" ? `${spec.label} を練習する` : `${spec.label} ${spec.ability}`}</h2>
    <p data-testid="advanced-practice-asks">{spec.asks.join(" / ")}。{LEVEL_PRACTICE_HINT[String(props.level)]}</p>
    {props.basicsPassed ? <p className="gc-panel-ok" data-testid="advanced-basics-done">基礎コース Lv1〜3 は修了しています。</p> : <p className="gc-panel-warn" data-testid="advanced-basics-note">基礎コース Lv1〜3 を終えると、Lv4 以降の正式な確認を始められます。いまは自由練習です。</p>}

    {props.level === 8 ? <div className="ac-group-row" data-testid="advanced-practice-groups">
      {LV8_GROUPS.map((group) => <button
        key={group.id}
        type="button"
        data-testid={`advanced-group-${group.id}`}
        aria-pressed={props.group === group.id}
        onClick={() => { props.onGroupChange(group.id); setSelectedId(undefined); }}
      >{group.label}</button>)}
    </div> : null}

    {props.level === 6 ? <label className="ac-tempo">
      <span>キー</span>
      <select data-testid="advanced-practice-lv6-key" value={lv6Key} onChange={(event) => setLv6Key(Number(event.currentTarget.value))}>
        {LV12_KEYS.map((key) => <option key={key} value={key}>{NOTE_NAMES[key]}</option>)}
      </select>
    </label> : null}

    <div className="ac-practice-materials" data-testid="advanced-practice-materials">
      {materials.map((material) => <button
        key={material.id}
        type="button"
        aria-pressed={selected?.id === material.id}
        data-testid={`advanced-material-${material.id}`}
        onClick={() => { setSelectedId(material.id); if (material.family !== undefined && props.level === 6) setLv6Family(material.family); }}
      >{material.label}</button>)}
    </div>

    {selected !== undefined && selected.chords.length > 0
      ? <DemoPlayer key={`${selected.id}:${lv6Key}`} material={selected} sound={props.sound} connected={props.connected} paused={props.paused} playbackGapMs={props.playbackGapMs} onPractice={props.onPractice} />
      : selected !== undefined
        // P23-55: a material that is a set of questions (the two-chord functions, ten capstone names) has no
        // single example to play; it starts straight away.
        ? <div className="gc-card ac-practice-demo" data-testid="advanced-practice-demo">
          <section className="gc-card-top">
            <p className="gc-chord" data-testid="advanced-practice-title">{selected.label}</p>
            <p className="ac-note" data-testid="advanced-practice-detail">{selected.detail}</p>
          </section>
          <div className="gc-card-bottom">
            <div className="gc-actions">
              <button type="button" className="dojo-primary" data-testid="advanced-practice-run" onClick={() => props.onPractice(selected)}>自分で弾く（{selected.itemIds.length}問）</button>
            </div>
          </div>
        </div>
        : null}

    <div className="gc-panel-actions">
      {props.official === undefined ? null : <button type="button" className="dojo-primary" data-testid="advanced-start" disabled={props.official.count === 0} onClick={props.official.onStart}>
        {props.official.blockLabel}を始める（{props.official.count} 問）
      </button>}
      {props.mode === "practice" && props.official === undefined ? <button type="button" data-testid="advanced-start" onClick={() => props.onPractice(selected ?? materials[0]!)}>練習を始める</button> : null}
      {props.onReturnOfficial === undefined ? null : <button type="button" data-testid="advanced-return-official" onClick={props.onReturnOfficial}>確認に戻る</button>}
      {props.mode === "official" && props.onGoPractice !== undefined ? <button type="button" data-testid="advanced-practice-here" onClick={props.onGoPractice}>自由練習へ</button> : null}
      <span className="gc-note" data-testid="advanced-practice-count">この練習は1つの教材だけを繰り返します。公式の確認は別の操作で始まります。</span>
    </div>
  </div>;
}
