# TXT-JAZZ Stage 00 — 作業前の既存入力・解析結果baseline

対象コード: `21d4828d0d62b35da574a2a32e3c2bfa39eea3a9`。製品実装は変更していない。

## 実行結果と完全性

正式なsnapshot採取は実exit **0**、既存 **507ファイル・4285/4285 unit tests PASS**、FAIL 0 / pending 0 / todo 0。実行時間112.1秒。これはunit全体であり、Test DXのFULL、Playwright/E2E、Tauri/nativeは実行していない。

`git ls-files` の `.(test|spec).(ts|tsx|js|jsx|mjs|cjs)`（`e2e/`を除く）で得た全追跡unitファイル507件と、実行JSON reporterのファイル507件を照合し、missing 0 / extra 0。既存テストを編集したり、skipしたり、対象を緩めたりしていない。実行されないbranch・E2Eだけの入力・人間が将来打つ入力まで網羅するという意味ではない。生成ループ・既存合成fixture・fuzz/stress入力は実呼出しで捕捉した。

通常のVitest excludeは `e2e/**,node_modules/**,dist/**,.local-evaluation/**,.codex-staging/**`。一時capture configは自分の `p12-generated/**` も除外し、製品の既存unit507件だけを実行した。`src`のunitに `.local-evaluation` の参照は0件。ファイル読取を行う関連テストは追跡済み合成fixtureを参照することも確認した。外部/private MIDI・Vault・audio/recordingsを入力にしていない。

## 採取方法

一時Vitest configのVite `enforce:pre` transformで、対象export関数の宣言だけをメモリ内で元関数名に変更し、同名exportのwrapperを追加した。**ディスク上の製品ソースは一切変更していない**。wrapperは元関数を同じ引数で1回呼び、同期的にJSON snapshotを採り、同じ戻り値オブジェクトを返す。例外は同じ例外を再throwする。error stackやOS情報は採取しない。実際の例外は0。

捕捉対象は以下の5つ。通常と拡張の入り口だけでなく、共有core・legacy parserも含めた。

| 関数 | 実呼出し数 | unique input/output組 |
|---|---:|---:|
| parseChordLabel | 97437 | 2495 |
| parseTextChordLabel | 83590 | 8572 |
| parseTextProgression | 432 | 242 |
| parseExtendedTextProgression | 2092 | 1170 |
| parseExtendedTextChordLabel | 33930 | 2058 |
| 合計 | **217481** | **14537** |

fileごとのunique数を合算すると20224。同じ入力でも結果が異なる場合は別recordになる。各recordは関数名・全arguments（optionsを含む）・全output・throw有無を保存し、同じ組だけをdedupする。callerによる後のobject変更を混入させないよう、戻り直後の `JSON.stringify` を即時 `JSON.parse` して独立したsnapshotにした。

通常JSONで失われる `undefined` は `{ "$undefined": true }`、非有限数は `{ "$number": "NaN" }` / `Infinity` / `-Infinity` と明示する。symbol/function/cycle等を受けるparserではなく、今回の引数・結果はこのJSON表現で保存できる。全recordsでsnapshotのSHA-256を再計算し、一致を確認した。

## 保存形式と再現

[parser-regression-before.json](../evidence/parser-regression-before.json) はlosslessなJSON evidence。global recordsのJSONをdeflate/base64で保存し、テストごとの相対パス・結果・件数は平文manifestにする。各recordの `testFiles` はmanifest indexとcall数の組で、どのunitから何回呼ばれたかを復元できる。

- 復元前records JSON: 10,945,826 bytes。
- committable evidence全体: 1,976,675 bytes（約1.89 MiB）。
- evidence SHA-256: `1DAA4AEE1D77028D75DBDF0AB5441166EDA02BF04E58AA80F481C1BA4329F043`。
- 復元JSONのSHA-256と対象source SHA-256はevidence内に記録。
- 507 fragmentsを全件decodeし、record/fragment hash整合と、個人path・private入力pathを含まないことを検査した。

Nodeの標準機能だけで読み出せる。これは説明用の式であり、製品へのコード追加ではない。

```js
const records = JSON.parse(
  inflateSync(Buffer.from(evidence.capture.data, "base64")).toString("utf8")
);
```

Stage 01が承認された場合、sentinelを元の値に戻して `fn(...args)` を再実行し、戻り値も同じsentinel表現にして `output` と完全一致を比較する。意味が近いという比較だけに置き換えない。仕様が認める「作業前に読めなかった」または別途明示する「誤って読めた」入力だけを許可差分一覧にする。可読なTXT-JAZZ新規入力の構造と分類は別の [parser-current-tokens.json](../evidence/parser-current-tokens.json) にある。

## 実行コマンドと失敗履歴

正式実行:

```text
npm exec vitest -- run --config p12-generated/txt-jazz-stage00/parser/capture.config.ts --reporter=json --outputFile=p12-generated/txt-jazz-stage00/parser/full-unit-results-snapshot.json
```

scoped escalationでWindowsのrealpath制限を避け、独立したworktree内のdependenciesを使った。実ログはignored `p12-generated/txt-jazz-stage00/parser/full-unit-capture-snapshot.log`、JSON reporterも同directoryに保持。

最初の2回は一時設定の階層/URL解決ミスでtest実行前に失敗（exit1）。次の参照保持版は4285/4285 PASSしたが、返却objectを後からcallerが変更する可能性がありbaselineには採用しなかった。正式snapshot版のみがこのevidenceの出所である。これらを製品失敗や最終PASSに混ぜていない。

## 変更・一時物

製品 `src/`、既存 `e2e/`、`scripts/`、package/lockに開始点からのdiffなし。probe/captureの一時実行ファイルは、自分で作成した6ファイルだけを非reparse・対象scratch配下と確認し、`Remove-Item -LiteralPath`で削除済み。対象はcapture.config.ts / capture.setup.ts / probe.config.ts / probe.test.ts / write-report.mjs / aggregate.mjs。削除6、同名残存0を実検査した。生成logs/reporter/fragmentsはignored領域に残して検証できるようにし、他worktree・旧EXE・branch・user変更は触っていない。
