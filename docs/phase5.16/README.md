# Loop Vault Phase 5.16 Split Work Instructions

旧`Phase 5.16 Bass Practice Mode MVP`を、実際に使える成果単位へ分割した最終構成です。

## 実行順

```text
Phase 5.16.1
Degree Echo Core
+ 学習ループ全体
+ 保存
+ 履歴
+ Home導線

Phase 5.16.2
Rhythm Echo
+ Metronome
+ Count-in
+ Rhythm-specific Review / Transfer

Phase 5.16.3
Bassline Echo
+ Generated Bassline
+ Vault Progression連携
+ Source MIDI Bass監査
```

## ファイル構成

```text
PLAN.md
contracts/
  01-honesty-scope-and-autonomy.md
  02-practice-domain-state-and-storage.md
  03-playback-singing-hints-and-timing.md
  04-shared-ux-home-history-and-accessibility.md
stages/
  phase5.16.1-degree-echo-core.md
  phase5.16.2-rhythm-echo.md
  phase5.16.3-bassline-vault.md
reference/
  phase5.16-bass-practice-ui-mock.html
```

## 使い方

1. `PLAN.md`と`contracts/*.md`をリポジトリへ配置する。
2. 実装時は対象Stage文書を1つだけactive instructionにする。
3. 各Phaseの内部では、通常のGate失敗をCodexが自律修正し、途中確認なしで最終報告まで進む。
4. 次のPhaseは、前Phaseの最終報告とbaseを確認してから別指示として開始する。
5. Phase 5.17のDI録音・自動採点を混ぜない。

## 命名

正式表記は次です。

- Phase 5.16.1
- Phase 5.16.2
- Phase 5.16.3

`5.16-1`等の表記は会話上の略称としてのみ扱います。
