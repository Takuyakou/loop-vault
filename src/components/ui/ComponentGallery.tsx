// P8.9 component gallery: every shared control in every state, side by side.
// Opened with `?gallery` in development builds (and the p89:screens build) only;
// main.tsx keeps it out of the production bundle.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "../ConfirmDialog";
import { Modal } from "../Modal";
import { iconCatalog, LoopIcon, SettingsIcon, VaultIcon, VolumeIcon } from "../icons";
import { createNotificationStore, NotificationProvider, useNotify } from "../notifications";
import { useUndoQueue } from "../../hooks/useUndoQueue";
import { Button, Chip, EmptyState, IconButton, LoadingState, Popover, ProgressBar, SegmentedControl, Select, Tooltip } from "./index";
import "./gallery.css";

const STATES = ["通常", "ホバー", "フォーカス", "押せない", "オン"] as const;
type GalleryState = (typeof STATES)[number];
const force = (state: GalleryState) =>
  state === "ホバー" ? "hover" : state === "フォーカス" ? "focus" : undefined;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--lv-border)] py-6">
      <h2 className="mb-4 text-[length:var(--lv-text-16)] font-semibold text-[var(--lv-text)]">{title}</h2>
      {children}
    </section>
  );
}

function StateGrid({ rows }: { rows: ReadonlyArray<readonly [string, (state: GalleryState) => ReactNode]> }) {
  return (
    <div className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] items-center gap-x-4 gap-y-5 text-[length:var(--lv-text-12)] text-[var(--lv-text-muted)]">
      <span />
      {STATES.map((state) => <span key={state}>{state}</span>)}
      {rows.map(([name, render]) => (
        <RowCells key={name} name={name} render={render} />
      ))}
    </div>
  );
}

function RowCells({ name, render }: { name: string; render: (state: GalleryState) => ReactNode }) {
  return (
    <>
      <span className="text-[var(--lv-text-secondary)]">{name}</span>
      {STATES.map((state) => <div key={state} className="min-w-0">{render(state)}</div>)}
    </>
  );
}

const buttonRow = (variant: "primary" | "neutral" | "ghost" | "danger") => (state: GalleryState) =>
  state === "オン" ? <span>—</span> : (
    <Button variant={variant} data-force={force(state)} disabled={state === "押せない"}>
      {variant === "danger" ? "削除する" : "保存"}
    </Button>
  );

function Demos() {
  const notify = useNotify();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    notify({ tone: "success", message: "Vaultに保存しました", action: { label: "開く", onClick: () => undefined }, durationMs: 600_000 });
    notify({ tone: "warning", message: "キーが未確定です。度数表示は使えません", durationMs: 600_000 });
    notify({ tone: "error", message: "保存できませんでした。もう一度お試しください" });
  }, [notify]);
  return (
    <div className="flex flex-wrap gap-2">
      {(["success", "info", "warning", "error"] as const).map((tone) => (
        <Button key={tone} variant="neutral" size="sm" onClick={() => notify({ tone, message: `${tone} のお知らせ` })}>{tone}</Button>
      ))}
    </div>
  );
}

