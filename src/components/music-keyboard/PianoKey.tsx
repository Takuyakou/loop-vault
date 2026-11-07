import { GUIDE_HAND_COLORS } from "./handColors";
import { memo } from "react";
import { formatCLabel, formatMidiNoteForDisplay } from "./noteDisplay";
import type {
  NoteAccidentalStyle,
  KeyboardOctaveConvention,
  PianoGuideHand,
  PianoKeyGeometry,
  PianoKeyVisualState,
} from "./types";

interface PianoKeyProps {
  octaveConvention?: KeyboardOctaveConvention;
  geometry: PianoKeyGeometry;
  visualState: PianoKeyVisualState;
  showCLabel: boolean;
  guideBass: boolean;
  heldBass: boolean;
  guideHand?: PianoGuideHand;
  fingerLabel?: string;
  accidentalStyle: NoteAccidentalStyle;
  concealNoteName?: boolean;
  appearance?: "default" | "dojo";
  colorGuideHands?: boolean;
  /** Dojo appearance: how much larger the answer marks and the finger marks are drawn (1 as before). */
  markScale?: number;
  missingGuide?: boolean;
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
  octaveConvention = "fl-studio",
  visualState,
  showCLabel,
  guideBass,
  heldBass,
  guideHand,
  fingerLabel,
  accidentalStyle,
  concealNoteName = false,
  appearance = "default",
  colorGuideHands = false,
  markScale = 1,
  missingGuide = false,
}: PianoKeyProps) {
  const { black, height, note, width, x } = geometry;
  const label = showCLabel ? formatCLabel(note, octaveConvention) : undefined;
  const baseFill = black ? "#171717" : "#f5f5f4";
  const baseStroke = black ? "#525252" : "#737373";
  const guideColor = GUIDE_HAND_COLORS[guideHand ?? "unknown"];
  const overlayFill = isGuideState(visualState) ? guideColor : stateColors[visualState];
  const isHeld = visualState === "held-correct"
    || visualState === "held-foreign"
    || visualState === "guide-and-held";
  const isGuide = visualState === "guide"
    || visualState === "guide-and-held"
    || visualState === "guide-and-sustained";
  const isSustained = visualState === "sustained"
    || visualState === "guide-and-sustained";

  if (appearance === "dojo") {
    const answerColor = colorGuideHands ? guideColor : "#42d8c6";
    const fill = visualState === "held-foreign" ? black ? "#c4505a" : "#ffb3b8"
      : isHeld ? black ? "#4f7fd6" : "#8fb7ff" : black ? "#1a2230" : "#d5dce5";
    return <g data-midi-note={note} data-key-kind={black ? "black" : "white"} data-visual-state={visualState} data-guide-hand={guideHand} data-missing-guide={missingGuide || undefined}>
      {!concealNoteName ? <title>{`${formatMidiNoteForDisplay(note, octaveConvention, accidentalStyle)}${fingerLabel ? `, ${fingerLabel}` : ""}`}</title> : null}
      <rect x={x} y={0} width={width} height={height} fill={fill} stroke="#0a1019" strokeWidth={1} rx={black ? 3 : 5}/>
      {isGuide ? <circle data-answer-marker aria-hidden="true" cx={x + width / 2} cy={whiteMarkY(height, black, markScale)} r={(black ? 5 : 6) * markScale} fill={missingGuide ? "none" : answerColor} stroke={missingGuide ? answerColor : "#0a1019"} strokeWidth={2} strokeDasharray={missingGuide ? "3 2" : undefined}/> : null}
      <FingerLabel label={fingerLabel} geometry={geometry} hand={guideHand} dojo scale={markScale}/>
      {isSustained ? <line aria-hidden="true" x1={x+3} x2={x+width-3} y1={height-10} y2={height-10} stroke="#8bd7ff" strokeWidth={2}/> : null}
      {label && !black ? <text data-c-label={label} x={x+width/2} y={height-4} textAnchor="middle" fontSize={10} fill="#45536a">{label}</text> : null}
    </g>;
  }

  return (
    <g
      data-midi-note={note}
      data-key-kind={black ? "black" : "white"}
      data-visual-state={visualState}
      data-guide-hand={guideHand}
    >
      {!concealNoteName ? (
        <title>{`${formatMidiNoteForDisplay(note, octaveConvention, accidentalStyle)} (${note})${fingerLabel ? `, ${fingerLabel}` : ""}${guideBass ? "、ベースの参考音" : ""}`}</title>
      ) : null}
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
        <g aria-hidden="true" data-bass-reference={guideBass ? "guide" : "held"}>
          <line
            x1={x + 3}
            y1={height - 7}
            x2={x + width - 3}
            y2={height - 7}
            stroke={heldBass ? "#0f766e" : "#14b8a6"}
            strokeWidth={heldBass ? 3 : 1.5}
          />
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
      <FingerLabel label={fingerLabel} geometry={geometry} hand={guideHand}/>
    </g>
  );
});

function isGuideState(state: PianoKeyVisualState): boolean {
  return state === "guide"
    || state === "guide-and-held"
    || state === "guide-and-sustained";
}

/** Where the mark of a pressed key is centred; a larger mark on a white key sits a little lower, so that its label can stand under the black keys. */
const whiteMarkY=(height:number,black:boolean,scale:number)=>height-(black?15:24)*scale+(black||scale<=1?0:(scale-1)*20);

/** The production finger-label renderer is shared by both keyboard appearances. */
function FingerLabel({label,geometry,hand,dojo=false,scale=1}:{label?:string;geometry:PianoKeyGeometry;hand?:PianoGuideHand;dojo?:boolean;scale?:number}){
 if(!label)return null;const {x,width,height,black}=geometry;
 return <text data-finger-label={label} x={x+width/2} y={black?dojo?height*.60:height-8:scale>1?whiteMarkY(height,false,scale)-6*scale-5:height*.68} textAnchor="middle" fontSize={(black?7:9)*scale} fontWeight={800} fill={hand==='left'?black?'#fef3c7':'#451a03':hand==='right'?black?'#cffafe':'#083344':black?'#ccfbf1':'#042f2e'}>{label}</text>;
}
