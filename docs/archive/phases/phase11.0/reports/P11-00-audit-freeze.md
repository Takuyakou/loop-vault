# P11-00 — 現行契約監査と設計凍結

基準: `73507e87`。`feat/p10.0-07-finish` は local master の祖先であることを Git で確認した。製品動作はこの Stage では変更しない。

## 保存した音と現行の保存経路

| 保存内容・選択 | 保存した音の候補 | 元MIDI | カスタム | 現行動作と留意点 |
|---|---|---|---|---|
| `CUSTOM` + compatible `practiceVoicingOverride` | override | source が別にあれば可 | 可 | `resolveVoicingForUse` は override を使用 |
| `SOURCE` + compatible `sourceVoicing` | source | 可 | override が別にあれば可 | source 実音を使用 |
| `GENERATED` | 不可 | source が別にあれば可 | override が別にあれば可 | カード再生は生成音を使用 |
| choice 欠落 + compatible override | override | source が別にあれば可 | 可 | override 優先 |
| choice 欠落 + user-verified source | source | 可 | 不可 | source 優先 |
| choice 欠落 + high-confidence simultaneous source | source | 可 | 不可 | 自動使用閾値を満たす場合 |
| choice 欠落 + low-confidence source | 要審査 | 可 | 不可 | 一般 resolver は生成へ、card audition も `sourceNeedsReview` で生成へ |
| explicit notes 不在 | 不可 | 不可 | 不可 | 生成音は保存した音とは呼ばない |

**選んだこと:** P11-02で「保存した音」は現行の compatible かつ選択済み explicit notes とし、生成音の暗黙混入を許さない。**理由:** `resolveVoicingForUse` と `cardAuditionResolution` の明示 choice 経路がこの優先順位を示す。**別案:** 再生時に常に自動生成する案は保存した音の意味を失う。

`src/domain/voicing/resolveVoicing.ts` と `src/voicingPractice/cardAudition.ts` は choice 欠落時に完全同一の判定関数を共有していない。後者は `sourceNeedsReview` のみで source の自動利用を判定する。既存の snapshot builder は低 confidence の時だけこの flag を立てるため通常は同じ結果になるが、compatibility / representation / threshold の情報を欠く detached snapshot に対する一致は別テストが必要。P11-05 は条件付きのまま残す。

## Text / MIDI / Phase 10 provenance

| 経路 | preview | save / reload | 保存される source |
|---|---|---|---|
| Standard Text | `CaptureView` → text preview | `createIdeaFromTextProgression` → `vaultStore` → v2 reload | 元MIDIはない。style 選択時は manual override |
| Extended Text | `TextProgressionCapturePanel` / Extended playback | `extendedTextSaveData` →同じ Vault 経路。`textSource` と authored timing を保持 | 元MIDIはない。style 選択時は manual override |
| MIDI | MIDI capture / correction | Vault v2 `voicingMemory` | `sourceVoicing` は実 MIDI 由来 |
| Phase 10 correction | correction preview | `cardTimelineItem` → Vault v2 | source-only correction は SOURCE。音の追加・移動は manual override、`p10-correction:v1`、CUSTOM |

**選んだこと:** P11-02で Text style の起源は provenance marker で判定する。**理由:** 現コードの `textProgressionStyleFromSnapshot` は `text-style-v1:` marker のほか、現行 generator による再生成音との一致まで要求する。generator 更新だけで保存済み style の分類が変わる。**別案:** 音集合比較の維持は永続化済みデータの意味が将来変動するため採らない。Phase 10 marker `p10-correction:v1`、`source: manual`、CUSTOM はコードで確認済み。P11-02 はこの既知の差異を修正する段階であり、P11-00で製品変更しない。

リネーム時は `saveCandidate.ts` が source/override の `capturedForChord*` を新 identity に付け替える。一般の incompatible snapshot は `voicingCompatibility` により除外される。`cardAuditionResolution` は persisted choice の SOURCE/CUSTOM/GENERATED を優先し、欠落時は custom→source→generated。P11-02では card audition と「保存した音」の note-number 一致を明示的にテストする。

## Generated controls 移行案（Human Gate の判断対象）

