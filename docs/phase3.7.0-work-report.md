# Loop Vault Phase 3.7.0 作業報告書

作成日: 2026-07-17
対象: Live MIDI Mini Mode（L0-L6）および追加修正
対象コミット: `1d46ba6` から `d459f09`
対象PR: #106-#113（stacked PR、未マージ）

## 1. 実装結果

Phase 3.7.0では、接続したMIDIキーボードの演奏内容から現在のコードを推定し、常に手前へ表示できるミニモードを追加した。Live MIDIの履歴は一時状態として保持し、ユーザーが選択した範囲だけを既存または新規Ideaへ保存できる。

現行アプリで実際に可能な操作は次のとおり。

- ヘッダーの`Live MIDI`ボタンから、通常画面を340 x 200のミニモードへ切り替える。`src/App.tsx`, `src/liveMidi/miniWindowController.ts`
- MIDI入力デバイスを選択し、接続状態を確認する。`src/components/LiveMidiMiniMode.tsx`
- 設定画面で既定のMIDI入力を選択し、一覧を更新し、実際のopen/closeによる接続テストを行う。`src/components/LiveMidiSettingsSection.tsx`
- MIDI Note On/Offとサステインペダル（CC64）を受信し、現在鳴っている構成音、Bass、推定コードを表示する。`src/domain/liveMidi/`, `src/liveMidi/liveMidiStore.ts`
- 安定したコードを最大64件のセッション履歴として確認する。`src/domain/liveMidi/chordHistory.ts`
- 履歴表示をミニ画面上でON/OFFする。`src/components/LiveMidiMiniMode.tsx`
- `戻る`または`Esc`で通常画面へ復帰する。通常画面の位置、サイズ、最大化・全画面状態を復元する。`src/App.tsx`, `src/liveMidi/miniWindowController.ts`
- ミニモードでもウィンドウの`x`でアプリを終了する。既存の未保存データflush経路は維持される。`src/store/closeGuard.ts`, `src-tauri/src/lib.rs`
- ミニモード終了時、今回のコード履歴から範囲を選び、既存Ideaまたは新規Ideaへ保存する。`src/components/LiveMidiImportDialog.tsx`, `src/domain/liveMidi/historyImport.ts`

Live MIDIは**入力とコード表示の機能**であり、MIDI Thru、MIDI録音、ピアノ音源による発音機能は実装していない。

## 2. 実装ステージ

| Stage | 実装内容 | コミット | PR |
|---|---|---|---|
| L0 | 現行構造、終了処理、永続化境界、実装責務の監査 | `1d46ba6` | #106 |
| L1 | Rust MIDI transport、Tauri command、TypeScript bridge/service | `0b3673c` | #107 |
| L2 | Note state、Bass、コード判定、安定化、履歴の純粋domain | `cba05e9` | #108 |
| L3 | 単一windowのミニ化・復元、画面内補正、local preferences | `58873fb` | #109 |
| L4 | ヘッダー導線、ミニUI、Live MIDI store、日本語/英語表示 | `fbe35ff`, `0223046` | #110 |
| L5 | 履歴範囲の任意Vault取り込み | `ae24f16` | #111 |
| L6 | 自動検証、WebView確認、Windowsビルド、QA記録 | `431c171` | #112 |
| 追加修正 | 設定画面の既定デバイス選択・更新・接続テスト | `86aa462` | #113 |
| 追加修正 | ミニモードACL不足と誤ったMIDIエラー案内の修正 | `d459f09` | #113 |

## 3. レイヤ構成

### 3.1 Rust transport

`src-tauri/src/live_midi/`はOSのMIDI入力とTauri frontendを接続するtransportだけを担当する。コード名の判定など音楽的な処理は持たない。

