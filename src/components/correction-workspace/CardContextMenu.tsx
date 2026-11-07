import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CorrectionCard } from "../../domain/correction/correctionModel";

export type CardDeleteKind = "extend-previous" | "extend-next" | "close-gap" | "replace-no-chord";

/**
 * P17-01 §3.2: the card's right-click menu (and Shift+F10 / the menu key). The same menu on
 * the MIDI capture and the progression page; the progression page adds its own reset and its
 * two extra delete modes. Opening selects the card; closing returns the focus to it.
 */
export interface CardContextMenuProps {
  x: number;
  y: number;
  card: CorrectionCard;
  progression: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  singleCard: boolean;
  rangePending: boolean;
  onClose: (restoreFocus?: boolean) => void;
  onMergePrevious: () => void;
  onMergeNext: () => void;
  onSplit: () => void;
  onTypeName: () => void;
  onReset?: () => void;
  onStartRange: () => void;
  onCancelRange: () => void;
  onThisBar: () => void;
  onDelete: (kind: CardDeleteKind) => void;
  /** P17-02: remove the bars this card covers and close the gap (MIDI capture only). */
  onCutBars?: () => void;
  cutBarsLabel?: string;
  cutBarsDisabled?: boolean;
  cutBarsHint?: string;
}

const MARGIN = 8;

export function CardContextMenu(props: CardContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  const [pos, setPos] = useState({ left: props.x, top: props.y });

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    const width = box?.width ?? 300;
    const height = box?.height ?? 440;
    setPos({
      left: Math.max(MARGIN, Math.min(props.x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(props.y, window.innerHeight - height - MARGIN)),
    });
  }, [props.x, props.y]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, []);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) closeRef.current();
    };
    const onScroll = () => closeRef.current();
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const move = (delta: 1 | -1) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + delta + items.length) % items.length]?.focus();
  };

  const item = (key: string, label: ReactNode, run: () => void, options: { disabled?: boolean; danger?: boolean; hint?: string } = {}) => (
    <button
      key={key}
      type="button"
      role="menuitem"
      className="lv-cw-menu-item"
      data-danger={options.danger || undefined}
      disabled={options.disabled}
      onClick={() => {
        run();
        props.onClose(true);
      }}
    >
      <span>{label}</span>
      {options.hint ? <small>{options.hint}</small> : null}
    </button>
  );

  return (
    <div
      ref={ref}
      className="lv-cw-card-menu"
      role="menu"
      aria-label="カードの操作"
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          props.onClose(true);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {props.rangePending ? item("cancel-range", "範囲の選択をやめる", props.onCancelRange) : null}
      <div className="lv-cw-menu-group" role="group" aria-label="形を変える">
        {item("merge-previous", "前とつなぐ", props.onMergePrevious, { disabled: !props.hasPrevious })}
        {item("merge-next", <>次とつなぐ <kbd>M</kbd></>, props.onMergeNext, { disabled: !props.hasNext })}
        {item("split", <>{props.progression ? "分けて足す" : "分ける"} <kbd>S</kbd></>, props.onSplit)}
      </div>
      <div className="lv-cw-menu-group" role="group" aria-label="名前">
        {item("name", <>名前を入力 <kbd>F2</kbd></>, props.onTypeName)}
        {props.progression && props.onReset ? item("reset", "このカードを元に戻す", props.onReset) : null}
      </div>
      <div className="lv-cw-menu-group" role="group" aria-label="保存する範囲">
        {item("start-range", "ここから保存する範囲を選ぶ", props.onStartRange)}
        {item("this-bar", "この小節を保存する範囲にする", props.onThisBar)}
      </div>
      <div className="lv-cw-menu-sep" role="separator" />
      <div className="lv-cw-menu-group" role="group" aria-label="消す">
        {item("delete-previous", "消して前を伸ばす", () => props.onDelete("extend-previous"), { danger: true, hint: "前のカードがこの長さまで伸びる", disabled: props.singleCard })}
        {item("delete-next", "消して次を伸ばす", () => props.onDelete("extend-next"), { danger: true, hint: "次のカードがここから始まる", disabled: props.singleCard })}
        {props.progression ? item("delete-close", "消して詰める", () => props.onDelete("close-gap"), { danger: true, hint: "後ろのカードが前に詰まる", disabled: props.singleCard }) : null}
        {props.progression ? item("delete-nc", "無音（N.C.）にする", () => props.onDelete("replace-no-chord"), { danger: true, hint: "長さはそのまま、音を鳴らさない" }) : null}
        {props.onCutBars ? item("cut-bars", props.cutBarsLabel ?? "小節を消して詰める", props.onCutBars, { danger: true, hint: props.cutBarsHint ?? "その小節を時間ごと消して、後ろを前に詰める", disabled: props.cutBarsDisabled }) : null}
      </div>
    </div>
  );
}

/**
 * P17-02 §10: the bar row's right-click menu. One item — remove this bar and close
 * the gap. The ruler's plain click keeps selecting the card at the bar's start.
 */
export function BarContextMenu(props: {
  x: number;
  y: number;
  bar: number;
  disabled: boolean;
  onClose: (restoreFocus?: boolean) => void;
  onCut: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  const [pos, setPos] = useState({ left: props.x, top: props.y });

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    setPos({
      left: Math.max(MARGIN, Math.min(props.x, window.innerWidth - (box?.width ?? 260) - MARGIN)),
      top: Math.max(MARGIN, Math.min(props.y, window.innerHeight - (box?.height ?? 90) - MARGIN)),
    });
  }, [props.x, props.y]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, []);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) closeRef.current();
    };
    const onScroll = () => closeRef.current();
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="lv-cw-card-menu"
      role="menu"
      aria-label="小節の操作"
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          props.onClose(true);
        }
      }}
    >
      <button
        type="button"
        role="menuitem"
        className="lv-cw-menu-item"
        data-danger
        data-testid="correction-bar-cut"
        disabled={props.disabled}
        onClick={() => {
          props.onCut();
          props.onClose(true);
        }}
      >
        <span>{props.bar}小節を消して詰める</span>
        <small>{props.disabled ? "最後の1小節は消せません" : "この小節を時間ごと消して、後ろを前に詰める"}</small>
      </button>
    </div>
  );
}
