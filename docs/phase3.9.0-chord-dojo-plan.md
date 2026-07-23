# Loop Vault Phase 3.9.0 Codex作業指示書
## Chord Dojo MVP — 採集した進行を、弾ける進行にする
### L1〜L3・ステップ／フロー・仮クリア／別日確定

---

## 0. 結論

Phase 3.9.0では、Vaultへ保存したコード進行をMIDIキーボードで練習する常設機能「Chord Dojo」を実装する。

このPhaseの目的は、保存数や練習点数を増やすことではない。

```text
良い進行を採集する
↓
Vaultから再発見する
↓
コード名・度数から鍵盤上の形を思い出す
↓
作曲中に自分の手で鳴らせるようにする
```

Phase 3.9.0の製品MVPは次に限定する。

- 常設タブ「練習」
- 練習キュー
- L1〜L3
- ステップモード
- フローモード
- 3段階の判定寛容さ
- 仮クリア
- 別日の確定
- 最小限の練習進捗保存
- Phase 3.8.5のVoicing Resolverを使ったL1ガイド
- 実装後にユーザーへ渡す具体的な実機確認手順書

Phase 3.9.0では次を実装しない。

- L4／L5の移調練習
- ミックスセッション
- アルペジオ専用判定
- 点数、ランキング、正答率グラフ
- 内蔵ピアノ音源
- MIDI Thru
- 五線譜
- 本格的なSRS

Phase 3.9.0のテーマ:

**「保存したコード進行を、見れば分かる状態から、自分の手で思い出せる状態へ移す」**

---

# 1. 現行実装を前提にする

Phase 3.9.0は、次の既存資産を再利用する。

## 1.1 Vault / Progression

- `SavedProgressionBlock`
- 安定したコードevent ID
- Progression Index
- Progression Detail
- Vaultのライブラリ／一覧
- Favorite / pinned
- Key / mode / BPM / time signature
- `applyVaultChange()`
- autosave / backup / close guard

## 1.2 MIDI入力

- Rust `midir` transport
- `LiveMidiService`
- `defaultLiveMidiStore`
- channel × noteのheld state
- channel別CC64
- connection ID
- device reconnect
- preferred device
- Live MIDI設定画面

新しいMIDI入力経路を作らない。

## 1.3 Voicing Memory

Phase 3.8.5で実装済みの次を再利用する。

- `sourceVoicing`
- `practiceVoicingOverride`
- `simultaneous-voicing`
- `aggregated-note-set`
- `capturedForChordKey`
- compatibility / stale判定
- `practice → source → generated`のResolver
- 保存Voicingの鍵盤表示
- generated fallback

元MIDI由来の低confidence／未確認の集約音集合を、Dojo側で勝手に強い正解扱いしない。

## 1.4 Playback

- 既存`PlaybackController`
- 同時再生1件の原則
- 既存コード進行試聴

Dojoのメトロノームと事前試聴も既存の単一再生境界へ従う。

## 1.5 UI基盤

- 共通Modal
- focus trap / focus restore
- Lucide
- 日本語 / English
- IME guard
- 青黒＋ミント
- 既存Header
- 既存keyboard操作

---

# 2. Chord Dojoの責務

## 2.1 Dojoが行うこと

- 今日練習すべき進行を提示する
- コードまたは度数を順番に提示する
- MIDIキーボードのheld noteと対象コードを照合する
- 正しく押さえたときだけ次へ進める
- ステップとフローを提供する
- 仮クリアと別日確定を管理する
- L1ガイドに保存Voicingまたはgenerated Voicingを表示する

## 2.2 Dojoが行わないこと

- 演奏を点数化する
- 他ユーザーと比較する
- ミス数・正答率・練習時間を長期保存する
- 演奏音を録音する
- リズム精度を採点する
- Live MIDI Mini Modeを置き換える
- Voicing Snapshotを正解判定そのものにする
- AI／LLMで演奏を評価する
- MIDI解析結果を再判定する

## 2.3 Live MIDI Mini Modeとの違い

```text
Live MIDI Mini Mode
→ 弾いたものを認識して表示する

Chord Dojo
→ お題を提示し、現在のheld noteが条件を満たすか照合する
```

同じMIDI transportを使うが、画面とdomainの責務は分ける。

---

# 3. Phase 3.9.0の範囲

## 3.1 必須

- 常設タブ「練習」
- Progression Detailの「練習する」
- Vault行の任意コンテキスト導線
- 練習キュー
- おすすめ順
- L1 / L2 / L3
- ステップモード
- フローモード
- 鍵盤ビジュアライザ
- held note表示
- guide voicing表示
- MIDIデバイス接続状態
- ゆるい / ふつう / きびしい
- 100ms安定判定
- 重複コードでの再アタック判定
- クリーン周
- 仮クリア
- 別日確定
- 練習進捗のoptional永続化
- 進行編集後のpractice stale判定
- Vault / Detail / Queueの段位バッジ
- 日本語 / English
- 実装後のユーザー実機確認書

## 3.2 条件付き

- セッション開始時の進行事前試聴
- テンポランプ
- Sidebarの折りたたみ
- 開発者向けPractice Clock可視化
- 練習日付のテスト用注入UI（productionでは非表示）

