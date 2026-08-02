# Phase 5.16.1 UI / Home / Accessibility Report

## Product UI

- Sidebarは変更せず、Practice内に`Chord Dojo | Bass Practice` subnavigationを追加
- feature flag OFFでは従来Chord Dojoだけを表示
- Bass Practice内に動作可能なmodeはDegree Echoだけ
- Challenge Cardを主役にし、stateごとのprimary CTAは1つ
- Homeへfirst-run / due / completed-today由来の小型cardを追加
- Hint 4までfretboard markerを非表示
- 4/5-string、left/right、fret range、horizontal scroll、screen-reader summaryを実装
- `自己評価`、`Self-rated`、`自動採点ではありません`を表示し、accuracy/score/confidenceを表示しない

## Accessibility

- axe WCAG 2 A/AA + 2.1 A/AAのcritical/serious violation 0
- Practice tabsはroving tabindex、Arrow/Home/End操作、selected state、tabpanel relationを実装
- R/H/Space/S/1〜4/N/T/Escはinput/select/contenteditable、modifier、composition、key repeatを奪わない
- polite live region、visible focus、skip link、route focus、screen-reader fretboard alternativeを維持
- reduced motion project PASS

## Viewport / visual evidence

| Coverage | Result |
|---|---:|
| Degree Echo 1440×900 | PASS |
| Degree Echo 1280×800 | PASS |
| Degree Echo 768×1024 | PASS |
| Degree Echo 390×844 | PASS |
| shared 1024×720 / 1280×720 / 1366×768 / 1440×900 / 1920×1080 | PASS |
| Windows 200% scale（1024×720, device scale 2） | PASS |
| visual suite | PASS、既存evidenceの意図しない更新はHEADへ復元 |
| full Playwright | 40/40 PASS |

既存Home、Chord Dojo、Vault、Detail、Capture、Settings、Dialog、Live MIDIのvisual/accessibility/keyboard flowもfull suiteで非退行を確認した。
