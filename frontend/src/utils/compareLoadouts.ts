import type { Loadout, IncrelutionAction, AutomationLevel } from '../types/models';

/**
 * Finds actions that have different automation levels between two loadouts.
 * Returns a Set of action IDs (the unique database ID, not originalId).
 */
export function findDifferingActions(
  leftLoadout: Loadout,
  rightLoadout: Loadout,
  actions: IncrelutionAction[]
): Set<number> {
  const differing = new Set<number>();

  for (const action of actions) {
    const leftLevel = getAutomationLevel(leftLoadout, action);
    const rightLevel = getAutomationLevel(rightLoadout, action);

    if (leftLevel !== rightLevel) {
      differing.add(action.id);
    }
  }

  return differing;
}

/**
 * Gets the automation level for an action from a loadout.
 * Returns the level or null if not set.
 */
export function getAutomationLevel(loadout: Loadout, action: IncrelutionAction): AutomationLevel {
  const typeData = loadout.data[action.type];
  if (!typeData) return null;

  const level = typeData[action.originalId];
  if (level === undefined) return null;

  return level as AutomationLevel;
}

/**
 * Compare colors for the two loadouts
 */
export const COMPARE_COLORS = {
  left: '#3b82f6',  // Blue
  right: '#22c55e', // Green
} as const;
