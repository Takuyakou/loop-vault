# Jazz-05 / 追加: 譜面の大きさをカードで変えない

ブランチ `feat/jazz-05-01`(コード `69a0c9ce`)。`playbackController.ts`・`chordPreview.ts`・Rust・記録の形は変えていません。

## 1. 直し方
- 原因:`GrandStaff` は、いま出すカードの音・加線・指の印の上下の範囲(`minY`/`maxY`)から表示の範囲を決めていたため、低い音や加線のある和音と五線に収まる和音で、譜面の大きさ・位置が変わった
- 直し:`GrandStaff` に省略可能な `fixedExtent`(上下の範囲)を足した。**渡さない画面は今のまま**(範囲の式は `extentOf` に出しただけで同じ)。渡すと、その範囲に表示を固定する(カードの音が範囲に収まらないときだけ広げるので、切れない)
- 範囲の求め方:`grandStaffExtent(snapshots)`(`GrandStaff.tsx`)/`heldStaffExtent`(`HeldCardParts.tsx`。Jazz・Original の描き方と同じ設定)
  - **Jazz**:その項目の**全版 × 12キー × 全カード**の音と指の印(`JazzPracticeView`)
  - **Original**:**12キー × 全カード**(`OriginalPracticeView`)
- 固定の範囲を渡すと、svg は入れ物の高さに合わせて縮む(Original の入れ物は 188px 固定で、範囲が 200 になるため。Jazz は CSS で高さが決まっている)

## 2. テスト
| 確かめ | 結果 |
|---|---|
| 単体(`grandStaffExtent.test.ts`):全項目で、全カードの範囲が各カードの範囲を含む/1枚だけの範囲は今までの描き方 | 通過 |
| e2e Jazz(001・009、1280×720 と 1660×1035):**全版 × 12キー × 全カード**で、svg の viewBox・大きさ・五線の線の y 座標が同じで、音・指の印・加線・臨時記号が表示の外に出ない | 通過 |
| e2e Original(12キー × 全カード、1280×720):同じ確認 | 通過 |
| 6サイズの収まり(1280×720 ほか)・ほかの譜面(見て弾く・耳で弾く・テーマ・指・Dojo)・visual | 通過(関係する e2e 95件) |
| 型・e2e の型・ESLint・Vitest(36ファイル) | 通過 |
| `npm run test:full` | **PASS**(Vitest 6207/6209、Playwright 728/730・既存/条件付きスキップ2件) |

`test:full` は2回流しました。1回目は `e2e/visual.spec.ts` の Capture の画像1件(`capture-analysis-results.png`、約 1% の差)が落ちました。この画面は Jazz・Original と関係がなく、`visual.spec.ts` を単独で 3回(18件)流すと通ります(全体を並列で走らせたときの描画のずれ)。2回目は全部通りました。

## 3. 見え方
- 譜面は、項目の一番広い和音に合わせた大きさで、カードを進めても・キーを変えても・版を切り替えても動かない。低い音や高い音の和音がない項目は、その分大きく描かれる(001 の C など)
- 写真:`p89-generated/jazz-05-03/fixed-*.png`(Git 管理外)
