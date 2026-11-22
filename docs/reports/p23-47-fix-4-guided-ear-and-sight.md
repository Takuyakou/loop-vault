# P23-47-fix-4 画面の直し 7 つ + ガイド練習の耳と初見譜

- 基点: `feat/p23-49-guided-stage` の先頭 `7f72f011`（P23-49 は master に入れずレビュー待ち。連続の指示どおり master ではなくこのブランチから）
- ブランチ: `feat/p23-47-fix-4-guided-ear-and-sight`（HEAD `62542a1e`）
- 状態: 画面の直し 7 つ・耳・初見譜・写真 24 枚を実装。FULL は Vitest の 1 件（この段の変更が原因。単体テストを直して 23/23 PASS）で止まり、追記 3 の指示どおり Playwright を全件実行して **1287 PASS / 2 skip / 1 FAIL**。残った 1 件は **リードの判断で基準 1 枚（`practice-chromium-desktop-win32.png`）だけを #6 の新しい Chord Dojo ホームに合わせて更新**し、`visual.spec.ts` は **6/6 PASS**。**master へは入れていない。**
- 指示書: 追記 2 第 3 版（画面の直し 7 つ）→ 追記 3（p23-25 の 1 行）→ 元の指示書（耳・時間切れ・初見）→ 追記 1（Lv1 の耳の二択を無くす）。

## 1. 画面の直し 7 つ（追記 2 第 3 版）

| 差分 | ファイル数 | 結果 |
|---|---|---|
| `P23-47-fix-4-ui-v3.patch` | 13（`src`） | 適用済み |
| `P23-47-fix-4-ui-v3-tests.patch` | 9（`e2e`。新しい 14 本 + 既存 8 本の期待） | 適用済み |
| `P23-47-fix-4-ui-v3-tests-2.patch` | 1（`p23-25` の 1 行） | 適用済み（#4 で消した説明行を「無い」と「聴いてまねる」に） |

差分に無い見た目・言葉・数は変えていない。

## 2. 耳と初見譜（元の指示書・追記 1）

| ファイル | 変更 |
|---|---|
| `src/views/chord-dojo/GuidedCourseView.tsx` | Lv1 の耳からメジャー／マイナーの二択を削除。採点は弾いた和音と最低音だけで行う（選択は使わない）。回答前の案内を「一番低い音をFにして、聴いた和音を弾いてください」に。待ちは「弾いてください」。正解後は「一番低い音はF。上の音は別の配置でも弾けます」 |
| `src/views/chord-dojo/AdvancedCourseView.tsx` | 耳の再試聴中は採点を止め（`earReady=false`）、終わったら回答窓を開く。回答を始めた後は再試聴を無効。状態は「再生中・終わったら弾いてください」。総合確認③は MIDI 未接続なら「拍の練習を始める」で 4 カウント→8 小節を表示し、終了は「8小節の拍を確認しました」。得点・正誤・記録なし、もう一度で同じ譜面。途中で接続しても正式演奏に切り替えない |
| `e2e/p23-47-fix-4-ear-and-sight.spec.ts`（新） | 2 本。Lv1 の耳を二択なしで MIDI 正解（名前 10 問を通してから）、総合確認③を未接続で最後まで（記録が変わらない） |

二択の値が入っている過去の記録はそのまま読める（保存 schema は変えていない）。教材 ID・途中位置は引き継ぐ。

## 3. 点検（すべて PASS）

`npx tsc --noEmit`・`npx tsc -p tsconfig.e2e.json`・`npm run lint`・`npm run build`。

## 4. E2E・Vitest

- 指定の 22 spec: **268 件中 267 PASS、1 FAIL**。落ちた `p23-25-bass-practice.spec.ts:72` は #4 で消した説明行を見ており、追記 3 の差分で直した → 単独 **6 / 6 PASS**。
- 新しい `p23-47-fix-4-ear-and-sight.spec.ts`: **2 / 2 PASS**（40.2 秒）。
- 基本コースの spec（`p23-40`・`p23-42`・`p23-44`）: 二択を消したことに合わせて期待を更新し、**36 / 36 PASS**（p23-40/42/44 + 既存の guided 群の再実行を含む）。
- Vitest: `VaultView.test.tsx`・`views/vault`・`views/chord-dojo` = **27 ファイル / 350 件 PASS**。

### 4-1. FULL と自分で回した Playwright

1. `npm run test:full -- --fresh` を 1 回。
   - 非 Playwright: source contracts、AI handoff、phase docs、class lint、runner contracts 40/40、privacy scan、E2E TypeScript、production build、repository ESLint、App TypeScript — すべて PASS。
   - **Vitest: 7048 / 7051（既存 skip 2）で 1 件 FAIL**: `src/views/chord-dojo/AdvancedCourseView.test.tsx`「offers the capstone sight chart…」。MIDI 未接続の開始ボタンが「拍の練習を始める」になったのに、テストが「70 BPM」を見ていた。**この段の変更が原因**なので、期待を新しい仕様（未接続の表示）に直した。単体 **23 / 23 PASS**。
   - Playwright は Vitest の失敗で FULL が止まり、走らなかった。
