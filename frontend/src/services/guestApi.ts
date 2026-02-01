import { api } from './api';
import type { ApiType } from '../contexts/ApiContext';
import type { FolderTreeNode, IncrelutionAction, Loadout, LoadoutData, SavedShareUnified } from '../types/models';
import { ActionType } from '../types/models';
import type { UserSettings } from '../types/settings';
import { defaultSettings, makeSkillActionKey } from '../types/settings';

const STORAGE_KEY = 'guest_data';

interface GuestData {
  folderTree: FolderTreeNode;
  loadouts: Record<number, Loadout>;
  settings: UserSettings;
  savedShares: SavedShareUnified[];
  nextId: number;
}

function loadData(): GuestData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // Corrupt data, start fresh
  }
  return getDefaultData();
}

function getDefaultData(): GuestData {
  return {
    folderTree: {
      id: -1,
      name: 'My Loadouts',
      parentId: null,
      isReadOnly: false,
      subFolders: [],
      loadouts: []
    },
    loadouts: {},
    settings: { ...defaultSettings },
    savedShares: [],
    nextId: -2
  };
}

function persist(data: GuestData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      throw new Error('Browser storage is full. Try deleting some loadouts or folders to free up space.');
    }
    throw e;
  }
}

function levenshteinDistance(s1: string, s2: string): number {
  const n = s1.length;
  const m = s2.length;
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = s1[i - 1].toLowerCase() === s2[j - 1].toLowerCase() ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[n][m];
}

function fuzzyMatch(input: string, target: string, baseMaxDistance = 2): boolean {
  const normalizedInput = input.trim();
  const normalizedTarget = target.trim();

  if (normalizedInput.toLowerCase() === normalizedTarget.toLowerCase()) return true;

  const distance = levenshteinDistance(normalizedInput, normalizedTarget);
  const effectiveMaxDistance = Math.max(baseMaxDistance, Math.floor(target.length / 6));
  return distance <= effectiveMaxDistance;
}

function getFirstExplorationName(actions: IncrelutionAction[], chapter: number): string | null {
  const explorations = actions
    .filter(a => a.type === ActionType.Exploration && a.chapter === chapter)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return explorations.length > 0 ? explorations[0].name : null;
}

function allocateId(data: GuestData): number {
  const id = data.nextId;
  data.nextId = id - 1;
  return id;
}

// Deep clone a folder tree, reassigning all IDs
function cloneFolderTree(node: FolderTreeNode, parentId: number | null, data: GuestData): FolderTreeNode {
  const newId = allocateId(data);
  const clonedLoadouts = node.loadouts.map(l => {
    const newLoadoutId = allocateId(data);
    const original = data.loadouts[l.id];
    if (original) {
      data.loadouts[newLoadoutId] = {
        ...original,
        id: newLoadoutId,
        folderId: newId,
        name: original.name
      };
    }
    return { ...l, id: newLoadoutId };
  });
  return {
    id: newId,
    name: node.name,
    parentId,
    isReadOnly: node.isReadOnly,
    subFolders: node.subFolders.map(sub => cloneFolderTree(sub, newId, data)),
    loadouts: clonedLoadouts
  };
}

function findFolder(tree: FolderTreeNode, id: number): FolderTreeNode | null {
  if (tree.id === id) return tree;
  for (const sub of tree.subFolders) {
    const found = findFolder(sub, id);
    if (found) return found;
  }
  return null;
}

function findParentFolder(tree: FolderTreeNode, childId: number): FolderTreeNode | null {
  for (const sub of tree.subFolders) {
    if (sub.id === childId) return tree;
    const found = findParentFolder(sub, childId);
    if (found) return found;
  }
  return null;
}

