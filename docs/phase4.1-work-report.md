# Loop Vault Phase 4.0 Closeout / Phase 4.1 作業報告書
## Section Coverage

- 作成日: 2026-07-25
- 起点commit: `eec7ac3`
- 完了時commit: `cb28bbb`
- 最終既定: `defaultAnalyzerMode = "phase4.1-v1"`

---

## 1. 完了状態

```text
自動検証:              完了
凍結Gate:              全項目PASS
コード検出コーパス:    非回帰（100/100一致）
実MIDI聴感確認:        未実施（deferred）
defaultAnalyzerMode:   phase4-v1 → phase4.1-v1
Phase 4.1:             automated complete
```

主観的な聴感確認は自動化できないため deferred とし、リリースを止めない扱いとした。主観評価を「自動PASS」とは記載しない。

---

## 2. マージしたPR

| PR | Stage | 内容 |
|---|---|---|
| [#168](https://github.com/Takuyakou/loop-vault/pull/168) | P4.0-CLOSE | 既存failure修正・Chapter 3 Seed記述訂正・hygiene guard |
| [#169](https://github.com/Takuyakou/loop-vault/pull/169) | P4.1-00 | 被覆の損失Stage特定・Gate凍結 |
| [#170](https://github.com/Takuyakou/loop-vault/pull/170) | P4.1-01 | Pattern / Occurrenceモデル |
| [#171](https://github.com/Takuyakou/loop-vault/pull/171) | P4.1-02 | Coverage Selector |
| [#172](https://github.com/Takuyakou/loop-vault/pull/172) | P4.1-03 | Section Segmentation |
| [#173](https://github.com/Takuyakou/loop-vault/pull/173) | P4.1-04 | section-aware選定（否定結果） |
| [#174](https://github.com/Takuyakou/loop-vault/pull/174) | P4.1-05 | AI抽出MIDIプロファイル |
| [#175](https://github.com/Takuyakou/loop-vault/pull/175) | P4.1-06 | Occurrence UI |
| [#176](https://github.com/Takuyakou/loop-vault/pull/176) | P4.1-07 | 製品既定を `phase4.1-v1` へ昇格 |

すべて repository 既定の通常マージ。**force-push も履歴書き換えも行っていない。**

---

## 3. P4.0-CLOSE の結果

### 3.1 既存テスト失敗の真因は日付依存だった

Phase 4.0 の報告では「Phase 3.9.3 で表示ラベルが変わったのにテストが追従していない」としていたが、**これは誤りだった**。

`practiceProgressState` は `clearedOnLocalDate === 今日` なら `provisional`、それ以外は `confirmation-due` を返す。fixture が `2026-07-24` を固定していたため、**作成日当日しか通らないテスト**だった。ラベルを差し替えるだけでは翌日また壊れる。

日付を実行時から導出し、両状態を決定的に検証する形へ書き換えた。製品コードは変更していない。skip も削除もしていない。

### 3.2 Chapter 3 Seed の記述訂正

manifest の `generatorVersion` は `chatgpt-annotation-v1`。**「手作業注釈」と書いたのは私の誤り**だった。

| 旧 | 新 |
|---|---|
| 手作業注釈100 MIDI | 外部由来MIDIに対するAI支援アノテーションseed |
| 独立したgold corpus | 教材公式ラベルでも独立専門家によるgold annotationでもない |
| 素直なコードMIDIに対する実力は98%前後 | Chapter 3 Seedとのcanonical一致率は97.73% |

数値は変更していない。解釈だけを正確にした。

### 3.3 聴感確認の自動代替

保存前後で chord / bar / beat / duration / midiNotes / note count / voicing source が完全一致することを検証するテストを追加した。raw notes が解析経路で不変であること、tempo・拍子が変換をまたいで安定することも含む。

### 3.4 Repository hygiene

`test/` の一括 ignore は合成fixtureまで隠すため `test/*` + `!test/fixtures/` へ狭めた。

さらに **staged file を検査する guard** を追加した。Phase 4.0 で `git add -A` により個人MIDIを push した事故は ignore 設定では防げなかった（当時まだ ignore されていなかった）ため、実際に stage された内容を見る層を足した。

拒否対象: `.local-evaluation/` / `test/private-midi/` / `src-tauri/gen/` / `src-tauri/target` / `test/fixtures/` 外の `.mid`。

実際に個人MIDIを stage してコミットを試み、**ブロックされることを確認済み**。

**結果: `npm test -- --run` 全件PASS。**

---

## 4. Phase 4.1 で最も重要だったこと

### 損失Stageを特定した

「サビが候補に出ない」を4段階に分解して測った。

| Stage | 注目範囲33–46の被覆 |
|---|---:|
| 候補生成後（oracle） | **14 / 14小節** |
| dedup後 | **14 / 14小節** |
| **選定後** | **0 / 14小節** |

| Stage | 損失 |
|---|---|
| candidateGenerationLoss | 0小節 |
| dedupLoss | 1窓 / **0小節** |
| **selectionLoss** | **70小節**（98小節中） |

**窓は生成されており dedup でも失われていない。ランキング選定が全て捨てていた。**

選定10件のうち6件が17–32小節の同じ16小節幅に重なる一方、33–48小節には1件もなかった。原因は候補上限ではなく、**選定が被覆を目的関数に持っていない**こと。固定25小節 region quota は100小節の曲で4領域にしかならず機能していなかった。

---

## 5. before / after

| 指標 | before | after |
|---|---:|---:|
| **selectedCoverageAtAllVisible** | 28.57% | **96.94%** |
| selectedCoverageAt10 | 28.57% | **96.94%** |
| **sectionRecallAtAllVisible** | 55.00% | **100.00%** |
| sectionRecallAt10 | 55.00% | **100.00%** |
| **longestUncoveredHarmonicRun** | 16小節 | **1小節** |
| **注目範囲33–46の被覆** | 0小節 | **14小節** |
| **occurrencesRetained（Occurrence保持数）** | 0 | **374** |
| groupedVisibleCoverage | 30.61% | **96.94%** |
| minimumSelectedCandidateScore | 0.670448 | 0.595195 |
| runtime | 163 ms | **176 ms** |

baseline の coverageRedundancy は 1.6429 — 選ばれた候補が同じ小節を平均1.64回重ねて拾っていた。被覆されない小節が残る一方で、同じ場所を何度も選んでいたことになる。

---

## 6. 凍結Gate

指示書の自動設定ルールを適用した。`oracleCandidateCoverage = 100% >= 95%` のため**緩和分岐を使わず90%をそのまま課した**。

| Gate | 基準 | baseline | 最終 | 判定 |
|---|---:|---:|---:|---|
| selectedCoverageAtAllVisible | ≥ 90% | 28.57% | **96.94%** | PASS |
| sectionRecallAtAllVisible | = 100% | 55.00% | **100.00%** | PASS |
| longestUncoveredHarmonicRun | < 8 | 16 | **1** | PASS |
| 33–46帯の被覆 | ≥ 1小節 | 0 | **14小節** | PASS |

ガードレールも全通過（minimumSelectedCandidateScore 下限0.520 に対し0.595、runtime上限3000msに対し176ms、決定性OK）。

**Gateは一度も変更していない。**

### 分母の定義（固定）

和声証拠音が鳴る小節のみ。無音・ドラムのみ・証拠閾値未満は分子分母とも除外。SURAN remix は100小節中**98小節**が対象。

---

## 7. コード検出は一切変えていない

| 項目 | 結果 |
|---|---|
| Chord Drip 100件の timeline 一致 | **100 / 100** |
| extraction profile 誤発動 | **0件** |
| Root / Quality / Exact / Corrections | 57.76% / 60.29% / 13.69% / 918（不変） |

Phase 4.1 が変えたのは**候補リストの作り方だけ**である。

---

## 8. 採用しなかったもの

**section-aware selection。**

| selector | 候補 | 被覆 | sectionRecall | 最長未被覆 |
|---|---:|---:|---:|---:|
| coverage-only | 7 | 95.92% | 100.00% | 3 |
| section-aware-coverage | 8 | 95.92% | 100.00% | 3 |

被覆も sectionRecall も同値で候補数だけ増える。**coverage-only が既に sectionRecall 100% に達しており改善余地がない。** 指示書の規定に従い coverage-only を採用し、有効な否定結果として完了扱いとした。section信号は実装として残すが既定では使わない。

---

## 9. 各Stageの主な成果

### P4.1-01 Pattern / Occurrenceモデル

同じ進行は曲中に何度も現れるが、dedup はそれを1件へ潰していた。**2回目のサビが欲しいユーザーには到達手段がなかった** — 順位が低いのではなく存在しなかった。

Occurrence を生成・選定・被覆の単位にし、Pattern へのグルーピングは後段の表示用とした。各Occurrenceは自分の絶対コード・voicing・小節位置を保持し、単独で試聴・保存できる。移調不変identityには P4.0-03 の `relativeSignature()` を使い、新しい同値関係は導入していない。

### P4.1-02 Coverage Selector

限界利得による貪欲選択。品質は通貨ではなくゲートのままで、弱い候補が被覆のために採用されることはない。

### P4.1-03 Section Segmentation

診断可能な純関数として実装し、**選定へは接続しない**（境界の誤りが候補を除外できてはならないため）。命名は `Section 1, 2...` のみで chorus / verse とは推定しない。SURAN で24セクション、境界 precision 82.6% / recall 94.7%。

### P4.1-05 AI抽出MIDIプロファイル

`rawNotes` と `analysisNotes` を分離。修復は解析側だけで、**raw note の結合も attack の削除も行わない**。プロファイルは4条件のANDで判定（単独条件は手書きMIDIでも普通に起こるため）。

SURAN で発動し、raw 3909音は不変のまま解析側が2541音に。誤発動は Chord Drip 100件で **0件**。

### P4.1-06 Occurrence UI

候補カードへ「出現: N箇所」と一覧を追加。各Occurrenceは小節位置・セクション番号・移調量・絶対コードを表示し、**個別に試聴と保存ができる**。試聴はそのOccurrence自身のイベントを鳴らすので、2回目のサビは2回目のサビの音になる。

選択中の表示は色だけに依存させず文言と `data` 属性で示し、各ボタンに小節位置を含む `aria-label` を付けた。

---

## 10. 全検証結果

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | **162ファイル / 1215件 全PASS** |
| `cargo test` | **24件 PASS** |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| `git diff --check` | PASS |
| 決定性 | 3構成すべて再実行で同一 |

生成物: `loop-vault.exe` 14.7 MB / MSI 5.06 MB / NSIS 3.55 MB。

---

## 11. 互換性とRollback

- `fileVersion = 1` 変更なし
- 保存schema変更なし
- 旧data.jsonをそのまま読める
- 保存済み進行を自動再解析しない
- `candidatePatterns` / `sections` は**非永続**
- Live MIDI / Chord Dojo / LLM / Progression Advisor は変更していない

`src/domain/midi/analysis.ts` の2行で Phase 4.0 の挙動へ戻る。

```ts
export const defaultAnalyzerMode = phase40DefaultAnalyzerMode;
export const analyzerVersion = phase4AnalyzerVersion;
```

`phase40DefaultAnalyzerMode` を rollback 用定数として残した。**旧モードは1つも削除していない。**

---

## 12. 個人MIDIの取り扱い

| 確認項目 | 結果 |
|---|---|
| tracked な `.mid` / `.midi` | **0件** |
| SURAN remix | `.local-evaluation/phase4.1/fixtures/`（Git管理外） |
| Chapter 3 Seed | `.local-evaluation/chapter3-seed/`（Git管理外） |
| レポート内の絶対パス | なし（内容fingerprintとbyte長のみ） |
| pre-commit guard | 動作確認済み |

---

## 13. 作業中に見つけた自分のミス

### P4.1-02 限界被覆の正規化

最初は限界被覆を**総小節数**で正規化していた。数小節covered後には各ステップの寄与が極小に見え、**qualityが静かにcoverageを上回って5件・65%で誤停止**していた。残りの未被覆数で正規化する形へ修正。

### P4.1-02 スコアリングの不一致

最初の計測は `repeatCount: 1` 固定・内部rankingScore未使用で、baseline の `minimumSelectedCandidateScore 0.670` と比較できない値だった。`scoreOccurrences()` を追加して製品と同一経路でスコアを付け直した。

### P4.1-03 境界検出の粒度

小節単位で chroma を比較していたため、`C Am F G` のような通常のループが毎小節「新規」に見え、**コード変化をセクション変化と誤認**していた。テストがこれを捉え、窓同士の比較へ修正した。

### P4.1-05 ボーカルstemの誤分類

閾値を緩めただけでは**ボーカルstemが harmony と判定**され、和声ではない音を検出器へ与えていた。stem名を prior として閾値判定より先に適用する形へ修正。

### P4.1-07 検証設定の誤り

最初の検証で corpus timeline が 31/100 しか一致せず FAIL が出た。原因は検証スクリプトが tune済みの `qualityEvidence` 係数を渡しておらず、**未調整の既定値0.35で走っていた**こと。製品の回帰ではなく計測ミスで、設定を揃えて 100/100 になった。

### ブランチ運用

P4.1-02 のコミットを P4.1-01 のブランチ上に作ってしまった。未push状態だったため rebase で master 直上へ移した（公開履歴の書き換えではない）。

---

## 14. 既知の制約

1. **実MIDIでの聴感確認が未実施**（自動化できない唯一の項目）
2. ミニマップ上の全Occurrence表示とセクションレーンは未実装。Occurrenceへの到達手段という中心要件を優先した
3. セクション境界の precision は 82.6%。選定へ接続していないため候補には影響しない
4. `coverage` 単体より 1.02pp 被覆が低い構成を選んでいる（extraction profile の副作用。role推定の正しさを取った）
5. Gateの分母となるセクション定義は P4.1-00 の暫定版（4小節chroma新規性）を凍結して使用
6. **SURAN remix 1曲での検証。** 長尺・生演奏・他のAI抽出MIDIでの確認は未実施
7. `presenceThreshold` はこのコーパスでは無効なパラメータ（配線は人工fixtureで検証済み）

---

## 15. 追加した診断コマンド

```bash
npm run check:staged
npm run hooks:install
npx vite-node scripts/diagnose-coverage-pipeline.ts --midi <path> --output <name>
npx vite-node scripts/evaluate-coverage-selection.ts --midi <path> --output <name>
npx vite-node scripts/evaluate-section-segmentation.ts --midi <path> --output <name>
npx vite-node scripts/evaluate-extraction-profile.ts --midi <path> --output <name>
npx vite-node scripts/compare-selectors.ts --midi <path> --output <name>
npx vite-node scripts/validate-phase41.ts --output <name>
```

---

## 16. 成果物

```text
docs/phase4.1-work-report.md                 本書
docs/phase4.1/00-evaluation-contract.md      評価契約と損失Stage特定
docs/phase4.1/00-coverage-gates.json         凍結Gate
docs/phase4.1/00-suran-baseline.json         凍結baseline
docs/phase4.1/07-final-validation.md         最終検証と昇格
docs/phase4.1/07-final-validation.json       3構成の比較結果
```

加えて各Stageの計測JSON（`02-coverage-selection` / `03-section-segmentation` / `04-selector-comparison` / `05-extraction-profile`）が同ディレクトリにある。いずれもMIDIバイト列・絶対パス・ファイル名を含まず、内容fingerprintとbyte長のみを記録している。
