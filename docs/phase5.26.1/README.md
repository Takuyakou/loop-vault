<!-- phase-id: 5.26.1 -->

# Phase 5.26.1 — Source Voicing Full Playback Fidelity

## Status

- **Status:** in progress
- **Active stage:** P5.26.1-00
- **Completed stages:** none
- **Next action:** implement and verify source-voicing parity for Capture full playback

## Required Reading Order

1. Root `AGENTS.md` — canonical safety rules
2. [`work-instructions.md`](work-instructions.md)
3. [`execution-state.json`](execution-state.json)
4. [`reports/README.md`](reports/README.md)
5. [P5.26 Local Harmonic Rhythm contract](../phase5.26/contracts/02-local-harmonic-rhythm-contract.md)
6. [P5.26 Structural Bass contract](../phase5.26/contracts/03-structural-bass-consolidation-contract.md)
7. [P5.26 flags and regression contract](../phase5.26/contracts/07-flags-regression-contract.md)
8. [P5.26 privacy and performance contract](../phase5.26/contracts/08-privacy-performance-contract.md)
9. [Active report](reports/P5.26.1-00-source-voicing-full-playback.md)

## Purpose

Captureのコードカード単体再生と全体再生で、同じsource MIDI由来segmentに
同じpitch / octave voicingを使用する。source voicingがなければ既存のgenerated
voicingへ安全にfallbackする。

## Stages

### P5.26.1-00 — Audit, implementation, and focused acceptance

Capture full playbackのvoicing data flowを監査し、既存の共通voicing解決規則を
再利用してcard/full parityを実装する。focused playback regression、TypeScript、
lint、phase docs、security、privacy、diff hygieneを通して独立commitにする。

## Non-goals

Analyzer、chord detection、ranking、naming、音源、tempo、quantization、source MIDI、
Vault schema、fileVersion、migration、UI layoutは変更しない。

## Stop condition

実装とrequired gatesを記録して停止する。merge、push、tag、release、P5.27へ
進まない。
