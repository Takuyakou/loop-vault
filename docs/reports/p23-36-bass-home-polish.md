# P23-36:Bass Practice ホームUIの小修正(楽器パネルの位置・続けるの Enter・カードのホバー枠)

- ブランチ:`feat/p23-36-bass-home-polish`
- 基点:`93793fb4`(P23-35 系統の最新。理由: 同じ P23 作業系統で、Bass Practice のホームは P23-35 の変更ファイルと重ならないため)
- コミット:`1e33cd66`(製品・テスト) / この報告
- 結果:**3 点とも実装・検証済み**。既存の練習・判定・録音・保存仕様、楽器設定の内容・保存・適用は変更していない。merge / push / tag / release は未実行。

## 1. 「楽器」パネルの縦位置

### 変更

固定の margin や空要素は使わず、**同じグリッドの行に乗せる**構造にした。

- `.lv-bh` を 2 列 × 2 行のグリッドにした(`grid-template-rows: auto 1fr`)。
- 上段(1 行目・左列)を `.lv-bh-top` にまとめた:説明行、「?」(ヘルプ)、「続きから」、**「聴いてまねる」の見出し**。
- 2 行目を共有行にした:左列 `.lv-bh-main`(カードと MIDI カード)、右列 `.lv-bh-aside`(**「楽器」→「この 7 日」**)。
- 1 列表示(≤1199px)では `grid-row: auto` に戻し、上段 → カード → 楽器 → この 7 日 の順に流す。上余白は作らない。
- 「この 7 日」は従来どおり楽器パネルの下(同じ aside の中)。

### 確認(ブラウザ実測)

`楽器` パネルの上端と `Degree Echo` カードの上端の差が **1px 以内**であることを、次の条件で確認した。

- 1920×1080 / 1440×900 / 1200×900(2 列)
- ヘルプ閉・開の両方
- 「続きから」なし(1920/1440/1200)と**あり**(同じ 3 幅。実際に Degree Echo を 1 回完了して記録を作成)
- パネルが上部領域(説明・続きから)より下にあること、`この 7 日` がパネルの下にあること
- 1199×900 / 768×640 の 1 列:パネルがカード領域の直後(行間 10px 以内)にあり、不自然な上余白がないこと、横 overflow がないこと

## 2. 「続ける」の Enter 表示・操作

### 変更

- 「続ける」ボタンに Chord Dojo ホームと同じ形式の `<span class="lv-bh-enter-key" aria-hidden="true">Enter</span>` を追加(CSS も `.dojo-home-p20-enter-key` と同じ形。新しい色は足していない)。
- ホームに window の `keydown` を追加し、**Chord Dojo ホームと同じ契約**にした:
  - `Enter` 以外・`repeat`・`isComposing` は無視
  - `[role=dialog]` があるときは無視
  - イベントの target と `document.activeElement` が `input/select/textarea/button/a/summary/[contenteditable]` の中なら無視(入力欄・select・別ボタンの Enter を奪わない)
  - 「続きから」が無いときは何もしない
  - 発火時は `preventDefault()` して、**クリックと同じ `onOpen(mode)`** を 1 回だけ呼ぶ
- ホームは練習の背後でもマウントされたままなので、`active={showHome}` を追加し、**ホームが前面のときだけ**購読する。画面を離れる/アンマウントで listener を解除する。

### 確認

- ユニット(jsdom): Enter で 1 回だけ開く/ボタンと同じ mode/続きなし・active=false・repeat・IME・dialog・input/select/ボタン focus では開かない/アンマウント後に発火しない/Enter 表示が aria-hidden。
- ブラウザ:実際に Degree Echo の記録を作り、
  - 弦の「5 弦」に focus して Enter → 設定だけが変わり練習は開かない
  - 本文で Enter → Degree Echo が 1 回開く
  - 練習が前面のまま Enter → 何も起きない(背後で二重に開かない)
  - 戻って「続ける」クリック → 同じ Degree Echo が開く

## 3. 練習カードのホバー枠

