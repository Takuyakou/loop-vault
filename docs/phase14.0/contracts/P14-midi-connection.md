<!-- phase-id: 14.0 -->

# P14 MIDI 接続の共通化 — 仕様 v1.1

2026-10-09。MIDI の接続を「アプリ全体で1つ」にし、上部（アプリの右上）から接続・切断できるようにする。各モードは上部と同じ状態を、同じ言葉で出す。

- 対象：local `master`。調べた時の HEAD は `1028a3b2`（P12.2・P13.1 が入った後）。
- 見た目の正：zip の `mocks/midi-connection-mock.html`（5画面）。赤い番号はこの文書の章の番号。
- 今の画面と動き：zip の `before/` と `before/log.txt`。
  - 撮り方：`1028a3b2` を画面確認用のビルドで撮った。入力は合成の MIDI。
  - ログの中身：画面を移った時の上部の表示。

## 人間が決めたこと（2026-10-09）

- **D1** MIDI の接続は**アプリ全体で1つ**。上部でつなげば、どの画面に移っても切れない。各モードは上部の状態をそのまま使う。
- **D2** 起動した時に、前回の機器が見つかれば**自動でつなぐ**。上部のパネルで OFF にできる。
- **D3** 上部のボタンを押すと、**小さなパネル**が開く。パネルでできること：
  - 状態を見る
  - 機器を選ぶ
  - 接続／切断／もう一度試す
  - 機器を探し直す
  - 起動した時の自動接続を ON／OFF する
  - 詳しい設定と Live MIDI（ミニ表示）を開く
- **D4** 各モードの中の「MIDI 設定」「再接続」「設定」は、**上部と同じパネルを開く**。つながっていない時の案内も同じ文言にそろえる。

## v1.1 の改訂（2026-10-09、外部レビューを受けて）

| # | 指摘 | この版で決めたこと | 章 |
| --- | --- | --- | --- |
| R1 | 状態の決め方があいまい。起動直後に「外れました」と出るおそれ。切断の操作より古い状態が勝つおそれ | 意図 off を一番先に判定する。「外れました」は、この起動でつないだことがある時だけ | 3 |
| R2 | 接続と切断が競合する（つないでいる途中の切断、A につないでいる途中で B を選ぶ） | 接続の操作に世代番号を持たせ、古い結果は捨てる。切断の後に開いた入口は閉じる | 2.1 |
| R3 | 「接続済み」の表示だけでは、弾いて反応する保証にならない | 画面ごとに、合成の入力で実際の判定まで届くことを確かめる。二重の入力が無いことも確かめる | 7 |
| R4 | 練習中に一瞬外れただけで、自分で判定する形に変わるのは危ない | 練習中に外れたら止めて待ち、つながったら同じ課題から続ける。自分で判定する形へは、人が選んだ時だけ移る | 5.1 |
| R5 | 手動の切断と、次の起動の関係 | 手動の切断は、今の起動の間だけ。次の起動は自動接続の設定に従う | 2 |
| R6 | パネルを閉じた時のフォーカス | パネルを開いたボタンへ戻す | 4 |

## 1. 今どうなっているか（調べたこと）

- **接続が画面ごと。** MIDI の入口を開くのは、それぞれの画面。
  - 入口を開く画面：Chord Dojo（`ChordDojoView`）・Voicing Loop（`ProgressionVoicingPracticeView`）・進行ページの `VoicingPanel`・Live MIDI（`App.tsx` のミニモード）。
  - 開き方：`liveMidiActivation.acquire()` でリースを取り、`defaultLiveMidiStore.activate()` を呼ぶ。
  - 画面を離れるとリースを返し、入口を閉じる（`deactivate()`）。
- **そのために起きていること**（`before/log.txt`）：
  - ホーム・Vault・Bass Practice・設定では、キーボードがつながっていても上部は「MIDI 未接続」。
  - Chord Dojo や Voicing Loop に入ると機器名になり、出ると「MIDI 未接続」に戻る。
  - 画面を移るたびに、つなぎ直しが起きる。
