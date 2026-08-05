import type {
  ChannelMode,
  RecorderErrorCode,
  RecordingTakeMetadata,
} from "./types";

/**
 * Explicit recorder state machine (brief §12). It is deliberately separate from
 * the Practice session reducer: a recording failure disables only recording and
 * returns to `ready`/`idle`, never abandoning the Practice session.
 *
 * Every transition is validated. Invalid actions return a typed error instead of
 * mutating state, so double-start, double-stop, play-while-recording and similar
 * races are impossible by construction.
 */

export type RecorderStatus =
  | "unavailable"
  | "idle"
  | "requesting-permission"
  | "permission-denied"
  | "device-missing"
  | "ready"
  | "counting-in"
  | "starting"
  | "recording"
  | "stopping"
  | "recorded"
  | "playing-target"
  | "playing-take"
  | "saving"
  | "saved"
  | "discarded"
  | "error";

export interface RecorderState {
  readonly status: RecorderStatus;
  readonly channelMode: ChannelMode;
  /** Present once a take exists (recorded and later states). */
  readonly take?: RecordingTakeMetadata;
  /** True once the user has heard My Take at least once (contract 01). */
  readonly heardTake: boolean;
  /** Set only in the `error` state. */
  readonly errorCode?: RecorderErrorCode;
  /** Non-fatal note surfaced after a failed save while the take is kept. */
  readonly saveFailed: boolean;
}

export type RecorderAction =
  | { readonly type: "PROBE"; readonly available: boolean }
  | { readonly type: "SET_CHANNEL"; readonly channelMode: ChannelMode }
  | { readonly type: "REQUEST_PERMISSION" }
  | { readonly type: "PERMISSION_GRANTED"; readonly hasDevice: boolean }
  | { readonly type: "PERMISSION_DENIED" }
  | { readonly type: "RETRY_PERMISSION" }
  | { readonly type: "DEVICE_AVAILABLE" }
  | { readonly type: "START_COUNT_IN" }
  | { readonly type: "CANCEL_COUNT_IN" }
  | { readonly type: "COUNT_IN_ELAPSED" }
  | { readonly type: "RECORDER_STARTED" }
  | { readonly type: "STOP" }
  | { readonly type: "RECORDER_STOPPED"; readonly take?: RecordingTakeMetadata }
  | { readonly type: "PLAY_TARGET" }
  | { readonly type: "PLAY_TAKE" }
  | { readonly type: "PLAYBACK_ENDED" }
  | { readonly type: "RETAKE" }
  | { readonly type: "DISCARD" }
  | { readonly type: "KEEP" }
  | { readonly type: "SAVED" }
  | { readonly type: "SAVE_FAILED"; readonly errorCode?: RecorderErrorCode }
  | { readonly type: "RECORDER_ERROR"; readonly errorCode: RecorderErrorCode }
  | { readonly type: "DEVICE_DISCONNECTED" }
  | { readonly type: "PERMISSION_REVOKED" }
  | { readonly type: "RESET" };

export type RecorderTransitionErrorCode =
  | "invalid-transition"
  | "invalid-channel";

export type RecorderTransitionResult =
  | { readonly ok: true; readonly state: RecorderState }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: RecorderTransitionErrorCode;
        readonly message: string;
      };
    };

const CHANNEL_MODES: readonly ChannelMode[] = ["auto", "left", "right", "mono-sum"];

const PLAYBACK_STATUSES: readonly RecorderStatus[] = [
  "playing-target",
  "playing-take",
];

export function createRecorderState(
  channelMode: ChannelMode = "auto",
): RecorderState {
  if (!CHANNEL_MODES.includes(channelMode)) {
    throw new RangeError("Unknown channel mode.");
  }
  return freeze({ status: "idle", channelMode, heardTake: false, saveFailed: false });
}

