/**
 * P23-45 advanced course (Lv4–8 and 総合確認) level contract. The Lv1–3 `guidedCourse` store/IDs are
 * frozen; this module only defines the later course's levels, groups and pass rules. Product items are
 * added per level so an unfinished level is never shown as complete.
 *
 * `questions`/`pass` are the authored set sizes and the pass thresholds checked by `review.ts` parts.
 * A level with `parts` passes only when every part reaches its own threshold.
 */
export type AdvancedLevel = 4 | 5 | 6 | 7 | 8;
export type CapstoneLevel = "capstone";
export type AdvancedCourseLevel = AdvancedLevel | CapstoneLevel;
export type AdvancedBlock = "sameDay" | "delay";

export interface AdvancedPartSpec {
  readonly id: string;
  readonly label: string;
  readonly questions: number;
  readonly pass: number;
}

export interface AdvancedBlockSpec {
  readonly questions: number;
  readonly pass: number;
  readonly parts: readonly AdvancedPartSpec[];
}

export interface AdvancedGroupSpec {
  readonly id: string;
  readonly label: string;
  readonly name: { readonly questions: number; readonly pass: number };
  /** P23-56: recolour questions (a plain progression played with the group's colours). */
  readonly context: { readonly questions: number; readonly pass: number };
  readonly ear: { readonly questions: number; readonly pass: number };
  readonly delay: { readonly questions: number; readonly pass: number };
  readonly delayContext: { readonly questions: number; readonly pass: number };
}

export interface AdvancedLevelSpec {
  readonly level: AdvancedCourseLevel;
  readonly label: string;
  readonly ability: string;
  readonly sameDay: AdvancedBlockSpec;
  readonly delay: AdvancedBlockSpec;
  readonly groups?: readonly AdvancedGroupSpec[];
  /** A short, honest description of what the level asks (shown on the level card). */
  readonly asks: readonly string[];
  /** Extra formal requirement text; absent when the parts above are the whole rule. */
  readonly extra?: string;
}