- **「つながっているか」の決め方が3通り。**
  - 上部（`AppShell` の `MidiStatusChip`）：`status` と `initializing` から決める。
  - Chord Dojo と Master（`useDojoMidi` の `inputState`）：`active`・`initializing`・前回の機器の有無・ローカルの `awaitingActivation` から、独自に「initializing／connecting／disconnected」を決める。
    - 上部が「MIDI 未接続」の間も、「接続を確認しています」と出ることがある。
  - Voicing Loop：`status` だけで「接続済み／接続中／未接続」を決め、独自の「再接続」を持つ。
- **上部のボタンでは接続できない。** 押すと Live MIDI のミニモードが開くだけで、接続・切断はできない。
- **設定の「接続テスト」は、つながっている時に失敗する。** `testDevice` は `active` の時に「Live MIDI is already active.」を返す。

## 2. 接続はアプリ全体で1つ（D1・D2）

**直すこと：**

- **持ち主：** 接続を持つものを1つにする。新しい `src/liveMidi/connectionController.ts`（名前は変えてよい）。
- **controller の機能**（入口を開く・閉じるのは、この controller だけ）：
  - **意図**：`intent: "on" | "off"`。
  - **接続**：`connect()`。意図を on にし、入口を開いて、選んでいる機器につなぐ。
  - **切断**：`disconnect()`。意図を off にし、入口を閉じる。**この切断は今の起動の間だけ有効**（保存しない）。次の起動は「起動した時に自動でつなぐ」の設定に従う（R5）。
  - **もう一度試す**：`retry()`。エラーの後に、もう一度つなぐ。
  - **機器を選ぶ**：`chooseDevice(backendId)`。前回の機器として保存し、意図が on なら、その機器につなぎ直す。
  - **起動時**：`initOnAppStart()`。
- **起動時の動き：**
  - 「起動した時に自動でつなぐ」が ON（初めの値は ON）で、前回の機器が見つかれば、`connect()` する。
  - 見つからなければ、意図を on のまま待つ。機器が現れたら、自動でつなぐ（3章の「探しています」「見つかりません」の状態）。
  - OFF の時は、意図 off で始める。
- **リースを取らせない。** 次のものは、`liveMidiActivation.acquire()`・`activate()`・`deactivate()` を自分で呼ばない。
  - 対象：`ChordDojoView`・`Master251View`・`ProgressionVoicingPracticeView`・`VoicingPanel`・`App.tsx` の Live MIDI ミニモード。
  - Live MIDI ミニモードを開いた時、意図が off なら `connect()` を呼ぶ。閉じても切断しない。
- **今の部品は使ってよい。** `LiveMidiActivationLeaseManager` は、controller の中で使ってよい（controller が1つだけリースを持つ形）。
- **画面を移っても、入口を開き直さない。**
- **自動で戻る時：** 意図が on で機器が外れた（`status: "disconnected"`）後、同じ機器が一覧に戻ったら、自動でつなぐ。
  - 今の 2 秒ごとの機器の確認（`refreshDevices`）を使う。
  - `useDojoMidi` の中の「前回の機器を選び直す」処理は、ここへ移す。
- **エラーの後：** 自動では試さない。`retry()`（パネルの「もう一度試す」）か、`chooseDevice()` の時だけ試す。
- **アプリを閉じる時：** 今の `closeGuard` のとおり、入口を閉じる。
- **自動接続の設定の保存先：** 新しいキー `loop-vault:live-midi-connection:v1`（`{ "autoConnect": boolean }`）。
  - 今の `loop-vault:live-midi-preferences:v1` の形は変えない。今の Zod は `strict` なので、古い EXE が新しい項目を読むと、前回の機器を失うため。
  - 壊れている・無い時は `autoConnect: true`。

### 2.1 接続の操作の世代と取り消し（R2）

- controller は、接続にかかわる操作（`connect`・`disconnect`・`retry`・`chooseDevice`・自動接続・自動で戻る）のたびに、**世代番号**（整数）を 1 増やす。
- 非同期の処理（機器の一覧・入口を開く）は、始めた時の世代番号を持つ。終わった時に**今の世代番号と違えば、結果を捨てる**。
  - その時に入口が開いてしまっていたら、すぐ閉じる（`service.stop()`）。
  - その結果で状態（`selected`・`status`・前回の機器）を書き換えない。
- 同時に動く接続の処理は1つまで。新しい操作が来たら、前の処理の結果は上の決まりで捨てる。
- 切断の後（意図 off の間）は、どの古い処理も入口を開いたままにしない。

