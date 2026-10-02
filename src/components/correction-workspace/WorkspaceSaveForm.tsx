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
  /** The new idea's id, or undefined when it was not saved. */
  onCreate: (ready: SaveReady, title: string, nextAction: string, userVerified: boolean, extra?: SaveExtra) => string | undefined;
  onAppend: (ready: SaveReady, ideaId: string, userVerified: boolean, extra?: SaveExtra) => boolean;
  onCopyMemo: (candidate: ProgressionBlockCandidate, ideaId: string) => boolean;
  /** 「詳しい設定」: the source-bassline panel for this range, or null when the song has no bass to keep. */
  renderBassline?: (ready: SaveReady) => ReactNode;
}

/** P10.2 §10.3: on the save button's title and in the save dialog, no longer a line of its own. */
const SAVE_NOTE = "保存すると、外した音は戻せなくなります";

/** P10.3 §4: what a save by section adds (the section's name in the progression's memo). */
export interface SaveExtra {
  memoNote?: string;
}

export const rangeKey = (range: SaveRange) => `${range.startBar}-${range.endBar}`;
export const rangeLabel = (range: SaveRange) => range.startBar === range.endBar ? `${range.startBar}小節` : `${range.startBar}〜${range.endBar}小節`;

/**
 * Spec v2.4 §10.1: the save form for the chosen range, pinned to the bottom of the right
 * panel (P10.2 §10.3): the range and 範囲を外す, the names, Vaultに保存 and 「おすすめの範囲」.
 */
export function WorkspaceSaveForm({ model, timeline, range, saved, actions, onGoToCard, onSaved, whole = false, menuExtras }: {
  model: CorrectionModel;
  timeline: readonly ChordTimelineItem[];
  range: SaveRange;
  saved: boolean;
  actions: WorkspaceSaveActions;
  onGoToCard: (cardId: string) => void;
  onSaved: () => void;
  /** P10.2 addendum 2 §1: no range chosen — the whole song is saved (「曲全体を保存」). */
  whole?: boolean;
  /** P10.2 addendum 2 §2.1: more ▾ items (区切りごとに保存…). */
  menuExtras?: readonly { label: ReactNode; onSelect: () => void; testId?: string }[];
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
    <section className="lv-cw-save" aria-label="保存" data-testid="correction-save-form" data-whole={whole || undefined}>
      <div className="lv-cw-row-between">
        <h4 className="lv-cw-h4">
          保存する範囲{" "}
          <span className="lv-cw-save-range" data-testid="correction-save-range">
            {whole ? `曲全体（${rangeLabel(range)}）` : `${rangeLabel(range)}・${cards.length}枚`}{saved ? <span className="lv-cw-saved">保存済み</span> : null}
          </span>
        </h4>
        {/* P10.3 §3: 範囲を外す is the × on the range chip in the control bar. */}
      </div>
      {whole ? null : <p className="lv-cw-save-names" title={cards.map((card) => card.name.label).join("  ")}>{cards.map((card) => card.name.label).join("  ")}</p>}
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
      <div className="lv-cw-save-actions">
      <span title={SAVE_NOTE}>
      <SaveProgressionPopover
        key={rangeKey(range)}
        initialTitle={preview.ok ? actions.titleFor(preview.candidate) : rangeLabel(range)}
        ideas={actions.ideas}
        defaultNextAction={actions.defaultNextAction}
        copy={actions.copy}
        requestOpen={() => Boolean(check())}
        onCreate={(title, nextAction, userVerified) => {
          const ready = check();
          return ready ? Boolean(actions.onCreate(ready, title, nextAction, userVerified)) : false;
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
        note={SAVE_NOTE}
        {...(whole ? { primaryLabel: "曲全体を保存" } : {})}
        menuIncludesNew
        {...(menuExtras?.length ? { menuExtras, requestMenu: () => true } : {})}
      />
      </span>
      </div>
    </section>
  );
}

/** P10.1 §8 / P10.2 §10.3: the save panel when there is nothing to save (no cards at all). */
export function NoSaveRange() {
  return (
    <section className="lv-cw-save" aria-label="保存" data-testid="correction-save-form" data-empty>
      <div className="lv-cw-row-between">
        <h4 className="lv-cw-h4">保存する範囲</h4>
      </div>
      <p className="lv-cw-muted" data-testid="correction-save-range">保存できるカードがありません。</p>
      <div className="lv-cw-save-actions">
        <button type="button" className="lv-cw-btn" data-kind="primary" disabled title="範囲を選んでいません">Vaultに保存</button>
      </div>
    </section>
  );
}

/**
 * Open or closed, remembered on this device. P10.2 addendum 1 §2: closed at first, so the
 * key moved to v2 (the P10.1 key, which opened at first, is not read).
 */
const RECOMMENDED_OPEN_KEY = "loop-vault:p10-recommended-ranges-open:v2";

function readRecommendedOpen(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(RECOMMENDED_OPEN_KEY) === "open";
  } catch {
    return false;
  }
}

function writeRecommendedOpen(open: boolean) {
  try {
    localStorage.setItem(RECOMMENDED_OPEN_KEY, open ? "open" : "closed");
  } catch {
    // Device-local only; without storage it simply starts closed next time.
  }
}

export function useRecommendedOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(readRecommendedOpen);
  return [open, () => { setOpen(!open); writeRecommendedOpen(!open); }];
}

export const RECOMMENDED_SHOWN = 6;

/**
 * 「おすすめの範囲」 at the top of the right panel (P10.2 addendum 1 §2): the whole heading
 * row opens and closes it (▸／▾ on its left); the list opens right under it. The range being
 * saved is framed (aria-current); saved ones say so.
 */
export function RecommendedRanges({ candidates, open, onToggle, current, saved, onPick }: {
  candidates: readonly ProgressionBlockCandidate[];
  open: boolean;
  onToggle: () => void;
  current?: SaveRange;
  saved: ReadonlySet<string>;
  onPick: (range: SaveRange) => void;
}) {
  if (!candidates.length) return null;
  const shown = candidates.slice(0, RECOMMENDED_SHOWN);
  return (
    <section aria-label="おすすめの範囲" className="lv-cw-reco" data-open={open || undefined}>
      <button type="button" className="lv-cw-reco-head" aria-expanded={open} data-testid="correction-recommended-toggle" onClick={onToggle}>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> おすすめの範囲（{shown.length}）
      </button>
      {open ? (
        <div className="lv-cw-recommend" data-testid="correction-recommended">
          {shown.map((candidate) => {
            const range = { startBar: candidate.startBar, endBar: candidate.endBar };
            return (
              <button key={candidate.id} type="button" className="lv-cw-recommend-item" aria-current={(current && rangeKey(current) === rangeKey(range)) || undefined} onClick={() => onPick(range)}>
                <b>{rangeLabel(candidate)}</b>
                <span className="lv-cw-reco-names">{candidate.chords.slice(0, 6).map((item) => item.chord.label).join(" ")}{candidate.chords.length > 6 ? "…" : ""}</span>
                {saved.has(rangeKey(range)) ? <span className="lv-cw-saved">保存済み</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
