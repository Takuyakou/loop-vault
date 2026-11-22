# P20 とボイシングドリル判定の統合

- master: `e4e1dbeb` (P20 をマージ)
- `fix/voicing-drill-judge`: `d6c8a851` (master をマージして競合を解消)
- master への追加マージ・push はしていない。

## 競合

`src/views/chord-dojo/VoicingDrillPracticeView.tsx` の 2 か所だけ。

- 押鍵の記録: P20 までの `heldRef` ではなく、この直しの **liveMidi を reduce した rawNotes** を残した。
- 最初の入力: P20 の `rememberRecent` を残し、`handleNote` の中で最初の ready/running の入力のときに記録する。
- 初期キー/段階/ランダム、P20 の再開プロパティ、デバッグ/理由表示、接続時の作り直しはすべて残した。

## 確認

- 単体: 4 ファイル 28 件 PASS(`voicingDrillJudge`, `voicingDrillSession`, `dojoRecent`, `dojoHomeProgress`)。
- e2e: `p19-voicing-drill` と `p20-resume-kinds` の 26 件 PASS。
- `npm run test:full`: **PASS** — `d6c8a851`、908.9 秒
  - Vitest 6345/6347(既存 skip 2)
  - Playwright 825/827(既存/条件付き skip 2)
  - heavy 59/59
