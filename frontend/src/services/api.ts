import type { IncrelutionAction, Loadout, AutomationLevel, Skill, LoadoutData, FolderTreeNode, LoadoutShare, SharedLoadout, SavedShare, CreateShareOptions, UserShare, FolderShare, UserFolderShare, SharedFolder, SharedFolderLoadout, SavedShareUnified } from '../types/models';
import type { UserInfo } from '../types/auth';
import type { UserSettings } from '../types/settings';
import { defaultSettings } from '../types/settings';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export const api = {
  // Auth endpoints

  // Get Discord OAuth login URL - redirects to Discord
  getDiscordLoginUrl(): string {
    return `${API_BASE}/auth/discord`;
  },

  async logout(): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Logout failed');
    }
  },

  async getCurrentUser(): Promise<UserInfo | null> {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include'
    });
    if (!response.ok) {
      return null;
    }
    return response.json();
  },

  async deleteAccount(): Promise<void> {
    const response = await fetch(`${API_BASE}/auth/account`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to delete account');
    }
  },

  // Development-only: login as test user
  async devLogin(username: string): Promise<UserInfo> {
    const response = await fetch(`${API_BASE}/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Dev login failed');
    }
    return response.json();
  },

  // Game data endpoints
  async getActions(): Promise<IncrelutionAction[]> {
    const response = await fetch(`${API_BASE}/actions`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch actions: ${response.statusText}`);
    }
    return response.json();
  },

  async getSkills(): Promise<Record<number, Skill>> {
    const response = await fetch(`${API_BASE}/skills`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch skills: ${response.statusText}`);
    }
    return response.json();
  },

  async getFolderTree(): Promise<FolderTreeNode> {
    const response = await fetch(`${API_BASE}/folders/tree`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch folder tree: ${response.statusText}`);
    }
    return response.json();
  },

  async getLoadout(id: number): Promise<Loadout> {
    const response = await fetch(`${API_BASE}/loadout/${id}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch loadout: ${response.statusText}`);
    }
    return response.json();
  },

  async createFolder(name: string, parentId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, parentId })
    });
    if (!response.ok) {
      throw new Error(`Failed to create folder: ${response.statusText}`);
    }
  },

  async renameFolder(id: number, name: string): Promise<void> {
    const response = await fetch(`${API_BASE}/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name })
    });
    if (!response.ok) {
      throw new Error(`Failed to rename folder: ${response.statusText}`);
    }
  },

  async deleteFolder(id: number, force = false): Promise<{ foldersDeleted: number; loadoutsDeleted: number; protectedLoadoutsMoved: number }> {
    const response = await fetch(`${API_BASE}/folders/${id}?force=${force}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to delete folder: ${response.statusText}`);
    }
    return response.json();
  },

  async reorderItems(folderId: number, itemType: 'folder' | 'loadout', orderedIds: number[]): Promise<void> {
    const response = await fetch(`${API_BASE}/folders/${folderId}/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ itemType, orderedIds })
    });
    if (!response.ok) {
      throw new Error(`Failed to reorder items: ${response.statusText}`);
    }
  },

  async moveFolder(id: number, parentId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/folders/${id}/parent`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ parentId })
    });
    if (!response.ok) {
      throw new Error(`Failed to move folder: ${response.statusText}`);
    }
  },

  async createLoadout(name: string, folderId: number): Promise<Loadout> {
    const response = await fetch(`${API_BASE}/loadouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, folderId })
    });
    if (!response.ok) {
      throw new Error(`Failed to create loadout: ${response.statusText}`);
    }
    return response.json();
  },

  async deleteLoadout(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/loadouts/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to delete loadout: ${response.statusText}`);
    }
  },

  async updateActionAutomationLevel(loadoutId: number, actionType: number, actionId: number, level: AutomationLevel, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${API_BASE}/loadout/action`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ loadoutId, actionType, actionId, automationLevel: level }),
      signal
    });
    if (!response.ok) {
      throw new Error(`Failed to update automation level: ${response.statusText}`);
    }
  },

  async updateLoadoutName(id: number, name: string): Promise<void> {
    const response = await fetch(`${API_BASE}/loadouts/${id}/name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name })
    });
    if (!response.ok) {
      throw new Error(`Failed to update loadout name: ${response.statusText}`);
    }
  },

  async updateLoadoutProtection(id: number, isProtected: boolean): Promise<{ isProtected: boolean }> {
    const response = await fetch(`${API_BASE}/loadouts/${id}/protection`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isProtected })
    });
    if (!response.ok) {
      throw new Error(`Failed to update loadout protection: ${response.statusText}`);
    }
    return response.json();
  },

  async moveLoadout(id: number, folderId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/loadouts/${id}/folder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ folderId })
    });
    if (!response.ok) {
      throw new Error(`Failed to move loadout: ${response.statusText}`);
    }
  },

  async duplicateLoadout(id: number): Promise<{ id: number; name: string; folderId: number; updatedAt: string; isProtected: boolean }> {
    const response = await fetch(`${API_BASE}/loadouts/${id}/duplicate`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to duplicate loadout: ${response.statusText}`);
    }
    return response.json();
  },

  async duplicateFolder(id: number): Promise<{ id: number; name: string; parentId: number | null; totalFoldersCopied: number; totalLoadoutsCopied: number }> {
    const response = await fetch(`${API_BASE}/folders/${id}/duplicate`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to duplicate folder: ${response.statusText}`);
    }
    return response.json();
  },

  async exportLoadout(id: number): Promise<LoadoutData> {
    const response = await fetch(`${API_BASE}/loadouts/${id}/export`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to export loadout: ${response.statusText}`);
    }
    return response.json();
  },

  async importLoadout(id: number, data: LoadoutData): Promise<void> {
    const response = await fetch(`${API_BASE}/loadouts/${id}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ data })
    });
    if (!response.ok) {
      throw new Error(`Failed to import loadout: ${response.statusText}`);
    }
  },

  // Settings endpoints
  async getSettings(): Promise<UserSettings> {
    const response = await fetch(`${API_BASE}/settings`, {
      credentials: 'include'
    });
    if (!response.ok) {
      return defaultSettings;
    }
    return response.json();
  },

  async updateSettings(settings: UserSettings): Promise<UserSettings> {
    const response = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(settings)
    });
    if (!response.ok) {
      throw new Error(`Failed to update settings: ${response.statusText}`);
    }
    return response.json();
  },

  async unlockChapter(chapter: number, explorationName: string): Promise<{
    success: boolean;
    message: string;
    unlockedChapters?: number[];
  }> {
    const response = await fetch(`${API_BASE}/settings/unlock-chapter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ chapter, explorationName })
    });
    return response.json();
  },

  // Share management (authenticated)
  async createShare(loadoutId: number, options: CreateShareOptions): Promise<LoadoutShare> {
    const response = await fetch(`${API_BASE}/loadouts/${loadoutId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        expiresInHours: options.expiresInHours,
        showAttribution: options.showAttribution ?? true
      })
    });
    if (!response.ok) {
      throw new Error(`Failed to create share: ${response.statusText}`);
    }
    return response.json();
  },

  async getLoadoutShares(loadoutId: number): Promise<LoadoutShare[]> {
    const response = await fetch(`${API_BASE}/loadouts/${loadoutId}/shares`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to get shares: ${response.statusText}`);
    }
    return response.json();
  },

  async revokeShare(shareId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/shares/${shareId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to revoke share: ${response.statusText}`);
    }
  },

  async getAllShares(): Promise<UserShare[]> {
    const response = await fetch(`${API_BASE}/shares`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to get shares: ${response.statusText}`);
    }
    return response.json();
  },

  // Public viewing
  async getSharedLoadout(token: string): Promise<SharedLoadout> {
    const response = await fetch(`${API_BASE}/share/${token}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      let errorMessage = `Failed to get shared loadout: ${response.statusText}`;
      try {
        const data = await response.json();
        if (data.error) errorMessage = data.error;
      } catch {
        // Response wasn't JSON, use default message
      }
      throw new Error(errorMessage);
    }
    return response.json();
  },

  // Saved shares (authenticated)
  async saveShare(token: string): Promise<SavedShare> {
    const response = await fetch(`${API_BASE}/share/${token}/save`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to save share: ${response.statusText}`);
    }
    return response.json();
  },

  async getSavedShares(): Promise<SavedShare[]> {
    const response = await fetch(`${API_BASE}/saved-shares`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to get saved shares: ${response.statusText}`);
    }
    return response.json();
  },

  async removeSavedShare(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/saved-shares/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to remove saved share: ${response.statusText}`);
    }
  },

  // === Folder Sharing ===

  async createFolderShare(folderId: number, options: CreateShareOptions): Promise<FolderShare> {
    const response = await fetch(`${API_BASE}/folders/${folderId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        expiresInHours: options.expiresInHours,
        showAttribution: options.showAttribution ?? true
      })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to create folder share: ${response.statusText}`);
    }
    return response.json();
  },

  async getFolderShares(folderId: number): Promise<FolderShare[]> {
    const response = await fetch(`${API_BASE}/folders/${folderId}/shares`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to get folder shares: ${response.statusText}`);
    }
    return response.json();
  },

  async getAllFolderShares(): Promise<UserFolderShare[]> {
    const response = await fetch(`${API_BASE}/folder-shares`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to get folder shares: ${response.statusText}`);
    }
    return response.json();
  },

  async revokeFolderShare(shareId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/folder-shares/${shareId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to revoke folder share: ${response.statusText}`);
    }
  },

  // Public folder viewing
  async getSharedFolder(token: string): Promise<SharedFolder> {
    const response = await fetch(`${API_BASE}/share/folder/${token}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      let errorMessage = `Failed to get shared folder: ${response.statusText}`;
      try {
        const data = await response.json();
        if (data.error) errorMessage = data.error;
      } catch {
        // Response wasn't JSON, use default message
      }
      throw new Error(errorMessage);
    }
    return response.json();
  },

  async getSharedFolderLoadout(token: string, loadoutId: number): Promise<SharedFolderLoadout> {
    const response = await fetch(`${API_BASE}/share/folder/${token}/loadout/${loadoutId}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      let errorMessage = `Failed to get loadout from shared folder: ${response.statusText}`;
      try {
        const data = await response.json();
        if (data.error) errorMessage = data.error;
      } catch {
        // Response wasn't JSON, use default message
      }
      throw new Error(errorMessage);
    }
    return response.json();
  },

  async saveFolderShare(token: string): Promise<SavedShareUnified> {
    const response = await fetch(`${API_BASE}/share/folder/${token}/save`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to save folder share: ${response.statusText}`);
    }
    return response.json();
  },

  // Unified saved shares (both loadouts and folders)
  async getSavedSharesUnified(): Promise<SavedShareUnified[]> {
    const response = await fetch(`${API_BASE}/saved-shares/unified`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to get saved shares: ${response.statusText}`);
    }
    return response.json();
  }
};
