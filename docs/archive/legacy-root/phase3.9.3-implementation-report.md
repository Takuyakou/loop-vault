# Loop Vault Phase 3.9.3 実装報告書

作成日: 2026-07-24

最終更新日: 2026-07-25

対象: `master`

報告時HEAD: `22cd15e889e0e7530efd482231da139940b9ccaa`

## 1. 実装結果

Phase 3.9.3ではChord Dojoへ、保存進行を別のキーで練習するL4/L5と、複数の保存進行を連続練習するMix Sessionを追加した。

- L4「近くのキーでも」: 元キーを除く五度圏±1/±2/±3の6キー
- L5「どのキーでも」: 元キーを含む同modeの12キー
- Mix Session: 2〜5進行、L1〜L3、1〜3巡、Step/Flow
- Chord Dojo鍵盤: デスクトップ・狭幅の双方で縦方向を縮小
- マスター音量: Ideaボタン左のFL Studio風ノブから、試聴・練習・メトロノームを一括調整

主な入口は `src/views/PracticeView.tsx`。L4/L5の表示は `src/components/practice/TranspositionPracticeControls.tsx`、Mix実行画面は `src/components/practice/MixPracticeWorkspace.tsx` が担当する。

## 2. Stageとコミット

| Stage | Commit | 実装内容 |
|---|---|---|
| T0 | `c89e75b` | 現行Chord Dojo、保存境界、互換性リスクを監査 |
| T1 | `a625657` | Key Catalog、五度圏pool、移調、Roman numeral、Key Bag |
| T2 | `0e6cca5` | target plan、resolved voicing移調、L4/L5 session/UI |
| T3 | `70bdce0` | Key coverage、provisional、別日confirmation、互換migration |
| T4 | `7023bb6` | 読み取り専用Mix Snapshot、進行bag、Mix Step/Flow、summary/retry |
| T5 | `19a21c2` | 回帰検証、実装報告書、ユーザー実機確認チェックリスト |
| F1 | `c6a5cdd` | Chord Dojo鍵盤の高さを縮小 |
| F2 | `81d167c` | ローカル永続化付きマスター音量ノブ |
| F3 | `0557376` | 音量ノブをFL Studio風の外観と数値ツールチップへ調整 |
| F4 | `c821d95` | ホバー時の左右矢印カーソルを通常ポインターへ変更 |

PRとmerge結果:

