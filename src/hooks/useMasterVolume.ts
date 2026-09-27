// P8.9-02: master volume state for the shell header (split out of App.tsx).
import { useEffect, useState } from "react";
import { applyMasterVolume, loadMasterVolume, normalizeMasterVolume, saveMasterVolume } from "../audio/masterVolume";

export function useMasterVolume() {
  const [masterVolume, setMasterVolume] = useState(() => loadMasterVolume());

  useEffect(() => {
    applyMasterVolume(masterVolume);
  }, [masterVolume]);

  function changeMasterVolume(value: number) {
    const normalized = normalizeMasterVolume(value);
    setMasterVolume(normalized);
    saveMasterVolume(normalized);
  }

  return { masterVolume, changeMasterVolume };
}
