# P4.3-03 Voicing Gold Corpus Integrity

実行:

```text
npm run eval:p43:corpus
```

## 結果

全検査PASS。

| 項目 | 結果 |
|---|---:|
| corpusVersion | 1.0.0 |
| MIDI | 60 |
| scenario | 30 |
| Gold event | 496 |
| note instance / JSONL row | 6382 / 6382 |
| SHA-256一致 | 60 / 60 |
| byteLength一致 | 60 / 60 |
| clean/stress pair | 30 / 30 |
| Gold policy 3種完備 | 496 / 496 |
| dev / validation / holdout | 40 / 10 / 10 |

representationType:

- simultaneous: 460
- aggregated: 16
- hybrid: 16
- none: 4

## Split規律

同一scenarioのclean/stressは同じsplitにあり、複数splitへ跨るscenarioは0。
P4.3-03では整合性metadataだけを確認し、holdoutの抽出評価は実行していない。

## Private data

コーパスはローカルのignore領域から読む。検証reportへ絶対パスは保存せず、
MIDI bytes、MIDI名以外のホスト情報、音符列全文も保存しない。
`scripts/verify-phase43-voicing-corpus.ts` は`--corpus`で配置場所を受け取れるため、
MIDI本体をGitへ移動する必要はない。

JSON結果: `docs/phase4.3/03-voicing-corpus-integrity.json`
