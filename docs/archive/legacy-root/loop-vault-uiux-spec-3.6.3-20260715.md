# Loop Vault 現行UI/UX仕様書 Phase 3.6.3（20260715）

## 0. この文書の目的

この文書は、Loop VaultのUI/UX改善案をClaudeに検討してもらうための、**現行実装ベースの画面仕様書**である。将来計画や理想像ではなく、2026年7月15日時点のコード（基準コミット: `c40938b`）から確認できる表示・操作・状態を記載する。

- 製品仕様の正ではなく、現在のUI/UXを共有するための資料である。
- 「レビュー論点」は改善命令ではない。現状の実装事実から、Claudeに評価してほしい箇所を分離して記載する。
- 主な根拠は `src/App.tsx`、`src/components/AppShell.tsx`、`src/views/*.tsx`、`src/components/progression-editing/*.tsx`、`src/i18n.ts`、`src/styles/tokens.css` である。

## 1. アプリの目的と用語

Loop Vaultは、作曲途中のネタ（Idea）と、MIDIから採集したコード進行を蓄積し、次に手を付けるLoopを選びやすくするデスクトップアプリである。

主な利用サイクルは次の通り。

1. MIDIファイルを読み込み、曲全体の推定コードと再利用候補を得る。
2. 候補を試聴し、必要ならコード名・構造・区間を編集する。
3. 候補を新規Ideaまたは既存Ideaへ保存する。
4. Vaultから保存済み進行を検索・試聴・コピーする。
5. Ideaに「次の一手（Next Action）」を1件だけ設定し、制作ステータスを進める。
6. Homeで今日再開するIdea、停滞、月間完成数を確認する。

用語:

| 用語 | 現行UIでの意味 |
|---|---|
| Idea | 曲・Loopの制作ネタをまとめる単位 |
| Progression | MIDIから保存した再利用可能なコード進行 |
| コード採集 / Capture | MIDIを解析し、候補を聴いて編集・保存する画面 |
| Vault | ProgressionまたはIdeaを検索・再利用する画面 |
| Next Action / 次の一手 | 各Ideaが持つ単一の次作業 |
| Focus / 今日のLoop | Next Actionなどを基にHomeで選ばれる再開候補 |

根拠: `src/views/HomeView.tsx`、`src/views/CaptureView.tsx`、`src/views/VaultView.tsx`、`src/views/DetailView.tsx`。

## 2. 情報設計と全体ナビゲーション

### 2.1 画面構成

アプリ本体は4つのViewと2つのモーダルで構成される。

| 種別 | 内部View | 表示名 | 役割 |
|---|---|---|---|
| 常設画面 | `home` | ホーム | 今日のLoop、月間進捗、停滞、最近の進行を確認 |
| 常設画面 | `capture` | コード採集 | MIDI解析、候補試聴、編集、保存 |
| 常設画面 | `library` | Vault | Progression/Ideaの検索と再利用 |
| 文脈画面 | `detail` | Idea詳細 | Ideaの制作状態、メタ情報、進行、参照、Assetを編集 |
| モーダル | - | 新しいIdea | タイトルと初期ステータスを入力 |
| モーダル | - | 設定 | 言語、月間ゴール、データ管理、解析関連を設定 |

`detail` はヘッダーの常設ナビにはなく、Home、Vault、作成・保存完了後から遷移する。ブラウザルーターは使わず、`App` のローカルstateでViewを切り替えるため、URLや戻る履歴はない。

根拠: `src/App.tsx`、`src/components/AppShell.tsx`。

### 2.2 共通ヘッダー

```text
[Loop Vaultロゴ]       [ホーム] [コード採集] [Vault] [+ Idea] [保存状態] [設定]
```

- 左側に32pxのアプリアイコンと、英字大文字の `Loop Vault` を表示する。
- 右側に主要3画面、Idea追加、保存状態、歯車ボタンを並べる。
- 選択中の画面は一段明るい背景、`+ Idea` はミント色の主ボタンである。
- 保存状態は `保存中 / 未保存 / 保存済み` または英語で常時表示される。
- 狭い画面ではヘッダーが縦積みになり、ナビゲーションは折り返す。