## 3.3 対象外

- L4 / L5
- `clearedKeys`
- 12キー移調
- ミックス練習
- アルペジオRolling Window
- 五線譜
- 音価・強弱・ベロシティ採点
- latency補正ウィザード
- MIDI Thru
- 音源なしコントローラ向け内蔵音源
- 練習履歴グラフ
- XP / streak / ranking
- AIコーチ
- LLM Provider変更
- Voicing抽出ロジック変更
- defaultAnalyzerMode変更
- PXF変更

---

# 4. 練習梯子 L1〜L3

## 4.1 L1 — 見て弾ける

表示:

- コード名
- 鍵盤上のお手本Voicing
- 現在押している鍵盤
- Bass
- 現在／次のコード

キー:

- 元キー

重要:

- お手本Voicingは「押さえ方の一例」
- 通常判定で同じオクターブ配置を強制しない
- Resolverの出自を表示する

```text
鍵盤で記録
元MIDI
元MIDIから推定
自動生成
```

## 4.2 L2 — 名前で弾ける

表示:

- コード名
- 現在押している鍵盤
- 現在／次のコード

表示しない:

- お手本Voicingのハイライト

キー:

- 元キー

## 4.3 L3 — 度数で弾ける

表示:

- ローマ数字
- 現在押している鍵盤
- 現在／次の度数

表示しない:

- コード名
- お手本Voicing

キー:

- 元キー

## 4.4 Key未設定時

L3はKey / modeが必要。

Keyがない進行では:

```text
L3を使うには進行のKeyを設定してください。
[Progression Detailで設定]
```

L1 / L2は利用可能。

## 4.5 レベル選択

ユーザーはいつでもL1〜L3を手動選択できる。

既定レベル:

```text
practiceがstale
→ L1

別日確認待ち
→ provisional level

confirmedLevelが1以下
→ confirmed + 1

confirmedLevelが2以上
→ L3
```

段位はアプリの提案であり、画面をロックしない。

---

# 5. お手本Voicingと正解判定を分離する

## 5.1 Guide Resolver

Phase 3.8.5のResolverを正式に再利用する。

```text
compatible practiceVoicingOverride
↓
verified / high-confidence simultaneous sourceVoicing
↓
generated fallback
```

Dojo用に別の選択順を再実装しない。

## 5.2 お手本の意味

```text
鍵盤に光る音
→ おすすめの押さえ方

正解判定
→ Chord Requirementsを満たすheld pitch class
```

L1で表示されたVoicingと異なる転回形・オクターブでも、判定条件を満たせば通過する。

## 5.3 aggregated-note-set

未確認の`aggregated-note-set`はResolverの既定ルールに従ってgenerated fallbackになる。

Dojo側が独自に自動採用しない。

## 5.4 stale Voicing

コード編集後にVoicingがstaleの場合:

- stale元Voicingをガイドに使わない
- generated fallbackを使用
- 小さく理由表示

```text
保存Voicingは編集前のコード用です。
自動生成のお手本を表示しています。
```

---

# 6. Chord Requirements

## 6.1 目的

コード名ごとに、演奏判定で必要・任意・禁止するPitch Classを構築する。

```ts
export interface PracticeChordRequirements {
  requiredPitchClasses: number[];
  optionalPitchClasses: number[];
  allowedPitchClasses: number[];
  requiredBassPitchClass?: number;
  chordKey: string;
}
```

## 6.2 Domain

新設候補:

```text
src/domain/practice/
  types.ts
  chordRequirements.ts
  matchPerformance.ts
  inputState.ts
  sessionMachine.ts
  cleanRound.ts
  progressionFingerprint.ts
  practiceProgress.ts
  recommendation.ts
  index.ts
```

React、Zustand、Tauri、Tone.jsへ依存しない。

## 6.3 共通ルール

- Pitch Classで判定
- 転回形自由
- オクターブ重複自由
- 同じPitch Classの重複数は判定へ影響しない
- held noteのみ使用
- sustained noteは可視化のみ
- stable前の一時的な音は誤答扱いしない
- partial chordは中立
- 構成外音を含むstable setは不通過
- Rootless VoicingはMVP対象外
- 押鍵が2音未満の場合は原則未完成
- 連続する同一コードでも新しいNote On／再アタックを必要とする

## 6.4 Perfect 5th

次の場合、5thは必須。

- power chord
- diminished / half-diminishedでb5がquality定義
- augmented / #5でaltered 5thがquality定義
- 明示的なb5 / #5

通常のperfect 5thは「ふつう」では任意。

## 6.5 Extension規則

### 7th

コード名に7thが明示されていれば、7thは「ゆるい」「ふつう」「きびしい」で必須。

### add9 / 6 / 6/9

明示されたadd toneは「ふつう」と「きびしい」で必須。

### 9th

- 3rd
- 7th
- 9th

を「ふつう」で必須。5thは任意。

### 11th

- 3rdまたはsus
- 7th
- 11th

を「ふつう」で必須。9thはコード表記で明示されない限り任意。

### 13th

- 3rd
- 7th
- 13th

を「ふつう」で必須。9th / 11thは明示されない限り任意。

