# Chord Dojo — 表示・試聴・判定の整合性修正

## 状態と検証対象

- 日付：2026-10-14。
- 作業ブランチ：`fix/chord-dojo-no-split`。
- 修正前：`a51e97d2ac9c7e013e270ed2698a1169670ef5d9`。
- 最終コード／fresh FULL対象：`06d3b26c5356493342e12560713dac93288eb9d4`。
- 今回はmerge / push / tag / releaseを行わない。
- private MIDI・実Vault・実演奏ログは読み取っていない。以下のノート列は、製品経路を再現するために独立して作成した公開安全な合成fixtureであり、私的スクリーンショットからの採譜ではない。

Git上では、前回の長尺進行・一覧UI・テーマ部分記録・旧section記録保護は既にlocal master `75e383612044b2fca460db1664bcb13e86c7181c`へ統合済み。今回の開始treeはそのmasterと同一だった。「長尺対応のmerge前」という依頼文との違いはこの履歴で説明される。履歴を戻さず、今回の追加修正だけを専用ブランチに保持する。phase12.0の既存execution-stateは古い別ブランチの段階情報なので、今回のHEAD証拠には使用しない。

## 1. ROOT CAUSE

表示側は`collectVault`が選択した保存音を`target.notes`として、鍵盤・楽譜・カード試聴へ渡していた。一方、`session.targetFor`の通常進行は「alteredかつsourceあり」以外を`core`判定にしていた。通常の保存Bm11も`core`となり、`judgeChord`が`buildPracticeChordRequirements(chord, 'normal')`でコード記号から必須pitch classを再生成した。保存音の省略を無視し、表示されていない短3度Dを要求する経路が成立していた。

さらに、固定されたテーマの主進行／副復習と、テンポ中の各コードで正解ポリシーの選び方が異なっていた。テンポ中は別のinline条件を使い、入力受付の必要音数を初期Targetから作る箇所もあった。保存音と生成音が混在する場合、判定モード・受付音数・React cursor更新による入力リセットが一致しない可能性があった。

関係箇所：

| ファイル | 関数／経路 | 問題・役割 |
| --- | --- | --- |
| `src/domain/chordDojo/collect.ts` | `collectVault` | saved → source-midi → customの既存優先順で保存ノートを選ぶ。なければ既存previewを生成 |
| `src/domain/chordDojo/session.ts` | `targetFor` | 通常進行／固定snapshotで判定ポリシーが不一致 |
| `src/domain/chordDojo/judging.ts` | `judgeChord` / `requiredCount` | coreではコード構成要件を使う。D不足のfeedback発生箇所。関数自体は変更しない |
| `src/domain/practice/chordRequirements.ts` | `buildPracticeChordRequirements` | Bm11の構成音練習でDを必須とする既存契約。変更しない |
| `src/views/chord-dojo/ChordDojoView.tsx` | Target表示・カード試聴・tempoのarm/close | 保存音の表示／試聴に対し、tempoだけ別の判定条件・初期必要音数を使用 |

## 2. 修正前後の音と判定

独立fixtureのChordSymbolは`root=11`、`quality=min11`、`tensions=[]`、`bass=undefined`、ラベル`Bm11`。移調なし。同じコードidentity・保存MIDIを維持し、パース・異名同音・オクターブ変換で成功扱いにはしない。

| 地点 | 修正前 | 修正後 |
| --- | --- | --- |
| 保存された合成ボイシング | `[59,69,73,76,78]` | 同じ |
| 楽譜／鍵盤に渡すノート | `[59,69,73,76,78]` | 同じ |
| カード試聴の予定発音ノート | `[59,69,73,76,78]` | 同じ。native WebAudio観測で確認 |
| 実際に注入・受信するMIDI | 同じ5音のNote On/Off | 同じ。鍵盤のguide-and-held表示も独立比較 |
| 判定 | coreが必須PC `[2,4,9,11]` を要求し、D不足 | 保存ノートとのexact一致で合格 |
| 保存音から73だけ欠落 | 保存音を基準にできていない | 不合格、`D♭ がありません` |

欠落feedbackのD♭はC♯と同じpitch class。既存`NAMES`のflat表記を保持しており、音の取り違えではない。ノート73のオクターブ置換・余計な音もexactでは不合格となる。