根拠: `src/components/AppShell.tsx`、`src/App.tsx`。

## 3. ビジュアル仕様

### 3.1 カラーと表面

ダークテーマ固定で、CSS変数は次の通り。

| 用途 | 値 |
|---|---|
| 背景 | `#0b0e14` |
| 通常サーフェス | `#11161f` |
| 強調サーフェス | `#171d28` |
| 境界線 | `#2a3342` |
| 強い境界線 | `#3a4658` |
| 主アクセント | `#46dfc7`（ミント） |
| 強アクセント | `#20bfa9` |
| 警告 | `#e6ae4a`（アンバー） |
| 主テキスト | `#f5f7fa` |
| 副テキスト | `#c0c8d4` |
| 弱いテキスト | `#8792a4` |

通常パネルは塗りつぶしと1pxの境界線で区切る。Homeの「今日のLoop」だけは暗い斜めグラデーションを持つ。ドロップシャドウは主にモーダル、Toast、ドラッグ中のオーバーレイで使われる。

根拠: `src/styles/tokens.css`、`src/views/HomeView.tsx`、`src/App.tsx`。

### 3.2 形状・密度・文字

- 基本角丸は8px、定義上の中サイズは12px。
- ページ最大幅は `max-w-7xl`。左右余白は16px、`sm`以上で24px。
- ページ見出しは24px前後、Homeのみ `sm`以上で30px。
- カード内見出しは16〜20px、補助情報は12〜14px。
- コード進行はmonospaceを部分的に使用する。
- 画面の大半は角丸の小さい矩形パネルで、装飾より情報密度を優先している。

根拠: `src/styles/tokens.css`、`src/styles.css`、各 `src/views/*.tsx`。

## 4. ホーム画面

### 4.1 レイアウト

```text
Home
次に鳴らすLoopを選ぶ。

[ 今日のLoop / Focus -------------------------------- ]

[ 今月の完成 ] [ 次の一手が必要 ] [ 停滞中 ]

[ 最近採集した進行 ---------------- ] [ 制作状況 ]
                                        [ 停滞中 ]
```

下段はデスクトップで左右 `1.2 : 0.8`、狭い画面では縦積みになる。

### 4.2 今日のLoop

Focus対象がある場合:

- Ideaタイトル、BPM、Key、ステータスを表示する。
- 保存済み進行があればコード列と、設定に応じてローマ数字の度数を表示する。
- Next Actionを表示する。
- 進行の試聴、詳細を開く、Next Action完了の3操作を提供する。

Focus対象がない場合:

- Next Actionを持つネタがない旨を表示する。
- `コード採集を始める`、`新しいIdea`、`Vaultを開く` を提示する。

### 4.3 状況表示

- 今月Doneにした件数と月間ゴール、残り日数、進捗バー。
- Next ActionがないアクティブIdeaの件数。
- 7日以上更新がないIdeaの件数。
- 最近保存した進行を最大3件表示し、試聴とIdea詳細への遷移ができる。
- Idea / Loop / Arrange / Mix / Doneの件数を横バーで表示する。
- 停滞Ideaには条件により `保留にする` を表示する。

根拠: `src/views/HomeView.tsx`。

## 5. コード採集画面

### 5.1 MIDI未読込時

```text
MIDI Capture
MIDIからコード進行を採集
[1 曲全体を推定] [2 候補を抽出] [3 気に入った進行を保存]

[ MIDIファイルをここにドロップ -------------------- ]
[ MIDIを選択 ]
```

- 最低512px相当の高さを持つ中央配置パネルである。
- `.mid` / `.midi` のファイル選択とドラッグ&ドロップに対応する。
- OSからTauriウィンドウへ落とす操作と、DOMのdropイベントの両方を処理する。
- ドラッグ中は画面全体に破線のオーバーレイを表示する。
- 解析中はシアン、失敗時は赤の情報パネルを同じ画面内に表示する。

