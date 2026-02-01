import type { ApiType } from '../contexts/ApiContext';
import type { GuestData } from './guestApi';
import { GUEST_STORAGE_KEY } from './guestApi';
import type { FolderTreeNode } from '../types/models';
import type { UserSettings } from '../types/settings';

export interface MigrationProgress {
  phase: string;
  current: number;
  total: number;
}

export interface MigrationResult {
  foldersCreated: number;
  loadoutsImported: number;
  settingsMerged: boolean;
}

export function readGuestData(): GuestData | null {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic shape check
    if (!parsed.folderTree || !parsed.loadouts) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasGuestData(): boolean {
  return readGuestData() !== null;
}

export function clearGuestData(): void {
  localStorage.removeItem(GUEST_STORAGE_KEY);
}

/** Count total folders (excluding root) and loadouts in guest data */
export function countGuestItems(data: GuestData): { folders: number; loadouts: number } {
  let folders = 0;
  let loadouts = 0;

  const walk = (node: FolderTreeNode, isRoot: boolean) => {
    if (!isRoot) folders++;
    loadouts += node.loadouts.length;
    for (const sub of node.subFolders) {
      walk(sub, false);
    }
  };
  walk(data.folderTree, true);
  return { folders, loadouts };
}

/** Check if guest has non-default settings worth migrating */
export function hasGuestSettings(data: GuestData): boolean {
  const s = data.settings;
  return (
    s.invertMouse ||
    s.applyDefaultsOnImport ||
    s.overwriteWhenNull ||
    s.disableWheelAnimation ||
    s.colorMode !== 'full' ||
    s.themePreference !== 'system' ||
    (s.unlockedChapters?.length ?? 0) > 1 ||
    (s.favouriteActions?.length ?? 0) > 0 ||
    Object.keys(s.defaultSkillPriorities).length > 0
  );
}

export async function migrateLoadouts(
  api: ApiType,
  guestData: GuestData,
  onProgress: (progress: MigrationProgress) => void
): Promise<{ foldersCreated: number; loadoutsImported: number }> {
  // Get server root folder
  const serverTree = await api.getFolderTree();
  const serverRootId = serverTree.id;

  // Count total work items
  const counts = countGuestItems(guestData);
  const total = counts.folders + counts.loadouts;
  let completed = 0;

  let foldersCreated = 0;
  let loadoutsImported = 0;

  const processFolder = async (guestFolder: FolderTreeNode, serverParentId: number) => {
    // Create loadouts in this folder
    for (const loadoutSummary of guestFolder.loadouts) {
      const guestLoadout = guestData.loadouts[loadoutSummary.id];
      if (!guestLoadout) {
        completed++;
        continue;
      }

      onProgress({ phase: `Importing "${guestLoadout.name}"...`, current: completed, total });

      const created = await api.createLoadout(guestLoadout.name, serverParentId);
      await api.importLoadout(created.id, guestLoadout.data);

      if (guestLoadout.isProtected) {
        await api.updateLoadoutProtection(created.id, true);
      }

      loadoutsImported++;
      completed++;
      onProgress({ phase: `Imported "${guestLoadout.name}"`, current: completed, total });
    }

    // Create subfolders and recurse
    for (const subFolder of guestFolder.subFolders) {
      onProgress({ phase: `Creating folder "${subFolder.name}"...`, current: completed, total });

      const created = await api.createFolder(subFolder.name, serverParentId);
      foldersCreated++;
      completed++;
      onProgress({ phase: `Created folder "${subFolder.name}"`, current: completed, total });

      await processFolder(subFolder, created.id);
    }
  };

  // Process children of the guest root into the server root
  await processFolder(guestData.folderTree, serverRootId);

  return { foldersCreated, loadoutsImported };
}

export async function migrateSettings(
  api: ApiType,
  guestData: GuestData
): Promise<void> {
  const serverSettings = await api.getSettings();
  const guest = guestData.settings;

  const merged: UserSettings = { ...serverSettings };

  // Merge unlocked chapters (union)
  const chapters = new Set([...(serverSettings.unlockedChapters ?? []), ...(guest.unlockedChapters ?? [])]);
  merged.unlockedChapters = Array.from(chapters);

  // Merge favourites (union)
  const favourites = new Set([...(serverSettings.favouriteActions ?? []), ...(guest.favouriteActions ?? [])]);
  merged.favouriteActions = Array.from(favourites);

  // Merge skill priorities: guest overrides server for keys not already set on server
  if (guest.skillPrioritiesInitialized) {
    merged.defaultSkillPriorities = { ...guest.defaultSkillPriorities, ...serverSettings.defaultSkillPriorities };
    merged.skillPrioritiesInitialized = true;
  }

  // Take guest preferences if server is still on defaults
  if (guest.invertMouse && !serverSettings.invertMouse) merged.invertMouse = true;
  if (guest.applyDefaultsOnImport && !serverSettings.applyDefaultsOnImport) merged.applyDefaultsOnImport = true;
  if (guest.overwriteWhenNull && !serverSettings.overwriteWhenNull) merged.overwriteWhenNull = true;
  if (guest.disableWheelAnimation && !serverSettings.disableWheelAnimation) merged.disableWheelAnimation = true;
  if (guest.themePreference !== 'system') merged.themePreference = guest.themePreference;
  if (guest.colorMode !== 'full') merged.colorMode = guest.colorMode;

  await api.updateSettings(merged);
}
