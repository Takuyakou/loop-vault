# P23-45 ガイド練習 Lv4〜8・総合確認 — 実装と確認

- ブランチ: `feat/p23-45-guided-course-advanced-and-capstone`
- 基点: `fc218044`（P23-44-fix-1）
- 実装 HEAD: `669a1efc`（Lv4 の2配置見本、Lv1〜3→Lv4 の接続、途中からの自由練習／確認復帰、修了画面を含む）
- FULL 実行 HEAD: `ac2fe55a`（実装 HEAD と同じコード。報告メタデータのみ追加した docs-only コミット）
- 対象: Lv4〜8・総合確認、レベル切替と自由練習、旧 store 互換

## 1. レベルごとの教材と合格条件

公式の合格条件は `src/domain/chordDojo/guidedCourse/advanced/levels.ts` と `review.ts` に定義し、教材は `bank.ts` から読み取り専用で解決する。

| レベル | 教材（同日 / 別日） | 合格条件 |
| --- | --- | --- |
| Lv4 配置を選ぶ | 10組20問 / 5組10問。分数コード8問（5コード）。C/E と C/G、Fmaj7/B と Fmaj7/E、G7/F と G7/B は最低音の違う対 | 同日 18/20、別日 8/10。最低音指定は判定し、上声・転回・重複・運指は自由 |
| Lv5 進行を覚えてつなぐ | 進行10問（6系統すべて）＋中間カード4問 / 5問 | 進行 8/10 かつ中間 3/4、別日 4/5。1問は全カードが順番どおりのときだけ正解 |
| Lv6 キーを変えて使う | 12キー12問 / 6キー6問＋未確認キー再確認12問 | 同日 10/12、別日 5/6、12キーすべてに正答の証拠。未確認キーだけを再確認 |
| Lv7 耳から進行を弾く | 10問 / 5問。基準のカデンツ＋進行、標準提示2回 | 8/10、別日 4/5。名前・度数・見本鍵盤は非表示。3回目以降はヒント |
| Lv8 響きの語彙 | 3群 ×（コード名20＋耳10）/ 別日10。6・add9・sus2・sus4／m9・maj9・9／13・ルートレス | 各群 18/20・8/10、別日 8/10。3群すべてで合格。群別に途中再開 |
| 総合確認 | ①コード名24（12根音）②4コード進行5 ③初見8小節3 / 別日コード名12＋耳3 | ①22/24 かつ正答の80%が3秒以内 ②4/5 ③各譜面90%以上・2拍超の停止なし。別日11/12・3/3 |

- Lv8 の借用和音（A♭→B♭→C）、セカンダリードミナント（D7→G7→C）、バックドア（Fm7→B♭7→C）は練習用の実例として見本に含めた（公式20/10/10には数えない）。
- 拡張和音の正答規則は既存の `buildPracticeChordRequirements(..., "normal")` をそのまま使う。13 は 3・7・13 を必須、5度・11度は任意。ルートレスは根音だけを必須から外し、和音の全構成音を許容する。
- 初見③の「途中停止」は、期待した拍が3拍以上連続で一致しない場合と定義した（`SIGHT_MAX_STOP_BEATS = 2`）。

## 2. 保存と判定

- 新規 store `loopvault-guided-course-advanced`（`loop-vault:guided-course-advanced-v1:data` / `AppData/loopvault/guided-course-advanced-v1.json`）。Lv1〜3 の store キー・パスは読み書きしない。
- 試行は「試行した attempt の itemIds」を保存するため、Lv5 の中間カード、Lv6 のキー再確認、Lv8 の群、総合確認の①②③を、その時の集合のまま再開・評価できる。
- `attempts` は履歴として残し、合格判定は「完了した公式 attempt のうち最新」を使う。練習 attempt（`practice: true`）はすべての正式集計から除外する。
- 別日は既存の「翌日かつ12時間以上」をそのまま再利用する。
- 自己確認（MIDI 未接続）と MIDI 確認を区別し、自己確認だけでは正式合格にしない。ヒントありは独立正答に数えない。
- 壊れた保存データは隔離する。教材版（bankVersion）が違うデータは破損扱いにせず、証拠として残す。

## 3. 旧 Lv1〜3 との互換

- `src/domain/chordDojo/guidedCourse/` の型・store・ID・合格条件・判定は変更していない。`GuidedCourseView` は表示の入口だけを拡張した。
- 旧 store が Lv1〜3 を完了していれば Lv4 から公式表示する。完了していない場合は Lv4 以降を「自由練習」として開き、正式確認は Lv1〜3 完了後に始まることを画面に明記する。
- 公式 attempt が残っていれば、そのレベルと同じ回答位置から再開する（レベル選択より再開位置を優先）。
- 旧 store が読めない場合も、高度コースはそれを破損扱いせず、Lv1〜3 側の既存の隔離画面に任せる。
- 通常 Dojo の履歴・Vault・耳・Bass の記録には一切書かない。

## 4. 画面

