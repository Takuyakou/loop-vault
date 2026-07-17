import type { LiveMidiDevice, PreferredMidiInput } from "./types";

export function resolvePreferredInput(
  devices: readonly LiveMidiDevice[],
  preferred: PreferredMidiInput | undefined,
): LiveMidiDevice | undefined {
  if (!preferred) return undefined;

  if (preferred.backendId) {
    const stableMatch = devices.find((device) => device.backendId === preferred.backendId);
    if (stableMatch) return stableMatch;
  }

  const nameMatches = devices.filter((device) => device.name === preferred.name);
  if (nameMatches.length === 1) return nameMatches[0];
  if (preferred.previousIndex !== undefined) {
    return nameMatches.find((device) => device.index === preferred.previousIndex);
  }
  return undefined;
}

export function preferredInputFromDevice(device: LiveMidiDevice): PreferredMidiInput {
  return { backendId: device.backendId, name: device.name, previousIndex: device.index };
}
