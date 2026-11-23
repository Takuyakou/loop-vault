# v3.1.0 公開内容の確認

対象はローカル `master` の `4c4097a2` から作成したリリース。公開側の比較元は v3.0.0 `57368f7c`。

| 公開側にだけ残っているファイル | 扱い |
|---|---|
| `src/components/capture/ExtendedTextIntakePanel.tsx` | P24-05でテキスト取り込みを一本化し、新しい入力へ置き換えたため削除。 |
| `src/components/capture/ExtendedTextIntakePanel.test.tsx` | 旧パネルのテスト。一本化後の入力は `TextProgressionCapturePanel.test.tsx`、`e2e/p24-05-text-unified.spec.ts` などで検証。 |
| `src/components/capture/StandardTextScoreWorkspace.tsx` | 一本化に伴い標準専用ワークスペースを廃止。スコア表示は新しいプレビューを使用。 |

| 確認対象 | 扱い |
|---|---|
| 追跡ファイルの開発機パス | P24連続報告で開発機の作業場所を `<作業フォルダ>` に置換。既存の架空のテスト用パスは保持。 |
| P24で変わった画像 | ホームとChord DojoのWindows用基準画像2枚を目視確認。製品画面の合成例で、実機名・個人の進行名・パス表示はない。 |
| P24の報告・比較スクリプト・生成JSON | `P24-v31.md`、`P24-07.md`、`scripts/p24-00/` を確認。比較スクリプトとJSONはリポジトリ内のテスト例、入力例、合成コーパスの比較資料。 |
| 機器名・メール・他サイト名 | 既存の合成テスト、公開済みの報告、製品機能の出典や検査用の単語を確認。今回加わる箇所は追跡ファイルから確認した。 |
| MIDI・音声・動画 | 追跡音源はライセンス付き Salamander Piano 8個と FreePats Bass 25個。v3.0.0から追加なし。 |

P24-00調査報告は候補の追跡ファイルに含まれません。個人のAppDataは確認対象にしていません。
