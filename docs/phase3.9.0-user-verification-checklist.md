# Loop Vault Phase 3.9.0 ユーザー確認チェックリスト

## 現在の状態

```text
自動検証: 完了
実機確認: ユーザー確認待ち
別日確認: 未確認
Phase 3.9.0: 暫定完了
```

## 1. 事前準備

### 起動するexe

```text
D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe
```

インストーラー:

```text
D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe
```

### 用意するもの

- MIDIキーボード
- Vaultへ保存済みのコード進行
- KeyとBPMが設定された4/4進行

推奨確認進行:

```text
Cmaj7 | Am7 | Dm7 | G7
Key C
```

テンション確認:

```text
Fmaj9 | G13 | Em9 | A7#5
Key C
```

同一コード:

```text
Cmaj7 | Cmaj7 | Am7 | Am7
```

分数コード:

```text
C/E | Fmaj7 | G/B | Cmaj9
```

## 2. 起動と導線

- [ ] ヘッダーに「練習」がある
- [ ] 練習タブを開くと左に練習キュー、右に道場がある
- [ ] Progression Detailの「練習する」で対象進行が選択される
- [ ] Vaultの一覧やIdea詳細に、仮クリア／確定／要確認バッジが表示される
- [ ] 練習キューが第2のVaultのような複雑な検索画面になっていない

期待結果:

- 確認待ち、stale、古い練習、Favorite未着手、未着手の順でおすすめされる
- Favorite／未着手／確認待ち／L1〜L3で軽く絞り込める

## 3. MIDI接続

- [ ] 設定で使うMIDI入力を選ぶ
- [ ] 練習タブにデバイス名と「接続済み」が出る
- [ ] 切断するとsessionが一時停止する
- [ ] 再接続後、「再接続」で同じデバイスへ戻れる
- [ ] 切断だけではroundがdirtyにならない

内蔵音源とMIDI Thruは今回の対象外。音源なしコントローラではLoop Vaultから演奏音は出ない。

## 4. L1 見て弾く

- [ ] コード名が表示される
- [ ] お手本Voicingが鍵盤とMIDI noteで表示される
- [ ] 「鍵盤で記録」「元MIDI」「自動生成」の出自が表示される
- [ ] お手本と異なる転回形でも構成音が合えば通る
- [ ] オクターブ重複があっても通る
- [ ] 構成外音はアンバー表示される
- [ ] heldとsustainが別の色・ラベルで見える

## 5. L2 名前で弾く

- [ ] コード名が表示される
- [ ] お手本Voicingは表示されない
- [ ] 押している鍵盤と判定feedbackは表示される

## 6. L3 度数で弾く

- [ ] Keyがある進行ではI / ii / V等の度数だけが表示される
- [ ] コード名とお手本Voicingは表示されない
- [ ] Keyがない進行ではL3が無効
- [ ] 無効理由としてKey設定を促す文が出る

## 7. 判定の寛容さ

次を「ゆるい／ふつう／きびしい」で試す。

### Cmaj7

- [ ] ふつう: C E Bで通る
- [ ] ふつう: Gは任意
- [ ] きびしい: C E G Bが必要

### Fmaj9

- [ ] ゆるい: F A Eで通る
- [ ] ふつう: F A E Gで通る
- [ ] ふつう: Cは任意
- [ ] きびしい: F A C E Gが必要

### G13

- [ ] ゆるい: G B Fで通る
- [ ] ふつう: G B F Eで通る
- [ ] D / Aは任意
- [ ] 明示されていない11thを勝手に必須にしない

### Bm11 / C6/9 / altered fifth

- [ ] Bm11の11thがnormalで必要
- [ ] C6/9の6thと9thがnormalで必要
- [ ] dim / half-dimのb5が必要
- [ ] aug / #5のaltered fifthが必要

### 分数コード

- [ ] normalでは転回Bassに寛容
- [ ] strictでは最低held noteがslash bassと一致する必要がある

## 8. Step

- [ ] 正しい和音を100ms保持すると次へ進む
- [ ] 99msでは進まない
- [ ] partialでは進まず、roundもdirtyにならない
- [ ] stableな構成外音でroundがdirtyになる
- [ ] ミスしても前のコードへ戻されない
- [ ] 最後のコードで1周完了する
- [ ] clean step round後にFlowを提案する
- [ ] 音を離しながら順番に弾くアルペジオは通らない

## 9. 同一コードの連続

```text
Cmaj7 | Cmaj7
```

- [ ] 最初のCmaj7を押し続けたまま2つ目を自動通過しない
- [ ] 2つ目で新しいNote Onを送ると通る

## 10. Sustain pedal

- [ ] pedalで残った音はsustain色で見える
- [ ] pedalで残った構成外音が判定へ混入しない
- [ ] 現在heldしている音だけで判定される

## 11. Flow

- [ ] 4/4でFlowを選べる
- [ ] 4/4以外ではFlowが無効で、Stepは使える
- [ ] 開始前に既存のコード試聴が停止する
- [ ] メトロノームが現在BPMで鳴る
- [ ] eventの前後180ms内でmatchすると成功する
- [ ] missでもClockが止まらず次へ進む
- [ ] 一周ごとにclean判定される
- [ ] Escでsessionが一時停止する
- [ ] Pause / Resume / Endが動く

## 12. 仮クリア

- [ ] 選択Levelの目標BPM以上でFlowを行う
- [ ] 連続2 clean roundsで「仮クリア」になる
- [ ] バッジは輪郭表示
- [ ] アプリを再起動しても仮クリアが残る
- [ ] 同じ日にさらに成功しても確定にならない

## 13. 進行編集後のstale

- [ ] 仮クリアまたは確定した進行のコードを編集する
- [ ] Queue / Vault / Detailで「進行更新・要確認」になる
- [ ] 古い進捗が自動削除されない
- [ ] 練習開始時にリセット確認が出る
- [ ] キャンセルすると古い進捗を残したまま開始しない
- [ ] 承認すると現在進行のfingerprintで未着手から始まる

## 14. 別日に確認

仮クリアした日とは異なるローカル日付で確認する。

- [ ] 同じLevelを目標BPM以上で1 clean roundする
- [ ] バッジが塗り表示の「L1/L2/L3確定」になる
- [ ] 確認待ちキューから外れる
- [ ] L3確定後、L1/L2を練習してもconfirmedLevelが下がらない
- [ ] アプリ再起動後もconfirmedLevelが残る

## 15. 回帰確認

- [ ] Live MIDI Mini Mode
- [ ] コード採集
- [ ] Vaultの試聴
- [ ] Progression Detailの編集と保存
- [ ] Quick Editor / Smooth / Style
- [ ] AI展開案
- [ ] アプリの×ボタン終了と再起動

## 16. 不具合報告テンプレート

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

