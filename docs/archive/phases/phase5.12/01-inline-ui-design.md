# Phase 5.12 Inline UI Design

## Product Path

必要操作は従来と同じ2操作である。

1. MIDIを選ぶ、またはdrag-and-dropする
2. `この構成で解析`を押す

読み込み後も`CaptureView`内に留まり、別画面・modal・確認・次へ操作はない
(`src/views/CaptureView.tsx`)。

## Compact

単一source、pitched Voice 1件、drumsなし、warningなし、高信頼roleのとき、
`PreAnalysisWorkspace`は次だけを常時表示する。

- ファイル名
- SMF形式、長さ、BPM、拍子
- 自動選択された解析対象の要約
- `パート詳細`
- `MIDIを追加`
- `この構成で解析`

詳細を開かなければPiano RollとVoice編集は表示しない。解析は自動開始せず、
同じ解析ボタンを押す (`src/components/pre-analysis/PreAnalysisWorkspace.tsx`)。

## Expanded

次のいずれかで詳細を自動展開する
(`needsPreAnalysisReview()` in `src/storage/preAnalysisSettings.ts`)。

- pitched Voice 2件以上
- drumsあり
- `melody-weak`あり
- role confidence 0.45未満
- 複数MIDI
- warningあり
- SMF Format 0の同一sourceに複数Channel

詳細面は次を含む。

- Canvas Piano Roll
- Voice色と同じ色の行マーカー
- `おまかせ（推奨）`、`和声＋ベース`、`伴奏のみ`、`全パート`、`カスタム`
- 自動推定へ戻す
- source単位のグループ
- GM音色名、Track名、Track/Channel、note数、音域
- role、推定confidence、要確認、program change、duplicate表示
- 解析対象、Solo、Mute、表示の独立操作
- source表示 / Mute / 削除
- 再生 / 停止 / Follow / zoom

Voiceは`sourceFileId × trackIndex × midiChannel`で分離済みのsessionを受け取る。
SMF Format 0 / 1 Track / 11 Channel fixtureは11 Voiceを表示する。

## State Preservation

`MIDIを追加`または同一画面へのdropでは`addMidiSources()`を使う。

- workspaceをremountしない
- zoomを維持
- 既存Voiceのmanual roleを維持
- Custom presetを維持
- 新sourceだけ一時ハイライトし、その先頭Voiceを選択
- exact duplicateは二重加算せずwarning表示
- Analyzeボタンは1個のまま

roleまたは解析対象を変更した場合だけCustomへ移る。Muteと表示切替は再生・表示の
補助状態なのでpresetを変更しない
(`src/components/pre-analysis/PreAnalysisWorkspace.tsx`)。

## Accessibility / Responsive

- details buttonは`aria-expanded` / `aria-controls`を持つ。
- presetは`radiogroup` / `radio`で表現する。
- 各icon buttonはVoice名またはsource名を含む`aria-label`を持つ。
- Canvasはkeyboard focus可能で、左右キー操作を説明する`aria-label`を持つ。
- 選択は色だけでなくcheckbox、role、文字、行境界でも判別できる。
- 390×844px実ブラウザ確認で`scrollWidth = clientWidth = 390`、横あふれなし。
- Voice一覧は内部scrollにし、長いMIDIでもページ全体をVoice数だけ伸ばさない。

## Intentionally Unchanged

- chord detection / candidate generation / ranking
- Voice role heuristicとweight
- PlaybackController
- Live MIDI / Chord Dojo
- Vault保存、schema、fileVersion
- Phase 5.2、Phase 6
