import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PreviewSound } from "../audio/chordPreview";
import {
  playbackController,
  type PlaybackController,
} from "../audio/playbackController";
import {
  DEFAULT_PREVIEW_SOUND,
  loadPreviewSound,
  savePreviewSound,
} from "../audio/previewSoundPreference";

interface PreviewSoundValue {
  sound: PreviewSound;
  setSound: (sound: PreviewSound) => void;
}

const PreviewSoundContext = createContext<PreviewSoundValue | null>(null);

export function PreviewSoundProvider({
  children,
  controller = playbackController,
}: {
  children: ReactNode;
  controller?: Pick<PlaybackController, "stop">;
}) {
  const [sound, setStoredSound] = useState(loadPreviewSound);
  const setSound = useCallback((next: PreviewSound) => {
    controller.stop();
    setStoredSound(next);
    savePreviewSound(next);
  }, [controller]);
  const value = useMemo(() => ({ sound, setSound }), [setSound, sound]);

  return (
    <PreviewSoundContext.Provider value={value}>
      {children}
    </PreviewSoundContext.Provider>
  );
}

export function usePreviewSound(): PreviewSoundValue {
  const shared = useContext(PreviewSoundContext);
  const [localSound, setLocalSound] = useState<PreviewSound>(DEFAULT_PREVIEW_SOUND);
  return shared ?? { sound: localSound, setSound: setLocalSound };
}