export function ComponentGallery() {
  const [store] = useState(createNotificationStore);
  const undoQueue = useUndoQueue();
  const fallbackRef = useRef<HTMLHeadingElement>(null);
  const [segment, setSegment] = useState<"step" | "tempo" | "free">("step");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <NotificationProvider store={store} undo={{ actions: undoQueue.actions, onUndo: undoQueue.undo, label: "元に戻す", fallbackFocusRef: fallbackRef }}>
      <div className="lv-gallery h-full overflow-y-auto bg-[var(--lv-bg)] px-8 pb-32 pt-6 text-[var(--lv-text)]" data-testid="p89-component-gallery">
        <h1 ref={fallbackRef} tabIndex={-1} className="text-[length:var(--lv-text-20)] font-semibold">部品の見本（P8.9）</h1>
        <p className="mt-1 text-[length:var(--lv-text-12)] text-[var(--lv-text-muted)]">開発のビルドだけで開く画面。ホバーとフォーカスは見本用に固定表示している。</p>

        <Section title="ボタン（主役・無彩色・塗りなし・状態・削除）">
          <StateGrid rows={[
            ["主役 primary", buttonRow("primary")],
            ["無彩色 neutral", buttonRow("neutral")],
            ["塗りなし ghost", buttonRow("ghost")],
            ["状態 state", (state) => (
              <Button variant="state" data-force={force(state)} disabled={state === "押せない"} aria-pressed={state === "オン"}>
                <LoopIcon size={16} />ループ
              </Button>
            )],
            ["削除 danger", buttonRow("danger")],
            ["アイコン", (state) => state === "オン" ? <span>—</span> : (
              <IconButton label="設定" tooltip="styled" variant="ghost" data-force={state === "ホバー" ? "open" : force(state)} disabled={state === "押せない"}>
                <SettingsIcon />
              </IconButton>
            )],
          ]} />
          <div className="mt-6 flex items-center gap-4 text-[length:var(--lv-text-12)] text-[var(--lv-text-muted)]">
            <span className="w-[120px] text-[var(--lv-text-secondary)]">押せない理由</span>
            <Button variant="primary" disabled disabledReason="MIDIを読み込むと再生できます">再生</Button>
            <span data-force="open" className="pt-10">
              <Button variant="primary" disabled disabledReason="MIDIを読み込むと再生できます">再生（理由を固定表示）</Button>
            </span>
          </div>
        </Section>

        <Section title="セグメント・プルダウン・チップ">
          <StateGrid rows={[
            ["セグメント", (state) => state === "オン" ? (
              <SegmentedControl label="進み方" value={segment} onChange={setSegment} options={[{ value: "step", label: "1つずつ" }, { value: "tempo", label: "テンポ" }, { value: "free", label: "自由" }]} />
            ) : (
              <div role="radiogroup" aria-label={`進み方（${state}）`} className="lv-segmented">
                <button type="button" role="radio" aria-checked="false" tabIndex={-1} className="lv-segment" data-force={force(state)} disabled={state === "押せない"}>テンポ</button>
              </div>
            )],
            ["プルダウン", (state) => state === "オン" ? <span>—</span> : (
              <span data-force={force(state)}>
                <Select aria-label={`判定（${state}）`} defaultValue="normal" disabled={state === "押せない"}>
                  <option value="easy">ゆるめ</option>
                  <option value="normal">ふつう</option>
                  <option value="strict">きびしめ</option>
                </Select>
              </span>
            )],
            ["チップ", (state) => (
              <Chip selected={state === "オン"} data-force={force(state)} disabled={state === "押せない"}>ネオソウル</Chip>
            )],
          ]} />
        </Section>

        <Section title="ツールチップ・ポップオーバー・進み具合">
          <div className="flex flex-wrap items-start gap-10 pl-40 pt-8">
            <span data-force="open">
              <Tooltip content="いまのループを最初から"><Button variant="neutral">最初から</Button></Tooltip>
            </span>
            <div className="pb-24">
              <Popover label="音量" defaultOpen trigger={(props) => <IconButton label="音量" tooltip="styled" variant="neutral" {...props}><VolumeIcon /></IconButton>}>
                <label className="flex items-center gap-3 text-[length:var(--lv-text-12)] text-[var(--lv-text-secondary)]">
                  音量 <input type="range" min={0} max={100} defaultValue={80} aria-label="音量の値" />
                </label>
              </Popover>
            </div>
            <div className="grid w-64 gap-3 text-[length:var(--lv-text-12)] text-[var(--lv-text-muted)]">
              <span>進み具合 40%</span>
              <ProgressBar label="進み具合" value={40} />
              <span>練習の記録 5/7 日</span>
              <ProgressBar label="練習の記録" value={5} max={7} tone="record" />
            </div>
          </div>
        </Section>

        <Section title="空の状態・読み込み中">
          <div className="grid gap-6 md:grid-cols-2">
            <EmptyState icon={<VaultIcon size={24} />} title="まだ進行がありません" description="MIDI かテキストから進行を取り込むと、ここに並びます。" action={<Button variant="primary">取り込む</Button>} />
            <LoadingState label="解析しています" description="MIDI の和音を調べています" />
          </div>
        </Section>

        <Section title="通知（右下）とダイアログ">
          <div className="flex flex-wrap items-center gap-3">
            <Demos />
            <Button variant="neutral" size="sm" onClick={() => undoQueue.enqueue({ label: "進行を削除しました", payload: null, undo: () => undefined })}>元に戻す付き</Button>
            <Button variant="neutral" size="sm" onClick={() => setModalOpen(true)}>モーダル</Button>
            <Button variant="neutral" size="sm" onClick={() => setConfirmOpen(true)}>確認ダイアログ</Button>
          </div>
        </Section>

        <Section title="自作アイコン（24×24・線 1.8）">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {iconCatalog.map(([name, Icon]) => (
              <li key={name} className="flex flex-col items-center gap-2 rounded-[var(--lv-radius-sm)] border border-[var(--lv-border)] p-3 text-center text-[length:var(--lv-text-11)] text-[var(--lv-text-secondary)]">
                <Icon size={24} />
                {name}
              </li>
            ))}
          </ul>
        </Section>
      </div>
      {modalOpen ? (
        <Modal ariaLabel="モーダルの見本" onClose={() => setModalOpen(false)} panelClassName="w-full max-w-md p-5">
          <h2 className="text-lg font-semibold">モーダルの見本</h2>
          <p className="mt-2 text-sm text-[var(--lv-text-secondary)]">Esc で閉じ、フォーカスは中に閉じ込められる。</p>
          <div className="mt-5 flex justify-end"><Button variant="primary" onClick={() => setModalOpen(false)}>閉じる</Button></div>
        </Modal>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title="進行を削除しますか？"
        description="削除しても、しばらくは元に戻せます。"
        confirmLabel="削除する"
        cancelLabel="やめる"
        tone="danger"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
      />
    </NotificationProvider>
  );
}
