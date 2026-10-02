<!-- phase-id: 11.0 -->
# P11-11 — 生成代替・slash bass・再発音・左手運指

## 状態 / Git

実装candidate。最終fresh FULL / EXEは実行待ち。基準local master `1f18e880`、専用branch `fix/phase11-generated-bass-audio`。既存P11-09/10を維持し、同じD-drive checkoutを使用。並行するP10.1へ変更なし。保存済みorigin/masterとの差716 ahead / 0 behind（fetchなし）。実Vault/private MIDI未使用。master merge/push/tag/releaseなし。

## A. Unsupported shape fallback

ROOT CAUSE: basic-fullはP5.33 study generator、詳細shapeは限定されたlegacy degree規則 / rootless quality Setを使う。add9等は意図的な範囲外で、parserはroot/quality/bassを保持している。

選んだこと: `detailedFallbackStudy`をsession resolver optionとして明示し、生成不能イベントだけを選択中Teacher/基本またはCore/骨組みで単体解決する。支持済みlegacy候補をfallback optimizerへ入れない。fallback先はColor/Openを追加せず、詳細形でdisabledのmodifierを黙って適用しない。選択中のidentityとslash bassを保持する。

成功した代替は新しいsession-only `shapeFallback={from,study}`を持つ。固定Source欠落用の既存fallbackFromとは区別する。カードに既存A marker、title/accessible name「この形では作れないため『基本/骨組み』で鳴らしています」、上部に「Nコードは基本/骨組みで代替」。選択中の生成タイプへ追従する。Text/Vault保存schemaへのfield追加なし。

理由: legacy shell/rootlessの意味を再定義せず練習可能にし、実際の代替を隠さないため。別案: quality tableの拡張や固定Teacher fallbackは採用しない。

fallback chainは詳細形→選択studyまで。両方で制約を満たせないイベントは元のUNSUPPORTED_RULE / GENERATION_ERRORを保持し、代替markerを付けない。たとえば右手span=0のadd9は真に未対応。固定Source 0/Nや既存X/Nの契約は変更なし。

## B. Slash Bass

ROOT CAUSE: legacy basic-shell/full-shellは左手にBass+anchorを入れて音域列挙し、bassが最低かを制約せず最適化していた。Gを集合に含めるだけではDbが下に置かれる。

公開合成 `Eb7/G` の最終再生note番号:

| 経路 | 修正前 | 修正後 | 修正後のbass担当voice |
| --- | --- | --- | --- |
| basic-shell | 49,55 | 55,61 | 55 (G) |
| full-shell | 49,55,63,67,70 | 55,61,63,67,70 | 55 (G) |
| rootless-shell | 43,61,67 | 同じ | 43 (G) |
| left-hand A/B auto | 31,41,49,67,72 | 同じ | 31 (G reference) |
| 基本 | 43,63,70,73 | 同じ | 43 (G) |

選んだこと: candidateFactsでbass担当noteを確認し、そのnoteがallNotes最小値となる候補だけを採用する。選択後の全note移動や上部構成音の削除を行わない。explicit root-bassも担当voiceを保持。rootless-shellのexplicit root-bassは練習targetを変えず低いreference bassを別roleに置く。

理由: 既存register、手幅、hand crossing、duplicate/low-interval制約をすでに通過した候補から選べるため。別案: 全noteを上へ動かす、同じbass noteを追加複製する案は不採用。

7/maj7/m7/m7b5/6/6-9/add9 × root/3rd/5th/7th/9th/non-chord bass × legacy 3形 / left-hand auto/A/B / 基本・骨組みのColor/Open全組合せ（840条件）で、bass voice=min(playback)、pitch class、重複なし、両手span/registerを確認。minorのb3、half-diminishedのb5、dominant/minorのb7も含め、各qualityに対応したbassを使用。6/add9等の7th bassは意図的な構成音外bassも兼ねる。追加の既存baselineとの比較ではnon-slash **169条件が全結果一致**。Source/Saved/Customのnotesにはこの変更を適用しない。

## C. Playback click

### 修正前の経路比較

| 項目 | コードカード | 現在コード試聴 | 再開 / 最初から |
| --- | --- | --- | --- |
| View | selectTimelineCard→seekToEvent→auditionResolved(savedCardIntent=true) | auditionCurrent→auditionResolved(current plan) | resume / restart→transport |
| 音源 | transport.auditionの2-bank instrument + gain | 同じ2-bank | reference instrument + post-effects gain |
| notes | 保存card intent契約 | 現在の選択plan | 現在のplan |
| AudioContext | Tone.start | Tone.start | Tone.start |
| Tone Transport | ready/stoppedはseek不可、paused/playingではseekあり | 試聴自身はTransport非操作 | resume=start、restart=pause/position=0/clear/register/start |
| 発音 | releaseAll→triggerAttackRelease(2s)、5ms pre-attack/12ms gain rise | 同じ | triggerAttack / releaseAll（adapterによりattackRelease） |
| 前音 | seekがaudition bankをretire/disposeし、新規生成を誘発 | bank再利用、12ms fade | 出力gainの即時0/1、既存schedule clear |
| cancel / epoch | seekがpending eventをclear、audition generation更新 | audition generationが古いasync試聴を拒否 | schedule/projection/generation guard |

確認したROOT CAUSEは2つ。

