import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { PreviewSound } from "../../audio/chordPreview";
import { createTextTransport } from "../../audio/textTransport";
import type { PlaybackController } from "../../audio/playbackController";

export function useTextTransport(controller: PlaybackController, sound: PreviewSound, sourceId: string) {
  const transport = useMemo(() => createTextTransport(controller,
    { kind: "capture", id: sourceId }, sound), [controller, sound, sourceId]);
  const state = useSyncExternalStore(transport.subscribe, transport.getState, transport.getState);
  useEffect(() => () => transport.dispose(), [transport]);
  return { transport, state };
}
