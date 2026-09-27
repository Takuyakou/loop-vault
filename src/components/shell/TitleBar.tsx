// P8.9-02 integrated title bar (36px). Mock: RHome.dc.html first strip.
// Empty areas carry data-tauri-drag-region: drag moves the window and a
// double click toggles maximize (Tauri handles both natively). Buttons and
// inputs are not drag regions.
import { useEffect, useState } from "react";
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon, SearchIcon } from "../icons";
import { canControlWindow, minimizeWindow, requestWindowClose, toggleMaximizeWindow, watchMaximized } from "./windowControls";

export interface TitleBarProps {
  onSearch: () => void;
}

export function TitleBar({ onSearch }: TitleBarProps) {
  const desktop = canControlWindow();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => watchMaximized(setMaximized), []);
  const unavailable = desktop ? undefined : "デスクトップ版で使えます";

  return (
    <header className="lv-titlebar" data-tauri-drag-region data-titlebar>
      <div className="lv-titlebar-brand" data-tauri-drag-region>
        <img src="/loop-vault-icon.svg" alt="" width="20" height="20" />
        <span>Loop Vault</span>
      </div>
      <div className="lv-titlebar-center" data-tauri-drag-region>
        <button type="button" className="lv-titlebar-search" onClick={onSearch} aria-keyshortcuts="Control+K" data-titlebar-search>
          <SearchIcon size={14} />
          <span className="lv-titlebar-search-label">検索</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>
      <div className="lv-titlebar-controls">
        <button type="button" className="lv-titlebar-button" aria-label="最小化" title={unavailable ?? "最小化"} disabled={!desktop} onClick={() => void minimizeWindow()}>
          <MinimizeIcon size={16} />
        </button>
        <button
          type="button"
          className="lv-titlebar-button"
          aria-label={maximized ? "元に戻す" : "最大化"}
          title={unavailable ?? (maximized ? "元に戻す" : "最大化")}
          disabled={!desktop}
          onClick={() => void toggleMaximizeWindow()}
          data-titlebar-maximize={maximized ? "restore" : "maximize"}
        >
          {maximized ? <RestoreIcon size={16} /> : <MaximizeIcon size={16} />}
        </button>
        <button
          type="button"
          className="lv-titlebar-button lv-titlebar-close"
          aria-label="閉じる"
          title={unavailable ?? "閉じる"}
          disabled={!desktop}
          onClick={() => void requestWindowClose()}
          data-titlebar-close
        >
          <CloseIcon size={16} />
        </button>
      </div>
    </header>
  );
}
