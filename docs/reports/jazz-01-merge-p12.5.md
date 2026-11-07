# Jazz-01: 統合ブランチで P12.5 と master を合わせて確かめる

ブランチ `integrate/p12.5-on-master`(master `95aa2fa6` から)。統合コミット `e2951fda`(`feat/p12.5-original-practice` の `cb2d1b95` を取り込み)。**master へのマージ・push・タグはしていません。** Jazz のデータ・コードはまだ入れていません。
Stage 00 の報告(`jazz-00-audit.md`)で承認された直しを入れました。捨て用の `trial/jazz-00-p125-merge` の5ファイルを元にし、差分を全部見直しました(下 §1)。

## 1. 食い違いをどう直したか(ファイルごと)

`git merge`(押し戻し・`rebase` なし)で、衝突は5ファイルでした。ほかの変更(`session.ts`・`store.ts`・`longProgression.ts`・`chord-dojo.css`・`BuiltinProgressionList.tsx`・e2e など)は自動で合いました。

| ファイル | 直し方 |
|---|---|
| `scripts/p89/playwright.p89.config.ts` | `testMatch` の連なりに `P12.5` を先頭に足し、master の `P15` 以下をそのまま残す |
| `src/views/chord-dojo/dojoNav.ts` | 画面の種類に `'ear'` と `'original'` の両方。`original` の戻り先・`placeKey` も P12.5 のまま |
| `src/features/bass-practice/infra/repository/practiceStorage.ts` | master の表の形(`PracticeNamespace`・`NAMESPACE_APP`・`VERSION_ONE_APPS`)を採り、3つの表に `original-practice` / `loopvault-original-practice` を足す。P12.5 の「Original は壊れた/未対応のバックアップだけでも初回と誤認しない」処理はそのまま入った |
| `src/views/chord-dojo/ChordDojoView.tsx` | 1行が非常に長いので、記号の区切りごとに分けて3者マージ。本当の衝突は画面の種類(`'ear'`+`'original'`)とキー入力の除外の2つで、どちらも両方残す。P12.5 の追加(`originalCfg`・ヒント/ミスの印・`OriginalPracticeView` の呼び出し・`onOriginal`)は自動で入り、master の P16・`barProgress` などは残った |
| `src-tauri/src/practice_storage.rs` | ① 置き場所の分岐に `ear-practice` と `original-practice` の両方 ② `validate_document`・`with_current_version_and_revision` の `matches!` に `loopvault-original-practice` を足す(P12.5 の別の変数は不要) ③ テスト2つとも残す ④ **見えない食い違い**:`save_document_unlocked_with_fault` の「書く入れ物の `app` が、そのファイルの持ち主か」の確認は、P12.5 の版だと `ear-practice-v1.json` を知らず、耳で弾くの保存が全部失敗する。**ファイル名で4つ(通常・ベースのライブラリ・耳で弾く・Original)を決める `match` に直した** |

**trial との差分**:統合ブランチは trial の解決(上の5ファイル)と同じで、違うのは次の §2 のテスト(41行)だけです。

## 2. 足したテスト

`every_storage_namespace_accepts_only_its_own_app`(`practice_storage.rs`):置き場所4つ(通常・ベースのライブラリ・耳で弾く・Original)のそれぞれが、
- 自分の `app` の入れ物だけ保存でき、ほかの3つの `app` の入れ物は、**最初の保存の前にも後にも**拒否され、
- 拒否されたあとも保存済みの中身が変わらない(最初の前なら何も書かれない)

ことを確かめる。**効くことの確認**:`match` から `ear-practice-v1.json` の枝を一時的に消すと、このテストと P16 の `ear_practice_is_isolated_…` の両方が不合格になる(確認後に元に戻した)。

## 3. 確かめの結果

