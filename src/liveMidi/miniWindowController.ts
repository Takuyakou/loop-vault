import { isTauri } from "@tauri-apps/api/core";
import { availableMonitors, getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { WindowBounds } from "./preferences";

export interface MonitorWorkArea {
  id?: string;
  bounds: WindowBounds;
}

export interface LiveMidiWindowHandle {
  bounds: () => Promise<WindowBounds>;
  focusAndShow: () => Promise<void>;
  destroy: () => Promise<void>;
}

export interface LiveMidiWindowAdapter {
  get: () => Promise<LiveMidiWindowHandle | undefined>;
  create: (bounds: WindowBounds, alwaysOnTop: boolean) => Promise<LiveMidiWindowHandle>;
  monitors: () => Promise<MonitorWorkArea[]>;
  showMain: () => Promise<void>;
}

export type LiveMidiWindowOpenResult = "created" | "focused";

export const LIVE_MIDI_WINDOW_LABEL = "live-midi";
export const DEFAULT_MINI_BOUNDS: WindowBounds = { x: 80, y: 80, width: 420, height: 260 };
export const MINI_MIN_SIZE = { width: 320, height: 200 };

export class MiniWindowController {
  private opening?: Promise<LiveMidiWindowOpenResult>;

  constructor(private readonly adapter: LiveMidiWindowAdapter) {}

  open(savedBounds?: WindowBounds, alwaysOnTop = true): Promise<LiveMidiWindowOpenResult> {
    if (this.opening) return this.opening;
    this.opening = this.openInternal(savedBounds, alwaysOnTop).finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }

  async showMain(): Promise<void> {
    await this.adapter.showMain();
  }

  async close(): Promise<WindowBounds | undefined> {
    const window = await this.adapter.get();
    if (!window) return undefined;
    const bounds = await window.bounds();
    await window.destroy();
    return bounds;
  }

  private async openInternal(
    savedBounds?: WindowBounds,
    alwaysOnTop = true,
  ): Promise<LiveMidiWindowOpenResult> {
    const existing = await this.adapter.get();
    if (existing) {
      await existing.focusAndShow();
      return "focused";
    }
    const monitors = await this.adapter.monitors();
    const bounds = clampWindowBounds(savedBounds ?? DEFAULT_MINI_BOUNDS, monitors);
    const created = await this.adapter.create(bounds, alwaysOnTop);
    await created.focusAndShow();
    return "created";
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

export function createTauriMiniWindowAdapter(): LiveMidiWindowAdapter | undefined {
  if (!isTauri()) return undefined;

  return {
    async get() {
      const window = await WebviewWindow.getByLabel(LIVE_MIDI_WINDOW_LABEL);
      return window ? tauriHandle(window) : undefined;
    },
    async create(bounds, alwaysOnTop) {
      const window = new WebviewWindow(LIVE_MIDI_WINDOW_LABEL, {
        url: "/?window=live-midi",
        title: "Loop Vault Live MIDI",
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        minWidth: MINI_MIN_SIZE.width,
        minHeight: MINI_MIN_SIZE.height,
        resizable: true,
        alwaysOnTop,
        focus: true,
      });
      await new Promise<void>((resolve, reject) => {
        void window.once("tauri://created", () => resolve());
        void window.once<string>("tauri://error", (event) => reject(new Error(event.payload)));
      });
      return tauriHandle(window);
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
    async showMain() {
      const main = getCurrentWindow();
      if (await main.isMinimized()) await main.unminimize();
      if (!(await main.isVisible())) await main.show();
      await main.setFocus();
    },
  };
}

function tauriHandle(window: WebviewWindow): LiveMidiWindowHandle {
  return {
    async bounds() {
      const [position, size] = await Promise.all([window.outerPosition(), window.innerSize()]);
      return { x: position.x, y: position.y, width: size.width, height: size.height };
    },
    async focusAndShow() {
      if (await window.isMinimized()) await window.unminimize();
      if (!(await window.isVisible())) await window.show();
      await window.setFocus();
    },
    async destroy() {
      await window.destroy();
    },
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
