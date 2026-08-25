# Loop Vault v1.1.0 現行機能仕様書

> 対象: Windowsデスクトップ版 Loop Vault v1.1.0
> 実装基準: `master` commit `a96c7924f71c05b2c174dc3b605a6e11ab93fe68`（P5.23 merge時点）
> 文書種別: 実装済み製品機能の仕様。将来計画、Phase作業手順、評価用の未昇格機能は含めない。
> 最終同期: 2026-08-25（P5.22 Source Bassline Practice / P5.23 Timeline Candidate Legibilityを反映）

## 1. 製品概要

Loop Vaultは、コード進行を収集し、編集・試聴・練習・制作へつなげるWindowsデスクトップアプリである。

主な入口は次の2つである。

1. 1つまたは複数のMIDIファイルを読み込み、コード進行候補を解析する。
2. MIDIを使わず、コードネームをテキスト入力して進行を作る。

作成した進行はVaultへ保存し、コード編集、ボイシング指定、MIDI書き出し、DAWへのドラッグ、Chord Dojo、Bass Practice、Progression Advisorで再利用できる。

### 1.1 対応環境

- 対応OS: Windows
- 配布形態: NSISセットアップ、MSI、直接実行可能なEXE
- UI言語: 日本語、英語
- デスクトップ基盤: Tauri v2
- Web表示時は一部のネイティブ機能が利用できず、Vaultはメモリ保存となる。正式な永続利用はデスクトップ版を前提とする。

### 1.2 基本方針

- MIDI解析・編集は元のMIDIファイルを書き換えない。
- 解析結果は確定情報ではなく、ユーザーが試聴・修正・確認して保存する候補として扱う。
- Vault、練習履歴、録音テイクはローカルへ保存する。
- Progression Advisor以外の通常機能は、ユーザーデータを外部サービスへ自動送信しない。

## 2. 画面構成

| 画面 | 主な目的 |
| --- | --- |
| Home | Focus、月間進捗、最近のIdea、Capture/Vault/Practiceへの入口 |
| Capture | MIDI解析またはテキスト入力から進行Draftを作成 |
| Vault | 保存した進行の検索、絞り込み、試聴、詳細表示 |
| Idea Detail | Ideaのメタ情報、進行ブロック、参考資料、制作ファイル、状態を管理 |
| Progression Detail | コード進行、タイミング、ボイシング、タグを編集し、試聴・書き出し・練習へ渡す |
| Practice | Chord DojoまたはBass Practiceを実行 |
| History | Capture・編集・練習の履歴を確認 |
| Settings | 表示、データ、解析、MIDI、録音、Advisor、ビルド情報を設定 |
| Live MIDI Mini Mode | MIDI鍵盤から現在のコードを検出し、履歴を保存候補へ渡す |

## 3. 共通UI仕様

### 3.1 言語と音量

- 表示言語は日本語・英語を切り替えられる。
- マスター音量と試聴音色を共通操作として提供する。
- 主な試聴音色はピアノ、エレクトリックピアノである。Bass Practiceでは専用ベース音色も使用する。

### 3.2 キーボードとアクセシビリティ

- 主要なボタン、ダイアログ、タブ、ラジオ選択、リストはキーボード操作に対応する。
- Vaultでは `/` で検索へ移動し、矢印キー、Space、Enter、`C`、`S`、Escapeで選択・試聴・表示・コピー・お気に入り・解除を操作できる。
- 画面幅320px、拡大表示、reduced motionを含むレスポンシブ表示を想定する。
- 状態変化とエラーは画面内表示、Toast、ARIA live領域で通知する。

### 3.3 編集と未保存状態

- Draftまたは進行詳細の未保存編集がある状態で移動する場合、破棄確認を行う。
- コード編集ではUndo/Redoを提供する。
- Idea、参考資料、アセット等の削除はUndo対象となる場合がある。
- CaptureのVault保存メニューと保存フォームは、開いている間、表示領域と`main`領域に収まるよう位置・幅・最大高を調整する。
- 画面サイズ変更やCapture内スクロール後も再配置し、必要時は内部スクロールを使う。外側クリックまたはEscapeで閉じ、起点へフォーカスを戻す。

