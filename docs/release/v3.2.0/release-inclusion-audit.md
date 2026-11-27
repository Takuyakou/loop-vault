# v3.2.0 公開内容の確認

対象はローカル `master` `4707d1c8` から作成したリリース。公開側の比較元は v3.1.0 `3b2e309e`。

## 公開側にだけ残っているファイル(B2)

`git diff --diff-filter=D --name-status 3b2e309e release/v3.2.0` の 26 件。すべて意図して消した物で、黙って消える物はありません。

| 公開側にだけ残っているファイル | 扱い |
|---|---|
| `scripts/generate-degraded-midi.test.ts` | T3(リードの `review\P25-test-prune.md`)で消した診断用テスト。 |
| `scripts/p535/promotionGates.test.ts`・`shadowRanking.test.ts`・`temporalEvidence.test.ts` | 同上(影の研究のテスト)。今の約束は `p537 productionIntegration` の 8 件が守る。 |
| `scripts/p536/attackProvenance.test.ts`・`meterIdentityAB.test.ts`・`subwindow.test.ts` | 同上。 |
| `scripts/p537/e2eProjection.test.ts`・`unionChimera.test.ts` | 同上。`productionIntegration.test.ts` は残した。 |
| `scripts/p538/presentationGroupingShadow.ts`・`presentationGroupingShadowV2.ts` | T3 で重複テストを消した時に、そのテストだけが使っていた影のモジュールも消した。 |
| `scripts/p539/shadowCandidateRanking.test.ts`・`shadowRootRelativeIdentity.test.ts` | T3 で消した影のテスト。 |
| `scripts/p540/shadowCandidateGenerationCorrection.test.ts` | 同上。 |
| `src-tauri/src/llm/commands.rs`・`local_provider.rs`・`openai_provider.rs`・`provider.rs`・`retry.rs`・`types.rs`・`local_advisor_compatibility_schema.json` | M4(P25-13)で、画面から外した AI のアドバイザーの使われていない仕組みを消した。設定の画面で、前に保存した API キーを確かめて消すことは今までどおり。 |
| `src/llm/advisorMetrics.ts`・`advisorMetrics.test.ts`・`advisorService.ts`・`advisorService.test.ts` | 同上(フロント側)。 |
| `src/voicingPractice/GeneratedTypeSelector.tsx` | P25-08 L1 で「基本 ▼」と「詳しい設定」を「形 ▼」1 つにしたため。形は `ShapeMenu.tsx` が持つ。 |

## 個人情報・実機・画像の確認(B6)

| 確認対象 | 結果 |
|---|---|
| 追跡ファイルの開発機パス(開発ドライブの作業フォルダ・Windows のユーザー欄のパス・作業フォルダ名) | 新しく入った物はありません。`AGENTS.md` にあるのは書き方の例、`practiceRepository.test.ts` にあるのは検査用の架空のパスです。公開済みの `docs/archive/`・`docs/release/v2.1.0`・`v3.0.0` の記録は書き換えていません。 |
| 新しい画像 | `docs/images/v3-demo.gif`(24.4 秒・960×600・15fps・音なし)は合成データだけで撮り直した物で、実機名・個人の進行名・パスは写っていません。README の既存の画像(v3-home ほか)は撮り直していません。 |
| P25 で増えた文書・データ | `docs/README.md`・`docs/current/voicing-rules.md`・`docs/designs/v3.2.0-*.md`・`docs/release/v3.2.0/`・`docs/contracts/voicing-shapes-p26/golden.json` を確認。個人のパス・実機の名前・メール・個人の Vault の名前はありません。設計書が参照する `handoff\mocks\p25\...` は、リードが書いた見本の相対の置き場所で、開発機の絶対パスではありません。 |
| 機器名・メール・ほかのサイトの名前 | 新しく入った物はありません。`Roland Digital Piano` などは今までの合成のテストの名前、メールアドレスは公開済みのリリース記録の中だけです。 |
| MIDI・音声・動画 | 追跡している音源は今までと同じ Salamander Piano 8 個と FreePats Bass 25 個。新しい録音・MIDI は入っていません。 |
| 公開できない言葉 | `node scripts/docs-layout/validate.mjs --release` で、追跡しているテキスト 4,158 ファイルを調べて **0 件**(B6 の下見。B8 で公開用コミットのメッセージ・リリースの本文・About 欄の文も渡して、もう一度確かめる)。 |

個人の AppData は確認対象にしていません。`docs/reports/` には何も足していません。
