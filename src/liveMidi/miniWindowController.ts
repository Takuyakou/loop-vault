import { isTauri } from "@tauri-apps/api/core";
import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  PhysicalPosition,
  PhysicalSize,
} from "@tauri-apps/api/window";
import type { WindowBounds } from "./preferences";

export interface MainWindowSnapshot {
  position: { x: number; y: number };
  size: { width: number; height: number };
  maximized: boolean;
  fullscreen: boolean;
  monitorId?: string;
}

export interface MonitorWorkArea {
  id?: string;
  bounds: WindowBounds;
}

export interface MiniWindowAdapter {
  snapshot: () => Promise<MainWindowSnapshot>;
  currentBounds: () => Promise<WindowBounds>;
  monitors: () => Promise<MonitorWorkArea[]>;
  prepareForBounds: () => Promise<void>;
  setBounds: (bounds: WindowBounds) => Promise<void>;
  setMinSize: (width: number, height: number) => Promise<void>;
  setAlwaysOnTop: (enabled: boolean) => Promise<void>;
  setFullscreen: (enabled: boolean) => Promise<void>;
  maximize: () => Promise<void>;
  focus: () => Promise<void>;
}

export const DEFAULT_MINI_BOUNDS: WindowBounds = { x: 80, y: 80, width: 340, height: 200 };
export const MINI_MIN_SIZE = { width: 280, height: 160 };
export const MAIN_MIN_SIZE = { width: 768, height: 640 };

export class MiniWindowController {
  private mainSnapshot?: MainWindowSnapshot;

  constructor(private readonly adapter: MiniWindowAdapter) {}

  async enter(savedBounds?: WindowBounds, alwaysOnTop = true): Promise<MainWindowSnapshot> {
    const snapshot = await this.adapter.snapshot();
    this.mainSnapshot = snapshot;
    const monitors = await this.adapter.monitors();
    const bounds = clampWindowBounds(savedBounds ?? DEFAULT_MINI_BOUNDS, monitors, snapshot.monitorId);
    await this.adapter.prepareForBounds();
    await this.adapter.setMinSize(MINI_MIN_SIZE.width, MINI_MIN_SIZE.height);
    await this.adapter.setAlwaysOnTop(alwaysOnTop);
    await this.adapter.setBounds(bounds);
    await this.adapter.focus();
    return snapshot;
  }

  async exit(): Promise<WindowBounds | undefined> {
    const snapshot = this.mainSnapshot;
    if (!snapshot) return undefined;
    const miniBounds = await this.adapter.currentBounds();
    const monitors = await this.adapter.monitors();
    const restoreBounds = clampWindowBounds({ ...snapshot.position, ...snapshot.size }, monitors, snapshot.monitorId);
    await this.adapter.setAlwaysOnTop(false);
    await this.adapter.prepareForBounds();
    await this.adapter.setMinSize(MAIN_MIN_SIZE.width, MAIN_MIN_SIZE.height);
    await this.adapter.setBounds(restoreBounds);
    if (snapshot.fullscreen) await this.adapter.setFullscreen(true);
    else if (snapshot.maximized) await this.adapter.maximize();
    await this.adapter.focus();
    this.mainSnapshot = undefined;
    return miniBounds;
  }
}

export function clampWindowBounds(
  bounds: WindowBounds,
  monitors: readonly MonitorWorkArea[],
  preferredMonitorId?: string,
): WindowBounds {
  if (monitors.length === 0) return sanitizeBounds(bounds);
  const sanitized = sanitizeBounds(bounds);
  const monitor = monitors.find((entry) => entry.id && entry.id === preferredMonitorId)
    ?? monitors.find((entry) => intersects(sanitized, entry.bounds))
    ?? monitors[0];
  const width = Math.min(sanitized.width, monitor.bounds.width);
  const height = Math.min(sanitized.height, monitor.bounds.height);
  return {
    x: clamp(sanitized.x, monitor.bounds.x, monitor.bounds.x + monitor.bounds.width - width),
    y: clamp(sanitized.y, monitor.bounds.y, monitor.bounds.y + monitor.bounds.height - height),
    width,
    height,
  };
}

export function createTauriMiniWindowAdapter(): MiniWindowAdapter | undefined {
  if (!isTauri()) return undefined;
  const window = getCurrentWindow();
  return {
    async snapshot() {
      const [position, size, maximized, fullscreen, monitor] = await Promise.all([
        window.outerPosition(), window.innerSize(), window.isMaximized(), window.isFullscreen(), currentMonitor(),
      ]);
      return {
        position: { x: position.x, y: position.y }, size: { width: size.width, height: size.height },
        maximized, fullscreen, ...(monitor?.name ? { monitorId: monitor.name } : {}),
      };
    },
    async currentBounds() {
      const [position, size] = await Promise.all([window.outerPosition(), window.innerSize()]);
      return { x: position.x, y: position.y, width: size.width, height: size.height };
    },
    async monitors() {
      return (await availableMonitors()).map((monitor) => ({
        ...(monitor.name ? { id: monitor.name } : {}),
        bounds: {
          x: monitor.workArea.position.x,
          y: monitor.workArea.position.y,
          width: monitor.workArea.size.width,
          height: monitor.workArea.size.height,
        },
      }));
    },
    async prepareForBounds() {
      await window.setFullscreen(false);
      await window.unmaximize();
      await window.setResizable(true);
    },
    async setBounds(bounds) {
      await window.setPosition(new PhysicalPosition(bounds.x, bounds.y));
      await window.setSize(new PhysicalSize(bounds.width, bounds.height));
    },
    async setMinSize(width, height) { await window.setMinSize(new PhysicalSize(width, height)); },
    async setAlwaysOnTop(enabled) { await window.setAlwaysOnTop(enabled); },
    async setFullscreen(enabled) { await window.setFullscreen(enabled); },
    async maximize() { await window.maximize(); },
    async focus() { await window.setFocus(); },
  };
}

function sanitizeBounds(bounds: WindowBounds): WindowBounds {
  return {
    x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : 0,
    y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : 0,
    width: Math.max(MINI_MIN_SIZE.width, Math.round(bounds.width)),
    height: Math.max(MINI_MIN_SIZE.height, Math.round(bounds.height)),
  };
}

function intersects(left: WindowBounds, right: WindowBounds): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x
    && left.y < right.y + right.height && left.y + left.height > right.y;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
