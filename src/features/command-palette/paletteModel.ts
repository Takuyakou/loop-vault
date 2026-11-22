// P23-07: what the search palette (Ctrl+K) lists. Pure functions; the component renders what these return.
import { displayChordLabel } from "../../ui/chordText";
import { emptyVaultFilters, queryVault, type VaultRow } from "../../views/vault/vaultLibrary";

export interface PaletteCommand {
  id: string;
  group: "screen" | "action";
  title: string;
  /** Extra words the command is found by (not shown). */
  keywords?: string;
  /** Listed under 「よく使う操作」 while nothing is typed. */
  frequent?: boolean;
  run: () => void;
}

export interface PaletteProgressionItem {
  kind: "progression";
  id: string;
  ideaId: string;
  blockId: string;
  title: string;
  /** "8小節" */
  detail: string;
  /** The first chords as shown: "Dm7  G7  Cmaj7 …" */
  chords: string;
}

export interface PaletteCommandItem {
  kind: "command";
  id: string;
  title: string;
  run: () => void;
}

export type PaletteItem = PaletteProgressionItem | PaletteCommandItem;

export interface PaletteSection {
  id: "frequent" | "progression" | "screen" | "action";
  label: string;
  items: PaletteItem[];
}

export const PALETTE_PROGRESSION_LIMIT = 6;
export const PALETTE_CHORD_PREVIEW = 6;

/** Full-width letters and digits become half-width, ♯ ♭ become # b, the ends are trimmed. */
export function normalizePaletteQuery(query: string): string {
  return query.normalize("NFKC").replace(/♯/g, "#").replace(/♭/g, "b").trim();
}

function commandItem(command: PaletteCommand): PaletteCommandItem {
  return { kind: "command", id: `command:${command.id}`, title: command.title, run: command.run };
}

function progressionItem(row: VaultRow): PaletteProgressionItem {
  const labels = row.block.chords.map((item) => displayChordLabel(item.chord.label));
  const shown = labels.slice(0, PALETTE_CHORD_PREVIEW).join("  ");
  return {
    kind: "progression",
    id: `progression:${row.id}`,
    ideaId: row.idea.id,
    blockId: row.block.id,
    title: row.name,
    detail: `${row.bars}小節`,
    chords: labels.length > PALETTE_CHORD_PREVIEW ? `${shown} …` : shown,
  };
}

/**
 * Nothing typed: the frequent commands. Otherwise: progressions (found the way the Vault search finds them,
 * newest first, at most PALETTE_PROGRESSION_LIMIT), then screens, then actions whose title or keywords contain
 * the text. Empty sections are left out.
 */
export function searchPaletteSections(
  query: string,
  rows: readonly VaultRow[],
  commands: readonly PaletteCommand[],
): PaletteSection[] {
  const text = normalizePaletteQuery(query);
  if (!text) {
    const frequent = commands.filter((command) => command.frequent).map(commandItem);
    return frequent.length ? [{ id: "frequent", label: "よく使う操作", items: frequent }] : [];
  }
  const lower = text.toLocaleLowerCase();
  const found = (command: PaletteCommand) =>
    `${command.title} ${command.keywords ?? ""}`.normalize("NFKC").toLocaleLowerCase().includes(lower);
  const progressions = queryVault(rows, emptyVaultFilters, text, "newest").rows
    .slice(0, PALETTE_PROGRESSION_LIMIT)
    .map(({ row }) => progressionItem(row));
  const screens = commands.filter((command) => command.group === "screen" && found(command)).map(commandItem);
  const actions = commands.filter((command) => command.group === "action" && found(command)).map(commandItem);
  const sections: PaletteSection[] = [
    { id: "progression", label: "進行", items: progressions },
    { id: "screen", label: "画面", items: screens },
    { id: "action", label: "操作", items: actions },
  ];
  return sections.filter((section) => section.items.length > 0);
}

/** The items of every section, in the order they are listed. */
export function flattenPalette(sections: readonly PaletteSection[]): PaletteItem[] {
  return sections.flatMap((section) => section.items);
}

/** ↑ ↓ through `count` items, wrapping at the ends. -1 when there is nothing to choose. */
export function movePaletteIndex(index: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (index < 0) return delta === 1 ? 0 : count - 1;
  return (index + delta + count) % count;
}
