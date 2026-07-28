# P4.3-08 Real MIDI Review Pack

## Automated baseline

**complete**

対象:

| Source | bars | full timeline | review events | usable | review | not-found |
|---|---:|---:|---:|---:|---:|---:|
| Endless | 154 | 236 | 12 | 2 | 9 | 1 |
| SURAN | 100 | 168 | 12 | 2 | 9 | 1 |

合計24 eventsを曲全体から等間隔に選出した。

## Pack内容

各eventに次を含む。

- source aliasとbeat range
- `phase4-v1` detected chord
- Source-faithful抽出
- Aggregate-harmony抽出
- Dojo-integrated派生
- generated fallback
- MIDI note number / note name
- 61鍵のハイライト用data
- A/B/C/F試聴
- reviewer判定欄

ローカル成果物:

```text
.local-evaluation/phase4.3/real-midi-review-pack.json
.local-evaluation/phase4.3/real-midi-review-pack.html
```

HTMLはA Source、B Aggregate、C Dojo、F GeneratedのWeb Audio試聴と
鍵盤ハイライトを備える。

## Human review

**deferred / pending**

自動集計では両曲とも12 event中、usable 2、review 9、not-found 1。
合成Gold外で自動採用率が低い事実は確認できるが、どの配置が音楽的に正しいかは
聴覚確認前に断定しない。

Phase 4.3の測定基盤完了は止めない。Phase 4.4でmelody contaminationを
改善する前に、この24 eventのA/B/Cレビューを行う。

## Privacy

- MIDI本体をGitへ追加しない
- 絶対パスをreportへ保存しない
- 実MIDI由来のnote列全文は`.local-evaluation`だけに保存
- tracked文書にはsource aliasと集計値だけを記録

生成CLI: `scripts/build-phase43-real-midi-review-pack.ts`
