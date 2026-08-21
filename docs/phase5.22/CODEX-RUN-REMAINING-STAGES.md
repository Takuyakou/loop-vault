# P5.22 Run Remaining Stages Prompt

P5.22-00がPASSし、次がcommit済みであることを確認してください。

- B+ snapshot contract
- fileVersion decision
- exact timing/boundary semantics
- note/byte budgets
- Capture opt-in / Voice selection
- immutable edit semantics
- Level3 policy
- Level1/2 rules
- History/export/import/privacy
- baseline

Required readingとGit realityを再確認してください。

問題がなければ P5.22-01〜05 をStage順に連続実行して構いません。

各Stage:

1. implementation
2. focused tests
3. regression/security/privacy checks
4. report
5. execution-state
6. `git diff --check`
7. explicit-path staging
8. independent commit
9. post-commit clean

停止条件:

- fileVersion/migration contract矛盾
- exact timing loss
- source all-note preservation不能
- raw MIDI/path依存が必要
- budget enforcement不能
- progression saveを不必要にblock
- Bassline Echoでhonest Level3 projection不能
- L1/L2がnon-deterministic/AI依存
- source/current harmony mismatchを隠す必要
- P1 security regression
- P5.15/Analyzer/MIDI Exporter変更
- test/build Gate FAIL
- unexpected existing change

最終到達点:

`READY FOR PRODUCT ACCEPTANCE — Source Bassline Practice`

masterへmergeせず、pushせず、P5.23へ進まず停止してください。
