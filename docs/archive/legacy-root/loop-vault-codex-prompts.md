# Loop Vault — Codex用プロンプト(コピペ用)

使い方:
1. リポジトリに `docs/spec.md`(設計書)を置いてからCodexを開く
2. 各フェーズ開始時に「①マスタープロンプト+②該当フェーズのプロンプト」を連結して貼る
3. フェーズごとにセッションを切り、PRをレビューしてから次へ進む

---

## ① マスタープロンプト(毎フェーズ冒頭に必ず貼る)

```
あなたはこのリポジトリで「Loop Vault」というデスクトップアプリを実装します。
仕様の唯一の正は docs/spec.md です。作業前に必ず全文を読んでください。

## プロダクト概要
作曲ネタの進行管理アプリ。Idea → Loop → Arrange → Mix → Done のパイプラインで曲ネタを管理し、
「今日はこれ」を1つ提示(Focus)、全ネタに Next Action をちょうど1つ紐づけ、放置ネタを自動浮上させる。
月1曲の完成が目標。DAW(FL Studio)のプロジェクトファイルを1クリックで開けることが核体験。

## 技術スタック(変更禁止)
- Tauri v2(plugins: fs, dialog, opener)+ React 18 + TypeScript + Vite
- 状態管理: Zustand / 検証: Zod / テスト: Vitest / スタイル: Tailwind
- データ永続化: appDataDir配下の単一JSONファイル(loopvault/data.json)
  - SQLiteやIndexedDBは使わない。VaultRepositoryインターフェースで抽象化のみ行う
- ネットワーク通信は一切なし。Tauriにネットワーク権限を付与しない。テレメトリ・外部API禁止

## 絶対に守るルール
1. Next Action は各ネタに「ちょうど1つ」。配列・リストにしない。UIは上書き方式
2. 保存ボタンを作らない。操作ごとにデバウンス500msで自動保存+終了時フラッシュ
3. ドメインロジック(ステータス遷移・Focus選定・月間集計・フィルタ)は
   React非依存の純関数として src/domain/ に置き、Vitestテスト必須。
   現在時刻は Date.now() を直接呼ばず引数 now で受け取る
4. ステータス遷移の飛び級(Idea→Mix等)は transition() でエラーにする
5. データ破損時に無言で空データ上書きは絶対禁止。破損ファイルは
   data.corrupt-{date}.json に退避し、バックアップからの復元を提案する
6. 「開く」機能は拡張子ホワイトリスト(.flp .mid .wav .mp3 .flac .zip 等)のみ。
   .exe .bat 等の実行ファイルは open 不可(フォルダで表示のみ)
7. docs/spec.md §3.3「作らない機能」に手を出さない
   (AI提案・音声解析・クラウド同期・波形プレビュー・週次レビュー等)
8. updatedAt は実質的な編集でのみ更新する。閲覧では更新しない

## 型定義の正(docs/spec.md §3.5)
Status = "idea" | "loop" | "arrange" | "mix" | "done" | "hold" | "abandoned"
SongIdea / VaultFile の構造は spec の TypeScript 定義に1:1で従うこと。

## 作業の進め方
- 指示されたタスク(V-XX)のみ実装する。先のフェーズを先取りしない
- タスクごとにコミットを分け、コミットメッセージは「V-03: ...」形式
- 仕様に曖昧さがある場合は、勝手に埋めず、判断内容を IMPLEMENTATION_NOTES.md に
  「spec §X.X に関して○○と解釈した」と記録する
- 完了時: 変更ファイル一覧、テスト結果、specの対応セクション(§3.x)を報告する
```

---

## ② Phase 0 プロンプト(足場)

