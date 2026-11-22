import type { ReactNode } from "react";
import { TransportButton } from "./TransportButton";

type ButtonExtras = { "aria-label"?: string; "aria-pressed"?: boolean; title?: string; "data-testid"?: string };

export interface PlaybackRowProps {
  /** The group's name (「再生」). */
  label: string;
  status: "stopped" | "playing" | "paused";
  /**
   * Text capture pauses: the first button is ▶ 再生 / Ⅱ 一時停止 / ▶ 再開, and ■ 停止 is a button of its own.
   * The correction workspace has no pause: the first button is ▶ 再生 / ■ 停止 (it stops), with no second stop button.
   */
  pausable: boolean;
  onPrimary: () => void;
  /** ■ 停止 (only drawn when `pausable`). */
  onStop?: () => void;
  onBeginning: () => void;
  loop: boolean;
  onLoop: (loop: boolean) => void;
  disabled?: boolean;
  primaryDisabled?: boolean;
  loopDisabled?: boolean;
  primaryProps?: ButtonExtras;
  stopProps?: ButtonExtras;
  beginningProps?: ButtonExtras;
  loopProps?: ButtonExtras;
  className?: string;
  /** What the screen adds after ↻ ループ (追従, the BPM, the position). */
  children?: ReactNode;
}

/**
 * P23-16 W1: the one playback row of the correction workspace and the text capture (P23-17 moves the text side over):
 * ▶ 再生 · (■ 停止) · |◀ 最初から · ↻ ループ, in the transport buttons' colours. It only draws; where it plays from,
 * what loops and the keys stay with each screen.
 */
export function PlaybackRow({
  label, status, pausable, onPrimary, onStop, onBeginning, loop, onLoop, disabled = false, primaryDisabled = false,
  loopDisabled = false, primaryProps, stopProps, beginningProps, loopProps, className = "", children,
}: PlaybackRowProps) {
  const primaryLabel = status === "playing" ? (pausable ? "Ⅱ 一時停止" : "■ 停止") : status === "paused" ? "▶ 再開" : "▶ 再生";
  return (
    <div className={`lv-playback-row ${className}`} role="group" aria-label={label}>
      <TransportButton variant="primary" fixedPrimary disabled={disabled || primaryDisabled} onClick={onPrimary} {...primaryProps}>
        {primaryLabel}
      </TransportButton>
      {pausable ? (
        <TransportButton variant="neutral" disabled={disabled || status === "stopped"} onClick={onStop} {...stopProps}>
          ■ 停止
        </TransportButton>
      ) : null}
      <TransportButton variant="neutral" disabled={disabled} aria-label="最初から" title="最初から" onClick={onBeginning} {...beginningProps}>
        |◀<span className="lv-playback-word"> 最初から</span>
      </TransportButton>
      <TransportButton
        variant="loop"
        active={loop}
        disabled={disabled || loopDisabled}
        aria-pressed={loop}
        aria-label={`ループ ${loop ? "ON" : "OFF"}`}
        onClick={() => onLoop(!loop)}
        {...loopProps}
      >
        ↻<span className="lv-playback-word"> ループ</span>
      </TransportButton>
      {children}
    </div>
  );
}
