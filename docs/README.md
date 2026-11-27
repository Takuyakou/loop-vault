# Loop Vault のドキュメント

Loop Vault の設計と記録の案内です。最初にここを開いてください。
(English: this is the index of the design documents. The documents are written in Japanese.)

## どこに何があるか

| フォルダ | 中身 | 変わる時 |
|---|---|---|
| [`current/`](current/) | **今のアプリの正本**。機能・作り・データの約束・ボイシングの決まり・開発の手順(5 本) | リリースのたびに、変わった所だけ書き直す |
| [`designs/`](designs/) | **版ごとの確定した設計書**。なぜそう作ったかを振り返る時に読む | 版が出るたびに 1〜数本足す。足した後は変えない |
| [`contracts/`](contracts/) | **テストとアプリが読むファイル**(凍結した正解の表・しきい値・例のデータ) | 約束を変える時だけ。テストと一緒に変える |
| [`release/`](release/) | **リリースの記録**(リリースノート・検証・配布ファイルの値) | リリースのたびに 1 フォルダ足す |
| [`images/`](images/) | README の画像とデモ | 画面が変わった時 |
| [`security/`](security/) | セキュリティの方針 | 方針を変える時 |
| [`ai-handoff/`](ai-handoff/) | 作業を引き継ぐ時の入口 | リリースのたびに |
| [`archive/`](archive/) | **過去の記録**(v3.1.0 までのフェーズごとの文書・報告・古い評価の資料)。普段は見なくてよい | 変えない |

## まず読む物

1. [`current/features.md`](current/features.md) — 画面ごとに、何ができるか
2. [`current/architecture.md`](current/architecture.md) — フォルダの役割と、音・画面・保存の流れ
3. [`current/development.md`](current/development.md) — 起動・ビルド・テスト・検査のコマンド
4. [`designs/`](designs/) の新しい版から — 最近の設計の考え方

## 書き方の決まり

- 下書き・作業の指示・途中の記録は、リポジトリの外に置く。リポジトリに入れるのは、リリースの時に確定した設計書だけ(`designs/v3.x.0-<中身>.md`)。
- `current/` は 5 本のまま増やさない。
- docs の直下と `archive/` に、新しいファイルを足さない。
- この決まりは `npm run validate:docs-layout` が機械で確かめる(FULL のテストに入っている)。
