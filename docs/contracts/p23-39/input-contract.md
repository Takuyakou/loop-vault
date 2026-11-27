# P23-39 入力・判定の契約(v3・凍結)

対象:コース試行1回の「待機 → 提示 → 採取 → 封緘 → 判定」。
実行可能な正本は `src/courseDesign/inputContract.ts`、反例は `inputContract.test.ts`(すべて注入時計)。

v1 の「最大採取 1500 ms(arm から)」は 3 秒評価と矛盾した。2 秒で弾いた正解が 1.5 秒上限で消えるためである。v2 以降は**応答待ち**(arm → 最初の打鍵)、**採取窓**(最初の打鍵 → 上限)、**settle**(最後の打鍵 → 封緘)を別の時間として定義し、封緘・速度の起点をそろえた。v3 は入力の値を変えていない(bank/評価 set と遅延日時の修正のみ)。

## 1. 状態

| 状態 | 意味 | 遷移 |
|---|---|---|
| `idle` | 試行前 | `arm(at, held)` で `armed` |
| `armed` | 画面が準備完了。`armedAt` が速度と応答待ちの起点。前回答の押鍵/ペダル残りは `held` に入れ、**release 待ち**として扱う | 最初の新規 Note On で `capturing`。応答待ち超過で `sealed`(no-input) |
| `capturing` | 採取中。candidate は最後の Note On 時点の押鍵集合。`firstOnAt` が採取窓の起点 | settle 期限・採取窓終了・応答期限のうち最も早い境界で `sealed` |
| `sealed` | 封緘済み。以後のイベントは無視。**訂正で書き換えない** | 終端 |
| `invalid` | 無効試行(理由付き)。封緘しない | 終端(分母から除外) |

## 2. 採取対象と semantics

- 対象は **押鍵**(Note On / Note Off、channel:note 単位)。「鳴っている音」ではない。
- **CC64 sustain は採取に含めない**。鍵を離せば candidate から外れる(ペダルで響いていても)。表示用の sounding 状態(live MIDI store)とは別物。
- 同じ pitch が別 channel で重なっても 1 音として数える(distinct MIDI note)。同 channel の再打鍵は時刻だけ更新する。
- Note Off は、settle 期限が立っていれば candidate を消さない(封緘までの pre-release candidate を保持)。deadline 前の追加音は candidate に入る(自然な和音のズレ)。次の Note On で candidate は押鍵集合から作り直すので、早く離した音は最終 set に残らない。
- 前回答の保持音は `arm` 時の `held` に入れ、**release してから再打鍵**しないと候補にならない(前課題の残響で即合格しない)。
- 待機前・封緘後のイベントは無視する(late callback)。**境界時刻以降のイベントは、poll がまだ走っていなくても無視する**。

## 3. 具体値(単位は ms、同一の単調時計)

| 項目 | 値 | 意味・根拠 |
|---|---|---|
| 応答待ち | **10000 ms**(`RESPONSE_TIMEOUT_MS`) | `armedAt` から最初の Note On まで。過ぎたら `no-input`。3 秒条件とは無関係 |
| 採取窓 | **1500 ms**(`CAPTURE_WINDOW_MS`) | **最初の Note On** から。arm からではない。2 秒で弾いた正解は消えない |
| settle 窓 | **60 ms**(`SETTLE_MS`) | 最後の Note On から。Dojo `settings.settleMs` の既定値。範囲 0–1000 |
| 封緘時刻 | 最も早い境界 | `min(settle 期限, firstOnAt + 1500, armedAt + 10000)`。`sealedAt` は**境界の時刻**で、poll が遅れて気づいた時刻ではない |
| 採取開始 | `firstOnAt` | 最初の Note On。速度の終点の基準 |
| 完成 | required 音数に初めて到達した Note On の時刻 `completionAt` | 速度の終点。封緘時刻は使わない |
| 速度 | `completionAt - armedAt` | settle も poll 遅延も混ぜない。完成した採取だけが持つ |
| 速度条件 | **3000 ms 以下**(境界含む)。Lv3 の記名だけ | 設計の 3 秒仮説。遅い正答は誤答ではなく「速度条件を満たさない正答」 |
| 耳の `armedAt` | **音源終了コールバックで `performance.now()` を採取した時刻** | 再生中の Note On は回答でない。音源が終わるまで armed しない |
| BPM | 30–240(整数) | Dojo `progBpm` と同じ範囲。ガイドの practice tempo は §6.2 で復元済み |

`isWithinSpeedLimit` は完成した採取だけを対象にする。no-input / incomplete / invalid に速度はない。遅い完成は「played だが速度条件を満たさない」であり、Lv3 の 80% 条件でだけ不利になる。

