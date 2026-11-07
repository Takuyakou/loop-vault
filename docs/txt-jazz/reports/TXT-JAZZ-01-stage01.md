# TXT-JAZZ-01 — Stage 01 実装・検証報告

状態: 実装完了・fresh FULL PASS（`a04a8c8b`）。merge / push / tag / release は行わない。実機の EXE（MIDI・音）と別担当による独立レビューは未実施。

## 開始点と保護

- Stage 00 `6998a4317e7934a8f3e76784c66d95479e371bae` から専用branch `feat/txt-jazz-stage01` を作成。製品ソースはlocal master `21d4828d0d62b35da574a2a32e3c2bfa39eea3a9` と一致する。
- 元Stage 00の仕様・報告・lossless parser baselineは変更しない。承認後の方針は [Stage 01 承認記録](../stage01-approval.md) に分離した。
- 独立 `npm ci --offline --no-audit --no-fund`、328 packages、exit0。依存定義・lockfile変更なし、node_modulesのworktree共有なし。

## 保存互換性

型は `ChordSymbol.altered?: true`。dom7・空tensions・omission無しに限定し、slash bassは許す。分類と明示テンションを混同しない。旧field無しデータは意味を維持して読める。

Vaultは `loopvault/txt-jazz-v3/` の独立namespaceへcopy-firstで移行する。旧 `loopvault/data.json` とそのbackupsを新EXEは変更しない。旧原本のbytesは `legacy-import.json` として永久保存し、通常の回転backup対象にしない。新Vaultのinternal型はv2のまま、alteredを含むdisk/exportはfileVersion3、含まないものはv2。新readerはv1/v2/v3をinternal v2へ正規化する。

旧EXEの通常編集・旧backup復元は旧namespaceだけに作用し、新記録は触れない。v3の新exportは旧readerのfuture-version検査で全体拒否され、個々のideaのquarantineには進まない。新旧EXEの移行後の変更は同期しない。

Dojoもbrowser `loop-vault:chord-dojo-txt-jazz-v1:` / native `loopvault/theme-lessons-txt-jazz-v4/` へ隔離する。直前のranges-v4、以前のtheme、legacyの順に一度だけread-only importする。旧原本・backup・corrupt・tmp・rollback markerは変更しない。Dojo envelopeはv4を維持する。新データの未来versionは保存物に触る前に拒否する。不正な新commitは、同じ新namespaceの検証済backupがある場合だけ既存の復旧手順で回復し、不正bytesをquarantineに保持する。旧namespaceのbackupやemptyへの自動fallbackは禁止する。

## 明示的な復旧

Vaultで破損JSONを隔離した後、同じrepository/storeで再度initializeしてもempty Vaultを作らない。移行途中のcopy/tmp/backupがあれば復旧画面で停止する。移行前copyがある場合は既存startupのbackup選択に `legacy-import.json` が現れ、人間が既存の確認dialogで明示復元できる。新namespaceの正常backupも同じ導線で復元できる。Settingsからの明示replace importもAPIとして可能で、既存のcommitがあれば先に `recovery-before-N.json` へbytesを永久保存する。保護copyが失敗したら置換/復元を書き込まない。

旧原本そのものが不正・未来版でcopyが作られていない場合は、新EXEが修復や部分移行を強行しない。旧EXEで旧namespaceの正常backupを復元してから新EXEを再起動するか、対応する版で正常なVaultを書き出して明示読込する。実Vaultや私的入力は本作業で読んでいない。

## 検証の実行履歴（途中）

| 検証 | 結果・範囲 |
| --- | --- |
| 製品変更前Vault旧実reader/repository/store probe | exit0 /41 assertions。same-pathv3だけでは旧restoreによる上書きが可能という反例を含む |
| 製品変更前Dojo旧実reader/repository probe | exit0 /49 assertions。提案browser隔離移行の実現性。新schema/native受入れではない |
| 最初の実製品focused保存回帰 | 4files /95tests中92PASS・3FAIL。未来fixtureの3が新対応versionになった1件と、新合成fixtureの既定field欠落2件。失敗履歴を保持 |
| 修正後Vault実製品focused＋既存保存回帰 | exit0 /4files /99tests PASS、1.60s。同一instanceの再initialize・flush非破壊、明示復旧、保護copy故障時保存拒否を含む |
| Dojo隔離実製品＋収集＋新Vault focused | exit0 /3files /46tests PASS、1.19s。旧隔離・新backup復旧・未来/部分記録拒否・失敗retryを含む |
| 保存境界・aggregate budget・Tauri adapter の最終focused（途中HEAD） | exit0 /8files /122tests PASS、1.75s。旧v1 oversizedのsizeRecovery維持、書込budget不変を追加 |
| native保存テスト | exit0 /22tests PASS、0FAIL/ignored、0.60s。新規隔離3件と既存CAS/rollback/future/backup等を含む。Dドライブ専用target/temp、offline。native全体ではなくDojo storage対象 |
| 統合E2E（通常・拡張の Capture → Vault → 登録音Dojo） | 2件 PASS。`G7alt` の登録音（G2 E♭4 F4 B♭4 B4）、誤オクターブの不合格、正しい音の合格。`G7alt/D` は試聴音を作れず Dojo に出ない（3 / 4 コード） |
| native Dojo 保存テスト（引き継ぎ後に再実行） | `cargo test --offline chord_dojo_storage` 22 tests PASS |
| 最終 typecheck（app・e2e）・lint・phase docs・`git diff --check` | すべて exit0 |
| **fresh FULL（`a04a8c8b`）** | **PASS 1026.7s**。Vitest 4441/4441、Playwright 595/595、型・本番ビルド・phase docs・privacy・runner contracts すべて PASS |
| 別担当による独立レビュー | **未実施**（作業の依頼がなく、別エージェントを起動していない）。引き継ぎ後の担当が差分の要所を読み直した範囲に留まる |

