<!-- phase-id: 5.18.2 -->

# Phase 5.18.2 窶・Vault Source Discoverability

## Status
`IN PROGRESS — P5.18.2-00 complete; P5.18.2-01 not started`

## Single entry point
縺薙・ `README.md` 繧・Phase 5.18.2 縺ｮ蜊倅ｸ蜈･蜿｣縺ｨ縺吶ｋ縲・
Claude Code / Codex 縺ｯ逹謇九・蜀埼幕縺ｮ縺溘・縺ｫ谺｡縺ｮ鬆・〒隱ｭ繧縺薙→縲・
## Required Reading Order

1. [Root safety rules](../../AGENTS.md)
2. [Claude entry point](../../CLAUDE.md)
3. [Phase README](README.md)
4. [Execution state](execution-state.json)
5. [Work instructions](work-instructions.md)
6. [Design review](proposal/P5.18.2-DESIGN-REVIEW.md)
7. [Scope contract](contracts/01-scope-contract.md)
8. [Live title boundary contract](contracts/02-live-title-boundary-contract.md)
9. [Progression Detail entry contract](contracts/03-progression-detail-entry-contract.md)
10. [Privacy and History contract](contracts/04-privacy-history-contract.md)
11. [Test safety contract](contracts/05-test-safety-contract.md)
12. [Stage 00 audit](audit/P5.18.2-00-repository-audit.md)
13. [Stage 00 report](reports/P5.18.2-00-audit-baseline.md)

Git reality overrides phase state. Record any discrepancy in the Stage report before resuming.

---

## Purpose
P5.18.1 縺ｧ螳梧・縺励◆ Bassline Echo 縺ｮ `Vault縺九ｉ驕ｸ縺ｶ` 菴馴ｨ薙ｒ縲・*閾ｪ蛻・・Vault縺九ｉ逶ｮ逧・・騾ｲ陦後ｒ隕九▽縺代ｄ縺吶＞迥ｶ諷・*縺ｸ謾ｹ蝟・☆繧九・
荳ｭ蠢・・谺｡縺ｮ2轤ｹ縲・1. Vault picker 縺ｧ繝ｩ繧､繝坊ault縺ｮ繧ｿ繧､繝医Ν繧定｡ｨ遉ｺ繝ｻ讀懃ｴ｢蜿ｯ閭ｽ縺ｫ縺吶ｋ縲・2. Progression Detail 竊・Bass Practice / Bassline Echo 縺ｮ閾ｪ辟ｶ縺ｪ蟆守ｷ壹′迴ｾ蝨ｨ繧よ怏蜉ｹ縺狗屮譟ｻ縺励・陦後＠縺ｦ縺・ｋ蝣ｴ蜷医・縺ｿ蠕ｩ譌ｧ縺吶ｋ縲・
## Core privacy decision
繧ｿ繧､繝医Ν縺ｯ **UI陦ｨ遉ｺ縺ｨ讀懃ｴ｢縺ｫ縺縺大茜逕ｨ縺吶ｋ ephemeral data** 縺ｨ縺吶ｋ縲・
```text
Live Vault
  竊・Picker candidate ViewModel
  笏懌楳 displayTitle  竊・UI / search only
  笏披楳 safeSnapshot  竊・Practice縺ｸ貂｡縺・
Practice / History / report / logs
  竊・Vault title繧呈ｰｸ邯壼喧縺励↑縺・```

P5.18.1 縺ｮ safe snapshot / History privacy boundary 繧堤ｷｩ繧√↑縺・・
## In scope
- Vault picker 縺ｮ live title 陦ｨ遉ｺ
- Vault title 縺ｫ繧医ｋ讀懃ｴ｢
- 辟｡鬘・progression 縺ｮ fallback
- title 縺ｨ繧ｳ繝ｼ繝蛾ｲ陦後・菴ｵ險・- picker candidate 縺ｮ陦ｨ遉ｺ蟆ら畑 ViewModel
- P5.18.1 source selection transaction 縺ｮ邯ｭ謖・- Progression Detail 竊・Bass Practice 蟆守ｷ壹・迴ｾ迥ｶ逶｣譟ｻ
- 驕主悉縺ｫ蟄伜惠縺励◆蟆守ｷ壹′騾陦後＠縺ｦ縺・ｋ蝣ｴ蜷医・譛蟆丞ｾｩ譌ｧ
- 蟆守ｷ壹′蟄伜惠縺吶ｋ蝣ｴ蜷医・髱樣陦後ユ繧ｹ繝郁ｿｽ蜉
- accessibility / keyboard / 320px / 200% scale
- test-output hygiene 髱樣陦・- product acceptance build

