import type { LoadoutData, IncrelutionAction } from '../types/models';

export class LoadoutParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoadoutParseError';
  }
}

/**
 * Parse and validate raw JSON data into LoadoutData format.
 * Handles string keys from JSON parsing and validates automation levels.
 */
export function parseLoadoutData(raw: unknown): LoadoutData {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LoadoutParseError('Loadout data must be an object');
  }

  const result: LoadoutData = {};

  for (const [typeKey, typeValue] of Object.entries(raw as Record<string, unknown>)) {
    const actionType = Number(typeKey);

    if (!Number.isInteger(actionType) || actionType < 0 || actionType > 2) {
      throw new LoadoutParseError(`Invalid action type: ${typeKey}. Must be 0, 1, or 2.`);
    }

    if (typeValue === null || typeof typeValue !== 'object' || Array.isArray(typeValue)) {
      throw new LoadoutParseError(`Action type ${typeKey} must contain an object`);
    }

    result[actionType] = {};

    for (const [actionKey, level] of Object.entries(typeValue as Record<string, unknown>)) {
      const actionId = Number(actionKey);

      if (!Number.isInteger(actionId) || actionId < 0) {
        throw new LoadoutParseError(`Invalid action ID: ${actionKey}`);
      }

      if (level === null) {
        result[actionType][actionId] = null;
      } else if (typeof level === 'number' && Number.isInteger(level) && level >= 0 && level <= 4) {
        result[actionType][actionId] = level;
      } else {
        throw new LoadoutParseError(`Invalid automation level for action ${actionKey}: ${level}. Must be 0-4 or null.`);
      }
    }
  }

  return result;
}

/**
 * Parse JSON string into LoadoutData
 */
export function parseLoadoutJson(json: string): LoadoutData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new LoadoutParseError('Invalid JSON');
  }
  return parseLoadoutData(parsed);
}

/**
 * Filter loadout data to only include actions from unlocked chapters.
 * Actions from locked chapters are excluded from the result.
 */
/**
 * Ensure loadout data has all three action type keys (0, 1, 2),
 * even if empty. Increlution requires all keys to be present on import.
 */
export function normalizeLoadoutData(data: LoadoutData): LoadoutData {
  return {
    0: data[0] ?? {},
    1: data[1] ?? {},
    2: data[2] ?? {},
  };
}

/**
 * Compare two LoadoutData objects and count how many actions have changed.
 * An action is considered "changed" if its automation level differs between old and new.
 * Handles undefined (not set) vs null (locked) vs number (automation level).
 */
export function countLoadoutChanges(oldData: LoadoutData | undefined, newData: LoadoutData): number {
  let changeCount = 0;

  // Collect all action keys from both old and new data
  const actionTypes = [0, 1, 2] as const;

  for (const actionType of actionTypes) {
    const oldTypeData = oldData?.[actionType] ?? {};
    const newTypeData = newData[actionType] ?? {};

    // Get all unique action IDs from both
    const allActionIds = new Set([
      ...Object.keys(oldTypeData).map(Number),
      ...Object.keys(newTypeData).map(Number),
    ]);

    for (const actionId of allActionIds) {
      const oldValue = oldTypeData[actionId];
      const newValue = newTypeData[actionId];

      // Compare values - undefined and missing are equivalent
      // Both undefined/missing -> no change
      // Both same value -> no change
      // Different values -> change
      if (oldValue !== newValue) {
        changeCount++;
      }
    }
  }

  return changeCount;
}

export function filterLoadoutByChapters(
  data: LoadoutData,
  actions: IncrelutionAction[],
  unlockedChapters: Set<number>
): LoadoutData {
  // Build a lookup map: type -> originalId -> chapter
  const chapterLookup = new Map<number, Map<number, number>>();
  for (const action of actions) {
    if (!chapterLookup.has(action.type)) {
      chapterLookup.set(action.type, new Map());
    }
    chapterLookup.get(action.type)!.set(action.originalId, action.chapter);
  }

  const result: LoadoutData = { 0: {}, 1: {}, 2: {} };

  for (const [typeKey, typeData] of Object.entries(data)) {
    const actionType = Number(typeKey);
    const typeLookup = chapterLookup.get(actionType);

    for (const [actionKey, level] of Object.entries(typeData)) {
      const originalId = Number(actionKey);
      const chapter = typeLookup?.get(originalId);

      // Only include if chapter is unlocked (or if we can't find chapter info, include it)
      if (chapter === undefined || unlockedChapters.has(chapter)) {
        result[actionType][originalId] = level;
      }
    }
  }

  return result;
}
