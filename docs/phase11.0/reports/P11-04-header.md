# P11-04 — Header / Availability

## 選んだこと / 理由 / 別案

- 選んだこと: 保存した音 / 元MIDI / カスタム / 自動生成の4ソースと、基本 / 骨組みのselector。
- 理由: 音の出どころと生成方針を区別し、既存機能を消さず上部を1行へ整理する。
- 別案: Color/Openを生成タイプへ統合する案はHuman判断により不採用。

Color/Open、basic-full/basic-shell/rootless-shell/full-shell/left-handと左手A/Bは「詳しい設定」へ保持。旧shell方式はその方式のresolverを直接使用する。Color/Open/最適化は承認済み基本/骨組みにだけ適用し、固定音と旧独立rule方式では無効。運指は既存の音を変更しない表示機能を維持。

## Availability / preference

利用可能数は各detached snapshotの実Voicingから算出する。0/Nはaria-disabledでfocus/activation可能、選択を変えず中立説明を表示。説明×は表示だけを閉じる。開いた直後の自動警告なし。X/Nはカバレッジを表示しP11-03の補完を使用する。

前回Sourceは進行IDごとのversioned localStorage（最大50進行、IDとselectionのみ）へ保存し、まだ利用可能なら復元する。消失Sourceはhandoff初期優先順位へ戻す。Vault v2変更なし。保存した音N/N→元MIDIN/N→カスタムN/N→自動生成のhandoff優先順位を維持。

## 最終ラベル実測（高さ1080）

| viewport | row実幅 | Source | 生成タイプ/詳細 | 表示/option | 行数 |
|---:|---:|---:|---:|---:|---:|
| 1920 | 1614 | 396.3 | 250.7 | 703.1 | 1 |
| 1600 | 1294 | 396.3 | 250.7 | 257.8 | 1 |
| 1444 | 1138 | 396.3 | 250.7 | 257.8 | 1 |
| 1366 | 1060 | 396.3 | 250.7 | 257.8 | 1 |
| 1280 | 974 | 396.3 | 250.7 | 257.8 | 1 |
| 960 | 838 | 396.3 | 250.7 | 257.8 | 2 |

既存container 1500px以下のoptionラベル省略とflex-wrapを再利用。1444px画像を視覚確認。指定6幅にページ横overflowなし、重大/深刻axe違反なし。スクリーンショットとgeometryはgit-ignored `test-results/p11-header/`。p89 screenshot runnerはgallery対象が主であるため、この画面の既存product harnessに専用specを追加した。

## Gate

focused view/preferences 62/62 PASS。新header+既存compact/UI 14/14 PASS。移行した既存P5.20/27/28/30/31/33は27件PASS後、文言/hidden詳細controlの旧測定2件を修正して再確認。FEATUREは84/84 Vitest、11/11 Playwright PASS、49.2秒、cache不使用。App/E2E TypeScript、changed ESLint、class/source lint PASS。最終FULLで全product pathを再確認する。