2. 追記 3 の 3 節に従い、**Playwright を全件自分で実行**（`npm run test:e2e`）。
   - **1287 PASS / 2 skip / 1 FAIL**（13.1 分、1290 件）。
   - 落ちた 1 件: `e2e/visual.spec.ts:70`「Vault, detail, Dojo and long content」の `practice.png` の比較（31802 画素・4% の差）。
   - **基準の写真（Tracked PNG）は更新していない。** 単独で 3 回回しても 3 回とも同じく落ちた（意図したホームの変更による恒久的な差）。
   - 原因: #6 で Chord Dojo ホームの何も無い時の「続きから」が「まずは「ガイド練習」か「定番の進行」から…」・「ガイド練習を始める」に変わったこと。基準は Phase 5.13 のまま。
   - 追記 3 の条件（①その段で変えていない・E2E の一覧に無い ②単独 3 回とも PASS ③2 件まで）のうち②を満たさないため、**止めて報告**する。基準を更新してよいかはリードの判断。
3. heavy の 6 本の再実行は、全件実行でその 6 本が落ちていないため行っていない。
4. **リードの判断で基準 1 枚を更新**（2026-11-19 14 時）。`e2e/visual.spec.ts-snapshots/practice-chromium-desktop-win32.png` だけを `--update-snapshots=changed` で更新した。
   - 更新前後の差: Playwright の比較で **31,802 画素（1280×720 の 4.0%）**。生のチャンネル差は 271,376 画素（29.5%、文字のアンチエイリアスを含む）、見た目差（>30）は 59,911 画素（6.5%）。
   - 変わった PNG はこの 1 枚だけ（`git status --short -- "*.png"` で確認。ほかは更新していない）。
   - 新しい `practice.png` を OCR で確認: 「続きから」の帯が「まずは「ガイド練習」か「定番の進行」から ・ 練習を始めると、ここから続けられます」、「ガイド練習を始める」になっている。4 枚のカード（定番の進行・2-5-1 Master・耳で弾く・ボイシングドリル）、横長のガイド練習、右の列という形は、見本 `handoff/mocks/p23-47-fix-4-v3/dojo-home-nomidi-1440.png` と同じ（見本は 1440×900 で記録あり・テーマ C Am F、基準は 1280×720 で記録なし。状態と窓の違いだけで、配置は同じ）。
   - 更新後に `npm run test:e2e -- e2e/visual.spec.ts --project=chromium-desktop` を 1 回 → **6 / 6 PASS**（29.8 秒）。FULL のやり直しはしていない。

## 5. 写真（`docs/reports/p23-47-fix-4-assets/`）

見本と同じ名前・同じ状態・同じ窓で **24 枚**を撮った（`p23-47-fix-4-v3/` の 20 枚 + `p23-47-fix-4/` の 6 枚のうち、再現できない「前」の 2 枚を除く）。

- Chord Dojo ホーム: `dojo-home-1440`（新テスト）・`played`・`nomidi`・`1366`・`1280`・`1024`・`768`・`today-details`・hover 7 枚。
- Vault: `vault-top-1440`（新テスト）・`on`・`1024`・`768`。
- Bass: `bass-home-1440`・`bass-home-help-1440`。
- Live MIDI: `live-midi-large`（新テスト）・`mid`・`small`。
- 撮れない 2 枚: `vault-top-before-1440`・`live-midi-large-before` は変更前の見本で、変更後のアプリからは再現できないため撮っていない（見本は `handoff/mocks/` に残る）。
- 見本との違い: 見本は Linux の字（アンチエイリアス）。「記録あり」の写真は仕込みの数が見本と違う（形は同じ）。写真は FULL の前にコミットした。

## 6. 注意・未実施

- **master には入れていない。** 基準 1 枚はリードの判断で更新し、`visual.spec.ts` は 6/6 PASS。FULL は Vitest の 1 件（この段の原因）で止まった後、追記 3 に従って Playwright を全件実行し、残りは基準 1 枚だけだった（更新後に PASS）。FULL のやり直しはしていない。
- push、tag、release、EXE 作成はしていない。
- 二択を無くした後の受け入れ条件は、fix-1 の E1〜E10 で確かめた（下の 8 節）。最低音違い（E1）・構成音不足（E2）・Lv2（E5）・Lv7 の再試聴（E6）・総合確認の耳（E7）・初見の接続/切断/未接続（E8〜E10）を含む。
- 実機 MIDI での確認はしていない（合成 MIDI と画面の数字まで）。

## 7. 試用 EXE

