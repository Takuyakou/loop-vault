# Phase 5.13 v2 Before Visual Report

## Source

Phase 5.13のsynthetic Playwright fixtureを同一buildで撮影した画像を、
v2のBefore基準として`artifacts/phase5.13-v2/before/`へ固定する。
個人MIDIとユーザー提供スクリーンショットは含まない。

## Included Screens

- `home.png`
- `capture-empty.png`
- `capture-source-selection.png`
- `capture-analysis-results.png`
- `vault.png`
- `progression-detail-default.png`
- `progression-detail-editing.png`
- `practice.png`
- `live-midi.png`
- `settings.png`
- `dialog.png`
- `toast.png`
- `long-content.png`

## Observations

- Top navigationとglobal controlsが同じ横列にあり、狭幅で二段化する。
- Capture Emptyはstep cardがdrop zoneより先に読まれる。
- Progression Detailはback / action / title / metadataの後にコードカードが来る。
- Vaultは検索条件と結果metadataの階層差が弱い。
- Practiceは現在課題より設定群の占有が大きい。
- 全体は枠線による分割が多く、primary surfaceの強弱が小さい。

## Comparison Rules

- Afterは同じsynthetic fixtureで撮影する。
- animation、timestamp、random値を固定する。
- viewportは1024×720、1280×720、1366×768、1440×900、1920×1080。
- thresholdを広げて差分を隠さない。
- intentional diffを画面単位で説明する。

