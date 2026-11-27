# 機能(画面ごと)

Loop Vault の画面ごとの機能です。画面の名前はサイドバー(`src/components/AppShell.tsx`)に合わせ、Vault の中で開く進行エディタも 1 つの画面として書きます。画面上部の帯(試聴の音色・BPM・メトロノーム・音量・MIDI の状態)は、どの画面でも同じです。

## ホーム

- 日替わりの「今日のループ」で、試聴・お気に入り・「他のループ」での入れ替え(元に戻す付き)・MIDI を DAW へ書き出せます(`src/views/HomeView.tsx`、`src/views/home/todayLoop.ts`)。
- 「続きから」は、Voicing Loop・Chord Dojo・Bass Practice のうち最後にやった練習、無ければ最後に触った進行を開きます(`src/views/home/useHomeSummary.ts`)。
- 「最近入れた進行」では試聴・Voicing Loop・進行を開く操作ができ、「自分の引き出し」の「よく開く」では今週よく開いた順に進行を開けます(`src/views/HomeView.tsx`)。
- 「練習」の各行には、直近の練習の様子(今日の回数や前回やった日)とこの 7 日の印が出て、押すとその練習へ移ります(`src/views/HomeView.tsx`、`src/views/home/practiceWeek.ts`)。
- 「キーで聴く」は 12 キーの車輪からキーを選び、そのキーの進行を試聴し、多い時は残りを Vault で見られます(`src/views/HomeView.tsx`、`src/views/home/homeKeys.ts`)。
- まだ 1 件も無い時は、MIDI・コード譜のテキスト・サンプル進行 3 件の案内が出ます(`src/components/FirstCaptureGuide.tsx`)。
- 主なファイル: `src/views/HomeView.tsx`、`src/views/home/useHomeSummary.ts`、`src/views/home/todayLoop.ts`、`src/views/home/homeKeys.ts`

## 取り込む(MIDI・テキスト・鍵盤で入れる)

- MIDI は最初の画面に落とすか「ファイルを選ぶ」から読み込み、「取り込み前の確認」でパートの表示・消音・ソロ・役割と、「線で分ける」、和音の読み方(分けない/アプリに任せる)を決めて「解析する ▶」を押します(`src/views/CaptureView.tsx`、`src/components/pre-analysis/PreAnalysisWorkspace.tsx`)。
- 解析後は進行エディタと同じ画面で、コード名・音・カードの区切りを直し、新しい曲として Vault に保存するか、今ある曲に足せます(`src/views/CaptureView.tsx`、`src/components/correction-workspace/CorrectionWorkspace.tsx`)。
- ヘッダーの「テキスト」に切り替えると、コード譜を書くか貼り付けられます。`|` で小節を分け、カンマやダッシュでも区切れ、`.` は前のコードのくり返し、歌詞の行は読み飛ばします(`src/components/capture/TextUnifiedWorkspace.tsx`、`src/components/capture/TextProgressionCapturePanel.tsx`)。
- 「鍵盤で入れる」を ON にすると、Live MIDI の鍵盤で弾いた和音が入力に足されます。長さ(1 小節・2 拍・1 拍)・休符・1 つ戻すから選べます(`src/components/capture/TextUnifiedWorkspace.tsx`、`src/components/capture/KeyboardEntryBand.tsx`)。
- テキストのカードは、選んだカードの音を基本・シェル・ルートレス A/B・シェル+上の三和音・4 度積みと、テンションを足す・広げる・転回で直せます。直す範囲はこのカード・同じコード・ぜんぶから選べます(`src/components/capture/TextCardDock.tsx`)。
- 名前・キー・BPM・拍子を決めて「Vaultに保存」を押すと、続けて Voicing Loop で練習するか、進行エディタで開けます(`src/components/capture/TextCaptureFields.tsx`、`src/views/CaptureView.tsx`)。
- 主なファイル: `src/views/CaptureView.tsx`、`src/views/capture/CaptureEntry.tsx`、`src/components/capture/TextProgressionCapturePanel.tsx`、`src/components/pre-analysis/PreAnalysisWorkspace.tsx`、`src/components/correction-workspace/CorrectionWorkspace.tsx`

## 進行エディタ

