# Chord Dojo — 長尺進行の最終保護・自分の進行UI

## 判定

- 作業ブランチ：`fix/chord-dojo-no-split`。開始時 `54c84a4122a92c037559f04bf29fa0005ba239b8`、開始時working tree clean。
- 最終コード／fresh FULL／EXEのsource HEAD：`f29db0a59a12369d655c0fa523fc4512ba0a5654`。
- Dojoの修正・関連検証・独立レビューは完了。**repository-wide fresh FULLはFAIL。現時点ではマージ不可。**
- Vitest **4,468/4,468 PASS**。Playwright **602 PASS / 1 FAIL / 0 UNRUN**。失敗はBass Practiceの公開合成録音テスト1件で、Dojoの追加8件はすべてPASS。
- masterへのmerge、push、tag、releaseは行っていない。

Gitを正とする。このworktreeのPhase 12 README／execution-stateは過去のMaster候補・別ブランチを記述している。今回の限定作業はこの報告を再開位置とし、Phase 12全体の完了状態へ書き換えていない。local masterは`7a3d432a`のまま。取得済みorigin/masterはlocal masterより167commit後方で、fetch／同期していない。

## 1. 実コード監査とUI変更前後

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 一覧の名前 | アイデア名、raw memo、旧「練習範囲1」を連結 | 保存名／アイデア名を主タイトルにし、2行省略。完全な表示名はtitle・詳細で確認 |
| 解析情報 | memoの警告IDが見出しに混ざる | 既存`splitProgressionMemo`契約で既知の警告IDを分離。詳細で既存の日本語表示 |
| ユーザー名 | 連結されて長くなる | `ユーザー名 ambiguous-bass を含む進行`等の自由文字列は保持。元のVault・正式名称は変更しない |
| 小節 | 「練習範囲1（保存内…）」 | 「全N小節」。詳細に保存内の相対座標と元の座標を分離 |
| 全体練習 | 他の操作と同格の「これを練習する」 | 目立つ「全体を練習する」。全コードを順序どおり使用 |
| 区間入力 | 全カードで常時表示 | 「区間を選んで練習」でカードごとに開閉 |
| テーマ | disabledの理由がない | 「今日のレッスンを終了すると選べます」。最大8小節・予算／確認枠の条件は詳細に記載 |
| 列幅 | viewportによる固定3／2／1列 | カードの実幅を基準にauto-fit。最大3列、最小目安290px。狭幅では1列 |

### 名称と出典

`savedBlockMemo`等の既存保存契約は、解析警告IDをmemoへ`; `区切りで保存する。`collectVault`がそのraw memoを保存名として見出しへ連結していたのが混雑の一因だった。今回は既存のメモ分離を表示投影に利用する。ユーザーが付けた名前の一部分をwarning文字列だからという理由で削らない。Vaultへの書き込み、検索対象、内部ID、`progressionFingerprint`／`vaultKey`の変更はない。

名称がない同一アイデア内の複数blockには表示上の保存進行番号を付け、識別できるようにした。これは保存名の変更ではない。

元MIDI由来を確定できる保存metadataがある場合だけ「元MIDI」と表示する。Text／由来不明では「元の座標」とし、MIDI由来と推測しない。公開fixtureで元の28〜35小節と保存内1〜8小節を別々に確認した。小節範囲は既存の収集処理が求めるイベントの占有範囲を基準とし、先頭・末尾の無音小節を新たに推測していない。

### 区間の操作

開始・終了は整数、保存範囲内、開始≤終了を検証し、不正時は理由付きdisabled。1小節も指定可能。数字を黙って交換・補正しない。空の区間には開始できない。入力・開閉ではVaultを変更しない。

持続するコードの途中小節を選ぶ場合、onsetだけで除外せず、実際のbeat spanと区間が交差するコードを含める。区間用コピーのdurationだけを交差範囲に制限し、source notes・元duration・順序は不変。練習対象と小節カウンターは`progressionEntriesInRange`を共用する。

## 2. テーマレッスンの記録スコープ

### 原因

`session.advance`／`skipTask`のガードは「rangeあり、かつtoday.lessonなし」だけを部分練習としていた。テーマ部分練習にはlessonがあるため、全体keyの`applyAttempt`や`nextCheckAt`更新へ進んでいた。中断時のpending-success flushも`advance`を経由するため同じ問題を持っていた。

