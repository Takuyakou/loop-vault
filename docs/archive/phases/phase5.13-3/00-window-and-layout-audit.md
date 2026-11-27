# Phase 5.13-3 Window and Layout Audit

監査基準: `master` commit `c7d2aa29b247ae76620654b3b53d373b15e67280`

## Live MIDI

### 現在の起動経路

1. Sidebarの`Live MIDI`が`App.enterLiveMidiMode()`を呼ぶ。
2. Tauri環境では`createTauriMiniWindowAdapter()`が`getCurrentWindow()`を取得する。
3. `MiniWindowController.enter()`が現在のメインウィンドウをunmaximizeし、最小サイズを変更し、保存済みmini boundsへ移動・縮小する。
4. `App`の`liveMidiMode`が`true`になり、通常のApp Shellを返さず`LiveMidiMiniMode`だけを返す。
5. `defaultLiveMidiStore.activate()`が同じJavaScriptコンテキスト内でMIDI inputを開く。

根拠:

- `src/App.tsx`
- `src/liveMidi/miniWindowController.ts`
- `src/components/LiveMidiMiniMode.tsx`

### 直接原因

現行実装はLive MIDI用の`WebviewWindow`を生成していない。`getCurrentWindow()`で得たメインウィンドウ自体を340x200へ縮小し、React treeもApp ShellからMini Modeへ全面置換している。このためユーザーからは「Live MIDIを開くとメインウィンドウが表示されなくなった」ように見える。

`tauri.conf.json`に宣言されたwindowはメイン1つのみで、Live MIDI用label、single-instance判定、subwindow close lifecycleは存在しない。

### Production / Development

- Tauri production/dev: どちらも同じ`getCurrentWindow()`経路でメインを変形する。
- Web build: Tauri adapterが生成されないためwindow resizeは行わないが、React treeはMini Modeへ置換される。

### 現在の「戻る」

`LiveMidiMiniMode.onBack`は`leaveLiveMidiMode()`を呼ぶ。これはMIDIをdeactivateし、保存していたメインboundsへ現在windowを戻し、Mini Modeを終了する。「メインを表示・focusしつつLive MIDIを残す」操作ではない。

### State / Device

現状は同一window・同一JavaScript contextの`defaultLiveMidiStore`を使うため、storeとMIDI deviceは1つである。ただし真のsubwindow化で同じ`App`を二重起動するとstore、Analyzer、MIDI inputが二重化する。修正ではメインを唯一のstore ownerとし、subwindowへserializable snapshotを送り、操作をメインへcommandとして返す必要がある。

### Close

- Mini Mode固有windowはないため、Mini ModeのXはメインwindowのXと同義。
- メインclose guardはVault flush、close blocker、playback停止、`liveMidiService.stop()`、`exit_app`を行う。
- Live MIDIだけ閉じる契約、再起動、mini bounds保存は独立していない。

## Chord Dojo

### Height / Overflow Contract

| Layer | 現行契約 |
| --- | --- |
| `html`, `body`, `#root` | `styles.css`で通常root、App Shellがviewportを固定 |
| App Shell | `h-screen min-h-[520px] overflow-hidden` |
| Main column | `flex min-w-0 flex-1 flex-col` |
| Route content | Practiceのみ`overflow-hidden`、他routeは`overflow-y-auto` |
| Practice root | `lg:flex lg:min-h-0 lg:flex-1 lg:flex-col` |
| Dojo grid | `lg:min-h-0 lg:flex-1 lg:overflow-hidden` |
| Queue | 独立`overflow-y-auto` + `overscroll-contain` |
| Dojo content | 独立`lg:overflow-y-auto` + `overscroll-contain` |

根拠:

- `src/components/AppShell.tsx`
- `src/App.tsx`
- `src/views/PracticeView.tsx`

### 直接原因

Practice routeだけ主scroll containerを無効化し、Dojo grid内のQueueと右本文を別scroll containerにしている。`h-screen` / `overflow-hidden`の親の下で、flex/grid childの高さと内部scrollに下部到達性を委譲しているため、次が発生する。

- ページ全体のscrollbarでは鍵盤・凡例・結果へ移動できない。
- Queue上のwheelは`overscroll-contain`により本文へ伝播しない。
- KeyboardのPageDown / Endはfocus中の内部containerに依存する。
- Top Bar、Practice header、gridの合計高が低いviewportで本文領域を圧迫する。
- 親と左右paneの複数scroll contractが、最下部の可視性とfocus scrollを不安定にする。

### 修正境界

- App Shellを唯一の主縦scroll containerにする。
- Practice routeの`overflow-hidden`例外を削除する。
- 右Dojo paneの内部縦scrollを削除し、内容高を主scrollへ渡す。
- Queueは件数が多い場合だけ補助scrollを維持するが、`overscroll-contain`を外し、端で主scrollへ伝播させる。
- content削除、文字縮小、判定・voicing・playback変更は行わない。

## Top Bar Playback Indicator

現行Top Barは`playback.status !== "idle"`の間だけMusicアイコンbuttonを追加し、idleで削除する。この条件付きmountにより、再生開始・終了でTop Barの並びが変わる。

追加要望では、このMusicアイコンを廃止し、Global Preview Sound Selectorの左に常設level meterを置く。並びは次で固定する。

```text
Level Meter | Volume Knob | Piano icon / Piano / E.Piano selector | Idea | Save
```

実音量のAudioWorklet解析は新規導入せず、既存`PlaybackController`の`starting / playing / idle`とmaster volumeから決定的なUI levelを表示する。stop操作は既存の各再生toggleを維持する。

## Protected Contracts

- Analyzer、event boundary、candidate order: 変更しない
- Live MIDI chord detection / latency constants: 変更しない
- Chord Dojo判定 / voicing / playback request: 変更しない
- Vault payload / schema / `fileVersion = 1`: 変更しない
- tracked MIDI: 0
- tracked `.local-evaluation`: 0
