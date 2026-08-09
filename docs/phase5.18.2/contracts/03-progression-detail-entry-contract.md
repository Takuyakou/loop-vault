<!-- phase-id: 5.18.2 -->
# Contract 03 — Progression Detail Entry

P5.18.2-00で現在の真実を判定する。
1. exists-and-works → regression-test
2. exists-but-hidden/broken → minimal fix
3. historically existed/regressed → restore
4. never existed → human approvalなしに新規flowを作らない

working handoffはpickerと同じread-only safe snapshot/source contractを使う。
duplicate Vault mutation / route store / Practice source modelは禁止。