function countContents(node: FolderTreeNode, data: GuestData): { folders: number; loadouts: number; protectedMoved: number } {
  let folders = 0;
  let loadouts = 0;
  let protectedMoved = 0;
  for (const l of node.loadouts) {
    const loadout = data.loadouts[l.id];
    if (loadout?.isProtected) {
      protectedMoved++;
    } else {
      loadouts++;
    }
  }
  for (const sub of node.subFolders) {
    folders++;
    const subCounts = countContents(sub, data);
    folders += subCounts.folders;
    loadouts += subCounts.loadouts;
    protectedMoved += subCounts.protectedMoved;
  }
  return { folders, loadouts, protectedMoved };
}

function deleteContents(node: FolderTreeNode, data: GuestData, parentForProtected: FolderTreeNode): void {
  // Move protected loadouts to parent, delete others
  for (const l of node.loadouts) {
    const loadout = data.loadouts[l.id];
    if (loadout?.isProtected) {
      parentForProtected.loadouts.push(l);
      loadout.folderId = parentForProtected.id;
    } else {
      delete data.loadouts[l.id];
    }
  }
  for (const sub of node.subFolders) {
    deleteContents(sub, data, parentForProtected);
  }
}

export function createGuestApi(): ApiType {
  let data = loadData();
  let cachedActions: IncrelutionAction[] | null = null;

  const save = () => persist(data);

  function ensureDefaultsInitialized(): void {
    if (data.settings.skillPrioritiesInitialized || !cachedActions) return;

    // Initialize all skill/action-type combos to Regular (2), matching SettingsPage behavior
    const defaultPriorities: Record<string, number> = {};
    const seenSkills = new Set<string>();
    for (const action of cachedActions) {
      const key = makeSkillActionKey(action.skillId, action.type);
      if (!seenSkills.has(key)) {
        seenSkills.add(key);
        defaultPriorities[key] = 2; // Regular
      }
    }
    data.settings.defaultSkillPriorities = defaultPriorities;
    data.settings.skillPrioritiesInitialized = true;
    save();
  }

  function buildDefaultLoadoutData(): LoadoutData {
    const result: LoadoutData = {};
    if (!cachedActions) return result;

    ensureDefaultsInitialized();

    const settings = data.settings;
    const unlockedChapters = new Set(settings.unlockedChapters ?? [0]);

    for (const action of cachedActions) {
      if (!unlockedChapters.has(action.chapter)) continue;

      const key = makeSkillActionKey(action.skillId, action.type);
      const priority = settings.defaultSkillPriorities[key];
      if (priority !== undefined) {
        if (!result[action.type]) {
          result[action.type] = {};
        }
        result[action.type][action.originalId] = priority;
      }
    }
    return result;
  }

  const guestApi: ApiType = {
    // Auth - no-ops for guest
    getDiscordLoginUrl() {
      return '/login';
    },
    async logout() { /* no-op */ },
    async getCurrentUser() {
      return { id: -1, username: 'Guest' };
    },
    async deleteAccount() {
      localStorage.removeItem(STORAGE_KEY);
      data = getDefaultData();
    },
    async devLogin() {
      return { id: -1, username: 'Guest' };
    },

    // Game data - delegate to real API (public endpoints, already cached in api.ts)
    async getActions() {
      const actions = await api.getActions();
      cachedActions = actions;
      return actions;
    },
    async getSkills() {
      return api.getSkills();
    },

    // Folder tree
    async getFolderTree() {
      return JSON.parse(JSON.stringify(data.folderTree));
    },

    // Loadout CRUD
    async getLoadout(id: number) {
      const loadout = data.loadouts[id];
      if (!loadout) throw new Error('Loadout not found');
      return JSON.parse(JSON.stringify(loadout));
    },

    async createFolder(name: string, parentId: number) {
      const parent = findFolder(data.folderTree, parentId);
      if (!parent) throw new Error('Parent folder not found');
      const id = allocateId(data);
      parent.subFolders.push({
        id,
        name,
        parentId,
        isReadOnly: false,
        subFolders: [],
        loadouts: []
      });
      save();
    },

    async renameFolder(id: number, name: string) {
      const folder = findFolder(data.folderTree, id);
      if (!folder) throw new Error('Folder not found');
      folder.name = name;
      save();
    },

    async deleteFolder(id: number, force = false) {
      const folder = findFolder(data.folderTree, id);
      if (!folder) throw new Error('Folder not found');
      const parent = findParentFolder(data.folderTree, id);
      if (!parent) throw new Error('Cannot delete root folder');

      const hasContents = folder.subFolders.length > 0 || folder.loadouts.length > 0;
      if (hasContents && !force) {
        throw new Error('Folder is not empty');
      }

      const counts = countContents(folder, data);
      deleteContents(folder, data, parent);

      // Remove the folder from parent
      parent.subFolders = parent.subFolders.filter(f => f.id !== id);
      save();

      return {
        foldersDeleted: counts.folders + 1,
        loadoutsDeleted: counts.loadouts,
        protectedLoadoutsMoved: counts.protectedMoved
      };
    },

    async setFolderReadOnly(folderId: number, isReadOnly: boolean) {
      const folder = findFolder(data.folderTree, folderId);
      if (!folder) throw new Error('Folder not found');
      folder.isReadOnly = isReadOnly;
      save();
      return { isReadOnly };
    },

    async reorderItems(folderId: number, itemType: 'folder' | 'loadout', orderedIds: number[]) {
      const folder = findFolder(data.folderTree, folderId);
      if (!folder) throw new Error('Folder not found');
      if (itemType === 'folder') {
        const idOrder = new Map(orderedIds.map((id, i) => [id, i]));
        folder.subFolders.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
      } else {
        const idOrder = new Map(orderedIds.map((id, i) => [id, i]));
        folder.loadouts.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));
      }
      save();
    },

    async moveFolder(id: number, parentId: number) {
      const folder = findFolder(data.folderTree, id);
      if (!folder) throw new Error('Folder not found');
      const oldParent = findParentFolder(data.folderTree, id);
      if (!oldParent) throw new Error('Cannot move root folder');
      const newParent = findFolder(data.folderTree, parentId);
      if (!newParent) throw new Error('Target folder not found');

      oldParent.subFolders = oldParent.subFolders.filter(f => f.id !== id);
      folder.parentId = parentId;
      newParent.subFolders.push(folder);
      save();
    },

    async createLoadout(name: string, folderId: number) {
      const folder = findFolder(data.folderTree, folderId);
      if (!folder) throw new Error('Folder not found');

      const id = allocateId(data);
      const now = new Date().toISOString();
      const loadout: Loadout = {
        id,
        name,
        folderId,
        createdAt: now,
        updatedAt: now,
        isProtected: false,
        data: buildDefaultLoadoutData()
      };
      data.loadouts[id] = loadout;
      folder.loadouts.push({ id, name, updatedAt: now, isProtected: false });
      save();
      return loadout;
    },

    async deleteLoadout(id: number) {
      const loadout = data.loadouts[id];
      if (!loadout) throw new Error('Loadout not found');

      // Remove from folder tree
      const removeFromTree = (node: FolderTreeNode) => {
        node.loadouts = node.loadouts.filter(l => l.id !== id);
        node.subFolders.forEach(removeFromTree);
      };
      removeFromTree(data.folderTree);

      delete data.loadouts[id];
      save();
    },

    async updateActionAutomationLevel(loadoutId: number, actionType: number, actionId: number, level) {
      const loadout = data.loadouts[loadoutId];
      if (!loadout) throw new Error('Loadout not found');

      if (!loadout.data[actionType]) {
        loadout.data[actionType] = {};
      }
      if (level === null) {
        delete loadout.data[actionType][actionId];
      } else {
        loadout.data[actionType][actionId] = level;
      }
      loadout.updatedAt = new Date().toISOString();
      save();
    },

    async updateLoadoutName(id: number, name: string) {
      const loadout = data.loadouts[id];
      if (!loadout) throw new Error('Loadout not found');
      loadout.name = name;
      loadout.updatedAt = new Date().toISOString();

      // Update in folder tree
      const updateInTree = (node: FolderTreeNode) => {
        for (const l of node.loadouts) {
          if (l.id === id) l.name = name;
        }
        node.subFolders.forEach(updateInTree);
      };
      updateInTree(data.folderTree);
      save();
    },

    async updateLoadoutProtection(id: number, isProtected: boolean) {
      const loadout = data.loadouts[id];
      if (!loadout) throw new Error('Loadout not found');
      loadout.isProtected = isProtected;

      const updateInTree = (node: FolderTreeNode) => {
        for (const l of node.loadouts) {
          if (l.id === id) l.isProtected = isProtected;
        }
        node.subFolders.forEach(updateInTree);
      };
      updateInTree(data.folderTree);
      save();
      return { isProtected };
    },

    async moveLoadout(id: number, folderId: number) {
      const loadout = data.loadouts[id];
      if (!loadout) throw new Error('Loadout not found');

      // Remove from old folder
      const removeFromTree = (node: FolderTreeNode): { id: number; name: string; updatedAt: string; isProtected: boolean } | null => {
        const idx = node.loadouts.findIndex(l => l.id === id);
        if (idx >= 0) {
          const [summary] = node.loadouts.splice(idx, 1);
          return summary;
        }
        for (const sub of node.subFolders) {
          const found = removeFromTree(sub);
          if (found) return found;
        }
        return null;
      };
      const summary = removeFromTree(data.folderTree);

      // Add to new folder
      const newFolder = findFolder(data.folderTree, folderId);
      if (!newFolder) throw new Error('Target folder not found');
      if (summary) {
        newFolder.loadouts.push(summary);
      }

      loadout.folderId = folderId;
      save();
    },

    async duplicateLoadout(id: number) {
      const original = data.loadouts[id];
      if (!original) throw new Error('Loadout not found');

      const newId = allocateId(data);
      const now = new Date().toISOString();
      const newLoadout: Loadout = {
        ...JSON.parse(JSON.stringify(original)),
        id: newId,
        name: `${original.name} (copy)`,
        createdAt: now,
        updatedAt: now,
        isProtected: false
      };
      data.loadouts[newId] = newLoadout;

      // Add to same folder
      const folder = findFolder(data.folderTree, original.folderId);
      if (folder) {
        folder.loadouts.push({ id: newId, name: newLoadout.name, updatedAt: now, isProtected: false });
      }
      save();
      return { id: newId, name: newLoadout.name, folderId: original.folderId, updatedAt: now, isProtected: false };
    },

    async duplicateFolder(id: number) {
      const original = findFolder(data.folderTree, id);
      if (!original) throw new Error('Folder not found');
      const parent = findParentFolder(data.folderTree, id);
      if (!parent) throw new Error('Cannot duplicate root folder');

      const cloned = cloneFolderTree(original, parent.id, data);
      cloned.name = `${original.name} (copy)`;
      parent.subFolders.push(cloned);

      // Count
      const countFolders = (n: FolderTreeNode): number => 1 + n.subFolders.reduce((s, f) => s + countFolders(f), 0);
      const countLoadouts = (n: FolderTreeNode): number => n.loadouts.length + n.subFolders.reduce((s, f) => s + countLoadouts(f), 0);

      save();
      return {
        id: cloned.id,
        name: cloned.name,
        parentId: parent.id,
        totalFoldersCopied: countFolders(cloned),
        totalLoadoutsCopied: countLoadouts(cloned)
      };
    },

    async exportLoadout(id: number) {
      const loadout = data.loadouts[id];
      if (!loadout) throw new Error('Loadout not found');
      return JSON.parse(JSON.stringify(loadout.data));
    },

    async importLoadout(id: number, importData: LoadoutData) {
      const loadout = data.loadouts[id];
      if (!loadout) throw new Error('Loadout not found');
      loadout.data = JSON.parse(JSON.stringify(importData));
      loadout.updatedAt = new Date().toISOString();
      save();
    },

    // Settings
    async getSettings() {
      return JSON.parse(JSON.stringify(data.settings));
    },

    async updateSettings(settings: UserSettings) {
      data.settings = JSON.parse(JSON.stringify(settings));
      save();
      return data.settings;
    },

    async unlockChapter(chapter: number, explorationName: string) {
      if (chapter < 1 || chapter > 10) {
        return { success: false, message: 'Invalid chapter number' };
      }

      if (!cachedActions) {
        return { success: false, message: 'Game data not loaded yet' };
      }

      const expectedName = getFirstExplorationName(cachedActions, chapter);
      if (!expectedName) {
        return { success: false, message: 'Chapter not found' };
      }

      if (!fuzzyMatch(explorationName, expectedName)) {
        return { success: false, message: 'Incorrect exploration name' };
      }

      const chapters = new Set(data.settings.unlockedChapters);
      for (let i = 0; i <= chapter; i++) {
        chapters.add(i);
      }
      data.settings.unlockedChapters = Array.from(chapters);
      save();
      return { success: true, message: 'Chapter unlocked!', unlockedChapters: data.settings.unlockedChapters };
    },

    // Share creation - not available for guests
    async createShare() {
      throw new Error('Sign in with Discord to create share links');
    },
    async getLoadoutShares() {
      throw new Error('Sign in with Discord to manage shares');
    },
    async revokeShare() {
      throw new Error('Sign in with Discord to manage shares');
    },
    async getAllShares() {
      throw new Error('Sign in with Discord to manage shares');
    },
    async createFolderShare() {
      throw new Error('Sign in with Discord to create share links');
    },
    async getFolderShares() {
      throw new Error('Sign in with Discord to manage shares');
    },
    async getAllFolderShares() {
      throw new Error('Sign in with Discord to manage shares');
    },
    async revokeFolderShare() {
      throw new Error('Sign in with Discord to manage shares');
    },

    // Public share viewing - delegate to real API
    async getSharedLoadout(token: string) {
      return api.getSharedLoadout(token);
    },
    async getSharedFolder(token: string) {
      return api.getSharedFolder(token);
    },
    async getSharedFolderLoadout(token: string, loadoutId: number) {
      return api.getSharedFolderLoadout(token, loadoutId);
    },

    // Saved shares - localStorage backed
    async saveShare(token: string) {
      // Fetch the shared loadout info from server
      const shared = await api.getSharedLoadout(token);
      const id = allocateId(data);
      const savedShare: SavedShareUnified = {
        id,
        shareToken: token,
        shareType: 'loadout',
        itemName: shared.name,
        ownerName: shared.ownerName,
        savedAt: new Date().toISOString(),
        folderTree: null
      };
      data.savedShares.push(savedShare);
      save();
      // Return in SavedShare format for the caller
      return {
        id,
        shareToken: token,
        loadoutName: shared.name,
        ownerName: shared.ownerName,
        savedAt: savedShare.savedAt
      };
    },

    async getSavedShares() {
      return data.savedShares
        .filter(s => s.shareType === 'loadout')
        .map(s => ({
          id: s.id,
          shareToken: s.shareToken,
          loadoutName: s.itemName,
          ownerName: s.ownerName,
          savedAt: s.savedAt
        }));
    },

    async removeSavedShare(id: number) {
      data.savedShares = data.savedShares.filter(s => s.id !== id);
      save();
    },

    async saveFolderShare(token: string) {
      const shared = await api.getSharedFolder(token);
      const id = allocateId(data);
      const savedShare: SavedShareUnified = {
        id,
        shareToken: token,
        shareType: 'folder',
        itemName: shared.folderName,
        ownerName: shared.ownerName,
        savedAt: new Date().toISOString(),
        folderTree: shared.folderTree
      };
      data.savedShares.push(savedShare);
      save();
      return savedShare;
    },

    async getSavedSharesUnified() {
      return JSON.parse(JSON.stringify(data.savedShares));
    }
  };

  return guestApi;
}
