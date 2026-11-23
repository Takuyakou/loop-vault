import type { AdvancedCourseLevel } from "../../domain/chordDojo/guidedCourse/advanced/types";
import type { AdvancedDiagnosis, AdvancedDiagnosisKind } from "./advancedDiagnosis";

/**
 * P24-04: the break screen's 「ひとこと」 for the advanced course, one text per diagnosis, with two or
 * three natural phrasings each. The wording is the design's (P24-G) verbatim; only the `${…}` fills are
 * added. The variant is chosen by a hash of (level, round, item, diagnosis) — never at random, so the same
 * break always reads the same.
 */
/** fix-2 item 4: test support — every wording the break screen can pick for a diagnosis kind. */
export function advancedTipVariants(kind: AdvancedDiagnosisKind): readonly string[] {
  return VARIANTS[kind] ?? [];
}

const VARIANTS: Partial<Record<AdvancedDiagnosisKind, readonly string[]>> = {
  "lv4-slash-bass": [
    "${label} は**一番下の音 ${bassName}** が土台です。左手で ${bassName} を先に置いてから上の音を乗せましょう。",
    "上の響きは合っていますが、**最低音が ${bassName} ではない**状態でした。スラッシュの右側だけを先に鳴らしてみます。",
    "オンコードは**ベースの ${bassName}** で性格が決まります。${lowestPlayed} ではなく ${bassName} を左手の小指で支えましょう。",
  ],
  "lv4-progression": [
    "${cardNo}枚目の ${chordLabel} で手が大きく動いています。**前のコードと重なる音を残す**と自然につながります。",
    "${cardNo}枚目の ${chordLabel} で **${missingOrForeign}** が抜け入りしています。ベースだけ 1 つ動かして上を保つ意識を。",
    "つなぎでは全音を入れ替える必要はありません。${chordLabel} へ移る時は**一番近い鍵盤**だけ動かしてみましょう。",
  ],
  "lv5-midstart": [
    "途中スタートは最初の ${chordLabel} の**度数の場所**を見失いがちです。頭に **${firstRoot}** を置いてから残りをつなぎます。",
    "前からの流れが無いぶん、**${chordLabel} の 3度と 7度**を先に押さえると進行の景色がすぐ戻ります。",
  ],
  "lv5-progression": [
    "${cardNo}枚目の ${chordLabel} が別の形に寄りませんでしたか？ 迷ったら**全音か半音で動く音だけ**を追います。",
    "${cardNo}枚目（${chordLabel}）で **${missingOrForeign}** が崩れました。まず左手のルート移動だけをリズムに乗せて確認しましょう。",
    "1 枚ずつ独立して思い出すより、**前のコードのすぐ隣**で ${chordLabel} を拾うほうが速くつながります。",
  ],
  "lv6-transpose": [
    "キー ${keyName} になると黒鍵が増えて迷いやすくなります。コード名より先に**度の動き（例: ${familyHint}）**を口ずさんでから弾きます。",
    "${cardNo}枚目で移調先の音がずれました。新しいキーの **I の音（${keyName}）の位置**を指で触れてから進めると見失いません。",
    "${keyName} キーでは黒鍵を恐れず、**根音から半音の数**で 3度・7度を数えると移調が一気に安定します。",
  ],
  "lv7-bass": [
    "耳コピーの土台は**一番低い音の移動**です。${cardNo}枚目の上は気にせず、まずベースの動きだけを歌って確かめます。",
    "${cardNo}枚目でルートが別の音に聴こえています。**最初の基準音からどれだけ動いたか**を先に追ってみましょう。",
  ],
  "lv7-upper": [
    "ベースの流れは合っています！ ${cardNo}枚目は**明るいか暗いか（3度）**と**7度の緊張感**の 2 点だけ聴き分けます。",
    "下の音は掴めているのであと一歩です。${cardNo}枚目の響きが**落ち着くか（maj7）進むか（7/m7）**で絞ってみましょう。",
  ],
  "lv8-tension-missing": [
    "${chordLabel} の色を決めるのは **${toneHint}（${missingNames}）** です。三和音の枠にまず 1 音だけ足す感覚で。",
    "${missingNames} が抜けて普通のコードに戻りました。${chordLabel} は **${tensionDegree} の音**をトップか内声に必ず置きます。",
    "土台（3度・7度）が合っているだけに惜しい！ 次の回では最初に **${missingNames} の鍵盤**を目で見てから押さえます。",
  ],
  "lv8-rootless": [
    "${chordLabel}（ルートレス）は根音を弾かない代わりに、**3度と 7度のガイドトーン**で正体を作ります。",
    "つい根音 ${rootName} を押さえたくなりますが、左手は **3度か 7度から始めて**上に ${tensionDegree} を積むのがコツです。",
  ],
  "lv8-recolor": [
    "素のコードのまま弾いてしまいました。${cardNo}枚目は元の形に **${colorHint} の 1 音**を足して色を変えます。",
    "リカラーは全取り替えではありません。いつもの ${plainLabel} を押さえる指から **1 本だけ隣**にずらして響きを乗せましょう。",
  ],
  "cap-name": [
    "${chordLabel} で **${missingOrForeign}** が出ました。総合では迷ったら**根音と 3度・7度**の骨格を最優先で押さえます。",
    "3 秒以内を意識して焦ると余分な音が混ざります。**押さえる数**を頭に浮かべてから鍵盤に手を置きます。",
  ],
  "cap-ear": [
    "耳コピーの土台は**一番低い音の移動**です。${cardNo}枚目の上は気にせず、まずベースの動きだけを歌って確かめます。",
    "${cardNo}枚目でルートが別の音に聴こえています。**最初の基準音からどれだけ動いたか**を先に追ってみましょう。",
  ],
  "cap-sight-stop": [
    "途中で **${longestStop} 拍止まって**しまいました。初見は間違いを直しに戻らず、拍に合わせて次の小節へ進みます。",
    "1 コード外しても大丈夫です。**メトロノームの 1 拍目**だけは遅れずに左手のルートを置く練習をしてみましょう。",
  ],
  "cap-sight-accuracy": [
    "止まらず進めた点は素晴らしいです！ 小節の境目の **半拍前** に次のコードの形を思い浮かべると余裕が出ます。",
    "細かい音は少し抜けても構いません。各小節の**頭で 3度と 7度**を揃える意識だけで正答率が大きく上がります。",
  ],
  "no-input": [
    "音が入らず時間切れになりました。**次のコードの形を先に頭で選んで**から、一呼吸置いて弾き始めましょう。",
    "進行の途中で止まった時は、全部弾こうとせず**まず最初の 2 拍のルートだけ**を確実につなげてみます。",
  ],
  incomplete: [
    "音が入らず時間切れになりました。**次のコードの形を先に頭で選んで**から、一呼吸置いて弾き始めましょう。",
    "進行の途中で止まった時は、全部弾こうとせず**まず最初の 2 拍のルートだけ**を確実につなげてみます。",
  ],
};

