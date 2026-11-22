# P23-43: 「続きから」の幅・通常時の帯・ガイド練習画面の調整

- ブランチ: `feat/p23-43-resume-width-and-hover`(基点 `78e66064` / P23-42)
- 実装 HEAD: **`06b6ad5e`**
- 状態: **READY_FOR_HUMAN_PRODUCT_ACCEPTANCE**
- 対象: Bass Practice の続きから帯の全幅化、Chord Dojo / Voicing Loop の通常時とホバー、Chord Dojo ガイド練習の文言・重複整理・鍵盤配置・耳の案内。
- 判定・採点・計測・自己確認・再試聴の扱い・進級・保存は変更していない。P23-40 の凍結契約は不変。
- merge / push / tag / release なし。EXE は利用者依頼によりローカルビルド(下記)。

## 1. Bass Practice: 続きからを右端まで

- `BassPracticeHome.tsx`: 続きから帯を `.lv-bh-top` の外へ出し、`data-resume` を持つ独立した行にした。
- `bassPracticeHome.css`: 既存の 2 列グリッドを使い、帯を `grid-column: 1 / -1` の 2 行目に配置。
  - 左端は列 1 の左(従来と同じ)。
  - 右端は「楽器」パネルの右端(列 2 の右)まで。
  - 「続ける」は帯の右端寄り。
  - カードと楽器パネルは同じ 3 行目で上端が揃う。
  - 帯がない場合は `data-resume="false"` で 2 行構成にし、空行を作らない。
  - 1199px 以下は 1 列。帯はその列の幅に収まり、右端は楽器パネルの右端と一致。
- 帯の高さ 56.97px、マーク 30×30、続ける 36px、Enter 10px、紫の hover は P23-41 の仕様を維持。

実測(デスクトップ、帯あり):

| 幅 | 帯 left | 帯 right | 帯幅 | 楽器 right | カード/楽器 top |
|---|---|---|---|---|---|
| 1920 | 256 | 1886 | 1630 | 1886 | 一致(≤1px) |
| 1440 | 256 | 1406 | 1150 | 1406 | 一致(≤1px) |
| 1199(1列) | 列の左 | 楽器の右 | 列幅 | 一致 | 楽器はカードの下 |
| 768(1列) | 列の左 | 楽器の右 | 列幅 | 一致 | 楽器はカードの下 |

- 横 overflow は全幅で 0。続けるクリックと Enter の両方で同じ練習へ戻ることを確認。
- ホバーで紫の枠、ポインターを外すと通常へ戻る。帯の矩形は動かない。

## 2. Chord Dojo / Voicing Loop: 通常時を落ち着かせる

- CD `.dojo-home-p20-resume`: 通常を `--dojo-surface` の暗い背景 + `--dojo-border` の控えめな枠に変更。ティールのマーク/「続きから」/続けるボタンの色は維持。
- VL `.lv-vl-resume`: 通常を `--lv-surface` + `--lv-border` に変更。アクセント一色の通常枠をやめた。
- hover は各モード色:
  - CD: `--dojo-accent` の枠 + surface に accent を 5% 混ぜた背景。
  - VL: `--lv-accent` の枠 + surface に accent を 5% 混ぜた背景。
  - Bass は従来の紫 hover を維持。
- ポインターを外すと通常の枠/背景に戻る。
- `:focus-within` ではなく `:has(:focus-visible)` を帯の強調に使い、マウス操作の focus が残っても帯の強調が残らないようにした。ボタンの `:focus-visible` outline は明瞭に維持。
- 帯の幅・高さ(CD/VL 56.59px)・内容・再開操作は変更していない。

## 3. ガイド練習画面

対象: `GuidedCourseView.tsx` / `guidedCourse.css`。

### 3.1 結果と次の操作
- 入力なし → 「入力がありませんでした」
- 構成音不足 → 「構成音がそろっていません」
- 2 択の選択違い → 「選択が違います」
- 上記は結果確定後に「次へ」で次の問題へ進む。**「もう一度弾いてください」「もう一度選んでください」は付けない**。
- invalid(無効試行)だけ「この回答は記録していません。もう一度弾いてください」と表示し、次の button を「もう一度」にして同じ問題へ再 arm する。回答は追加記録しない。

### 3.2 MIDI と戻る操作
- MIDI 接続状態・設定は共通ヘッダーに集約。
- 未接続時は操作の近くに **「自己確認です。進級判定には含まれません」を一度だけ** 表示。課題文の「MIDI 未接続のため…」は削除。
- 画面内の重複していた「終了」を削除。ヘッダーの戻る「Chord Dojo」1 つにまとめた。
- 結果/待機の「Chord Dojo へ戻る」は、その画面の主操作として必要な場合だけ残す。

