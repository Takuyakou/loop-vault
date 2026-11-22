# P23-39 course store の契約(v2・凍結)

対象: P23-40 の専用 store。通常 Dojo の today/cursor/recent/practice-opens/Vault は変更しない。

## 1. 境界

- 入力: P23-35/38 の session-only engine から渡される**明示的な trial outcome**だけ。
- engine から store へ暗黙 write しない。store から engine へ結果を戻さない。
- 過去の単発セッション成功を course 合格へ移行しない(自動移行なし)。
- UI は P23-38 の単発入口を P23-40 でコース入口へ置換する。二重入口・設定 checkbox を増やさない。

## 2. schema(version 1)

```
loopvault-guided-course / version 1
  bankVersion, policyVersion, pairId
  trials[]:
    trialId (一意・冪等キー)
    itemId, level 1–3, quality, root 0–11
    result: correct | wrong | incomplete | no-input | invalid
    invalidReason? (invalid の時だけ必須)
    sealedNotes[] (0–127 の採取音。これが必要最小の証拠)
    speedMs? (完成した試行だけ)
    hintUsed, selfConfirmed, midiConfirmed (独立した真偽値)
    startedAt, sealedAt (ISO 8601)
```

- `itemId` は**凍結 bank(`p23-39.bank.lv1-3.v3`)の item を指す**。set(same-day/遅延/耳)は bank の `sets` から導出するので保存しない(導出できる重複情報を増やさない)。bank に無い itemId は合格集約で「set 外」として不合格になる。
- P23-40 の実装は、公式評価が試行を混ぜないよう trial に **`attemptId`(評価 session)と `block`(`sameDay`/`delay`)** を追加し、store に **`active`(現在の attempt)** を持つ。record schema は version 1 のままで、互換性は pair 照合が決める。公式合格は「完了した 1 attempt」だけを使い、未完了の再試行を前の attempt と混ぜない。
- **保存しない**: 音声、raw MIDI ストリーム、device id、OS パス、利用者名。
- `selfConfirmed` と `midiConfirmed` は別。自己確認は MIDI 確認へ昇格しない。
- ヒントあり(`hintUsed`)の試行を独立合格(`midiConfirmed` の合格)として保存しない。
- 耳の 2 択の選択値は保存しない。選択と実演の両方が通ったときだけ `result: correct` にする(選択の内訳は再現に不要)。

## 3. 適用規則(`applyTrial`)

- version pair が**内部整合**する store にだけ適用(`pairId === bankVersion + "+" + policyVersion`)。未知の schema/version は拒否(黙って移行しない)。
- 凍結 pair(`p23-39.bank.lv1-3.v2+p23-39.policy.lv1-3.v2`)との照合は loader の責務。v1 pair の store は読めても適用しない(自動移行なし)。
- `trialId` は冪等: 同一 id・同一内容は no-op、同一 id・異なる内容は conflict。
- フィールド不正(範囲外、日時、無効理由の欠落/過剰、禁止キー)は拒否。
- 書込失敗時はメモリ上の store を保ち、部分保存しない(呼出側が次回に再適用)。

## 4. 再開・破損・互換

- 未知 version / 破損データは `validateStore` が拒否。既存データを消さず、UI は「読めない」と表示して新規書込を止める。
- `bankVersion` / `policyVersion` の不一致: 旧合格を新 pair へ自動変換しない。再確認が必要な範囲は level/quality/root の coverage から算出する(実装は P23-40)。
- export/backup は既存のバックアップ機構の対象にしない(音声・raw MIDI を含まないため)。必要なら別契約。
- reload/resume: `trials` の追加順を保ち、日付は保存値を正とする。再起動を「別日」扱いしない。

## 5. 証拠の最小性

保存するのは `sealedNotes`(コース判定に使った押鍵集合)と結果・速度・フラグ・版・日時だけ。正解の再生成はしない。判定 policy は `policy-lv1-3-v2.json` の版で固定し、同じ trial を別 policy で再解釈しない。

## 6. 保存先(物理キー。P23-40 へ先送りしない)

| 項目 | 凍結値 |
|---|---|
| browser | `loop-vault:guided-course-v1:data` |
| native directory | AppData の `loopvault/`(既存 Dojo と同じ app-data ルート) |
| native file | `guided-course-v1.json`(一時ファイル `.tmp`、lock `.lock`、隔離 `.corrupt-<token>` は既存方式に合わせる) |
| envelope | `{"app":"loopvault-guided-course","fileVersion":1,...}` |
| store schema/version | `loopvault-guided-course` / 1 |

- `fileVersion` は 1 のまま。v2 で変えたのは**照合する契約 pair**(v2)であり、record shape ではない。
- 通常 Dojo(`loopvault-chord-dojo`)・耳(`loopvault-ear-practice`)・Original(`loopvault-original-practice`)・Bass(`loopvault-practice` 系)のファイル/名前空間へは書かない。P23-40 の実装は、既存の `$APPDATA/loopvault/**` の plugin-fs 権限で `.tmp` → `rename` の置換と `.corrupt-<token>` 隔離を行う。バックアップ/export の対象外という契約を守るため、既存の取込用 Rust コマンド(`save_practice_file` 系)は使わない。Rust の新規名前空間は追加しない。
- バックアップ/export/reset の対象にしない。破損時は既存データを消さず、読めないことを表示して新規書込を止める。

## 7. 未解決

なし。保存先・キー・envelope・pair 照合・破損時の扱いを v2 で確定した。P23-40 で残るのは実装と UI 文言だけである。
