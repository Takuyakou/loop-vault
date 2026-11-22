/**
 * P23-51 (rule 2, mock ⑥): the one "ひとこと" on the pause screen. Every text is the lead's. The part in
 * ** ** is the key word: it is bold, and it gets the marker line once when the pause opens.
 * The tip is chosen from the first wrong answer of the round; a round without a wrong answer gets the
 * level's "all correct" text.
 */
import type { CourseQuality } from "../../domain/chordDojo/guidedCourse/bank";
import type { WrongLines } from "./guidedMarks";

const FLAT = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"] as const;
const name = (pc: number): string => FLAT[((pc % 12) + 12) % 12]!;

export interface TipSource {
  readonly level: number | "capstone";
  /** The first wrong answer of the round; undefined when the round had none. */
  readonly wrong?: {
    readonly prompt: "name" | "ear";
    readonly quality?: CourseQuality;
    readonly root?: number;
    readonly kind?: WrongLines["kind"];
  };
}

const QUALITY_TIPS: Record<CourseQuality, (root: number) => string> = {
  maj: (root) => `メジャーとマイナーの違いは 3度だけです。メジャーの 3度は、根音から **半音 4 つ上**。${name(root)} なら ${name(root + 4)} です。`,
  min: (root) => `マイナーの 3度は、根音から **半音 3 つ上**。${name(root)} なら ${name(root + 3)} です。メジャーより半音 1 つ低い所です。`,
  maj7: (root) => `maj7 の 7度は、根音の **半音 1 つ下**。${name(root)} なら ${name(root + 11)} です。7 の 7度(${name(root + 10)})より半音高い所です。`,
  dom7: (root) => `7 の 7度は、根音の **全音 1 つ下**(半音 2 つ下)。${name(root)} なら ${name(root + 10)} です。3度はメジャーのまま(${name(root + 4)})。`,
  min7: (root) => `m7 は、3度も 7度も下がった形です。3度は根音から **半音 3 つ上**、7度は根音の全音 1 つ下。${name(root)} なら ${name(root + 3)} と ${name(root + 10)} です。`,
  min7b5: (root) => `m7♭5 は、m7 の **5度を半音下げた**形です。${name(root)} なら 5度は ${name(root + 6)}(${name(root + 7)} ではありません)。`,
};

const KIND_TIPS: Partial<Record<WrongLines["kind"], string>> = {
  bass: "耳の問題では、**一番低い音**が決まっています。根音を左手で一番下に置き、残りの音を上に重ねます。",
  extra: "コードに無い音が 1 つ入ると不正解になります。弾く前に、**鳴らす音の数**を数えてから押さえましょう。",
};

const ADVANCED_TIPS: Record<string, string> = {
  "4": "分数コードは、**スラッシュの右の音**を一番下に置きます。C/E なら E を左手で弾き、C・E・G を上に重ねます。",
  "5": "進行は、**前のコードから動く音だけ**を動かすとつながります。共通の音は押さえたままにしましょう。",
  "6": "キーが変わっても、進行の**形(度数)**は同じです。まず新しいキーの I を探し、そこから ii・V を数えます。",
  "7": "耳で進行を弾く時は、まず**一番低い音の動き**だけを聴きとりましょう。ベースが分かれば、上の形は決まってきます。",
  "8": "テンションは、元のコードに**足した音**です。土台のコード(例: C7)を先に押さえ、足す音を 1 つ加えます。",
  capstone: "総合確認は、これまでの段の組み合わせです。迷ったら**根音と 3度**から押さえましょう。",
};

const ALL_CORRECT: Record<string, string> = {
  "1": "5問とも正解です。次の区切りでは、3 つの音を**一度に**押さえることを意識してみましょう。",
  "2": "5問とも正解です。4 種類の違いは 3度・5度・7度だけ。**どの音が動くか**を思い浮かべてから押さえると速くなります。",
  "3": "5問とも正解です。Lv3 は 3 秒以内が目安です。**根音を先に見つけて**、そこから形を当てはめましょう。",
};
const ALL_CORRECT_OTHER = "5問とも正解です。この調子で**次の 5問**へ。";

/** The tip text, with the key word in ** **. */
export function tipFor(source: TipSource): string {
  const wrong = source.wrong;
  if (wrong === undefined) return ALL_CORRECT[String(source.level)] ?? ALL_CORRECT_OTHER;
  if (typeof source.level === "number" && source.level <= 3) {
    const kindTip = wrong.kind === undefined ? undefined : KIND_TIPS[wrong.kind];
    if (kindTip !== undefined) return kindTip;
    if (wrong.quality !== undefined && wrong.root !== undefined) return QUALITY_TIPS[wrong.quality](wrong.root);
    return "まちがえた問題は、結果の画面のあとで**もう一度練習**できます。";
  }
  return ADVANCED_TIPS[String(source.level)] ?? ADVANCED_TIPS.capstone!;
}

export interface TipPart {
  readonly text: string;
  readonly key: boolean;
}

/** Splits a tip at its ** ** key word. */
export function tipParts(text: string): readonly TipPart[] {
  return text.split(/(\*\*[^*]+\*\*)/).filter((part) => part.length > 0).map((part) => part.startsWith("**")
    ? { text: part.slice(2, -2), key: true }
    : { text: part, key: false });
}