### 3.3 鍵盤
- 鍵盤ラベルと鍵盤を課題と同じ中心線に配置。`.gc-keyboard-body` で中央寄せ。
- 鍵盤は 128px 高さを維持し、比率を無理に変えない。幅は最小 450px 以上で確認。
- 768×640 は gap 8px、padding 8/12、課題 padding 12 に整理。ページの自然な縦 scroll を許容し、内部多重 scroll / clip / 横 overflow を出さない。

### 3.4 耳の案内
- 選択肢あり: 「和音を聴き、メジャーかマイナーを選んでから弾いてください」
- 選択肢なし: 「和音を聴いて、同じ和音を弾いてください」
- 再生状態(「再生中」「弾いてください」)と「もう一度聴く」を課題領域内に配置。
- 再試聴がヒント扱いになる案内をボタンの近くに一度だけ表示。上限があるようには書かない(現行実装に上限はない)。
- 答えの構成音は鍵盤に表示しない。

## 4. 確認

| 対象 | 結果 |
|---|---|
| P23-43 E2E(全幅・1列・hover/leave・click/Enter) | **3/3 PASS** |
| P23-42 コース UI E2E | **5/5 PASS** |
| P23-40 コース E2E | **5/5 PASS** |
| 関連 UI(P23-43/42/40/41/36/37/29) | **38/38 PASS** |
| 通常 practice/home(p12-1/p23-27/accessibility/p20/p22-01) | **80/80 PASS** |
| コース unit + guidedCourse domain | **32/32 PASS** |
| visual | **6/6 PASS** |
| App / E2E TypeScript | PASS |
| ESLint / class lint / source contracts | PASS |
| production build | PASS |
| phase docs / AI handoff / git diff --check | PASS |
| fresh FULL | **未実行**(限定 UI タスク。前 HEAD の FULL を流用しない) |

- 既存テストの変更は P23-40/P23-42 の画面仕様に合わせた参照(`course-end` → ヘッダー `dojo-back`、自己確認の文言、耳の案内)のみ。
- ガイド練習の出題・採点・計測・保存・進級・再試聴の処理は変更していない。

## 5. 画像

- Bass: [1920](p23-43-assets/bass-resume-1920.png) / [1440](p23-43-assets/bass-resume-1440.png) / [1199](p23-43-assets/bass-resume-1199.png) / [768](p23-43-assets/bass-resume-768.png)
- CD 通常: [1440](p23-43-assets/cd-resume-normal-1440.png) / VL hover: [1440](p23-43-assets/vl-resume-hover-1440.png)
- コース: [名前 1440](p23-43-assets/name-1440.png) / [名前 768](p23-43-assets/name-768.png) / [耳 1440](p23-43-assets/ear-1440.png) / [耳 768](p23-43-assets/ear-768.png) / [結果 1440](p23-43-assets/result-pass-1440.png) / [結果 768](p23-43-assets/result-pass-768.png) / [待機 1440](p23-43-assets/wait-1440.png) / [完了 1440](p23-43-assets/finished-1440.png) / [破損 1440](p23-43-assets/error-1440.png)
- 画像の人間目視は Human Acceptance に残す。実機 MIDI・実音の聴取は未確認。

## 6. EXE

利用者依頼により `tauri build --no-bundle` でローカル EXE をビルド。

- ファイル: `src-tauri/target/release/loop-vault.exe`
- SHA-256: `3225039E11FCE401FA713BB94DE95F252B4B5EAF5D72E872C0D41B221D40960E`
- ビルド日時: `2026-11-17 20:59`
- 署名なし・インストーラなし。merge / push / tag / release はしていない。

## 7. 変更ファイル

- `src/features/bass-practice/ui/BassPracticeHome.tsx`
- `src/features/bass-practice/ui/bassPracticeHome.css`
- `src/styles/voicing-loop.css`
- `src/views/chord-dojo/dojoHome.css`
- `src/views/chord-dojo/GuidedCourseView.tsx`
- `src/views/chord-dojo/GuidedCourseView.test.tsx`
- `src/views/chord-dojo/guidedCourse.css`
- `e2e/p23-40-guided-course.spec.ts` / `e2e/p23-42-guided-course-ui.spec.ts`
- `e2e/p23-43-resume-width-and-hover.spec.ts`(新規)
- `docs/reports/p23-43-assets/*.png`
- この報告
