# Loop Vault Phase 5.1 Final Report

## Result

Phase 5.1 Multi-MIDI Source Selection & Pre-Analysis Piano Rollを完了した。
Phase 5のコード検出score、threshold、candidate順位は変更していない。

ユーザーはMIDI解析前に次を行える。

- 1件または複数MIDIを同時選択・ドラッグ&ドロップ
- 追加MIDIの読み込み、source削除、表示、Mute
- 全sourceのVoiceを共通時間軸のCanvas Piano Rollで確認
- Voiceごとの表示、Mute、Solo試聴
- `harmony / bass / melody-weak / exclude`の確認・変更
- Auto、和音+ベース、伴奏のみ、全パート、Custom preset
- tempo/meter/duration/start位置とduplicate warningの確認
- 確定した構成を既存`phase4-v1`解析へ渡す
- 解析後も同じsessionへ戻って再選択・再解析
- Role訂正ログのopt-out、export、delete

## Stacked Pull Requests

| Stage | PR | Content |
|---|---|---|
| P5.1-00 | [#301](https://github.com/Takuyakou/loop-vault/pull/301) | Repository audit、baseline lock、evaluation contract |
| P5.1-01 | [#302](https://github.com/Takuyakou/loop-vault/pull/302) | Voice抽出、GM metadata、pre-scan |
| P5.1-02 | [#303](https://github.com/Takuyakou/loop-vault/pull/303) | AnalysisSession、複数MIDI、PPQ正規化、duplicate guard |
| P5.1-03 | [#304](https://github.com/Takuyakou/loop-vault/pull/304) | Pre-analysis UI、Canvas Piano Roll、preset、warning |
| P5.1-04 | [#305](https://github.com/Takuyakou/loop-vault/pull/305) | Analyzer統合、A/B互換経路、rollout設定 |
| P5.1-05 | [#306](https://github.com/Takuyakou/loop-vault/pull/306) | 試聴、Mute/Solo、privacy-safe Role訂正ログ |
| P5.1-06 | [#307](https://github.com/Takuyakou/loop-vault/pull/307) | A〜E評価、性能、privacy監査、production build |

全PRは依存順に積んであり、mainへはマージしていない。

## Evaluation

- Dev: 4 fixture / 64 events、全Gate PASS
- Validation: 4 fixture / 64 events、全Gate PASS
- Holdout: 4 fixture / 64 events、凍結後に一度だけ実行、全Gate PASS
- A/B解析結果: 全12 fixtureでdeep equal
- Voice isolation: PASS
- exact duplicateを一度だけ使用: PASS
- deterministic: PASS
- Existing Voicing Gold Corpus: 60 files / 496 events
- 実MIDI: 2件、匿名集計のみ、両方A/B deep equal
- 104小節実MIDI: pre-scan 33.34ms、session解析502.23ms
- 180小節fixture: 解析793〜870ms、10秒Gate内
- 100,000 notes: Canvas 1、note DOM 0、性能test PASS

## Automated Verification

| Check | Result |
|---|---|
| `npm run lint` | PASS |
| `npm test -- --run` | 233 files / 1,806 tests PASS |
| `npx tsc --noEmit` | PASS |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 24 tests PASS |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| `git diff --check` | PASS |
| tracked MIDI | 0 |
| tracked `.local-evaluation` | 0 |

Web buildには既存のchunk size warningが1件残る。build失敗ではなく、
Phase 5.1の停止条件であるUI操作不能、memory leak、3分MIDI 10秒超には該当しない。

## Compatibility And Privacy

- application source commit: `68e51ec2ab9c69db364473a3f1acce12de4e7371`
- `defaultAnalyzerMode`: `phase4-v1`
- `fileVersion`: `1`
- `src/domain/schema.ts` SHA-256:
  `7770a544139f57579a5079e423ddc0b9d4c93e881d284f9e25bc18be9caf3137`
- raw MIDI、bytes、absolute MIDI path、runtime file name、track name本文を永続ログへ保存しない
- Vault schema、SavedProgressionBlock、Live MIDI、Chord Dojoを変更しない
- Stable profileと明示OFFで従来Phase 5経路へrollback可能

## Production Artifacts

Build source: `68e51ec2ab9c69db364473a3f1acce12de4e7371`

| Artifact | Size | SHA-256 |
|---|---:|---|
| `src-tauri/target/release/loop-vault.exe` | 14.107 MiB | `05b2fa7ab33c5fb59ea77c1a2bc3c18336481e0f5c0c1a1f13a686ddac87a4d0` |
| `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi` | 4.879 MiB | `e965c7d6cd3257b90b87945da7c57be43a4325933a36a82b78abe44b280e44d1` |
| `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe` | 3.438 MiB | `61bb7e85443f4356fedb2140cdd726cf6321004d22fe29de226ba1eeea98b2ce` |

Build time: 2026-07-29 21:45 JST。