export function reduceRecorder(
  state: RecorderState,
  action: RecorderAction,
): RecorderTransitionResult {
  // Global teardown is always safe (feature-flag OFF, unmount, route leave).
  if (action.type === "RESET") {
    return ok({
      status: state.status === "unavailable" ? "unavailable" : "idle",
      channelMode: state.channelMode,
      heardTake: false,
      saveFailed: false,
    });
  }

  // Channel selection is allowed before a recording is in flight.
  if (action.type === "SET_CHANNEL") {
    if (!CHANNEL_MODES.includes(action.channelMode)) {
      return fail("invalid-channel", "Unknown channel mode.");
    }
    if (!canPickChannel(state.status)) {
      return fail("invalid-transition", `Channel cannot change while ${state.status}.`);
    }
    return ok({ ...state, channelMode: action.channelMode });
  }

  // Capability loss / hardware and permission faults can happen at many points.
  if (action.type === "DEVICE_DISCONNECTED") {
    return isLiveCapture(state.status)
      ? ok(errored(state, "device-disconnected"))
      : state.status === "ready" || state.status === "counting-in"
        ? ok({ ...state, status: "device-missing", take: undefined })
        : invalid(state, action.type);
  }
  if (action.type === "PERMISSION_REVOKED") {
    return state.status === "unavailable" || state.status === "idle"
      ? invalid(state, action.type)
      : ok(errored(state, "permission-revoked"));
  }
  if (action.type === "RECORDER_ERROR") {
    return isLiveCapture(state.status)
      ? ok(errored(state, action.errorCode))
      : invalid(state, action.type);
  }

  switch (action.type) {
    case "PROBE":
      if (state.status !== "unavailable" && state.status !== "idle") {
        return invalid(state, action.type);
      }
      return ok({ ...state, status: action.available ? "idle" : "unavailable" });

    case "REQUEST_PERMISSION":
      return state.status === "idle"
        ? ok({ ...state, status: "requesting-permission" })
        : invalid(state, action.type);

    case "PERMISSION_GRANTED":
      return state.status === "requesting-permission"
        ? ok({ ...state, status: action.hasDevice ? "ready" : "device-missing" })
        : invalid(state, action.type);

    case "PERMISSION_DENIED":
      return state.status === "requesting-permission"
        ? ok({ ...state, status: "permission-denied" })
        : invalid(state, action.type);

    case "RETRY_PERMISSION":
      return state.status === "permission-denied" || state.status === "error"
        ? ok({ status: "requesting-permission", channelMode: state.channelMode, heardTake: false, saveFailed: false })
        : invalid(state, action.type);

    case "DEVICE_AVAILABLE":
      return state.status === "device-missing"
        ? ok({ ...state, status: "ready" })
        : invalid(state, action.type);

    case "START_COUNT_IN":
      return state.status === "ready"
        ? ok({ ...state, status: "counting-in" })
        : invalid(state, action.type);

    case "CANCEL_COUNT_IN":
      return state.status === "counting-in"
        ? ok({ ...state, status: "ready" })
        : invalid(state, action.type);

    case "COUNT_IN_ELAPSED":
      return state.status === "counting-in"
        ? ok({ ...state, status: "starting" })
        : invalid(state, action.type);

    case "RECORDER_STARTED":
      return state.status === "starting"
        ? ok({ ...state, status: "recording" })
        : invalid(state, action.type);

    case "STOP":
      // Stop is accepted both while recording and immediately after start.
      return state.status === "recording" || state.status === "starting"
        ? ok({ ...state, status: "stopping" })
        : invalid(state, action.type);

    case "RECORDER_STOPPED":
      if (state.status !== "stopping") return invalid(state, action.type);
      return action.take
        ? ok({ ...state, status: "recorded", take: action.take })
        : ok({ ...state, status: "ready", take: undefined });

    case "PLAY_TARGET":
      return state.status === "recorded"
        ? ok({ ...state, status: "playing-target" })
        : invalid(state, action.type);

    case "PLAY_TAKE":
      return state.status === "recorded"
        ? ok({ ...state, status: "playing-take", heardTake: true })
        : invalid(state, action.type);

    case "PLAYBACK_ENDED":
      return PLAYBACK_STATUSES.includes(state.status)
        ? ok({ ...state, status: "recorded" })
        : invalid(state, action.type);

    case "RETAKE":
      return state.status === "recorded" || PLAYBACK_STATUSES.includes(state.status)
        ? ok({ status: "ready", channelMode: state.channelMode, heardTake: false, saveFailed: false })
        : invalid(state, action.type);

    case "DISCARD":
      return state.status === "recorded" || PLAYBACK_STATUSES.includes(state.status)
        ? ok({ status: "discarded", channelMode: state.channelMode, heardTake: state.heardTake, saveFailed: false })
        : invalid(state, action.type);

    case "KEEP":
      return state.status === "recorded"
        ? ok({ ...state, status: "saving", saveFailed: false })
        : invalid(state, action.type);

    case "SAVED":
      return state.status === "saving"
        ? ok({ ...state, status: "saved" })
        : invalid(state, action.type);

    case "SAVE_FAILED":
      // Save failure keeps the ephemeral take playable (contract 02, quota).
      return state.status === "saving"
        ? ok({ ...state, status: "recorded", saveFailed: true })
        : invalid(state, action.type);

    default:
      return invalid(state, (action as RecorderAction).type);
  }
}

function canPickChannel(status: RecorderStatus): boolean {
  return status === "idle" || status === "ready" || status === "permission-denied"
    || status === "device-missing" || status === "requesting-permission";
}

function isLiveCapture(status: RecorderStatus): boolean {
  return status === "counting-in" || status === "starting"
    || status === "recording" || status === "stopping";
}

function errored(state: RecorderState, errorCode: RecorderErrorCode): RecorderState {
  return {
    status: "error",
    channelMode: state.channelMode,
    heardTake: state.heardTake,
    errorCode,
    saveFailed: false,
  };
}

function ok(state: RecorderState): RecorderTransitionResult {
  return Object.freeze({ ok: true, state: freeze(state) });
}

function fail(
  code: RecorderTransitionErrorCode,
  message: string,
): RecorderTransitionResult {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

function invalid(
  state: RecorderState,
  action: RecorderAction["type"],
): RecorderTransitionResult {
  return fail("invalid-transition", `Action ${action} is invalid while recorder is ${state.status}.`);
}

function freeze(state: RecorderState): RecorderState {
  return Object.freeze(state);
}
