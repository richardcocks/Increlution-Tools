export interface IncrelutionAction {
  id: number;  // Unique database ID (offset by type)
  originalId: number;  // Original ID from Increlution (0-based per type, for export)
  name: string;
  icon: string;
  type: ActionType;
  skillId: number;
  chapter: number;
  sortOrder: number;
}

export interface Skill {
  id: number;
  name: string;
  icon: string;
}

export type ActionType = 0 | 1 | 2;  // 0=Jobs, 1=Construction, 2=Exploration

export const ActionType = {
  Jobs: 0 as const,
  Construction: 1 as const,
  Exploration: 2 as const
};

export type AutomationLevel = 0 | 1 | 2 | 3 | 4 | null;  // null=No override, 0=Off, 1=Low, 2=Regular, 3=High, 4=Top

export const AutomationLevel = {
  NoOverride: null,
  Off: 0 as const,
  Low: 1 as const,
  Regular: 2 as const,
  High: 3 as const,
  Top: 4 as const
};

// LoadoutData matches the Increlution export format
// Dictionary<ActionType, Dictionary<ActionId, AutomationLevel>>
export type LoadoutData = Record<number, Record<number, number | null>>;

export interface Loadout {
  id: number;
  name: string;
  folderId: number;
  createdAt: string;
  updatedAt: string;
  isProtected: boolean;
  data: LoadoutData;
}

export interface LoadoutSummary {
  id: number;
  name: string;
  updatedAt: string;
  isProtected: boolean;
}

export interface FolderTreeNode {
  id: number;
  name: string;
  parentId: number | null;
  subFolders: FolderTreeNode[];
  loadouts: LoadoutSummary[];
}

// Sharing types
export interface LoadoutShare {
  id: number;
  shareToken: string;
  createdAt: string;
  expiresAt: string | null;
  showAttribution: boolean;
}

export interface SharedLoadout {
  name: string;
  data: LoadoutData;
  updatedAt: string;
  ownerName: string | null;  // null if attribution disabled
}

export interface SavedShare {
  id: number;
  shareToken: string;
  loadoutName: string;
  ownerName: string | null;
  savedAt: string;
}

export interface CreateShareOptions {
  expiresInHours?: number | null;
  showAttribution?: boolean;
}

// User's share with loadout info (for Manage Shares page)
export interface UserShare {
  id: number;
  shareToken: string;
  loadoutId: number;
  loadoutName: string;
  createdAt: string;
  expiresAt: string | null;
  showAttribution: boolean;
}
