import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Presence } from "../motion/Presence";

/**
 * P25 V34: every `<select>` keeps its closed look and its native behaviour, but the list it opens is the app's
 * own (the same look as the text screen's 拍子 / キー windows).
 *
 * Nothing replaces the 64 `<select>`s: one listener on `window` takes the opening, and draws the list in a
 * portal. The closed control, its CSS, its `<label>`, `selectOption` in the tests and the screenshot baselines
 * are untouched.
 */

interface MenuEntry {
  readonly kind: "group" | "option";
  readonly label: string;
  readonly optionIndex: number;
  readonly disabled: boolean;
}

interface OpenMenu {
  readonly select: HTMLSelectElement;
  readonly entries: readonly MenuEntry[];
  readonly left: number;
  readonly top: number;
  readonly minWidth: number;
  readonly maxHeight: number;
  /** P25 V35: the list slides down from a list below the field and up from one above it. */
  readonly side: "below" | "above";
}

const MENU_ID = "lv-select-menu";
const optionId = (index: number) => `lv-select-menu-option-${index}`;
/** The tallest the list may be, and the least it shows (the CSS keeps the same row height and padding). */
const MAX_MENU_HEIGHT = 320;
const MIN_MENU_HEIGHT = 32;
const ROW_HEIGHT = 32;
const MENU_PADDING = 8;
const WINDOW_MARGIN = 8;
const ANCHOR_GAP = 4;

function isMenuSelect(select: HTMLSelectElement): boolean {
  return !select.multiple && select.size <= 1 && !select.matches(":disabled");
}

/** The options and their group names, in the order the browser shows them. */
function readEntries(select: HTMLSelectElement): MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      let heading = true;
      for (const option of Array.from(child.children)) {
        if (!(option instanceof HTMLOptionElement)) continue;
        if (heading) {
          entries.push({ kind: "group", label: child.label, optionIndex: -1, disabled: false });
          heading = false;
        }
        entries.push({
          kind: "option",
          label: option.text,
          optionIndex: option.index,
          // `:disabled` also covers an option inside a disabled `optgroup`.
          disabled: option.matches(":disabled"),
        });
      }
      continue;
    }
    if (child instanceof HTMLOptionElement) {
      entries.push({ kind: "option", label: child.text, optionIndex: child.index, disabled: child.matches(":disabled") });
    }
  }
  return entries;
}

/** Where the list goes, from the select's box: below when it fits, else above, else the roomier side. */
function place(rect: DOMRect, wantedHeight: number): { left: number; top: number; minWidth: number; maxHeight: number; side: "below" | "above" } {
  const wanted = Math.max(MIN_MENU_HEIGHT, Math.min(MAX_MENU_HEIGHT, wantedHeight));
  const spaceBelow = window.innerHeight - WINDOW_MARGIN - (rect.bottom + ANCHOR_GAP);
  const spaceAbove = rect.top - ANCHOR_GAP - WINDOW_MARGIN;
  const minWidth = Math.max(0, rect.width);
  let left = rect.left;
  if (left + minWidth > window.innerWidth - WINDOW_MARGIN) left = window.innerWidth - WINDOW_MARGIN - minWidth;
  left = Math.max(WINDOW_MARGIN, left);
  if (spaceBelow >= wanted) return { left, top: rect.bottom + ANCHOR_GAP, minWidth, maxHeight: wanted, side: "below" };
  if (spaceAbove >= wanted) return { left, top: rect.top - ANCHOR_GAP - wanted, minWidth, maxHeight: wanted, side: "above" };
  if (spaceBelow >= spaceAbove) {
    const maxHeight = Math.max(MIN_MENU_HEIGHT, spaceBelow);
    return { left, top: rect.bottom + ANCHOR_GAP, minWidth, maxHeight, side: "below" };
  }
  const maxHeight = Math.max(MIN_MENU_HEIGHT, spaceAbove);
  return { left, top: rect.top - ANCHOR_GAP - maxHeight, minWidth, maxHeight, side: "above" };
}

