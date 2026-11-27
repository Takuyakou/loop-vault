<!-- phase-id: 10.0 -->

# Phase 10 — Work Instructions

## Goal

取り込んだ MIDI のコード進行を、怪しい所だけ順に確かめて、数クリックで直し、保存できるようにする。完了時は、MIDI 取り込み後の画面が [仕様書](contracts/P10-correction-workspace-spec.md) の修正作業場に置き換わり、修正の手間（直した回数と時間）が P10.0-00 の基準より減っている状態。

## Scope

- MIDI 取り込み後の結果画面の全体：ファイル帯、曲全体の帯、タイムライン（小節・セクション・コード・ピアノロール）、右の欄、保存。
- 既存の編集機能の統合：手動候補の編集、自動候補の編集、曲全体のコード、Draft バー、別候補、同じ直しの反映。
- 取り込みの下書きの上での可逆な編集：外す・戻す・足す・消す・高さを直す・つなぐ・分ける・境目・名前・このままでよい。
- 長い曲の表示（倍率・見えている範囲だけ描く・要確認への移動・再生の追従）。
- 修正の手間の計測（手元だけ）。
- （任意、人間が決めた場合）人が直した音を、コード名と合うかに関係なく鳴らす再生の直し（P10.0-01）。

## Non-goals

- 解析ロジック（Core C、`src/domain/midi/` の Analyzer／Extractor、Identity／Decoder）の変更。Phase 9 の研究部品の取り込み。
- Vault の保存形式の変更（`fileVersion: 2` のまま）。保存した後に、外した音などを完全に元へ戻す仕組み（別の保存のフェーズ）。
- transport scheduler の変更。P10.0-01 以外での再生の選び方の変更。
- 解析前のパート選択の中身、テキストからの取り込み、Live MIDI、保存後の進行ページ。
- 新しい依存パッケージ、ライトモード、英語表示。

## Contracts

- [P10-correction-workspace-spec.md](contracts/P10-correction-workspace-spec.md) — 画面の仕様（Freeze 済み、v2.5）
- [P10-autonomous-run.md](contracts/P10-autonomous-run.md) — 全自動で進める時の決まり、迷った時の扱い、止める条件
- [P10-test-and-evidence.md](contracts/P10-test-and-evidence.md) — Test DX の使い方、基準画像、スクリーンショット、報告

保存データの保持は、Phase 8.9 から続く往復テスト（`src/domain/p89DataRetention.test.ts`）を引き続き使う。

## Stages

README の段階一覧と同じ。各段階の詳しい作業と完了条件は `stages/P10.0-NN.md` に置く（段階の zip で追加）。

P10.0-02 以降の最初の作業は、次の順にする。

1. 今の取り込み画面のロジックを hook / controller に分ける（見た目は変えない。独立した commit）。
2. 既存のテストがそのまま通ることを確かめる。
3. 新しい作業場に差し替える。古い部品の撤去は P10.0-06 でまとめて行う。

## Definition of Done

段階の完了条件（全段階共通）：

- merge 候補の HEAD で `npm run test:full` が fresh に PASS。
- 製品の画面を変えた段階では、4つの大きさ（1920×1080・1440×900・960×1032・768×640）のスクリーンショットがあり、報告から場所を示している。
- データ保持の往復テストが PASS。
- 製品コードを変えた段階では Tauri で EXE を作れる。
- 報告（日本語）が `reports/` にあり、README の Status と `execution-state.json` が揃っている。

フェーズの完了条件：P10.0-00・02〜07 が完了し（P10.0-01 は行った場合のみ）、取り込み後の画面が修正作業場に置き換わり、P10.0-07 の計測で直した回数と時間が基準より改善し、最終の fresh FULL が PASS。

## Safety

root `AGENTS.md` に従う。push・tag・release はしない。私的な音声・MIDI・`.local-evaluation` の中身・個人の絶対パスはコミットせず、報告にも書かない。`.local-evaluation/` は `test-logs/` と `gate-cache/` だけ読んでよい。