### altered tension

`b9`、`#9`、`#11`、`b13`等が明示されていれば、「ふつう」と「きびしい」で必須。

## 6.6 寛容さ

### ゆるい

必須:

- Root
- 3rdまたはsus
- 明示7th
- qualityを定義するaltered 5th

省略可:

- 5th
- 6 / 9 / 11 / 13
- add tone
- 非本質的extension

用途:

```text
Fmaj9をFmaj7相当で通す
G13をG7相当で通す
```

### ふつう（既定）

必須:

- Root
- 3rdまたはsus
- 明示7th
- 明示された特徴的extension / add tone
- qualityを定義するaltered 5th

任意:

- 通常のperfect 5th
- 13コードの省略された9 / 11
- m11の省略された9等、表記上暗黙の中間extension

禁止:

- `allowedPitchClasses`外のstable pitch class

### きびしい

必須:

- ChordSymbolが明示する全主要Pitch Class
- 通常の5th
- 明示extension / alteration

追加:

- 分数コードのBassを最低held noteとして要求
- 通常コードもRootを最低音に要求するかは設定で分けず、MVPでは分数コードだけに限定
- 構成外音禁止

## 6.7 例

### Cmaj7

```text
ゆるい:
C E B

ふつう:
C E B
Gは任意

きびしい:
C E G B
```

### Fmaj9

```text
ゆるい:
F A E

ふつう:
F A E G
Cは任意

きびしい:
F A C E G
```

### G13

```text
ゆるい:
G B F

ふつう:
G B F E
D / A / Cは任意

きびしい:
G B D F E
明示されていない9 / 11は必須にしない
```

### Bm11

```text
ゆるい:
B D A

ふつう:
B D A E
F# / C#は任意

きびしい:
B D F# A E
```

### C6/9

```text
ゆるい:
C E

ふつう:
C E A D
Gは任意

きびしい:
C E G A D
```

### C/E

```text
ゆるい / ふつう:
C E
Gは任意
最低音は自由

きびしい:
C E G
最低held noteはE
```

---

# 7. 入力状態と安定判定

## 7.1 判定対象

```text
held notes
```

だけを使用する。

`sustained`は鍵盤上へ別色で表示してよいが、matcherへ渡さない。

## 7.2 Stable

完全一致または不一致候補が100ms変化しなかった場合に判定する。

```ts
PRACTICE_MATCH_STABLE_MS = 100;
```

## 7.3 Partial状態

required Pitch Classがまだ揃っていないが、foreign toneもない状態:

```text
partial
```

- アンバー失敗表示を出さない
- クリーン周を汚さない
- 前進しない

## 7.4 Wrong状態

構成外Pitch Classを含む状態が安定した場合:

```text
wrong
```

- 鍵盤の構成外音をアンバー表示
- その周をdirtyにする
- セッションを止めない
- 強い失敗文言を表示しない

## 7.5 Match

要件を満たす状態が100ms安定:

```text
match
```

- 現在コードを完了
- 次へ進む
- 成功アニメーションは短く
- 点数を表示しない

## 7.6 同一コードの連続

```text
Cmaj7
Cmaj7
```

をheldのまま2コード分通過させない。

各targetは、前のtarget完了後に次のいずれかを必要とする。

- 新しいNote On event
- held setの変化
- 一度non-match状態を経由

概念:

```ts
requiredAttackRevision: number;
```

次のtargetは、`attackRevision`が更新されるまで判定をarmしない。

---

# 8. ステップモード

## 8.1 目的

自己ペースで鍵盤上の形とコードの想起を学ぶ。

## 8.2 挙動

```text
現在コードを提示
↓
held noteを照合
↓
100ms match
↓
次のコード
```

誤答:

- 止めない
- 戻さない
- foreign toneをアンバー
- matchまで待つ

## 8.3 周回

最後のコードを完了したら1周。

```text
1周完了
↓
フローで弾いてみますか？
```

提案はするが強制しない。

## 8.4 Clean Step Round

次を満たす周:

- 各コードをmatch
- stable wrongを一度も出していない

partialはミスへ数えない。

Stepのclean roundは段位クリアには使わない。Flowへの準備指標だけ。

## 8.5 アルペジオ

Phase 3.9.0ではRolling Windowを実装しない。

- 過去に離したnoteは判定へ含めない
- heldとして音を残した分散押鍵は、最終的に揃えば通過可能
- 音を順番に弾いて離すアルペジオは通過しない

UIヘルプ:

```text
このPhaseでは和音として押さえてください。
アルペジオ練習は今後対応予定です。
```

---

# 9. フローモード

## 9.1 目的

メトロノームに合わせ、進行を止まらず一周する。

## 9.2 PracticeClock

Reactの`setInterval()`を時間源にしない。

既存のaudio clockまたはTone.Transport系を使う。

新設候補:

```text
src/practice/
  PracticeClock.ts
  practicePlaybackBridge.ts
```

責務:

- current beat
- target event
- acceptance window
- round boundary
- BPM
- tempo ramp
- visual callback

## 9.3 PlaybackController

セッション開始時:

- 既存再生を停止
- `practice` sourceをactiveにする
- メトロノームを単一再生境界で鳴らす