### 更新契約

| 練習方式 | 全体習熟度 |
| --- | --- |
| 一覧から全体練習 | 従来どおり更新 |
| 手動区間練習 | 全体範囲を指定した場合も更新しない |
| テーマ部分練習 | 更新しない |
| テーマ全体練習 | 保存範囲の全体包含と固定ターゲットのnotes／identity／duration完全一致を確認できた場合のみ従来どおり更新 |
| テーマの元データが見つからない／変わった／範囲を確定できない | 保守的に全体更新しない |

`isPartialProgression`を成功・失敗・skipで共用。state、keys、recent、nextCheckAt、合格日時等のrecord全体をdeep equalityで確認した。hint→回答や中断時flushも同じガードへ通る。テーマの操作・完了記録は従来どおりtodayへ残す。部分練習の記録欄は「進行全体の習熟度」と明示する。

併せて以下を修正した。

- 最後以外のVault復習でも、予定rangeと同じbounded chordsをfreezeする。従来は予定だけ部分、固定ターゲットは全体になる経路があった。
- `sourceChanged`は全体と部分snapshotを比較せず、同じ範囲を比較する。
- 最大8小節のテーマ範囲に持続音を含める場合、練習用durationを範囲内に制限。長尺の全体練習は制限しない。

テーマを選べない直接のUI条件は長さではなく、開始済みで未完了の今日のレッスン。plannerのfeasibility、時間予算、review枠、課題選択方針は維持した。

## 3. 旧section記録と互換性

従来の`syncVault`は、現一覧にない`vault:…:section:N`へmissingSinceを付け、30日超でprogressionsからdeleteしていた。その後の保存で永続データからも消える処理であり、単なる一覧非表示ではなかった。

今回、旧section keyは同期で変更・削除せず保持する。既にmissingSinceがあるrecordもその値を含めて保持。30日超の同期→Repository save→load→schema parseで履歴全体の一致を検証した。全体keyの記録へ統合・昇格・範囲推定はしない。

`PracticeProgressBadge`は全体keyだけを参照する。旧sectionの合格だけでは全体合格を表示しない。

- Vault v2、Dojo保存schema／fileVersion、Repository、backup／CASの形式は変更なし。
- Vault元データ、実Vault、backup、private MIDI／音声は読まず、変更していない。
- 既に旧アプリで削除された履歴の自動復元は行わない。
- 区間別習熟度の新システム／履歴専用画面は追加していない。保持した旧recordは保存データに残り、全体習熟度としては使わない。

## 4. 画面証跡と実測

公開合成fixtureだけを使用。4/8/12/16/24/32/63/66小節、極長タイトル、警告metadata、ユーザー名に含まれるwarning風文字列、元座標と保存座標の違いを含む。

| viewport | 列数 | カード実幅の例 | 横overflow |
| --- | --- | --- | --- |
| 1168×764 | 3 | 338.7px | なし |
| 1280×720 | 3 | 320px | なし |
| 1920×1080 | 3 | 533.3px | なし |
| 1024×768 | 3 | 290.7px | なし |
| 768×900 | 2 | 314px | なし |
| 375×812 | 1 | 275px | なし |

各幅でcollapsed／expanded／detailsを撮影：`p12-generated/dojo-long-hardening/{width}-{state}.png`、計18枚。geometry JSONも同じ場所。全ページ／カード／ボタンの横overflowなし、区間入力幅100px以上を自動確認。1920の一覧にAxe violationsなし。

親と独立UI reviewerが実画像を確認した。1168の3列、375の区間展開、1920の詳細を重点確認し、操作・入力・タイトルの重なりなし。今回受領した指示本文に画像本体は含まれていないため、元の私的スクリーンショットとのpixel比較ではなく、指定された情報構造と公開合成実画面の確認である。

## 5. 自動テストと独立レビュー

### 検証の経過

