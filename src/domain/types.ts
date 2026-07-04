export type Status =
  | "idea"
  | "loop"
  | "arrange"
  | "mix"
  | "done"
  | "hold"
  | "abandoned";

export type AssetType = "midi" | "audio" | "flp" | "other";

export interface SongIdea {
  id: string;
  title: string;
  bpm?: number;
  key?: string;
  genre?: string;
  moods: string[];
  status: Status;
  prevStatus?: Status;
  nextAction: {
    text: string;
    updatedAt: string;
  };
  chordMemo: string;
  references: { title: string; url?: string; memo?: string }[];
  assets: {
    id: string;
    type: AssetType;
    path?: string;
    memo?: string;
    missing?: boolean;
  }[];
  chordDrip?: unknown;
  statusHistory: { status: Status; at: string }[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface VaultFile {
  app: "loopvault";
  fileVersion: 1;
  settings: { monthlyGoal: number };
  ideas: SongIdea[];
}
