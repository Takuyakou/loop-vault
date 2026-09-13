<!-- phase-id: 5.28 -->

# Phase 5.28 — Work Instructions

## Goal

ユーザーが左sidebarの`Voicing Loop`からProgression Voicing Practiceを即座に開き、
source未選択でもerrorや空白にならず、VaultまたはText入力へ進める状態を提供する。
既存P5.27 handoffのsource、duration、key、BPM、Source MIDI / Custom exact voicing契約は維持する。

追加scopeでは、source未選択Voicing Loopにeligible Vault進行を直接表示し、
pickerやProgression Detailを挟まず1クリックで既存P5.27 sessionを開始する。

## Scope

- 現行flat sidebarの`Practice`直後へ明示的な`Voicing Loop` itemを追加する。
- direct entryを`view = practice` + `practiceMode = voicing-loop`として扱う。
- direct entry時にtransient Voicing Loop handoff、Chord Context snapshot、Practice targetをclearする。
- source未選択empty stateではLive MIDI activation leaseを取得しない。
- loaded sessionからdirect empty stateへ戻ると既存leaseをreleaseし、再取得しない。
- source未選択時に`Voicing Loop` heading、説明、選択を促すempty state、Vault/Text CTAを表示する。
- Vault CTAは既存Vault → Progression Detail → Voicing Loop handoffへ導く。
- Text CTAはCaptureViewをText input modeで開き、既存save → Voicing Loop handoffへ導く。
- sidebar、empty state、existing handoff、sibling Practice navigationのfocused testsを追加・更新する。

## Non-goals

- 練習課題進行100、preset library、新しいVoicing generator、Open Voicing、scoring
- Chord Dojo仕様変更、Bass Practice変更
- Vault schema/fileVersion変更、Practice persistence redesign
- P5.27 practice clock、transport、playback engine、voicing resolver変更
- router導入、URL routing導入、sidebar hierarchy/redesign
- Bass Practice専用`VaultProgressionPicker`の汎用化またはVoicing Loopへの流用
- 前回sessionの永続化または再開、Practice History redesign、Vault schema/fileVersion変更

## Contracts

- [`contracts/01-navigation-empty-state-contract.md`](contracts/01-navigation-empty-state-contract.md)
- [`../phase5.27/contracts/06-source-custom-fidelity-contract.md`](../phase5.27/contracts/06-source-custom-fidelity-contract.md)
- [`../phase5.27/contracts/10-integration-protection-contract.md`](../phase5.27/contracts/10-integration-protection-contract.md)

P5.28のnavigation/empty-state変更は、P5.27 handoff builderやsnapshot/resolverを置換しない。

## Stages

### P5.28-00 — Repository / navigation audit

1. Git status、HEAD、branch、worktree、active operation、origin divergenceを確認する。
2. AppShell、PracticeWorkspace、App state、ProgressionVoicingPracticeView、CaptureView、
   Vault/Progression Detail、P5.27 handoff、関連tests/baselinesを監査する。
3. `$emil-design-eng`を使い、既存visual languageを優先した最小UI deltaを固定する。
4. Production/test codeを変更せず、phase packageのみ作成する。
5. `npm run validate:phase-docs`と`git diff --check`を実行する。
6. Stage 00の文書closeout後、Stage 01のproduction変更前に監査結果を引き渡す。

### P5.28-01 — Navigation / empty-state implementation

1. AppShellへflat `Voicing Loop` itemと独立active state/callbackを追加する。
2. Appへdirect-entry handlerを追加し、既存`requestProgressionLeave` guardを通す。
   clear/mode/view updatesは許可されたcallback内で行い、同じPractice route内の再選択でもhandoffをclearする。
3. `ProgressionVoicingPracticeView`の未選択分岐を既存`EmptyState` / `Button`で構成し、
   source badge/selectorはprogression load後だけ表示する。
4. View内の既存Live MIDI activation effectを`progressionLoaded`でguardする。
   empty mountはleaseを取得せず、loaded → empty transitionはcleanupでrelease後に再取得しない。