function labelOf(select: HTMLSelectElement): string | undefined {
  const own = select.getAttribute("aria-label");
  if (own !== null && own.trim() !== "") return own;
  const fromLabel = select.labels?.[0]?.textContent?.trim();
  return fromLabel === undefined || fromLabel === "" ? undefined : fromLabel;
}

export function SelectMenuHost() {
  const [menu, setMenu] = useState<OpenMenu>();
  /** P25 V35: the list is drawn for 100ms after it closes, so it can fade out where it was. */
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<OpenMenu>();
  const activeRef = useRef(0);
  openRef.current = open ? menu : undefined;
  activeRef.current = active;

  const closeMenu = useCallback(() => {
    const current = openRef.current;
    if (current !== undefined) {
      current.select.removeAttribute("aria-expanded");
      current.select.removeAttribute("aria-controls");
    }
    openRef.current = undefined;
    setOpen(false);
  }, []);

  const openMenu = useCallback((select: HTMLSelectElement) => {
    closeMenu();
    const entries = readEntries(select);
    const optionCount = entries.filter((entry) => entry.kind === "option").length;
    const wanted = optionCount * ROW_HEIGHT + MENU_PADDING;
    const chosen = select.selectedIndex;
    const firstEnabled = entries.find((entry) => entry.kind === "option" && !entry.disabled)?.optionIndex ?? 0;
    select.setAttribute("aria-expanded", "true");
    select.setAttribute("aria-controls", MENU_ID);
    setActive(chosen >= 0 ? chosen : firstEnabled);
    setMenu({ select, entries, ...place(select.getBoundingClientRect(), wanted) });
    setOpen(true);
  }, [closeMenu]);

  const choose = useCallback((index: number) => {
    const current = openRef.current;
    if (current === undefined) return;
    const option = current.select.options[index];
    if (option === undefined || option.matches(":disabled")) return;
    const select = current.select;
    if (select.value !== option.value) {
      // React listens to `change`; writing through the prototype's setter is what a real choice does.
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, option.value);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    closeMenu();
    select.focus();
  }, [closeMenu]);

  useEffect(() => {
    /** The next usable option `delta` rows away (unusable rows are stepped over), or the same one at the end. */
    function step(from: number, delta: number, direction: 1 | -1): number {
      const current = openRef.current;
      if (current === undefined) return from;
      const enabled = current.entries
        .filter((entry) => entry.kind === "option" && !entry.disabled)
        .map((entry) => entry.optionIndex)
        .sort((left, right) => left - right);
      if (enabled.length === 0) return from;
      const at = enabled.indexOf(from);
      if (at < 0) {
        // The active row is unusable: the next usable row in the direction of travel is the answer.
        const ahead = enabled.filter((index) => (direction > 0 ? index > from : index < from));
        return (direction > 0 ? ahead[0] : ahead[ahead.length - 1]) ?? from;
      }
      const target = Math.max(0, Math.min(enabled.length - 1, at + direction * Math.max(1, delta)));
      return enabled[target]!;
    }

    function edge(backwards: boolean): number {
      const current = openRef.current;
      if (current === undefined) return activeRef.current;
      const options = current.entries.filter((entry) => entry.kind === "option");
      const ordered = backwards ? [...options].reverse() : options;
      return ordered.find((entry) => !entry.disabled)?.optionIndex ?? activeRef.current;
    }

    function typeAhead(character: string): number {
      const current = openRef.current;
      if (current === undefined) return activeRef.current;
      const options = current.entries.filter((entry) => entry.kind === "option");
      if (options.length === 0) return activeRef.current;
      const lower = character.toLowerCase();
      const start = options.findIndex((entry) => entry.optionIndex === activeRef.current);
      for (let hop = 1; hop <= options.length; hop += 1) {
        const entry = options[(start + hop + options.length) % options.length]!;
        if (!entry.disabled && entry.label.toLowerCase().startsWith(lower)) return entry.optionIndex;
      }
      return activeRef.current;
    }

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest("select") : null;
      if (!(target instanceof HTMLSelectElement) || !isMenuSelect(target)) return;
      // The Windows list never opens; the app's own one does (or closes, when it is this select's).
      event.preventDefault();
      target.focus();
      if (openRef.current?.select === target) closeMenu();
      else openMenu(target);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (openRef.current === undefined) {
        const focused = document.activeElement;
        if (!(focused instanceof HTMLSelectElement) || !isMenuSelect(focused)) return;
        const opens = event.key === "Enter" || event.key === " " || event.key === "F4"
          || (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp"));
        // A closed select keeps today's ArrowUp / ArrowDown (they change the value, as Windows does).
        if (!opens) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        openMenu(focused);
        return;
      }
      let next: number | undefined;
      if (event.key === "ArrowDown") next = step(activeRef.current, 1, 1);
      else if (event.key === "ArrowUp") next = step(activeRef.current, 1, -1);
      else if (event.key === "Home") next = edge(false);
      else if (event.key === "End") next = edge(true);
      else if (event.key === "PageDown") next = step(activeRef.current, 8, 1);
      else if (event.key === "PageUp") next = step(activeRef.current, 8, -1);
      else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopImmediatePropagation();
        choose(activeRef.current);
        return;
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeMenu();
        return;
      } else if (event.key === "Tab") {
        // Tab still leaves the field; only the list goes.
        closeMenu();
        return;
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        next = typeAhead(event.key);
      }
      if (next === undefined) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setActive(next);
    };

    const onPointerDown = (event: PointerEvent) => {
      const current = openRef.current;
      if (current === undefined) return;
      const target = event.target instanceof Node ? event.target : undefined;
      if (target !== undefined && current.select.contains(target)) return;
      if (target !== undefined && menuRef.current?.contains(target)) return;
      closeMenu();
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      if (openRef.current !== undefined) closeMenu();
    };

    const onResize = () => {
      if (openRef.current !== undefined) closeMenu();
    };

    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize, true);
      const current = openRef.current;
      if (current !== undefined) {
        current.select.removeAttribute("aria-expanded");
        current.select.removeAttribute("aria-controls");
      }
    };
  }, [choose, closeMenu, openMenu]);

  // The chosen option is scrolled into the list's view when it opens.
  useEffect(() => {
    if (!open || menu === undefined) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [menu, open]);

  if (menu === undefined) return null;
  return createPortal(
    <Presence show={open} exitMs={100}>{(presence) => (
      <div
        ref={menuRef}
        id={MENU_ID}
        role="listbox"
        className="lv-select-menu"
        data-presence={presence.state}
        data-side={menu.side}
        onTransitionEnd={presence.onTransitionEnd}
        aria-label={labelOf(menu.select)}
        aria-activedescendant={optionId(active)}
        onMouseDown={(event) => event.preventDefault()}
        style={{ position: "fixed", left: menu.left, top: menu.top, minWidth: menu.minWidth, maxHeight: menu.maxHeight }}
      >
        {menu.entries.map((entry) => entry.kind === "group" ? (
          <div key={`group-${entry.label}-${entry.optionIndex}`} role="presentation" className="lv-select-menu-group">{entry.label}</div>
        ) : (
          <div
            key={`option-${entry.optionIndex}`}
            id={optionId(entry.optionIndex)}
            role="option"
            className="lv-select-menu-option"
            data-value={menu.select.options[entry.optionIndex]?.value}
            aria-selected={entry.optionIndex === menu.select.selectedIndex}
            aria-disabled={entry.disabled || undefined}
            data-active={entry.optionIndex === active || undefined}
            onMouseEnter={() => setActive(entry.optionIndex)}
            onClick={() => choose(entry.optionIndex)}
          >{entry.label}</div>
        ))}
      </div>
    )}</Presence>,
    document.body,
  );
}
