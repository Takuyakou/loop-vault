# Phase 5.16.1 Storage / History Report

## 結論

PracticeはVaultと別のversioned repositoryへ保存する。Vault schemaと`fileVersion = 1`は不変で、raw MIDI、audio、microphone data、絶対path、個人filenameを保存しない。HistoryとHomeはPractice Repositoryからpure derivationする。

## Storage contract

- data file: `loopvault/practice-v1.json`
- strict schema、version、future-version拒否
- temp write、flush/close、atomic rename
- CAS revision/tokenで複数instanceのstale writeを拒否
- backup最大20、同一秒でもunique名
- invalid JSON/schemaとindependent-success mismatchを隔離
- write failure時はactive/unsaved memory stateを保持
- recovery artifact確認不能時は安全側でPracticeを停止
- feature flag OFFではrepository load/saveを開始しない

## Review / History

- Again / Hard / Good / Easyとoptional issueを保存
- independent successはGood/Easy、Hint 0〜2、skipなし、sing gate完了のcanonical derived value
- queueはstable ID tie-breakで決定論的
- Again/Hard retry、Good variation、Easy spaced Transferをversioned policyで生成
- Historyはsession summaryを最大100件へbounded表示し、自己評価由来を明示

## Gate evidence

| Suite | Result |
|---|---:|
| repository atomic/recovery/CAS | 19/19 PASS |
| storage adapter contract | 14/14 PASS |
| application load/save/queue/Home/History | 16/16 PASS |
| review truth table / queue policy | 14/14 PASS |
| Rust practice storage | 15 relevant tests PASS |
| full Rust | 41/41 PASS |

P5.16.1-05のtracked benchmark scriptで、1,000 attempts / 100 sessionsのHistory derivationを9回測定し、100 summary上限を維持した。median 0.1939 ms、p95/max 0.3410 ms。1,000-attempt queueはmedian 1.2375 ms、p95/max 1.3609 msで、測定環境の16.67 ms frame budgetを全runで下回った。Stage-localの一時測定より、このfinal release sessionを正とする。生値とfixture生成コードは`05-runtime-memory.md`と`scripts/p5161-release-benchmark.ts`に固定した。

## Full Vitestのcorpus fixture前提

この隔離worktreeはclean checkout時、Phase 5.15の317-file corpus本文を含まない。本文は非追跡・非commit対象であり、lockは`docs/phase5.15/00-baseline-lock.json`、`docs/phase5.15/00-data-inventory.json`、`docs/phase5.15/00-partition-lock.json`、`docs/phase5.15/01-corpus-lock-binding.json`に固定されている。

release確認では、許可済みlocal sourceから一時fixtureを配置し、最初に`stage01CorpusLock.test.ts`の5/5で317 entryのpath/size/SHA-256/manifest/partition bindingを検証し、その同一配置でfull Vitest 282 files / 2,324 testsをPASSさせ、直後に一時fixtureを削除した。corpus解析やbaseline再計算はしていない。clean checkout単独ではこのfixture不足により当該1 testだけがFAILし、残り281 files / 2,323 testsはPASSする。これは機能退行ではなく、非追跡fixtureの実行前提である。
