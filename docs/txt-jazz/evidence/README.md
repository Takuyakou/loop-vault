# TXT-JAZZ Stage 00 調査証拠

対象コード: `21d4828d0d62b35da574a2a32e3c2bfa39eea3a9`。合成トークン・合成進行を現在の製品関数に渡した出力のみを格納する。実Vault・個人MIDI・音声・device id・個人パスは扱っていない。

| 証拠 | 内容 |
| --- | --- |
| [setup-worktrees.json](setup-worktrees.json) | 開始時全25worktreeのHEAD/変更有無。外部の個人パスは匿名化 |
| [parser-current-tokens.json](parser-current-tokens.json) | 103unique入力の通常/拡張結果、全構造・label・診断位置、19正規化・24移調 |
| [parser-regression-before.json](parser-regression-before.json) | 全507既存unit実行中の5parser関数217,481呼び出しをlossless圧縮保存。decoded input/options/output全件を復元可能 |
| [consumers-evidence.json](../consumers-evidence.json) | 合成9構造の保存/export/import、試聴、消費側、Study8組/legacy5/fallback4、12キー移調、alt候補の損失反例 |

全結果の読み方と限界は[統合報告](../reports/TXT-JAZZ-00-stage00.md)、[解析監査](../reports/parser-audit.md)、[既存回帰監査](../reports/parser-regression-audit.md)、[consumer監査](../consumers-audit.md)を参照。

- baseline SHA-256: `1DAA4AEE1D77028D75DBDF0AB5441166EDA02BF04E58AA80F481C1BA4329F043`。
- v3受領仕様の無変更コピー SHA-256: `A9F1E7723D28B5E6FE8D459C766A0249CC825996E4EAB6249166B6A7FF04B9AB`。
- consumerの hypothetical altered / label-only は未対応分類を診断用に渡した入力で、alt解析成功や新実装の合格ではない。
- probeのassertion PASSは現在の非対応・情報損失を含む挙動を記録したことを示す。
- 文書final commitでruntimeを再実行したとは主張しない。製品コード・既存テスト・依存定義は変更していない。
- 調査用一時scriptは担当者が自分のファイルだけ除去し、証拠出力を残す。