セッション終了時:

- PracticeClock停止
- metronome停止
- PlaybackController解放

## 9.4 対応拍子

### Step

有効なコードイベント列で利用可能。

### Flow MVP

```text
4/4のみ
```

4/4以外:

```text
フローモードは現在4/4に対応しています。
ステップモードは利用できます。
```

## 9.5 判定窓

初期値:

```ts
PRACTICE_FLOW_EARLY_MS = 180;
PRACTICE_FLOW_LATE_MS = 180;
```

対象コードの開始時刻前後でmatchが成立すれば、そのeventを成功とする。

固定値は1か所へ集約し、実機QA後に調整可能にする。

## 9.6 ミス時

- Clockを止めない
- targetを戻さない
- そのeventをmiss
- その周はdirty
- 次のeventへ進む

## 9.7 同一コードの連続

同じコードが続く場合も、各event窓内に新しいNote On／attack revisionを要求する。

## 9.8 Tempo

初期BPM:

```text
ユーザーの前回セッションBPM
または
min(60, targetTempo)
```

MVPで前回BPMを永続化しない場合は60から開始してよい。

段位判定のtarget:

```ts
targetTempo = max(
  60,
  round(originalBpm * 0.7)
);
```

元BPMがない場合:

```text
targetTempo = 60
```

## 9.9 Tempo Ramp

任意で有効。

```text
clean round
→ +4 BPM
```

上限:

```text
元BPM
```

元BPMなしの場合はユーザー指定上限。

Tempo Rampはセッション状態であり、長期保存しない。

---

# 10. クリーン周・仮クリア・確定

## 10.1 Clean Flow Round

全eventが次を満たす。

- acceptance window内でmatch
- missなし
- stable wrongなし

## 10.2 仮クリア

次の条件をすべて満たす。

- Flow mode
- 選択Level
- BPM >= targetTempo
- 連続2 clean rounds

保存:

```text
provisional
```

バッジ:

```text
輪郭
```

## 10.3 確定

次の条件をすべて満たす。

- 同じLevelにprovisionalがある
- provisionalのlocal dateと今日が異なる
- Flow mode
- BPM >= targetTempo
- 1 clean round

保存:

```text
confirmedLevel
```

バッジ:

```text
塗り
```

## 10.4 同日

同じ日に追加で成功しても確定しない。

```text
今日は仮クリア済みです。
別の日にもう一周すると確定します。
```

## 10.5 高いLevel

最高確定Levelだけ保存する。

```text
L3確定
→ L1 / L2も確定済みとして扱う
```

## 10.6 Lower Level練習

低いLevelを選び直してもconfirmedLevelを下げない。

---

# 11. Practice進捗データ

## 11.1 データモデル

`SavedProgressionBlock`へoptional fieldを追加する。

```ts
export type PracticeLevel = 1 | 2 | 3 | 4 | 5;

export interface PracticeProvisionalClear {
  level: PracticeLevel;

  // UTC ISO8601
  clearedAt: string;

  // ユーザー端末のローカル日付 YYYY-MM-DD
  clearedOnLocalDate: string;

  targetTempo: number;
}

export interface ProgressionPracticeProgress {
  schemaVersion: 1;

  // このコード内容に対する進捗かを判定
  progressionFingerprint: string;

  confirmedLevel?: PracticeLevel;
  provisional?: PracticeProvisionalClear;

  lastPracticedAt?: string;
}

interface SavedProgressionBlock {
  practice?: ProgressionPracticeProgress;
}
```

Phase 3.9.0 UIではL1〜L3だけを使用する。

型は将来L4／L5を追加できるよう1〜5を許容してよい。

## 11.2 Progression Fingerprint

practice進捗を次へ紐付ける。

- eventの順序
- chord normalized key
- bar / startBeat / duration
- Key / mode
- time signature
- BPM

含めない:

- title
- memo
- tags
- favorite
- source path
- Voicing Snapshot

同じ入力から同じfingerprintを返す。

## 11.3 進行編集後

現在fingerprintとpracticeのfingerprintが異なる場合:

```text
practice stale
```

- confirmed / provisionalを現在進行へ適用しない
- データを自動削除しない
- Queueでは「進行更新・要確認」
- 練習開始時にリセット確認

```text
進行のコード内容が変更されています。
この進行の練習段位を新しく開始しますか？
```

明示リセット後:

- current fingerprint
- confirmedLevelなし
- provisionalなし

## 11.4 保存タイミング

毎Note Onで保存しない。

保存する節目:

- セッション終了
- 仮クリア
- 確定
- practice staleリセット
- アプリ終了時のclose flush

既存Store actionと`applyVaultChange()`を通す。

## 11.5 保存しないもの

- ミス数
- 正答率
- セッション時間
- clean round総数
- BPM履歴
- 押鍵履歴
- 演奏note
- rank
- score

---

# 12. 練習キュー

## 12.1 役割

練習対象を選ぶための最小リスト。

第2のVaultを作らない。

表示:

- 進行名
- 4コード程度のmini summary
- L1〜L3バッジ
- 最終練習日
- 確認待ち
- Favorite

表示しない:

- 高度な検索
- 全タグツリー
- BPM複合filter
- source filter
- 詳細編集
- Quick Editor

深い探索はVaultで行う。

## 12.2 おすすめ順

優先順位:

1. 別日確認待ち
2. 進行更新でpractice stale
3. 最終練習日が古い
4. 未着手のFavorite
5. 未着手
6. その他

同順位:

1. lastPracticedAt昇順
2. favorite優先
3. updatedAt降順
4. stable block ID

決定的な純関数として実装する。

## 12.3 軽い絞り込み

許可:

- おすすめ
- Favorite
- 未着手
- 確認待ち
- L1 / L2 / L3
- Collection

既存Libraryの全filterを複製しない。

## 12.4 Progression Detail導線

```text
[練習する]
```

クリック:

- 練習タブへ
- 対象進行を選択
- 前回または推奨Level
- Step mode待機

## 12.5 Vault導線

MVPでは任意。

追加する場合:

- context menu
- 小さなDojoアイコン
- 既存行密度を壊さない

---

# 13. 練習画面UI

## 13.1 Header

```text
[ホーム] [コード採集] [Vault] [練習]
```

右側の既存`+ Idea`、Live MIDI、設定、保存状態を維持。

## 13.2 Layout

```text
┌ 練習キュー 260px ─────┐ ┌ 道場 ─────────────────────────┐
│ おすすめ ▾             │ │ 進行名                         │
│ L2  main-turnaround    │ │ [L1][L2][L3]  [ふつう ▾]      │
│ L1  neo-soul-01       │ │ [ステップ][フロー]  60 BPM    │
│ 確認 L3 summer-loop   │ │                                │
│                        │ │ 済 │ いま │ つぎ │             │
│                        │ │                                │
│                        │ │ 鍵盤ビジュアライザ             │
└────────────────────────┘ └────────────────────────────────┘
```

## 13.3 Session開始前

表示:

- MIDIデバイス
- 接続状態
- Level
- 寛容さ
- Mode
- BPM
- Voicing origin
- Start

接続なし:

```text
MIDI入力を接続してください。
[設定を開く]
[再接続]
```

## 13.4 Session中

主役:

- 現在コード／度数
- 次のコード／度数
- 鍵盤
- held note
- sustained note
- guide note（L1のみ）
- clean dots
- current BPM
- Pause / End

出さない:

- 正答率
- 点数
- 長文説明
- 全進行の大きな一覧
- Mood
- Library taxonomy

## 13.5 色

- guide: ミント薄色
- held correct: ミント強色
- held foreign: アンバー
- sustained: muted blue
- Bass: ラベルまたは下線

色だけに依存せず、凡例・ラベルを付ける。

## 13.6 Sidebar

セッション開始で自動格納可能。

Esc:

- active session中: Pause / 終了確認
- idle: Sidebar復帰または前画面へ

---

# 14. MIDI接続と安全性

## 14.1 既存接続を共有

新しいRust接続を作らない。

必要なら共通lease APIを導入する。

概念:

```ts
acquireLiveMidiLease("chord-dojo")
releaseLiveMidiLease("chord-dojo")
```

## 14.2 Mini Modeとの競合

同一main windowのため、Mini Mode表示中に練習タブを同時表示しない。

通常画面へ戻った後、既存接続を再利用する。

## 14.3 接続切断

セッション中に切断した場合:

- PracticeClockをpause
- current roundをdirtyにしない
- 現在位置を維持
- held stateをclear
- reconnect表示
- 再接続後にユーザー操作で再開

## 14.4 デバイス変更

セッション中の変更はPause後に行う。

## 14.5 音源

ユーザーのMIDI鍵盤自体が発音する前提。

音源なしコントローラ向けの内蔵音源／MIDI Thruは対象外と明示する。

---

# 15. State Machine

## 15.1 Session State

```ts
export interface PracticeSessionState {
  blockId: string;
  progressionFingerprint: string;

  level: 1 | 2 | 3;
  mode: "step" | "flow";
  leniency: "easy" | "normal" | "strict";

  status:
    | "idle"
    | "ready"
    | "running"
    | "paused"
    | "completed";

  currentEventIndex: number;
  roundNumber: number;

  roundDirty: boolean;
  consecutiveCleanFlowRounds: number;

  bpm: number;
  targetTempo: number;

  requiredAttackRevision: number;

  provisionalCandidate?: {
    state: "partial" | "match" | "wrong";
    sinceMs: number;
  };
}
```

## 15.2 Event

候補:

```ts
type PracticeAction =
  | { type: "START_SESSION" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "MIDI_STATE_CHANGED"; input: PracticeInputSnapshot }
  | { type: "STABLE_DEADLINE"; nowMs: number }
  | { type: "FLOW_TARGET_OPEN"; eventIndex: number }
  | { type: "FLOW_TARGET_CLOSE"; eventIndex: number }
  | { type: "ROUND_COMPLETED" }
  | { type: "DEVICE_DISCONNECTED" }
  | { type: "END_SESSION" };
```

同じaction列から同じstateを返す。

## 15.3 Clock注入

domainへ現在時刻を直接読ませない。

- MIDI event timestamp
- injected Clock
- injected local date provider

を使用する。