根拠: `src/views/CaptureView.tsx` の `CaptureEmptyState`、`DropOverlay`。

### 5.2 解析結果の全体構成

```text
[ ファイル概要 / 別のMIDI / クリア ]
[ File ] [ Bars ] [ BPM ] [ 拍子 ]

[ 使えそうな進行候補             ][試聴音色][件数]
[ 候補1 ------------------------- ] [ 保存パネル ]
[ 候補2 ------------------------- ] [  sticky     ]
[ 候補3 ------------------------- ]

▶ 曲全体のコードを見る
```

- `xl`以上では候補一覧と幅22remの保存パネルを2列表示する。
- `xl`未満では保存パネルが候補一覧の後ろに回る。
- 候補は同時に1件だけ展開できる。
- 編集済み候補から別候補へ移る、または閉じる際は未保存確認を出す。
- 解析結果自体は再起動後に復元されない一時状態である。

根拠: `src/views/CaptureView.tsx`、`src/store/defaultVaultStore.ts`。

### 5.3 候補カード

折りたたみ時にもコードカード列を表示し、カード上部に主要操作を集約する。

```text
候補 1 / 1〜8小節 / [必要時のみ信頼度]
                              [▶] [■再生中のみ] [Vaultに保存] [保存方法] [コピー]
[メイン・イントロ向き・ターンアラウンド]
[候補の要約]
[ Cmaj7 ][ Am7 ][ Dm7 ][ G7 ] ...
```

- ヘッダー左側を押すと展開する。
- 信頼度は常時ではなく、要確認レベルのときだけ表示する。
- `Vaultに保存` は新規Ideaへ即時保存するクイック操作である。
- `保存方法` は右側の保存パネルを開く。
- `コード進行をコピー` はテキストとしてクリップボードへコピーする。
- ラベル、警告、要約は解析結果に応じて表示される。
- 再生中のみ候補ヘッダーに独立した停止ボタンが現れる。

根拠: `src/views/CaptureView.tsx` の `ProgressionCandidateCard`。

### 5.4 候補編集ワークスペース

候補を展開すると、左に編集可能なコードカード列、右にInspectorを表示する。`xl`未満ではInspectorはカード列の下へ回る。

- コードカードには現在のコード名を表示する。
- 選択中はミント、再生中はシアンの境界・背景になる。
- 手動変更済みは鉛筆記号、低信頼または警告ありは `要確認` を表示する。
- 再生中のカード下端に時間進捗バーを表示する。
- Undo、Redo、全リセットがある。
- Inspectorでは元のコード、現在のコード、信頼度、警告、代替候補を表示する。
- コードラベルの直接入力と、Root / Quality / Bassの構造編集ができる。
- 元コードと現在コードを個別に試聴できる。
- コード区間の分割、前後との結合、削除ができる。
- 変更一覧は `元 → 現在` 形式で表示し、項目を押すと該当カードを選択する。

キーボード操作:

