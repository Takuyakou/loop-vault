// P8.9-02 window controls for the integrated title bar (Tauri v2).
// Close goes through the same close request as the native × button, so the
// onCloseRequested guard in src/store/closeGuard.ts (flush, blockers) always runs.
import { isTauri } from "@tauri-apps/api/core";
import { currentMonitor, getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";

export function canControlWindow(): boolean {
  return isTauri();
}

export async function minimizeWindow(): Promise<void> {
  if (canControlWindow()) await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (canControlWindow()) await getCurrentWindow().toggleMaximize();
}

/** Emits the window close request (not destroy/exit): the close guard decides. */
export async function requestWindowClose(): Promise<void> {
  if (canControlWindow()) await getCurrentWindow().close();
}

/** Calls back with the maximized state now and whenever the window resizes. */
export function watchMaximized(onChange: (maximized: boolean) => void): () => void {
  if (!canControlWindow()) return () => undefined;
  const window = getCurrentWindow();
  let disposed = false;
  let unlisten: (() => void) | undefined;
  const read = () => { void window.isMaximized().then((value) => { if (!disposed) onChange(value); }).catch(() => undefined); };
  read();
  void window.onResized(read).then((stop) => {
    if (disposed) stop();
    else unlisten = stop;
  }).catch(() => undefined);
  return () => {
    disposed = true;
    unlisten?.();
  };
}

export interface Size { readonly width: number; readonly height: number }

/** The window size that fits inside the work area, or undefined when it already fits. */
export function fitWithinWorkArea(size: Size, workArea: Size): Size | undefined {
  if (size.width <= workArea.width && size.height <= workArea.height) return undefined;
  return { width: Math.min(size.width, workArea.width), height: Math.min(size.height, workArea.height) };
}

/**
 * Startup frame: restore the native title bar when the user chose it, and shrink
 * the 1440×900 start size to the monitor work area (centered) when the screen is smaller.
 */
export async function prepareMainWindowFrame(useStandardTitleBar: boolean): Promise<void> {
  if (!canControlWindow()) return;
  const window = getCurrentWindow();
  if (useStandardTitleBar) await window.setDecorations(true);
  if (await window.isMaximized()) return;
  const [monitor, size] = await Promise.all([currentMonitor(), window.outerSize()]);
  if (!monitor) return;
  const fitted = fitWithinWorkArea(size, monitor.workArea.size);
  if (!fitted) return;
  await window.setSize(new PhysicalSize(fitted.width, fitted.height));
  await window.center();
}