| PR | 内容 | Merge commit |
|---|---|---|
| [#153](https://github.com/Takuyakou/loop-vault/pull/153) | Phase 3.9.3 L4/L5・Mix Session | `869a811` |
| [#154](https://github.com/Takuyakou/loop-vault/pull/154) | Chord Dojo鍵盤縮小 | `71e83a6` |
| [#155](https://github.com/Takuyakou/loop-vault/pull/155) | マスター音量ノブ | `22cd15e` |

3件は依存順にmerge commit方式で`master`へ取り込み済み。merge conflictは発生していない。

## 3. L4/L5移調ドメイン

### Keyとpool

`src/domain/practiceTransposition/keyCatalog.ts` がmajor/minorのCanonical Key Catalog、別名・異名同音・日本語/英語表示を扱う。MVPで受理するmodeはmajor/minorのみで、Keyなし・未対応modeはL4/L5を無効化する。

`src/domain/practiceTransposition/circleOfFifths.ts` は次を決定的に生成する。

- L4: 元キーを除く6 unique key
- L5: 元キーを含む12 unique key
- major/minorは元進行と同じmodeを維持

`src/domain/practiceTransposition/keyBag.ts` は注入seedから決定的な順序を作る。poolを一巡するまで重複せず、Key Bagとseedは永続化しない。idle/pausedではKey railから手動選択できる。

### コード進行の移調

`src/domain/practiceTransposition/transposeChordSymbol.ts` と `transposeProgression.ts` は、保存された元進行からtarget keyへ毎回直接移調する。

- rootとslash bassへ同じsemitone shiftを適用
- quality、tension、alteration、sus、bar、beat、durationを維持
- borrowed/chromatic chordをreharmonizeしない
- target keyに応じたsharp/flat表記を生成
- degree/Roman numeralをtarget keyに依存せず維持
- 保存イベントを変更せずsession-only eventを生成
- 同じ入力から同じ結果を返す

### Target Planと判定

`src/domain/practiceTransposition/targetPlan.ts` が移調済み進行から練習要件を作る。`src/domain/practiceTransposition/transposeResolvedVoicing.ts` は保存ボイシングの全noteへ同じshiftを適用し、音域調整が必要な場合も進行全体へ単一octave offsetだけを適用する。イベントごと・音ごと・左右手別にはoctaveを変えない。

保存ボイシングがないイベントは既存のgenerated-closeへfallbackする。Phase 3.9.2のStyle targetはtarget keyで再生成するが、Style/generated-closeは自由練習であり公式coverage対象外。既存Step/Flow matcherと `src/practice/PracticeClock.ts` を再利用し、Mix専用・移調専用の別matcherは作っていない。

### UIの情報制限

L4/L5ではtarget keyとdegreeを表示し、答えとなるコード名、具体的Guide note、Guide色を通常表示しない。鍵盤には実際のheld/foreign/sustain、Cラベル、範囲外note数だけを表示する。根拠は `src/views/PracticeView.tsx`、`src/components/practice/PracticeKeyboard.tsx`、`src/components/music-keyboard/PianoKeyboardVisualizer.tsx`。

## 4. Key coverageと別日confirmation

公式coverageは `src/domain/practiceTransposition/practiceProgress.ts` で判定する。

公式clearになる条件:

- Flow
- clean round
- target tempo到達
- resolved-voicing
- progressionがstaleでない
- L4はL3 confirmed、L5はL4 confirmed

Step、dirty、skip、per-note、Style、generated-close、前段位未確定の自由練習はcoverageを更新しない。

L4は6/6でprovisionalとなり、別日に固定2キーを連続cleanするとconfirmed。L5は12/12でprovisionalとなり、別日に五度圏4区間から固定された4キーを連続cleanするとconfirmedになる。confirmation keyはprovisionalへ保存され、再起動後も変えない。dirty時は当日のconfirmation連続成功をリセットする。

`confirmedLevel` は最高到達Levelを保持する。進行内容または実効Keyが変わりfingerprintがstaleになった場合、旧coverageを現在進行へ適用せず、明示reset後に再開する。

## 5. データモデル・互換性・保存

追加された永続フィールドは `src/domain/practice/types.ts` のoptionalフィールドである。

```ts
export interface PracticeProvisionalClear {
  level: PracticeLevel;
  clearedAt: string;
  clearedOnLocalDate: string;
  targetTempo: number;
  confirmationPitchClasses?: number[];
}

export interface TranspositionPracticeProgress {
  schemaVersion: 1;
  clearedKeyPitchClasses: number[];
  updatedAt?: string;
}

export interface ProgressionPracticeProgress {
  schemaVersion: 1;
  progressionFingerprint: string;
  confirmedLevel?: PracticeLevel;
  provisional?: PracticeProvisionalClear;
  transposition?: TranspositionPracticeProgress;
  lastPracticedAt?: string;
}
```

`src/domain/schema.ts` は `fileVersion: 1` を維持する。旧JSONは新フィールドなしで読み込める。`src/domain/practiceCompatibility.ts` は次をload時に正規化する。

- `idea.key`を継承する旧fingerprintを現行fingerprintへ再紐付け
- confirmation keyがない旧L4/L5 provisionalへ決定的な固定keyを補完

保存は `PracticeView` から `updateProgressionBlock()` を呼び、`src/store/vaultStore.ts` の `applyVaultChange()`、500 ms autosaveを通る。repositoryへ直接書かない。書込み対象はeligible clean、provisional、confirmed、stale resetのみ。

## 6. Mix Session

### 選択・preflight・Snapshot

`src/domain/practiceMix/preflight.ts` は選択された全進行を開始前に検証する。エラー進行を黙って除外しない。

- 2〜5進行
- L1〜L3のみ
- L3は全進行にmajor/minor Keyが必要
- Flowは全進行が明示的な4/4かつ有効なtiming
- target sourceの生成可否と明示fallback
- duplicate selection、欠損block、空進行、無効コードを拒否

成功時は `{ideaId, blockId}` のcomposite reference、content fingerprint、target planを持つdeep clone/freeze済みSnapshotを作る。開始後に進行の変更・削除を検出した場合はpauseし、再読込または終了を求める。

### 順序と実行

`src/domain/practiceMix/progressionBag.ts` は注入seedから決定的な進行順を作る。

- 一巡内で同じ進行を重複させない
- 前巡末尾と次巡先頭を同じ進行にしない
- 1〜3巡
- seed、選択、結果を保存しない

`src/domain/practiceMix/sessionMachine.ts` は既存 `reducePracticeSession()` を使う。Stepは進行を順番に完了し、Flowは共通BPM、Tempo Rampなし、進行間1小節count-inで進む。dirtyでも直後に止めず最後まで続行し、summaryからdirty subsetだけを再挑戦できる。score、percentage、rankingは表示しない。

`src/components/practice/MixPracticeWorkspace.tsx` はPause/Resume、MIDI切断/reconnect、Clock開始失敗、Snapshot drift、終了を扱う。Target Sourceは保存ボイシング、自動クローズ、シェル、オープン、ルートレスをPhase 3.9.2から再利用する。

### 非永続

Mix Sessionは `updateProgressionBlock()`、`applyVaultChange()`、repositoryを呼ばない。次は変更しない。

- `confirmedLevel`
- `provisional`
- L4/L5 Key coverage
- `lastPracticedAt`
- progression fingerprint
- Mix選択、seed、結果

MixとL4/L5はUI上で同時選択できない。

## 7. 完了後のUI調整

### Chord Dojo鍵盤

`src/components/music-keyboard/PianoKeyboardVisualizer.tsx` の練習画面用高さを
`h-[clamp(7.5rem,16vw,10rem)]` から `h-[clamp(6rem,13vw,8rem)]` へ変更した。
鍵数、音域、押鍵・お手本・構成外・ペダル保持の表示ロジックは変更していない。

### マスター音量

`src/components/MasterVolumeKnob.tsx` をApp ShellのIdeaボタン直前へ追加した。外観は暗い角型パネル、白いリングと回転指針、右下のアクセントマーカーで構成する。ホバーまたはキーボードフォーカス時は「マスター音量: 100%」の形式で現在値を表示する。カーソルは左右矢印ではなく通常ポインター。

実際の音量処理は `src/audio/masterVolume.ts` が担当する。

- 入力範囲は0〜100%、1%刻み
- 100%を0 dB、50%を約-6.02 dBへ変換する対数カーブ
- 0%は-60 dBに加えてTone Destinationをmute
- Tone.js共通Destinationを変更するため、コード試聴、Chord Dojo、メトロノームへ一括反映
- `loop-vault:master-volume:v1` としてこのPCの`localStorage`へ保存
- 保存値が欠損・不正・旧versionの場合は100%へfallback
- Vault schema、`data.json`、`fileVersion`は変更しない

日本語ラベルは「マスター音量」、英語ラベルは「Master volume」。透明なnative range inputを操作境界に使うため、クリック・ドラッグ・キーボード操作と`aria-valuetext`を維持している。

## 8. 自動テスト

Phase 3.9.3で追加・拡張した主なテスト:

- `src/domain/practiceTransposition/keyCatalog.test.ts`: 12 major/minor、別名、表記、未対応mode
- `src/domain/practiceTransposition/transposeProgression.test.ts`: major/minor、slash、altered、borrowed、timing、決定性
- `src/domain/practiceTransposition/keyBag.test.ts`: 一巡重複なし、手動Key、seed決定性
- `src/domain/practiceTransposition/transposeResolvedVoicing.test.ts`: 全体octave offset、fallback、音域
- `src/domain/practiceTransposition/practiceProgress.test.ts`: L4/L5 coverage、provisional、別日confirmation、stale
- `src/domain/practiceMix/practiceMix.test.ts`: 2〜5件、preflight、bag、Step/Flow、dirty retry、Snapshot、非永続
- `src/components/practice/MixPracticeWorkspace.test.tsx`: Clock、Pause/Resume、切断/reconnect、summary、操作UI
- `src/views/PracticeView.test.tsx`: L4/L5情報制限、保存境界、Mix排他、日英、狭幅
- `src/domain/schema.test.ts` / `repository.test.ts`: 旧JSON、optional field、`fileVersion: 1`
- `src/audio/masterVolume.test.ts`: 値の正規化、version付き端末保存、対数dB変換、0% mute
- `src/components/AppShell.test.tsx`: ノブ配置、値変更、日英ラベル、ツールチップ

最終QA結果:

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npm test -- --run` | 149 files / 1031 tests PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 24 tests PASS |
| `npm run tauri build` | PASS |
| In-app Browser responsive QA | 1280x720 / 375 px幅でPASS |
| `git diff --check` | PASS |

Windows PowerShellの実行ポリシーが `npm.ps1` を拒否したため、npm/npxの検証は同じNode.js CLIを起動する `npm.cmd` / `npx.cmd` で実行した。アプリやテストの失敗ではない。

In-app Browserでは、保存データがないブラウザ用メモリ環境で練習キューとMix共通設定を確認した。デスクトップ幅と375 px幅のどちらでもページ全体の横overflowはなく、主要操作の文字切れやconsole warning/errorも検出しなかった。マスター音量は35%への変更、100%への復帰、再読込後の保持、ツールチップ表示を確認した。保存進行・実MIDIを必要とするL4/L5とMix演奏は、この目視確認の完了範囲には含めていない。

## 9. 生成物

2026-07-24 23:29 JSTにTauri release buildで再生成した。

| 種類 | パス | サイズ |
|---|---|---:|
| 単体EXE | `src-tauri/target/release/loop-vault.exe` | 14,739,456 bytes（約14.06 MiB） |
| MSI | `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi` | 5,062,656 bytes（約4.83 MiB） |
| NSIS | `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe` | 3,549,370 bytes（約3.39 MiB） |

## 10. 既知の制約・未確認

- 実MIDI鍵盤でのL4/L5、Mix、MIDI切断/reconnect、音楽的な自然さはユーザー実機確認待ち。完了扱いにしていない。
- L4/L5はmajor/minorのみ。modal transpositionは未実装。
- L4/L5とMixを組み合わせるKey Mixは未実装。
- Mix v1はL1〜L3、2〜5進行、1〜3巡のみ。
- Mix Flowは明示的な4/4進行のみ。
- Style/generated-closeの移調練習は公式段位・coverage対象外。
- 新しいStyle、LLM、MIDI Analyzer、Voicing抽出、Vault試聴ロジックは変更していない。
- Viteはminify後JavaScriptチャンク約1.06〜1.08 MBに対し、500 kB超過警告を出す。build自体は成功している。
- GitHub Actionsの必須CI jobは設定されていない。merge前検証はローカルで実施した。

## 11. 完了判定

Phase 3.9.3の実装、自動テスト、レスポンシブ目視確認、Windows release build、PR #153〜#155の`master`へのmergeは完了している。現行`master`は報告時HEAD `22cd15e`。

残作業は `docs/phase3.9.3-user-verification-checklist.md` に記載した実MIDI鍵盤での音楽的・操作感確認であり、コード上の未コミット作業や未マージPRはない。
