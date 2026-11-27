<!-- phase-id: 5.28 -->

# Contract 01 — Direct Navigation / Empty State

## Sidebar

- 現行flat navigationを維持し、`Voicing Loop`を`Practice`直後へ追加する。
- nested group、disclosure、router、sidebar redesignは追加しない。
- itemは既存`SidebarItem`のbutton semantics、40 px minimum height、focus-visible、
  collapsed時のaccessible name/titleを再利用する。
- direct item選択時は`Voicing Loop`だけをcurrent pageとして示す。
  Chord DojoまたはBass Practice表示時は従来の`Practice`をcurrent pageとする。
- mouseとkeyboardで同じhandlerを実行し、keyboard専用animationを追加しない。

## Direct route / lifecycle

P5.28で新しいURL routerは導入しない。direct routeのcanonical stateは次とする。

```text
view = practice
practiceMode = voicing-loop
voicingPracticeHandoff = undefined
practiceTarget = undefined
chordContextSnapshot = undefined
```

sidebarのdirect itemは、別routeからのentryだけでなく、loaded Voicing Loop session中に
もう一度選択された場合もこのclearを行う。handlerは既存`requestProgressionLeave` guardを
通し、clear/mode/view updatesは許可されたcallback内で実行してunsaved Detail guardを維持する。
empty-state keyへ切り替わることで
既存View cleanupがtransport、pending callback、MIDI leaseを解放する。

route leave後に過去handoffを復活させない。新しいVault/Text handoffだけが新しいsessionを作る。

source未選択のempty stateはLive MIDI activation leaseを取得しない。
`ProgressionVoicingPracticeView`内の既存activation effectを`progressionLoaded`でguardし、
loaded → direct empty transitionではeffect cleanupが旧leaseをreleaseした後、empty state側で
新しいleaseをacquireしない。Appからempty時だけ`monitorMidi=false`を渡す二重契約にはしない。

## Empty state

source未選択時は次を表示する。

- heading: `Voicing Loop`
- prompt: `練習するコード進行を選択してください。`
- primary CTA: `My Vaultから選ぶ`
- secondary CTA: `Textで進行を入力`

未選択時に`Source MIDI` badge、MY/LESSON selector、transportを表示しない。
それらはprogression load後だけ表示する。error/warning扱いにせず、既存`EmptyState`、
`Button`、tokensを使う。CTA containerはwrapし、320 px / effective 200%で横overflowさせない。

## CTA destinations

- `My Vaultから選ぶ`は`library`へ遷移する。ユーザーは既存Vault row →
  Progression Detail → `Voicing Loop`を使い、既存handoff builderでsessionを開始する。
- `Textで進行を入力`はcross-route entryで`capture`をText input modeでmountする。
- `initialInputMode`はmount-time seamで、通常の`Chord Capture`のMIDI defaultを維持する。
  mounted Captureの同route resetという新仕様は追加しない。
- Bass Practice専用`VaultProgressionPicker`はsnapshot typeとeligibilityが異なるため流用しない。

## Existing P5.27 handoff

変更禁止:

- `buildProgressionVoicingPracticeHandoffFromVault`
- saved event duration/harmonic rhythm
- block/Idea fallbackによるkey/BPM semantics
- Source MIDI / Customのsaved exact pitch/octave
- detached snapshot、explicit unavailable、no silent fallback
- Vault Progression Detail → Voicing Loop
- Text save → Voicing Loop

## Accessibility / motion

- native button + existing focus-visibleを維持し、keyboard Enter/Spaceで開ける。
- new animationは追加しない。既存color transitionとglobal reduced-motion contractを使う。
- visible label、active indication、empty-state意味は色だけに依存しない。
- 320 px、effective 200%、reduced motion、no horizontal overflow、
  axe serious/critical 0をfocused Playwrightで証明する。
- component testでempty mountのacquire 0とloaded → emptyのrelease 1 / reacquire 0を証明する。
