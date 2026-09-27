import { useId, useRef } from "react";
import { Modal } from "./Modal";
import { TriangleAlert } from "lucide-react";
import { Button } from "./ui";

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
  secondaryLabel,
  onSecondary,
  onClose = onCancel,
  tone = "default",
  busy = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  if (!open) return null;

  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

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
        <Button ref={cancelRef} variant="neutral" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} className="font-semibold" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        {secondaryLabel && onSecondary ? (
          <Button variant="neutral" disabled={busy} onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