`Date.now()`と現在日付の直接参照をdomainで行わない。

---

# 16. 実装Stage

## Stage D0 — Audit / Baseline

監査:

- Phase 3.8.5 Voicing Resolverの実API
- Saved event / practice schema
- Progression Index
- LiveMidiService ownership
- defaultLiveMidiStore
- PlaybackController
- Tone / audio clock
- Header / route
- Progression Detail導線
- existing keyboard visualizer
- 4/4 event scheduling
- current i18n

成果物:

```text
docs/phase3.9.0-chord-dojo-audit.md
```

Baseline:

- 現行test数
- build
- MIDI connection
- practiceなし旧data
- source voicingあり／なし

## Stage D1 — Practice Domain

実装:

- `PracticeChordRequirements`
- easy / normal / strict
- `matchPerformance()`
- held-only
- partial / match / wrong
- 100ms stable
- attack revision
- repeated chord protection
- session reducer
- step progression
- clean round
- fingerprint
- provisional / confirmed transition
- recommendation order
- injected clock / date

UIはまだ作らない。

## Stage D2 — Practice Tab / Step / L1〜L3

実装:

- 練習タブ
- 練習キュー
- Progression Detailの「練習する」
- L1 / L2 / L3
- KeyなしL3 guard
- MIDI接続状態
- shared LiveMidiService
- Keyboard visualizer
- guide resolver
- source chip
- Step mode
- arrows / keyboard / focus
- Japanese / English
- feature flag / easy rollback

ここでユーザーが実機でStepを試せる状態にする。

## Stage D3 — Flow / Persistence / Badges

実装:

- PracticeClock
- metronome
- 4/4 scheduling
- acceptance window
- Flow mode
- missでも継続
- clean flow round
- tempo ramp
- provisional clear
- different-day confirmation
- practice optional schema
- fingerprint stale
- applyVaultChange
- Queue / Vault / Detail badge
- close flush

ここまでがPhase 3.9.0 MVP。

## Stage D4 — Automated QA / User Handoff

実装ではなく検証と引継ぎ。

- domain fixtures
- UI tests
- MIDI integration tests
- old data
- build
- Tauri
- installer
- 実装に即したユーザー確認書
- 未確認項目の明示
- Phase 3.9.1へ進まず停止

---

# 17. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.9.0 Chord Dojo MVPを実装します。

仕様の正は
docs/phase3.9.0-chord-dojo-plan.md
です。

目的:
Vaultへ保存した進行をMIDIキーボードで練習し、
L1「見て弾ける」、
L2「名前で弾ける」、
L3「度数で弾ける」
へ進めるChord Dojoを実装する。

MVPはD0〜D3です。
L4 / L5、移調、ミックスセッションは実装しません。

絶対に守ること:

1. Chord Dojoを常設タブ「練習」として追加する。
2. 練習キューを第2のVaultにしない。
3. Progression Detailから「練習する」で対象を開けるようにする。
4. Phase 3.8.5のVoicing ResolverをL1ガイドへ再利用する。
5. Dojo独自のVoicing優先順位を作らない。
6. お手本Voicingと正解判定を分離する。
7. L1の表示Voicingと異なる転回・オクターブでも判定を通せるようにする。
8. L2以降はguide Voicingを表示しない。
9. L3はKey / modeがない場合に無効化する。
10. Chord Requirementsを純関数domainとして実装する。
11. easy / normal / strictを実装する。
12. normalでは通常のperfect 5thを任意とする。
13. altered 5th、dim、augでは5thをquality必須音にする。
14. 明示7thを必須にする。
15. normalでは明示された特徴的extension / add toneを必須にする。
16. 13コードの暗黙9 / 11を必須にしない。
17. Rootless VoicingをMVPで許可しない。
18. held noteだけで判定する。
19. sustained noteを判定へ含めない。
20. partial chordをミス扱いしない。
21. stableなforeign toneで周をdirtyにする。
22. 100ms安定後にのみmatch / wrongを確定する。
23. 同一コード連続時にheldしたまま複数eventを通過させない。
24. 新しいNote Onまたはattack revisionを要求する。
25. アルペジオRolling Windowを実装しない。
26. ステップは自己ペースで、ミスしても止めない。
27. フローはClockを止めず、miss後も次へ進む。
28. React setIntervalをフローの時間源にしない。
29. audio clock / Tone.Transport相当を使う。
30. Flow MVPは4/4のみ。
31. acceptance windowを定数化する。
32. PlaybackControllerの単一再生を維持する。
33. 新しいMIDI transportを作らない。
34. 既存LiveMidiServiceを共有する。
35. 接続切断時にセッションをpauseし、周をdirtyにしない。
36. 仮クリアはtarget tempo以上で連続2 clean flow rounds。
37. 確定は別ローカル日付に1 clean flow round。
38. 同日成功を確定扱いしない。
39. confirmedLevelは最高Levelだけを保持する。
40. practice progressへprogressionFingerprintを保存する。
41. 進行編集後はpracticeをstale扱いし、自動削除しない。
42. practice以外の長期成績を保存しない。
43. 正答率、ミス数、時間、点数、rankingを保存・表示しない。
44. NoteイベントごとにVaultを書き込まない。
45. セッション終了・仮クリア・確定・明示リセット時だけ保存する。
46. 保存は既存store actionとapplyVaultChangeを通す。
47. repositoryへ直接書かない。
48. practice fieldはoptional + Zod default。
49. fileVersionを上げない。
50. 旧data.jsonを読めること。
51. LLM / Ollama / OpenAIを変更しない。
52. MIDI Analyzer mode・重みを変更しない。
53. Voicing抽出ロジックを変更しない。
54. Live MIDI Mini Modeを壊さない。
55. Quick Editor / Smooth / Style / Libraryを壊さない。
56. 日本語 / Englishを実装する。
57. IME中にshortcutを奪わない。
58. domainでDate.now / Math.randomを直接使わない。
59. 同じ入力action列から同じ結果を返す。
60. 各Stageでlint / test / typecheck / cargo test / buildを実行する。

