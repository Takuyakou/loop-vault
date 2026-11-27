# P11-03 — 部分Sourceの明示補完

## 選んだこと / 理由 / 別案

- 選んだこと: X/Nの保存した音・元MIDI・カスタムは、不足カードだけ固定の基本（Teacher、Color/Open/全体最適化なし）で補完する。
- 理由: 固定音を隣接候補の最適化へ渡す安全性が未証明なため。利用可能な保存音の音高・配置はそのまま保持する。
- 別案: 選択中生成タイプへ追従する補完は、設定変更でSourceカードが変化する誤解を避けるため不採用。

## 実装

0/Nは利用不可のまま、N/Nは従来の固定音。X/Nのみ補完し、カード右上のAとtooltip/accessible text「自動生成で補完」で区別する。基本方式にも形がないコードは利用不可を維持し、暗黙に別の形を使わない。

明示的なセッション移調・octave操作は既存契約どおり。Vault snapshot/schemaは変更しない。

## 検証

focused: 220/220 PASS（resolver・view・transport）。0/N、1/N、交互、N-1/N、先頭/末尾欠落、N/Nを3つの固定Sourceで確認。表示・Start・固定音保持を確認。既存deterministic transportのStart/Stop/Restart/count-in回帰を維持。
App TypeScript、changed ESLint、class/source lint PASS。Stage code commitはexecution-stateのlastVerifiedCommitに記録する。

Fresh FAST: Vitest 3644/3644、Playwright 161/161 PASS。PASS cache不使用。
