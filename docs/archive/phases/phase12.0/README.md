<!-- phase-id: 12.0 -->

# Phase 12 — Chord Dojo の作り直し

Chord Dojo を「今日の練習」1つの入口で、コードの構成を知る → 型を覚える → 登録した音を覚える → 進行を覚えて弾く、が回る練習に作り直すフェーズ。基本仕様は [contracts/P12-chord-dojo-spec.md](contracts/P12-chord-dojo-spec.md)（v1.4、Freeze）。承認済み [Theme Lesson + GrandStaff v1.0](contracts/theme-lesson-score.md) のテーマ計画・固定ターゲット・答案ポリシーを優先し、旧新規2件上限を撤廃する。1つの段階（P12.0-01）の中を区切り0〜4に分けて、最後まで進める。実装する AI が zip を受け取り、途中で承認を求めずに最後まで進める。

最初にリポジトリルートの `AGENTS.md` を読み、次にこの README、次に下の Required Reading Order に従う。Git の実態が常に正で、この文書と食い違う時は Git を信じて差異を報告に書く。

## Status

- **Status:** Active（技術検証・独立レビュー完了／人間受入れ待ち）
- **Active stage:** P12.0-01
- **Completed stages:** なし
- **Base:** local `master`（何も取り込まない）
- **Next action:** source 7aef92acのMaster両手Form教材はfresh FULL4137/395/27・native19・同HEAD FAST/FEATURE/UI・通常44/Master200画像・新EXEで検証済み。実音/身体運指/内蔵進行/人間30和音計測/製品保存先再起動/OS倍率は人間受入れ待ち。Phase12 in-progress、merge/pushなし。 [最新報告](reports/P12.0-01-master-form-templates.md)。

段階の終わりに、この節・[`execution-state.json`](execution-state.json)・段階の報告を揃えて更新する。

## Required Reading Order

1. Root `AGENTS.md`（リポジトリルート。ここからはリンクしない）
2. [work-instructions.md](work-instructions.md) — 範囲と完了条件
3. [contracts/P12-chord-dojo-spec.md](contracts/P12-chord-dojo-spec.md) — Chord Dojo の仕様（v1.4）
4. [contracts/theme-lesson-score.md](contracts/theme-lesson-score.md) — 承認済み追加契約（旧計画／表示ポリシーを更新）
5. [execution-state.json](execution-state.json) — 再開用の状態
6. [../phase10.0/contracts/P10-autonomous-run.md](../phase10.0/contracts/P10-autonomous-run.md) — 全自動で進める時の決まり（そのまま使う）
7. [../phase10.0/contracts/P10-test-and-evidence.md](../phase10.0/contracts/P10-test-and-evidence.md) — テストの回し方と証跡
8. [stages/P12.0-01.md](stages/P12.0-01.md) — 段階の指示書
9. [reports/README.md](reports/README.md) — 報告の置き場所

モック（`chord-dojo-mock.html`）は zip の `mocks/` にあり、Git 管理外の `p12-generated/mocks/` に置く。

## Stages

### P12.0-01 — Chord Dojo の作り直し

区切り0 調べる → 1 記録と組み立て → 2 画面と型 → 3 登録した音と進行 → 4 片付け・締めくくり。仕様で「人間が決める」とした所は、指示書の決まりで仮に決めて進め、最後に人間が見る。

## Rules recap

- 安全の規則は root `AGENTS.md` が正。全自動の決まりは Phase 10 の `P10-autonomous-run.md` をそのまま使う。
- Vault の保存形式（`fileVersion: 2`）は変えない。記録は Vault の外。最新候補は `theme-lessons-ranges-v4/chord-dojo-v1.json` に保存し、v1〜v3を移行する。旧記録を初回だけ読み取り専用で取り込む（[音域と保存境界](contracts/251-master-register.md)）。`block.practice` は読むだけ。
- Voicing Loop・Bass Practice・取り込む・進行ページの見た目と動きは変えない。サイドバーの「設定」のアイコンは変えない。
- merge 候補で止める。push・tag・release はしない。
- 私的な Vault の中身・MIDI・音声・`.local-evaluation` の中身・個人のパスは読まない・コミットしない。

最新のMaster変更は [学習・復習・Mixedと表示](contracts/251-master-learning-review.md) を優先する。新規学習は指定キー順・独立Recall完了、復習は全Form/個別Form、Mixedは学習済み混在。

## 最新追加候補

Master原音域/1オクターブ下は[最新報告](reports/P12.0-01-master-octave-down.md)、[音域契約](contracts/251-master-register.md)、[再開状態](master251-state.json)を参照。source d0f66cdc のMaster1オクターブ下はfresh6ゲート、関連378/native19、両音域画像404＋補助native7、新EXEで検証済み。音域別target/成績・初回read-only import/旧EXE保存先分離を最新reportで確認。親から今回sourceの独立レビューPASSを受領。未解消P1/P2なし。 実MIDI/実音・教材/運指・製品識別子の移行/再起動・OS/WebView zoomは人間受入れ待ち。Phase12はin-progress、merge/pushなし。

前回の表示・学習・復習/Mixedは[履歴](reports/P12.0-01-master-ui-learning-review.md)、音声/固定教材/pedalは[履歴](reports/P12.0-01-master-monitor-progression-fingering.md)に保持。

限定監査の追記: [Form A/C 左手単音列の実solver境界](reports/251-sequence-boundary-audit.md)（監査source bab31149、製品d0f66cdcは不変）。実call-throughと全候補評価、正式再生成jobの48cell一致、固定UIの0solver calls、3negative controlsを確認。focused29/関連140/FAST81/FEATURE90unit+52browser PASS。過去生成jobの履歴と今回の再生成証明を区別。Phase12の状態と製品受入れ待ちは継続。

最新作業: [Master Form両手教材テンプレート](contracts/251-master-form-templates.md)。2026-10-07の最新指示による両手教材とoverride0を保持し、source7aef92acの全ローカル技術ゲート・画面・EXE・報告を完了。実装前は原音域48実評価/96数学的投影と明記し、最終実コードで96音域/288コードを別に確認。CSV P2は49物理行/11列で修正。人間の身体/実音受入れ待ち。

最新製品ソース7aef92acと最終文書の証拠は[Master両手教材報告](reports/P12.0-01-master-form-templates.md)を正とする。上のd0f66cdc/bab31149記載は履歴。親からsource ffedfd2ccdd32650679fb9e8408824845894f786の独立実装レビューPASSを受領。レビュー範囲はindependent-implementation-review.jsonに記録し、別source/追加の同期テストへ自動で拡張しない。
