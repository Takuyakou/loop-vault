# P23-37:Bass Practice Home UI / Motion Polish

- ブランチ:`feat/p23-37-bass-home-motion-color`
- 基点:`ec4d9022`(P23-36 の報告まで。P23-36 の製品変更 `1e33cd66` を含む)
- 検証したコード HEAD:`a5192fc3`(実装・テスト)。この報告のみ後続 commit。
- 結果:承認された 4 項目を確認し、**P23-36 で未対応だった 3.2 MIDI モーション・4.1 楽器設定の紫・4.2 自己評価バッジの紫**を実装した。P23-36 の 1(位置)・2(Enter)・3.1(紫ホバー枠)は既存のまま維持し、再実装していない。判定・録音・音声・保存 schema・出題・ガイドは変更していない。merge / push / tag / release / EXE 生成は行っていない。

## 1. 楽器パネルの位置(P23-36 を確認・維持)

- 変更なし。2 列では説明・ヘルプ・続きから・グループ見出しが 1 行目、カードと「楽器」が同じ 2 行目に載る構造のまま。1 列では余白を残さない配置のまま。
- 回帰: `e2e/p23-36-bass-home.spec.ts` の位置テストを含む 7 件 PASS(後述)。1920/1440/1200 と 1199/768、続きあり/なし・ヘルプ開閉の上端差 1px 以内は既存の実測を再実行して維持を確認。

## 2. 「続ける」の Enter(P23-36 を確認・維持)

- 変更なし。Enter 表示、ホーム前面時のみ購読、target/activeElement のガード、続きなし・IME・repeat・dialog の除外、クリックと同じ `onOpen` を 1 回だけ、離脱時の解除はそのまま。
- 回帰: P23-36 の Enter テストを含む 7 件 PASS。

## 3. カードのホバーと MIDI モーション

### 3.1 共通の紫ホバー枠(P23-36 を確認・維持)

- 変更なし。全カードの hover は `box-shadow: inset 0 0 0 1px var(--bh-accent)`。サイズ・位置は不変、`focus-visible` は 2px outline のまま。P23-36 のブラウザテストで確認済み。

### 3.2 MIDI のベースライン(今回の実装)

- 現状確認: 従来も `lv-bh-ok`(小さなチェック)の点灯はあった。全くの未実装ではなく、動きとしては弱かった。今回、既存の 2 段ノート図とチェックはそのまま残し、**読み取り線とノートの順次点灯**を足した。
- 実装(すべて SVG 内 + CSS。新しい timer / RAF / ライブラリなし):
  - `<rect class="lv-bh-scan">` を追加。ホバー中だけ `transform: translateX(0 → 180px)` を 2.4 秒で繰り返す(`lv-bh-scan`)。
  - 既存のノート 14 個に `lv-bh-note` を付け、線が届く時刻に合わせた `animation-delay` を inline で持たせた(46px 地点を 0 秒、75px/秒)。各ノートは `brightness(1) → 1.9 → 1.2 → 1` の控えめな点灯(`lv-bh-note`)。
  - どちらも `@media (prefers-reduced-motion: no-preference)` の中の `:hover` でのみ動作。離れると animation が外れ、線は `opacity: 0`、ノートは `filter: none` の初期状態へ戻る。
  - reduced-motion では移動・点滅なし。紫のホバー枠だけが残る。
  - 図は装飾のみ。音声再生・録音・採点・履歴・保存の呼び出しを追加していない。文字やカードの geometry は変えていない。
- 実測(1440×900、`e2e/p23-37-bass-home-motion-color.spec.ts`):
  - hover 中: `lv-bh-scan` の animation が running、transform が時間で変化(500ms 時点で `matrix(1,0,0,1,38.75,0)`、400ms 後に別値)。ノート 14 個が `lv-bh-note`、delay は 4 種類以上、`お手本`/`録音` の 2 段が残る。
  - mouseleave 後: scan は `opacity 0` / `transform none` / animation 0、ノートは `filter none` / animation 0。
  - reduced-motion: animation 0、scan opacity 0、ホバー枠は紫。
  - hover 前後でカードの box は不変、ホームのまま(練習は開かない)、`loop-vault:practice-v1:data` も不変、横 overflow なし。

## 4. 紫系配色の統一

### 4.1 楽器設定の選択状態(今回の実装)

- 対象: ホームの「弦」「利き手」「フレット」の選択済みボタン。
- 背景 `var(--lv-accent)`(ティール `#42d8c6`)→ **`var(--bh-accent)`**(`--bp-accent` の紫 `#a79cff`)、文字 **`var(--bh-on-accent)`** に変更。`--lv-accent` 自体は変更していない。
- 非選択は透明のまま、disabled の既存扱い・`:focus-visible` の outline は変更なし。色の切り替えは `background-color / color 0.16s`、reduced-motion では transition なしで即時。
- 指板(弦数・左右反転・範囲)と保存値の扱いは変更していない。
- 実測: 選択中の背景 `rgb(167,156,255)`、文字 `rgb(23,18,58)`、transition `background-color 0.16s, color 0.16s`。非選択は `rgba(0,0,0,0)`。キーボード(5 弦に focus → Enter)でも切り替わり、指板は 5 弦、左利き反転、フレット 5〜17 が反映。練習画面へ入って戻っても 3 つの選択が保持された。横 overflow なし。

