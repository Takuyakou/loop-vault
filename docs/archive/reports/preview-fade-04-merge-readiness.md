# Preview Fade Stage 04 — Merge Readiness / Local Master Integration

日付：2026-10-20（Asia/Tokyo）。新しい最適化・パラメータ変更は実装していない。

**STAGE 04 = COMPLETE — MERGED TO LOCAL MASTER / FRESH FULL PASS**

## 1. 開始状態と保護

- candidate：`feat/preview-fade` / `428e86b4c87bda460ea298c8dfb63ae24f3f951c`。
- Stage 03 freeze：`a96bf9ff3bcf5db38de716def33532071fb27fd9`。その後のtracked差分はStage 03報告書1ファイルだけ。`src` / `e2e` / `scripts` / packageとlockfileはfreezeと一致。
- 元worktreeは`src/testing/previewFadeLab.ts`の未コミット計測拡張と未追跡`e2e/tmp-s2.spec.ts`、調査資料・assets・既存出力を保持。開始時にhash記録し、マージ後も58ファイルで変更0を確認。reset / clean / stash / 強制checkoutは使用していない。
- 統合は既存のクリーンなmaster worktreeを使用。worktree新設・node_modules共有・依存installはしていない。既存node_modulesは通常のdirectoryで、candidateと主要依存versionも一致。
- 開始master：`e8cfee036af3940a6426a2fef0c71b7ead012e92`。保存済み`origin/master`との比較はlocal側225 / remote側0コミット。fetch / rebase / pushはしておらず、リモートの最新状態を確認したという意味ではない。

## 2. P16依存の判定とmerge

履歴は`master → 37ae7906 → 0ecb1eed → Preview Fade`。masterはP16の途中までしか含まず、Preview branchの祖先に鍵盤・調号の修正とその報告が残っていた。Previewの音源factoryがP16の新しい関数を呼ぶという直接依存ではなく、採用branchの未統合祖先である。

P16差分をPreviewと分けて監査し、既存P16の鍵盤縦横比・高さ計算・調号表示・それに対応するtests / public fixture screenshots / reportに限定されることを確認。無関係な研究コードはない。この前提修正を先に統合し、Previewを別のmergeに分離した。

| 項目 | commit |
| --- | --- |
| P16 prerequisite tip | `0ecb1eed` |
| P16 prerequisite merge | `a02a20edea8fbad91bf026ab3afc645a3329aef2` |
| Preview candidate tip | `428e86b4c87bda460ea298c8dfb63ae24f3f951c` |
| Preview Fade merge / 最終製品HEAD | `cdb5e10d7525daf310af37f59a06b6e2b788cf01` |

P16 merge直後はP16 tipとtree一致。Preview merge直後もcandidateとtree完全一致：`c208fde4a996abb89728dc074dccccea0278faa9`。競合なし。無関係なworking-tree変更はmergeしていない。

## 3. Stage 01〜03のscope確認

- Stage 01：`chordPreview.ts`の楽器末尾Gain、15ms fade / 40ms wall-clock dispose / fade最大2。`outputFade.ts`へ既存Voicing Loopの5ms / 12ms / 24ms定数とramp関数を移し、値は不変。FreePatsに任意の出力先を渡すseam、E2E限定計測入口、回帰testsを含む。
- Stage 02：設計調査。未コミット計測拡張・tmp spec・研究資料は元worktreeで保護し、masterへ混入させていない。
- Stage 03：Pianoの8 decoded AudioBufferをlazy single-flightで共有し、各再生でfresh Sampler。既存sample / velocity / 音価 / release / 音量を維持。cacheは1セット・50MiB以内（48kHzの実データ47.24MiB）。高sampleRate等で上限を超える場合は非cacheで互換再生。
- appの先読み1.5秒、Tone.lookAhead、15ms / 40ms / fade最大2は不変。Electric Pianoの音源構成・協調生成を変更していない。
- Stage 03で正式解除されたdeny 1項目は独立commit `870da126`のまま取り込み。他のdenyを変更せず、Stage 04で禁止対象を手動編集したり迂回したりしていない。
- MIDI解析Core / Vault schema / textTransport / playbackControllerに今回の製品変更なし。

## 4. Stage 03証拠との対応

Stage 03のFULL原本はfreeze製品HEAD上でVitest4,860 / Playwright675 PASS（既存の計測用2件skip）。内部実音Warm p95 101.875ms、比較前176.542ms。Coldは旧新p95 187.208ms。公開合成4fixtureの最大sample差1.19e-7、1,000回Piano soak後の追加native nodeは10秒settle＋GC後0。

ただし当時のFULLには元worktreeの未コミット計測拡張・tmp specも存在した。したがって過去結果を今回のmaster結果として流用せず、クリーンなmerge製品HEADでfresh FULLを実行する。性能・波形・native-memoryの過去数値は**同一製品blobに対するStage 03の証拠**として参照し、Stage 04で再測定したとは扱わない。

## 5. fresh focused検証

candidate HEAD `428e86b4`で実行：

