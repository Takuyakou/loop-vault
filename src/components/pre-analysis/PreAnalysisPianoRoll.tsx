import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { AnalysisSession } from "../../domain/midi/preAnalysis";
import type { AppLanguage } from "../../i18n";

const voiceColors = [
  "#2dd4bf",
  "#60a5fa",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#34d399",
  "#fb7185",
  "#38bdf8",
] as const;

interface NoteHitArea {
  voiceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PreAnalysisPianoRollProps {
  session: AnalysisSession;
  language: AppLanguage;
  selectedVoiceId?: string;
  zoom: number;
  viewportStartBeat: number;
  playheadBeat: number;
  onSelectVoice: (voiceId: string) => void;
  onViewportStartChange: (beat: number) => void;
}

export function PreAnalysisPianoRoll({
  session,
  language,
  selectedVoiceId,
  zoom,
  viewportStartBeat,
  playheadBeat,
  onSelectVoice,
  onViewportStartChange,
}: PreAnalysisPianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitAreasRef = useRef<NoteHitArea[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const render = () => {
      const width = Math.max(320, canvas.parentElement?.clientWidth ?? 900);
      const height = 330;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawPianoRoll(context, width, height, {
        session,
        selectedVoiceId,
        zoom,
        viewportStartBeat,
        playheadBeat,
      }, hitAreasRef);
    };
    render();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(render);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [playheadBeat, selectedVoiceId, session, viewportStartBeat, zoom]);

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const visibleBeats = visibleBeatCount(session, zoom);
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onViewportStartChange(Math.max(0, viewportStartBeat - visibleBeats / 16));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onViewportStartChange(Math.min(
        Math.max(0, sessionDuration(session) - visibleBeats),
        viewportStartBeat + visibleBeats / 16,
      ));
    } else if (event.key === "Home") {
      event.preventDefault();
      onViewportStartChange(0);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="block w-full border-y border-[var(--lv-border)] bg-[#0a111b] focus:outline-none focus:ring-2 focus:ring-[var(--lv-accent)]"
      role="img"
      tabIndex={0}
      aria-label={language === "ja"
        ? "Voiceを色分けした解析前ピアノロール。左右キーで時間を移動できます。"
        : "Pre-analysis piano roll colored by Voice. Use Left and Right to move in time."}
      data-testid="pre-analysis-piano-roll"
      onKeyDown={handleKeyDown}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        const hit = [...hitAreasRef.current].reverse().find((area) =>
          x >= area.x && x <= area.x + area.width
          && y >= area.y && y <= area.y + area.height);
        if (hit) onSelectVoice(hit.voiceId);
      }}
    />
  );
}

interface DrawOptions {
  session: AnalysisSession;
  selectedVoiceId?: string;
  zoom: number;
  viewportStartBeat: number;
  playheadBeat: number;
}

