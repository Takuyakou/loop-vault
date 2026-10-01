import { useEffect, useId, useRef, useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog";
import { Modal } from "../Modal";
import { Button } from "../ui";
import { registerCloseDialogHost, type CloseDialogRequest } from "../../store/closeBlocker";

/**
 * P10.0-07: shows the window-close confirmation and the close-save error inside the
 * app instead of the OS dialog (spec v2.5 §10.2). One per App window. The cancel
 * button (「戻る」) has the initial focus; a second close while it is open does not
 * stack a second dialog (closeGuard ignores closes in progress).
 */
export function CloseDialogHost() {
  const [pending, setPending] = useState<{ request: CloseDialogRequest; resolve: (value: boolean) => void }>();
  useEffect(() => registerCloseDialogHost((request) => new Promise<boolean>((resolve) => setPending({ request, resolve }))), []);
  if (!pending) return null;
  const finish = (value: boolean) => {
    pending.resolve(value);
    setPending(undefined);
  };
  if (pending.request.kind === "confirm") {
    const { blocker } = pending.request;
    return (
      <ConfirmDialog
        open
        title={blocker.title}
        description={blocker.message}
        confirmLabel={blocker.confirmLabel}
        cancelLabel={blocker.cancelLabel}
        tone="danger"
        onConfirm={() => finish(true)}
        onCancel={() => finish(false)}
      />
    );
  }
  return <CloseErrorNotice message={pending.request.message} onClose={() => finish(false)} />;
}

function CloseErrorNotice({ message, onClose }: { message: string; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  return (
    <Modal ariaLabelledBy={`${id}-title`} ariaDescribedBy={`${id}-description`} initialFocusRef={okRef} onClose={onClose} panelClassName="w-full max-w-md p-5" layerClassName="z-[70]">
      <h2 id={`${id}-title`} className="text-xl font-semibold">Loop Vault</h2>
      <p id={`${id}-description`} className="mt-3 text-sm leading-6 text-[var(--lv-text-secondary)]">{message}</p>
      <div className="mt-6 flex justify-end">
        <Button ref={okRef} variant="primary" onClick={onClose}>OK</Button>
      </div>
    </Modal>
  );
}