| 確かめ | 結果 |
|---|---|
| 型(アプリ・e2e)・ESLint・クラス lint・source contracts | 通過 |
| `cargo test --lib` | **69/69**(`practice_storage` は 17/17) |
| Vitest(単独の全体) | 4902 通過・3 不合格:`scripts/p7/modularTournament.test.ts`・`scripts/p7/sealedFinal.test.ts`・`src/domain/earPractice/earPractice.test.ts` は、全体を並列で走らせたときの時間切れ。**3本だけを単独で走らせると 40/40 通過**(後の `test:full` の Vitest 全体も通過) |
| e2e(spec で絞った:P12.5 の Original・ヒントで戻らない/定番の進行 `p12-3`・`p12-4*`・`p12-1`・`p12-chord-dojo`・ホームの配置/耳で弾く7本) | **224/224 通過**(5.6分) |
| **`npm run test:full`(1回)** | **PASS**(1208.8秒)。ESLint・クラス lint・source contracts・e2e 型・phase docs・AI handoff・privacy・アプリ型・本番ビルド・Gallery 除外・Runner 27/27・**Vitest 全体 PASS**・**Playwright 696/696**・`git diff --check`。ログ `.local-evaluation/test-logs/2026-10-22T01-50-33-606Z-full.log` |

- 落ちたテストはありません。**単独で再実行して master と比べる対象は、`test:full` では出ませんでした**(Vitest の3本は上のとおり単独で通過。master で同じ時間切れが出るかは、並列全体を master で走らせていないので未確認)
- P13.1 の `phase13-1-bass-ui.spec.ts`(前の FULL の不合格)は、`test:full` の中で通過。Master 2-5-1 の2本(Stage 00 の長い実行で時間切れになった)も通過
- **作業ツリーの注意**:FULL の実行時、統合コミットのほかに、前の作業(試聴の遅れの調査)の**未コミットの残り**が作業ツリーにありました:`src/testing/previewFadeLab.ts` の変更(測定用の台。`?previewfade`・fixture ビルドだけで入る)と、未追跡の `e2e/tmp-s2.spec.ts`(その台を呼ぶだけの調査用 spec で、FULL の Playwright の件数に1件含まれる)。どちらも統合の内容とは無関係で、私は触っていません(捨てていません)。統合ブランチにはコミットしていません

## 4. 画面写真(1280×720)

`p89-generated/jazz-01/`(Git 管理外):
- `list-original@1280x720.png`(1440×900 も):定番の進行の一覧の最後に **Original Practice のまとまり**(2件)
- `original-practice@1280x720.png`(1440×900 も):Original Practice の練習画面

Stage 00 で測ったとおり、1280×720 ではカード領域が 192px で、**カードの右手の行は折りたたみの下に隠れます**(Original の今の画面のまま。Jazz の Stage 03 で扱う)。鍵盤の横あふれは 0。

## 5. 利用者の実機の確認(Original Practice を1周)

この統合ブランチでアプリを動かし(exe が要るときは言ってください。master 以外からの exe は、指示があれば作ります)、次を確かめてください(P12.5 報告 §6 と同じ):
1. 定番の進行 → 一番下の **Original Practice → 01 Traditional Passing** → 元のキー(E♭)で、MIDI キーボードで **メロディなどを重ねながら 3 周**。引っかかる所が無いか(押さえたままの音、同じ和音を押し直す E♭maj9 の2枚目)
2. 弾き終わった周で「完奏」が増え、一覧の記録に出る。アプリを開き直しても残る
3. MIDI を抜いたとき、同じカードで止まる(勝手に「自分で判定」にならない)。つなぎ直すと続けられる
4. 別のキーに移した音域が弾きやすい範囲か(端は A と A♭)
5. カードを押した音の響き
6. **今の Dojo(見て弾く・覚えて弾く)** で、ヒントを見ても最初に戻らず続くこと(P12.5-01)。**耳で弾く**の記録が保存されること(今回直した所)

## 6. 止まる

Jazz のデータ・読み込み・画面は、**まだ何も入れていません**。利用者が統合ブランチで Original Practice を実機で1周弾いてから、master に入れるかを決めます。その判断までは、Stage 02 に進みません。
trial ブランチ `trial/jazz-00-p125-merge` は、この統合が確かめられたあとは不要です(消す・残すは利用者が決める)。