| キー | 操作 |
|---|---|
| `←` / `→` | 前後のコードへ移動 |
| `Enter` | コードラベル入力へ移動 |
| `Space` | 選択コードを試聴 |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Delete` | 選択区間を削除 |
| `Escape` | 再生停止、または候補を閉じる |

根拠: `src/views/CaptureView.tsx`、`src/components/progression-editing/EditableChordCard.tsx`、`ChordInspector.tsx`、`ProgressionEditorToolbar.tsx`。

### 5.5 保存パネル

保存方法は次の3モード。

| モード | 入力・挙動 |
|---|---|
| 新しいIdeaとして保存 | タイトル、Next Action、確認済みチェックを入力して新規作成 |
| 既存Ideaへ追加 | 追加先Ideaと確認済みチェックを選択 |
| コードだけメモに追記 | 追加先Ideaを選択し、コードメモへ追記 |

- 変更がある場合は変更一覧も保存パネル内に表示する。
- `確認済み` はユーザーがコード名を自分で確認した場合だけ有効にする想定である。
- 保存成功後はToastを表示する。新規Idea保存時はそのIdea詳細へ移動する。

根拠: `src/views/CaptureView.tsx` の `ProgressionSaveDialog`、`src/App.tsx`。

### 5.6 曲全体のコード

- 標準HTMLの `details / summary` で折りたたむ。
- `曲全体を再生` は再生中に同じ位置で `停止` に切り替わる。右隣の独立停止ボタンはない。
- 候補部と同じ `ピアノ / エレピ` の音色選択を使い、音色stateも共有する。
- 各コードカードを押すと、そのコードだけ試聴できる。
- 候補として抽出されなかった範囲も含む全タイムラインを表示する。

根拠: `src/views/CaptureView.tsx` の `TimelineDetails`、`PreviewSoundSelector`。

## 6. Vault画面

### 6.1 Progressionモード

既定モード。カードではなく密度の高い行リストで保存済み進行を扱う。

- 検索対象: コード列、度数、ラベル、タグなど。
- 長さフィルタ: All / 4 / 8 / 16 bars。
- 絞り込み: ピン留め、Key、元MIDI、タグ。
- 並び替え: 採集日、更新日、Key、BPM。
- 各行: 再生/停止、コード列、度数またはIdea名、Key、BPM、日付、タグ、ピン、コピー。
- 行を選択し、コード列部分をダブルクリックするとIdea詳細を開く。

画面下部に次のショートカット説明を常時表示する。

`↑↓ 移動 · Space 試聴/停止 · Enter Ideaを開く · C コピー · S ★ · / 検索 · Esc クリア`

各行は6列の固定グリッドで、モバイル用の別レイアウトや横スクロール指定はない。

根拠: `src/views/VaultView.tsx` の `VaultView`、`ProgressionRow`。

### 6.2 Ideaモード

- Ideaをカードグリッドで表示する。
- カードにはタイトル、BPM、Key、Next Actionを表示する。
- `md`で2列、`xl`で4列。押すと詳細画面へ移動する。
- Progressionモードの検索・フィルタはIdeaモードには適用されない。

根拠: `src/views/VaultView.tsx` の `IdeaList`。

## 7. Idea詳細画面

デスクトップでは左右2列、`lg`未満では縦積みになる。

```text
[タイトル・ステータス・Next Action・メタ情報] [参考曲]
[保存済みコード進行]                         [Assets]
                                              [履歴]