| 検証 | 結果 |
| --- | --- |
| Unit / Integration 8 files | **120/120 PASS** |
| Preview audio + diagnostic probe + P16 keyboard E2E | **10/10 PASS、0 skip** |

UnitはchordPreview / outputFade / textTransport / playbackController / ProgressionVoicingTransport / FreePats / keyboard高さ・表示を含む。cache failure/retry・single-flight・context交換・timeout・中断世代・予約音・fade枠・timer解放・音価を確認。

`PREVIEW_PROBE=1`で既存の計測用2件も有効にした。Piano / Electric Pianoの未来予約音は、releaseAllでは残り、dispose時にpeak 0を確認。新しいskip、retry、snapshot更新、assertion / 音響threshold緩和はしていない。

| 音色 | stop時のstep中央値 | 音自身のstep | 比較元の急停止step |
| --- | ---: | ---: | ---: |
| Piano | .0111 | .0191 | .0716 |
| Electric Piano | .0039 | .0049 | .0065 |

両音色とも既存基準PASS。これはブラウザ内部のAudioWorklet観測であり、実スピーカーの音質保証ではない。EP生成時間134〜147msはdiagnosticとして記録し、高速化したと扱わない。native StereoPannerの既知残存も未解決のまま。

## 6. merge HEAD上のfresh FULL

対象：`cdb5e10d7525daf310af37f59a06b6e2b788cf01`。

`PREVIEW_PROBE=1 npm run test:full -- --fresh`。既存の計測用probeも有効化し、PASS cacheは使用しない。

| Gate | 結果 |
| --- | --- |
| Repository ESLint / class / source-contract lint | PASS |
| App / E2E TypeScript | PASS |
| phase-doc / AI-handoff validation | PASS |
| privacy/security scan | PASS |
| production web build / gallery exclusion | PASS |
| runner contracts | 27/27 PASS |
| Full Vitest | 4,860/4,860 PASS（89.5秒） |
| repository-wide Playwright | **676/676 PASS、0 FAIL / 0 SKIP**（1,098.6秒） |
| git diff --check / FULL verdict | **PASS** |

総wall time **1,252.0秒**、raw logs **49,191 bytes**。ログ識別子`2026-10-19T16-07-14-476Z-full.log`。675件だったStage 03との件数差は、未追跡のtmp specを含めず（-1）、当時skipされていた既存probe 2件も実行した（+2）ため。実際のdiscoveryも676件で、全件実行・全件PASS。PASS cache使用なし。

FULL内の実音結果はPiano stop step中央値.0111（音自身.0191）、EP .0028（音自身.0048）。瞬間最大値はそれぞれ.0324 / .0286で、中央値より大きい外れ値も記録された。既存の中央値・stop後の無音化基準を変更せずPASSしたという結果であり、最大値ゼロや実機での絶対的ノイズ不在を主張しない。未来予約音のdispose後peakは両音色0。実機確認は下記の別タスクとして残す。

別途、production build生成直後の3 JavaScript bundlesを読み取り検査。merge build ID `cdb5e10d`あり、fixture build ID `visual-test`なし。`__previewFadeLab` / `preview-fade-recorder` / `installPreviewFadeLab` / `previewfade`はすべて0 bundles。E2E buildでdistが置き換わる前に記録し、計測入口の本番除外を確認した。

## 7. 分離した後続タスク

1. **Electric Piano startup optimization**：現行音源構成・lookAhead・先読みを維持した別設計/実測Stage。今回のmergeでは実装しない。
2. **Tone.CrossFade native StereoPanner残存**：Stage 02で観測された3個/factoryの既存保持経路。今回解決したとは扱わない。所有nodeのlifecycle / native graph / 長時間soakを専用の受入れ条件にする。
3. **実機確認**：Windows/Tauri、実MIDI入力、実OS出力・スピーカーでの遅延・連打・停止クリック。内部AudioWorkletの値と分けて確認する。
4. **既存制限の継続**：50MiBを超えるdecoded setは非cache。永久にsettleしないdecodeは後続をtimeoutで終了し、重複decodeを起こさないが自動復旧は保証しない。

## 8. 最終状態

- local masterへP16前提修正・Preview Fadeをそれぞれmerge済み。merge製品HEAD `cdb5e10d7525daf310af37f59a06b6e2b788cf01`上でfresh FULL PASS。
- freeze / candidateはどちらもmasterの祖先。candidateとの製品・テスト差分0。報告書の後続commitはこのファイルだけのdocumentation-onlyで、製品を追加変更しない。最終commit SHAは最終応答に併記する。
- 報告書以外のmaster working-tree差分なし。報告書commit後にもcleanを確認する。
- 元のcandidate worktreeは`feat/preview-fade` / `428e86b4`を維持。既存dirty / untracked成果物を保持し、開始時hash記録58件は最終確認でも変更0。
- Stage 03の原計測JSON・再現ZIP・元tmp spec保管物に変更なし。新しいworktree・最適化・依存追加なし。
- 後続タスクはsection 7へ分離。push / tag / release / EXE生成・配布なし。このStageで停止する。