## Non-goals
- Vault title 繧・Practice snapshot / History / Recording metadata 縺ｫ菫晏ｭ・- Vault title 繧・report / telemetry / console log 縺ｫ蜃ｺ蜉・- favorite / recent metadata 縺ｮ譁ｰ險ｭ
- user-defined preset
- Vault邨ｱ險・/ 鬆ｻ蜃ｺ騾ｲ陦梧耳阮ｦ
- AI謗ｨ阮ｦ
- Chord Dojo邨ｱ蜷・- Bassline generator螟画峩
- Chord Context engine螟画峩
- Record & Compare engine螟画峩
- Root Motion Echo
- P5.19逹謇・- Vault schema螟画峩 / Vault mutation

## Protected surfaces
- P5.15
- Vault schema / file version / mutation
- Analyzer / MIDI Exporter
- Chord Dojo / Live MIDI
- FreePats assets
- P5.17 RecordingTake store
- P5.18 Chord Context playback contract
- P5.18.1 preset catalog / source snapshot / History privacy contract
- test-output hygiene contract
- `docs/CURRENT_STATE.md`

## Preconditions
髢句ｧ句燕縺ｫ master 縺御ｻ･荳九ｒ蜷ｫ繧縺薙→繧堤屮譟ｻ縺吶ｋ縲・- P5.18.1 merge completion
- test-output hygiene merge `81a6890` 縺ｾ縺溘・縺昴・蠕檎ｶ・
clean master 縺九ｉ髢句ｧ九☆繧九・謗ｨ螂ｨ branch: `feat/p5182-vault-source-discoverability`

## Stages
### P5.18.2-00 窶・Repository Audit / Contract / Baseline
live Vault title field縲｝icker mapping縲￣rogression Detail蟆守ｷ壹》est-output hygiene baseline繧堤屮譟ｻ縲Ｑroduction feature縺ｯ螳溯｣・＠縺ｪ縺・・
### P5.18.2-01 窶・Live Title ViewModel / Search
UI-only display title縲》itle search縲’allback縲《afe snapshot separation縲｝rivacy tests縲・
### P5.18.2-02 窶・Picker UI / Progression Detail Entry
picker陦ｨ遉ｺ謾ｹ蝟・∵､懃ｴ｢UX縲∵里蟄伜ｰ守ｷ壹・髱樣陦後∪縺溘・譛蟆丞ｾｩ譌ｧ縲∥11y/viewport縲・
### P5.18.2-03 窶・Product Hardening / Release Gates
duplicate/long/Unicode title縲∝､ｧ隕乗ｨ｡Vault縲｝rivacy regression縲￣laywright/Tauri/test-output hygiene縲∥rtifact逕滓・縲∽ｺｺ髢鄭cceptance蠕・■縺ｧ蛛懈ｭ｢縲・
## Completion conditions
- Vault picker縺ｧ繧ｿ繧､繝医Ν縺瑚ｦ九∴繧・- title讀懃ｴ｢縺ｧ騾ｲ陦後ｒ邨槭ｊ霎ｼ繧√ｋ
- chord讀懃ｴ｢繧ょｾ捺擂縺ｩ縺翫ｊ菴ｿ縺医ｋ
- title縺ｪ縺励・螳牙・縺ｪfallback
- title縺ｯsnapshot / History / report / log縺ｸ菫晏ｭ倥＆繧後↑縺・- picker transaction縺ｯ邯ｭ謖・- Progression Detail蟆守ｷ壹・迴ｾ蝨ｨ迥ｶ諷九′閾ｪ蜍輔ユ繧ｹ繝医〒蝗ｺ螳・- Vault mutation 0
- P5.18.1 / P5.18 / P5.17髱樣陦・- Playwright / Tauri蠕後ｂworking tree clean
- Product Acceptance build逕滓・
- master譛ｪmerge縺ｧ蛛懈ｭ｢

## Stop conditions
- title陦ｨ遉ｺ縺ｫVault schema螟画峩縺悟ｿ・ｦ・- title繧痴napshot/History縺ｸ菫晏ｭ倥＠縺ｪ縺・→謌千ｫ九＠縺ｪ縺・- raw MIDI / filesystem path 縺悟ｿ・ｦ・- Progression Detail蟆守ｷ壼ｾｩ譌ｧ縺ｫ螟ｧ隕乗ｨ｡route蜀崎ｨｭ險医′蠢・ｦ・- P5.18.1 transaction contract遐ｴ螢翫′蠢・ｦ・- test-output hygiene騾陦・- P5.15 / Analyzer / MIDI Exporter螟画峩縺悟ｿ・ｦ・- privacy Gate繧呈ｺ縺溘○縺ｪ縺・- 諢丞峙荳肴・縺ｪ譌｢蟄伜､画峩縺後≠繧・
蛛懈ｭ｢譎ゅ↓ reset / stash / discard 縺励↑縺・・
## Next action
`P5.18.2-00 窶・Repository Audit / Contract / Baseline`

譛蛻昴・逶｣譟ｻ縺ｮ縺ｿ縲１5.18.2-01莉･髯阪∈閾ｪ蜍輔〒騾ｲ縺ｾ縺ｪ縺・・
