import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SongIdea } from "../domain/types";
import type { AppCopy } from "../i18n";
import { ChevronDown, Save } from "lucide-react";
import { Button } from "./ui";

type SavePanel = "new" | "append" | "memo";

interface SaveProgressionPopoverProps {
  initialTitle: string;
  ideas: SongIdea[];
  defaultNextAction: string;
  copy: AppCopy;
  requestOpen?: () => boolean;
  onCreate: (title: string, nextAction: string, userVerified: boolean) => boolean;
  onAppend: (ideaId: string, userVerified: boolean) => boolean;
  onCopyMemo: (ideaId: string) => boolean;
  onSaved: () => void;
}

const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";

export function SaveProgressionPopover({
  initialTitle,
  ideas,
  defaultNextAction,
  copy,
  requestOpen,
  onCreate,
  onAppend,
  onCopyMemo,
  onSaved,
}: SaveProgressionPopoverProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<SavePanel>();
  const [title, setTitle] = useState(initialTitle);
  const [nextAction, setNextAction] = useState(defaultNextAction);
  const [ideaId, setIdeaId] = useState("");
  const [userVerified, setUserVerified] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const ideaSelectRef = useRef<HTMLSelectElement>(null);
  const restoreFocusRef = useRef<HTMLButtonElement>();
  const componentId = useId();
  const menuId = `${componentId}-menu`;
  const panelId = `${componentId}-panel`;
  const panelTitleId = `${componentId}-panel-title`;

  const isOpen = menuOpen || Boolean(panel);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        close(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (menuOpen) {
      rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    } else if (panel === "new") {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    } else if (panel) {
      ideaSelectRef.current?.focus();
    }
  }, [menuOpen, panel]);

  function close(restoreFocus: boolean) {
    setMenuOpen(false);
    setPanel(undefined);
    if (restoreFocus) {
      restoreFocusRef.current?.focus();
    }
  }

  function openNew() {
    if (requestOpen && !requestOpen()) return;
    restoreFocusRef.current = primaryButtonRef.current ?? undefined;
    setTitle(initialTitle);
    setNextAction(defaultNextAction);
    setIdeaId("");
    setUserVerified(false);
    setMenuOpen(false);
    setPanel("new");
  }

  function toggleMenu() {
    if (!menuOpen && requestOpen && !requestOpen()) return;
    restoreFocusRef.current = menuButtonRef.current ?? undefined;
    setPanel(undefined);
    setMenuOpen((open) => !open);
  }

  function openDestination(nextPanel: Exclude<SavePanel, "new">) {
    setMenuOpen(false);
    setIdeaId("");
    setUserVerified(false);
    setPanel(nextPanel);
  }

  function save() {
    let saved = false;
    if (panel === "new" && title.trim()) {
      saved = onCreate(title.trim(), nextAction.trim(), userVerified);
    } else if (panel === "append" && ideaId) {
      saved = onAppend(ideaId, userVerified);
    } else if (panel === "memo" && ideaId) {
      saved = onCopyMemo(ideaId);
    }

    if (saved) {
      onSaved();
      close(true);
    }
  }

  function handleFormKeyDown(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      event.preventDefault();
      return;
    }
    if (!event.ctrlKey) return;
    event.preventDefault();
    save();
  }

  const canSave = panel === "new" ? title.trim().length > 0 : ideaId.length > 0;
  const panelTitle = panel === "new"
    ? copy.capture.createIdea
    : panel === "append"
      ? copy.capture.appendIdea
      : copy.capture.copyMemo;
  const primaryExpanded = panel === "new";
  const secondaryPanelOpen = panel === "append" || panel === "memo";
  const secondaryExpanded = menuOpen || secondaryPanelOpen;

  return (
    <div ref={rootRef} className="relative inline-flex">
      <Button
        ref={primaryButtonRef}
        variant="primary"
        size="sm"
        className="min-h-10 rounded-r-none px-3"
        aria-haspopup="dialog"
        aria-controls={primaryExpanded ? panelId : undefined}
        aria-expanded={primaryExpanded}
        onClick={openNew}
      >
        <Save aria-hidden="true" size={16} />
        {copy.capture.saveToVault}
      </Button>
      <Button
        ref={menuButtonRef}
        variant="primary"
        size="sm"
        className="min-h-10 rounded-l-none border-l border-stone-950/30 !px-2"
        aria-label={copy.capture.saveMenu}
        title={copy.capture.saveMenu}
        aria-haspopup={secondaryPanelOpen ? "dialog" : "menu"}
        aria-controls={menuOpen ? menuId : secondaryPanelOpen ? panelId : undefined}
        aria-expanded={secondaryExpanded}
        onClick={toggleMenu}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!menuOpen) toggleMenu();
          }
        }}
      >
        <ChevronDown aria-hidden="true" size={16} />
      </Button>

      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label={copy.capture.saveMenu}
          className="absolute right-0 top-full z-40 mt-2 min-w-56 border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] p-1 shadow-xl"
          onKeyDown={(event) => {
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const direction = event.key === "ArrowDown" ? 1 : -1;
              items[(index + direction + items.length) % items.length]?.focus();
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--lv-surface-raised)] focus:bg-[var(--lv-surface-raised)]"
            onClick={() => openDestination("append")}
          >
            {copy.capture.appendIdea}
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--lv-surface-raised)] focus:bg-[var(--lv-surface-raised)]"
            onClick={() => openDestination("memo")}
          >
            {copy.capture.copyMemo}
          </button>
        </div>
      ) : null}

      {panel ? (
        <form
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={panelTitleId}
          className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] p-4 shadow-xl"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          onKeyDown={handleFormKeyDown}
        >
          <h3 id={panelTitleId} className="text-base font-semibold">{panelTitle}</h3>

          {panel === "new" ? (
            <div className="mt-4 grid gap-3">
              <label className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
                {copy.common.title}
                <input ref={titleInputRef} className={`${inputClass} mt-2`} value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
                {copy.capture.nextAction}
                <input className={`${inputClass} mt-2`} value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
              </label>
            </div>
          ) : (
            <label className="mt-4 block text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
              {copy.capture.destination}
              <select ref={ideaSelectRef} className={`${inputClass} mt-2`} value={ideaId} onChange={(event) => setIdeaId(event.target.value)}>
                <option value="">{copy.capture.chooseIdea}</option>
                {ideas.map((idea) => <option key={idea.id} value={idea.id}>{idea.title}</option>)}
              </select>
            </label>
          )}

          {panel !== "memo" ? (
            <label className="mt-4 flex cursor-pointer items-start gap-3 border border-[var(--lv-border)] bg-[var(--lv-bg)] p-3 text-sm">
              <input className="mt-1" type="checkbox" checked={userVerified} onChange={(event) => setUserVerified(event.target.checked)} />
              <span>
                <strong className="block text-[var(--lv-text-secondary)]">{copy.capture.verified}</strong>
                <span className="mt-1 block text-[var(--lv-text-muted)]">{copy.capture.verifiedHelp}</span>
              </span>
            </label>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={() => close(true)}>
              {copy.common.cancel}
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="inline-flex items-center gap-2 rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-[var(--lv-text-muted)]"
            >
              <Save aria-hidden="true" size={16} />
              {copy.capture.save}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