- Vault の進行を開くと、題名・お気に入り・コードのコピー・MIDI を DAW へ・タグ・メモ・キー/拍子/小節数/取り込み元/保存日が上の帯に並びます(`src/views/ProgressionWorkspacePage.tsx`)。
- 「確かめる」と「音を直す」の 2 つのモードがあります。音を直すでは、空いた所をクリックして足す、右クリックやなぞりで外す、上下ドラッグで高さを変える、Ctrl+ドラッグで範囲を選ぶ、Delete で消す、R で戻す、Ctrl+Z で元に戻す、ができます(`src/components/correction-workspace/CorrectionWorkspace.tsx`)。
- カードは ←→ で前後へ移り、1〜4 でコード名の候補、N で音を直す、M で次とつなぐ、S で分ける、Delete で消す、右クリックでメニュー(つなぐ・消す・保存する範囲)を開けます(`src/components/correction-workspace/CorrectionWorkspace.tsx`、`src/components/correction-workspace/CardContextMenu.tsx`)。
- 要確認の所を `[` `]` で前後にたどれ、A/B で元の音と直した音を聴き比べ、Space で再生・停止、Home で先頭へ移れます(`src/components/correction-workspace/CorrectionWorkspace.tsx`)。
- 保存は「上書き保存」のほか「別の版として保存」(全部/選んだ範囲)と「変更を捨てる」があり、編集したまま移ろうとすると保存するか捨てるかを確認します(`src/components/correction-workspace/WorkspaceSaveForm.tsx`、`src/views/ProgressionWorkspacePage.tsx`、`src/App.tsx`)。
- 「そのほか」から複製・この曲の情報・元の MIDI と以前の操作・この進行の削除を開けます(`src/views/ProgressionWorkspacePage.tsx`、`src/views/ProgressionDetailView.tsx`)。
- 主なファイル: `src/views/ProgressionWorkspacePage.tsx`、`src/views/ProgressionDetailView.tsx`、`src/components/correction-workspace/CorrectionWorkspace.tsx`、`src/components/correction-workspace/WorkspaceSaveForm.tsx`

## Vault

- 検索はコード名と度数(2-5-1、ii-V-I など)ででき、`/` で検索欄に移れます(`src/views/VaultView.tsx`、`src/views/vault/vaultLibrary.ts`、`src/views/vault/useVaultKeyboardSelection.ts`)。
- 24 キーの帯と、お気に入り・取り込み元(MIDI/テキスト/Live MIDI)・長さ・タグの絞り込み、新しい順/名前順/長さ順/最近練習した順の並べ替えがあります(`src/views/VaultView.tsx`、`src/views/vault/vaultLibrary.ts`)。
- 「選ぶと鳴らす」を ON にすると、行を選ぶたびにその進行が鳴ります。↑↓ で選び、Space で試聴、Enter で開き、C でコードをコピー、S でお気に入りを切り替えます(`src/views/VaultView.tsx`、`src/views/vault/useVaultKeyboardSelection.ts`)。
- 行を選ぶと右にコード・タグ・メモ・同じ動きの進行(キー違い)が出て、試聴・コードのコピー・「開いて編集」・MIDI を DAW へドラッグ・Voicing Loop/Chord Dojo への受け渡しができます。使える進行では Bass Practice へも渡せます(`src/views/VaultView.tsx`)。
- 進行のない曲は「進行のない曲」から開き、曲名・BPM・キーを直せます(`src/views/VaultView.tsx`、`src/views/DetailView.tsx`)。
- 空の時は MIDI・テキスト・サンプル進行 3 件の案内が出ます(`src/components/FirstCaptureGuide.tsx`)。
- 主なファイル: `src/views/VaultView.tsx`、`src/views/vault/vaultLibrary.ts`、`src/views/vault/useVaultLibraryFilters.ts`、`src/views/DetailView.tsx`

## Voicing Loop