**受け入れ**（E2E。合成の MIDI の入力を使う）：

1. 前回の機器を保存した状態でアプリを開く。ホームのまま 3 秒以内に、上部が機器名になる。
2. ホーム → Vault → Chord Dojo → 2-5-1 Master → Bass Practice → Voicing Loop → 設定 → ホームと移る。その間、次の2つを満たす。
   - 上部はずっと機器名。
   - 入口を開いた回数（合成の入力の `stats.opens`）が増えず、閉じた回数（`stats.closes`）も増えない。
3. 上部のパネルで「切断」すると、上部は「MIDI に接続」になる。その後 5 秒たっても、自動でつながない。
4. 「起動した時に自動でつなぐ」を OFF にして開き直すと、上部は「MIDI に接続」のまま。ON に戻すと、次の起動でつながる。
5. 機器を外す（合成の入力の `unplug`）と、上部は「〜が外れました」になる。戻す（`plug`）と、10 秒以内に自動で機器名に戻る。
6. 開く時に失敗させる（`deferOpen` → `resumeOpen(true)`）と、上部は「MIDI エラー」になる。その後 10 秒、開く回数が増えない。「もう一度試す」で1回だけ増える。
7. **つないでいる途中の切断**：`deferOpen` → 「接続」→ 「切断」→ `resumeOpen()`。上部は「MIDI に接続」のまま。入口は閉じられ（`stats.closes` が 1 増える）、5 秒たっても `connected` にならない。
8. **A につないでいる途中で B を選ぶ**：`deferOpen` → 機器 A で「接続」→ パネルで機器 B（合成の入力2）を選ぶ → `resumeOpen()`。最後は B につながり、前回の機器として B が保存される。A の結果で上書きされない。
9. **切断の後の起動**：「切断」してからアプリを開き直す（自動接続 ON）。前回の機器につながる（R5）。

## 3. 状態は1つの関数で決める

**直すこと：**

- `src/liveMidi/connectionView.ts` に、`selectMidiConnection(store の状態, controller の状態)` を作る。
- 上部・パネル・Chord Dojo・Master・Voicing Loop・設定・Live MIDI は、**これだけ**を使って表示と「つながっているか」を決める。
- 次のものは消す（この関数に置き換える）：
  - `useDojoMidi` の `inputState` の決め方
  - `hasDojoMidiInput`（中身はこの関数の `connected` にする）
  - Voicing Loop の `midiStatus` での判定

controller は、この起動の間に一度でもつながった機器を `lastConnected`（`backendId` と名前）として持つ。起動した時は空。

| 状態 `kind` | 条件（上から順に、最初に当たったもの） | 上部のボタンの文字 | 点の色 | パネルの見出し |
| --- | --- | --- | --- | --- |
| `off` | 意図が off（ほかの値より先に判定する。R1） | 「MIDI に接続」 | 枠だけ（`--lv-accent`） | つないでいません |
| `connected` | `status==="connected"` かつ `selected` あり | 機器名 | 緑 `--lv-success` | つながっています |
| `connecting` | `status==="connecting"` | 「{機器名} に接続しています」 | 灰 | 接続しています |
| `error` | `status==="error"` | 「MIDI エラー」 | 赤 `--lv-danger` | つなげませんでした |
| `searching` | 起動直後の機器の確認中（`initializing`） | 「MIDI を探しています」 | 灰 | 機器を探しています |
| `lost` | `lastConnected` があり、その機器に今つながっていない（`status` が `disconnected` か `idle`、または一覧に無い） | 「{lastConnected の名前} が外れました」 | 黄 `--lv-warning` | 機器が外れました |
| `missing` | `lastConnected` が無く、前回の機器（保存）があるのに一覧に無い | 「{前回の名前} が見つかりません」 | 黄 | 前回の機器が見つかりません |
| `no-device` | 機器が1つも無い | 「MIDI 機器がありません」 | 黄 | MIDI 機器がありません |
| `choose` | 機器はあるが、前回の機器が無い | 「機器を選んでください」 | 黄 | 使う機器を選んでください |

- `lastConnected` は、`disconnect()` で空にする。別の機器につながった時は、その機器にする。
- 起動直後に一度もつながっていなければ、`lost` は出ない（`missing`・`no-device`・`choose` のどれか）。