## 4. MIDI Capture & Analysis

### 4.1 入力

- `.mid` / `.midi` ファイルを選択またはドラッグ&ドロップできる。
- 複数ファイルを1回の解析対象として追加できる。
- 読み込んだMIDIからテンポ、拍子、Voice、ノート、コードタイムライン、セクション、進行候補を求める。
- 不正形式、空のMIDI、解析不能な入力は保存候補へ進めず、エラーを表示する。

### 4.2 Pre-analysis Voice選択

解析前に、MIDI内の演奏パートをVoice単位で確認する。

- 自動Role: `bass`、`harmony`、`pad`、`melody`、`percussion`、`mixed`、`ambiguous`
- 信頼度表示: High / Medium / Low
- Lowは要確認として表示する。
- Role判断の根拠は、個人情報や生のトラック名ではなく、音域・密度・単音性・プログラム種別などの一般化された表示を使う。
- ユーザーは解析対象のVoice、Role、プリセットを確認・変更できる。
- MIDI Channel 10は打楽器として扱い、和声解析へ入れない。

### 4.3 解析プリセット

| プリセット | 動作 |
| --- | --- |
| 標準 | 既定の解析経路を使用する |
| 自動 | Voice構成に基づく自動選択を使用する |
| カスタム | ユーザーがVoiceの採否・Roleを調整する |
| 和声コア | 伴奏の和声を優先する任意モード |

和声コアは次の仕様で動作する。

- harmony / padの寄与を強める。
- bass / percussionをコード検出の対象外にする。
- melodyの寄与を弱める。
- `mixed` Voice内では、音をharmonic / melody-like / uncertainに分類し、melody-likeな音のコード検出への寄与を弱める。
- ピアノロール上でも寄与の強弱と解析対象を反映する。
- 元MIDIのノートを削除・変更せず、標準解析を置き換えないopt-in機能である。
- 選択後に「この設定で解析」を実行した結果へ適用し、結果画面に適用済みモードと影響概要を表示する。

### 4.4 解析結果

- 曲全体のコードタイムラインを表示する。
- 進行、Vamp、断片の候補を区別する。
- 開始・終了・中心が近く大きく重なる候補は、表示層だけで候補グループへ整理する。解析器の候補生成、件数、score、境界は変更しない。
- グループ内の全variantは1回ずつ到達でき、小節数とBar範囲を表示する。代表表示と選択中variantは別に決定する。
- 解析直後は各グループの選択候補を比較し、全体のwinner 1件をその全範囲・bar snapで初期化する。既存Draftやユーザーが変更したsnapは上書きしない。
- variantへのfocus、hover、highlight、リストを開く操作だけでは選択範囲を変更せず、clickまたはEnterによる明示activationで変更する。
- 候補Barの下に、曲全体のコードタイムラインだけから求めた非操作型の「和声活動」stripを表示する。強度は活動なし／低／中／高であり、品質、精度、推奨度を表さない。
- Compact Cards、ピアノロール、ミニマップ、候補ブロックから位置と内容を確認できる。
- コードごとに候補、代替候補、信頼度、警告を保持する。
- 元の検出値と現在の編集値を試聴できる。
- 候補範囲を選び、Draftへ変換する。

### 4.5 Capture Draft

- コード名、構成音、ベース音、テンション、開始位置、長さを編集できる。
- Quick Editorからコードラベルを直接変更できる。
- コードの分割、結合、追加、削除、範囲調整を行える範囲では、保存前に整合性を再検証する。
- 進行全体または個別コードを試聴できる。
- 新しいIdeaとして保存、または既存Ideaへ進行ブロックを追加できる。

### 4.6 Source Bassline Capture