export const ADVANCED_LEVELS: readonly AdvancedLevelSpec[] = [
  {
    level: 4,
    label: "Lv4",
    ability: "配置を選ぶ",
    sameDay: { questions: 20, pass: 18, parts: [{ id: "placement", label: "配置", questions: 20, pass: 18 }] },
    delay: { questions: 10, pass: 8, parts: [{ id: "placement", label: "配置", questions: 10, pass: 8 }] },
    asks: ["分数コードは指定の最低音を弾く", "つなぎは2〜3コードを続けて弾く。近い位置へ動かす", "上の音の並べ方・運指は自由"],
    extra: "20問のうち12問は分数コード、8問はつなぎ。最低音の指定は判定し、上の音は自由。",
  },
  {
    level: 5,
    label: "Lv5",
    ability: "進行を覚えてつなぐ",
    sameDay: {
      questions: 14,
      pass: 11,
      parts: [
        { id: "progressions", label: "進行", questions: 10, pass: 8 },
        { id: "mid", label: "途中から", questions: 4, pass: 3 },
      ],
    },
    delay: { questions: 5, pass: 4, parts: [{ id: "progressions", label: "進行", questions: 5, pass: 4 }] },
    asks: ["2〜4コードを聴く・見て弾く・見ずに弾く", "進行の順番を覚え、途中からも取り出す", "1問は全カードを順番どおり弾けたときだけ正解"],
    extra: "10問で6系統を扱う。別枠の4問は指定された中間カードから残りを弾く。",
  },
  {
    level: 6,
    label: "Lv6",
    ability: "キーを変えて使う",
    sameDay: { questions: 12, pass: 10, parts: [{ id: "keys", label: "12キー", questions: 12, pass: 10 }] },
    delay: { questions: 6, pass: 5, parts: [{ id: "keys", label: "12キー", questions: 6, pass: 5 }] },
    asks: ["Lv5の進行を別のキーで弾く", "進行の型と弾くキーだけを提示する", "移調先のコード名は回答後に表示"],
    extra: "12キーすべてに正答の証拠がそろうまで正式合格にしない。未確認キーだけを後日再確認する。",
  },
  {
    level: 7,
    label: "Lv7",
    ability: "耳から進行を弾く",
    sameDay: { questions: 10, pass: 8, parts: [{ id: "ear", label: "耳の進行", questions: 10, pass: 8 }] },
    delay: { questions: 5, pass: 4, parts: [{ id: "ear", label: "耳の進行", questions: 5, pass: 4 }] },
    asks: ["基準音か短いカデンツを聴く", "2〜4コードを耳から再現する", "名前・度数・見本の鍵盤は出さない"],
    extra: "お手本の標準提示は1問あたり合計2回まで。同じ和音なら音域や配置は自由。",
  },
  {
    level: 8,
    label: "Lv8",
    ability: "響きの語彙を広げる",
    // P23-56: per group 12 names, 4 recolours and 6 ear questions on the same day; 6 names and 3 recolours
    // on another day (was 20 · 10 · 10 single chords, 120 questions in all; now 66 + 27).
    sameDay: {
      questions: 66,
      pass: 54,
      parts: [
        { id: "six:name", label: "6・add9・sus（コード名）", questions: 12, pass: 10 },
        { id: "six:context", label: "6・add9・sus（進行の中で）", questions: 4, pass: 3 },
        { id: "six:ear", label: "6・add9・sus（耳）", questions: 6, pass: 5 },
        { id: "nine:name", label: "9系（コード名）", questions: 12, pass: 10 },
        { id: "nine:context", label: "9系（進行の中で）", questions: 4, pass: 3 },
        { id: "nine:ear", label: "9系（耳）", questions: 6, pass: 5 },
        { id: "thirteen:name", label: "13・ルートレス（コード名）", questions: 12, pass: 10 },
        { id: "thirteen:context", label: "13・ルートレス（進行の中で）", questions: 4, pass: 3 },
        { id: "thirteen:ear", label: "13・ルートレス（耳）", questions: 6, pass: 5 },
      ],
    },
    delay: {
      questions: 27,
      pass: 21,
      parts: [
        { id: "six:delay", label: "6・add9・sus（別日）", questions: 6, pass: 5 },
        { id: "six:delay-context", label: "6・add9・sus（別日・進行の中で）", questions: 3, pass: 2 },
        { id: "nine:delay", label: "9系（別日）", questions: 6, pass: 5 },
        { id: "nine:delay-context", label: "9系（別日・進行の中で）", questions: 3, pass: 2 },
        { id: "thirteen:delay", label: "13・ルートレス（別日）", questions: 6, pass: 5 },
        { id: "thirteen:delay-context", label: "13・ルートレス（別日・進行の中で）", questions: 3, pass: 2 },
      ],
    },
    groups: [
      { id: "six", label: "6・add9・sus", name: { questions: 12, pass: 10 }, context: { questions: 4, pass: 3 }, ear: { questions: 6, pass: 5 }, delay: { questions: 6, pass: 5 }, delayContext: { questions: 3, pass: 2 } },
      { id: "nine", label: "9系", name: { questions: 12, pass: 10 }, context: { questions: 4, pass: 3 }, ear: { questions: 6, pass: 5 }, delay: { questions: 6, pass: 5 }, delayContext: { questions: 3, pass: 2 } },
      { id: "thirteen", label: "13・ルートレス", name: { questions: 12, pass: 10 }, context: { questions: 4, pass: 3 }, ear: { questions: 6, pass: 5 }, delay: { questions: 6, pass: 5 }, delayContext: { questions: 3, pass: 2 } },
    ],
    asks: ["6・add9・sus2・sus4 を足して聴き比べる", "m9・maj9・9 の響きを足す", "13・基本のルートレスを使う", "元の進行に響きを足して弾く"],
    extra: "①②③の群ごとに、コード名12・進行の中で4・耳6、別の日にコード名6・進行の中で3を確認し、3群すべてで合格する。途中から再開できる。",
  },
  {
    level: "capstone",
    label: "総合確認",
    ability: "覚えた響きを取り出す",
    sameDay: {
      // P23-53 (rule 3): the sight charts pass at 2 of 3 (was 3 of 3); the total follows (22 + 4 + 2).
      questions: 32,
      pass: 28,
      parts: [
        { id: "name", label: "コード名24", questions: 24, pass: 22 },
        { id: "progression", label: "4コード進行5", questions: 5, pass: 4 },
        { id: "sight", label: "初見8小節3", questions: 3, pass: 2 },
      ],
    },
    delay: {
      // P23-53 (rule 3): the delayed ear questions pass at 2 of 3 (was 3 of 3); the total follows (11 + 2).
      questions: 15,
      pass: 13,
      parts: [
        { id: "delay-name", label: "別日コード名12", questions: 12, pass: 11 },
        { id: "delay-ear", label: "別日耳3", questions: 3, pass: 2 },
      ],
    },
    asks: ["12根音を含むコード名24問", "未練習の4コード進行5問", "初見8小節の譜面3問", "別日にコード名12問と耳3問"],
    extra: "コード名は正答の80%以上を3秒以内。初見は各自のテンポ帯で期待イベントの90%以上・途中停止なし。",
  },
];

export function advancedLevelSpec(level: AdvancedCourseLevel): AdvancedLevelSpec {
  const spec = ADVANCED_LEVELS.find((entry) => entry.level === level);
  if (spec === undefined) throw new Error(`Unknown advanced course level: ${String(level)}`);
  return spec;
}

export function isAdvancedLevel(level: AdvancedCourseLevel): level is AdvancedLevel {
  return typeof level === "number";
}

export function advancedLevelLabel(level: AdvancedCourseLevel): string {
  return advancedLevelSpec(level).label;
}

/** Lv5/6 progression families (the six built-in families named by P23-45). */
export const PROGRESSION_FAMILIES = [
  "major-ii-v-i",
  "minor-ii-v-i",
  "i-vi7-ii-v",
  "i-v-vi-iv",
  "iv-iii7-vi",
  "iv-iii-ii-i",
] as const;
export type ProgressionFamily = (typeof PROGRESSION_FAMILIES)[number];

export const FAMILY_LABEL: Readonly<Record<ProgressionFamily, string>> = {
  "major-ii-v-i": "ii–V–I（長調）",
  "minor-ii-v-i": "iiø–V–i（短調）",
  "i-vi7-ii-v": "I–VI7–ii–V",
  "i-v-vi-iv": "I–V–vi–IV",
  "iv-iii7-vi": "IV–III7–vi",
  "iv-iii-ii-i": "IV–iii–ii–I",
};

/** All twelve pitch classes, used by Lv6 key coverage and capstone root coverage. */
export const TWELVE_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
