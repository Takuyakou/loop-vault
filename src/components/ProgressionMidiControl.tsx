import {
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FileMusic, GripVertical } from "lucide-react";
import type { ProgressionMidiExportResult } from "../domain/midiExport";
import {
  prepareProgressionDragFile,
  saveProgressionMidi,
  type PreparedProgressionMidiDragFile,
  type ProgressionMidiSaveResult,
} from "../midiExport/fileService";
import {
  startPreparedProgressionMidiDrag,
  type NativeProgressionMidiDragResult,
} from "../midiExport/nativeDrag";
import type { AppLanguage } from "../i18n";
import { Button } from "./ui";

const DRAG_THRESHOLD_PX = 6;

export interface ProgressionMidiControlActions {
  save(result: ProgressionMidiExportResult): Promise<ProgressionMidiSaveResult>;
  prepare(
    result: ProgressionMidiExportResult,
  ): Promise<PreparedProgressionMidiDragFile>;
  startDrag(
    prepared: PreparedProgressionMidiDragFile,
  ): Promise<NativeProgressionMidiDragResult>;
}

interface ProgressionMidiControlProps {
  result?: ProgressionMidiExportResult;
  disabledReason?: string;
  language: AppLanguage;
  setToast: (message: string) => void;
  actions?: ProgressionMidiControlActions;
}

interface PointerGesture {
  pointerId: number;
  startX: number;
  startY: number;
  held: boolean;
  dragStarted: boolean;
  prepared: Promise<
    | { ok: true; artifact: PreparedProgressionMidiDragFile }
    | { ok: false; error: unknown }
  >;
}

const defaultActions: ProgressionMidiControlActions = {
  save: saveProgressionMidi,
  prepare: prepareProgressionDragFile,
  startDrag: startPreparedProgressionMidiDrag,
};

export function ProgressionMidiControl({
  actions = defaultActions,
  disabledReason,
  language,
  result,
  setToast,
}: ProgressionMidiControlProps) {
  const ja = language === "ja";
  const [state, setState] = useState<
    "idle" | "preparing" | "dragging" | "saving"
  >("idle");
  const [inlineError, setInlineError] = useState<string>();
  const statusId = useId();
  const gesture = useRef<PointerGesture>();
  const suppressClick = useRef(false);
  const disabled = !result || Boolean(disabledReason) || state !== "idle";
  const accessibleName = ja
    ? "このコード進行をMIDIとして保存。ドラッグするとDAWへ追加できます。"
    : "Save this progression as MIDI. Drag it to add the file to a DAW.";
  const tooltip = ja
    ? "ドラッグしてDAWへ。クリックしてMIDIファイルとして保存"
    : "Drag to a DAW. Click to save as a MIDI file";
  const statusText = state === "preparing"
    ? (ja ? "MIDIを準備中" : "Preparing MIDI")
    : state === "dragging"
      ? (ja ? "DAWへドラッグ中" : "Dragging to DAW")
      : state === "saving"
        ? (ja ? "保存先を選択中" : "Choosing save location")
        : undefined;

  async function save() {
    if (!result || disabledReason || state !== "idle") return;
    setInlineError(undefined);
    setState("saving");
    try {
      const saved = await actions.save(result);
      if (saved.status === "saved") {
        setToast(ja ? "MIDIファイルを保存しました。" : "MIDI file saved.");
      }
    } catch {
      const message = ja
        ? "MIDIを保存できませんでした。保存先と権限を確認してください。"
        : "Could not save the MIDI file. Check the destination and permissions.";
      setInlineError(message);
      setToast(message);
    } finally {
      setState("idle");
    }
  }

  function beginPointerGesture(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!result || disabledReason || state !== "idle" || event.button !== 0) return;
    const prepared = actions.prepare(result).then(
      (artifact) => ({ ok: true as const, artifact }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      held: true,
      dragStarted: false,
      prepared,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function continuePointerGesture(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    if (
      !current
      || current.pointerId !== event.pointerId
      || current.dragStarted
      || !current.held
    ) {
      return;
    }
    const distance = Math.hypot(
      event.clientX - current.startX,
      event.clientY - current.startY,
    );
    if (distance < DRAG_THRESHOLD_PX) return;
    current.dragStarted = true;
    suppressClick.current = true;
    setState("preparing");
    setInlineError(undefined);
    void runNativeDrag(current);
  }

  async function runNativeDrag(current: PointerGesture) {
    const prepared = await current.prepared;
    if (!current.held) {
      setState("idle");
      return;
    }
    if (!prepared.ok) {
      showDragError();
      return;
    }
    setState("dragging");
    try {
      const dragResult = await actions.startDrag(prepared.artifact);
      if (dragResult.status === "error") {
        showDragError();
        return;
      }
      if (dragResult.status === "dropped") {
        setToast(ja ? "MIDIをDAWへ渡しました。" : "MIDI was dropped into the DAW.");
      }
    } catch {
      showDragError();
      return;
    } finally {
      setState("idle");
    }
  }

  function showDragError() {
    const message = ja
      ? "DAWへのドラッグを開始できませんでした。クリックしてMIDI保存をお試しください。"
      : "Could not start the DAW drag. Click MIDI to save the file instead.";
    setInlineError(message);
    setToast(message);
    setState("idle");
  }

  function endPointerGesture(event: ReactPointerEvent<HTMLButtonElement>) {
    if (gesture.current?.pointerId === event.pointerId) {
      gesture.current.held = false;
    }
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2" data-midi-export-control>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="cursor-grab active:cursor-grabbing"
        aria-label={accessibleName}
        aria-describedby={statusId}
        title={disabledReason ?? tooltip}
        disabled={disabled}
        onPointerDown={beginPointerGesture}
        onPointerMove={continuePointerGesture}
        onPointerUp={endPointerGesture}
        onPointerCancel={endPointerGesture}
        onClick={(event) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            event.preventDefault();
            return;
          }
          void save();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <FileMusic aria-hidden="true" size={16} />
        MIDI
        <GripVertical aria-hidden="true" size={16} />
      </Button>
      {result ? (
        <span className="whitespace-nowrap text-xs text-[var(--lv-text-muted)]">
          {voicingLabel(result.voicingSummary, language)}
        </span>
      ) : null}
      <span
        id={statusId}
        className={`min-w-0 text-xs ${inlineError ? "text-[var(--lv-danger)]" : "text-[var(--lv-text-muted)]"}`}
        aria-live="polite"
        role={inlineError ? "alert" : "status"}
      >
        {inlineError ?? statusText ?? disabledReason}
      </span>
    </div>
  );
}

function voicingLabel(
  source: ProgressionMidiExportResult["voicingSummary"],
  language: AppLanguage,
): string {
  const ja = language === "ja";
  const labels = ja
    ? {
        saved: "保存ボイシング",
        edited: "編集ボイシング",
        generated: "自動ボイシング",
        mixed: "混在ボイシング",
      }
    : {
        saved: "Saved voicing",
        edited: "Edited voicing",
        generated: "Generated voicing",
        mixed: "Mixed voicing",
      };
  return labels[source];
}