| 現行 control | 現行挙動 | 候補移行先 | 案 | 理由 | 別案 |
|---|---|---|---|---|---|
| Teacher | 承認済み study rule の実用形 | 生成タイプ「基本」 | Keep | 主要導線 | 現名のまま selector 内 |
| Core | 骨格・特徴音重視 | 「骨組み」 | Keep | Teacher と区別できる | 「コア」 |
| Color | 安全な上部色付け | 生成タイプの組合せ | Advanced | 音追加なので基本とは別意味 | 独立 switch 継続 |
| Open | 広い配置 | 「広げる」 | Advanced | 複数 type に適用可能 | 独立 switch 継続 |
| basic-shell | root あり shell | 「骨組み」の詳細 | Advanced | rootless と混同しない | 別 type |
| rootless-shell | root なし 3・7 | 詳細メニュー | Advanced | slash bass / root の有無が意味を持つ | 「ルートレス」 type |
| basic-full / full-shell | 承認済み full / shell | 「基本」の詳細 | Advanced | Text policy と既存 rule の差を残す | 旧ラベル維持 |
| left-hand | 左手 Rootless A/B | 詳細メニュー | Advanced | 練習手の役割が違う | 独立 control |

**選んだこと:** ラベルと移行先は提案のまま保持し、既存 control は削除しない。**理由:** Generator と practice mode が混ざるため、Human Gate で意味を承認する必要がある。**別案:** 4ボタンへの即時集約は機能を落とす可能性がある。

## 最適化、運指、表示、前回選択

`resolveProgressionPracticeVoicings` は source-midi/custom では exact notes を返し、lesson/study 系では全進行候補を最適化する。Range は同じ full plan を使い再最適化しない。現行 `進行に合わせて最適化` は lesson 系でのみ活性。X/N source fallback の固定音を anchor として最適化できる証明はまだないため、P11-03では mixed 最適化を使わない方針。運指 `assignPracticeHandsAcrossProgression` / `rankFingeringsForHand` は note 選択を変更しない表示情報で、対応音数などの制約がある。

「覚える」は Voicing / 音名 / 運指の手掛かりを表示。「思い出す」は `PracticeKeyboard` に level 4 と `concealNoteNames` を渡す。押鍵モニタは残り、回答音の扱いは keyboard の既存表示契約に従う。Source切替では plan が再解決されるが displayMode state は保持される。

前回開いた進行だけが `recentProgressions.ts` を通じて localStorage に保存される。source selection は `initialSelection` の React state で、進行ごとの前回選択は保存していない。**選んだこと:** P11-04で schema を変えず進行 ID ごとの local preference を検討する。**理由:** Vault 内に練習 UI 設定を混ぜない。**別案:** Vault v2変更は範囲外。

## Range / CC64 / header の凍結事実

Transport V2 は同じ full snapshot の `lengthBeats` で rolling attack と clock projection を計算する。短縮 snapshot は original event index、global beat、元拍子位相、mid-play replacement を同時には保てない。**選んだこと:** P11-01では B（native loop bounds）を採用する。**理由:** 既存 full plan を保持し、音と表示で一つの座標系を維持できる。**別案:** A（derived short snapshot）は phase と ID を戻す追加 mapping が必要で、簡素化にならない。

再生は Tone/WebAudio instrument (`ProgressionVoicingTransport.ts`) であり、MIDI CC64 の送信はこの経路にない。`CC64 = NOT_APPLICABLE`。発音 gate は `activeNotes` / `releaseVoices` と rolling scheduler の epoch guard で扱う。

現行 header は `lv-vl-controls-row` の flex-wrap。source、study、表示の fieldset はそれぞれ異なる shrink / wrap 条件を持つ。旧ラベルに対する幅監査は package の reference として使用できるが、P11-04 の新ラベル収容性を保証しない。1444px の1行は P11-04 の実測 Gate。

## Repo process

既存 `.githooks/pre-commit` は staged private media check のみ実行する。Phase doc validator は `npm run validate:phase-docs` と FAST/FULL runner に登録済み。P11-00 docs commit 前に同 validator を fresh 実行し、hook へ同コマンドを追加して Phase 11 docs の commit 時検証を再利用する。別 hook system は作らない。
