import { makeChord, makeItem, voiceLed, type ChordSpec } from "./build";
import type { AdvancedBlock, AdvancedItem } from "./types";

/**
 * P23-45 Lv4, rewritten by P23-54: choose the lowest note and move to the nearest placement.
 *
 * - A *slash* question is one chord whose lowest note is named (`C/E`, `F/G`). Every slash chord is an
 *   inversion or on-chord a song would actually use. The bass is judged; the upper notes are free.
 * - A *connection* question is two or three chords played in order (`C → C/E → F`): the bass walks by
 *   step or a common tone stays. Every chord is judged by its pitch classes, and a slash chord by its bass.
 *
 * The P23-45 "placement B" (the same chord with its top note an octave up) could not be judged — any
 * placement passes — so it is gone from the official set and lives on only as an example.
 *
 * Ids: the P23-45 ids are kept by position, so records made before P23-54 keep counting and a level
 * passed before stays passed. The id names no longer describe the chord.
 */
type Spec = ChordSpec & { readonly bass?: number };

interface Lv4Question {
  /** One chord (slash) or two to three chords (connection). */
  readonly chords: readonly Spec[];
  /** The line under a connection's names: how the bass walks and what stays. Slash questions have none. */
  readonly detail?: string;
}

const s = (root: number, quality: Spec["quality"], bass?: number, bassName?: string): Spec => ({
  root,
  quality,
  ...(bass === undefined ? {} : { bass }),
  ...(bassName === undefined ? {} : { bassName }),
});

const SAME_DAY: readonly Lv4Question[] = [
  { chords: [s(0, "maj", 4)] }, // C/E
  { chords: [s(7, "maj", 11)] }, // G/B
  { chords: [s(9, "min7", 7)] }, // Am7/G
  { chords: [s(2, "maj", 6)] }, // D/F#
  { chords: [s(5, "maj", 7)] }, // F/G
  { chords: [s(0, "maj"), s(0, "maj", 4), s(5, "maj")], detail: "最低音が C → E → F と上がる。上の C は残す" },
  { chords: [s(5, "maj7", 9)] }, // Fmaj7/A
  { chords: [s(9, "min7"), s(9, "min7", 7), s(5, "maj7")], detail: "最低音が A → G → F と下がる。上の C・E は残す" },
  { chords: [s(7, "dom7", 5)] }, // G7/F
  { chords: [s(0, "maj7"), s(9, "min7")], detail: "C・E・G は残し、B だけ A へ動かす" },
  { chords: [s(0, "min", 3)] }, // Cm/E♭
  { chords: [s(0, "maj"), s(7, "maj", 11), s(9, "min7")], detail: "最低音が C → B → A と下がる" },
  { chords: [s(4, "dom7", 8, "G#")] }, // E7/G#
  { chords: [s(5, "maj"), s(5, "maj", 7), s(0, "maj")], detail: "上の F・A・C を残したまま最低音を G へ。そのあと C へ" },
  { chords: [s(10, "maj", 2)] }, // B♭/D
  { chords: [s(5, "maj7"), s(4, "dom7", 8, "G#"), s(9, "min")], detail: "最低音が F → G# → A と上がる" },
  { chords: [s(2, "min7", 0)] }, // Dm7/C
  { chords: [s(3, "maj"), s(10, "maj", 2), s(0, "min7")], detail: "最低音が E♭ → D → C と下がる" },
  { chords: [s(4, "min", 7)] }, // Em/G
  { chords: [s(5, "maj"), s(5, "min", 8), s(0, "maj", 7)], detail: "最低音が F → A♭ → G。上の A が A♭ に下がる" },
];

const DELAY: readonly Lv4Question[] = [
  { chords: [s(9, "maj", 1, "C#")] }, // A/C#
  { chords: [s(4, "maj", 8, "G#")] }, // E/G#
  { chords: [s(10, "maj", 5)] }, // B♭/F
  { chords: [s(7, "min7", 5)] }, // Gm7/F
  { chords: [s(8, "maj", 0)] }, // A♭/C
  { chords: [s(8, "maj"), s(8, "maj", 0), s(1, "maj")], detail: "最低音が A♭ → C → D♭ と上がる" },
  { chords: [s(3, "maj", 5)] }, // E♭/F
  { chords: [s(2, "maj"), s(9, "maj", 1, "C#"), s(11, "min7")], detail: "最低音が D → C# → B と下がる" },
  { chords: [s(11, "dom7", 3, "D#")] }, // B7/D#
  { chords: [s(3, "maj7"), s(2, "dom7", 6), s(7, "min")], detail: "最低音が E♭ → F# → G と上がる" },
];