- ヘッダーのレベル選択（Lv1〜8・総合確認、能力名つき）。公式の次レベルには「（公式）」を付ける。
- 各レベルの最初に「見本を見て弾く」（Lv4 は同じコードの近い配置と広げた配置、次に最低音違いの対）。確認は明示操作で開始。
- 進行はカードを順に採取し、途中カードの答えは伏せたまま、終了後にどこが違ったかと見本を示す。
- Lv6 は進行の型とキーだけを提示し、移調先のコード名は回答後に表示する。
- 公式確認の途中で「自由練習へ」、自由練習から「確認に戻る」。どちらもヘッダーにあり、公式の回答位置は保持したまま往復できる。結果・開始画面の同種ボタンも同じ導線。
- 修了画面は、Lv4〜8・総合確認で確認した能力の一覧と自由練習の入口を示す。
- Lv8 は3群の進捗を常時表示し、群ごとに途中再開できる。
- 総合確認③は8小節の譜面、BPM（70/80/90）、4拍カウント、拍ごとの採点を表示する。

## 5. 実行した確認

- 追加ドメインテスト: `src/domain/chordDojo/guidedCourse/advanced/` の 6 ファイル 56 件 PASS。
- 画面テスト: `src/views/chord-dojo/AdvancedCourseView.test.tsx` 15 件、既存 `GuidedCourseView.test.tsx` 10 件 PASS。
- E2E: `e2e/p23-45-advanced-course.spec.ts` 5 件 PASS、更新した `e2e/p23-42-guided-course-ui.spec.ts` 5 件 PASS。画面は `docs/reports/p23-45-assets/`。
- 統合候補 `ac2fe55a` の fresh FULL（cache なし）: **PASS ではない。Playwright full のみ 8 件失敗**。
  - PASS: Source contracts / AI handoff / Phase docs / Class lint / Runner contracts 40/40 / Privacy scan / E2E TypeScript / Production build / Repository ESLint / App TypeScript / **Vitest 7016/7018（既存 skip 2）** / Gallery excluded。
  - Playwright 失敗 8 件（すべて音声・MIDI モニターのタイミング依存）:
    1. `p12-2-master.spec.ts` ポーズ中の4発音（期待5・実測6）
    2. `p12-chord-dojo.spec.ts` 型の一覧から戻る
    3. 同 登録した音から戻る
    4. 同 自分の進行から戻る
    5. 同 定番の進行から戻る
    6. 同 MIDI 音源を一覧で止める
    7. `p12-master251-monitor-progression.spec.ts` モニターの即時発音
    8. 同 リコール後の発音
  - 変更前の基点 `3e00a4fb`（P23-45 の変更なし）でも同じ Playwright 8 件が失敗した。P23-45 の変更に起因しない既存の環境依存で、単独再実行でも再現する。
- 参考: P23-45 の E2E と更新した P23-42 の E2E は、上記 FAIL とは別に単独で PASS している。

## 6. 未確認・制約

- 実機 MIDI での通し確認はこのセッションでは行っていない。MIDI 採取・判定は既存の `CourseCapture` とドメインテスト、画面は自己確認経路で確認した。
- 総合確認③のテンポは画面の拍表示で示す（クリック音は出さない）。
- Lv5 の「見ずに弾く」2問と、Lv6・Lv7・Lv8 の耳問題では、見本の追加再生をヒントとして扱う。Lv7・Lv8 耳・総合確認②の標準2回はヒントにしない。
- Lv4 の見本は「近い配置」と「広げた配置」の聴き比べで、共通音の残し方は配置の対で示す。運指の指定はしない。
- 実装していないレベルはない。レベル選択の全項目に教材がある。
- Playwright の上記8件は、音声を伴うため静かな環境で再確認する必要がある。その他のゲートは PASS。

## 7. 試用 EXE

- `<作業フォルダ>\Loop Vault-p23\src-tauri\target-p23-45\release\loop-vault.exe`
- SHA-256 `2C2B65BA78AF9D0429D46D41A8F08C61517A407B3A5EE72876E78DA1C3F8360A`（26,792,960 bytes）
- インストーラーは作成していない。標準の `src-tauri/target` は試用中プロセスにロックされうるため、専用の `target-p23-45` でビルドした。

## 8. 主な変更ファイル

- `src/domain/chordDojo/guidedCourse/advanced/{levels,build,bank,lv4,lv5,lv6,lv7,lv8,capstone,judge,review,store,types}.ts`
- `src/views/chord-dojo/{AdvancedCourseView.tsx,GuidedCourseView.tsx,GuidedLevelSelect.tsx,CourseKeyboard.tsx,advancedCourse.css}`
- テスト: `advanced/*.test.ts`、`src/views/chord-dojo/AdvancedCourseView.test.tsx`、`e2e/p23-45-advanced-course.spec.ts`
- 既存更新: `e2e/p23-42-guided-course-ui.spec.ts`（Lv1〜3 完了後の Lv4 引き継ぎに合わせて期待を更新）
- 報告: 本ファイル、`docs/reports/p23-45-assets/`

## 9. 受け入れ状況（Human Acceptance 候補）

- 実装・教材・判定・保存・画面・旧 store 互換・EXE は揃った。未実装のレベルはない。
- レベル別の focused テストと Vitest 全体（7016/7018、既存 skip 2）は PASS。
- fresh FULL は Playwright の既存8件（音声・MIDI モニターのタイミング依存）だけが FAIL。同じ8件を変更前の基点でも再現しており、P23-45 の変更に起因しない。
- Human Acceptance の前に、静かな環境で Playwright の上記8件を再確認するか、既存失敗として切り分けて扱うかの判断が必要。
