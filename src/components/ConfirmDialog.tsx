import { useId, useRef } from "react";
import { Modal } from "./Modal";
import { TriangleAlert } from "lucide-react";
import { Button } from "./ui";
import "./confirmDialog.css";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Colour of the second choice. "danger" for "leave / close without saving". */
  secondaryTone?: "default" | "danger";
  onClose?: () => void;
  tone?: "default" | "danger";
  busy?: boolean;
  /** P23-30 D5: 「変更 n」 beside the title when the window knows how many changes would be lost. */
  changeCount?: number;
  /** P23-30 D3: show the Enter badge on the primary (Enter is handled by the caller's own key handling). */
  confirmKey?: "enter";
}

/**
 * P23-30 D1-D5: one window shape — the title, the sentence, then 取り消す方 (left), the space, the
 * 消える方 and the 主の方 (right). Esc sits in the cancel button; Enter in the primary when it works.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  secondaryLabel,
  onSecondary,
  secondaryTone = "default",
  onClose = onCancel,
  tone = "default",
  busy = false,
  changeCount,
  confirmKey,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  if (!open) return null;

  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  // D4: with only 「取り消す」 and 「消える方」, the destructive one is the filled red button.
  const dangerIsPrimary = tone === "danger" && !secondaryLabel;

  return (
    <Modal
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      initialFocusRef={cancelRef}
      onClose={busy ? () => undefined : onClose}
      closeOnBackdrop={!busy}
      panelClassName="lv-confirm p-5"
      layerClassName="z-[70]"
    >
      <div className="lv-confirm-head">
        <h2 id={titleId} className="lv-confirm-title">
          {tone === "danger" ? <TriangleAlert aria-hidden="true" size={16} className="lv-confirm-warn" /> : null}
          {title}
        </h2>
        {changeCount !== undefined && changeCount > 0 ? (
          <span className="lv-confirm-count" data-testid="confirm-change-count">変更 {changeCount}</span>
        ) : null}
      </div>
      <p id={descriptionId} className="lv-confirm-desc">
        {description}
      </p>
      <div className="lv-confirm-actions">
        <Button ref={cancelRef} variant="ghost" disabled={busy} onClick={onCancel}>
          {cancelLabel}
          <kbd>Esc</kbd>
        </Button>
        <span className="lv-confirm-spacer" />
        {secondaryLabel && onSecondary ? (
          <Button variant={secondaryTone === "danger" ? "danger" : "neutral"} disabled={busy} onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        ) : null}
        <Button
          variant={dangerIsPrimary ? "danger-solid" : "primary"}
          className="font-semibold"
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
          {confirmKey === "enter" ? <kbd>Enter</kbd> : null}
        </Button>
      </div>
    </Modal>
  );
}
