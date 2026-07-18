# Loop Vault Progression Taxonomy v1

この文書は、保存済みコード進行を分類する安定IDの仕様です。表示言語が変わってもIDは変更しません。

## 基本ルール

- taxonomy versionは`1`です。
- IDは`category.name`形式のASCII小文字を使います。
- 自動タグは`data.json`へ保存しません。
- 手動タグと、自動タグの抑制情報だけを保存します。
- Keyが必要な分類は、Key不明時に付与しません。
- Verse / Chorus / Bridge / Endingは自動判定しません。
- MoodはPhase 3.7.1 S5で品質を評価するまで自動判定しません。

## Source

| ID | 日本語 | English | 自動判定根拠 |
|---|---|---|---|
| `source.midi-capture` | MIDI採集 | MIDI Capture | MIDI由来の保存メタデータ |
| `source.live-midi` | Live MIDI | Live MIDI | `origin: live-midi` |
| `source.chord-drip` | Chord Drip | Chord Drip | 明示メタデータまたはanalyzer名 |
| `source.manual` | 手動 | Manual | 外部取得元なし |

## Harmonic Feature

`feature.maj7-9`、`feature.minor9-11`、`feature.slash-bass`、`feature.diminished`、`feature.augmented`、`feature.altered`、`feature.dominant-heavy`、`feature.secondary-dominant`、`feature.diatonic`、`feature.chromatic`、`feature.modal-mixture`を定義します。

`secondary-dominant`、`diatonic`、`chromatic`、`modal-mixture`はKeyがある場合だけ判定します。

## Use

自動判定対象は`use.intro`、`use.main`、`use.turnaround`、`use.variation`、`use.loop`、`use.vamp`です。`use.verse`、`use.chorus`、`use.bridge`、`use.ending`は手動専用です。

## Mood

`mood.bright`、`mood.dark`、`mood.dreamy`、`mood.warm`、`mood.tense`、`mood.mysterious`、`mood.floating`、`mood.dramatic`を予約します。v1のS3では自動付与しません。

## Suppression

ユーザーが自動タグを非表示にすると、`tagId`と抑制時の`taxonomyVersion`を保存します。同じIDが将来のtaxonomyにも存在する限り抑制を維持します。廃止IDもデータから勝手に削除しません。
