// Key format: "${skillId}-${actionType}" e.g., "5-0" for skillId 5, Jobs (actionType 0)
export type SkillActionKey = string;

export type ThemePreference = 'system' | 'dark' | 'light';

export interface UserSettings {
  invertMouse: boolean;
  defaultSkillPriorities: Record<SkillActionKey, number>;
  skillPrioritiesInitialized: boolean;
  applyDefaultsOnImport: boolean;
  favouriteActions: number[];
  unlockedChapters: number[];
  themePreference: ThemePreference;
}

export const defaultSettings: UserSettings = {
  invertMouse: false,
  defaultSkillPriorities: {},
  skillPrioritiesInitialized: false,
  applyDefaultsOnImport: false,
  favouriteActions: [],
  unlockedChapters: [0],
  themePreference: 'system'
};

// Helper functions for skill-action keys
export function makeSkillActionKey(skillId: number, actionType: number): SkillActionKey {
  return `${skillId}-${actionType}`;
}

export function parseSkillActionKey(key: SkillActionKey): { skillId: number; actionType: number } | null {
  const parts = key.split('-');
  if (parts.length !== 2) return null;
  const skillId = parseInt(parts[0], 10);
  const actionType = parseInt(parts[1], 10);
  if (isNaN(skillId) || isNaN(actionType)) return null;
  return { skillId, actionType };
}
