# P23-40 への実装差分・依存

P23-40 は `docs/p23-39-contracts/` の凍結版 pair(`p23-39.bank.lv1-3.v3` + `p23-39.policy.lv1-3.v3`、contract `p23-39.contracts.v3`)を前提に、Lv1〜3 の縦通しを実装する。ここに挙げた以外の拡張をしない。**v1/v2 pair は使わない**(`freeze-history.md`)。

## P23-39 v3 で確定した値(実装がそのまま読む)

| 事項 | 確定値 | 正本 |
|---|---|---|
| 耳の計測開始 | 音源終了コールバックで `performance.now()` を採取し `arm(at)`。終了前の Note On は無視 | `input-contract.md` §3 |
| 応答待ち / 採取窓 / settle | 10000 ms / 最初の Note On から 1500 ms / 最後の Note On から 60 ms | `inputContract.ts` |
| 封緘時刻 | 最も早い境界。poll 遅延で動かない。境界後の入力は捨てる | `input-contract.md` §3・§5 |
| 速度 | `completionAt - armedAt`。3 秒は Lv3 の独立正答だけ | `inputContract.ts` |
| 負荷・非表示・時計飛び | poll 間隔 > 250 ms → `stall`、visibility 非 visible → `hidden`、単調差と wall 差 > 100 ms または逆行 → `clock-jump`。分母から除外して再試行 | `input-contract.md` §4.1 |
| 遅延 set | `bank-lv1-3-v3.json` の `sets[level].name.delay` をそのまま使う。Lv1/Lv3 は同じ cell の別 placement、Lv2 は spare cell 4 + 別 placement 6。別順序だけは不可 | `bank-and-scoring.md` §2 |
| 遅延の日時 | 遅延 block の開始が同日 block の完了より後のローカル日付で、かつ 12 時間以上後。時刻欠落・同日・12 時間未満・逆行は不合格 | `bank-and-scoring.md` §5.1 |
| 評価 set の quality | Lv2 耳は 4 quality(maj7 3 / min7 3 / dom7 2 / min7b5 2)、Lv3 遅延は 6 quality × 2。問数・合格点は変えない | `bank-and-scoring.md` §2 |
| 耳 set | `sets[level].ear.items` の 10 問。Lv1 は 2 択(maj/min)+実演、Lv2 は聴き分けて実演。1 回再生、再生し直しはヒント | `bank-and-scoring.md` §3 |
| 答え | 記名は必須構成音のみ(未指定 bass 自由・転回可)。保存 voicing は完全一致。耳は和声 + root bass | `bank-and-scoring.md` §4 |
| 合格集約 | `evaluateLevel`/`levelPass`。分母・quality 5/4・根音 coverage・遅延・耳・速度を全部要求。部分表示は `practiceProgress`(非進級) | `bank-and-scoring.md` §5 |
| 保存先 | `loop-vault:guided-course-v1:data` / `loopvault/guided-course-v1.json` / envelope `loopvault-guided-course`、fileVersion 1 | `store-contract.md` §6 |

## 実装差分(既存コードへの影響)

1. **入口**: ホームの5枚目「ガイド練習」をコース入口に置換(二重入口なし)。カードは実データ(レベル、今日: 復習n / 新規n)を表示。単発の教材選択をコース開始前提にしない。
2. **教材**: `bank-lv1-3-v3.json` の item を使用。教材選択はアプリ側。`inventory.json` の gap 3 cell(maj D♭ / min E♭ / min7b5 B)は進行教材としては adapter 必要だが、Lv1–3 の synthetic chord item は public recipe で全 12 根音を発声できる(bank test で確認済み)。
3. **入力**: `inputContract.ts` を実装へ移植(応答待ち・採取窓・settle・境界封緘・completionAt 速度・invalid/no-input 分類・前回答 release ゲート・stall/非表示)。既存 `ChordEntry` は通常練習用に維持し、コース用の薄い wrapper から同じ event を流す。`ChordEntry` の「required 数に達した時だけ deadline」はコース wrapper で置き換える(製品 adapter 自体の挙動は変えない)。
4. **判定**: 記名は `answerPolicy.ts` の `judgeCourseAnswer(item, "name", sealedNotes)`。product の `judgeChord(..., 'core')` は root bass を強制するため、そのまま使わない。保存 voicing の教材だけ `saved-voicing`、耳は `ear`。単一の固定 MIDI 集合を唯一の正解にしない。
5. **採点**: `policy-lv1-3-v3.json` と `evaluateLevel`。Lv1 20/18 + 遅延 10/8 + 耳 10/8、Lv2 20/18 + quality 4/5 + 遅延 10/8 + 耳 10/8、Lv3 30/27 + quality 4/5 + 3 秒 80% + 遅延 12/10。部分表示は `practiceProgress` だけを使い、正式合格の表示に流用しない。Lv3 の旧 24/22 は superseded。
6. **保存**: `storeContract.ts` の schema と §6 の物理キーを実装。trial 冪等、無効理由、自己/MIDI 分離、pair 不一致拒否。通常 Dojo の記録へは書かない。ネイティブは既存の plugin-fs(`$APPDATA/loopvault/**`)で一時ファイル → rename、破損は `.corrupt-<token>` に隔離し、バックアップ/export には載せない。Rust の新規コマンドは追加しない。
7. **UI**: P23-35 の練習画面を再利用。レベル/今の目的/1問/見本/操作に絞る。Lv4 以降の名前・準備中・分母は出さない。「基礎コース Lv1〜3」表記。耳は既存の再生終了コールバックと既存音源を使い、新しい耳エンジンを作らない。
8. **復習/進級**: 同日 set と遅延 set を分離。別日判定は日付+12時間。期限切れで降格しない。先取り練習と正式合格を分ける。invalid は同じ item で再試行し、得点/速度の分母に入れない。

## 依存

- P23-35/38 の guided engine(session-only)を再利用する。engine からの暗黙 write を追加しない。
- 既存 Dojo の設定(progBpm 30–240、settleMs)とコース practice tempo(§6.2 で復元)を使う。
- 既存 ear session の判定セマンティクス(和声 + 指定 bass)を adapter で使う。問題は bank の合成単和音で、417 個の進行耳問題は Lv1–3 では使わない。
- 既存のバックアップ/export には触れない。

## P23-40 で決めてよいもの(契約値ではない)

- 画面の文言・余白・focus 順・進捗の見せ方・再確認の導線。
- これらは凍結した値(問数、合格点、set、速度、無効条件、保存先、答え policy)を変えない範囲での実装判断であり、P23-40 の READY を妨げない。

## 状態

実装済み(2026-11-17)。製品側の正本は `src/domain/chordDojo/guidedCourse/`(凍結 JSON のコピー、capture、answer、review、store)と `src/views/chord-dojo/GuidedCourseView.tsx`。検証結果と tested HEAD は `docs/reports/p23-40-guided-course-lv1-3.md`。P23-38 の単発ガイド画面はホーム入口から外れ、`GuidedPracticeView` は履歴として残る。