## 3. 修正内容とモード別契約

共通`progressionTarget`を追加し、通常進行・固定テーマ・旧snapshot・テンポ各イベントから呼ぶ。表示・試聴のノートは変更せず、判定Targetの選択を統一した。

| 課題 | 正解ポリシー | 表示・試聴・不足音 |
| --- | --- | --- |
| 明示的なsaved / source-midi / customを持つ進行 | exact | 保存MIDIノート・音域を基準。省略音を追加しない |
| 通常の生成guideを使うVault進行 | core | コード構成＋指定bass、転回自由という既存契約 |
| builtin進行 | builtin定義のcore / shape | 既存教材契約を保持 |
| 登録単体Voicing | exact | 既存契約を保持 |
| コード構成音課題 | composition | 既存契約を保持 |
| source metadataを欠く旧Vault固定snapshot | guide自身をcoreが拒否する場合だけexact | snapshotノートを答えとし、source provenanceは捏造しない |

旧snapshotのsourceフィールドはoptionalであり、欠落が「保存音ではない」とは限らない。coreが提示音自身を不合格にする場合の共通保護を追加した。Bm11専用条件やquality例外はない。coreと整合する通常の生成guideはcoreのまま。保護はSource情報のないVaultガイドに適用し、builtinには適用しない。旧snapshot限定の判別ではないため、新しい生成guideでもcoreと自己不整合ならexactになる。

保存音のルール表示を`保存した音・元の音域で`、provenance不明のsnapshotを`表示された音・同じ音域で`とし、転回自由と誤案内しない。生成coreの文言は維持した。

テンポでは同期的に現在イベントのTarget・`requiredCount`・ChordEntryを作り、同じTargetで入力とclose判定を行う。新しいイベントをarmした後のReact cursor更新が入力を消さないようにし、MIDI接続変更・停止時には旧Targetを解除する。

Vault schema／fileVersion、MIDI解析Core、コードidentity、保存されたノート、移調、共有判定関数、Master教材、音声エンジンは変更していない。

## 4. 変更ファイル

- `src/domain/chordDojo/progressionTarget.ts`：共通正解ポリシー。
- `src/domain/chordDojo/session.ts`：Target作成を共通化。
- `src/views/chord-dojo/ChordDojoView.tsx`：テンポTarget／入力同期・ルール表示。
- `src/domain/chordDojo/displayJudgeConsistency.test.ts`：独立固定ノートによる回帰11件。
- `src/testing/dojoJudgeAnswers.ts`：製品生成関数に依存しない固定正解。
- `src/testing/dojoJudgeFixture.ts`：公開合成Vault fixture。
- `src/testing/p104ProgressionE2eFixture.ts`：既存fixture専用routeへ合成ケースを追加。
- `e2e/dojo-display-judge.spec.ts`：実render音を弾くE2E9件。
- `e2e/helpers/dojoPianoProbe.ts`：テスト内だけのnative WebAudio観測。

## 5. 検証

### 再現とfocused

- 修正前の新規テスト：9 FAIL / 1 PASS。`targetFor`を実際に通す再現を含み、修正後だけを見て原因を推定していない。
- 最終focused domain/view/データ保持：27 files、437/437 PASS。
- 関連E2E：127/127 PASS、3.4分。ただし旧snapshot保護・接続cleanup追加前の中間結果であり、最終HEADの代用にはしない。
- 最終focused E2E：9/9 PASS、1.3分。旧snapshotとMIDI再接続の最終変更を含む。
- 最終変更後のApp/E2E TypeScript・変更対象ESLint・`git diff --check`：PASS。

固定fixtureはmaj7 / m7 / m9 / m11 / dom7 / 9 / 13 / sus4 / 分数コード、5度・3度省略、ルートレス、テンションを含む14イベント。①見て弾く・②覚えて弾く・③テンポで弾くで同じ保存音を判定する。8/16/32/66小節の後半をunit/integrationで確認し、66小節の末尾14イベントでは実renderされた鍵盤音をE2Eで演奏して次へ進むことを確認した。

