# Loop Vault Phase 3.9.2 実装報告書

作成日: 2026-07-23  
対象ブランチ: `feature/p3-9-2-style-voicing-practice`

## 1. 実装結果

Chord Dojoの既定動作をPhase 3.8.5の保存ボイシングResolverのまま維持し、セッション中だけ次の練習ターゲットへ切り替えられるようにした。

- 保存ボイシング（既定）
- 自動（クローズ）
- シェル 1-7
- オープン 1-7
- ルートレス A/B

実装入口は `src/views/PracticeView.tsx` と `src/components/practice/VoicingPracticeControls.tsx`。別の進行を選ぶと保存ボイシングへ戻り、Style ID、判定モード、フォールバック選択はVaultにもlocalStorageにも保存しない。

## 2. ドメイン実装

### 型・Catalog・対応判定

`src/domain/voicingPractice/types.ts` に、ターゲット源、Style ID、生成結果、左右手ノート、警告、判定モード、手の最大スパン設定を定義した。

`src/domain/voicingPractice/catalog.ts` と `compatibility.ts` で対応可否を判定する。ルートレスA/BはMVPとして7th系の品質を対象とし、triad、sus、slash chordなどは未対応として明示する。

### 決定的生成

`src/domain/voicingPractice/` に次を実装した。

- `closeAdapter.ts`: 既存 `voiceChordForPreview()` を変更せず利用
- `generateShell17.ts`: Root / 7thを中心としたシェル候補
- `generateOpen17.ts`: 左右の役割を分けた広い配置
- `generateRootless.ts`: 3rd / 7th必須のA/B候補
- `lowIntervalLimit.ts`: 低音域の近接音程制約
- `candidateTools.ts`: span、手の交差、候補比較
- `transitionCost.ts`: 声部連結コスト
- `optimizeProgression.ts`: 進行全体の動的計画法による選択

生成は乱数、現在時刻、環境状態を参照しない。同じ進行、Style、設定からは同じ結果を返す。1イベント最大48候補で、required toneを保てない場合は黙って音を省かず未対応にする。

### 判定

`src/domain/voicingPractice/exactPitchMatch.ts` は、指定されたMIDI note集合との一致を判定する。既定では全音を同じ量だけ移す `-24 / -12 / 0 / +12 / +24` の全体オクターブ移動を許可するが、音ごと・手ごとの移動は許可しない。

`src/domain/voicingPractice/pitchClassMatch.ts` は、任意で選べる緩いpitch class集合一致を行う。どちらもheld noteのみを使い、sustain noteは判定へ含めない。

既存Step / Flow、100 ms安定待ち、attack revisionを再利用するため、`src/domain/practice/types.ts` の `PracticeSessionContext` へ任意のmatcherを注入できるようにした。未指定時は従来の `matchPerformance()` をそのまま使う。

## 3. Chord Dojo統合

`src/views/PracticeView.tsx` で、選択中の進行全体からStyle planを一度生成し、安定event IDで各練習イベントへ対応付ける。

- L1: Style名、variant、左手／右手の推奨note名、色分け鍵盤を表示
- L2 / L3: Style名と音数だけ表示し、target note名と鍵盤Guideを隠す
- 事前試聴: `PlaybackController` の `explicitMidiNotesByEventId` へ現在の生成noteを渡す
- 未対応: 対象小節とコードを表示し、既定では開始・試聴を禁止
- 明示fallback: 未対応イベントだけ既存クローズ生成へ切り替え、「自動」と表示
- span: 左右別に12 / 14 / 16 semitoneを設定
- 判定: 指定音高／ピッチクラスを切り替え
- target変更: 実行中は確認し、変更時は現在周回、clean状態、イベント位置を破棄

`src/components/music-keyboard/PianoKeyboardVisualizer.tsx` と `PianoKey.tsx` は、左手Guideをdeep teal、右手Guideをmintで区別する。実際にどちらの手で押したかは判定しない。

### 実機確認後のUI修正

- 「進行を試聴」の横へ、既存画面と同じピアノ／エレピ音色セレクタを追加
- 進行全体のコードカードをクリック可能にし、現在のStyle／保存ボイシングで単音試聴
- コードカード選択と「いま」、現在位置、左右の鍵盤Guideを同じイベントへ連動
- 練習実行中は判定対象との不一致を避けるためコードカード試聴を無効化
- ピアノVisualizerの高さを `clamp(7.5rem, 16vw, 10rem)` へ縮小
- Keyが設定された進行ではL1/L2/L3のすべてで現在コードの横に進行のKeyを表示

## 4. 非永続化境界

Style練習では `recordPracticeRound()` を呼ばない。

`PracticeView` の通常終了、Flow自動保存、画面unmount、アプリ終了前flushの全経路にStyleモード判定を入れた。このため次は更新されない。

- `provisional`
- `confirmedLevel`
- `lastPracticedAt`
- practice fingerprint
- Queueの確認待ち状態
- Style生成note、variant、fallback結果

端末設定として保存するのは、`src/voicingPractice/preferences.ts` のversion付きlocalStorageデータに含む左右spanと全体オクターブ移動許可だけ。Vault schemaと`fileVersion = 1`は変更していない。

## 5. Chord Drip参照結果

`D:\dev\Chord Drip作成` の既存voicing処理とLow Interval Limitを監査し、仕様上の考え方だけを参照した。実装詳細は `docs/phase3.9.2-chord-drip-voicing-audit.md` に記録した。

Loop VaultからChord Drip repositoryへのruntime import、seed tie-break、ファイル依存は追加していない。

## 6. テスト・ビルド

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | 137 files / 761 tests PASS |
| `cargo test` | 24 tests PASS |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| `git diff --check` | PASS |

追加テストはCatalog、対応判定、span、Low Interval Limit、決定性、A/B、進行最適化、exact pitch、pitch class、カスタムmatcher、左右Guide、L2/L3非表示、未対応fallback、音色切替、コードカードと鍵盤の連動、Style試聴、Style進捗非保存を対象とする。

### 32イベント生成時間

同じ32イベントを各Styleでwarm-up後20回実行したローカル実測値。

| Style | median | p90 | max |
|---|---:|---:|---:|
| 自動（クローズ） | 0.09 ms | 0.21 ms | 0.21 ms |
| シェル 1-7 | 2.05 ms | 2.76 ms | 3.68 ms |
| オープン 1-7 | 1.41 ms | 1.72 ms | 1.92 ms |
| ルートレス A/B | 9.97 ms | 10.74 ms | 10.86 ms |

全StyleがPhase目標の100 ms以内。値は2026-07-23の開発機上の計測であり、端末差はあり得る。

## 7. 生成物

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## 8. 既知の制約・未確認

- 実MIDI鍵盤での手触り、手の届きやすさ、音楽的な滑らかさはユーザー実機確認待ち。
- 左右手は推奨表示であり、入力された手そのものは識別しない。
- rootless固定A／固定B選択、Drop 2、Quartal、1-5-10、Style EditorはPhase対象外。
- Styleごとの練習履歴や段位は意図的に保存しない。
- Webビルドには既存の約983 kB JavaScriptチャンク警告が残る。今回の機能の失敗ではないが、将来のcode splitting候補。
