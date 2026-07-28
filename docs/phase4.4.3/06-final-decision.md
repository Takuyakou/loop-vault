# Phase 4.4.3-06 最終判定

## 1. 結論

**A1-primeを製品へ昇格しない。melody-contaminationの自動除去は、現時点の
証拠では解決不能として追加投資を停止する。**

- A1-primeはshadow評価専用のまま維持する
- 製品のvoicing抽出経路へ接続しない
- `minimumSupportBeats`を使う既存A1の製品挙動も変更しない
- 次の精度改善対象はlabel（quality / tension）トラックとする
- 検出結果を隠さず、人が短時間で直せるT1〜T3は独立して出荷可能とする

この判断は、結果を見る前に固定した撤退基準
（`docs/phase4.4.3/00-evaluation-contract.md`）をそのまま適用した結果である。

## 2. Gate結果

16 scenario / 256 eventのleave-one-scenario-out評価を実行した。
既知Holdout由来の3 foldは診断のみとし、昇格判定から除外した。

| 項目 | 実測 | 判定 |
|---|---:|---|
| 判定対象fold | 13 | - |
| Improved | 5 | 撤退基準の12未満 |
| Inconclusive | 0 | - |
| Regressed | 8 | 1件以上のため停止 |
| Burned diagnostic | 3 | 昇格判定に不使用 |
| 一般corpus回帰 | PASS | G-D PASS |
| source note addition | 0 | PASS |
| 最終判断 | `stop-automatic-removal` | **非昇格** |

撤退基準は「improved <= 7、またはregressed >= 1、またはG-D FAILなら停止」。
実測は`improved = 5`かつ`regressed = 8`であり、停止条件を2つ満たす。
根拠の全fold値は`docs/phase4.4.3/03-loso-cv-results.md`および
`docs/phase4.4.3/03-loso-cv-results.json`に保存した。

### G-A Applicability

Hクラスを持つ判定対象foldでは、H16を除きA1-primeのapplicabilityは100%だった。
したがって主要な退行は「適用されなかった」だけでは説明できない。
H16は既知Holdout由来の診断foldでapplicability 0%だった。

### G-B Efficacy

判定対象foldのうち、G-Bを含む改善判定はH07、H08、H10、H13、H15の5件だった。
H01〜H06、H09はapplicability 100%でも有効性条件を満たさず退行した。
短いsupport durationだけを原因とする仮説は、scenario間で一般化しなかった。

### G-C Inertness

H11 `all-channel-zero-stems`はXクラス16件中、inertness 50%でFAILした。
診断のみのH12も50%だった。適用範囲外で完全不変という安全条件を満たさないため、
この事実だけでも製品昇格は不可である。

### G-D 一般corpus回帰

Dev 320 event / Validation 96 eventの一般回帰はPASSした。

- overall F1: PASS
- Plain block Exact: PASS
- Rootless Exact: PASS
- Arpeggio F1: PASS
- source note addition: 0

一般回帰PASSは必要条件だが、G-B/G-Cの失敗を打ち消さない。

### G-E 不変条件

評価・UI変更を通じて次を変更していない。

- chord label / Timeline / boundary / aggregate / fallback
- `defaultAnalyzerMode = "phase4-v1"`（`src/domain/midi/analysis.ts`）
- `fileVersion = 1`（`src/domain/schema.ts`、`src/domain/types.ts`）
- Vault schema

## 3. A1-primeの扱い

A1-primeは`minimumSupportBeats`だけを省略できるshadow候補として実装した
（`src/domain/voicing/relativeSupportMelodyFilter.ts`）。
製品呼び出し側は従来どおり`minimumSupportBeats: 0.2`を渡している。

評価専用経路:

- `scripts/evaluate-phase443-a1-prime.ts`
- `scripts/evaluate-phase443-loso-cv.ts`

今後、既知corpusを見ながら閾値やrole evidenceを調整して再昇格させない。
N/X向けheuristic、role修正、note filteringの追加は本フェーズで実装していない。

## 4. 製品価値トラック

自動除去の非昇格とは独立に、誤推定を見分けて手動で復帰できるT1〜T3を実装した。

### T1: Voicing source chip

`src/components/voicing/VoicingSourceChip.tsx`

- 「元の響き / 自動 / 要確認」の3状態を表示
- 状態理由をtooltipで提示
- icon、文字、ARIA名を併用し、色だけに依存しない

### T2: review / fallbackからの復帰導線

`src/components/voicing/VoicingPanel.tsx`
`src/views/PracticeView.tsx`

- Progression Detailでは「鍵盤で弾いて上書き」から直接MIDI記録を開始
- Dojoでは同名ボタンからProgression Detailの既存編集経路へ1クリックで移動
- Dojoから移動後のMIDI記録開始はProgression Detail側のボタンで行う
- 記録結果は既存の`practiceVoicingOverride`保存経路を使う

### T3: Dojo提示順

`src/domain/practice/recommendation.ts`

- 確認待ち、stale、練習済み等の既存優先順位を維持
- 同じ練習優先グループ内で、usableなsource voicingの割合が高い進行を先にする
- 抽出結果、Vault schema、保存形式は変更しない

## 5. Phase 4.4.3の成果物

| Stage | 成果物 |
|---|---|
| 00 | `docs/phase4.4.3/00-evaluation-contract.md/json` |
| 01 | `docs/phase4.4.3/01-holdout-classification.md/json` |
| 02 | `docs/phase4.4.3/02-a1-prime-shadow.md/json` |
| 03 | `docs/phase4.4.3/03-loso-cv-results.md/json` |
| 04 | T1 source chip |
| 05 | T2/T3復帰導線・Dojo提示順 |
| 06 | 本最終判定 |

## 6. 次の作業先

melody-contamination自動除去の改良は停止し、Phase 4.3で残差が確認済みの
label（quality / tension）精度へ移る。

- root@1は高い一方、canonical Exactの残差が大きい
- 手動修正コストの中心はquality / tension側に残っている
- voicing誤推定の実用上の被害はT1〜T3で可視化・手動復帰できる

新しい独立corpusや異なる原理の介入を事前登録するまでは、
A1/A1-primeの再調整を再開しない。

## 7. 最終検証

P4.4.3 stack最上段で次を実行し、すべてPASSした。

- `npm run lint`
- `npx tsc --noEmit`
- `npm test -- --run`: 201 files / 1672 tests
- `cargo test --manifest-path src-tauri/Cargo.toml`: 24 tests
- `npm run build`
- `npm run tauri build`
- `git diff --check`
- `git ls-files -- "*.mid" "*.midi"`: 0 files

生成物:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

既知警告はViteの500 kB超chunk警告のみ。ビルド失敗やテスト失敗はない。
