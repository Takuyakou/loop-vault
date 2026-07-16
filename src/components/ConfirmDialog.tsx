import { useId, useRef } from "react";
import { Modal } from "./Modal";
import { TriangleAlert } from "lucide-react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  onClose?: () => void;
  tone?: "default" | "danger";
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  onClose = onCancel,
  tone = "default",
  busy = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  if (!open) return null;

  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const confirmClass = tone === "danger"
    ? "bg-red-500 text-white hover:bg-red-400"
    : "bg-[var(--lv-accent)] text-stone-950 hover:brightness-110";

  return (
    <Modal
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      initialFocusRef={cancelRef}
      onClose={busy ? () => undefined : onClose}
      closeOnBackdrop={!busy}
      panelClassName="w-full max-w-md p-5"
      layerClassName="z-[70]"
    >
      <h2 id={titleId} className="flex items-center gap-2 text-xl font-semibold">
        {tone === "danger" ? <TriangleAlert aria-hidden="true" size={20} /> : null}
        {title}
      </h2>
      <p id={descriptionId} className="mt-3 text-sm leading-6 text-[var(--lv-text-secondary)]">
        {description}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          ref={cancelRef}
          type="button"
          className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm disabled:opacity-50"
          disabled={busy}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`rounded px-3 py-2 text-sm font-semibold disabled:opacity-50 ${confirmClass}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