- 依頼により、ブランチ `feat/p23-47-fix-4-guided-ear-and-sight`（`d05cd6b3`）から Windows x64 の EXE を作った。インストーラーは作っていない。
- 作り方: 本番の web build（`npm run build`、`VITE_P527_E2E_FIXTURE=0`・`VITE_P89_GALLERY=0`）→ `npx tauri build --no-bundle`（release、`CARGO_NET_OFFLINE=true`、`CARGO_TARGET_DIR=<作業フォルダ>\lv-target-p23-47-fix-4`）。
- ファイル: `<作業フォルダ>\lv-target-p23-47-fix-4\release\loop-vault.exe`（26,809,344 bytes、SHA256 `8E95DDF7EC18FC65DA5D9FC95B20A3020255C52C3C9B1937CC893F33E6420B9B`）。同じ物を `<作業フォルダ>\loop-vault-builds\loop-vault-p23-47-fix-4.exe` に置いた。
- 製品 dist の確認: `p104ProgressionE2eFixture`・`installP12Fixture`・`ComponentGallery` は含まれない。`__p12Midi` は EarRun の実行時プローブ（製品コード）だけ。
- EXE は起動していない（実機の音・MIDI の確認は未実施）。


## 8. P23-47-fix-4-fix-1（リードのレビュー後）

### 8-1. 差分

`P23-47-fix-4-fix-1.patch`（`GuidedCourseView.tsx` 1 ファイル）を当てた。耳の問題は、答える前は「根音 F」のまま、**採点が出た後は名前の問題と同じ試聴カード**（`course-chord-card`、名前は `Fm`）になり、押すと正解の一例が鳴る。入力が無かった時は今までどおり。

### 8-2. 足したテスト E1〜E10（`e2e/p23-47-fix-4-ear-and-sight.spec.ts`）

| # | 内容 | 結果 |
|---|---|---|
| E1 | Lv1 Fm で A♭ を最低音にした [56,60,65] | `wrong`・「一番下の音が A♭ です（F を指定）」・答えた後に `Fm` の試聴カード・「一番低い音はF。上の音は別の配置でも弾けます」 |
| E2 | 2 問目 A で 3 度を抜いた [57,64] | `wrong`・「D♭ がありません」 |
| E3 | 3 問目で「もう一度聴く」の再生中に正解を弾く | 再生中は採点されない。終わってから正解 → `correct`・`course-hint-note` あり |
| E4 | 4 問目を提示だけで正解 | `correct`・ヒントなし |
| E5 | Lv2 の耳 1 問目（Cmaj7） | `correct`・保存に `lv2-e-139` の `hintUsed: false` の試行 |
| E6 | Lv7 の耳で 7.8 秒後に再試聴 | 再生中は「再生中・終わったら弾いてください」で「入力がありませんでした」が出ない。終わってから正解 |
| E7 | 総合確認の耳（② 4 コード進行）で同じ | 同じ |
| E8 | 初見譜を接続して開始し 8 小節を弾く | 判定が出て、advanced の試行が 1 つ増える |
| E9 | 初見譜の途中で切断 | 「記録していません」と「同じ問題からやり直す」、記録は増えない |
| E10 | 初見譜を未接続で開始し途中で接続 | 最後は「8小節の拍を確認しました」、得点・記録なし |

写真 4 枚: `ear-q-1440`・`ear-wrong-1440`・`ear-q-768`・`ear-wrong-768`。答えた後の見出しが `Fm` の試聴カードになり、鍵盤の上の段の高さが答える前と同じことを確認した。

### 8-3. 直した所（耳と初見の所だけ）

- `GuidedCourseView.tsx`: 再試聴の開始で採点用の capture を捨て、提示が終わったら作り直して arm する（再生中の入力は採点しない）。capture の再開を確実にするため、arm のたびに poll を作り直す `captureEpoch` を足した。
- 同じファイル: 耳の答えで構成音が足りない時は `incomplete` ではなく `wrong` にした（E2 の「D♭ がありません」を不正解として出す）。
- 同じファイル: ヒントの表示（`course-hint-note`）を再試聴の行から外し、答えた後も見えるようにした。
- `AdvancedCourseView.tsx`: 再生中の状態を「再生中・終わったら弾いてください」に（提示待ちより優先）。初見の「正式な回かどうか」を開始時の接続で固定した（`startedConnected`・`official`）。途中で接続しても未接続開始の回は練習のまま、接続開始の回だけ記録する。
- `AdvancedCourseView.test.tsx`: 提示中の表示の期待を新しい「再生中・終わったら弾いてください」に直した。

### 8-4. 検証

- 点検: `npx tsc --noEmit`・`npx tsc -p tsconfig.e2e.json`・`npm run lint` すべて PASS。
- 指示の 9 spec: **57 / 57 PASS**（2.9 分）。
- 新しい E1〜E10: **9 / 9 PASS**（10 個の確かめ、2.8 分）。
- `npx vitest run src/views/chord-dojo`: **21 ファイル / 310 件 PASS**。
- FULL は回していない（指示どおり）。
