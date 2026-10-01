# Phase 11 — Voicing Loop v4 最終実装報告

## 結論 / 状態

P11-00/01のHuman Gateを受け、承認済みP11-02→06を継続した。Sourceの意味、Text Preview保存、部分Source補完、header、手入力音のrename整合性を実装した。最終fresh FULL / EXE Gateは未実行（実行後この節へtested HEADと実測結果を追記する）。masterへ未merge。

## 各Stage

| Stage | 成果 | code commit |
|---|---|---|
| P11-00 | 実コードaudit、marker/migration freeze | c1d2aa5b |
| P11-01 | Native A–B Range Loop | a1b75252 |
| P11-02 | Standard/Extended Preview exact保存、保存した音、カード試聴一致 | 5d7089c2 / d4d5f888 |
| P11-03 | X/Nだけ固定基本による明示補完 | 06b6b2d8 |
| P11-04 | 4 Source、基本/骨組み selector、availability、前回Source復元 | 88c4bd8d |
| P11-05 | manual/live音をrename後も保持、shared resolver統一 | 7a21e01a |
| P11-06 | 移行監査、deterministic補完transport回帰、最終screens/FULL/EXE | 最終tested HEADを下記へ記録 |

Stage別の詳細と失敗切り分けは各報告へ記録している。

## 選んだこと / 理由 / 別案

- 選んだこと: 保存した音 / 元MIDI / カスタム / 自動生成を独立して選ぶ。理由: 実保存音と生成音を同じSourceとして表示しない。別案: 元MIDI不在をGeneratedへ無表示でfallbackする案は不採用。
- 選んだこと: X/N不足だけ固定基本（Teacher、Color/Open/最適化なし）で補完しA印とaccessible textを表示。理由: 固定音を動かさない。別案: mixed全体最適化は安全なanchor契約が未証明のため不採用。
- 選んだこと: 手入力manual/liveの有効音はrename後も保持。理由: 名前から再生成して人間の音を失わない。別案: captured identityの書換えは元provenanceを失うため不採用。

## Legacy機能の移行監査

| 既存機能 | 最終配置 / 契約 |
|---|---|
| Teacher | 自動生成 > 基本 |
| Core | 自動生成 > 骨組み |
| Color / Open | 詳しい設定。基本/骨組みに作用する既存modifier |
| basic-full | 自動生成の基本と既存の形selector |
| basic-shell / rootless-shell / full-shell | 詳しい設定 > 既存の形。各既存rule resolverを維持 |
| left-hand / Rootless A/B | 詳しい設定 > 既存の形 / 左手の形 |
| 候補切替 / lesson context | 既存current説明/候補とcontext contractを維持 |
| 覚える / 思い出す | 上部表示軸。押鍵モニタと既存回答表示契約を維持 |
| 最適化 | 基本/骨組みのみ。固定Sourceとmixed補完を変更しない |
| おすすめ運指 / 自分の運指 | 音番号を変えない既存表示/編集機能を維持 |

「上に三和音」は新設しない。Vault schema / fileVersion 2、Product Analyzer/Identity/Decoder、source MIDI抽出は変更していない。

## 保存 / origin / playback

新規Standard/Extended Textは保存時のPreview resolved notesをpracticeVoicingOverrideへ保持する。実markerは `text-style-v1:`。origin分類に再生成一致を使わず、Text保存音と手入力Customを区別する。legacy Textにsnapshotを自動backfillしない。GENERATED指定のみのカードは保存した音として利用不可。

Source 0/Nはaria-disabledでfocusでき、activation時だけ理由を表示。X/Nは利用可能数と各不足カードのA印。前回Sourceは利用可能な場合だけ進行ID別localStorageから復元し、Vaultへ練習設定を追加しない。

カード/全体/Capture/export/Voicing Loop保存した音のexplicit pitch一致をv2 roundtripで検証。manual/live overrideはrename後も音を保持。Source MIDIのinvalid/stale/aggregated制約は維持する。ユーザーが明示的に指定した移調/octaveのみsession音を変更し、原本snapshotは不変。

## Range / audio

P11-01のnative loop boundsを維持。右クリックA/B、逆順、同カード、Shift右クリック、Shift+F10/Menu、pending Esc、clear、区間外左クリック選択のみ、カード▶独立を検証。元のmeter phaseを維持し、範囲設定ではvoicingを生成し直さない。CC64は本WebAudio経路ではNOT_APPLICABLE。

P11-06では部分Source補完を含むStart/Stop/Restartとcount-in 0/1/2を既存Tone clock mockで追加検証。実時間sleepや人間の聴取を必須にしない。stale callback guard、先頭1回attack、同音wrap cleanupの既存回帰を維持。

## 最終画面とfocused Gate

- focused domain/transport/Mix/card: 277/277 PASS。
- Source/Generated/Range/compact/keyboard/a11yのPlaywright: 41/41 PASS。
- 1920/1600/1444/1366/1280pxは1行、960pxは2行。1444px row実幅1138px。指定6幅にhorizontal overflowなし、重大/深刻axe違反なし。
- final header画像/geometry: `test-results/p11-header/`。Range16画像: `test-results/p11-range/`。いずれも公開合成fixture、Git管理外。
- `p89:screens -- phase11-final`: 4/4 PASS。1920×1080、1440×900、960×1032、768×640の既存reachable-screen撮影を完了。出力はGit管理外 `p89-generated/phase11-final/`。
- 1440×900は撮影sample/既存起動サイズ。製品の最低解像度として固定していない。headerはcontainer条件とwrapに追従。

## 最終fresh FULL / EXE

PENDING — stabilised report-inclusive HEADをcommitしてからFULLを1回実行し、結果と実行HEADを追記する。FULLでPASS cacheは使用しない。EXEはD-driveの既存Tauri targetへ `--no-bundle` で作成する。

## 制約 / acceptance

- partial fallbackの基本方式にも未対応のコードは利用不可と理由を維持する。
- 全体最適化は固定Source/mixedと旧独立ruleには適用しない。
- 既に過去の編集で消失した保存音を復元するものではない。
- 人間が選んだ音と現在コード名のdegree解釈が違ってもpitchを優先する。
- fresh Gate / EXE完成後、Human Product Acceptanceで停止。master merge/push/tag/releaseは実行しない。
