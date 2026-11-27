# P23-42: ガイド練習画面の UI/UX 修正

- ブランチ: `feat/p23-42-guided-course-ui`(基点 `f8d9bf7e` / P23-41。P23-41 のホーム修正とは別ブランチ)
- 実装 HEAD: **`dff790e4`**(この報告の前の commit)
- 状態: **READY_FOR_HUMAN_PRODUCT_ACCEPTANCE**
- 設計元: 外部 `review/P23-40-guided-course-ui-review.md`。利用者の「これもやってほしい」で着手し、P23-41 のホーム scope には混ぜていない。
- merge / push / tag / release / EXE なし。P23-40 の判定・採取・保存・進級・翌日条件・course store は変更していない。

## 1. 変更したこと(レビューの Before → After)

| Before | After |
|---|---|
| コード名が 26px の小カードで左端。上部にも同じ名前 | 中央の課題領域でコード名を最大(desktop 60px、狭幅 44–48px)。ヘッダーは「ガイド練習 · Lv1」と課題種別だけ |
| 「同日」「遅延確認」「記名」「独立」 | 「今日の確認」「日をあけた復習」「コード名から弾く」「聴いて弾く」「ヒントなしで正解」など行動の言葉 |
| カードクリックとお手本 button が同じ操作 | 課題表示は非クリック。お手本/再試聴は明示 button に集約 |
| お手本・自己確認 2 つ・次へ・終了が同じ強さ | 入力中は次へ disabled、確定後は次へ primary。MIDI なしは「弾けた/まだ難しい」の回答 2 択。終了はヘッダー |
| 説明・入力待ち・カード・操作が上部に密集 | ヘッダー → 課題 → 判定 → 操作 → 鍵盤の 5 領域 |
| 全状態に 42px ヘッダー等の固定 grid | 問題/結果/待機/エラーを共通外枠の自然高さで分離 |
| 結果の一部条件で戻る button が 2 つ | 主操作 1 つ + 戻る 1 つ |
| 完了時に「全10Lvの達成ではありません」 | 「基礎コース Lv1〜3 を終えました」 |

## 2. 画面の固定設計(実装)

### ヘッダー
- 左: 戻る「Chord Dojo」。中央: `ガイド練習 · Lv1` + 能力名(メジャーとマイナー / 4種類のセブンス / 12キーで引き出す)+ 課題種別。右: `1 / 30問`、MIDI 状態、MIDI 設定、終了。
- コード名の重複、装飾的なステップ数字、最下部の終了 button を削除。終了先と保存の意味は不変。

### 課題領域
- 既存の小カードを置換。sidebar を除く content 幅の中央に、枠・surface・radius 14 の課題領域。
- 名前課題: `コード名から弾く` + コード名を最大表示。`overflow-wrap:anywhere` で長い slash/extension も clip しない。
- 耳課題: `聴いて弾く` + **根音だけ**。quality / 答えの鍵盤 / 楽譜 / 名前を出さない。音声の「再生中/弾いてください/聴いてください」を表示。
- Lv1 の 2 択(メジャー/マイナー)は課題領域内に同じ大きさで表示。判定は不変。
- 課題領域は desktop 190px、狭幅 150px。viewport 比例で巨大化させず、鍵盤を縦に引き伸ばさない。
- 入力欄の focus は指示文へ(`tabIndex=-1`、preventScroll)。

### 判定と操作
- 課題直下に 1 行の結果領域(`role=status`, `aria-live=polite`)を常時予約。
  - 通常「演奏を待っています」/ 正答「合っています」/ 誤答は既存判定の短い説明 / incomplete・no-input は再入力の説明 / invalid「この回答は記録していません。もう一度弾いてください」。
- 入力中: MIDI ありは演奏が主操作、お手本は補助、次へは disabled。確定後は次へ primary。自動進行なし。
- invalid: 同じ問題へ再 arm。 button 文言は「もう一度」。回答は追加記録しない。
- MIDI なし: 「弾けた」「まだ難しい」を回答 2 択として並べ、`自己確認・進級判定には含みません` を一度表示。自己確認を正式合格と表示しない。
- ヒント後: `お手本を使用しました（ヒントあり。独立確認にはなりません）` を小さく表示。お手本/再試聴がヒントになることを操作の近くに明記(再試聴上限は現行実装にないため、上限があるようには書かない)。
- 入力採取・開始時計・音声終了・自動再生・判定確定のロジックは変更していない。画面表示の遅延アニメーションも入れていない。

### 鍵盤
- 下段の既存 neutral-monitor を維持。押している音だけ。答えの構成音・音名・allowed/required pc を追加しない。
- 高さ 128px 固定。`PracticeKeyboard` 本体は変更せず、比率・白黒鍵の関係を保つ。

### 結果/待機/エラー
- 問題画面の grid を流用せず、共通外枠 `.gc-panel` の自然高さ card。
- 結果: `今日の確認の結果` / `日をあけた復習の結果`、課題別正答数、次の行動。生の理由配列は `<details>詳しい理由</details>` に畳む。
- 正式レベル合格(日をあけた復習まで完了)と、当日確認の合格を別の見出しで表示。自己確認・ヒントありを明示。
- 待機: 「今日の確認は終わりました」「次の復習: ○月○日 ○時以降」。翌日かつ 12 時間以上の理由を 1 文。自由練習/次レベル解放を偽装しない。
- Lv3 完了: 「基礎コース Lv1〜3 を終えました」。Lv4 以降/全10Lvの達成を表示しない。
- 保存エラー/破損: 明瞭なエラー、元データ保持、既存の隔離操作。自動リセットしない。

