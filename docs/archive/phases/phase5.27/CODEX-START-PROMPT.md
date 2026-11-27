# P5.27 Codex Start Prompt

Phase 5.27 — Progression Voicing Practice を開始してください。

最初に全文確認:

1. root AGENTS.md
2. root CLAUDE.md
3. docs/phase5.27/README.md
4. docs/phase5.27/execution-state.json
5. docs/phase5.27/work-instructions.md
6. proposal/*
7. contracts/*
8. references/*
9. approved HTML mock

Git realityを照合。

今回は:

`P5.27-00 — Repository / Practice Architecture / Rule Audit`

のみ実行。

production behaviorを変更しない。

必ず監査:
- Chord Dojo Flow/Step
- existing Shell/Open/Rootless/Source/Auto voicing
- P5.26.1 shared voicing resolver
- Custom Voicing
- Text save path
- Progression Detail handoff
- Practice snapshot
- transport/metronome/count-in
- Live MIDI monitor
- feature flags/settings
- cleanup/lifecycle

UI Skill:
`$emil-design-eng` availabilityを確認。

未導入ならStage00 reportに:
`npx skills@latest add emilkowalski/skills`
を記載し、Stage03 UI implementationより前にSTOPできる状態にする。

Stage00でLesson Rule Tableを固定する。

禁止:
- P5.19.1をdependencyにする
- Open Voicing実装
- Top Note自動生成
- scoring
- success/failure
- Source/Custom silent fallback
- unsupported Lesson ruleを一般理論で補完
- Chord Dojo generator複製
- independent UI timers
- Vault schema/fileVersion変更
- private MIDI/audio commit
- reset/stash/discard
- git add -A / git add .
- merge/push/P5.28

PASS後にaudit/report/state/commit/clean statusを更新して停止。
