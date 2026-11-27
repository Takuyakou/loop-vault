<!-- phase-id: 5.18.2 -->
# Contract 02 — Live Title Boundary

Vault titleはpicker presentation ViewModel/search indexにのみ存在可能。
以下へ保存禁止:
- VaultChordContextSnapshot
- Practice JSON
- History
- RecordingTake metadata
- reports
- logs/telemetry

missing/empty/whitespaceは `無題の進行` 等のneutral fallback。
Title searchは既存key/section/chord searchへの追加。
Testsはsynthetic titlesのみ。
