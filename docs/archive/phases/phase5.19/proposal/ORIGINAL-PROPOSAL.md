<!-- phase-id: 5.19 -->
# Original Proposal — Root Motion Echo

元提案の要約。
- 2音を聴き、方向+音程を答える
- Listen → Identify → Sing → Play → Review → Transfer
- Identifyは客観、Sing/Playは自己評価
- 指板shapeを学ぶ
- Generated / Vault Progression source
- Level 1〜5

正式仕様では以下を修正済み。
- Vault rootだけではoctave方向不明
- 「1本上/下」表現は曖昧
- pitchだけではstring/fretを一意に決められない
- `identifyCorrect`単一booleanでは証拠不足
- hint後の正解は独力正解と分離

正式契約はDESIGN-REVIEWとcontractsを優先する。