- `.lv-bh-card:hover` の枠色を `#33496a`(青灰)から **`var(--bh-accent)`** に変更した。値は Bass Practice 既存の紫(`--bp-accent` → `--bh-accent`、`#a79cff`)で、新しい固定色は増やしていない。
- 枠は `box-shadow: inset` のままなので、**サイズ・位置は変わらない**(ブラウザで hover 前後の x/y/width/height と transform を比較)。
- `:focus-visible` の outline は既存のまま(キーボードで Tab してカードに到達し、outline 2px を確認)。
- `prefers-reduced-motion: reduce` でも枠は紫になる(動きだけを止める既存の作りを維持)。
- 楽器設定の選択色など、指定外の配色は変更していない。

## 4. 変更ファイル

- `src/features/bass-practice/ui/BassPracticeHome.tsx`
  - 上段/共有行/右パネルの構造、Enter の契約、`active` プロパティ、Enter 表示
- `src/features/bass-practice/ui/bassPracticeHome.css`
  - グリッドの行と配置、1 列時の解除、Enter 表示の形、ホバー枠の色
- `src/features/bass-practice/ui/BassPracticeModeView.tsx`
  - `active={showHome}`(ホームが前面のときだけ Enter を購読)
- `src/features/bass-practice/ui/BassPracticeHome.test.tsx`
  - H16–H20(Enter の契約、表示、解除)
- `e2e/p23-36-bass-home.spec.ts`(新規)
  - 位置合わせ(1920/1440/1200、続きあり/なし、ヘルプ開閉)、1 列(1199/768)、Enter/クリック、ガード、ホバー/focus-visible、設定・overflow・axe

## 5. 検証結果

- ユニット: `BassPracticeHome.test.tsx` **20/20 PASS**、`src/features/bass-practice/ui` 全体 **124/124 PASS**。
- 新規 E2E `e2e/p23-36-bass-home.spec.ts`:**7/7 PASS**。
- 関連回帰:
  - `e2e/p23-25-bass-practice.spec.ts` + `e2e/p23-28-bass-frame.spec.ts` **14/14 PASS**
    (既存 C6 は `.lv-bh-column` を 2 つ測る作りだが、main と aside に同じクラスを残したため変更なしで通る)
  - `e2e/phase5.16-production-activation.spec.ts` + `e2e/phase5.16.1-degree-echo.spec.ts` **9/9 PASS**
- FEATURE(変更ファイル指定、fresh):**PASS** — App TypeScript / source contracts / class lint / changed ESLint / Vitest 97 / Playwright 52。
- UI(`e2e/p23-36-bass-home.spec.ts`、fresh):**PASS** — 7/7。
- app / e2e の TypeScript、`npm run lint`、production build:すべて PASS。
- FULL:今回の小修正では実行していない(既存の運用規定では FULL は merge candidate の段階で 1 回。本タスクは merge を行わず、指示も focused/UI と型・lint まで)。未実行であることを明記する。

## 6. スクリーンショット(変更前後)

`p89-generated/p23-36/`(無視対象。リポジトリにはコミットしない)

| 条件 | 変更前 | 変更後 |
|---|---|---|
| 1440×900・続きなし | `before-1440-plain.png` | `after-1440-plain.png` |
| 1440×900・ヘルプ開 | `before-1440-help.png` | `after-1440-help.png` |
| 1440×900・続きあり | `before-1440-resume.png` | `after-1440-resume.png` |
| 1920×1080・続きあり | `before-1920-resume.png` | `after-1920-resume.png` |
| 1200×900・続きあり | `before-1200-resume.png` | `after-1200-resume.png` |
| 768×640・続きあり | `before-768-resume.png` | `after-768-resume.png` |

- 差分の要点:変更前は「楽器」パネルの上端が説明行の上端に合っていた。変更後はカードの上端に合う(上の実測で 1px 以内)。「続きから」の有無・ヘルプ開閉・文言の折り返しでも同じ。
- 画像の目視評価は行っていない(自動テストの実測値で確認)。スクリーンショットは利用者が確認できる形で残した。

## 7. 制限

- 実機 MIDI・録音・音の確認はしていない(今回の変更は UI 配置・キー・色のみ)。
- スクリーンショットの見た目の最終判断は利用者の確認に委ねる。
- merge / push / tag / release は行っていない。FULL は未実行。