最初のtypecheckは共同作業中の別ファイルで既存targetに無い `Object.hasOwn` 使用1件を報告した。最終typecheckの代わりにはしない。

## 引き継ぎ後に直したこと（`6998a431` + 未commit実装の続き）

最初の全体 Vitest は 4 件失敗していた。原因と直し方：

| 失敗 | 原因 | 直し方 |
| --- | --- | --- |
| 凍結コーパス `phase883Audition`（54行） | 生成後の検査 `validateTextChordNotes` が、**書かれた省略（`omissions`）**を見ず、sus 系の `C11sus2(...)` など第3音を持たない dom7 を「第3音が無い」として落とし、試聴音を空にしていた | 検査が `omissions` の `3` を尊重する（第3音が省略されていれば要求しない）。minMaj7 の ♭3 も同様 |
| `textSemanticCore`（`CmMaj7`） | 承認済みのText限定の正準表示 `Cm(maj7)` への変更 | 期待を `Cm(maj7)` に（承認済み差分として注記） |
| `sourceBassline/compatibility`（未来版の拒否） | fileVersion 3 が対応版になった | 未来版の fixture を 4 に（拒否・bytes不変の期待は維持） |
| `master251/fixedProfileUi`（5 秒超過） | 全体実行時の負荷による時間切れ | 単独実行は PASS。変更なし |

実際の不具合を 1 件見つけた：

- **Chord Dojo の進行練習が、App の再描画で別の計画に置き換わる**（既存の潜在不具合）。`App.tsx` が毎回 `progressionPracticeIdeas(visibleIdeas)` を作り直して `ChordDojoView` に渡しており、`ideas` の同一性が変わる度に Dojo が今日の計画を作り直し、一覧から入った 1 回きりの練習（登録音の練習）を消していた。`useMemo` で安定させた。

その他：

- 統合 E2E は、Dojo のホームのボタン名が「登録した音を覚える」ではなく「登録した音」だったため、最初の失敗の原因になっていた。名前を直した。拡張入力のプレビューカードは Playwright が「安定」と見なさない重なりボタンのため（master でも同じ）、DOM の `click()` で押す。
- E2E のブラウザ試験用 Vault は**メモリ上**で、再読込で消える（通常の保存でも同じ）。再読込・書き出し・読み込みの永続性は、実際のリポジトリ実装に対する `jazzVaultStorage.test.ts` / `txtJazzWorkflow.test.ts` で確かめている（E2E で再読込は確かめられない）。
- 取り込み画面の上限エラーの文言に、**「A部分・B部分などのセクションごとに分けて取り込んでください」**を足した（通常 32 小節・128 トークン、拡張の上限は変更なし。仕様 §9 の文言確認）。

## 仕様 v3 と実態の食い違い（Stage 00・承認条件のとおり）

- 取り込みの上限は仕様の 4096 文字単位 / 12 小節 / 48 トークンではなく、**現在値（通常 8192 文字単位・32 小節・128 トークン、拡張 65536 文字単位・256 小節）を維持**。32 小節の AABA はそのまま取り込める。
- Dojo のホームのボタンは「登録した音」（仕様の「登録した音を覚える」は練習の段階名）。

## 明示的な既存テスト差分

- 未来 fileVersion 拒否の fixture（3 → 4）：`repository.test.ts`、`sourceBassline/compatibility.test.ts`。
- `CmMaj7` の text 表示（`Cm(maj7)`）：`textSemanticCore.test.ts`。
- Dojo のブラウザ保存 namespace が `loop-vault:chord-dojo-txt-jazz-v1:` になったため、E2E の fixture が読み書きする保存キーを更新（`e2e/helpers/p12.ts` と各 P12 系 spec）。
- parser の許可差分 6 件（新 alias 3 + 承認済み正準表示 3）は `evidence/stage01/parser-approved-differences.json`。

## 未完了・限界

- **実機の EXE（Tauri）での確認**（実 MIDI・音・実 Vault の旧→新移行）は未実施。自動テストは合成データのみ。
- **別担当による独立レビュー**は未実施。
- 旧 EXE と新 EXE のその後の変更は同期しない（承認済みの方針）。旧 EXE で新 namespace の Vault は開けない。
- `G7alt/D`（ベースが完全 5 度）は、alt の禁止音（完全 5 度）と衝突するため試聴音を作らず、コード記号だけを保存する（Dojo には出ない）。`G7alt/B` などは作れる。
