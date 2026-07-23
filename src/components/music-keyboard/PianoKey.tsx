import { memo } from "react";
import { formatCLabel, formatMidiNoteForDisplay } from "./noteDisplay";
import type {
  NoteAccidentalStyle,
  PianoGuideHand,
  PianoKeyGeometry,
  PianoKeyVisualState,
} from "./types";

interface PianoKeyProps {
  geometry: PianoKeyGeometry;
  visualState: PianoKeyVisualState;
  showCLabel: boolean;
  guideBass: boolean;
  heldBass: boolean;
  guideHand?: PianoGuideHand;
  accidentalStyle: NoteAccidentalStyle;
}

const stateColors: Record<PianoKeyVisualState, string | undefined> = {
  idle: undefined,
  guide: "#0f766e",
  "held-correct": "#5eead4",
  "held-foreign": "#fbbf24",
  sustained: undefined,
  "guide-and-held": "#5eead4",
  "guide-and-sustained": "#0f766e",
};

export const PianoKey = memo(function PianoKey({
  geometry,
  visualState,
  showCLabel,
  guideBass,
  heldBass,
  guideHand,
  accidentalStyle,
}: PianoKeyProps) {
  const { black, height, note, width, x } = geometry;
  const label = showCLabel ? formatCLabel(note) : undefined;
  const baseFill = black ? "#171717" : "#f5f5f4";
  const baseStroke = black ? "#525252" : "#737373";
  const guideColor = guideHand === "right" ? "#5eead4" : "#0f766e";
  const overlayFill = isGuideState(visualState) ? guideColor : stateColors[visualState];
  const isHeld = visualState === "held-correct"
    || visualState === "held-foreign"
    || visualState === "guide-and-held";
  const isGuide = visualState === "guide"
    || visualState === "guide-and-held"
    || visualState === "guide-and-sustained";
  const isSustained = visualState === "sustained"
    || visualState === "guide-and-sustained";

  return (
    <g
      data-midi-note={note}
      data-key-kind={black ? "black" : "white"}
      data-visual-state={visualState}
      data-guide-hand={guideHand}
    >
      <title>{`${formatMidiNoteForDisplay(note, "fl-studio", accidentalStyle)} (${note})`}</title>
      <rect
        x={x}
        y={0}
        width={width}
        height={height}
        fill={baseFill}
        stroke={baseStroke}
        strokeWidth={1}
        rx={black ? 1.5 : 0.75}
      />
      {overlayFill ? (
        <rect
          x={x + 1}
          y={1}
          width={Math.max(0, width - 2)}
          height={Math.max(0, height - 2)}
          fill={overlayFill}
          fillOpacity={isHeld ? 0.96 : guideHand ? 0.34 : 0.7}
          stroke={isGuide ? guideColor : overlayFill}
          strokeWidth={isHeld || guideHand ? 2 : 1}
          rx={black ? 1 : 0}
          className="transition-[fill,stroke] duration-[40ms]"
        />
      ) : null}
      {isSustained ? (
        <g aria-hidden="true">
          <rect
            x={x + 1}
            y={height * 0.74}
            width={Math.max(0, width - 2)}
            height={height * 0.25 - 1}
            fill="#38bdf8"
            fillOpacity={0.72}
          />
          {Array.from({ length: Math.max(1, Math.floor(width / 5)) }, (_, index) => (
            <line
              key={index}
              x1={x + index * 5}
              y1={height - 1}
              x2={x + Math.min(width, index * 5 + 5)}
              y2={height * 0.74}
              stroke="#bae6fd"
              strokeWidth={0.8}
              opacity={0.8}
            />
          ))}
        </g>
      ) : null}
      {isGuide && isHeld ? (
        <circle
          aria-hidden="true"
          cx={x + width / 2}
          cy={Math.min(height - 9, height * 0.78)}
          r={2.5}
          fill="#134e4a"
        />
      ) : null}
      {guideBass || heldBass ? (
        <g aria-hidden="true">
          <line
            x1={x + 3}
            y1={height - 7}
            x2={x + width - 3}
            y2={height - 7}
            stroke={heldBass ? "#0f766e" : "#14b8a6"}
            strokeWidth={heldBass ? 3 : 1.5}
          />
          {guideBass ? (
            <text
              x={x + width / 2}
              y={height - 10}
              textAnchor="middle"
              fontSize={5.5}
              fontWeight={700}
              fill={black ? "#ccfbf1" : "#134e4a"}
            >
              BASS
            </text>
          ) : null}
        </g>
      ) : null}
      {label && !black ? (
        <text
          data-c-label={label}
          x={x + width / 2}
          y={height - 3}
          textAnchor="middle"
          fontSize={10}
          fontWeight={600}
          fill={isHeld ? "#042f2e" : "#525252"}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
});

function isGuideState(state: PianoKeyVisualState): boolean {
  return state === "guide"
    || state === "guide-and-held"
    || state === "guide-and-sustained";
}