- 最初は「練習する進行」の一覧です。前回の記録があれば上に「続きから」が出て、すべて/お気に入り/最近使ったの絞り込みと、タイトル・コード・キーの検索ができます(`src/views/voicing-loop/VoicingLoopPicker.tsx`)。
- 行を選ぶと右にキー・BPM・小節数・コード・保存日などが出て、Space で試聴、選んだ行をもう一度押すか Enter で練習を始めます(`src/views/voicing-loop/VoicingLoopPicker.tsx`)。
- 練習では音の出どころを保存した音・元MIDI・カスタム・自動生成から選び、自動生成では「形 ▼」で基本・シェル・ルートレス A/B・シェル+上の三和音・4 度積み、部品でテンションを足す・広げるを付けられます。「この進行を元MIDIに」でカードをまとめて切り替えられます(`src/views/ProgressionVoicingPracticeView.tsx`、`src/views/voicing-loop/ShapeMenu.tsx`)。
- 「覚える」(押さえ方を表示)と「思い出す」(コード名だけ)を切り替えられ、おすすめ運指の表示・手での編集・保存・おすすめに戻すができます(`src/views/ProgressionVoicingPracticeView.tsx`)。
- 進行の帯ではカードを押してその場へ移り、右クリックで区間 A/B を付けてその区間だけを繰り返せます。全体図・追従・8/12/16 の表示倍率も使えます(`src/views/ProgressionVoicingPracticeView.tsx`)。
- 再生は開始・一時停止・最初から・停止、キー移調・オクターブ ±2・カウントイン・お手本の音を設定できます。MIDI 鍵盤をつなぐと「弾き合わせ」が使え、コード一致/押さえ方どおりの 2 通りで合っている音と達成を出します(`src/views/ProgressionVoicingPracticeView.tsx`、`src/views/voicing-loop/usePlayAlong.ts`)。
- 主なファイル: `src/views/ProgressionVoicingPracticeView.tsx`、`src/views/voicing-loop/VoicingLoopPicker.tsx`、`src/views/voicing-loop/ShapeMenu.tsx`、`src/views/voicing-loop/usePlayAlong.ts`

## Chord Dojo

- ホームには「続きから」、定番の進行(Jazz Progressions・Original Practice)、2-5-1 Master、耳で弾く、ボイシングドリル、ガイド練習、型の一覧、自分の進行、登録した音が並びます(`src/views/chord-dojo/DojoHome.tsx`)。
- 進行の練習は「① 見て弾く → ② 覚えて弾く → ③ テンポで弾く」の順で、鍵盤の図・運指・コードごとのカードを見ながら弾きます(`src/views/chord-dojo/ChordDojoView.tsx`、`src/components/practice/PracticeKeyboard.tsx`)。
- MIDI 鍵盤をつなぐと弾いた音で自動判定し、つないでいない時は「答えを見る」から「弾けた/まだ」で自分で判定します(`src/views/chord-dojo/ChordDojoView.tsx`)。
- ③ はテンポで通し、コードごとの合否と「x/y 合いました」を出します(`src/views/chord-dojo/ChordDojoView.tsx`)。
- 今日の練習を終えると「今日、自分の語彙に増えたもの」と記録が出ます。ホームの「コードの型」では 12 キーの達成を格子で見られます(`src/views/chord-dojo/ChordDojoView.tsx`、`src/views/chord-dojo/DojoHome.tsx`、`src/views/chord-dojo/DojoKeyGrid.tsx`)。
- ガイド練習は Lv1〜Lv8 と総合の 9 段で、見本を見て弾きながら順に進みます(`src/views/chord-dojo/GuidedCourseView.tsx`、`src/views/chord-dojo/DojoHome.tsx`)。
- 「耳で弾く」はレベル 1〜5 の問題を聴いて鍵盤で当て、成績と記録を見られます(`src/views/ear-practice/EarPracticeView.tsx`)。
- 主なファイル: `src/views/chord-dojo/ChordDojoView.tsx`、`src/views/chord-dojo/DojoHome.tsx`、`src/views/chord-dojo/GuidedCourseView.tsx`、`src/views/ear-practice/EarPracticeView.tsx`

## Bass Practice

- 最初に 5 つの練習(度数・リズム・ルートの動き・コード進行のベース・MIDI のベースライン)から選びます。カードにはこの 7 日の印と最後に弾いた日が出ます(`src/features/bass-practice/ui/BassPracticeHome.tsx`)。
- 記録があれば「続きから」で最後にやった練習へ戻れます(`src/features/bass-practice/ui/BassPracticeHome.tsx`)。
- 楽器は 4 弦/5 弦、右利き/左利き、フレットの範囲(0〜7・0〜12・5〜17)を選べ、どの練習にも同じ設定が使われます(`src/features/bass-practice/ui/BassPracticeHome.tsx`、`src/features/bass-practice/ui/BassPracticeModeView.tsx`)。
- 聴いてまねる練習は、聴いて歌う(任意)か思い出してからベースで弾きます。「録って弾く」で録った音を「お手本・自分・重ねて」で聴き比べ、度数・リズム・ルートの動きでは 1〜4 で自己評価し、度数は「別のキーで」も使えます(`src/features/bass-practice/ui/BassPracticeView.tsx`)。
- コード進行のベースとルートの動きは Vault の進行も使えます(`src/features/bass-practice/ui/BassPracticeHome.tsx`、`src/features/bass-practice/ui/BasslinePracticeView.tsx`、`src/features/bass-practice/ui/RootMotionPracticeView.tsx`)。
- MIDI のベースラインは MIDI のお手本と自分の録音を 1 音ずつ比べます。入力チャンネル(自動/左/右/モノラル)と「録音を残す」は入力チップから設定します(`src/features/bass-practice/ui/BassPracticeModeView.tsx`、`src/features/bass-practice/midi/LibraryView.tsx`)。
- 主なファイル: `src/features/bass-practice/ui/BassPracticeModeView.tsx`、`src/features/bass-practice/ui/BassPracticeHome.tsx`、`src/features/bass-practice/ui/BassPracticeView.tsx`、`src/features/bass-practice/ui/BasslinePracticeView.tsx`、`src/features/bass-practice/ui/RootMotionPracticeView.tsx`

