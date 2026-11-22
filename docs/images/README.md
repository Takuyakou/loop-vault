# README用スクリーンショット

## v3.0.0 用画像（2026-11-22 撮影）

`README.md` および `README.en.md` 用の画像は 2026-11-22 に、local `master`（`0b7180c5`）の production frontend ビルド（`dist/`）を Playwright で起動して撮影しました。
専用の新しいブラウザコンテキスト（`1440×900`・ダークテーマ・`ja-JP`）とメモリ内 Vault を使い、通常の操作（合成 MIDI のドラッグ＆ドロップ解析・テキスト入力・Vault 保存・画面遷移）だけで表示しています。実 Vault・個人 MIDI・録音・機器 ID・個人パスは一切使用していません。
`v3-chord-dojo.png` と `v3-bass-practice.png` は、P23-67（見出しの整理）のあと local `master`（`6a857dfb`）で、同じ撮り方で撮り直しました。

| 画像 | 内容 |
| --- | --- |
| [v3-voicing-loop.png](v3-voicing-loop.png) | 合成 MIDI から保存した 4 小節進行（Cmaj7–Am7–Fmaj7–G7）の Voicing Loop 画面（現在/次/その次のコード、左右運指、次への動き、88 鍵盤） |
| [v3-home.png](v3-home.png) | ホーム画面（今日のループ、ミニピアノロール、続きから、最近入れた進行、取り込む・練習・自分の引き出し） |
| [v3-correction-workspace.png](v3-correction-workspace.png) | 合成 MIDI（8 小節、和音＋ベース 2 パート）解析後の修正作業場と 1〜4 小節の保存範囲選択 |
| [v3-vault.png](v3-vault.png) | 合成データ 4 件を保存した Vault 画面（キー帯、検索・絞り込み、右プレビュー、DAW ドラッグ） |
| [v3-chord-dojo.png](v3-chord-dojo.png) | Chord Dojo ホーム（定番の進行、2-5-1 Master、耳で弾く、ボイシングドリル、ガイド練習 Lv1〜総合、今日のおまかせ） |
| [v3-bass-practice.png](v3-bass-practice.png) | Bass Practice ホーム（聴いてまねる 4 種、MIDI のベースライン、楽器・指板設定） |

---

## v2.0.0 用画像（過去のリリース参照用に保持）

日本語READMEのv2.0.0画像は2026-10-03に、検証済みproduction frontend（build code `d70623ae`）からPlaywrightで撮影しました。
専用の新しいブラウザコンテキストとメモリ内Vaultを使い、通常の取り込み→解析→保存→練習操作で表示しています。galleryやfixture専用routeは使っていません。

| 画像 | 内容 |
| --- | --- |
| [v2-correction-workspace.png](v2-correction-workspace.png) | MIDI解析後の修正作業場と保存範囲 |
| [v2-vault.png](v2-vault.png) | 合成MIDIから保存した進行と検索・絞り込み |
| [v2-voicing-loop.png](v2-voicing-loop.png) | 元MIDIを選択した練習画面、左右の運指・次への動き・鍵盤 |

撮影サイズは1600×1000です。これはREADME用の撮影条件であり、製品の必須解像度ではありません。

自作した8小節のC–Am–F–Gを、和音とベースの2パートで入力しました。表示名・タイトルも撮影用です。
実Vault・個人MIDI・録音・機器ID・個人パスは使用していません。画像の加工やUIの差し替えはしていません。
解析準備の完了と保存状態を待ち、通常の閉じる操作で通知を閉じてから撮影しました。

既存の `hero.png` 等は過去の画像です。過去のリリースノート等からの参照を壊さないため残しています。
