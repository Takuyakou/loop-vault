# P5.21 Remaining Stages Prompt
P5.21-00 PASSとbaseline/ground truth/promotion gate/contractsのcommitを確認後、01〜05を順に実行してよい。

Stage02はpromotion boundary。Gate FAILならproductionへ昇格せず03/04へ進まず停止。PASS時のみ03へ。

各Stage: implementation→focused tests→regression→metrics/protected audit→report/state→diff-check→explicit staging→independent commit→clean。

絶対禁止: Voice内mixed note filtering、note-level suppression、scoring/boundary/candidate generation変更、raw noteへのlegato repair、confidence %、default変更、Vault schema/fileVersion変更、P5.21.1/P5.22、merge/push。

最終: `READY FOR PRODUCT ACCEPTANCE — Harmonic Core / Role Evidence v2` で停止。