E2Eは固定期待音と楽譜・鍵盤を独立比較した後、実際の鍵盤DOMから読んだ答えをMIDI注入し、合格・Note Off後のadvanceを確認する。カード試聴は公共ピアノsampleとnative playback rateを観測し、製品が返すexpected配列の自己検証にはしない。生成Bm11では既存guide `[47,57,61,62,64,66]`に必須D=62が提示され、Dなしを不合格にすることも確認した。

公開builtin全12キー・2,448 variantsは提示音自身で合格することをbaseline監査済み。テンポ混在exact/core/exact、recall hint、真の不足音、余分音、音域違い、旧snapshot、MIDI切断→再接続→14/14再開も検証した。

### 独立レビュー

記録／domain reviewerとUI reviewerが別々に確認。通常／主テーマ／副復習／旧snapshot／テンポの経路、optional provenance、入力Targetの接続cleanup、独立音声probeを監査。source・generated・legacy画面を確認し、未解消P1/P2なし。最終報告の旧snapshot保護の適用範囲についても表現を訂正した。reviewer自身が全テストを実行したという意味ではなく、実行結果は上記と最終FULLを根拠とする。

### 最終fresh FULL

`06d3b26c`で`npm run test:full -- --fresh`を実行。PASS cacheは使用していない。

初回は全Vitest 4,479/4,479、runner contracts 27/27、lint／class／source contract／App・E2E TS／phase-doc／AI-handoff／privacy／production build／gallery exclusion PASS。repository-wide Playwrightは608 PASS / 4 FAIL / 0 UNRUN、加えてtest外のteardown error 2件。実行時間は26,517.0秒であり、通常の性能計測値として使用できない。

| 初回Playwright FAIL | 観測 | 判断 |
| --- | --- | --- |
| Master lower review scope / Mixed reload | `page.reload: net::ERR_NETWORK_IO_SUSPENDED`、30秒timeout | 約7時間の時刻断絶と一致する実行環境中断 |
| Master progression preview / Form restore | playing期待にidle、60秒teardown timeout | 同じ中断時刻に発生。Dojo原因と決めず復帰後に再検証 |
| P13.1 Bass録音結果 1920 | 余分な音1を期待し2 | masterでも報告済みの既存不安定性と同じ症状 |
| P13.1 Bass録音結果 1440 | 余分な音1を期待し2 | 同上。今回のPCM再解析による同一原因の証明とは扱わない |

初回ログと4件のtraceはローカルGit除外領域に保持。Bassの製品／録音helper／specへの今回差分は0で、別ブランチのBass修正を混ぜていない。初回FAILを消したり、ランダムな再試行成功で不安定性が直ったと扱わない。

環境中断の影響を分離するため、コード変更なしの同じHEADでfresh FULLを再実行した。再実行中だけWindowsの自動スリープを抑止し、終了時に解除済み。恒久的な電源設定、期待値、retry、timeoutは変更していない。

**復帰後の最終fresh FULL：PASS。tested HEADは`06d3b26c5356493342e12560713dac93288eb9d4`。**

| Gate | 実測 |
| --- | --- |
| repository ESLint | PASS、9.9秒 |
| class lint / source contracts | PASS、0.4 / 0.1秒 |
| E2E / App TypeScript | PASS、3.5 / 11.7秒 |
| phase-doc / AI-handoff | PASS、0.6 / 0.2秒 |
| privacy/security scan | PASS、1.2秒 |
| production build / gallery exclusion | PASS、8.4 / 0.2秒 |
| runner contracts | 27/27 PASS、0.1秒 |
| Full Vitest | 4,479/4,479 PASS、66.4秒 |
| repository-wide Playwright | 612/612 PASS、0 FAIL / 0 UNRUN、954.4秒 |
| git diff --check | PASS |
| FULL total | PASS、1,057.2秒、raw logs 38,553 B、PASS cache不使用 |

最終コードの通常Chord Dojo・長尺一覧・テーマ記録・旧section保持・2-5-1 Masterを含む全登録ブラウザテストが完走した。初回に失敗したMaster2件も再実行ではPASS。Bass2件も今回はPASSしたが、初回に観測した既存録音テストの不安定性は未修正であり、解消の証拠にはしない。

