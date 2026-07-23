# Loop Vault Phase 3.9.0 実装報告書

## 結論

Chord Dojo MVP（L1〜L3、Step、Flow、仮クリア、別日確定）を実装した。

自動検証とブラウザ表示確認は完了した。物理MIDIキーボードを使う実機確認と別日確定はユーザー確認待ちのため、Phase 3.9.0の状態は**暫定完了**とする。

## 実装範囲

### D0: Audit / Baseline

- Phase 3.8.5 Voicing Resolver、Live MIDI、PlaybackController、Vault保存、i18nの実APIを監査した。
- 監査結果: `docs/phase3.9.0-chord-dojo-audit.md`
- 計画書: `docs/phase3.9.0-chord-dojo-plan.md`

### D1: Practice Domain

`src/domain/practice/` にReact、Zustand、Tauri、Tone、現在時刻へ依存しない純粋層を追加した。

- `chordRequirements.ts`: easy / normal / strictの必要音・任意音・許可音
- `matchPerformance.ts`: held noteだけを使うpartial / match / wrong判定
- `inputState.ts`: Live MIDIのheld / sustained分離
- `sessionMachine.ts`: 100ms安定判定、Step / Flow、同一コード再アタック
- `cleanRound.ts`: clean round判定
- `progressionFingerprint.ts`: 音楽内容だけを対象にした決定的fingerprint
- `practiceProgress.ts`: 仮クリア、別日確定、最高確定Level保持
- `recommendation.ts`: 練習キューの決定的おすすめ順

主な判定仕様:

- 転回形とオクターブ重複は許可
- 通常のperfect 5thはnormalで任意、strictで必須
- dim / half-dim / augのaltered fifthは必須
- 明示7thと特徴的extensionをnormalで必須
- sustain pedalだけで残る音は判定へ含めない
- stableな構成外音はwrongとなりroundをdirtyにする
- partialはmiss扱いしない
- 同じコードが連続する場合も新しいNote Onを要求

### D2: Practice UI / Step / L1〜L3

- 常設ヘッダーへ「練習 / Practice」を追加
- 左に軽量な練習キュー、右に道場を配置
- Progression Detailへ「練習する」を追加
- L1: コード名、guide Voicing、held notesを表示
- L2: コード名とheld notesを表示し、guide Voicingを隠す
- L3: 度数とheld notesを表示し、Key未設定時は無効化
- Step: 100ms match後に次コードへ進む
- guideはPhase 3.8.5 Resolverをそのまま使用
- MIDI接続は`defaultLiveMidiStore`を共有
- MIDI切断時はsessionをpauseし、roundをdirtyにしない
- Escでrunning sessionをpause
- 日本語 / English対応

主要ファイル:

- `src/views/PracticeView.tsx`
- `src/components/practice/PracticeKeyboard.tsx`
- `src/components/AppShell.tsx`
- `src/App.tsx`

### D3: Flow / Persistence / Badges

- Tone.Transportを時間源にする`PracticeClock`を追加
- 4/4 Flow、メトロノーム、前後180ms判定窓を実装
- missでもClockを止めず次eventへ進む
- 連続2 clean flow roundsで仮クリア
- provisionalとは異なるローカル日付の1 clean roundで確定
- 低いLevelを再練習しても`confirmedLevel`を下げない
- 進行編集後はfingerprint不一致としてstale表示
- stale進捗は自動削除せず、明示リセット後に新しく開始
- note単位では保存せず、clean round、session終了、画面離脱、stale resetで保存
- 保存は既存`updateProgressionBlock()` → `applyVaultChange()` → autosaveを通す
- Queue、Vault、Idea Detail、Progression Detailへ段位バッジを追加

主要ファイル:

- `src/practice/PracticeClock.ts`
- `src/components/practice/PracticeProgressBadge.tsx`
- `src/views/VaultView.tsx`
- `src/views/DetailView.tsx`
- `src/views/ProgressionDetailView.tsx`

## データモデル

`SavedProgressionBlock`へ次のoptional fieldを追加した。

```ts
practice?: ProgressionPracticeProgress;
```

永続化するもの:

- `schemaVersion`
- `progressionFingerprint`
- `confirmedLevel`
- `provisional`
- `lastPracticedAt`

永続化しないもの:

- 演奏note
- miss数、正答率、score
- session時間
- BPM履歴
- clean round総数
- 現在位置、held state

`fileVersion`は1のまま。旧data.jsonは`practice`なしで読み込める。

## 既存境界の維持

- `defaultAnalyzerMode`: legacyのまま
- MIDI parser / analyzer / Voice Role / weights: 変更なし
- Voicing抽出ロジック: 変更なし
- LLM / Ollama / OpenAI: 変更なし
- Rust MIDI transport: 変更なし
- repository直書き: なし
- Live MIDI Mini Mode: 既存storeとserviceを再利用
- Playback: session開始前に既存再生を停止し、単一再生境界を維持

## 自動検証

- `npm run lint`: PASS
- `npm test -- --run`: 131 files / 712 tests PASS
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- `cargo test`: 24 tests PASS
- `npm run tauri build`: PASS
- `git diff --check`: PASS

ブラウザQA:

- デスクトップ幅: PASS
- 390 x 844: PASS
- 横方向overflow: 0
- console warning / error: 0
- 空Vaultの練習キュー表示: PASS

既知の警告:

- Vite buildで500kB超のJS chunk警告。既存のTone.js等を含むbundleで、buildは成功。

## 生成物

- `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

## 対象外・未実装

計画どおり次は実装していない。

- L4 / L5、移調練習、12キー
- Mix Session
- アルペジオRolling Window
- MIDI Thru、内蔵音源
- latency補正wizard
- 点数、ランキング、正答率、練習履歴グラフ
- 本格SRS
- 4/4以外のFlow
- Flow tempo ramp UI（計画上optional）

## 残る確認

- 物理MIDI鍵盤でL1〜L3の判定
- CC64 sustainが判定へ混入しないこと
- repeated chordで再アタックが必要なこと
- Flowの体感タイミングとメトロノーム
- 同日仮クリアが確定にならないこと
- 別日確認でconfirmedになること
- 実データを使ったstale表示と明示リセット

詳細手順は`docs/phase3.9.0-user-verification-checklist.md`を参照。

