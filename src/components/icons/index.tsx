// P8.9 custom icon set: 24x24, currentColor stroke 1.8, round caps/joins, no fill.
// Shapes follow the P8.9 mocks where they exist (sidebar, header, title bar, toast);
// the rest are drawn to the same rules. lucide-react stays in use elsewhere.
import type { ReactElement, ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
}

export type IconComponent = ((props: IconProps) => ReactElement) & { displayName: string };

function createIcon(displayName: string, shapes: ReactNode): IconComponent {
  const Icon = ({ size = 20, "aria-hidden": ariaHidden = true, ...rest }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      role={ariaHidden === true || ariaHidden === "true" ? undefined : "img"}
      focusable="false"
      {...rest}
    >
      {shapes}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

const p = (d: string) => <path d={d} />;

// Navigation
export const HomeIcon = createIcon("HomeIcon", p("M4 10.5L12 4l8 6.5V19a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z"));
export const ImportIcon = createIcon("ImportIcon", p("M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 15.5v3a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5v-3"));
export const VaultIcon = createIcon("VaultIcon", p("M4.5 5.5h15v13h-15zM4.5 9.5h15M9 13.5h6"));
export const PracticeIcon = createIcon("PracticeIcon", p("M4 19.5h16M6.5 16.5V10M10.5 16.5V5.5M14.5 16.5V12M18.5 16.5V8"));
export const ChordDojoIcon = createIcon("ChordDojoIcon", p("M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 8a4 4 0 100 8 4 4 0 000-8zM12 11.2v1.6"));
export const VoicingLoopIcon = createIcon("VoicingLoopIcon", p("M7 7.5h9.5a3.5 3.5 0 010 7H15M17 16.5H7.5a3.5 3.5 0 010-7H9M9 5l-2.5 2.5L9 10M15 19l2.5-2.5L15 14"));
export const BassPracticeIcon = createIcon("BassPracticeIcon", p("M5 18.5l9-9M14 9.5l2.5-2.5a1.8 1.8 0 012.5 2.5L16.5 12M6.5 20L4 17.5M9.5 5v4M12.5 3.5v4M19 13.5h-4"));
export const LiveMidiIcon = createIcon("LiveMidiIcon", p("M3 6.5h18v11H3zM7.5 6.5v6.5M12 6.5v6.5M16.5 6.5v6.5"));
export const SettingsIcon = createIcon("SettingsIcon", <>{p("M4 7h10M18 7h2M4 17h4M12 17h8")}<circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>);

// Header
export const SearchIcon = createIcon("SearchIcon", <><circle cx="11" cy="11" r="6.5" />{p("M16 16l4.5 4.5")}</>);
export const MidiIcon = createIcon("MidiIcon", p("M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM8 11v.2M16 11v.2M9.5 15v.2M14.5 15v.2M12 8v.2"));
export const ToneIcon = createIcon("ToneIcon", p("M3 12h3l2-5 3 10 3-8 2 3h5"));
export const MetronomeIcon = createIcon("MetronomeIcon", p("M8.5 3.5h7L19 20.5H5zM12 15l4.5-7.5M6.5 14.5h11"));
export const VolumeIcon = createIcon("VolumeIcon", p("M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"));

// Window
export const MinimizeIcon = createIcon("MinimizeIcon", p("M5.5 12h13"));
export const MaximizeIcon = createIcon("MaximizeIcon", p("M6 6h12v12H6z"));
export const RestoreIcon = createIcon("RestoreIcon", p("M8.5 8.5h10v10h-10zM5.5 15.5v-10h10"));
export const CloseIcon = createIcon("CloseIcon", p("M6 6l12 12M18 6L6 18"));

// Status (glyphs; the toast draws the tinted circle around them, as in the mock)
export const SuccessIcon = createIcon("SuccessIcon", p("M5 12.5l4.5 4.5L19 7.5"));
export const InfoIcon = createIcon("InfoIcon", p("M12 11v6M12 7.5v.2"));
export const WarningIcon = createIcon("WarningIcon", p("M12 7v6M12 16.5v.2"));
export const ErrorIcon = createIcon("ErrorIcon", p("M7 7l10 10M17 7L7 17"));

// Actions
export const PlayIcon = createIcon("PlayIcon", p("M8 5l12 7-12 7z"));
export const StopIcon = createIcon("StopIcon", p("M6.5 6.5h11v11h-11z"));
export const LoopIcon = createIcon("LoopIcon", p("M17 7.5H8.5a4 4 0 00-4 4M7 16.5h8.5a4 4 0 004-4M14.5 5L17 7.5 14.5 10M9.5 19L7 16.5 9.5 14"));
export const SwapIcon = createIcon("SwapIcon", p("M4 12a8 8 0 0113.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.6L4 15.5M4 20v-4.5h4.5"));
export const FavoriteIcon = createIcon("FavoriteIcon", p("M12 19.5s-7.5-4.4-7.5-9.7A4.3 4.3 0 0112 7.4a4.3 4.3 0 017.5 2.4c0 5.3-7.5 9.7-7.5 9.7z"));
export const UndoIcon = createIcon("UndoIcon", p("M9 14.5L4.5 10 9 5.5M4.5 10H14a5.5 5.5 0 010 11h-3"));
export const ChevronDownIcon = createIcon("ChevronDownIcon", p("M6 9.5l6 6 6-6"));

/** Catalog for the component gallery (Japanese names used in the P8.9 spec). */
export const iconCatalog: ReadonlyArray<readonly [string, IconComponent]> = [
  ["ホーム", HomeIcon], ["取り込む", ImportIcon], ["Vault", VaultIcon], ["練習", PracticeIcon],
  ["Chord Dojo", ChordDojoIcon], ["Voicing Loop", VoicingLoopIcon], ["Bass Practice", BassPracticeIcon],
  ["Live MIDI", LiveMidiIcon], ["設定", SettingsIcon], ["検索", SearchIcon], ["MIDI", MidiIcon],
  ["試聴音色", ToneIcon], ["メトロノーム", MetronomeIcon], ["音量", VolumeIcon], ["最小化", MinimizeIcon],
  ["最大化", MaximizeIcon], ["元に戻す（ウィンドウ）", RestoreIcon], ["閉じる", CloseIcon],
  ["成功", SuccessIcon], ["お知らせ", InfoIcon], ["注意", WarningIcon], ["エラー", ErrorIcon],
  ["再生", PlayIcon], ["停止", StopIcon], ["ループ", LoopIcon], ["入れ替え", SwapIcon],
  ["お気に入り", FavoriteIcon], ["元に戻す（操作）", UndoIcon], ["開く（下向き）", ChevronDownIcon],
];