- `list_live_midi_inputs()`: `midir`で入力ポートを列挙する。
- `open_live_midi_input()`: indexとデバイス名を再照合してポートを開く。
- `close_live_midi_input()`: 現在の接続を閉じる。
- 受信したchannel messageを10ms単位でまとめ、`live-midi-event-batch`としてemitする。
- 接続ごとに`connectionId`を発行し、古い接続から届いたbatchをfrontend側で破棄できるようにする。
- System messageは除外し、status、channel、data1、data2、接続開始からのtimestampを渡す。

デバイスIDは`midir:{index}:{name}`形式であり、OSが提供する永続IDではない。列挙順が変わった場合に別デバイスを誤って開かないよう、open時に現在の名前を再確認する。`src-tauri/src/live_midi/device_service.rs`, `src-tauri/src/live_midi/connection.rs`

### 3.2 TypeScript bridge / service

`src/liveMidi/bridge.ts`がTauri commandとeventをラップし、`src/liveMidi/liveMidiService.ts`が接続状態を管理する。

接続状態は`idle | connecting | connected | disconnected | error`。接続開始時は既存接続を閉じ、操作番号で競合した非同期処理を無効化する。event batchは現在の`connectionId`と一致する場合だけstoreへ渡す。

### 3.3 純粋domain

`src/domain/liveMidi/`はReact、Zustand、Tauri API、現在時刻の直接参照に依存しない。時刻は引数として受け取る。

- `noteStateReducer.ts`: channelごとのNote On/Off、velocity 0、同音の重複count、CC64を処理する。
- `liveBass.ts`: held noteの最低音を優先し、次にsustained noteの最低音をBassとする。
- `liveChordDetector.ts`: 3 pitch class以上でコード候補を採点する。既存`chordTemplates`を再利用し、上位候補とBassを含む`ChordSymbol`を返す。
- `chordStabilizer.ts`: 分散入力、音の追加、部分release、全releaseによる短時間の表示揺れを抑える。
- `chordHistory.ts`: 400ms安定したコードを履歴へ追加し、連続する同一ラベルを重複登録しない。
- `historyImport.ts`: 選択された履歴を`SavedProgressionBlock`へ変換する。

主要タイミング定数は次のとおり。`src/domain/liveMidi/constants.ts`

| 項目 | 値 |
|---|---:|
| gather | 80ms |
| stable | 120ms |
| release grace | 250ms |
| full release | 300ms |
| history commit | 400ms |
| history limit | 64件 |

### 3.4 Live MIDI store

`src/liveMidi/liveMidiStore.ts`は`zustand/vanilla`の独立storeであり、Vault storeとは分離されている。

主なstate:

- `active`, `devices`, `selected`, `status`, `error`
- `preferences`
- `notes`, `stabilizer`, `current`
- `historyState`, `history`

主なaction:

- `activate()`, `deactivate()`
- `refreshDevices()`, `selectDevice()`
- `setPreferredDevice()`, `testDevice()`
- `setShowHistory()`, `clearSession()`

active中は40ms周期で表示状態を進め、2秒周期でデバイス一覧を再確認する。切断またはerror時にはnote stateと現在コードをclearし、古い音が残ることを防ぐ。

`setPreferredDevice()`は設定だけを保存し、デバイスを自動openしない。`testDevice()`は設定画面から対象をopenして直ちにcloseし、backendの実エラーを結果として返す。

## 4. ミニウィンドウ

別windowや別WebViewは作らず、既存のmain windowを変形する。React rootとVault storeは維持される。`src/liveMidi/miniWindowController.ts`

- 通常サイズ: 初期1120 x 760、最小768 x 640
- ミニサイズ: 340 x 200、最小280 x 160
- ミニ開始前にposition、size、maximized、fullscreen、monitorをsnapshotする。
- 保存済みmini位置を利用可能monitorのwork area内へ補正する。
- ミニ中は既定でalways-on-topを有効にする。
- 復帰時に通常位置・サイズ・最大化・全画面状態を戻す。
- ミニ位置は次回利用のためpreferencesへ保存する。

