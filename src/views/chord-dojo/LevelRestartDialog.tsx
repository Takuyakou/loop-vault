import { useEffect, useRef } from "react";
import "./guidedCourse.css";

/**
 * P23-47-fix-1: confirmation for "restart this level from the beginning". The dialog is portaled to
 * document.body, outside `.dojo`, so it carries its own opaque palette and button styles (see
 * guidedCourse.css). The first click changes nothing; the safe "continue" action is focused first,
 * and only an explicit click or Enter on the filled restart button confirms.
 */
export interface LevelRestartDialogProps {
  readonly levelLabel: string;
  readonly sentence: string;
  readonly practice: boolean;
  /** "5問目から続ける" while the question position is known, otherwise "キャンセル". */
  readonly continueLabel: string;
  /** "Lv1を最初から" or the practice-scoped wording. */
  readonly confirmLabel: string;
  readonly busy: boolean;
  readonly error?: string | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function LevelRestartDialog(props: LevelRestartDialogProps) {
  const continueRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const title = props.practice
    ? `${props.levelLabel}の自由練習を最初からやり直しますか？`
    : `${props.levelLabel}を最初からやり直しますか？`;

  useEffect(() => {
    continueRef.current?.focus({ preventScroll: true });
  }, []);

  // Keep the page behind the confirmation from scrolling while it is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !props.busy) {
        event.preventDefault();
        props.onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = [continueRef.current, confirmRef.current].filter((element): element is HTMLButtonElement => element !== null && !element.disabled);
      if (focusables.length === 0) return;
      const current = document.activeElement;
      const index = focusables.indexOf(current as HTMLButtonElement);
      const next = event.shiftKey ? (index <= 0 ? focusables.length - 1 : index - 1) : (index + 1) % focusables.length;
      event.preventDefault();
      focusables[next]!.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props]);

  return <div className="gc-dialog-backdrop" data-testid="level-restart-dialog">
    <div className="gc-dialog" role="dialog" aria-modal="true" aria-labelledby="level-restart-title" aria-describedby="level-restart-body">
      <h2 id="level-restart-title" data-testid="level-restart-title">{title}</h2>
      <p id="level-restart-body" data-testid="level-restart-body">{props.sentence}</p>
      {props.error === undefined ? null : <p className="gc-dialog-error" role="alert" data-testid="level-restart-error">{props.error}</p>}
      <div className="gc-dialog-actions">
        <button type="button" ref={continueRef} data-variant="continue" data-testid="level-restart-cancel" disabled={props.busy} onClick={props.onCancel}>{props.continueLabel}</button>
        <button type="button" ref={confirmRef} data-variant="restart" data-testid="level-restart-confirm" disabled={props.busy} onClick={props.onConfirm}>
          {props.busy ? "保存しています" : props.confirmLabel}
        </button>
      </div>
    </div>
  </div>;
}
