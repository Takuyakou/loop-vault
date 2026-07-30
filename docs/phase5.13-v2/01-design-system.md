# Phase 5.13 v2 Design System

## Direction

`Modern Dark Music Workstation`を採用する。Bass Practiceモックの情報階層を使い、
Loop Vaultのティールbrandとdesktop向け情報密度を維持する。

## Color Roles

| Role | Token | Value |
| --- | --- | --- |
| App background | `--lv-bg` | `#0a1019` |
| Sidebar | `--lv-sidebar` | `#0d1522` |
| Standard surface | `--lv-surface` | `#111b2a` |
| Raised surface | `--lv-surface-raised` | `#162338` |
| Elevated surface | `--lv-surface-overlay` | `#1b2b43` |
| Primary | `--lv-accent` | `#42d8c6` |
| Primary strong | `--lv-accent-strong` | `#27c6b4` |
| Practice secondary | `--lv-accent-secondary` | `#746df4` |

ティールはprimary action、selection、route currentに使う。IndigoはPracticeの学習状態と
secondary selectionだけに使う。状態色には必ずtextまたはiconを併記する。

## Surface Contract

- `Surface variant="standard"`: 通常のgroup
- `Surface variant="raised"`: inspector、secondary panel
- `Surface variant="primary"`: 画面の主役。1画面1〜2箇所

全surfaceへshadowを付けず、primaryだけに控えめなshadowを許可する。

## Typography

- body: 14pxを標準
- helper / metadata: 12px以上
- section: 18px
- page: 20〜24px
- chord card: 18px
- current chord: 32px

letter spacingを負値にせず、長い文字列はwrapまたはellipsis + full textで扱う。

## Shared Components

- `Button`, `IconButton`
- `Field`
- `Surface`
- `Badge`
- `SectionHeading`
- `StatusMessage`
- `LoadingState`
- `EmptyState`

## Interaction

- control: 36〜40px
- primary control: 40〜44px
- icon-only: 40px、accessible name必須
- focus: `:focus-visible`
- transition: color / border / backgroundのみ、120〜180ms
- reduced motionではanimationとsmooth scrollを停止

## Compatibility

既存`Surface`のdefault APIは維持する。domain、store、schema、Rustに変更はない。

