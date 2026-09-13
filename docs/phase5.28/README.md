<!-- phase-id: 5.28 -->

# Phase 5.28 — Voicing Loop Direct Navigation

P5.27のProgression Voicing Practiceを、保存済み進行やText保存のhandoffだけでなく、
左sidebarから直接開けるようにする小規模なnavigation / empty-state phase。

安全規則のsingle source of truthは[root `AGENTS.md`](../../AGENTS.md)。

## Status

- **Status:** completed
- **Active stage:** none
- **Completed stages:** P5.28-00, P5.28-01, P5.28-02
- **Base:** `df971c2cec121199296eb8e394dc18bec5bbe21f`
- **Branch:** `feat/p528-voicing-loop-navigation`
- **Next action:** P5.28は完了。人間による確認と別途明示されたmerge authorizationを待つ。pushはしない

この節、[`execution-state.json`](execution-state.json)、active stage reportを各stage末に同期する。

## Required Reading Order

1. [Root `AGENTS.md`](../../AGENTS.md) — 共通安全規則
2. [Root `CLAUDE.md`](../../CLAUDE.md) — agent entry point
3. [`work-instructions.md`](work-instructions.md) — full P5.28 spec
4. [`execution-state.json`](execution-state.json) — machine-readable resume state
5. [`contracts/01-navigation-empty-state-contract.md`](contracts/01-navigation-empty-state-contract.md) — locked UX/state contract
6. [`audit/P5.28-00-repository-navigation-audit.md`](audit/P5.28-00-repository-navigation-audit.md) — repository/UI/test audit
7. [`reports/README.md`](reports/README.md) — report rules
8. [`reports/P5.28-02-focused-acceptance.md`](reports/P5.28-02-focused-acceptance.md) — final automated acceptance and phase closeout
9. [`../phase5.27/contracts/06-source-custom-fidelity-contract.md`](../phase5.27/contracts/06-source-custom-fidelity-contract.md) — exact pitch/octave and no-fallback contract
10. [`../phase5.27/contracts/10-integration-protection-contract.md`](../phase5.27/contracts/10-integration-protection-contract.md) — protected surfaces
11. [`../phase5.27/reports/P5.27-05-product-acceptance.md`](../phase5.27/reports/P5.27-05-product-acceptance.md) — inherited handoff acceptance

## Locked product shape

```text
Workspace
├─ Home
├─ Chord Capture
├─ Vault
├─ Practice
├─ Voicing Loop
└─ Live MIDI
```

現行sidebarはflat navigationであるため、nested navigation systemは新設しない。
`Voicing Loop`は`Practice`直後の明示的なflat itemとし、内部のdirect routeは
`view = practice`かつ`practiceMode = voicing-loop`で表す。

## Stages

### P5.28-00 — Repository / navigation audit

Production behaviorは変更しない。Git、sidebar、Practice mode、direct entry cleanup、
empty state、Vault/Text seam、P5.27 handoff、keyboard/responsive/axe、visual baselineを監査し、
最小実装契約を固定する。

### P5.28-01 — Navigation / empty-state implementation

- flat sidebarへ`Voicing Loop`を追加する
- direct entryで既存handoff/sessionを明示的にclearする
- source未選択時はLive MIDI leaseを取得しない
- source未選択時に既存UI primitivesを使ったempty stateと2 CTAを表示する
- `My Vaultから選ぶ`はVaultへ、`Textで進行を入力`はCaptureのText入力へ遷移する
- P5.27 Vault/Text handoffとChord Dojo/Bass Practiceを変更しない

### P5.28-02 — Focused acceptance / closeout

Focused Vitest、navigation regression、focused Playwright、320 px、effective 200%、
keyboard、reduced motion、axe serious/critical 0、build/lint/docs/diff hygieneをfresh HEADで確認する。

## Rules recap

- unrelated refactor、Vault schema/fileVersion変更、Practice persistence redesignはしない。
- P5.27 clock/playback/voicing resolutionを変更しない。

共通安全規則は[root `AGENTS.md`](../../AGENTS.md)を参照する。
