import { useState, type ReactNode } from "react";
import type { CorrectionModel } from "../../domain/correction/correctionModel";
import { buildSaveCandidate, cardsInRange, type SaveCandidateResult, type SaveProblem, type SaveRange } from "../../domain/correction/saveCandidate";
import type { ChordTimelineItem, ProgressionBlockCandidate, SongIdea } from "../../domain/types";
import type { AppCopy } from "../../i18n";
import { SaveProgressionPopover } from "../SaveProgressionPopover";

export type SaveReady = Extract<SaveCandidateResult, { ok: true }>;

/** What the screen that mounts the workspace does with a save (CaptureView → useCaptureSave). */
export interface WorkspaceSaveActions {
  ideas: SongIdea[];
  defaultNextAction: string;
  copy: AppCopy;
  titleFor: (candidate: ProgressionBlockCandidate) => string;
  onCreate: (ready: SaveReady, title: string, nextAction: string, userVerified: boolean) => boolean;
  onAppend: (ready: SaveReady, ideaId: string, userVerified: boolean) => boolean;
  onCopyMemo: (candidate: ProgressionBlockCandidate, ideaId: string) => boolean;
  /** 「詳しい設定」: the source-bassline panel for this range, or null when the song has no bass to keep. */
  renderBassline?: (ready: SaveReady) => ReactNode;
}

export const rangeKey = (range: SaveRange) => `${range.startBar}-${range.endBar}`;
export const rangeLabel = (range: SaveRange) => range.startBar === range.endBar ? `${range.startBar}小節` : `${range.startBar}〜${range.endBar}小節`;

/** Spec v2.4 §10.1: the save form in the right panel, for the chosen range. */
export function WorkspaceSaveForm({ model, timeline, range, saved, actions, onClear, onGoToCard, onSaved }: {
  model: CorrectionModel;
  timeline: readonly ChordTimelineItem[];
  range: SaveRange;
  saved: boolean;
  actions: WorkspaceSaveActions;
  onClear: () => void;
  onGoToCard: (cardId: string) => void;
  onSaved: () => void;
}) {
  const [problems, setProblems] = useState<SaveProblem[]>();
  const cards = cardsInRange(model, range);
  // Built when needed: the form shows names; the candidate is made on save.
  const check = (): SaveReady | undefined => {
    const result = buildSaveCandidate(model, range, timeline);
    setProblems(result.ok ? undefined : result.problems);
    return result.ok ? result : undefined;
  };
  const preview = buildSaveCandidate(model, range, timeline);
  return (
    <section className="lv-cw-save" aria-label="保存" data-testid="correction-save-form">
      <div className="lv-cw-row-between">
        <h4 className="lv-cw-h4">保存する範囲</h4>
        <button type="button" className="lv-cw-btn" onClick={onClear}>範囲を外す</button>
      </div>
      <p className="lv-cw-save-range" data-testid="correction-save-range">
        {rangeLabel(range)}・{cards.length}枚{saved ? <span className="lv-cw-saved">保存済み</span> : null}
      </p>
      <p className="lv-cw-save-names">{cards.map((card) => card.name.label).join("  ")}</p>
      <p className="lv-cw-muted">保存すると、外した音は戻せなくなります</p>
      {problems?.length ? (
        <div className="lv-cw-reason" role="alert" data-testid="correction-save-problems">
          <b>保存できません</b>
          {problems.map((problem) => (
            <div key={`${problem.cardId}-${problem.text}`} className="lv-cw-row-between">
              <span>{problem.text}</span>
              {problem.cardId ? <button type="button" className="lv-cw-btn" onClick={() => onGoToCard(problem.cardId)}>このカードへ</button> : null}
            </div>
          ))}
        </div>
      ) : null}
      {preview.ok && actions.renderBassline ? (
        <details className="lv-cw-details">
          <summary>詳しい設定</summary>
          {actions.renderBassline(preview)}
        </details>
      ) : null}
      <SaveProgressionPopover
        key={rangeKey(range)}
        initialTitle={preview.ok ? actions.titleFor(preview.candidate) : rangeLabel(range)}
        ideas={actions.ideas}
        defaultNextAction={actions.defaultNextAction}
        copy={actions.copy}
        requestOpen={() => Boolean(check())}
        onCreate={(title, nextAction, userVerified) => {
          const ready = check();
          return ready ? actions.onCreate(ready, title, nextAction, userVerified) : false;
        }}
        onAppend={(ideaId, userVerified) => {
          const ready = check();
          return ready ? actions.onAppend(ready, ideaId, userVerified) : false;
        }}
        onCopyMemo={(ideaId) => {
          const ready = check();
          return ready ? actions.onCopyMemo(ready.candidate, ideaId) : false;
        }}
        onSaved={onSaved}
      />
    </section>
  );
}

/** 「おすすめの範囲」: the analysis block candidates as bar ranges with their names. */
export function RecommendedRanges({ candidates, onPick }: { candidates: readonly ProgressionBlockCandidate[]; onPick: (range: SaveRange) => void }) {
  if (!candidates.length) return null;
  return (
    <section aria-label="おすすめの範囲">
      <h4 className="lv-cw-h4">おすすめの範囲</h4>
      <div className="lv-cw-recommend" data-testid="correction-recommended">
        {candidates.slice(0, 6).map((candidate) => (
          <button key={candidate.id} type="button" className="lv-cw-recommend-item" onClick={() => onPick({ startBar: candidate.startBar, endBar: candidate.endBar })}>
            <b>{rangeLabel(candidate)}</b>
            <span>{candidate.chords.slice(0, 6).map((item) => item.chord.label).join(" ")}{candidate.chords.length > 6 ? "…" : ""}</span>
          </button>
        ))}
      </div>
      <p className="lv-cw-muted">区切りの帯を押す・カードを押してから別のカードを Shift＋クリックでも選べます。</p>
    </section>
  );
}