/** The P23-45 ids, in the P23-45 order. Kept by position (see above). */
const SAME_DAY_IDS = [
  "C-a", "C-b", "Cm-a", "Cm-b", "Fmaj7-a", "Fmaj7-b", "G7-a", "G7-b", "Am7-a", "Am7-b",
  "Bm7b5-a", "Bm7b5-b", "Cmaj7-a", "Cmaj7-b", "Ebm7-a", "Ebm7-b", "F-a", "F-b", "Bb7-a", "Bb7-b",
].map((name) => `lv4-sd-${name}`);
const DELAY_IDS = ["Db-a", "Db-b", "Em-a", "Em-b", "F#maj7-a", "F#maj7-b", "Ab-a", "Ab-b", "Bbm7-a", "Bbm7-b"].map((name) => `lv4-dl-${name}`);

function question(entry: Lv4Question, id: string, block: AdvancedBlock): AdvancedItem {
  const chords = voiceLed(entry.chords.map((spec) => makeChord(spec)));
  const single = chords.length === 1;
  return makeItem({
    id,
    level: 4,
    block,
    setId: block,
    kind: single ? "placement" : "progression",
    part: "placement",
    label: chords.map((chord) => chord.label).join(" → "),
    // A slash question needs no line: the instruction above the name already says 「最低音を E にして弾いてください」.
    ...(entry.detail === undefined ? {} : { detail: entry.detail }),
    chords,
    revealCards: true,
    allowedPlaybacks: 0,
  });
}

export const LV4_SAME_DAY: readonly AdvancedItem[] = SAME_DAY.map((entry, index) => question(entry, SAME_DAY_IDS[index]!, "sameDay"));
export const LV4_DELAY: readonly AdvancedItem[] = DELAY.map((entry, index) => question(entry, DELAY_IDS[index]!, "delay"));

/** The wider placement of the same chord: the top note moves up an octave, the bass stays put. */
function openPlacement(notes: readonly number[]): number[] {
  if (notes.length <= 1) return [...notes];
  const sorted = [...notes].sort((left, right) => left - right);
  sorted[sorted.length - 1] = sorted[sorted.length - 1]! + 12;
  return sorted;
}

function demo(id: string, chords: readonly Spec[], detail: string, open = false): AdvancedItem {
  const built = voiceLed(chords.map((spec) => makeChord(spec)));
  const first = built[0]!;
  return makeItem({
    id,
    level: 4,
    block: "sameDay",
    setId: "demo",
    kind: built.length === 1 ? "placement" : "progression",
    part: "demo",
    label: built.map((chord) => chord.label).join(" → "),
    detail,
    chords: open ? [{ ...first, referenceNotes: openPlacement(first.referenceNotes) }] : built,
    revealCards: true,
    allowedPlaybacks: 0,
  });
}

/**
 * Examples before the first confirmation (never recorded): the same chord in two placements (heard, not
 * judged), the same chord over two basses, then one connection.
 */
export const LV4_DEMO: readonly AdvancedItem[] = [
  demo("lv4-demo-1", [s(0, "min")], "配置 A（閉じた配置）"),
  demo("lv4-demo-2", [s(0, "min")], "配置 B（一番上を1オクターブ上へ）。どちらでも合格", true),
  demo("lv4-demo-3", [s(0, "maj", 4)], "最低音を E に。上の並べ方は自由"),
  demo("lv4-demo-4", [s(0, "maj"), s(0, "maj", 4), s(5, "maj")], "最低音が C → E → F と上がる。上の C は残す"),
];
export const LV4_DEMO_IDS: readonly string[] = LV4_DEMO.map((item) => item.id);

export const LV4_ITEMS: readonly AdvancedItem[] = [...LV4_SAME_DAY, ...LV4_DELAY];
export const LV4_SLASH_SAME_DAY = LV4_SAME_DAY.filter((item) => item.chords.length === 1 && item.chords[0]!.bassPitchClass !== undefined).length;
export const LV4_CONNECTION_SAME_DAY = LV4_SAME_DAY.filter((item) => item.chords.length > 1).length;

export function lv4ItemById(id: string): AdvancedItem | undefined {
  return [...LV4_ITEMS, ...LV4_DEMO].find((item) => item.id === id);
}