### 3.1 settle は音数に依存しない

v1 は「required 音数に達した Note On でだけ deadline を立てる」実装だったため、partial の安定集合が永久に settle せず、「封緘は正解集合に依存しない」という説明と矛盾していた。v2 は**すべての Note On で settle 期限を立てる**。したがって partial の安定集合も settle で封緘され、`classifyAttempt` が `incomplete` にする。誤答・部分和音・無入力はそれぞれ別の結果として記録され、どれも「デバイス無効」にしない。

## 4. 判定と分類

- 封緘は**正解集合に依存しない**。settle 期限・採取窓・応答期限だけで閉じる。期待音の一致を終了トリガーにしない。
- 最初の封緘がその試行の回答。後からの訂正は新しい試行(直前の誤答を書き換えない)。
- `classifyAttempt`:
  - `played`: required 音数が揃った封緘。正誤は別層。
  - `incomplete`: 揃わなかった(partial の settle を含む)。
  - `no-input`: 応答待ち内に無入力。
  - `invalid`: 端末/準備/時計/負荷/非表示の無効。**分母から除外**し理由を残す。
- 無効理由: `disconnected` / `prepare-failed` / `clock-jump` / `capability` / `stall` / `hidden`。

### 4.1 負荷・非表示・時計の無効化(具体値)

| 検出 | 条件 | 理由 |
|---|---|---|
| 負荷(stall) | 連続 poll の間隔が **250 ms を超える**(`pollGapInvalid`、境界 250 は有効) | `stall` |
| 非表示 | `document.visibilityState !== "visible"` になった時点(`hiddenInvalid`) | `hidden` |
| 時計飛び | 単調時計が戻る、または単調差と wall 差が **100 ms を超えて**食い違う(`clockJumpDetected`、境界 100 は有効) | `clock-jump` |

- 検出できるのは上記の範囲だけであり、OS/物理 MIDI 遅延や「本人の遅さ」を検出したとは主張しない。
- 無効試行は得点・速度の分母から外し、同じ item を再試行する。**本人の誤答を負荷のせいにして消さない**(閾値は固定値で、結果を見て緩めない)。
- 速度のために Tone lookAhead / 共有 clock を変更しない。

## 5. poll と封緘の順序(反例で固定)

- 採取 driver は 10 ms 間隔で `advance(now)` を呼ぶ(`POLL_INTERVAL_MS`)。
- poll が遅れても、`advance(9000)` のように後から呼ばれた場合の `sealedAt` は境界時刻(例: 1060 ms)になる。
- 境界以降の Note On は、`advance` が走っていなくても `event()` の時点で境界に封緘して捨てる。
- 反例(`inputContract.test.ts` の `REVIEW` 付き):
  - 2 秒で弾いた正解 → `speedMs=2000`、`played`、3 秒以内。
  - 部分和音 → settle で `incomplete`、速度なし。
  - settle を更新し続ける採取 → 採取窓で `capture-window` 封緘。
  - 境界ちょうど/境界後の入力 → 封緘済み set に混ざらない。
  - 遅い poll → `sealedAt` が境界のまま。
  - 耳: 音源終了前の Note On を無視、終了後 1800 ms の完成を 3 秒以内と判定。

## 6. 既存製品との対応(実測)と差分

`judgingCorrespondence.test.ts` が `ChordEntry`(既存の判定 adapter)と同じ fixture を通す。

一致する: 同時/少しずれた和音、重複 pitch を 1 音に畳むこと、release 後の pre-release candidate 保持、再打鍵、sounding(ペダル)との分離。

差分(P23-40 で実装する。**契約ではなく実装の差**):
1. 製品は採取窓も応答待ちも持たない(揃うまで永久に armed)。
2. 製品は required 音数に達した時だけ settle deadline を立てる(partial が settle しない)。
3. 前回答の release ゲートは adapter の外(ガイド画面の `releaseGate`)。
4. 無効理由・再接続・準備失敗・stall/非表示の分類がない。
5. 速度(`completionAt`)を記録していない。
6. 製品の `judgeChord(..., 'core')` は root bass を要求する。記名の答え policy は未指定 bass を自由にするので、コースは `answerPolicy.ts` の受理を使う(§3 の `bank-and-scoring.md`)。

**実機 MIDI・物理 latency は未確認。** 観測できない遅延を「測定済み」と扱わない。

## 7. 未解決

なし。v1 で「P23-40 実装時に閉じる」としていた①耳の音源終了通知の写像、②タブ非表示/CPU stall の閾値、③再接続中の封緘は、v2 で上の具体値と状態遷移に確定した。実装が値通りに動くかは P23-40 の検証項目であり、契約の未決ではない。
