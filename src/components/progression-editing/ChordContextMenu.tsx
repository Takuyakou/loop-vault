import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  canDeleteEditableChordWithMode,
  canMergeEditableChords,
  canSplitEditableChord,
  type ChordContextAction,
  type EditableProgression,
} from "../../domain/progressionEditing";
import type { AppLanguage } from "../../i18n";

interface ChordContextMenuProps {
  editable: EditableProgression;
  slotId: string;
  anchorElement: HTMLElement;
  language: AppLanguage;
  canCutRange: boolean;
  onEdit(): void;
  onAction(action: ChordContextAction): void;
  onClose(): void;
}

export function ChordContextMenu({
  editable,
  slotId,
  anchorElement,
  language,
  canCutRange,
  onEdit,
  onAction,
  onClose,
}: ChordContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8, width: 320 });
  const index = editable.slots.findIndex((slot) => slot.id === slotId);
  const slot = editable.slots[index];
  const pair = editable.slots[index + 1]
    ? [slot, editable.slots[index + 1]] as const
    : index > 0
      ? [editable.slots[index - 1], slot] as const
      : undefined;
  const canMerge = Boolean(
    pair?.[0]
    && pair[1]
    && canMergeEditableChords(editable, pair[0].id, pair[1].id),
  );
  const copy = contextCopy(language);

  useLayoutEffect(() => {
    function updatePosition() {
      const anchor = anchorElement.getBoundingClientRect();
      const height = menuRef.current?.getBoundingClientRect().height ?? 520;
      const width = Math.min(320, Math.max(248, window.innerWidth - 16));
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
      const below = anchor.bottom + 8;
      const top = below + height <= window.innerHeight - 8
        ? below
        : Math.max(8, anchor.top - height - 8);
      setPosition({ left, top, width });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement]);

  useEffect(() => {
    const first = menuRef.current?.querySelector<HTMLButtonElement>(
      'button[role="menuitem"]:not(:disabled)',
    );
    first?.focus();
    return () => anchorElement.focus();
  }, [anchorElement]);

  useEffect(() => {
    function outside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", outside, true);
    return () => document.removeEventListener("mousedown", outside, true);
  }, [onClose]);

  if (!slot) return null;

  function run(action: ChordContextAction) {
    onAction(action);
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]:not(:disabled)',
    ) ?? [])];
    if (buttons.length === 0) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${slot.currentChord.label} ${copy.title}`}
      tabIndex={-1}
      className="fixed z-[60] max-h-[calc(100vh-1rem)] overflow-y-auto border border-[var(--lv-border-strong)] bg-[var(--lv-surface)] p-2 shadow-2xl outline-none"
      style={position}
      onKeyDown={onKeyDown}
      data-chord-context-menu
    >
      <p className="px-2 py-1 text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
        {slot.currentChord.label} ・ {copy.title}
      </p>
      <MenuButton label={copy.edit} description={copy.editDescription} onClick={onEdit} />
      <MenuGroup label={copy.delete}>
        <MenuButton
          label={copy.extendPrevious}
          description={copy.extendPreviousDescription}
          disabled={!canDeleteEditableChordWithMode(editable, slotId, "extend-previous")}
          onClick={() => run("delete-extend-previous")}
        />
        <MenuButton
          label={copy.extendNext}
          description={copy.extendNextDescription}
          disabled={!canDeleteEditableChordWithMode(editable, slotId, "extend-next")}
          onClick={() => run("delete-extend-next")}
        />
        <MenuButton
          label={copy.closeGap}
          description={copy.closeGapDescription}
          disabled={!canDeleteEditableChordWithMode(editable, slotId, "close-gap")}
          onClick={() => run("delete-close-gap")}
        />
        <MenuButton
          label={copy.noChord}
          description={copy.noChordDescription}
          disabled={!canDeleteEditableChordWithMode(editable, slotId, "replace-no-chord")}
          onClick={() => run("replace-no-chord")}
        />
      </MenuGroup>
      <MenuGroup label={copy.structure}>
        <MenuButton
          label={copy.split}
          description={copy.splitDescription}
          disabled={!canSplitEditableChord(editable, slotId)}
          onClick={() => run("split")}
        />
        <MenuButton
          label={copy.mergeLeft}
          description={copy.mergeLeftDescription}
          disabled={!canMerge}
          onClick={() => run("merge-keep-left")}
        />
        <MenuButton
          label={copy.mergeRight}
          description={copy.mergeRightDescription}
          disabled={!canMerge}
          onClick={() => run("merge-keep-right")}
        />
        <MenuButton
          label={copy.cutRange}
          description={copy.cutRangeDescription}
          disabled={!canCutRange}
          onClick={() => run("cut-range-here")}
        />
      </MenuGroup>
    </div>,
    document.body,
  );
}

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 border-t border-[var(--lv-border)] pt-2" role="group" aria-label={label}>
      <p className="px-2 pb-1 text-xs font-semibold text-[var(--lv-text-muted)]">{label}</p>
      {children}
    </div>
  );
}

function MenuButton({
  label,
  description,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="grid min-h-11 w-full gap-0.5 px-2 py-1.5 text-left hover:bg-[var(--lv-surface-raised)] focus:bg-[var(--lv-surface-raised)] disabled:opacity-35"
      onClick={onClick}
    >
      <span className="text-sm text-[var(--lv-text)]">{label}</span>
      <span className="text-xs leading-4 text-[var(--lv-text-muted)]">{description}</span>
    </button>
  );
}

function contextCopy(language: AppLanguage) {
  if (language === "en") {
    return {
      title: "Edit actions",
      edit: "Edit chord",
      editDescription: "Open chord candidates and structure controls.",
      delete: "Delete chord",
      extendPrevious: "Extend previous chord",
      extendPreviousDescription: "Delete this chord and give its time to the previous chord.",
      extendNext: "Extend next chord",
      extendNextDescription: "Delete this chord and give its time to the next chord.",
      closeGap: "Close the gap",
      closeGapDescription: "Delete this chord and shift all following chords earlier.",
      noChord: "Replace with N.C.",
      noChordDescription: "Keep the timing as an explicit no-chord event.",
      structure: "Structure",
      split: "Split in two",
      splitDescription: "Duplicate the chord and divide its duration equally.",
      mergeLeft: "Merge and keep left chord",
      mergeLeftDescription: "Join the adjacent pair using the left chord and voicing.",
      mergeRight: "Merge and keep right chord",
      mergeRightDescription: "Join the adjacent pair using the right chord and voicing.",
      cutRange: "Cut range here",
      cutRangeDescription: "End the Draft at this chord's boundary.",
    };
  }
  return {
    title: "編集",
    edit: "コードを編集",
    editDescription: "コード候補と構成編集を開きます。",
    delete: "コードを削除",
    extendPrevious: "前のコードを伸ばす",
    extendPreviousDescription: "このコードを削除し、その長さを前のコードへ渡します。",
    extendNext: "次のコードを伸ばす",
    extendNextDescription: "このコードを削除し、その長さを次のコードへ渡します。",
    closeGap: "範囲を詰める",
    closeGapDescription: "このコードを削除し、後続コードを前へ移動します。",
    noChord: "N.C.に置き換える",
    noChordDescription: "長さを保ったまま、明示的な無音区間にします。",
    structure: "構造",
    split: "2つに分割",
    splitDescription: "コードを複製し、長さを半分ずつに分けます。",
    mergeLeft: "結合して左のコードを残す",
    mergeLeftDescription: "隣接する2つを、左側のコードとVoicingで結合します。",
    mergeRight: "結合して右のコードを残す",
    mergeRightDescription: "隣接する2つを、右側のコードとVoicingで結合します。",
    cutRange: "ここで範囲を切る",
    cutRangeDescription: "このコードの終端をDraft範囲の終わりにします。",
  };
}