function drawPianoRoll(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: DrawOptions,
  hitAreasRef: { current: NoteHitArea[] },
) {
  const { session, selectedVoiceId, zoom, viewportStartBeat, playheadBeat } = options;
  const voiceById = new Map(session.voices.map((voice, index) => [
    voice.id,
    { voice, index },
  ]));
  const sourceById = new Map(session.sources.map((source) => [source.id, source]));
  const visibleNotes = session.notes.filter((note) => {
    const voice = voiceById.get(note.voiceId)?.voice;
    const source = sourceById.get(note.sourceId);
    return voice?.visible && source?.visible;
  });
  const pitches = visibleNotes.map((note) => note.pitch);
  const minPitch = Math.max(0, Math.min(...pitches, 48) - 2);
  const maxPitch = Math.min(127, Math.max(...pitches, 72) + 2);
  const pitchCount = Math.max(1, maxPitch - minPitch + 1);
  const gutter = 38;
  const ruler = 24;
  const noteWidth = width - gutter;
  const noteHeight = height - ruler;
  const visibleBeats = visibleBeatCount(session, zoom);
  const endBeat = viewportStartBeat + visibleBeats;
  const pixelsPerBeat = noteWidth / visibleBeats;
  const pixelsPerPitch = noteHeight / pitchCount;
  const meter = session.sources.find((source) =>
    source.id === session.masterSourceId)?.timeSignatures[0];
  const beatsPerBar = meter
    ? meter.numerator * 4 / meter.denominator
    : 4;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#0a111b";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#111a27";
  context.fillRect(0, ruler, gutter, noteHeight);
  context.font = "10px system-ui";
  context.textAlign = "right";
  context.textBaseline = "middle";

  for (let pitch = minPitch; pitch <= maxPitch; pitch += 1) {
    const y = ruler + (maxPitch - pitch) * pixelsPerPitch;
    const pitchClass = pitch % 12;
    context.fillStyle = isBlackKey(pitchClass) ? "#0d1521" : "#101b29";
    context.fillRect(gutter, y, noteWidth, Math.max(1, pixelsPerPitch));
    if (pitchClass === 0) {
      context.fillStyle = "#8da2bd";
      context.fillText(`C${Math.floor(pitch / 12) - 1}`, gutter - 5, y + pixelsPerPitch / 2);
    }
  }

  context.textAlign = "left";
  context.textBaseline = "middle";
  const firstBeat = Math.floor(viewportStartBeat);
  for (let beat = firstBeat; beat <= endBeat; beat += 1) {
    const x = gutter + (beat - viewportStartBeat) * pixelsPerBeat;
    const isBar = Math.abs(beat / beatsPerBar - Math.round(beat / beatsPerBar)) < 1e-6;
    context.strokeStyle = isBar ? "#50627a" : "#26364a";
    context.lineWidth = isBar ? 1.2 : 0.5;
    context.beginPath();
    context.moveTo(x, ruler);
    context.lineTo(x, height);
    context.stroke();
    if (isBar) {
      context.fillStyle = "#a8b8cc";
      context.fillText(String(Math.floor(beat / beatsPerBar) + 1), x + 4, ruler / 2);
    }
  }

  const hitAreas: NoteHitArea[] = [];
  for (const note of visibleNotes) {
    if (note.startBeat + note.durationBeats < viewportStartBeat
      || note.startBeat > endBeat) continue;
    const voiceEntry = voiceById.get(note.voiceId);
    if (!voiceEntry) continue;
    const x = gutter + (note.startBeat - viewportStartBeat) * pixelsPerBeat;
    const y = ruler + (maxPitch - note.pitch) * pixelsPerPitch + 1;
    const clippedX = Math.max(gutter, x);
    const clippedEnd = Math.min(width, x + note.durationBeats * pixelsPerBeat);
    const rectWidth = Math.max(2, clippedEnd - clippedX);
    const rectHeight = Math.max(2, pixelsPerPitch - 2);
    const selected = note.voiceId === selectedVoiceId;
    const included = voiceEntry.voice.included;
    context.globalAlpha = included ? (selected ? 1 : 0.78) : 0.28;
    context.fillStyle = voiceColors[voiceEntry.index % voiceColors.length];
    context.fillRect(clippedX, y, rectWidth, rectHeight);
    if (selected) {
      context.strokeStyle = "#ffffff";
      context.lineWidth = 1;
      context.strokeRect(clippedX, y, rectWidth, rectHeight);
    }
    hitAreas.push({
      voiceId: note.voiceId,
      x: clippedX,
      y,
      width: rectWidth,
      height: rectHeight,
    });
  }
  context.globalAlpha = 1;

  if (playheadBeat >= viewportStartBeat && playheadBeat <= endBeat) {
    const x = gutter + (playheadBeat - viewportStartBeat) * pixelsPerBeat;
    context.strokeStyle = "#f8fafc";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  hitAreasRef.current = hitAreas;
}

function visibleBeatCount(session: AnalysisSession, zoom: number): number {
  return Math.max(4, sessionDuration(session) / Math.max(1, zoom));
}

function sessionDuration(session: AnalysisSession): number {
  return Math.max(1, ...session.sources.map((source) => source.durationBeats));
}

function isBlackKey(pitchClass: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitchClass);
}
