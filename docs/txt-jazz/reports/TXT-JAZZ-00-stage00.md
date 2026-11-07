# TXT-JAZZ-00 — Stage 00 調査報告

状態: Stage 00 調査完了。Stage 01 は人間の判断待ちで未承認。alt の表現は選択していない。製品コード・既存テスト・schema・依存定義を変更せず、現在の関数に合成入力を渡して調べた。

`Cm(maj7)` と alt が読めないという主要な前提は確認できた。一方、**現在の取り込み上限、既存の正準表示、消費側の必要情報、生成音の出どころ、登録音が無い場合の表示**には仕様と相違がある。alt は A 案が技術的な候補となるが、印を足すだけでは旧EXE互換も消費側の安全も成立しない。

詳細な根拠を [解析監査・103入力の全表](parser-audit.md)、[既存入力の凍結](parser-regression-audit.md)、[保存・試聴・消費側監査](../consumers-audit.md) に分けた。これらは本報告の付属資料である。

## 1. Git の実態と調査範囲

- 開始点: local master `21d4828d0d62b35da574a2a32e3c2bfa39eea3a9`
- 調査ブランチ: `feat/txt-jazz-stage00`
- cached origin/master に対する local master: behind 0 / ahead 163（fetch なし）
- 元の master 作業ツリーは clean。他ブランチ・worktree・既存成果物は保護する。
- 専用 worktree 作成後の保護記録: 全25 worktree の HEAD・変更有無を読取りで確認（25/25 読取り成功、clean 19、dirty 6）。[匿名化した一覧](../evidence/setup-worktrees.json)。dirty の内容は既存作業として保持し、変更・整理・stash は行わない。
- root は `feat/p537-union-chimera-production` `d3ccb86f6707436bfe872b97ae861cc71f56ecdc`、既存変更153エントリを保持。P12.2 は `feat/p12.2-master-fixes` `57c22e0f1f98b88612e2d9e34e2ff9338db0d6eb`、clean を確認。
- cached `origin/master`: `65593f759e77d7863e625aa258d5855a9f827506`。remote の現在値は fetch していないため未確認。
- 受領 v3 仕様のコピーは byte 一致。SHA-256: `A9F1E7723D28B5E6FE8D459C766A0249CC825996E4EAB6249166B6A7FF04B9AB`。添付元の個人パスは記録しない。
- root の人間指定 AGENTS はマージごとの人間承認を要求する。開始点の追跡 AGENTS は standing authorization の記述だが、人間の指示が優先する。今回の仕様は Stage 00 で停止する。
- `docs/phase12.4/` と対応 execution-state は存在しない。P12.4 資料は `docs/reports/` に存在する。

## 2. 仕様 §2.2 の九項目の事実

パスはリポジトリ相対、数字は根拠となる開始行。詳細の呼び出し経路・測定値は各監査資料を参照。

| # | 実態 | 根拠 |
| --- | --- | --- |
| 1 minMaj7 | 型と Zod に既存。追加不要。alt quality/印は存在しない | `src/domain/types.ts:31`、`src/domain/schema.ts:21` |
| 2 tensions | `9,b9,#9,11,#11,13,b13,#5`。対象の明示テンションは表せる。alt sentinel は無い | `types.ts:35`、`schema.ts:49` |
| 3 label | Vault に保存するが、構造から再生成する経路が多数ある。拡張直読みは元綴りを保持し、通常は正準化する | `schema.ts:99`、`chords.ts:211`、`textProgression.ts:842`、`extendedTextProgression.ts:286`、`practiceTransposition/transposeChordSymbol.ts:95` |
| 4 任意field | strict schema の現readerは未知 `altered:true` を拒否し、属するidea全体を quarantine。任意fieldを理解する新readerが旧field無しを読む方向は設計可能 | `schema.ts:92,465`、consumer証拠の `representation` |
| 5 共有parser | 通常・拡張とも `parseTextChordLabel` → `parseChordLabelWithPolicy(...,true)`。legacy/MIDI parser は false 側で語彙を分離 | `chords.ts:278`、`textProgression.ts:630`、`extendedTextProgression.ts:286` |
| 6 comma | 上位のtoken区切りではない。括弧内comma/spaceはfactor区切り。`C7(b9,#9)` は1tokenで成功 | `textScoreTokenizer.ts:12`、`chords.ts:227` |
| 7 slash | bassは末尾の音名だけ。`C6/9` は `sixNine`、bass無し。`C69` / `C6(9)` も同じ意味 | `chords.ts:295`、`chords.ts:70,94` |
| 8 正規化 | 共有部はroot/type空白処理。拡張だけ全角ASCII・♭♯等を正規化。通常と拡張に13入力の可否差。19入力で両normalizerは冪等だが、未変換の文字が残ることも含む | `textScoreTokenizer.ts:92`、`extendedTextProgression.ts:316`、parser証拠 `normalization` |
| 9 推奨音の由来 | `practiceVoicingOverride` の `source:"manual"` + `extractorVersion:"text-style-v1:<style>"` で識別。MIDIは `midi-extracted`。アプリ生成専用source enumは無い | `textProgressionVoicing.ts:62,82`、`docs/phase11.0/P11-02.md` |