Tauri window操作に必要なACLは`src-tauri/capabilities/default.json`へ明示している。今回の実機診断で、`window.setMinSize()`に必要な`core:window:allow-set-min-size`が不足していたため追加した。

## 5. 設定と永続化

Live MIDI preferencesはVaultの`data.json`へ入れず、次のlocalStorage keyへZod検証付きで保存する。`src/liveMidi/preferences.ts`

```text
loop-vault:live-midi-preferences:v1
```

保存対象:

- `preferredInput`: backend ID、デバイス名、直前index
- `miniBounds`: x、y、width、height
- `alwaysOnTop`
- `showHistory`

不正JSONまたはschema不一致時は`{ alwaysOnTop: true, showHistory: true }`へ戻す。Live note、接続状態、現在コード、履歴は永続化しない。

設定画面では次を実装した。`src/components/LiveMidiSettingsSection.tsx`

- 入力デバイス一覧の表示
- 既定入力の保存
- 一覧の再読み込み
- open/closeによる接続テスト
- 保存済みデバイスが見つからない場合の警告
- backend詳細を含む接続失敗表示

## 6. Vault取り込み

Live履歴は自動保存されない。ミニモードを終了した後、ユーザーが範囲と保存先を確定した場合だけVaultへ反映する。`src/App.tsx`, `src/components/LiveMidiImportDialog.tsx`

保存時はrepositoryへ直接書き込まず、既存の`createIdeaFromDraft()`と`appendBlockToIdea()`を使用する。そのため、通常の`applyVaultChange()`、autosave、バックアップ経路を通る。

生成される`SavedProgressionBlock`の主な値:

- `origin: "live-midi"`
- 1履歴コードを1小節、beat 1、4拍として配置
- `confidence: 0`
- `analyzerVersion: "live-chord-v1"`
- `userEdited: false`
- `userVerified: false`

未検証のLive判定へ見かけ上の高confidenceを付けない。`fileVersion`は1、`defaultAnalyzerMode`は`legacy`のまま変更していない。

## 7. 追加不具合の診断と修正

### 7.1 当初の症状

`Live MIDI`を押すと通常画面のままになり、「MIDIデバイスを開けませんでした。他のアプリが使用中か、接続が失われた可能性があります」と表示された。

### 7.2 診断結果

Windows上では次の3入力を確認した。

- `MOTU M Series MIDI In`
- `APC40 mkII`
- `Roland Digital Piano`

WinMM直接openと、アプリと同じ`midir`経路の双方で3デバイスすべてopenに成功した。したがって、デバイス占有は原因ではなかった。

WebView2 DevTools Protocolでミニモード処理を順番に実行したところ、MIDI接続より前に呼ばれる`window.setMinSize()`で次のエラーが発生していた。

```text
Command plugin:window|set_min_size not allowed by ACL
```

さらにTauriはこのエラーを文字列で返すが、`src/App.tsx`のcatchが`Error`以外をすべてMIDI open失敗文言へ置換していた。このため、window ACLの失敗がMIDIデバイス競合として誤案内されていた。

### 7.3 修正内容

- `core:window:allow-set-min-size`をTauri capabilityへ追加した。
- Tauriの文字列エラーを保持する`errorMessage()`を追加した。
- fallbackをMIDI open失敗ではなく「ミニモードを開始できませんでした」へ変更した。
- ACL permissionが消えた場合に失敗する回帰テストを追加した。
- 日本語と英語の文言を追加した。

修正後のWindows実機操作では、`Live MIDI`クリック後にウィンドウが340 x 200へ変形し、保存済みの`Roland Digital Piano`が「接続済み」になることを確認した。

## 8. テスト・ビルド結果