```
Phase 0(V-01〜V-03)を実装してください。

### V-01: プロジェクト初期化
- Tauri v2 + React 18 + TypeScript + Vite でプロジェクトを初期化
- Tailwind / Zustand / Zod / Vitest を導入
- Tauriプラグイン: fs, dialog, opener を導入
- Tauri capabilities: fsスコープを appDataDir 配下に限定。ネットワーク権限は付与しない
- 完了条件: `npm run tauri dev` でウィンドウ起動、`npm test` が通る(サンプルテスト1つで可)

### V-02: 型とスキーマ
- docs/spec.md §3.5 の SongIdea / VaultFile を src/domain/types.ts に定義
- 対応する Zod スキーマと VaultFile パーサを src/domain/schema.ts に実装
- テスト: 正常JSON / JSON構文破損 / 個別レコードのスキーマ不正、の3系統

### V-03 [dom]: VaultRepository
- インターフェース: load / save / exportTo / importFrom / listBackups / restore
- JSON実装:
  - アトミック書込: data.json.tmp に書いて成功後 rename
  - 世代バックアップ: 起動時に backups/data-YYYYMMDD-HHmm.json を作成、最新20世代保持・超過分は自動削除
- テスト: tmp→rename の挙動、20世代ローテーション(21個目で最古が消える)

3タスクを順に、それぞれ独立したコミットで実装してください。
```

---

## ③ Phase 1 プロンプト(ドメインロジック)

```
Phase 1(V-04〜V-07)を実装してください。すべて src/domain/ 配下の純関数+Vitestテスト必須。
Reactを一切importしないこと。現在時刻は引数 now で受け取ること。

### V-04: transition(idea, to): Result
docs/spec.md §3.6 の全ルール:
- 前進・後退とも1段ずつのみ(Idea→Mixなどの飛び級はエラー)
- Hold / Abandoned へはどこからでも遷移可。遷移時に prevStatus を保存
- Hold / Abandoned → prevStatus へ復帰可
- Done → Mix へ戻し可。completedAt は初回Done時刻を保持(再Doneで上書きしない)
- 全遷移を statusHistory に記録
テスト: 飛び級拒否 / Hold復帰 / Abandoned復帰 / Done再訪でcompletedAt不変 / statusHistory追記

### V-05: pickFocus(ideas, now)
docs/spec.md §3.8:
- 対象は status ∈ {idea, loop, arrange, mix}
- スコア: status重み(mix4 > arrange3 > loop2 > idea1)→同点は放置日数(updatedAtからの経過)長い順
- Next Action未設定(text空)のネタはFocus対象から外し「先に次の一手を決める」枠として別リストで返す
- 放置警告: updatedAtから7日超のネタ一覧、14日超は「Hold提案」フラグ付き
テスト: 重み順 / 同点時の放置日数順 / 未設定の別掲 / 7日・14日境界

### V-06: monthlyStats(ideas, now, goal)
docs/spec.md §3.9:
- 今月のDone数(completedAtが当月)/ goal、残日数
- パイプライン内訳(各ステータス件数)
- 過去12ヶ月のDone数(statusHistoryから算出)
テスト: 月跨ぎ(月末23:59と翌月0:00)/ タイムゾーンでズレないこと / 12ヶ月境界

### V-07: フィルタ/ソート純関数
- フィルタ: Status / Genre / Mood / テキスト検索(タイトル・コード進行メモ・Next Action対象)
- ソート: 更新日 / 作成日 / BPM(昇降)
テスト: 複合フィルタ / 空クエリ / BPM未設定レコードの並び位置
```

---

## ④ Phase 2 プロンプト(ストアとCRUD)

```
Phase 2(V-08〜V-09)を実装してください。

### V-08: Zustandストア
- state: ideas, settings, 読込状態, 未保存フラグ
- アクション: CRUD一式(作成はタイトルのみ必須)、transition/nextAction更新はPhase 1の純関数を呼ぶだけにする
- 自動保存: 変更からデバウンス500msでRepository.save。アプリ終了時にフラッシュ
- 未保存変更がある間のウィンドウクローズは警告ダイアログ

### V-09: 起動シーケンス+復旧UI(docs/spec.md §3.11)
起動時の分岐を実装:
1. data.jsonなし → 空Vault新規作成(エラー扱いしない)
2. JSON構文破損 → data.corrupt-{date}.json に退避 → バックアップ一覧から復元を提案するUI。無言で空上書きは絶対禁止
3. 個別レコード不正 → そのレコードのみ quarantine 配列へ隔離+警告表示。他は正常起動
4. fileVersionが未来 → 「アプリを更新してください」表示で読取専用起動
各分岐はフィクスチャJSONで再現テストを書くこと。
```

---

## ⑤ Phase 3 プロンプト(画面)

