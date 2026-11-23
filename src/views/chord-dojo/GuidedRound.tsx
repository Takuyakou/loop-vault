import { useEffect, useRef } from "react";
import type { BarState, DotState, RoundScore } from "./guidedRounds";
import { tipParts } from "./guidedTips";

/**
 * P23-51 (mocks ③ and ⑥): the five dots of the current round and one short bar per round, for the top bar,
 * and the pause screen after each round of five.
 */
export function RoundProgress({ dots, bars, round, rounds }: { readonly dots: readonly DotState[]; readonly bars: readonly BarState[]; readonly round: number; readonly rounds: number }) {
  const label = `区切り ${round} / ${rounds}。この区切りの ${dots.length}問のうち ${dots.filter((dot) => dot === "ok").length}問 正解`;
  return <span className="gc-round" data-testid="course-round" data-round={round} data-rounds={rounds} role="img" aria-label={label}>
    <span className="gc-round-dots">{dots.map((dot, index) => <i key={index} data-dot={dot} />)}</span>
    <span className="gc-round-bars">{bars.map((bar, index) => <i key={index} data-bar={bar} />)}</span>
  </span>;
}

/** A small keyboard drawn as a picture (not the playing keyboard): the tip's two chords side by side. */
export function MiniKeys({ notes, diff, label }: { readonly notes: readonly number[]; readonly diff: readonly number[]; readonly label: string }) {
  const low = 60;
  const high = 76;
  const whites: number[] = [];
  for (let note = low; note <= high; note += 1) if (![1, 3, 6, 8, 10].includes(note % 12)) whites.push(note);
  const width = 180;
  const height = 52;
  const step = width / whites.length;
  const fold = (note: number) => {
    let value = note;
    while (value < low) value += 12;
    while (value > high) value -= 12;
    return value;
  };
  const on = new Set(notes.map(fold));
  const changed = new Set(diff.map(fold));
  const color = (note: number) => changed.has(note) ? "#f2c14e" : "#42d8c6";
  return <svg className="gc-mini-keys" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
    {whites.map((note, index) => <rect key={note} x={index * step + 0.5} y={0.5} width={step - 1} height={height - 1} rx={3} fill={on.has(note) ? color(note) : "#d5dce5"} stroke="#0a1019" />)}
    {whites.map((note, index) => {
      const black = note + 1;
      if (black > high || [1, 3, 6, 8, 10].includes(black % 12) === false) return null;
      return <rect key={black} x={(index + 1) * step - step * 0.3} y={0.5} width={step * 0.6} height={height * 0.6} rx={2} fill={on.has(black) ? color(black) : "#1a2230"} stroke="#0a1019" />;
    })}
  </svg>;
}

export interface RoundCompare {
  readonly answerLabel: string;
  readonly answerNotes: readonly number[];
  readonly playedNotes: readonly number[];
  readonly onPlay: (notes: readonly number[]) => void;
}

/** The pause after each round of five (mock ⑥). The course's own Enter goes on; "ここでやめる" leaves, and the course resumes after this round. */
export function RoundBreak(props: {
  readonly score: RoundScore;
  /** How many questions the next round has (5, or fewer for the last round of 14). */
  readonly nextCount: number;
  readonly tip: string;
  readonly compare?: RoundCompare | undefined;
  readonly onNext: () => void;
  readonly onStop: () => void;
}) {
  const { score } = props;
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { nextRef.current?.focus({ preventScroll: true }); }, []);
  const compare = props.compare;
  const answerSet = new Set(compare?.answerNotes.map((note) => note % 12) ?? []);
  const playedSet = new Set(compare?.playedNotes.map((note) => note % 12) ?? []);
  return <section className="gc-break" data-testid="course-break" aria-labelledby="gc-break-title">
    <p className="gc-break-lead">区切り {score.round} / {score.rounds}</p>
    <h2 id="gc-break-title" data-testid="course-break-score">{score.count}問中 {score.correct}問 正解<small>ここまで {score.totalCount}問中 {score.totalCorrect}問</small></h2>
    <div className="gc-tip" data-has-compare={compare === undefined ? undefined : "true"}>
      <div>
        <h3>ひとこと</h3>
        <p data-testid="course-break-tip">{tipParts(props.tip).map((part, index) => part.key ? <b key={index} className="gc-marker">{part.text}</b> : <span key={index}>{part.text}</span>)}</p>
        {compare === undefined ? null : <div className="gc-tip-listen">
          <button type="button" className="gc-chip" data-testid="course-break-play-answer" onClick={() => compare.onPlay(compare.answerNotes)}>{compare.answerLabel}</button>
          <button type="button" className="gc-chip" data-testid="course-break-play-played" onClick={() => compare.onPlay(compare.playedNotes)}>弾いた音</button>
          <span>聴き比べる</span>
        </div>}
      </div>
      {compare === undefined ? null : <div className="gc-tip-keys">
        <div><b>{compare.answerLabel}</b><MiniKeys notes={compare.answerNotes} diff={compare.answerNotes.filter((note) => !playedSet.has(note % 12))} label={`${compare.answerLabel} の音`} /></div>
        <div><b>弾いた音</b><MiniKeys notes={compare.playedNotes} diff={compare.playedNotes.filter((note) => !answerSet.has(note % 12))} label="弾いた音" /></div>
      </div>}
    </div>
    <div className="gc-break-acts">
      <button type="button" ref={nextRef} className="dojo-primary" data-testid="course-break-next" onClick={props.onNext}>次の {props.nextCount}問へ</button>
      <button type="button" data-testid="course-break-stop" onClick={props.onStop}>ここでやめる</button>
      <span className="gc-note">やめても、次は区切り {score.round + 1} から始まります</span>
    </div>
  </section>;
}

/** P23-51 (mock ⑤): the legend over the keyboard while the marks are shown. It takes the keyboard head's place. */
export function MarksLegend({ miss }: { readonly miss: boolean }) {
  return <div className="gc-keyboard-head gc-legend" data-testid="course-marks-legend">
    <span><i data-mark="hit" />合っていた音</span>
    <span><i data-mark="wrong" />違う音</span>
    {miss ? <span><i data-mark="miss" />足りない音</span> : null}
  </div>;
}

/**
 * P23-53 (mock ⑦): the ear question shows a sound disc instead of a name. The rings spread while the chord
 * sounds; pressing the disc plays it again (the same as "もう一度聴く": the question then counts as hinted).
 */
export function EarDisc(props: { readonly root: string; readonly playing: boolean; readonly disabled: boolean; readonly onPlay: () => void; readonly testId: string }) {
  return <div className="gc-ear">
    <button type="button" className="gc-disc" data-playing={props.playing ? "true" : undefined} disabled={props.disabled} aria-label="もう一度聴く（ヒントありになります）" data-testid="course-ear-disc" onClick={props.onPlay}>
      <svg width="54" height="54" viewBox="0 0 16 16" fill="none" stroke="#42d8c6" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 6v4h2.6L8.5 13V3L5.1 6z" fill="#42d8c6" />
        <path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M12.8 3.8a6 6 0 0 1 0 8.4" />
      </svg>
    </button>
    <p className="gc-rootchip" data-testid={props.testId}>ルート（根音）は <b>{props.root}</b>（配置は自由）</p>
  </div>;
}
