import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { Status } from "../domain/types";
import { MoreHorizontal } from "lucide-react";

export interface StatusMenuAction {
  label: string;
  status: Status;
}

export function StatusActionMenu({
  actions,
  label,
  onSelect,
  triggerRef: externalTriggerRef,
}: {
  actions: StatusMenuAction[];
  label: string;
  onSelect: (status: Status) => void;
  triggerRef?: RefObject<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const internalTriggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const initialFocusIndexRef = useRef<number | null>(null);
  const menuId = useId();
  const triggerRef = externalTriggerRef ?? internalTriggerRef;

  useEffect(() => {
    if (!open) return;

    if (initialFocusIndexRef.current !== null) {
      focusItem(initialFocusIndexRef.current);
      initialFocusIndexRef.current = null;
    }

    function handleOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeMenu(false);
      }
    }

    document.addEventListener("click", handleOutsideClick, true);
    return () => document.removeEventListener("click", handleOutsideClick, true);
  }, [open]);

  function closeMenu(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }

  function focusItem(index: number) {
    const count = actions.length;
    if (count === 0) return;
    const normalizedIndex = (index + count) % count;
    setActiveIndex(normalizedIndex);
    itemRefs.current[normalizedIndex]?.focus();
  }

  function openMenu(initialFocusIndex: number) {
    const normalizedIndex = Math.max(0, Math.min(initialFocusIndex, actions.length - 1));
    initialFocusIndexRef.current = normalizedIndex;
    setActiveIndex(normalizedIndex);
    setOpen(true);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openMenu(event.key === "ArrowDown" ? 0 : actions.length - 1);
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }

    if (event.key === "Tab") {
      closeMenu(false);
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const currentIndex = itemRefs.current.findIndex((item) => item === document.activeElement);
    focusItem(currentIndex + (event.key === "ArrowDown" ? 1 : -1));
  }

  function handleContainerBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !containerRef.current?.contains(nextTarget)) {
      closeMenu(false);
    }
  }

  function selectAction(status: Status) {
    closeMenu(true);
    onSelect(status);
  }

  return (
    <div ref={containerRef} className="relative" onBlur={handleContainerBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm text-[var(--lv-text-secondary)]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) {
            closeMenu(true);
          } else {
            openMenu(0);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <MoreHorizontal aria-hidden="true" size={16} />
        {label}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute right-0 z-20 mt-2 min-w-40 border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] p-1 shadow-xl"
          onKeyDown={handleMenuKeyDown}
        >
          {actions.map((action, index) => (
            <button
              key={`${action.status}-${action.label}`}
              ref={(element) => { itemRefs.current[index] = element; }}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              className="block w-full rounded px-3 py-2 text-left text-sm text-[var(--lv-text-secondary)] hover:bg-[var(--lv-surface-raised)] focus:bg-[var(--lv-surface-raised)] focus:outline-none"
              onFocus={() => setActiveIndex(index)}
              onClick={() => selectAction(action.status)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
