# Phase 5.16.1 Playback / Sing Report

## 結論

Degree Echo playbackは既存global `PlaybackController`とTone graphを再利用し、exercise timelineを唯一の正とした。componentごとのAudioContext、Live MIDI input、microphone、recording、fake input meterは追加していない。rapid replay、stop、mode/route leave、disposeは所有する再生とtimerを解放する。

## Singing contract

- Listen 1、optional Listen 2、Solo Singの順序をstate machineで固定
- dwellは`clamp(phraseDuration * 0.8, 1,000 ms, 8,000 ms)`
- dwell前の`歌えた`はdisabled
- skipは明示可能で、`singSkipped=true`かつindependent successはfalse
- Auto / Original / +1 / +2はreference octaveだけを変え、bass answerを変えない
- attemptへreference settingとresolved shiftをsnapshot

## Release Gateで修正した不具合

Windows timerがdeadline直前に発火した場合、旧実装は1回だけnotifyし、残り時間を再scheduleしなかった。その結果`歌えた`がdisabledのまま残る可能性がfull Playwright並列実行で再現した。

残り時間が正なら再scheduleし、deadline到達後だけnotifyするよう修正した。early-fireを1 ms手前で再現するunit testを追加し、full Playwright 2-workerでも解消を確認した。

## Gate evidence

| Gate | Result |
|---|---:|
| DegreePracticeSession | 18/18 PASS |
| Degree playback mapping | 4/4 PASS |
| global PlaybackController | 8/8 PASS |
| chord/note preview lifecycle | 6/6 PASS |
| full Degree flow with real dwell and Transfer | PASS |
| route leave active-handle delta after 1,000 iterations | 0 |
| microphone / recording API scope grep | 0 production matches |

P5.16.1-05のtracked benchmark scriptで、Playback adapterの`startListen()`を1,000回呼ぶworkloadは9 runでmedian 0.9808 ms、p95/max 1.9163 ms（medianの償却値は1 startあたり0.0009808 ms）。session setup/disposeとaudio device latencyは含まず、既存controllerへscheduleを引き渡すapplication overheadだけを測った。Stage-localのper-call一時測定ではなく、この1,000-call batchのfinal release sessionを正とする。生値とharness境界は`05-runtime-memory.md`に固定した。