- 解析対象に含めた非打楽器Voiceのうち、実効Roleが`bass`の候補からユーザーが1件を明示選択する。自動推定だけでは保存を許可しない。
- 「元ベースラインを練習用に保存」は既定OFFで、選択Voiceと同じMIDI sourceに属する1～12小節・4/4・bar境界整列済み範囲だけで有効になる。
- opt-in時は、範囲と交差する選択Voiceの全note eventを、同時発音・重なり・境界継続を含めてexact timingのdetached snapshotへ保存する。最低音だけへの単音化や量子化は保存時に行わない。
- raw MIDI bytes、path、filename、track/Voice表示名・ID、device情報、個人メモはsnapshotへ保存しない。snapshotがVault exportに含まれることを事前表示する。
- opt-in後にsnapshotを添付できなくなった場合は、理由を表示し、snapshotなしで保存する明示的な再確認を求める。要求されたsnapshotを黙って省略しない。

## 5. Text Progression Entry

### 5.1 概要

Captureの「テキスト」入力では、MIDIなしでコード進行を作成する。

```text
| Dm7 G7 | Cmaj7 | Am7 |
```

テキスト解析後はコードカードを確認し、Key、BPM、ボイシングを設定してDraftへ変換する。変換後はDraftを正とし、入力テキストとの双方向同期は行わない。

### 5.2 文法と上限

- 拍子は4/4のみ。
- 1小節あたり1、2、4コードに対応し、それぞれ4、2、1拍へ等分する。
- 区切り記号 `|` を使う小節形式と、空白区切りで1 tokenを1小節として扱う単純形式に対応する。
- 最大12小節、48コードtoken、入力長4,096 UTF-16 code unit。
- 絶対コードネーム、対応する別名、テンション、スラッシュコードを正規化する。
- Roman numeral / degree入力は、ユーザーがKeyを確定した場合だけ解決する。自動推定Keyは候補であり、確定値として使用しない。
- 3コード小節、空小節、N.C.、休符、リピート記法、コメント、セクション見出し、歌詞・自由文は非対応。
- 診断が1件でも残る場合は部分変換せず、該当tokenと文字位置を表示して変換を止める。

### 5.3 カード、Key、BPM

- 有効・無効tokenを小節単位のカードとして表示する。
- Key候補を提示できるが、保存するKeyとdegree解釈には明示確認が必要である。
- 試聴には30〜240 BPMの明示値を使う。
- Key/BPMなしでも有効な進行はVaultとChord Dojoへ保存できる。
- Bass Practice / Chord Context / Root Motionで使うには、確定Key、対応BPM、4/4、連続した対応長など追加条件を満たす必要がある。

### 5.4 ボイシング

- 自動生成ボイシングのスタイルを選択し、鍵盤表示と試聴へ反映できる。
- コードカードを選択すると、そのコードで保存予定のボイシングを鳴らす。
- 接続したMIDI鍵盤の入力はピアノ音でモニターできる。
- 入力した構成音を確認し、「この音を保存予定にする」で選択中コードのCustom Voicingとして確定する。
- Custom Voicingは同時発音のLive MIDI入力だけを保存し、元MIDI由来とは表示しない。
- Draft変換後はInspectorを閉じ、ボイシング変更はDraft側を正とする。

### 5.5 保存データの境界

- 保存されるのは正規化したコード、タイミング、明示Key/BPM、互換性のあるボイシング、タイトル等である。
- 架空のMIDIファイル名、パス、指紋、解析confidence、source MIDI provenanceは作らない。
- 保存アダプタ側でも小節数、コード数、4/4タイミング、コード正規化、BPMを再検証する。

## 6. VaultとIdea管理

### 6.1 Idea

Ideaは次の情報を保持する。

- タイトル、BPM、Key、ジャンル、Mood
- 状態: Idea / Loop / Arrange / Mix / Done / Hold / Abandoned
- 次に行うことと更新日時
- コードメモ、参考資料、制作アセット
- 0件以上の保存済み進行ブロック
- 状態履歴、作成日時、更新日時、完了日時

### 6.2 Vault一覧

- 進行単位の一覧とIdea単位の一覧を切り替えられる。
- タイトル、Key、コード、セクション等を検索する。
- Key、長さ、source、タグ、お気に入り等で絞り込む。
- Capture日時、更新日時、Key、BPMで並べ替える。
- 進行全体を試聴、コード列をクリップボードへコピー、詳細を開く操作を提供する。
- 保存したテキスト進行もMIDI由来進行と同じVault導線から利用するが、source情報は区別する。

