import { useEffect, type ReactNode } from "react";
import "./guidedMap.css";

/**
 * P23-52 (mock ⑧): the unified result screen for basic and advanced course block results.
 * Renders the 44px verdict line, optional per-quality / per-part bars, the three roadmap boxes,
 * and the action row (primary with Enter shortcut, optional secondary practice, and "今日はここまで").
 */
export interface ResultBar {
  readonly id: string;
  readonly label: string;
  readonly correct: number;
  readonly total: number;
  readonly low: boolean;
}

export interface ResultBox {
  readonly tag: string;
  readonly tagKind: "done" | "now" | "wait" | "todo";
  readonly title: string;
  readonly sub: string;
  readonly current?: boolean;
}

export interface ResultAction {
  readonly label: string;
  readonly testId: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly warn?: boolean;
}

export interface GuidedResultSheetProps {
  readonly testId: "course-result" | "advanced-result";
  readonly ok: boolean;
  readonly formal?: boolean;
  readonly lead: string;
  readonly total: number;
  readonly correct: number;
  readonly passLine: number;
  readonly bars: readonly ResultBar[];
  readonly slowCount?: number;
  readonly wideBarLabels?: boolean;
  readonly boxes: readonly [ResultBox, ResultBox, ResultBox];
  readonly notes?: ReactNode;
  readonly primary?: ResultAction | undefined;
  readonly secondary?: ResultAction | undefined;
  readonly tertiary: ResultAction;
  readonly disabled?: boolean;
}

export function GuidedResultSheet(props: GuidedResultSheetProps) {
  const primary = props.primary;
  useEffect(() => {
    if (primary === undefined || primary.disabled === true || props.disabled === true) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (document.querySelector("[role=dialog]")) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input,select,textarea,button,a,summary,[contenteditable='true']")) return;
      event.preventDefault();
      primary.onClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primary, props.disabled]);

  return <section
    className="gc-sheet"
    data-testid={props.testId}
    data-ok={props.ok}
    {...(props.formal === undefined ? {} : { "data-formal": props.formal })}
  >
    <div className="gc-sheet-inner">
      <p className="gc-sheet-lead">{props.lead}</p>
      <h2>
        {props.ok ? `${props.total}問中 ${props.correct}問で合格` : `${props.total}問中 ${props.correct}問`}
        <small>合格の線は {props.passLine}問</small>
      </h2>

      {props.bars.length > 0 ? <div className="gc-qbars" data-testid={`${props.testId}-bars`}>
        {props.bars.map((bar) => {
          const pct = bar.total > 0 ? Math.min(100, Math.round((bar.correct / bar.total) * 100)) : 0;
          return <div
            key={bar.id}
            className="gc-qb"
            data-low={bar.low ? "true" : undefined}
            data-wide-label={props.wideBarLabels === true ? "true" : undefined}
          >
            <b>{bar.label}</b>
            <span className="gc-qb-tr"><i style={{ width: `${pct}%` }} /></span>
            <span>{bar.correct} / {bar.total}</span>
          </div>;
        })}
      </div> : null}

      {(props.slowCount ?? 0) > 0 ? <p className="gc-result-slow" data-testid={`${props.testId}-slow`}>
        正解でも 2.5 秒より長くかかった問題が {props.slowCount} 問あります（合格には数えます）
      </p> : null}

      <div className="gc-nexts" data-testid={`${props.testId}-boxes`}>
        {props.boxes.map((box, index) => <div key={index} className="gc-nx" data-cur={box.current === true ? "true" : undefined}>
          <span className="gc-tag" data-kind={box.tagKind}>{box.tag}</span>
          <b>{box.title}</b>
          <span>{box.sub}</span>
        </div>)}
      </div>

      {props.notes ? <div className="gc-sheet-notes">{props.notes}</div> : null}

      <div className="gc-acts">
        {primary === undefined ? null : <button
          type="button"
          className={`gc-btn gc-btn-lg ${primary.warn === true ? "gc-btn-warn" : "gc-btn-pri"}`}
          data-testid={primary.testId}
          disabled={primary.disabled === true || props.disabled === true}
          onClick={primary.onClick}
        >
          {primary.label} <kbd className="gc-kbd">Enter</kbd>
        </button>}
        {props.secondary === undefined ? null : <button
          type="button"
          className="gc-btn gc-btn-sec"
          data-testid={props.secondary.testId}
          disabled={props.secondary.disabled === true || props.disabled === true}
          onClick={props.secondary.onClick}
        >
          {props.secondary.label}
        </button>}
        <button
          type="button"
          className="gc-btn gc-btn-quiet"
          data-testid={props.tertiary.testId}
          disabled={props.tertiary.disabled === true || props.disabled === true}
          onClick={props.tertiary.onClick}
        >
          {props.tertiary.label}
        </button>
      </div>
    </div>
  </section>;
}