## Live MIDI

- サイドバーの Live MIDI、取り込むの「鍵盤で弾いて拾う」、上部の MIDI パネルの「Live MIDI（ミニ表示）を開く」から開きます(`src/components/AppShell.tsx`、`src/components/MidiConnectionPanel.tsx`、`src/views/capture/CaptureEntry.tsx`)。
- デスクトップ版では小さい別窓が開き、ほかのアプリの上に出すかを設定で選べます。ブラウザで動かした時は同じ内容が画面右下の小窓で開きます(`src/App.tsx`、`src/liveMidi/miniWindowController.ts`)。
- 窓には MIDI 機器の選択・探し直し、押している鍵(88 鍵)、押さえている音とベース音、コード名(確定/仮判定)が出ます(`src/components/LiveMidiMiniMode.tsx`、`src/components/LiveMidiKeyStrip.tsx`)。
- 弾いたコードは直近 9 個の並びとして残り、まとめて消せます(`src/components/LiveMidiMiniMode.tsx`)。
- 「保存…」を押すと、残す範囲(すべて・最後の 4・最後の 8、または始まりと終わりのコード)を選び、試聴してから新しい曲として保存するか、今ある曲に足して Vault に保存できます(`src/components/LiveMidiImportDialog.tsx`)。
- 「保存しない」と「続けて弾く」も選べます(`src/components/LiveMidiImportDialog.tsx`)。
- 主なファイル: `src/components/LiveMidiMiniMode.tsx`、`src/components/LiveMidiKeyStrip.tsx`、`src/components/LiveMidiImportDialog.tsx`、`src/liveMidi/miniWindowController.ts`、`src/components/MidiConnectionPanel.tsx`

## 設定

- 左の一覧は「表示」「MIDI 入力」「データ」「このアプリについて」「開発者向け」の 5 つです(`src/views/SettingsView.tsx`)。
- 表示では、コードカードに度数(I/ii/V など)を出すか、Windows の標準タイトルバーを使うかを変えられます(`src/views/SettingsView.tsx`、`src/components/shell/shellPreferences.ts`)。
- MIDI 入力では、使う機器、起動時に自動でつなぐか、接続テスト、Live MIDI の小窓を常に手前に出すか、Bass Practice の録音チャンネルを決められます(`src/components/LiveMidiSettingsSection.tsx`、`src/features/bass-practice/recording/ui/BassPracticeRecordingSettingsSection.tsx`)。
- データでは、保存先と進行/曲の数、フォルダを開く・パスをコピー、JSON の書き出し、読み込み(マージ/すべて置き換え)、自動バックアップからの復元ができます(`src/views/SettingsView.tsx`)。
- このアプリについてでは、版・データ形式・使っているピアノ音源の表示を見られます(`src/views/SettingsView.tsx`、`src/buildInfo.ts`)。
- 開発者向け(折りたたみ)では、解析の設定、進行エディタの計測、実 MIDI 評価データの操作、ビルド情報と、以前保存した OpenAI の API キーの状態確認・削除があります。AI の機能はなく、残っているのはこのキーの確認と削除だけです(`src/views/SettingsView.tsx`、`src/components/CorrectionMetricsSettings.tsx`)。
- 主なファイル: `src/views/SettingsView.tsx`、`src/components/LiveMidiSettingsSection.tsx`、`src/components/CorrectionMetricsSettings.tsx`、`src/features/bass-practice/recording/ui/BassPracticeRecordingSettingsSection.tsx`