## 3. 全表記の作業前解析結果と既存回帰の凍結

### 3.1 103入力の全表

仕様 §4 の全表記、§10.1 の25行、人間確認進行の12token、正規化の追加例を合併した **103 unique入力**を通常・拡張の実parserへ渡した。

| 方言 | 正しく読める | 読めない | 意味の誤読 |
| --- | ---: | ---: | ---: |
| 通常 | 57 | 46 | 0 |
| 拡張 | 58 | 45 | 0 |

**全103行の root / quality / tensions / alt / bass / label と分類は [解析監査の全表](parser-audit.md)**、診断の位置・原token・入力全体・共有core・構造からの表示・正規化・12キー移調は [parser-current-tokens.json](../evidence/parser-current-tokens.json) にある。部分的にG7だけ読めた `G7 alt` は変換不可であり、成功には数えない。C群で挙動を維持する `Cdim` は `dim` として成功する。

- A群にも既に読めるものがある。通常は `CmMaj7` / `C-maj7` / `CminMaj7`、拡張は `CmMaj7` / `CminMaj7`。主要な括弧形、`CmM7`、alt は不可。
- `G7(b9,#9,b13)` は両方で root7 / dom7 / [b9,#9,b13] / bass無し、明示テンションのまま保持する。altへ置換しない。
- 既存の `C9` / `C7(9)` は dom9、`C13` / `C7(13)` は dom13、`C6/9` / `C69` / `C6(9)` は sixNine。仕様表との字面は異なるが意味等価であり、誤読扱いにはしていない。minor/m7/m7b5/m6 は現型では min/min7/min7b5/min6。
- 通常と拡張はダッシュminor・Unicode/full-widthの扱いが異なる。両方の統一を今は実装していない。
- 人間確認進行は個別tokenなら通常6/12、拡張9/12が通るが、**進行全体はどちらも変換不可**。`Cm(maj7)` 2箇所と `G7alt` が両方で失敗。通常はUnicode flat根音3個も失敗する。仕様§10.1に欠ける `Fm7` / `E♭maj7` / `A♭maj7` は全表へ追加した。

エラー位置の例: `| Cm/maj7 |` は通常 range[2,9)、拡張span[1,10)・line1/column2。`| G7 alt |` は通常altの[5,8)、拡張は小節全体[1,9)。位置付きで拒否しているが、拡張の診断単位はaltだけではない。

### 3.2 既存入力の凍結

変更前コードの全tracked unit files **507/507**を実行し、既存parser 5関数の **217,481呼び出し**について input/options/output を呼び出し時点でdeep snapshotした。ファイルごとuniqueは20,224、全体uniqueは14,537。Vitestは **4,285/4,285 PASS、0 fail/skip/todo、exit0、112.1s**。

[凍結証拠](../evidence/parser-regression-before.json) は lossless deflate + base64 で全呼び出しを復元できる。展開後10,945,826 bytes、圧縮JSON1,976,675 bytes。SHA-256: `1DAA4AEE1D77028D75DBDF0AB5441166EDA02BF04E58AA80F481C1BA4329F043`。仕様の103入力だけを既存入力の全てと見なしていない。採取方法・完全性・不採用の旧capture・再現上の限界は [回帰監査](parser-regression-audit.md) に記録する。

この証拠は Stage01 の差分比較用。今回は製品変更が無いので、変更後の同一性や新機能受け入れを認定したものではない。

## 4. 表示・移調・保存互換と alt 候補 A/B/C

現在の共通表示は `chords.ts:211`。quality辞書・tension固定順・括弧commaで構造から作る。minMaj7は `CmMaj7`、+9は `CmMaj7(9)`。通常の取り込みはこの正準形、拡張直読みは正規化した入力labelを保持する。移調には別formatterがあり、明示テンションが括弧無しになる経路もある。labelだけで意味を保持できない。

| 候補 | Stage00 の判定 | 互換性と必要な対応 |
| --- | --- | --- |
| A: optional `altered?: true` | **技術的に可能。未選択・未実装** | 新schemaを任意fieldとして拡張するlocal probeは旧field無し/newtrue双方を受理。ただし現reader/旧EXEはnewfieldのideaをquarantine。clone・移調・表示・editor・identity/fingerprint/cache・保存/export/import・lesson・全consumer境界を監査し、分類を落とさない変更が必要。fileVersion2のまま進める互換方針は人間判断 |
| B: labelのみ | **現条件では不可** | Vault往復はlabelを残すが、format/編集/移調/Context/Loop snapshotで再生成する反例あり。G7alt→G7/A7、全12キーで消失。既存identityもlabelを無視 |
| C: tensionsの特別値 | **現状態は不可。広い意味修正をすれば候補にはできる** | 現型/Zodのenum外。強制sentinelは音程lookupでNaNを生成し、例外無しで不正音を返す。enum追加だけでは旧reader互換を失い、テンション数・音程・表示・生成規則の全境界を修正する必要がある |

技術的な推奨候補は A。ただし、**A採用や Stage01 は承認済みではない**。分類印そのものは合成記号の意味情報であって私的音声等ではないが、実入力のraw text/provenance/performanceを一律にlogへ出す許可にはならない。

現在の合成8構造は `JsonVaultRepository.save → load → exportTo → importFrom(replace)` で構造・表示label・登録MIDI notesを保持、quarantine0、fileVersion2。これは既存データの往復確認であり、将来の新schema互換保証ではない。

## 5. 試聴ボイシングと生成失敗時の扱い

テキスト既定は `textChordTones.ts:11` の `voiceTextChordForAudition`。bass/rootを43〜54、残りのpitch classを60〜71へ配置する **context-free** な既存処理で、前後のvoice leadingを考慮しない。

| 構造 | 実際の MIDI notes（C4=60） | 所見 |
| --- | --- | --- |
| C minMaj7 | 48,63,67,71 | ♭3と長7を含む |
| C minMaj7 +9 | 48,62,63,67,71 | 9を含む |
| C minMaj7 /G | 43,60,63,71 | Gが最低音 |
| G dom7+b9,#9,b13 | 43,62,63,65,68,70,71 | 明示した3テンションを全て含む |
| G dom7+b9,b13 | 43,62,63,65,68,71 | b9/b13あり、#9/#11を追加しない |
| G dom7+b9,#11 | 43,61,62,65,68,71 | b9/#11あり |
| label-only G7alt / 仮想altered:true | 43,62,65,71 | **通常G7に化ける。対応済みではない** |

既定の9合成ケースでは指定bassが最低音、C4より下の隣接半音なし。全コード保証ではない。別styleのshell-17/open-17では minMaj7/G が最低Bとなる反例があり、既定だけで全style合格とは言えない。旧 `voiceChordForPreview` は上声5音制限により明示tripleの#9を落とす。既定テキスト関数とは別経路である。

合法でも非対応styleは `undefined`。不正quality `alt` の強制注入は TypeError、不正tension sentinelは `NaN` を含む音列になる。合法minMaj7/明示テンションでの例外とは分けた。現在、全生成に仕様§7.5の意味validatorが存在するわけではないため、try/catchだけでは通常G7への黙った代用を防げない。

将来の Stage01 では、既存生成後に必須音・禁止音・bass・低音衝突を検査し、失敗時は記号を保持して音を鳴らさず登録音も保存しない、という仕様を実装・統合検証する必要がある。今回は validator・fallback・保存経路を変更していない。

## 6. 消費側の必要情報・対応可否

次の表は実コードからの**調査結果**。製品内の共通情報依存tableはまだ存在しない。alt列はlabel-only/現型に無い仮想fieldの診断結果であり、解析できたaltを使った受け入れテストではない。

| 消費側 | 実際に必要な情報（入口を含む） | minMaj7 の現挙動 | alt 診断で分かったこと |
| --- | --- | --- | --- |
| Vault保存 | chord全構造・label・notes/provenance・strict v2schema | 保存/再読/export/import可 | label-onlyは保存可、未知fieldは拒否/quarantine |
| Dojo「登録した音」 | 登録notes・event対応・source availability。入口/sessionは全ChordSymbolも検証・正準化 | exact notes合格、+12移動は不合格 | notes判定はできても分類label/未知fieldを失う。新lesson境界も対応必要 |
| Root Motion | 生成音は根音だけだが、入口はContext全snapshot・quality/tensions/bass/label・timing/key/BPM/section | 入口非対応（Context allowlist外） | root-onlyという機能全体の宣言は不正確。G7へ落とした入口では鳴る |
| Bass Practice | bass??rootの生成に加えて、現pickerはContext全snapshot。旧helperも表示生成でquality/tensionsを読む | 旧directは可、現picker/Context入口は非対応 | bass/root-onlyと機能全体を宣言できない。分類保持対応は未実装 |
| Chord Context | 全symbolから生成、label正準化・timing/key/BPM/section、saved経路はnotesも | snapshot/生成とも非対応 | dom7として受理し通常G7音。分類消失 |
| Voicing Memory | 保存notes・representation/source/provenance・構造の互換key | 保存notesを維持 | keyが分類を読まず通常dom7と衝突 |
| Voicing Loop Generated | 全symbol・style/study/modifier/context・timing/key | 下記の経路別 | 現生成経路は分類を落としG7として成功し得る。新altは非対応gateが必要 |

各コード入口と行根拠は [consumer監査3章](../consumers-audit.md)。最下層の音生成だけを見て Root Motion/Bass を対応認定しない。

Loopのlegacy詳細5style（fallback無し）では minMaj7 が全 `UNSUPPORTED_RULE`。しかし **現在の主UI Basic/Core × Color off/on × Open off/on の8組では minMaj7/+9 は全組SUPPORTED**。slash minMaj7/G と明示tripleはColor off4組がSUPPORTED、Color on4組はUNSUPPORTED_RULE。詳細fallback、Extended Textの `text-defining-basic-full-v1`、Saved exactも別経路である。P12.4の旧legacy5style結果を現在のLoop全体へ一般化しない。altのlabel/仮想flagはどの生成経路でも無視してG7扱いになり得るので、返り値SUPPORTEDを意味対応と呼ばない。

登録音が無いコードは登録音課題に収集されず、全件無い場合は既存empty messageになる。コード単位の非対応カードは存在しない。一方「自分の進行」ではAuto fallbackに残る。仕様§7.5の「既存のコードごとの非対応表示に任せる」はそのまま実現できる前提ではない。

## 7. 一部エラー時の保存と上限

`| Cmaj7 | Unknown |` は読めたイベント1つを診断結果に残すが、通常・拡張とも `canConvert:false`。draft/save関数は例外で拒否、UI保存handler/disabled判定も止める。**読めた部分だけを保存することはできない**。現挙動を変更していない。

| 境界 | 現在値 | 仕様との差 |
| --- | --- | --- |
| 通常取り込み | 8192 UTF-16 / 32小節 / 128tokens | 仕様4096/12/48とは異なる |
| 拡張取り込み | 65536 UTF-16 / 256小節 / 4096score tokens・attacks / 2400harmonic spans | 通常と独立したbudget |
| Context/Bass選択section | 1/2/4/8/12小節・48eventの別契約 | 取り込み全体の上限と同じではない |

合成13小節はparse成功。通常32小節超のUI文言は「最大32小節です。」で、section分割の説明は無い。**現上限を仕様の数字へ縮小しないことを推奨するが、Stage01の人間判断として保留**する。文言変更もこの調査では行っていない。

## 8. 仕様と実態の相違・承認前の確認事項

| 相違 | Stage01へ進む前に確認する扱い |
| --- | --- |
| 取り込み上限が4096/12/48ではない | 現8192/32/128・拡張独立budgetを維持する方針を推奨 |
| minMaj7正準形は `CmMaj7`、仕様は `Cm(maj7)` | 既に正しく読める入力のlabelを変えると§10.3全結果一致に反する。新受理aliasのみか、Text既存labelも意図的変更として例外承認するか決める。legacy/MIDIへの波及は避ける |
| dom9/dom13/sixNine と min系の型名 | 意味等価な既存構造をそのまま維持する方針を推奨 |
| 通常・拡張に正規化/alias差 | 既存の2adapterを確認し、共有coreに足す変更とText専用の正規化の範囲を定める |
| Root Motion/Bassは機能全体でroot-onlyではない | 入口snapshotの分類保持まで必要。表だけで対応宣言しない |
| 生成音provenanceはmanual+text-style marker | 既存表現でアプリ生成識別を保証するか、別の保存契約まで変えるか確認。generated enumを無断追加しない |
| 登録音無しはコードごと非対応表示ではない | 既存empty/収集不可表示を維持する範囲と、必要な警告の位置を決める。Auto代替で登録音課題を作らない |
| minMaj7は主UI生成可能な組合せがある | legacy詳細5種のみを非対応根拠にしない。新alt生成は仕様どおり非対応のまま |
| 既定試聴はcontext-free、別styleにはbass違反/省略がある | 記号検査を全該当経路へ掛け、失敗を成功音として保存しない |
| §10.1に人間確認進行の全unique tokenが無い | 欠けた3種類も将来の正式テスト表へ含める |

## 9. 検証結果・変更範囲

未実行の検証は PASS としない。調査用一時スクリプトは実行後に除去する。製品コード・既存テスト・依存定義・既存基準画像を変更しない。

| setup 検証 | 実行結果 |
| --- | --- |
| `npm ci --offline --no-audit --no-fund`（初回 sandbox） | exit 1。隔離 npm cache に `zustand-5.0.14.tgz` が無く `ENOTCACHED`、cleanup `EPERM`。製品テストの失敗ではない |
| 同じ offline 導入（専用 worktree への scoped escalation） | exit 0。328 packages / 10s。依存定義・lockfile 変更なし |
| `node_modules` の型 | 通常の Directory、LinkType 空。worktree 間の共有なし |
| `npm run validate:phase-docs` | exit 0。既存57 phase packages PASS。TXT-JAZZ は数値 phase 未指定の調査 docs なので package schema の対象外 |
| `git diff --check` | exit 0 |
| base との `src` / `e2e` / `scripts` / `package.json` / `package-lock.json` 差分 | 0 |

この表は setup の結果。TXT-JAZZ製品要件の合格ではない。

| 調査検証 | 実測結果と意味 |
| --- | --- |
| 全tracked既存unit | 507files / 4285tests PASS、exit0、112.1s。対象はbase `21d4828d` のコード |
| parser採取 | 1採取test PASS、103入力、19正規化、2symbols×12keys。現状を記録したという意味で新機能合格ではない |
| consumer probe | exit0、121 assertions、9合成入力、3.08s。現Study8組・legacy5・fallback4・12キー移調を追加観測。非対応・危険な消失も期待した現状として採取 |
| consumer関連既存unit | 10files / 107tests PASS、exit0、1.47s |
| 独立再現検証 | base `21d4828d` の現コードで103入力・9代表consumerを再現、900 assertions / 0 fail、exit0、892ms。新実装のacceptanceではない |
| 独立baseline照合 | 14,537 records / 507 fragmentsのSHA、decoded 10,945,826 bytesとdigest、対象5source hash、217,481 calls / per-file unique20,224 / global unique14,537、全507既存unit・4,285 PASSを照合 |
| 独立文書・安全検証 | 仕様§4の85記載token（重複含む）・§10表25・人間確認12が全103集合に含まれ欠落0。相対リンク33、plain/decoded privacy pattern0、既存57phase packages PASS。独立quality/anti-patternレビュー未解決指摘0 |
| FULL / 全E2E / native / EXE / 実MIDI・音声・実Vault UI操作 | 未実行。Stage00の調査範囲外 |

調査器の設定階層・Windows空白URL・手作りKeySignature・一時syntaxerrorの失敗は各監査に保持した。戻り値参照を後からcallerが変更し得た初期snapshotは既存unitが通っていてもbaselineとして不採用、正式版はdeep snapshotして採取し直した。不正quality TypeError・sentinel NaNは現実の失敗経路の証拠であり、合法minMaj7での製品例外と混同しない。

最終文書コミット後に同じruntimeを再実行したとは主張しない。各証拠の対象コードSHAはbase `21d4828d0d62b35da574a2a32e3c2bfa39eea3a9`。今回の差分は調査docsだけである。一時実行scriptはparser6件・consumer1件・独立検証3件の計10件を担当者が除去し、残存0を照合した。baseに対する製品/既存テスト/scripts/native/依存定義/基準画像差分0、diff-check exit0。開始時から全25 worktreeのHEAD・status件数一致も独立確認した。

独立再現の出力は ignored `p12-generated/txt-jazz-verify/reproduction.json` と `baseline-verification.json` に保持。後者のdecoded SHA-256は `d1d88963276d0118002e25af19a6ab99c8ea7012a2e6842f0bc2b6be37e7cb2d`。圧縮証拠ファイルのSHAとは別の値である。文書だけの最終コミットにより、baseコードで行ったruntime検証を最終HEADで再実行した結果に置き換えない。

## 仕様 §3 の報告要件の照合

| # | 必要な報告 | 記録した箇所 |
| --- | --- | --- |
| 1 | §2.2 九項目の事実とコード | 2章、解析/consumer監査のコード行 |
| 2 | 全tokenの構造・分類・期待比較 | 3.1、解析監査全103行、token JSONの全診断 |
| 3 | 表示処理と規則 | 4章、解析監査の正規化・表示 |
| 4 | 試聴処理と minMaj7/明示テンション実音 | 5章、consumer監査2章 |
| 5 | 消費側の minMaj7 挙動 | 6章、consumer監査3章 |
| 6 | 消費側の必要情報の実コード確認 | 6章の入口込みの表、consumer監査の根拠列 |
| 7 | alt A/B/C実現性と互換 | 4章、consumer監査4章 |
| 8 | 作れないコード/誤生成時の現在の扱い | 5章、consumer証拠 `representation` / 各preview |
| 9 | 部分エラー入力の保存 | 7章、consumer証拠 `partial` |
| 10 | 仕様と実態の相違 | 8章と各分担監査 |
| §10.3 | 既存入力の完全な変更前snapshot | 3.2、回帰監査・lossless証拠 |

これは調査の報告要件を照合する表。Stage01の未実装要件を合格扱いしていない。

## 10. 人間の判断待ち

**Stage01は未承認のため開始しない。** 次に進む場合は次の具体的な方針を利用者が決める。

1. altは A（任意分類印）を採用するか。現reader/旧EXEが新fieldを含むideaを読めない点と、fileVersion2を維持する場合の互換方針を含む。Bは反例があり不可、Cは広範な音程/意味処理の変更が必要。
2. 仕様と異なる現取り込み上限・既存の意味等価品質（dom9/dom13/sixNine等）を維持するか。現上限を縮小しない方針を推奨する。
3. minMaj7の表示を `Cm(maj7)` に統一する場合、既に読めるText入力の表示変更を回帰凍結に対する明示例外として認めるか。legacy/MIDI表示まで変える指示とは解釈しない。
4. 以上と、登録音無しの既存表示・アプリ生成provenanceの現表現に関する相違を確認したうえで、Stage01実装を承認するか。

merge / push / fetch / tag / release はしていない。新EXEは作っていない。既存のブランチ・未コミット変更・worktree・EXEは保持した。
