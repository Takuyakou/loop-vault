# P11-01 — 区間ループ実装・検証

## 結論

Session-only の A–B Range Loop を元の full snapshot / full Voicing plan 上に実装した。Vault v2、Generator、source note set は変更していない。P11-01 後の Human Gate で停止する。

## 選んだこと / 理由 / 別案

- **選んだこと:** Architecture B（Transport V2 に native loop bounds）。**理由:** 元の card ordinal、global beat、3/4・5/4 の拍子位相、既存 plan をそのまま保持し、途中切替を現コード境界に合わせられる。**別案:** 短い派生 snapshot は ID、拍、カウントイン位相を逆変換する必要があり、再生と UI の二重座標になる。
- **選んだこと:** 右クリック1回目は pending A、2回目に正規化した A–B を一括確定。Shift+右クリックは1カード、Shift+F10/Menu は通常右クリック相当。**理由:** 古い区間を pending 中に維持し、誤選択を Esc で取り消せる。**別案:** 最初の右クリックで即時切替すると演奏中の意図しないジャンプが起こる。
- **選んだこと:** 再生中の区間差し替え・解除は現在のコードの終端で実施。解除時は次の自然な全進行カードへ進む。**理由:** 音を途中で切らず、二重発音を防ぐ。**別案:** 操作直後に先頭へ戻すとクリア時に音楽の流れが断絶する。
- **選んだこと:** 区間開始時のカウントインは元拍子1小節、途中切替はカウントインを追加しない。**理由:** 元の beat 1/3 を偽の1拍目に変えない。**別案:** 4拍 PracticeGroup を区間拍子として扱うと 3/4・5/4 の source truth とずれる。

## 実装

- `src/domain/progressionVoicingPractice/rangeLoop.ts`: card index による pending/active、逆順、同カード、直接1カード、元拍からの範囲導出。
- `src/domain/progressionVoicingPractice/clock.ts`: full progression の座標で範囲投影、区間ループ回数、元拍子の beatInBar。途中切替では既に使った count-in 長を固定。
- `src/practice/ProgressionVoicingTransport.ts`: rolling scheduler を元 snapshot の対象区間に制限。次のカード境界で切替、古い look-ahead attack を無効化し、新 A を1回発音。Stop/Restart/Seek は現在の range を扱う。CC64 は Tone/WebAudio 経路にないため NOT_APPLICABLE。
- `src/views/ProgressionVoicingPracticeView.tsx`: 右クリック・キーボード、A/B と pending 表示、区間 chip、範囲外カードの選択のみ、Esc と clear。キーボード操作で native contextmenu が重複発火する実ブラウザ事象は抑止した。

## Gateと証跡

- Range domain / Transport / View focused: 117/117 PASS。最終 candidate は fresh FEATURE 内で全 Vitest 3638/3638 PASS。
- App / E2E TypeScript、変更ファイル ESLint: PASS。
- Playwright P11-01: 5/5 PASS。1920 / 1444 / 1280 / 960px における no-range / pending A / A–B / one-card の16画像を Git 管理外の `test-results/p11-range/` に生成した。960px のマーカーとコード名の重なりを視覚確認して修正済み。
- FEATURE fresh（最終 candidate）: 236.2秒、Vitest 3638/3638、Playwright 161/161 PASS。PASS cache 不使用。
- Phase docs / AI handoff / class lint / source contracts / changed ESLint / App TypeScript: fresh FEATURE で PASS。`git diff --cached --check` と `trackedSecurityScan` も PASS。

## 残る制約・Human Gate

- generated type の命名・移行は P11-00 の提案のままであり、人間承認前に P11-02へ進まない。
- FULL と EXE は契約上 P11-06 の完了 Gate。P11-01 では実施しない。
- Screenshot は公開安全な synthetic fixture のみ。私的 MIDI、録音、Vault は使用していない。