```

### 7.1 制作状態

- タイトルは見出し型の入力欄で、入力のたびに更新する。
- ステータスは `アイデア / ループ / 展開 / ミックス / 完成 / 保留 / 没` の全ボタンを横並び・折り返しで表示する。
- `没` はブラウザ標準confirmで確認する。
- `保留` はブラウザ標準promptで理由を尋ねるが、**入力した理由は現行コードでは保存に使われない**。
- Next Actionがある状態で制作パイプライン間を移動すると、持ち越すか標準confirmで確認する。
- Idea削除は標準confirm後、5秒間のUndoバーを画面下部に表示する。

### 7.2 Next Actionとメタ情報

- Next Actionはtextarea 1件。フォーカスを外した時または更新ボタンで保存する。
- `完了` は内容を空にし、Toastを表示する。
- 空の場合は次の一手を1件入れるようアンバー色で促す。
- BPM、Key、Genre、Mood、コード進行メモを編集できる。
- Moodはカンマ区切り。Keyには簡易候補のdatalistがある。

### 7.3 保存済み進行・参考曲・Assets・履歴

- 保存済み進行はカードごとに要約、元MIDI、小節範囲、コードグリッドを表示する。
- 各進行は試聴、コピー、削除ができる。試聴ボタンは再生中表示や停止操作に切り替わらない。
- 参考曲はTitle必須、URL、Memoを追加・削除できる。
- AssetはFLP / MIDI / Audio / Other、絶対パス、Memoを登録できる。
- MIDI Assetは直接コード解析へ送れる。
- 開く、フォルダ表示、missing時のパス修正、削除を提供する。
- ステータス履歴を日付とともに表示する。

根拠: `src/views/DetailView.tsx`、削除Undoは `src/App.tsx`。

## 8. 新規Ideaモーダル

- 入力はタイトルと初期ステータスのみ。
- 初期ステータスはIdea / Loop / Arrange / Mix / Done。HoldとAbandonedは選べない。
- タイトル欄へ自動フォーカスする。
- 作成後は新しいIdeaの詳細画面へ移動する。
- 背景クリック、Escape、フォーカストラップは実装されていない。
- `role="dialog"`、`aria-modal` は設定されていない。

根拠: `src/App.tsx` の `CreateDialog`。

## 9. 設定モーダル

幅は最大4xl。`lg`以上では冒頭の設定群を2列にし、モーダル背景全体を縦スクロールする。

現在含まれる内容:

1. 表示言語: 日本語 / Englishを即時切替。
2. 制作: 月間ゴール、コードカードへの度数表示。
3. データ: 保存先表示、フォルダを開く、パスコピー、export。
4. import: マージまたは全置換。
5. 最新バックアップ: 更新、復元、5件/全件切替。
6. MIDI解析: ローカル修正ログのON/OFF、削除。
7. 実MIDI評価（開発用）: フォルダ、source index、各種評価データ削除。
8. 情報: アプリ形式とデータ形式。

- export/importはTauriのネイティブファイルダイアログを使う。
- 復元やログ削除はブラウザ標準confirmを使う。
- 開発者向け機能も一般ユーザー向け設定と同じ階層に表示される。
- Escape、背景クリック、フォーカストラップ、`role="dialog"` は実装されていない。

根拠: `src/views/SettingsDialog.tsx`。

## 10. 起動・保存・エラーのUX

### 10.1 起動状態

通常画面の代わりに中央パネルで次を表示する。

| 状態 | 表示・操作 |
|---|---|
| 読込中 | ローカル `data.json` を確認中と表示 |
| 復旧必要 | 壊れたファイルを退避した旨、退避先、復元可能なバックアップ一覧 |
| 新しいfileVersion | アプリ更新が必要な読み取り専用状態を表示 |
| 読込エラー | エラー文を表示 |
| 不正レコード隔離 | 通常画面上部に隔離件数のアンバーバナー |
| Idea 0件 | Idea作成を促す空状態 |

根拠: `src/App.tsx` の `StartupState`、`QuarantineNotice`、`EmptyState`。

### 10.2 保存フィードバック

- ヘッダーに `保存中 / 未保存 / 保存済み` を常時表示する。
- 操作結果は右上のToastで約3.2秒表示する。
- Idea削除だけは画面下中央に5秒間のUndoバーを出す。
- ウィンドウ終了時は未保存内容のflushを試みる。

根拠: `src/App.tsx`、`src/components/Toast.tsx`、`src/store/closeGuard.ts`。

## 11. 音声試聴の現行仕様

- 基本音色はピアノ。コード採集画面のみピアノ/エレピを切り替えられる。
- 候補再生は独立した停止ボタンを再生中のみ表示する。
- 曲全体再生は同じ主ボタンが再生/停止に切り替わる。
- Vault行は同じ小ボタンが再生/停止に切り替わる。
- HomeのFocus・最近の進行と、Idea詳細の保存済み進行は再生開始ボタンだけで、再生中状態や画面内停止操作を持たない。
- コード採集の編集カードは再生進捗をカード下端に表示する。

根拠: `src/audio/chordPreview.ts`、`src/views/HomeView.tsx`、`CaptureView.tsx`、`VaultView.tsx`、`DetailView.tsx`。

## 12. 日本語・英語表示

- 設定から日本語と英語を切り替え、設定値として保存する。
- 主要文章は `src/i18n.ts` の `appCopy` と `progressionEditorCopy` に定義される。
- 一部はコンポーネント内の `language === "ja"` 分岐で定義される。
- 日本語表示でも `Loop Vault`、`Home`、`Vault`、`Idea`、`Progression`、`MIDI Capture`、`Next Action`、`Assets`、`BPM`、`Key`、`Genre`、`Mood`、`All`、`bars` など英語が混在する。
- 日付は `Intl.DateTimeFormat(undefined, ...)` を使うため、アプリ内言語ではなくOS/実行環境のlocaleに従う。

根拠: `src/i18n.ts`、`src/domain/displayLabels.ts`、各View。

## 13. レスポンシブ仕様

| 箇所 | 広い画面 | 狭い画面 |
|---|---|---|
| 共通ヘッダー | ロゴとナビを左右配置 | 縦積み、ナビ折り返し |
| Home指標 | 3列 | 1列 |
| Home下段 | 最近の進行と制作状況を2列 | 縦積み |
| Capture結果 | 候補 + 22rem保存パネル | 保存パネルが候補一覧の後ろ |
| 候補編集 | コード列 + 20rem Inspector | Inspectorがコード列の下 |
| Vault Idea | 最大4列 | 1〜2列 |
| Vault Progression | 6列固定行 | 同じ6列を維持 |
| Idea詳細 | 左右2列 | 縦積み |
| 設定冒頭 | 2列 | 1列 |

専用のモバイルナビ、Drawer、下部固定操作バーはない。最小body幅は320px。

根拠: `src/styles.css`、各コンポーネントのTailwindクラス。

## 14. アクセシビリティと操作支援

実装済み:

- アイコンのみの主要ボタンには概ね `aria-label` と `title` がある。
- Toastは `role="status"`。
- 試聴音色は `role="group"`、選択状態は `aria-pressed`。
- 編集コード列は `role="listbox"`、各コードは `role="option"`。
- Inspectorの不正コード入力は `aria-invalid`。
- Vaultと候補編集にキーボードショートカットがある。
- IME入力中やinput/select/textarea操作中は候補編集のグローバルショートカットを抑止する。

現行制約:

- モーダルにdialog role、フォーカストラップ、Escape閉じがない。
- 共通ナビの `aria-label` は日本語表示でも `Main navigation` 固定。
- 候補カードの選択は `role="option"` と `aria-pressed` を併用しているが、`aria-selected` はない。
- 設定の歯車、再生、停止、Undo/Redo、編集済み表示にはUnicode記号を使用している。
- 色コントラストやスクリーンリーダー操作の自動監査結果は、この文書作成時点ではない。

根拠: `src/components/AppShell.tsx`、`Toast.tsx`、`src/views/CaptureView.tsx`、`VaultView.tsx`、`src/components/progression-editing/*.tsx`。

## 15. Claudeにレビューしてほしい論点

以下は現状の事実から切り出した評価対象である。解決方法は固定せず、優先順位と改善案を提案してほしい。

| # | 現状の事実 | レビューしてほしい観点 |
|---|---|---|
| 1 | HeaderにはHome / Capture / Vault / +Idea / 保存状態 / 設定が同列に並ぶ | 頻度と重要度に合ったナビ階層か |
| 2 | 日本語画面にIdea、Progression、Vault、Next Action等が混在する | 音楽制作者に自然で、意味がぶれない日英バランス |
| 3 | Capture候補に即時保存と保存方法の2つの保存CTAが並ぶ | 誤操作なく素早く保存できる主従関係 |
| 4 | `xl`未満では保存パネルが候補一覧全体の後ろに回る | 候補編集後に保存操作を見失わない導線 |
| 5 | Inspectorは狭い画面で下に回り、選択コードと離れる | 小〜中画面での編集効率 |
| 6 | 曲全体は標準detailsの末尾セクション | 発見しやすさと、候補優先の情報階層の両立 |
| 7 | 試聴/停止UIが画面ごとに異なり、Home/Detailには停止状態がない | 音声操作の一貫性と現在再生中の把握 |
| 8 | Vault Progressionはモバイルでも6列固定 | 小画面で情報を落とさず操作できるか |
| 9 | Vaultの詳細遷移はコード列のダブルクリック | 発見可能性、タッチ操作、誤操作 |
| 10 | Detailのステータス7種を一度に全表示する | 制作フローとしての次操作が伝わるか |
| 11 | Detailの保存は項目ごとに即時、一部はblur、一部はボタン | 保存タイミングの予測可能性 |
| 12 | 削除確認はIdeaのみconfirm + Undo、その他は即時削除 | 破壊操作の一貫性 |
| 13 | Hold理由promptの入力結果が保存されない | 誤解を生む入力UIの扱い |
| 14 | 設定に日常設定、データ保全、開発者向け評価操作が縦に並ぶ | 情報設計と危険操作の隔離 |
| 15 | Create/Settingsはアクセシブルなmodal dialogとして未完成 | キーボード、フォーカス、閉じ方 |
| 16 | HomeはFocus、3指標、最近の進行、制作状況、停滞を同時表示 | 日常起動時に本当に必要な情報量か |
| 17 | 一部クラスに `text-[var(--lv-text)]0` という無効と考えられる記述がある | 弱い補助文字の視認性とスタイル品質 |
| 18 | 多数のボタンがテキスト、Unicode記号、短縮文字 `C` を混用する | 操作の意味、視覚的一貫性、ツールチップ |

#17の該当例: `src/views/CaptureView.tsx`、`src/views/DetailView.tsx`、`src/views/SettingsDialog.tsx`。

## 16. Claudeへの依頼内容

この仕様を前提に、次を提出してほしい。

1. 現行UI/UXの良い点を、残すべき理由とともに整理する。
2. 問題を「重大な操作阻害 / 日常利用の摩擦 / 見た目と一貫性 / 将来改善」に分類する。
3. 改善案を優先度P0〜P3で提示する。
4. Home、コード採集、Vault、Idea詳細、設定の各画面について、改善後の情報階層を簡易ワイヤーで示す。
5. MIDI解析から編集・保存までの主動線について、クリック数、視線移動、誤操作防止の観点で改善する。
6. 日本語/英語の用語表を提案し、残す英語と日本語化する語を明示する。
7. デスクトップを主対象としつつ、最小幅320px〜中幅で破綻しないレスポンシブ案を示す。
8. 既存のダークテーマとミント/シアンの音楽ツールらしさを活かし、全面的な別ブランド化は避ける。
9. 改善案ごとに、影響する現行コンポーネントを可能な範囲で示す。
10. 見た目だけでなく、再生状態、保存状態、破壊操作、モーダル、キーボード操作を含むUXとして評価する。

## 17. 実装ファイル対応表

| 領域 | 主な実装 |
|---|---|
| アプリ全体・View切替・モーダル・起動状態 | `src/App.tsx` |
| 共通ヘッダー | `src/components/AppShell.tsx` |
| Toast | `src/components/Toast.tsx` |
| Home | `src/views/HomeView.tsx` |
| コード採集 | `src/views/CaptureView.tsx` |
| 候補編集部品 | `src/components/progression-editing/*.tsx` |
| コードグリッド | `src/ui/ProgressionGrid.tsx` |
| Vault | `src/views/VaultView.tsx` |
| Idea詳細 | `src/views/DetailView.tsx` |
| 設定 | `src/views/SettingsDialog.tsx` |
| 日英コピー | `src/i18n.ts` |
| 表示ラベル | `src/domain/displayLabels.ts` |
| 試聴 | `src/audio/chordPreview.ts` |
| 色・角丸・共通ボタン | `src/styles/tokens.css` |
| 全体スタイル | `src/styles.css` |
