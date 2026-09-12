# P5.27 Run Remaining Stages

P5.27-00 PASSを確認。

必要固定:
- reuse architecture
- single clock contract
- Source/Custom exact semantics
- Lesson Rule Table
- unsupported contract
- navigation placement
- approved mock mapping
- `$emil-design-eng` installed

Stage01〜05を順に実行可能。

## Stage01
Practice Domain / Clock / Snapshot。

UIなし。

## Stage02
Voicing Resolution。

Source / Custom / Basic / Left-hand。

No silent fallback。

## Stage03
UI Integration。

**必ず `$emil-design-eng` を使用。**

Approved HTML mockをvisual directionとして使い、
existing Loop Vault tokens/componentsへ変換。

UIを根本的に再設計する必要が発生した場合だけ、
実装前に `$prototype` で比較し、reportする。

## Stage04
Text / Vault flow integration。

## Stage05
Hardening / Product Acceptance。

各Stage:
implementation
→ focused tests
→ relevant regression
→ report/state
→ diff-check
→ explicit staging
→ independent commit
→ clean

No merge/push/P5.28。

Final:
`READY FOR PRODUCT ACCEPTANCE — Progression Voicing Practice`