- **戻り値：** `{ kind, label, deviceName?, error?, connected: kind==="connected", busy: kind==="connecting"||kind==="searching" }`。
- **文字が長い時：** 上部のボタンは最大幅 240px で省略し、`title` に全文を入れる。
- **単体テスト：** 表のすべての行を、単体テストで確かめる。

**受け入れ：**

- 単体テストで表の 9 行が PASS。加えて、「起動直後で一度もつながっていない時に `lost` にならない」「意図 off の時は `status` が `error` でも `off`」の2つを確かめる。
- E2E：同じ時点で、次の4か所の表示が同じ `kind` から作られている。
  - 上部の `data-midi-kind`
  - Chord Dojo の `data-midi-kind`
  - Master の `data-midi-kind`
  - Voicing Loop の状態の `data-midi-kind`
  - 確かめ方：4つの状態（connected・off・lost・error）で、属性が一致する。

## 4. 上部のボタンとパネル（D3）

**直すこと**（`AppShell` の `MidiStatusChip` を置き換える。モック 1〜4）：

- **ボタン：**
  - 高さ 32px、角丸 16px、左に点。文字は3章の表の「上部のボタンの文字」。
  - `kind==="off"` の時は、線と文字を `--lv-accent` にする（押せることが分かる形）。
  - 押すと、Live MIDI ではなくパネルを開く。
  - `aria-haspopup="dialog"`・`aria-expanded`・`data-midi-kind` を付ける。
  - 狭い幅（今の上の帯で文字が出ない幅）では、今と同じく点だけ。`aria-label` は全文。
- **パネル**（ボタンの下、右寄せ、幅 340px、`data-testid="midi-panel"`）：
  1. 状態：点・見出し（3章の表）・説明1行。
     - `connected`：「どの画面に移っても、このまま使えます」
     - `lost`：「USB をつなぎ直すと、自動でもう一度つなぎます」
     - `error`：エラーの文（元の文はかっこで）
  2. 「使う機器」：`Select`（今の部品）。
     - 機器の一覧。前回の機器が無い時は、「{名前}（見つかりません）」を出す。
     - 選ぶと `chooseDevice()`。
  3. ボタン（左から）：

     | 状態 | ボタン |
     | --- | --- |
     | `connected`・`connecting` | 切断・機器を探し直す |
     | `off` | 接続（主）・機器を探し直す |
     | `error` | もう一度試す（主）・機器を探し直す |
     | `lost`・`missing`・`no-device`・`choose`・`searching` | 機器を探し直す・切断 |

  4. 「起動した時に自動でつなぐ」のチェック（2章の保存先）。
  5. 下の線の下に、2つのリンク。
     - 「詳しい設定…」：今の `LiveMidiSettingsDialog` を開く。
     - 「Live MIDI（ミニ表示）を開く」：今の上部のボタンの動き。
- **閉じ方：** Esc・パネルの外を押す・もう一度ボタンを押す。閉じたら、**パネルを開いたボタンにフォーカスを戻す**（上部から開いたら上部のボタン、モードの「MIDI 設定」から開いたらそのボタン。R6）。開いたボタンが消えていたら、上部のボタンに戻す。
- **キー操作：** Tab で中を回れる。開いた時のフォーカスは、主のボタン（無い時は「使う機器」）。
- **開き方：** `openMidiPanel(opener?: HTMLElement)` を、どこからでも呼べるようにする（モードの中のボタンから使う。5章）。パネルの位置は、どこから開いても上部のボタンの下。

**受け入れ：**

- 上部のボタンを押すと、`midi-panel` が開く。Live MIDI のミニモードは開かない。
- 上部から開いて Esc で閉じると、フォーカスが上部のボタンに戻る。Chord Dojo の「MIDI 設定」から開いて Esc で閉じると、フォーカスがその「MIDI 設定」に戻る。
- 状態ごとのボタンの並びが、上の表のとおり。
- axe で serious・critical が 0。

## 5. 各モードの表示（D4）

**直すこと：**

