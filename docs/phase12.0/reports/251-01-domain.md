<!-- phase-id: 12.0 -->
# 251-01 — Domain / Persistence

MIDI再抽出の48セル / 144 targetsをproduction固定データにした。ランタイム転調生成を使わず、元MIDIのオクターブを保持。`master251` optional sectionを既存strict Zod / atomic repositoryへ追加し旧形式も読み込む。cell keyはPitchClass 0–11で一意。sessionはセル・seed・mode・bpm・pausedを保存し、再開時はReadyからやり直す。

共通 `HeldChordSettler` は現在の物理held集合を判定し、通常ChordEntryを変更しない。staggerを許容しsettle中のextraも判定。CC64-onlyは除外。問題間のReady releaseと進行内共通音保持を区別。iiの必要NoteOn時刻からRecallを記録しsettleを除外。

習得はnew→learning→passed→master。80BPM・全3和音・ヒントなし・Recall目安以内の独立成功が別日に必要。MASTER初失敗はreviewDue、同日追加失敗では降格しない。別日再失敗でpassed、別日適格成功でreview解除。review中のMASTERは80BPMを保持する。

Policy初期値: settle60ms、部分和音timeout1200ms、成功feedback450ms、失敗reveal1600ms、次Form導入は前Form learning以上3セル（手動では全Form可）。Recallは独立成功3件未満5s、8件未満3s、以降最近20件の75%点×1.25（1.5–5s）。tempo ladder40/50/60/70/80、開始60、失敗時1段下降。次問予告は初期OFF（Ready前の先読みを避ける）。すべてUIへ埋め込まずpolicyに分離。

selectorはnew→最近失敗/review→遅いRecall→低tempo→古い練習、同順位だけseed shuffle。Source key順を持たず、C固定開始なし。通常weakKeys / normal ii–V–I / 記録は別扱い。

## 検証

- focused unit 30/30（Master15 + 通常Dojo15）PASS。
- FAST PASS: 129 Vitest /27 Node、ログ `.local-evaluation/test-logs/2026-10-05T03-49-24-324Z-fast.log`。
- 最新domain FEATURE PASS: 138 Vitest /27 Node、ログ `.local-evaluation/test-logs/2026-10-05T03-51-35-438Z-feature.log`。
- App / E2E TypeScript PASS。初回TypeScriptはJSON tuple型・ES targetのat/replaceAll・preview ChordSymbol必須fieldを指摘、互換表現に修正。初回FASTのgenerator Node global lintも修正後PASS。

251-02/03の実ブラウザ検証へ継続。現時点でhuman acceptanceは未実施。