作業開始前に報告すること:

- Phase 3.8.5 Resolverの実API
- Live MIDI接続所有権
- Playback / Tone clock
- Practice progressの保存先
- Progression fingerprint
- L1〜L3 UI案
- 変更ファイル
- リスク
- rollback

作業終了時に必ず行うこと:

1. 実装報告書を作成する
2. docs/phase3.9.0-user-verification-checklist.md を作成する
3. 最終回答の冒頭を「ユーザー実機確認待ち」とする
4. ユーザーが実際に確認すべき項目を、操作手順・期待結果・
   不具合時に記録する内容まで具体的に列挙する
5. すぐ確認できる項目と、翌日に確認する「別日確定」を分ける
6. 実機未確認の項目を完了済みと書かない
7. ユーザー確認前にPhase 3.9.1へ進まない
8. ユーザー確認前にL4 / L5 / Mixを実装しない
9. ユーザー確認前に「Phase 3.9.0完全完了」と断定しない
10. PR / merge状態、生成EXE、テスト結果を報告する

コミット:
P3.9.0-DX: 要約
```

---

# 18. 自動テスト

## 18.1 Chord Requirements

- major
- minor
- diminished
- half-diminished
- augmented
- sus2 / sus4
- 6
- 6/9
- add9
- 7
- maj7
- m7
- 9
- maj9
- m9
- 11
- m11
- 13
- altered dominant
- slash chord
- unknown / invalid

## 18.2 Leniency

- easy extension omission
- normal characteristic extension
- strict fifth
- strict slash bass
- inversion
- octave duplicate
- foreign tone
- root missing
- two notes
- perfect fifth optional
- altered fifth required

## 18.3 Match State

- partial
- match
- wrong
- stable 99ms
- stable 100ms
- held-only
- pedal sustained ignored
- note change resets timer
- wrong makes round dirty
- partial does not
- repeated same chord requires attack
- disconnect

## 18.4 Step

- start
- advance
- last event
- round complete
- clean step round
- dirty step round
- pause / resume
- end
- same chord repeated
- one-event vamp

## 18.5 Flow

- PracticeClock
- 4/4
- event scheduling
- early window
- late window
- match
- miss
- continues after miss
- round clean
- round dirty
- tempo ramp
- no React timer dependency
- unsupported time signature

## 18.6 Clear

- 1 clean round
- 2 consecutive clean
- dirty resets consecutive
- provisional
- same-day not confirmed
- different-day confirmed
- confirmed highest
- lower level does not downgrade
- target tempo
- BPM missing

## 18.7 Fingerprint

- same progression
- title only changed
- tag only changed
- chord changed
- event order changed
- duration changed
- key changed
- BPM changed
- stale
- explicit reset

## 18.8 Recommendation

- confirmation due first
- stale second
- oldest practice
- favorite unstarted
- unstarted
- deterministic tie-break
- filters

## 18.9 Persistence

- no practice field
- optional schema
- provisional
- confirmed
- lastPracticedAt
- close flush
- no per-note save
- applyVaultChange
- old data

## 18.10 Integration / Regression

- Live MIDI
- Voicing Memory
- PlaybackController
- Vault
- Progression Detail
- Library
- Quick Editor
- Smooth / Style
- Progression Advisor
- Import / Export
- Backup
- close guard
- Japanese / English

---

# 19. 実装後にCodexが出すユーザー確認書

`docs/phase3.9.0-user-verification-checklist.md`には、最低限以下を含める。

## 19.1 事前準備

- 実行するEXEの絶対パス
- MIDIキーボード接続方法
- 推奨する保存済み進行
- 使用するKey / BPM
- practiceデータのバックアップ方法
- 問題報告時のスクリーンショット箇所

## 19.2 すぐ確認する項目

### A. 起動とキュー

- 練習タブ
- おすすめ順
- Progression Detailからの遷移
- Sidebar選択
- MIDI接続

### B. L1

- 元MIDI / 鍵盤記録 / 自動Voicing表示
- guideとheldの区別
- 別転回形で通過
- オクターブ重複
- 構成外音

### C. L2

- コード名のみ
- 鍵盤ガイドなし
- held feedbackあり

### D. L3

- 度数のみ
- Keyありで使用可能
- Keyなしで案内
- コード名が答えとして見えない

### E. 寛容さ

実進行で次を確認する。

```text
Fmaj9
G13
Bm11
C6/9
G7#5
C/E
```

- easy
- normal
- strict

### F. repeated chord

```text
Cmaj7 | Cmaj7
```

heldしたまま2つ通過しないこと。

### G. pedal

- pedalで残った音が判定へ入らない
- 可視化はされる
- 次コードが誤通過しない

### H. Step

- correct
- partial
- foreign
- advance
- round complete

### I. Flow

- metronome
- event timing
- missでも止まらない
- clean round
- tempo ramp
- pause / resume

### J. provisional

- target tempo
- 2 clean rounds
- 輪郭バッジ
- 再起動後に残る

### K. stale

- 進行コードを編集
- practiceが要確認になる
- 古い段位を現在進行へ適用しない
- 明示リセット

### L. regression

- Live MIDI Mini Mode
- Vault試聴
- Progression Detail
- Quick Editor
- AI Advisor
- app終了・再起動

## 19.3 翌日確認

- provisionalと異なる日付で起動
- 1 clean flow round
- confirmed badge
- Queueの確認待ちが消える
- confirmedLevelが保存される

## 19.4 不具合報告テンプレート

```text
確認番号:
使用進行:
Key / BPM:
Level:
Mode:
判定:
MIDIデバイス:
押したnote:
期待:
実際:
再現率:
スクリーンショット:
console / log:
```

## 19.5 完了判定

Codexは、ユーザー確認前には次のように書く。

```text
自動検証: 完了
実機検証: ユーザー確認待ち
別日確定: 未確認
Phase 3.9.0: 暫定完了
```

---

# 20. 人間側QAの推奨進行

実装後の確認には、最低限次の種類を使う。

## 基本

```text
Cmaj7 | Am7 | Dm7 | G7
Key C
```

## テンション

```text
Fmaj9 | G13 | Em9 | A7#5
Key C
```

## 分数コード

```text
C/E | Fmaj7 | G/B | Cmaj9
Key C
```

## 同一コード反復

```text
Cmaj7 | Cmaj7 | Am7 | Am7
Key C
```

既存Vaultにない場合は、ユーザーが手動作成するか、QA用seedを開発環境だけで用意する。

QA用データを本番Vaultへ勝手に追加しない。

---

# 21. 受け入れ条件

## Product

- 練習タブから30秒以内に開始できる
- Progression Detailから対象を直接開ける
- Queueが第2Vaultになっていない
- L1〜L3を手動選択できる
- KeyなしL3が安全に無効
- Step / Flowが動く

## Guide

- Phase 3.8.5 Resolverを再利用
- source chip表示
- stale fallback
- L1だけguide表示
- guideと判定を分離

## Match

- easy / normal / strict
- inversion自由
- octave duplicate自由
- normal fifth optional
- explicit extension判定
- foreign tone不通過
- pedal音を判定へ含めない
- 100ms stable
- repeated chordの再アタック

## Flow

- PracticeClock
- 4/4
- missで停止しない
- acceptance window
- clean round
- tempo ramp optional
- single playback

## Progress

- 2 clean roundsでprovisional
- 同日はconfirmedにならない
- 別日1 cleanでconfirmed
- highest confirmed level
- progression fingerprint
- edit後stale
- optional schema
- fileVersion 1

## Persistence

- per-note書き込みなし
- applyVaultChange
- autosave / backup
- close flush
- old data
- practice以外の成績を保存しない

## Boundary

- L4 / L5なし
- Mixなし
- arpeggio windowなし
- score / rankingなし
- LLM変更なし
- Analyzer変更なし
- Voicing抽出変更なし
- Live MIDI回帰なし

## Quality

- lint
- test
- typecheck
- cargo test
- Web build
- Tauri build
- installer
- implementation report
- user verification checklist

---

# 22. Migration / Rollback

## Migration

- `practice`はoptional
- 旧data.jsonは変更なしで読込
- 一括migrationなし
- practiceなしは未着手扱い

## Rollback

使用率または品質が低い場合:

1. Headerの練習タブをfeature flagで非表示
2. Progression Detailの「練習する」を非表示
3. optional practice fieldは放置
4. MIDI / Vault / Voicingは影響なし
5. domainとテストは後続改善用に残せる

常設タブを外しても、将来Progression Detail内の練習パネルとして再利用できる構成にする。

---

# 23. Phase 3.9.1候補

ユーザー実機確認後に判断する。

候補:

- L4 近くのキー
- L5 12キー
- cleared key deck
- Mix Session
- アルペジオ練習
- latency calibration
- source Voicingの厳格一致
- 練習用Collection
- 「最近練習した」Library分類

Phase 3.9.0のユーザー確認前には着手しない。

---

# 24. 最終メッセージ

Chord Dojoは、保存済み進行へ点数を付ける機能ではない。

```text
L1
お手本を見ながら形を作る

L2
コード名から形を思い出す

L3
度数から形と機能を思い出す

Flow
止まらず進行として弾く

別日確定
後日も思い出せることを確認する
```

**採集した進行を「知っているコード」から「自分の手で使える語彙」へ変える。**

これをPhase 3.9.0の完成形とする。
