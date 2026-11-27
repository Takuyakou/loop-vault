# Phase 5.13 v2 Runtime / Bundle Report

## Bundle

`npm run build` の最終結果:

| Asset | Baseline | Final | Delta |
| --- | ---: | ---: | ---: |
| JavaScript | 1318.86 kB | 1334.20 kB | +15.34 kB (+1.16%) |
| JavaScript gzip | 384.80 kB | 389.87 kB | +5.07 kB (+1.32%) |
| CSS | 46.71 kB | 50.08 kB | +3.37 kB (+7.22%) |
| CSS gzip | 10.00 kB | 10.66 kB | +0.66 kB (+6.60%) |

既存の500 kB超chunk警告は残る。新フォント、新UI framework、新icon packageは追加していない。

## Large Data Gates

- 100,000 MIDI notes: Canvas描画テスト PASS (`PreAnalysisWorkspace.test.tsx`)
- 1,000 Vault rows: 仮想化テスト PASS (`VaultView.test.tsx`)
- 100 chord detail: 100カード保持テスト PASS (`ProgressionDetailView.test.tsx`)
- 長いタイトル: Playwrightで横overflowなし
- 5 viewport matrix: 1024x720〜1920x1080 PASS

## Regression Lock

| Contract | Baseline | Final |
| --- | --- | --- |
| `src/domain/schema.ts` blob | `3e8b9a9ef8ba91631899629cdd9d5527045fa836` | 同一 |
| `src/domain/midi/analysis.ts` blob | `8a05e530dc583950b89ce090c7aba591793c6c03` | 同一 |
| `src/store/vaultStore.ts` blob | `1d4c33f64abbd5b90e43161efbbe6938b5df9add` | 同一 |
| `fileVersion` | 1 | 1 |
| default Analyzer | `phase4-v1` | `phase4-v1` |
| tracked MIDI | 0 | 0 |
| tracked `.local-evaluation` | 0 | 0 |

全1,852 Vitestを通してAnalyzer、Candidate、Vault payload、Practice、Live MIDIの回帰を確認した。

## Limitation

ブラウザのheap snapshotによる長時間memory profileは実施していない。繰り返し遷移E2E、listener cleanupの既存単体テスト、製品ビルドは通過している。
