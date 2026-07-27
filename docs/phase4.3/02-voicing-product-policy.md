# P4.3 Voicing Product Policy

## 3 Gold Policy

### Source-faithful

Vaultへ保存する元MIDIボイシングの正。区間で実際に代表的に鳴った配置を保持する。
コード名と不一致でも元MIDIノートを黙って削除しない。不整合はreview/stale/fallback
として表面化させる。

### Aggregate-harmony

アルペジオや分散和音を含む区間の和声note set。製品表現は
`aggregated-note-set` とし、`simultaneous-voicing`と偽らない。
現行resolve policyでは未確認aggregateを自動演奏に使わない。

### Dojo-integrated

上部構造と開始時Bassを統合した練習用派生ターゲット。Source-faithful snapshotを
上書きしない。Dojoが必要に応じて派生またはgenerated配置を選ぶ。

## 保存と利用

- `voicingMemory.sourceVoicing`: 元MIDI由来
- `voicingMemory.practiceVoicingOverride`: ユーザーの練習用override
- 保存対象にGold policy名を新設しない。Phase 4.3ではschemaを変更しない。
- 互換性は`capturedForChordKey`と現在Chordの比較で判断する。
- compatibleかつuser verifiedならsourceを使用する。
- 未確認sourceはsimultaneous + confidence gate通過時だけ自動使用する。
- aggregate、低confidence、stale、invalidはgenerated fallbackへ落とす。

## Bass方針

Bassを含める正解は目的ごとに違うため、1つのGoldへ固定しない。

- Source-faithful: 実際の代表frameに含まれるBass
- Aggregate-harmony: 区間内の和声Bass
- Dojo-integrated: 開始時Bassを練習配置へ統合

Phase 4.3の評価では3列を別々に採点し、合算F1を主要指標にしない。

## Product safety

- コード名に合わせたnote削除をしない
- aggregateをsimultaneousとして保存しない
- Dojo派生配置でsourceを上書きしない
- chord編集後のstale sourceを自動使用しない
- generated fallback使用を成功したsource抽出として数えない
- Gold roleを製品Analyzerへ注入しない

## Phase 4.3で変更しないもの

- `VoicingSnapshot` / Vault schema
- `fileVersion = 1`
- extractor scoring、confidence threshold、最大note数
- detector root / quality / tension
- `defaultAnalyzerMode = phase4-v1`