- **共通の部品 `MidiRequiredNotice`**（`src/components/` に置く）：3章の `kind` から、見出しと説明を出す。ボタンは「MIDI に接続」（`off` の時だけ。押すと `connect()`）と「MIDI 設定」（押すとパネルを開く）。
- **Chord Dojo：**
  - はじめの画面の「MIDI キーボードがつながっていません…」と、練習の画面の案内を `MidiRequiredNotice` にする。
  - 練習の画面の上の帯の「MIDI 設定」は、パネルを開く。
  - 自分で判定する形（MIDI なし）で始める条件：練習を**始める時に**、`connected` でなく `busy` でもない。練習の途中で外れた時は 5.1 に従う（自動で自分で判定する形に変えない）。
- **2-5-1 Master：**
  - 次の案内を、`MidiRequiredNotice` にする。
    - 「MIDI 接続を確認しています…」
    - 「MIDI キーボードをつないでください」
    - 「MIDI 接続でエラーが起きました」
  - 上の帯の「MIDI 設定」は、パネルを開く（今の「一時停止してから」の動きは残す）。
  - 練習の途中で外れた時は 5.1 に従う。
- **Voicing Loop：**
  - 状態の表示を「MIDI 入力：{label}」にする（3章の `label`。点の色も同じ）。
  - 「再接続」と「設定」は「MIDI 設定」1つにまとめ、押すとパネルを開く。
- **進行ページの `VoicingPanel`：** 入口を自分で開かない。表示は上と同じ形。
- **設定 › Live MIDI（`LiveMidiSettingsSection`）：**
  - 一番上に状態を1行出す（点・`label`）。
  - 「接続テスト」は、`kind` が `off`・`error`・`choose` の時だけ出す（つながっている時は出さない）。
  - 機器の選択と「起動した時に自動でつなぐ」は、パネルと同じ値を読み書きする。
- **Live MIDI（ミニ表示）とその窓：** 状態の表示を同じ関数から作る。
- **Bass Practice：** 何も変えない（MIDI の入力を使わない）。

### 5.1 練習の途中で外れた時（R4）

- **対象：** Chord Dojo の練習の画面（MIDI で判定している時）と、2-5-1 Master の練習。
- **外れた時：** `connected` から `connected` 以外（`lost`・`error`・`connecting`・`off`）に変わったら、すぐ止める。
  - Master：P12.2 の一時停止と同じ（`pause()`）。問題が見えていた回は、P12.2 の「一時停止あり」になる（速さを数えない）。記録していない回は、記録しない。
  - Chord Dojo：今の課題の判定を止める。押している途中の和音は判定しない。記録しない。タイマーは止める。
- **止めている間の表示：** `MidiRequiredNotice` に、次の説明を出す。
  - 説明：「MIDI が外れました。つなぎ直すと、この課題から続けます。」
  - ボタン：「MIDI 設定」（パネルを開く）。
  - Chord Dojo だけ：「自分で判定に切り替える」（押した時だけ、この練習を自分で判定する形にする）。
- **つながった時：** `connected` に戻ったら、全部の鍵盤を離した後に、**同じ課題**を最初から始める。
  - Master：P12.2 の再開と同じ。
  - Chord Dojo：同じ課題・同じ段・同じキー。
  - 自動で再開するのは、止めた理由が「外れた」だけの時。人が一時停止した時は、今と同じく人が再開する。
- **切り替えない：** 練習の途中で、自分で判定する形に自動で切り替えない。自分で判定する形への切り替えは、人が選んだ時か、次に練習を始める時だけ。

**受け入れ：**

- Chord Dojo の練習の途中で `unplug` すると、次のようになる。
  - 練習が止まり、5.1 の案内が出る。
  - 記録（`taskResults`・合った数）が増えない。
  - 自分で判定する形（「弾けた（Y）」）にならない。
  - `plug` で戻ると、同じ課題（`data-dojo-cursor` が同じ）から続けられる。
- Master の練習の途中で `unplug` すると `data-phase="paused"` になる。`plug` で戻ると、鍵盤を離した後に同じセルが始まる。
- 各モードの「MIDI 設定」を押すと、`midi-panel` が開く。対象は Chord Dojo の練習・Master・Voicing Loop。
- 上部で切断すると、1秒以内に次のようになる。
  - Chord Dojo のはじめの画面に `MidiRequiredNotice`（`off`）が出る。
  - Master の練習の画面に `MidiRequiredNotice`（`off`）が出る。
- つながっている時は、設定の画面に「接続テスト」のボタンが無い。

## 6. 入力の音とテストの入口