### 6.3 Idea Detail

- Ideaのメタ情報、状態、Next Actionを編集する。
- 保存済み進行を表示・複製・削除・詳細編集する。
- 参考URL・メモを登録する。
- MIDI、audio、FL Studio project、その他のローカルアセットを関連付ける。
- 対応拡張子のアセットを開く、フォルダ内表示、失われたパスの再設定を行う。
- 関連付けはパス参照であり、元ファイルのbytesをVault JSONへ埋め込まない。

### 6.4 Source Bassline Snapshot

- 進行ブロックは任意で最大1件の`sourceBassline` detached snapshotを保持する。既存ブロックへの遡及生成は行わない。
- snapshotは保存後immutableであり、現在のコード進行編集では書き換えない。進行ブロック複製時はdeep copyし、削除時はブロックとともに削除する。
- Progression Detailは「元ベースライン」の保存有無と、保存時の和声と現在の進行が一致・不一致・比較不能のいずれかを表示する。
- 有効なsnapshotはVault export/import、backup/recoveryを往復してもcanonical note列とsignatureを保持する。

## 7. Progression Detail

### 7.1 編集

- コードラベル、root、quality、tension、bass、開始拍、長さを編集する。
- コードの分割・結合・追加・削除、Undo/Redoを行う。
- Key、BPM、拍子、メモ、タグ、お気に入り等を編集する。
- 進行ブロックを複製または削除する。

### 7.2 Voicing Memory

コードごとに次のボイシングを扱う。

- 元MIDIから抽出したsource voicing
- 自動生成voicing
- MIDI鍵盤で記録し、ユーザーが確認したpractice override

コードidentityと互換性がない古いoverrideは使用しない。元MIDIが利用可能な場合は再抽出できるが、テキスト進行ではsource MIDI再取得を表示しない。

### 7.3 試聴とMIDI出力

- 個別コードと進行全体を試聴する。
- BPMと試聴音色を調整する。
- 解決済みVoicing Memoryがあれば、そのMIDI noteを試聴・書き出しへ使用する。
- `.mid` ファイルとして保存できる。
- 一時MIDIを生成し、対応DAWへネイティブドラッグ&ドロップできる。
- 不正なタイミングや書き出せないコードを含む場合は、書き出しを止めて位置を示す。

### 7.4 下流連携

- Chord Dojoを開始する。
- 対応する1、2、4、8、12小節の4/4セクションを選び、Chord Contextへ渡す。
- Progression Advisorを開き、提案を現在の編集Draftへ追加できる。
- 元ベースライン保存済みの進行はBassline Echoの「元ベースライン」sourceとして利用できる。現在の進行編集と保存時和声が異なる場合も、その差を表示してsourceを差し替えない。

## 8. Chord Dojo

保存済み進行をMIDI鍵盤で段階的に練習する。

### 8.1 レベル

| Level | 内容 |
| --- | --- |
| L1 見て弾く | コード表示を見ながら演奏 |
| L2 名前で弾く | コードネームを手掛かりに演奏 |
| L3 度数で弾く | Keyに対するdegreeで演奏。Key設定が必要 |
| L4 近くのキーでも | 近いKeyへ移調して演奏 |
| L5 どのキーでも | より広いKeyへ移調して演奏 |

### 8.2 練習形式

- Step: 1コードずつ確認する。
- Flow: 4/4の進行を止めずに演奏する。
- MIDI入力を目標ボイシングと照合し、許容範囲内で判定する。
- 元ボイシング、Auto、Shell 1-7、Open 1-7、Rootless A/Bを練習対象にできる。
- L4/L5では開始Keyと移調先を管理し、別Keyへ進める。
- 練習レベル、ラウンド、連続成功等を進行ブロックへ保存する。

### 8.3 Mix Practice

- 2〜5件の進行を選んで連続練習する。
- 共通BPM、判定の厳しさ、1〜3周を設定する。
- 各進行のKey、拍子、ボイシング利用可否を開始前に検証する。

## 9. Bass Practice

Bass Practiceは自己評価式であり、自動採点や音声認識を行わない。共通フェーズは「聴く・歌う・考える・弾く・振り返る・移調」である。