### 4.2 自己評価バッジ(今回の実装)

- 対象: 練習上部の「自己評価 · 自動採点ではありません」バッジ(弦数等の設定ではなく、ホームから各練習を開いたときの帯)。
- 原因の確認: 文字と枠は既に紫(`#c6b9ff` / `#594989`)だったが、背景は `--lv-accent-soft`(ティール `#123b3a`)が残り、**青緑の背景 + 紫の枠**の混在になっていた。
- 変更: このバッジ(`[data-midi-feedback="false"]`)の背景だけを **`var(--bp-accent-soft)`(`#2a2550`)** にした。文言・pill 形状(`border-radius: 999px`)・表示条件・配置・サイズは変更なし。文字/枠の色は既存の紫のまま。
- 自動判定する MIDI のバッジ(「弾き終わってから自動で判定（目安）」)は**変更していない**。実測: 自己評価 `background rgb(42,37,80)` / 文字 `rgb(198,185,255)` / 枠 `rgb(89,73,137)` / radius `999px`。MIDI は従来どおり `background rgb(18,59,58)` / 文字 `rgb(66,216,198)`。
- 共通 badge や他画面の配色は変更していない。説明文への置換・バッジ削除はしていない。

## 5. 変更ファイル

- `src/features/bass-practice/ui/BassPracticeHome.tsx`
  - MIDI の図に読み取り線とノートの点灯用クラス/遅延を追加(既存の図・チェックは維持)
- `src/features/bass-practice/ui/bassPracticeHome.css`
  - 楽器設定の選択色と transition、MIDI の scan/note アニメーション、reduced-motion の扱い
- `src/features/bass-practice/ui/bassPractice.css`
  - 自己評価バッジの背景を紫 soft に変更(セレクタを限定)
- `e2e/p23-37-bass-home-motion-color.spec.ts`(新規)
  - 楽器設定の紫・キーボード・保持、バッジの紫と MIDI 非変更、MIDI モーションと停止・reduced-motion・非干渉

既存テストの期待値変更はしていない(skip / retry / timeout / snapshot 更新なし)。

## 6. 検証(検証 HEAD `a5192fc3`)

- focused ユニット: `src/features/bass-practice/ui` **124/124 PASS**。
- 新規 E2E: `e2e/p23-37-bass-home-motion-color.spec.ts` **3/3 PASS**。
- P23-36 回帰 + 関連: `e2e/p23-36-bass-home.spec.ts` + `e2e/p23-25-bass-practice.spec.ts` + `e2e/p23-28-bass-frame.spec.ts` **21/21 PASS**。
- FEATURE(変更ファイル指定、fresh): **PASS** — App TypeScript / source contracts / class lint / changed ESLint / Vitest 97 / Playwright 52。
- UI(新規 spec、fresh): **PASS** — 3/3。
- app / e2e TypeScript・`npm run lint`・production build:**PASS**。
- **FULL:未実行**。今回の独立した UI 小修正では fresh FULL を必須としない指示のため。最終統合時の FULL は別途扱う。FULL PASS とは書かない。

## 7. 画面のスクリーンショット(Git に入れない)

`p89-generated/p23-37/`

| 画面 | ファイル |
|---|---|
| ホーム通常 1440×900 | `home-1440-normal.png` |
| MIDI カード hover(700ms / 1500ms)1440×900 | `home-1440-midi-hover-700ms.png` / `home-1440-midi-hover-1500ms.png` |
| 楽器設定を選択した状態 1440×900 | `home-1440-selected.png` |
| 同 1920×1080 | `home-1920-selected.png` |
| breakpoint 前後 1200×900 / 1199×900 | `home-1200-selected.png` / `home-1199-selected.png` |
| 同 768×900(1 列) | `home-768-selected.png` |
| 自己評価バッジ(Degree Echo)1440×900 | `degree-badge-1440.png` |
| MIDI のバッジ 1440×900 | `midi-badge-1440.png` |

- 画面の目視による最終判断は行っていない(自動テストの実測と、残した画像で確認できる形にしている)。

## 8. 未実行・制約

- 実機 MIDI・録音・音の確認はしていない(今回の変更は表示・色・CSS モーションのみ)。
- スクリーンショットの見た目の最終判断は利用者の確認に委ねる。
- FULL 未実行(上記)。merge / push / tag / release / EXE 生成は行っていない。