- focused domain／view／データ保持：27files、427tests PASS（commit前の最終コード）。最終HEADでは全Vitestに包含。
- 関連E2E：最初の117件は116 PASS、旧分割表示を期待した1件FAIL。そのテストは新しい名前2件と「全体を練習する」を明示検証する形へ更新し、単独再実行PASS。
- 追加UI8件：6サイズ＋区間入力／遷移＋テーマdisabled理由。fresh FULLで全PASS。
- 既存テスト変更：旧連結表示名・操作名の更新、部分テーマが全体合格へ昇格する誤期待の修正。assertionの削除／弱化、skip／fixme、retry追加、snapshot更新なし。
- 独立記録レビュー：全体更新の迂回、30日削除、secondary review freezeを監査。sustainのextent判定漏れを指摘・修正後、未解消P1/P2なし。
- 独立UIレビュー：空の区間、Textへの誤MIDI表示、旧連結名、小節カウンターの不一致を指摘・修正後、画像／6幅geometryも確認し未解消P1/P2なし。

### 最終fresh FULL

実行HEAD：`f29db0a59a12369d655c0fa523fc4512ba0a5654`。`npm run test:full -- --fresh`、PASSキャッシュ不使用。

| Gate | 実測 |
| --- | --- |
| repository ESLint | PASS、12.7秒 |
| class lint / source contracts | PASS、0.6／0.1秒 |
| E2E / App TypeScript | PASS、4.6／16.2秒 |
| phase-doc / AI-handoff | PASS、1.0／0.2秒 |
| privacy/security scan | PASS、1.5秒 |
| production build / gallery exclusion | PASS、10.9／0.2秒 |
| runner contracts | 27/27 PASS |
| Full Vitest | 4,468/4,468 PASS、88.2秒 |
| repository-wide Playwright | 602 PASS / 1 FAIL / 0 UNRUN、1,039.2秒 |
| git diff --check | FULLの失敗後に別途実行、PASS |

初回HEAD `4b9af1d3`のFULLは、新規Axe呼び出しの型チェックで停止した。既存依存でAxeとテストが異なるPlaywright型を参照するため、既存テスト同様のadapter型境界へ1行修正し、`f29db0a5`でFULLを最初からfresh実行した。依存変更なし。

### 残るFULL blocker

`e2e/phase13-1-bass-ui.spec.ts:104`、1440pxの録音結果：期待「余分な音 1」、実測「余分な音 2」。masterでも既に再現し、別ブランチ`fix/p13.1-bass-recording-flake`で調査・修正済みの不安定性と症状が一致する。今回の失敗PCMを再解析して同一原因まで証明したとは扱わない。

開始HEADからBass製品コード／録音helper／該当specへのdiffは0。独立Bass修正はこの候補へ未統合。Dojo作業へ無断で混ぜず、今回のFULL FAILを再実行成功で上書きしていない。独立reviewerもscope分離とFAIL記録を確認した。

## 6. EXE

ユーザーの追加依頼により、FULL終了後に同じsource HEAD `f29db0a5`でTauri offline release／`--no-bundle`を実行、PASS。インストーラーは生成していない。

- `p12-generated/Loop-Vault-Chord-Dojo-f29db0a5.exe`
- x64、24,945,152 bytes。
- SHA-256：`9B146A1196499233C8969D9CAD81E4B24EFAEE5E3A3B5DFA46A6DC6B6F553580`
- build元とコピーのSHA-256一致。gallery／P104・Dojo撮影fixture assetが本番distへ入っていないことを確認。
- source build／temp／出力はDドライブ。実Vaultを開くEXE起動は行っていない。
- **動作確認用candidate。FULL PASS済み配布物／releaseとは扱わない。**

## 7. 保護対象・マージ可否

`feat/p12.5-original-practice`のHEAD `cb2d1b95`、tracked変更なし、既存未追跡成果物を保持。P12.5コードは変更・取り込みしていない。Original Practiceは別view／記録storeであり、今回の`advance`／`skipTask`へ接続していないことを読み取り確認した。ただしこの候補には未統合なので、Original Practiceの実製品経路を今回のFULLで検証済みとは主張しない。

Master／audio／transport／Bass／Vault schemaは開始HEADから変更なし。通常Dojo・Master等、この候補に存在する回帰はFULLで実行した。

**DOJO LONG HARDENING = IMPLEMENTED / REVIEWED**

**FRESH FULL = FAIL — BASS RECORDING TEST BLOCKER**

**MERGE = NOT READY**

新しい区間別履歴の自動マッピング、privateデータによる検証、P12.5の統合は未実施。masterの変更と他Phaseの成果物は保護したまま停止する。
