# P5.23 Run Remaining Stages

P5.23-00 PASSと、grouping relation / threshold / anchor / representative / selected-variant / snap / harmonic activity contractがcommit済みであることを確認。

問題なければP5.23-01〜04を順番に実行してよい。

各Stage:
1. implementation
2. focused tests
3. regression
4. visual/a11y
5. protected diff audit
6. report/state
7. git diff --check
8. explicit-path staging
9. independent commit
10. clean status

Hard stop:
- candidate generation/scoring/boundary diff
- candidate loss
- non-deterministic grouping
- focus/highlightによる意図しないselection mutation
- activity表示に新Analyzer passが必要
- unexplained visual baseline diff

絶対禁止:
- Candidate Diversification
- coverage-aware reranking
- P5.23.1
- P5.24
- merge/push

最終状態:
`READY FOR PRODUCT ACCEPTANCE — Timeline Candidate Legibility`