5. Vault CTAは`library`へ遷移し、既存Progression Detail handoffをそのまま使う。
6. CaptureViewへmount-timeの小さなinitial input-mode seamを追加し、Text CTAだけ`text`で開く。
   これはcross-route mount用で、通常のChord Captureの`midi` defaultを維持する。
   mounted Captureの同route resetという新仕様は追加しない。
7. 新しいanimation/CSS token/persistence/domain generatorを追加しない。
8. Focused unit/component testsを実行し、Stage 01をcloseoutする。

### P5.28-02 — Focused acceptance / closeout

最低限、次をfresh candidate commitで証明する。

1. sidebar item表示とkeyboard Enter activation
2. direct entryのsource未選択empty state
3. Vault CTAから既存Vault flowへ到達し、保存進行でsessionを開始できる
4. Text CTAがText inputを直接開き、保存後の既存handoffを維持する
5. Vault Progression Detail handoffでsource/duration/key/BPMを維持する
6. Source MIDI / Customのsaved pitch/octaveをexactに維持し、silent fallbackしない
7. Chord Dojo / Bass Practice navigation regressionなし
8. route leave / direct re-entryでstale handoff/sessionなし
9. empty mountのLive MIDI acquire 0、loaded → direct emptyでrelease後のreacquire 0
10. 320 px、effective 200%、keyboard、reduced motion、no horizontal overflow
11. axe serious/critical 0

Relevant gate set:

- focused Vitest: AppShell、App navigation helpers/state、PracticeWorkspace、
  ProgressionVoicingPracticeView、CaptureView Text、Progression Detail、P5.27 handoff
- focused Playwright: new P5.28 direct-entry flow、existing P5.27 Voicing Loop flow、keyboard regression
- affected visual: existing `practice.png`にはsidebarが写るため、差分を意図確認してからbaselineを扱う
- `npm run typecheck:e2e`、`npm run lint`、`npm run build`
- `npm run validate:phase-docs`、`git diff --check`

### P5.28-03 — Inline Vault selection audit / contract

1. current Vault projection/search、P5.27 handoff builder、transport cleanup、preference storageを監査する。
2. Bass Practice pickerは4/4 Chord Context専用のため、そのeligibilityをVoicing Loopへ流用しない。
3. `contracts/02-inline-vault-selection-contract.md`で表示、recent、transaction、privacyを固定する。
4. Production/test codeを変更せず、phase docs validationとdiff checkを実行する。

### P5.28-04 — Inline Vault selection implementation

1. current VaultからP5.27 handoff可能な進行だけをpresentation projectionへ変換する。
2. source未選択画面へ検索、compact whole-row button、recent/default list、同一領域の全件展開を追加する。
3. successful selection後だけ最大5件のID-only LRUをlocalStorageへ保存する。
4. missing/invalid sourceはclick時にもcurrent Vaultを再読してfail closedとする。
5. Text入力をsecondary actionとして維持し、既存pickerは削除しない。
6. source選択後のP5.27 UI、clock、transport、voicing engineは変更しない。

### P5.28-05 — Focused acceptance / extension closeout

最低限、inline list、1-click handoff facts、recent dedupe/prune、search、all expansion、
Text、old transport stop、stale source fail-closed、Vault/Practice navigation、keyboard、
320 px、effective 200%、reduced motion、overflow、axe serious/critical 0をfresh candidateで証明する。

## Definition of Done

- sidebarからVault/Chord Captureを経由せずVoicing Loop empty stateを開ける。
- empty stateの2 CTAがkeyboardで利用でき、320 px / effective 200%でoverflowしない。
- route leave/re-entryおよびloaded session中のdirect item再選択でstale sessionを再表示しない。
- source未選択時のLive MIDI leaseは0で、loaded → direct empty後に旧leaseを解放して再取得しない。
- Vault/Textの既存handoffがsource、duration、key、BPM、exact Source/Customを維持する。
- Chord Dojo / Bass PracticeとP5.27 clock/playbackに回帰がない。
- required gatesがfresh commit hashに対してpassとして記録される。
- changed files、commit hash、clean statusがfinal reportに記録される。
- P5.28の実装・検証結果を報告し、人間の確認待ちで停止する。

## Safety

共通安全規則は[root `AGENTS.md`](../../AGENTS.md)を参照する。