## 3. レスポンシブ実測

| 幅 | ヘッダー高 | 課題高 | コード名 | 鍵盤 | ページ |
|---|---|---|---|---|---|
| 1920×1080 | 60 | 190 | 60px | 128px | 988px / 1080(スクロールなし) |
| 1440×900 | 60 | 190 | 60px | 128px | 808px / 900(スクロールなし) |
| 960×1032 | 60 | 190 | 44.16px | 128px | 890px / 1032(スクロールなし) |
| 768×640 | 104(2 行) | 150 | 48px | 128px | 781px / 640(自然なページ scroll) |

- 全幅で横 overflow 0、葉テキストの clip 0。768 の鍵盤見出しは wrap し、子要素の重なり 0。
- 768 はホームカードが折り返し下にあるため、コース mount 時に `#main-content.scrollTop = 0` へ戻し、ヘッダー(戻る/レベル/進捗)が画面内から始まることを確認(head top 152px)。
- 結果 panel: 1440 で 222px、768 で 218px(自然高さ、内部 scroll なし)。
- 1440 固定要件にしていない。狭幅はページの自然な縦 scroll を許容し、内部多重 scroll / clip / 横 overflow / 極小文字を出していない。

## 4. 状態と非開示

確認した状態:
- 名前課題 / 耳課題(根音のみ、2 択、再生中/弾いてください)/ 入力待ち / 自己確認「弾けた」「まだ難しい」/ ヒント後 / 正答 / 誤答 / incomplete / no-input / invalid。
- 結果: 当日失敗、当日合格、翌日待ち、日をあけた復習の正式合格、Lv1〜3 完了、保存破損。
- 4 サイズ、axe(critical/serious 0)。

正解非開示:
- 課題表示は `<section>` で click 不可。`data-answer` / `data-required` / `.dojo-answer-swatch` を持たない。
- 耳は根音と許可された 2 択だけ。quality 名・reference notes・楽譜を DOM/aria/title に出さない。
- 鍵盤は neutral-monitor + `concealNoteNames`。答えの構成音を追加していない。
- 単に CSS で隠すのではなく、要素自体を描画しない。

## 5. テスト

| 対象 | 結果 |
|---|---|
| コース unit(GuidedCourseView + guidedCourse domain) | **32/32 PASS**(view 7 + domain 25) |
| P23-42 コース UI E2E | **5/5 PASS** |
| 既存 P23-40 コース E2E | **5/5 PASS** |
| 関連 UI(p23-42 / p23-40 / p12-1 / p23-27 / accessibility) | **55/55 PASS** |
| 追加ホーム/Bass 回帰(P23-41/p23-36/p23-37 を含む) | **64/64 PASS** |
| App / E2E TypeScript | PASS |
| ESLint / class lint / source contracts | PASS |
| production build(tsc + vite) | PASS |
| phase docs / AI handoff / git diff --check | PASS |
| fresh FULL | **未実行**(限定 UI タスク。前 HEAD の FULL を今回の PASS として流用しない) |

- 既存テストの期待値変更は P23-40 E2E の文言・進捗表記(`2 / 30` → `2 / 30問`、自己確認の文言)だけ。
- 通常 Chord Dojo の共通 PracticeFrame は変更していない。p12-1・p23-27・home/accessibility の既存回帰が PASS。

## 6. 画像

- 4 幅(通常): [1920](p23-42-assets/name-1920.png) / [1440](p23-42-assets/name-1440.png) / [960](p23-42-assets/name-960.png) / [768](p23-42-assets/name-768.png)
- 状態: [耳 1440](p23-42-assets/ear-1440.png) / [耳 768](p23-42-assets/ear-768.png) / [当日失敗](p23-42-assets/result-fail-1440.png) / [当日合格](p23-42-assets/result-pass-1440.png) / [当日合格 768](p23-42-assets/result-pass-768.png) / [正式合格](p23-42-assets/result-formal-1440.png) / [待機 1440](p23-42-assets/wait-1440.png) / [待機 768](p23-42-assets/wait-768.png) / [Lv1〜3 完了](p23-42-assets/finished-1440.png) / [破損](p23-42-assets/error-1440.png)
- 画像の人間目視は Human Acceptance に残す(自動では DOM 実測・overflow・axe・ピクセルではなく要素配置まで確認)。実機 MIDI・実音の聴取は未確認。

## 7. 変更ファイル

- `src/views/chord-dojo/GuidedCourseView.tsx`(表示の再構成。判定/採取/保存のロジックは不変)
- `src/views/chord-dojo/guidedCourse.css`(新規。course scope のレイアウト)
- `src/views/chord-dojo/ChordDojoView.tsx`(course section の `data-practice-frame` を外す)
- `src/views/chord-dojo/chord-dojo.css`(旧 course grid の削除)
- `src/views/chord-dojo/GuidedCourseView.test.tsx`(表示の契約を追加)
- `e2e/p23-40-guided-course.spec.ts`(文言・進捗)
- `e2e/p23-42-guided-course-ui.spec.ts`(新規)
- `docs/reports/p23-42-assets/*.png`
- この報告

## 8. 制約

- merge / push / tag / release / EXE / P23-43 以降なし。
- P23-40 の凍結済み学習契約(判定、正解 policy、速度、翌日+12h、store、進級)は不変。
- §5 の学習設計上の課題(練習から試験への導線)は今回の UI 修正に含めていない。正解の提示や練習問題を追加していない。