1. paused card seekは試聴bankを毎回retireする。10回合成操作でreference/clickを含め**12音源生成**を修正前に実測。現在コード試聴はseekを呼ばないため2-bankを使い回す。retirement上限による早期disposeも発生し得る。ready/stoppedで同じnotes・音色なら両試聴はもともと共通であり、この差がすべての可聴clickを説明するとは断定しない。
2. reference closeの即時時刻はgain=0へのstep、openはgain=1へのstepだった。さらに同時resumeは最初の呼び出しだけtrue、後続がfalseとなり、ViewのlaunchRuntime fallbackで再構築し得た。concurrent restartもschedule再登録を重ねていた。

修正: seekで試聴bankを破棄せずfade/releaseして再利用。referenceとauditionで現在gainを保持する共通 `rampOutputGain` を利用。reference closeは3ms、openは5ms、auditionは既存5ms/12msを維持。長いcrossfadeなし。resume/restartの同時呼び出しは同じin-flight Promiseを共有し、false扱いの再構築・重複scheduleを防ぐ。sequential restartは各回処理し、epoch/count-in/Range/first attack契約を維持。

rapid test: paused seek+audition10回は4音源（reference/click/2-bank）、中途dispose0、途中retirement timer0、stop後node/schedule/timer解放。current audition10回の既存bank回帰PASS。resume10同時 / restart10同時は全true、restartのstart1回。sequential restart10回のschedule数は初回と一致。dispose済node再利用・例外を検査。

可聴clickは人間の耳で未確認。OfflineAudioContextの波形fixtureは作っていない。Mockはgain step除去・resource lifecycleを検証するが、Sampler/WebAudioの実出力のsample jumpを証明しない。最終EXEで同じSource/コード/音色・お手本音量のまま、card連打、現在コード連打、一時停止→再開、最初からを聴き比べる。cardの保存intentとcurrent generated notesを同一視しない。

## D. 左手運指

単音BassのL5偏重は実装上の意図されたprior。generateFingeringCandidates→preferredFingersはLH単音[5] / RH単音[1]を優先する。rankerは候補と進行遷移を使うため、任意に指を散らさない。今回公開合成で以下を実測:

| 手 / 音数 | MIDI notes | internal finger | UI label |
| --- | --- | --- | --- |
| LH 1 | 43 | 5 | L5 |
| LH 2 | 43,47 | 5,1 | L5,L1 |
| LH 3 | 43,47,50 | 5,3,1 | L5,L3,L1 |
| LH 4 | 43,47,50,53 | 5,3,2,1 | L5,L3,L2,L1 |
| RH 1 | 60 | 1 | R1 |
| RH 2 | 60,64 | 1,5 | R1,R5 |
| RH 3 | 60,64,67 | 1,3,5 | R1,R3,R5 |
| RH 4 | 60,64,67,71 | 1,2,3,5 | R1,R2,R3,R5 |

rankFingeringsForHandはhand assignmentの各noteをrankCyclicFingeringsへ渡す。effectiveFingeringはphysical pitch signatureが一致する個人保存運指だけを優先。fingerSummaryとkeyboard mappingは各indexのfingerを使い、定数L5への変換はない。serialized personal fingersもhand/pitch signatureで独立。

「複数左手音が全L5」バグは公開fixtureでは再現しない。Sourceの動的hand partitionは音域/手幅/個人設定で選ぶため、固定SourceでもLHが1音となる場合がある。Generated slash基本は実際にbass1音だけLHなのでL5になる。

今回の必要変更: left-hand形からTeacher/Coreへ代替したeventは、generatorが持つ左右hand assignmentを使用する。legacy left-hand選択名だけを見て代替の全notesを左手へ押し込まない。ranker自体・個人運指保存形式は変更なし。Source/shape切替の再計算・個人運指編集/保存/resetは既存回帰とUIで検査。

## E. Gate / 変更範囲

- 最初の新規domain試験: 9 FAIL / 1 PASS、修正前にfallbackとbass欠落を確認。
- 新規audio原因固定: 2 FAIL（bank生成12、同時resume結果false）、修正後PASS。
- focused: 8ファイル366/366 PASS。
- FEATURE（View owner、fresh）: Vitest100/100 + Playwright11/11 PASS、62.9秒。
- UI初回: 23 PASS / 1 FAIL。新規testが製品の「再開」を「再生再開」と呼んだlocatorミス。実DOM/traceで確定し、製品ラベル変更やtimeout延長をせずselectorを修正。
- 追加UI再確認: 2/2 PASS。関連UI最終確認: 24/24 PASS（Range / Space / 320px / geometry / P8.8.4 / accessibilityを含む）。
- 最終focused: 6ファイル293/293 PASS。最終FULL / EXE: 実行待ち。
- desktop screenshotを目視し、上部代替集約、カードA marker、左右カード、compact info strip、次への動きを確認。1920/1440のcurrent panel scrollHeight<=clientHeight+1を自動確認。960/768既存geometryもPASS。

主要変更: voicingResolution/types、fingeringDisplay、ProgressionVoicingTransport、ProgressionVoicingPracticeView、および独立domain/View/Transport/fingering tests、公開E2E fixture/spec。Analyzer/Identity/Decoder/Parser/Vault schema/固定notes/Phase10へ変更なし。

remaining limitations: 音切れの最終可聴確認はHuman Acceptance。新しいshape semantics・quality table一般化・音楽理論logicは導入していない。unsupported remains visible。private witnessをtuningや診断に使用していない。
