# P23-54 報告: 音楽の直し（短調カデンツ・Lv4 分数コード＆つなぎ・初見 8 小節・近接ボイシング見本・Lv2 聴き比べ・低い窓対応）

## 1. 実装内容

- `P23-54.patch` の 18 ファイルを適用（うち `GuidedCourseView.tsx` のみ P23-52 地図・結果画面との統合のため手動マージ）。
  - **短調カデンツ**: 短調進行 (`iiø–V–i`) で `i → V7 → i`（「キー Am のカデンツ」等）を提示。
  - **Lv4 刷新**: 判定不能だった配置 B を外し、分数コード 12 問 + つなぎ 8 問（別日: 分数 6 問 + つなぎ 4 問）へ置換。ID は P23-45 順を維持して既存合格記録を保持。見本 4 枚を「Cm 2 配置 → C/E → C → C/E → F」へ更新。
  - **総合確認 初見 8 小節**: 3 曲（C/70・G/80・F/90）＋練習用 2 曲（D・B♭）を手書き進行へ更新。
  - **見本ボイシング**: `voiceLed()` により進行 2 枚目以降を前和音の近くへ配置（判定ルールは不変）。
  - **Lv2 聴き比べ**: `GuidedCourseView.tsx` に `DEMOS`（Lv1 / Lv2）を導入し、Lv2 開始前に `Cmaj7 → C7 → Cm7 → Cm7♭5`（1 音ずつ半音下がる）比較見本を表示。
  - **コース地図の Lv2「見本を見る」対応**: `GuidedCourseMap.tsx` の `hasDemo` を Lv1 に加え **Lv2 でも true** に更新（指示書 §4 記載のワーカー作業）。
  - **分数コードの誤りマーク & ヘッダー題**: `guidedMarks.ts` / `AdvancedCourseView.tsx` で最低音誤り時に最低音を ✕・見本最低音を点線輪で表示、上の帯の題をレベル名へ統一。
  - **低い窓（高さ 700px 以下）**: `guidedStage.css` で高度問題が鍵盤に重ならないレイアウト規則を追加。

## 2. テスト修正箇所（指示書 §4 に基づく記録）

| ファイル | 行 | 変更内容 |
|---|---|---|
| `e2e/p23-52-course-map.spec.ts` | L146-148 | M2 で Lv2 開始時に P23-54 の Lv2 聴き比べ見本が先に出るようになったため、`course-demo` 確認後に `course-demo-skip` を 1 行追加（指示書 §4-1）。 |
| `e2e/p23-54-musical-material.spec.ts` | L106 | 画面のコード表示は音楽記号の `♯` (`D/F♯`) のため、ドラフト spec の `"D/F#"` を `"D/F♯"` に修正。 |
| `e2e/p23-54-musical-material.spec.ts` | L126 | 1 枚目入力後は次のカード案内 `"2枚目を弾いてください"` へ進むため、ドラフト spec の `"1枚目"` を `"2枚目"` に修正。 |
| `e2e/p23-54-musical-material.spec.ts` | L78, L132 | 768×640 リサイズ後のサイドバー折畳み完了待ち (`waitForTimeout(350)`) と `captureReportShot` を適用。 |

## 3. 写真照合 (`docs/reports/p23-54-assets/`)

- 8 枚 (`lv2-demo-{1440,1280,768}`, `lv4-demo-connection-1440`, `lv4-slash-1440`, `lv4-connection-1440`, `lv4-connection-done-{1440,768}`) を撮影・目視確認。
- Lv2 の 4 枚比較（黄色マーク・半音下がる説明）、Lv4 見本 4 枚目「C → C/E → F」、1 問目 `C/E`（説明行なし・題「配置を選ぶ」）、6 問目つなぎ、および 768×640 の低い窓レイアウト（重なりなし・横はみ出しなし）すべて期待どおり。

## 4. 検証結果

### 段階テスト（コミット前）
- `npx tsc --noEmit` / `npx tsc -p tsconfig.e2e.json --noEmit` / `npm run lint`: **PASS**
- Vitest (`src/views/chord-dojo src/domain/chordDojo/guidedCourse`): **37 files / 439 passed (0 failed)**（`materials.test.ts` 5/5・`lv4.test.ts` 8/8・`guidedMarks.test.ts` 6/6 含む）
- Playwright 指定 8 spec (`p23-54`, `p23-45`, `p23-46`, `p23-47-fix-3`, `p23-49`, `p23-50`, `p23-51`, `p23-52`): **43 / 43 PASS (0 failed)**

### FULL (`npm run test:full`, 対象コミット `25cb1993`)
- 静的点検 10/10 (**PASS**, 18.6s): Source contracts, AI handoff, Class lint, Phase docs, Runner contracts (43/43), Privacy scan, E2E TypeScript, Production build, Repository ESLint, App TypeScript
- Vitest full: **7,072 passed / 2 skipped (0 failed, 80.8s)**
- Playwright full (core, 53 specs): **367 / 367 PASS (0 failed, 199.1s, goto 開き直り 0 回)**
- Tracked PNG check: **PASS**
- 合計: **298.9s (4.98 分) — FULL: PASS**