const ALL_CORRECT: Record<string, readonly string[]> = {
  "4": [
    "5問とも正解です。この調子で**共通音を残す動き**をそのまま手に馴染ませましょう。",
    "全問正解！ ベースの場所が迷わず選べるようになってきました。次の 5 問へ。",
  ],
  "5": [
    "5問とも正解です。進行の**縦のつながり**が指に入っています。次の 5 問も同じ流れで。",
    "全問正解！ コード名ではなく**手の移動距離**で次が見つかり始めています。",
  ],
  "6": [
    "5問とも正解です。別のキーでも**度数の地図**が見えていますね。次のキーもこのまま。",
    "全問正解！ 黒鍵のキーでも**I の位置**を基準に迷わず動けています。",
  ],
  "7": [
    "5問とも正解です。ベースの聴き取りとコード感がしっかり結びついています。",
    "全問正解！ **響きの性格**だけで進行を掴めるようになってきました。",
  ],
  "8": [
    "5問とも正解です。**足した 1 音の彩り**がきれいな響きになって鳴っています。",
    "全問正解！ 土台とテンションのバランスが安定してきました。次の 5 問へ。",
  ],
  capstone: [
    "5問ともクリアです。これまで積んだ形が**実戦の速さ**で引き出せています。",
    "全問パーフェクト！ 次の区切りも**流れを止めずに**いきましょう。",
  ],
};

/** FNV-1a (32 bit); the same text always picks the same variant. */
export function variantHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function fillTip(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\$\{([A-Za-z]+)\}/g, (_match, key: string) => String(values[key] ?? ""));
}

/**
 * The tip for one break. `undefined` means "use the level's existing one-liner" (a diagnosis that needs
 * no words of its own), so the caller keeps `tipFor` as the fallback.
 */
export function advancedTipFor(
  diagnosis: AdvancedDiagnosis,
  level: AdvancedCourseLevel,
  round: number,
  itemId?: string,
): string | undefined {
  if (diagnosis.values === undefined) return undefined;
  if (diagnosis.kind === "all-correct") {
    const variants = ALL_CORRECT[String(level)] ?? ALL_CORRECT.capstone!;
    const index = variantHash(`${level}|${round}||all-correct`) % variants.length;
    return variants[index]!;
  }
  const variants = VARIANTS[diagnosis.kind];
  if (variants === undefined) return undefined;
  const index = variantHash(`${level}|${round}|${itemId ?? ""}|${diagnosis.kind}`) % variants.length;
  return fillTip(variants[index]!, diagnosis.values);
}