- Chord Dojo・Master の入力の音（`startDojoPianoInput`）は、今と同じく、`connected` の時だけ鳴らす。
  - 入口がずっと開いていても、ほかの画面（ホームなど）では鳴らさない。鳴らすのは今と同じ画面だけ。
- 合成の MIDI の入力（`src/testing/p12DojoFixture.ts`）の `connect()`・`disconnect()` は、controller の `connect()`・`disconnect()` を呼ぶ形に直す。
  - `plug`・`unplug`・`deferOpen`・`resumeOpen`・`stats` は今のまま。
  - 今の E2E がこの入口で動くようにする。

## 7. 実際の入力が届くことの確認（R3）

「接続済み」の表示だけでなく、合成の入力（`__p12Midi.emit`）で、次の3つを分けて確かめる。

- 入力が判定まで届く
- 入力が二重にならない
- 音が二重に鳴らない

| 画面・場面 | 確かめること |
| --- | --- |
| Chord Dojo（練習・MIDI で判定） | Note On で「合いました」になり、Note Off の後に次へ進める（今の `play` の手順） |
| 2-5-1 Master（復習） | 3つのコードを弾いて「合いました」になり、記録の `attempts` が 1 だけ増える |
| Voicing Loop | 押した音が鍵盤の「押鍵中」に出る（今の E2E と同じ印） |
| 画面を移った後 | ホーム → Chord Dojo → ホーム → Chord Dojo と移った後、次の4つを満たす。①1回の Note On で、判定が1回だけ起きる（合った数が 1 だけ増える）。②store の `notes.held` が1音だけ。③入力を受け取る窓口の数（`stats.listeners`）が 1。④入力の音のモニター（`startDojoPianoInput`）が同時に1つだけ |
| 切断と再接続の後 | 押したまま「切断」→「接続」すると、`notes.held` が空になり、押していた音が残らない。その後の Note On で正しく判定される |
| 外れて戻った後 | `unplug` → `plug` の後、押していた音が残らず、Note On で判定される |

- ④は、テスト用に、今動いているモニターの数を数える印（例：`window.__dojoMonitorCount`。fixture のビルドだけ）を足してよい。

## 20. やらないこと

- `liveMidiService`・`bridge.ts`・Rust 側の入力の作り。
- 和音の判定（`domain/liveMidi`）。
- 今のプリファレンスの形（`loop-vault:live-midi-preferences:v1`）。
- Vault・練習の記録の形。
- 判定・練習の中身。
- Bass Practice・取り込む・Vault の画面。
- 新しい依存パッケージ。

## 21. 証跡

- **新しい単体テスト：**
  - `connectionView.test.ts`（3章の表）
  - `connectionController.test.ts`
    - 意図・起動時・自動で戻る・エラーの後に試さない
    - 世代番号：古い結果を捨てる・切断の後に開いた入口を閉じる・A の途中で B（2.1）
    - 手動の切断を保存しない（R5）
    - 保存の壊れた値
- **新しい E2E：** `e2e/p14-midi-connection.spec.ts`。2〜5章と 7章の受け入れを書く（2章の 7〜9 の競合のテストと、5.1・7章の入力のテストを含む）。
- **今の E2E：** Chord Dojo・Master・Voicing Loop・Live MIDI の E2E を通す。
  - 直してよいのは次の所だけ。直した行は報告に書く。
    - 入口の開き方の変更で、期待値が変わる所
    - 「MIDI 設定」で設定ダイアログが開くことを確かめていた所
  - 合成の入力の `stats.opens` の回数を数えている所は、2章の「開き直さない」に合わせて直す。
- **スクリーンショット：**
  - 撮る画面：上部（5つの状態）・パネル（connected・off・lost・error）・Chord Dojo の案内・Master の案内・Voicing Loop の状態・設定。
  - 撮る大きさ：1440×900・960×1032・768×640。
  - 置き場：Git 管理外の `p89-generated/P14.0-01/`。
- **基準画像：** 上部の帯が写るすべての基準画像が変わりうる。上部のボタンの文字が変わったために変えたものだけ更新し、一覧を報告に書く。
- **人間が EXE で確かめること：**
  - 実際の機器（Roland Digital Piano など）で、起動時の自動接続。
  - 画面を移っても切れないこと。
  - USB を抜き差しした時の戻り方。
  - 切断した後、自動でつながないこと。
