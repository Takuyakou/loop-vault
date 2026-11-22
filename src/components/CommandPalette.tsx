// P23-07: the search palette (Ctrl+K). It lists progressions, screens and actions; the model decides what is listed.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import {
  flattenPalette,
  movePaletteIndex,
  searchPaletteSections,
  type PaletteCommand,
  type PaletteItem,
} from "../features/command-palette/paletteModel";
import type { VaultRow } from "../views/vault/vaultLibrary";
import { Modal } from "./Modal";
import { Kbd } from "./ui";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  rows: readonly VaultRow[];
  commands: readonly PaletteCommand[];
  /** Enter on a progression: its page. */
  onOpenProgression: (ideaId: string, blockId: string) => void;
  /** Ctrl+Enter on a progression: Voicing Loop. */
  onPracticeProgression: (ideaId: string, blockId: string) => void;
}

export function CommandPalette(props: CommandPaletteProps) {
  // Mounted only while open, so the text and the chosen row start fresh every time.
  return props.open ? <PaletteDialog {...props} /> : null;
}

function PaletteDialog({ onClose, rows, commands, onOpenProgression, onPracticeProgression }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const sections = useMemo(() => searchPaletteSections(query, rows, commands), [query, rows, commands]);
  const items = useMemo(() => flattenPalette(sections), [sections]);
  const active = items.length ? Math.min(index, items.length - 1) : -1;
  const activeId = active >= 0 ? optionId(active) : undefined;

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

  function run(item: PaletteItem, practice: boolean) {
    onClose();
    if (item.kind === "progression") {
      if (practice) onPracticeProgression(item.ideaId, item.blockId);
      else onOpenProgression(item.ideaId, item.blockId);
    } else {
      item.run();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setIndex(movePaletteIndex(active, event.key === "ArrowDown" ? 1 : -1, items.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) run(item, event.ctrlKey || event.metaKey);
    }
  }

  return (
    <Modal ariaLabel="探す" onClose={onClose} initialFocusRef={inputRef} panelClassName="lv-palette" layerClassName="z-[60]">
      <div className="lv-palette-input">
        <Search aria-hidden="true" size={16} />
        <input
          ref={inputRef}
          data-testid="command-palette-input"
          role="combobox"
          aria-label="進行・画面・操作を探す"
          aria-autocomplete="list"
          aria-expanded={items.length > 0}
          aria-controls={items.length > 0 ? listId : undefined}
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          placeholder="進行の名前・コード(Dm7 G7)・度数(2-5-1)・画面・操作"
          value={query}
          onChange={(event) => { setQuery(event.currentTarget.value); setIndex(0); }}
          onKeyDown={onKeyDown}
        />
        <Kbd>Esc</Kbd>
      </div>
      {items.length > 0 ? (
        <div id={listId} role="listbox" aria-label="見つかった物" className="lv-palette-list" data-testid="command-palette-list">
          {sections.map((section) => (
            <div key={section.id} role="group" aria-labelledby={`${baseId}-group-${section.id}`} data-palette-section={section.id}>
              <div id={`${baseId}-group-${section.id}`} className="lv-palette-group">{section.label}</div>
              {section.items.map((item) => {
                const itemIndex = items.indexOf(item);
                return (
                  <div
                    key={item.id}
                    id={optionId(itemIndex)}
                    role="option"
                    aria-selected={itemIndex === active}
                    className="lv-palette-item"
                    data-kind={item.kind}
                    data-testid="command-palette-item"
                    onMouseMove={() => setIndex(itemIndex)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => run(item, event.ctrlKey || event.metaKey)}
                  >
                    <span className="lv-palette-item-title">{item.title}</span>
                    {item.kind === "progression" ? (
                      <>
                        <span className="lv-palette-item-chords">{item.chords}</span>
                        <span className="lv-palette-item-detail">{item.detail}</span>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <p className="lv-palette-none" role="status" data-testid="command-palette-none">
          見つかりません。進行の名前、コード(Dm7 G7)、度数(2-5-1)で探せます。
        </p>
      )}
      <div className="lv-palette-foot" aria-hidden="true">
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> 選ぶ</span>
        <span><Kbd>Enter</Kbd> 開く</span>
        <span><Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> Voicing Loop で弾く</span>
      </div>
    </Modal>
  );
}
