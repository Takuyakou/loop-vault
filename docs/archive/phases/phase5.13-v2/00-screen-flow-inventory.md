# Phase 5.13 v2 Screen / Flow Inventory

## Current Routes

| Current view | Entry | Main task | v2 destination |
| --- | --- | --- | --- |
| Home | top navigation | Focusと制作状況 | Sidebar `Home` |
| Capture | top navigation | MIDI読込・解析・採集 | Sidebar `Chord Capture` |
| Library | top navigation | 保存進行を検索 | Sidebar `Vault` |
| Idea Detail | Vault / Home | Idea編集 | Vault配下のdetail |
| Progression Detail | Vault row | 試聴・修正・保存 | Vault配下、cards first |
| Practice | top navigation | Chord Dojo | Sidebar `Practice` |
| Live MIDI | icon button | realtime採集 | Sidebar `Live MIDI` |
| Settings | icon button | 各種設定 | Sidebar `Settings` |
| History | dedicated routeなし | Correction LogはSettings内 | Sidebar `History` |

## Major Flows

### MIDI Import

Current:

1. top navigationでコード採集
2. dropまたはMIDIを選択
3. pre-analysis part確認
4. Analyze
5. candidate選択 / 範囲修正
6. Preview
7. Vaultへ保存

v2:

- click数は増やさない。
- drop zoneをfirst viewportの主役にする。
- source summary、Piano Roll、Voice panel、Analyzeを同じ作業面にする。

### Correction

Current:

1. candidateまたは保存進行を開く
2. chord cardを選択
3. Quick Editor / Inspectorで変更
4. preview
5. save

v2:

- Detailでは最初にコードカードを表示。
- selected / playing / edited / warningを同時に判別可能にする。
- Inspectorを右、狭幅では下へ配置する。

### Vault Search

Current:

- search、length、sort、favorite、Key、source、tagが複数行。
- result rowはchord、source、metaが近い密度。

v2:

- search + length + sortをprimary row。
- Key / source / tagをsecondary row。
- active filterを解除可能なchipとして示す。
- chord sequenceを第一情報にする。

### Practice

Current:

- 左queueと独立scrollは実装済み。
- level / leniency / mode / voicing / sound / connectionが横方向に並ぶ。

v2:

- queueは維持。
- current challengeをprimary surfaceにする。
- setting群を意味別にgroup化する。
- current chord、全進行、keyboardの関係を維持する。

### Live MIDI

Current:

- Top Bar iconからfull-window mini modeへ入る。
- Escapeまたはbackで戻る。

v2:

- Sidebar routeから到達できる。
- current chordをprimary surface、latency/debugをsecondaryにする。
- provisional / confirmedをlabelで区別する。

### Settings

Current:

- Top Bar gearから長いmodalを開く。

v2:

- Sidebar routeからcategory navigation付きで開く。
- destructive data/log actionはdanger zoneへ分離する。
- build infoをAboutへ表示する。

## Keyboard Contract

- Sidebar: Tabで到達、Enter / Spaceでroute変更、active routeは`aria-current`
- Main: skip link、route変更後にmainへfocus
- Dialog: Escape、focus trap、triggerへfocus return
- Capture: file picker、Analyze、candidate、Preview、Saveへvisual orderどおり
- Detail: chord grid、Inspector、Apply / Cancel、Save
- Practice: queue、level、mode、Preview

## Responsive Contract

- `>=1280px`: expanded Sidebar
- `1101–1279px`: user preferenceを維持
- `<=1100px`: collapsed Sidebarを既定候補
- `1024×720`: primary actionとDetail先頭chord cardをscroll前に表示
- narrow inspector: right columnからmain下へ移動

