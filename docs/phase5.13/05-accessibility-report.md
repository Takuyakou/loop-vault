# Phase 5.13 Accessibility報告

## 自動監査

Playwright + `@axe-core/playwright`で次を検証した。

- Home / Capture empty
- 11 Voice pre-analysis / analysis result
- Vault / progression detail / Settings dialog

対象ルールはWCAG 2.0 A/AAとWCAG 2.1 A/AA。critical / serious violationは0件。

## 実装中に検出して修正した問題

1. pre-analysis選択面のmuted text contrastが3.71:1だった。
   `--lv-accent-soft`を暗くし、4.5:1以上へ修正した。
2. chord cardの`role=option`内にpreview/edit buttonが入り、nested interactive構造だった。
   chord collectionを`role=group`、主chord buttonを`aria-pressed`へ変更した。
3. listbox直下へquick action buttonが並ぶrequired-children違反があった。
   実際の操作モデルに合わせてlistbox semanticsを除去した。

## Keyboard

- Tab順は視覚順と一致。
- skip linkはEnterでmainへfocus移動。
- dialogはfocus trap、Shift+Tab循環、Escape close、起点focus return。
- Capture preset、Solo、role、Analyze、candidateをkeyboardだけで操作。
- Vault検索は`/`、Escapeで検索focusを解除。
- Settings、save、detail、Dojo startへkeyboardで到達。

## Motion / Content

- `prefers-reduced-motion: reduce`時にanimation/transitionを抑止。
- 1024x720を含む5 viewportでbody横overflowなし。
- 長いtitleとsource file nameでVault rowの横overflowなし。

## 残件

- 36pxの専門編集補助操作が一部残る。主要操作ではなく、密度・誤操作・keyboard代替を
  同時に満たす箇所だけ個別に拡張する。
- 150%相当のOS拡大はviewport matrixで近似した。Windows実機の拡大率は手動確認対象。
