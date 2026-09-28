import { MetronomeIcon } from "./icons";
import { useMetronome } from "./MetronomeProvider";
import { IconButton } from "./ui";

/** P8.9-08: icon-only state button (purple while on); the name is in the tooltip. Shared metronome state. */
export function GlobalMetronomeButton() {
  const { enabled, toggle } = useMetronome();
  const label = "メトロノーム：" + (enabled ? "ON" : "OFF");
  return (
    <IconButton
      variant="state"
      label={label}
      aria-pressed={enabled}
      data-testid="global-metronome"
      className="lv-global-metronome !h-[30px] !min-h-[30px] !w-[34px]"
      onClick={toggle}
    >
      <MetronomeIcon size={17} />
    </IconButton>
  );
}
