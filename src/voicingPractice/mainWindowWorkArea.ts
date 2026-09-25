import { isTauri } from "@tauri-apps/api/core";
import { availableMonitors, getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";

export interface WorkAreaBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

function overlapArea(left: WorkAreaBounds, right: WorkAreaBounds): number {
  return Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
    * Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
}

/** Preserve normal OS/window placement; recover only when most of the window is unreachable. */
export function recoverMostlyOffscreenWindow(
  bounds: WorkAreaBounds,
  workAreas: readonly WorkAreaBounds[],
): WorkAreaBounds | undefined {
  if (!workAreas.length || bounds.width <= 0 || bounds.height <= 0) return undefined;
  const best = workAreas.reduce((current, candidate) =>
    overlapArea(bounds, candidate) > overlapArea(bounds, current) ? candidate : current);
  if (overlapArea(bounds, best) >= bounds.width * bounds.height * 0.5) return undefined;
  const width = Math.min(bounds.width, best.width);
  const height = Math.min(bounds.height, best.height);
  return {
    x: Math.max(best.x, Math.min(bounds.x, best.x + best.width - width)),
    y: Math.max(best.y, Math.min(bounds.y, best.y + best.height - height)),
    width,
    height,
  };
}

export async function recoverMainWindowIfOffscreen(): Promise<void> {
  if (!isTauri()) return;
  const window = getCurrentWindow();
  if (await window.isMaximized()) return;
  const [position, size, monitors] = await Promise.all([
    window.outerPosition(), window.outerSize(), availableMonitors(),
  ]);
  const adjusted = recoverMostlyOffscreenWindow(
    { x: position.x, y: position.y, width: size.width, height: size.height },
    monitors.map(({ workArea }) => ({
      x: workArea.position.x, y: workArea.position.y,
      width: workArea.size.width, height: workArea.size.height,
    })),
  );
  if (!adjusted) return;
  if (adjusted.width !== size.width || adjusted.height !== size.height) {
    await window.setSize(new PhysicalSize(adjusted.width, adjusted.height));
  }
  await window.setPosition(new PhysicalPosition(adjusted.x, adjusted.y));
}