### 9.1 共通設定

- 4弦 / 5弦
- 右利き / 左利き表示
- フレット範囲
- 歌唱Reference
- テンポ、カウントイン、メトロノーム、再生レイヤー
- 練習設定はローカルのPractice dataへ保存する。

### 9.2 Degree Echo

- 生成された短いベースフレーズを聴く。
- 歌唱、degreeでの把握、指板上での再現へ進む。
- 難易度は音数、degree語彙、音域、テンポ等を段階化する。
- ヒント、Review、別のKeyでのTransferを提供する。

### 9.3 Rhythm Echo

- 1〜2小節のリズムをカウントイン付きで聴く。
- リズムを思い出す、歌う、演奏する、自己評価する。
- 3/4、4/4、6/8、30〜240 BPMに対応する。
- テンポまたは開始位置を変えたTransferを作る。
- 準備中・再生中の停止後も再開できる。

### 9.4 Bassline Echo

- コード進行とベースラインを聴き、歌唱・記憶・演奏・Reviewを行う。
- Level 1〜3で使用する音の語彙を段階化する。
- sourceは生成、内蔵9 preset、対応するVault生成Bassline、または保存済みSource Basslineから選ぶ。Source Basslineは新しいPractice modeではなくBassline Echo内のsourceである。
- 4、8、12小節のChord Contextを扱い、セッション中のテンポを30〜240 BPMで変更できる。
- コード音の音色をピアノ系から選択し、Bass、Chord、Metronomeの再生組合せと音量を設定する。
- ListenとPlayで伴奏レイヤーを別々に設定できる。
- Source Basslineは1小節または2小節windowで練習し、前／次のwindowへ明示移動する。奇数小節の末尾は1小節windowとして表示し、空windowでは再生・録音・Reviewを無効化する。
- Level 3「元ライン（単音化）」はwindow内の全noteをcropしてから、同一onsetの最低音を決定的に選び、次のonsetでoverlapをclipする。同時発音の省略数とoverlap clip数を表示し、完全な原演奏とは称さない。
- exactな保存時和声がある場合、Level 1「ルート中心の簡略版」とLevel 2「コードトーン簡略版」をLevel 3のrhythmから決定的に導出する。和声gap・競合・比較不能時は推測や部分変換をせず理由付きで無効化する。
- Source Basslineではwindow移動とTransferを混同せず、Transferは利用不可理由を表示する。Record & Compareは既存機能を再利用し、自動採点を追加しない。

### 9.5 Root Motion Echo

- 2〜8音のコードroot列を聴き、指板上で再現する。
- 生成sourceまたは条件を満たすVault進行を使用する。
- 生成sourceは2～8音すべてに対応する。Vault由来のroot pathは、選択sectionに選択音数以上のコードrootがある場合だけ利用でき、要求音数を黙って短縮しない。
- Vault由来で必要数のrootがない場合は、その音数を無効化するか「選択した音数に必要なコードrootが不足」と表示する。短い音数、別section、または生成sourceを選択する。
- 5～8音も、Vault sectionに十分なrootがあり、現在の弦数・フレット範囲で合法な運指pathを構成できる場合に利用できる。
- 各遷移で実際に選ばれたsource/targetの運指を指板と要約へ表示する。
- Review後に別の開始音へTransferできる。
- 音数設定はPractice dataへ保存する。
- Vault進行のコードrootとタイミングだけを使い、元ベースラインとは見なさない。

### 9.6 Chord Context / Vault連携

- sourceは生成、内蔵preset、Vaultから選ぶ。
- Vault pickerは保存済みで適格な進行だけを表示する。
- 対応条件は、確定Key、30〜240 BPM、4/4、連続した正しいタイミング、1/2/4/8/12小節、最大48コードである。
- Vaultから切り離したprivacy-safeなsnapshotを練習へ渡す。元ファイルpath、MIDI bytes、メモ等は渡さない。
- 元のVault進行が後で変更されても、開始済みセッションのsnapshotは変化しない。

### 9.7 Record & Compare

