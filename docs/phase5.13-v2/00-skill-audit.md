# Phase 5.13 v2 Skill Audit

## ui-ux-pro-max

- Path: `D:/dev/Loop Vault/.agents/skills/ui-ux-pro-max/SKILL.md`
- Product query:
  `desktop music production MIDI chord analysis dark workstation content-dense`
- Design dials:
  - variance: 4 / 10
  - motion: 2 / 10
  - density: 8 / 10
- Stack query: React desktop application / sidebar / focus / dense list
- UX query: accessibility / z-index / loading / keyboard / dark mode

採用:

- Modern Darkを基本にする。
- 高密度のdesktop work surfaceを維持する。
- motionは状態変化を説明する短いtransitionだけにする。
- focus、keyboard、loading、disabled reasonを優先する。
- 100件超のlistはvirtualizationを維持する。

不採用:

- skill検索結果の紫主体palette。
- Poppins / Righteousの外部Web Font。
- glassmorphism、ambient blob、強いgradient。
- mobile-firstの低密度layout。

不採用理由はPhase 5.13 v2仕様のティールbrand、DAW併用、既存bundle維持と競合するため。

## web-design-guidelines

- Path: `C:/Users/fdfff/.codex/skills/web-design-guidelines/SKILL.md`
- Version: `1.0.0`
- Latest rule source:
  `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
- Retrieved: 2026-07-30

重点項目:

- semantic button / navigation
- icon-only buttonの`aria-label`
- visible `:focus-visible`
- skip linkとheading hierarchy
- visible form label
- async statusの`aria-live`
- unsaved navigation guard
- reduced motion
- `transition: all`禁止
- long textと`min-width: 0`
- large list virtualization
- `color-scheme: dark`
- selected / warningを色だけで示さない

## Conflict Resolution

指示書を正とし、skill提案は次の優先順で採用する。

1. 操作の分かりやすさ
2. 誤操作防止
3. accessibility
4. 操作速度
5. 既存機能との互換性
6. 視覚品質