ローカルログ：`p12-generated/judge-full-final.log`（初回FAIL）、`p12-generated/judge-full-resumed.log`（最終PASS）。詳細はGit除外の`.local-evaluation/test-logs/2026-10-14T00-29-44-854Z-full.log`。合成画面は`p12-generated/dojo-display-judge/bm11-source.png` / `bm11-generated.png` / `bm11-legacy.png`。生成出力・trace・スクリーンショットをcommitしない。

本報告の追記はdocumentation-onlyであり、製品・テスト・runner・configはtested HEADから変更していない。文書追記後のphase-doc／AI-handoff／privacy／差分チェックも別途実行し、全PASS。最終文書commitとtested code HEADを混同しない。

## 6. 既存変更の保持と制約

- 前回の長尺全体保持、responsive一覧、テーマ部分による全体習熟度更新禁止、旧sectionの30日削除防止を変更していない。関連E2E／データ保持テストを含めて検証済み。
- Original PracticeはP12.5の別ブランチにのみ存在する。read-only監査では独立したjudge/storeを使い、今回変更したsession更新経路を呼ばない。統合版のOriginal Practice E2Eを実行したとは扱わない。P12.5ブランチ・未追跡成果物は保護した。
- 私的な元の14コード・実MIDIデバイス・OSスピーカー出力は今回直接確認していない。WebAudio検証は予定発音ノートの観測であり、音声の再録音による音響検証ではない。
- 保存音の練習はexactなので、同じpitch classでも別オクターブは不合格。生成coreの転回自由契約とは明示的に区別する。
- 旧snapshotでprovenanceを失っていても答えのノートは守るが、元のSource種別を復元・推定しない。
- local masterはcached origin/masterより179 commits先行、origin側だけのcommitは0。今回fetch／pushは行っていないのでremoteの最新状態を確認した値ではない。

## 7. 最終判断

**CHORD DOJO DISPLAY / JUDGE FIX = READY FOR MERGE REVIEW**

今回の表示・試聴・判定整合性修正は、再現・focused・関連E2E・独立レビュー・最終fresh FULLを完了。技術ゲート上はマージ可能な候補。ただし今回は人間の指示どおりmasterへmergeしない。既存Bass録音flakeと、私的ケース／実機の未検証範囲は上記の制約として残る。

## 8. 人間承認後のlocal master統合・EXE

2026-10-14、上記の停止後に人間から「マージしてexe」の明示承認を受け、local masterへ統合した。上記のmerge前状態・停止条件は履歴である。

- 承認された候補：`7f92b6b4c088c45c6829bcab96b842e7227bd26d`。
- merge前master：`75e383612044b2fca460db1664bcb13e86c7181c`、working tree clean。
- merge commit／EXE source：`72cabd89ec2c7d8c6131e9bdf35d1bba7aec4fb1`。
- no-ff merge、競合なし。merge treeは候補treeと完全一致。10ファイルの限定差分だけを統合した。
- masterでfresh実行：focused 18/18、長尺／部分記録／保存互換回帰31/31、関連Playwright17/17 PASS。
- masterでfresh実行：repository lint（class/sourceを含む）、E2E TS、phase-doc、AI-handoff、privacy/security、`git diff --check` PASS。App TS／production web buildは以下のEXE build内でPASS。
- repository-wide FULLはmasterで再実行していない。上記の全体4479/612 PASSはtested candidate code `06d3b26c`の証拠として区別する。
- `tauri build --no-bundle`、Cargo offline release build PASS。インストーラー生成なし。既存D内Rust cacheを再利用し、source／build／temp／EXE出力をDに限定した。
- EXE：`p12-generated/Loop-Vault-Chord-Dojo-72cabd89.exe`、x64、24,945,152 bytes。
- SHA-256：`1890A556FA9AEB3B88A3E33AEEEEA1512F320F2ADCC2C26F3098DEB4FE2E795A`。build元／コピー一致。
- production bundleのcommit markerは既存仕様の8桁`72cabd89`。gallery除外check PASS、Dojo／P104 fixture assetなし。fixture専用buildから本番buildへ戻してEXEを作成した。
- 実Vaultを開くEXE自動起動は行っていない。push／tag／releaseなし。他Phaseの変更を統合していない。

この追記はdocumentation-only。EXEの製品コードはmerge commitと同一であり、文書追記による再buildは行わない。