- ユーザーが明示的に有効化して録音permissionを求める。
- 入力deviceとチャンネルを選択できる。
- カウントイン後に録音し、停止、録音テイク再生、Reference再生、保存または破棄を行う。
- ReferenceとTakeは同時再生せず切り替える。
- 保存前に「聴く」または明示的にスキップする。
- 保持したテイクは録音専用ストレージへ保存し、練習履歴には不透明なtake IDだけを記録する。
- permission拒否やdevice不在でも、録音なしで練習を続行できる。
- 自動採点は行わない。

### 9.8 Practice History

- 完了した練習の日時、mode、source種別、テンポ、自己評価、利用設定を保存する。
- Chord Context履歴にはsource snapshot、MIDI、音声、device情報を複製しない。
- 保存済みTakeがある場合も参照IDだけを保持する。
- Source Bassline履歴はIdea/blockの論理参照、snapshot signature、1/2小節window、Level、単音化と省略／clip数、自己評価だけを保持し、note列や保存時和声を複製しない。元ブロック削除後も履歴は読めるがreplayは行わない。

## 10. Progression Advisor

- 保存済み進行を基に、続きまたは置換候補を生成する。
- 提案はコード進行、説明、適用位置を含み、ユーザーが確認後に編集Draftへ追加する。
- Vault内から限定された参考コンテキストを選択できる。
- OpenAI利用時はユーザー自身のAPI keyをOS keychainへ保存する。
- 送信前に内容を確認できる。
- ローカルLLM設定を使用する場合は、許可されたloopback endpointへだけ接続する。
- 提案は自動保存せず、通常の進行編集・保存検証を通す。

## 11. Live MIDI

- Web MIDI対応のMIDI入力deviceを選択・接続する。
- Mini Modeで入力中の構成音と推定コードを表示する。
- 検出表示は短い安定化期間を設け、瞬間的な揺れを抑える。
- コード履歴から範囲を選び、Vaultへ保存するためのimport dialogへ渡す。
- 既定MIDI device設定はVault外のローカル設定として保存する。
- Text ProgressionのCustom Voicing録音にも同じLive MIDI入力基盤を使用する。

## 12. 保存・バックアップ・復旧

### 12.1 Vault

- 形式: schema検証されたJSON、`fileVersion: 2`
- 論理保存先: AppData配下の `loopvault/data.json`
- 保存は一時ファイルを書いてからrenameする原子的更新を使う。
- 起動時に既存データのbackupを作成し、最新20件を保持する。
- JSON破損時は元データをcorrupt fileへ退避し、空データで上書きせずRecoveryを表示する。
- 一部Ideaだけが不正な場合、正常Ideaを読み込み、不正recordをquarantineする。
- v1データは`sourceBassline`なしのv2へ決定的に移行する。v2より新しいversionはreadonlyで開き、書き込まない。
- 完全なVault JSONはlocal save、export、import、mergeの各境界でUTF-8 16 MiB上限を検証する。snapshot単体は最大8,192 notesかつcanonical UTF-8 1 MiBで、どちらかを超えた時点で拒否する。
- 未対応の将来fileVersionはreadonlyで開き、既知schemaとして保存しない。

### 12.2 Import / Export

- Vault全体をJSONとして外部pathへexportする。
- importはReplaceまたはMergeを選択する。
- MergeでIDが衝突した場合は`updatedAt`が新しいIdeaを採用する。
- import時もschema検証とquarantineを適用する。
- `sourceBassline`はexport/import対象であり、unknown/禁止field、note/timing上限、canonical order、signature、Vault全体上限を検証する。不正な外部snapshotが1件でもあれば書込み前にimport全体を拒否する。
- Practice dataはVaultとは別ファイル・別backupとして管理する。

### 12.3 録音と設定

- Record & Compareの音声は録音専用のローカルbinary storeへ保存する。
- Vault JSONや練習履歴へ音声bytesを埋め込まない。
- 音量、試聴、MIDI device等の一部UI設定はローカルpreferencesへ保存する。
- OpenAI API keyは平文JSONではなくOS keychainへ保存する。
- Practice dataは`fileVersion: 2`を使用し、v1からSource Bassline Historyなしで移行する。将来versionはreadonly/non-writingとし、既存のrevision/CAS、backup、recovery、quarantineを維持する。

