import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let bodyLockCount = 0;
let previousBodyOverflow = "";

interface ModalStackEntry {
  setIsTop: (isTop: boolean) => void;
}

const modalStack: ModalStackEntry[] = [];

function updateModalStack() {
  const top = modalStack[modalStack.length - 1];
  for (const entry of modalStack) {
    entry.setIsTop(entry === top);
  }
}

export interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  panelClassName?: string;
  layerClassName?: string;
}

export function Modal({
  children,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  initialFocusRef,
  closeOnBackdrop = true,
  panelClassName = "w-full max-w-lg",
  layerClassName = "z-50",
}: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isTop, setIsTop] = useState(true);

  useLayoutEffect(() => {
    const entry = { setIsTop };
    modalStack.push(entry);
    updateModalStack();

    return () => {
      const index = modalStack.indexOf(entry);
      if (index >= 0) {
        modalStack.splice(index, 1);
      }
      updateModalStack();
    };
  }, []);

  useLayoutEffect(() => {
    if (backdropRef.current) {
      backdropRef.current.inert = !isTop;
    }
  }, [isTop]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    if (bodyLockCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    bodyLockCount += 1;

    const target = initialFocusRef?.current
      ?? dialogRef.current?.querySelector<HTMLElement>("[data-autofocus], " + focusableSelector)
      ?? dialogRef.current;
    target?.focus();

    return () => {
      bodyLockCount = Math.max(0, bodyLockCount - 1);
      if (bodyLockCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [initialFocusRef]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const modal = (
    <div
      ref={backdropRef}
      className={`fixed inset-0 ${layerClassName} grid place-items-center overflow-y-auto bg-black/70 px-4 py-6`}
      data-modal-backdrop
      aria-hidden={isTop ? undefined : "true"}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={isTop ? "true" : undefined}
        aria-label={ariaLabel ?? (ariaLabelledBy ? undefined : "Dialog")}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        className={`border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] shadow-2xl ${panelClassName}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>(focusableSelector)]
    .filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}