```
Phase 3(V-10〜V-17)を実装してください。画面構成は docs/spec.md §3.4 のワイヤに従うこと。
ナビは Home / Library の2タブ。起動時は必ずHome。

### V-10: 新規登録ダイアログ
タイトル入力+ステータス(既定Idea)のみ。Enterで即作成→Detailへ遷移。

### V-11: Library一覧
カードグリッド(タイトル/ステータスバッジ/BPM・Key/Next Action/最終更新)+
フィルタバー(V-07の純関数を使用)。空状態には新規登録への導線。

### V-12: Detail画面
メタ編集(BPM 40-300 / Key候補サジェスト / Genre / Mood複数)、コード進行メモ、
参考曲リスト(タイトル+URL+メモ)のCRUD。履歴タイムライン(statusHistory、読取専用)。

### V-13: Next Actionコンポーネント(最重要)
- 単一スロットの上書きUI。リスト化は絶対にしない
- 「✓完了」→テキストクリア→即座に次の入力を要求(空で閉じることは可能)
- 未設定の間はHome/一覧カードに⚠バッジ
- プレースホルダに例文ローテーション(「ベースを差し替える」「Bメロのコードを試す」等)

### V-14: ステータス遷移UI
前進/後退ボタン(V-04のtransitionを使用)、Hold(理由メモ任意)/Abandoned(確認ダイアログ)。
前進時にNext Actionが残っていれば「持ち越すか書き換えるか」確認ダイアログ。

### V-15: アセットリスト
- 登録: ファイル選択ダイアログ or パス手入力+種別(midi/audio/flp/other)+メモ
- [開く]: openerプラグイン経由。拡張子ホワイトリスト(.flp .mid .wav .mp3 .flac .zip)外は不可
- .exe .bat 等はopen不可、[フォルダで表示]のみ許可
- パス消失検知: missing=true・赤表示・[パスを再設定]ボタン。開く失敗はエラートースト

### V-16: Home/Focus画面
月間進捗バー(V-06)+パイプライン内訳+Focusカード(V-05、[詳細を開く][✓Nextを完了])+
7日超放置リスト(タップで詳細へ)+14日超は「Holdにしますか?」提案。
受け入れ基準: 起動から「今日のネタとNext Action」表示まで0クリック。

### V-17: Done演出+削除Undo
Done到達時に1秒程度の軽いコンフェッティ。削除は確認ダイアログ+5秒Undoトースト
(実削除は遅延実行、Undoで復元)。
```

---

## ⑥ Phase 4 プロンプト(データ保全と設定)

```
Phase 4(V-18〜V-19)を実装してください。

### V-18: エクスポート/インポート
- エクスポート: 保存ダイアログで任意の場所に loopvault-export-{date}.json
- インポート: 全置換 / マージ を選択式。マージはid衝突時にupdatedAtが新しい方を採用
- インポートJSONはZod検証を通し、不正時はパス付きエラー(ImportIssue形式)を表示。検証を通るまでデータに触れない

### V-19: 設定画面(メニュー格納)
- データ保存場所の表示+[フォルダで開く]
- 月間目標数(monthlyGoal)の変更
- バックアップ一覧の表示と選択復元(V-03のlistBackups/restoreを使用)
```

---

## ⑦ Phase 5 プロンプト(仕上げ)

```
Phase 5(V-20〜V-22)を実施してください。

### V-20: 運用シミュレーション
サンプルデータで「登録→Next完了→遷移→7日放置(updatedAtを偽装)→放置警告確認→
Hold→復帰→Done」を通しで実行し、引っかかった操作をリストアップして修正。

### V-21: 異常系チェック
docs/spec.md §3.11 の表の全ケースを手動確認し、結果を CHECKLIST.md に記録。
再現に使ったフィクスチャJSONは自動テストに昇格させる。

### V-22: README
docs/spec.md §5 の構成(全9項目)で README.md を作成。
特に「data.jsonは平文保存であり曲名・ファイルパスが含まれる」旨を必ず明記。

最後に受け入れ基準4項目を検証して報告:
1. 新規登録が10秒以内
2. 起動→今日のネタとNext Action表示まで0クリック
3. .flp登録ネタから1クリックでFL Studio起動
4. data.jsonを手動で壊してもバックアップから復旧できる
```