## 13. Settings

| 区分 | 主な設定・操作 |
| --- | --- |
| 一般 | UI言語、月間目標、ローマ数字表示、試聴音量・音色、build/version情報 |
| Live MIDI | 既定MIDI入力device、再接続・device更新 |
| Progression Advisor | provider、model、API key、ローカルendpoint |
| 録音 | Record & Compareの入力device、入力channel |
| データ | Vault保存場所、JSON export/import、backup復元 |
| 解析とログ | Accuracy First、pre-analysis、解析feature flag、補正ログ、ローカル評価データ管理 |

解析と評価用の詳細設定は通常利用では変更不要であり、変更は次回解析から適用する。

## 14. セキュリティとプライバシー境界

- MIDI/audio bytes、個人path、device ID、録音内容をログや共有reportへ自動出力しない。
- 解析修正ログには採用・修正したラベル等の最小情報だけを記録し、MIDI本体、path、Idea名、メモを保存しない。
- Bass Practiceへ渡すVault snapshotは必要なコード・Key・BPM・論理参照だけに限定する。
- 外部URLやローカルpathは自動実行せず、対応拡張子と明示操作を確認する。
- Progression Advisorのネットワーク送信は明示操作時だけ行う。
- テレメトリによる自動収集機能は持たない。

## 15. 現行制約

- MIDIコード検出はヒューリスティック解析であり、複雑なVoicing、非和声音、曖昧な境界では修正が必要になる。
- 和声コアは素材のVoice構成によっては標準解析と同じ表示・コード列になる。必ず異なる結果を作るモードではない。
- Text Progression Entryは4/4と1/2/4コード毎小節に限定され、任意リズム、3コード毎小節、休符、反復記号を扱わない。
- Chord DojoのFlowは4/4のみ。L3以上はKey等の成立条件がある。
- Bass PracticeのVault sourceは適格条件を満たす保存済み進行だけを表示する。
- Record & Compareは自己比較用であり、ピッチ・リズムの自動採点を行わない。
- ブラウザpreviewのVaultはメモリ保存であり、reload後の永続性を保証しない。
- Windows以外の配布・サポートはv1.1.0の正式範囲外である。
- Source BasslineはP5.22以後に明示opt-inで保存したブロックだけが対象で、既存ブロックへの自動backfillはない。Level 1/2はexactな保存時和声を証明できないwindowでは利用できない。
- Vault由来Root Motionの5～8音は、選択sectionに十分なコードrootがない場合や、指定した弦数・フレット範囲で合法なpathを作れない場合は利用できない。

## 16. 互換性

- v1.0.0からv1.1.0への既知のbreaking changeはない。
- Vaultは`fileVersion: 1`から`2`へ、既存内容を保持し`sourceBassline`なしで移行する。将来versionを既知schemaとして上書きしない。
- Practiceは`fileVersion: 1`から`2`へ既存履歴を保持して移行する。新しい設定は欠損時defaultを補う後方互換方式で読み込む。
- 既存の生成Basslineはlegacy generated-default互換として利用できる。

## 17. 関連文書

- [README](../README.md)
- [v1.1.0 Release Notes](releases/v1.1.0.md)
- [現行MIDIコード検出仕様](current-midi-detection-spec.md)
- [Current App Technical Handoff](current-app-technical-handoff.md)
- [ローカル評価データの扱い](local-data.md)
- [P5.22 Source Bassline Practice](phase5.22/README.md)
- [P5.23 Timeline Candidate Legibility](phase5.23/README.md)

## 18. 変更管理

本書はv1.1.0の実装スナップショットである。2026-08-25 revisionは、masterへ統合済みのP5.22 Source Bassline Practice、P5.23 Timeline Candidate Legibility、CaptureのVault保存フォーム境界修正までを反映する。以後の機能追加では、production code、schema、ユーザー受入れ結果を確認し、対象versionを明示した新しいrevisionとして更新する。過去のPhase reportや評価reportは判断根拠として参照できるが、それ自体を現在の製品機能とはみなさない。