最新コミット`d459f09`時点の結果:

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test -- --run` | PASS: 97 files / 571 tests |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| Windows実機: mini遷移 | PASS: 340 x 200 |
| Windows実機: 保存済みデバイス接続 | PASS: Roland Digital Piano / 接続済み |

L6時点ではRustの`cargo test` 1件もPASSしている。最新Tauri buildでもRust release buildは成功した。

生成物:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

既知のビルド警告は、JavaScript chunkが500kBを超えていること。ビルドおよび実行は成功している。

## 9. PRスタック

全PRは2026-07-17時点でopenであり、まだ`master`へマージしていない。依存順は次のとおり。

1. [#106 L0 Audit](https://github.com/Takuyakou/loop-vault/pull/106) -> `master`
2. [#107 L1 MIDI Transport](https://github.com/Takuyakou/loop-vault/pull/107) -> #106 branch
3. [#108 L2 Live MIDI Domain](https://github.com/Takuyakou/loop-vault/pull/108) -> #107 branch
4. [#109 L3 Mini Window](https://github.com/Takuyakou/loop-vault/pull/109) -> #108 branch
5. [#110 L4 Mini UI](https://github.com/Takuyakou/loop-vault/pull/110) -> #109 branch
6. [#111 L5 History Import](https://github.com/Takuyakou/loop-vault/pull/111) -> #110 branch
7. [#112 L6 QA Report](https://github.com/Takuyakou/loop-vault/pull/112) -> #111 branch
8. [#113 MIDI Device Settings / Mini Mode Fix](https://github.com/Takuyakou/loop-vault/pull/113) -> #112 branch

マージ時は#106から#113まで下から順番に行い、各段のbaseを必要に応じて`master`へ更新する必要がある。

## 10. 未実施・既知の制約

1. 物理鍵盤を実際に演奏した状態でのコード表示、体感遅延、サステインペダル、グリッサンドは未確認。
2. Synthesiaとの同時openは未確認。MIDI driverがmulti-clientに対応するかに依存する。
3. 物理切断は2秒pollingで検出する。OSのhotplug callbackではない。
4. `midir`から永続device IDを取得できないため、indexと名前を用いる。重複名が曖昧な場合はユーザーの再選択が必要。
5. `bassGraceMs`は定義済みだが、Bassだけを独立して120ms保持する専用stateはない。
6. Rust backendの詳細エラー文は現状日本語で生成されるため、英語UIでも詳細行は日本語になる場合がある。
7. MIDI Thru、複数入力の統合、velocity表示、live key/degree、MIDI event録音、アプリ内ピアノ音源は未実装。
8. Live履歴の1コード=1小節変換は固定で、実際の演奏時間や拍子を保存ブロックへ反映しない。

## 11. 次の確認項目

1. 設定画面で使用するMIDI入力を選び、`接続をテスト`が成功すること。
2. `Live MIDI`で340 x 200のミニモードへ切り替わり、自動接続されること。
3. 単音、三和音、四和音、転回形、arpeggioで表示内容を確認すること。
4. サステインを使用し、構成音とBassに不自然な残留がないこと。
5. `戻る`、`Esc`、`x`終了、最大化状態からの往復を確認すること。
6. Live履歴を新規Ideaと既存Ideaへ保存し、アプリ再起動後もVaultに残ること。
7. Synthesia単独、Loop Vault単独、両方同時の順に接続可否を確認すること。

## 12. 引き継ぎ上の注意

- Live MIDIの音楽ロジックを変更する場合は`src/domain/liveMidi/`の純粋性を維持する。
- MIDI backend固有処理は`src-tauri/src/live_midi/`、Tauri連携は`src/liveMidi/`へ置く。
- Liveセッション情報をVault schemaへ安易に追加しない。永続化が必要な場合は、ユーザー確定後に既存Vault store actionを通す。
- window APIを追加する場合は、実装だけでなく`src-tauri/capabilities/default.json`の対応permissionとWindows実機動作を確認する。
- Tauri commandは文字列errorを返すため、`instanceof Error`だけで判定せず実メッセージを保持する。
