import { useState, useEffect, useMemo, useCallback, useImperativeHandle, forwardRef, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { IncrelutionAction, Loadout, AutomationLevel, LoadoutData } from '../types/models';
import { ActionType } from '../types/models';
import { api } from '../services/api';
import { useToast } from './Toast';
import { useSettings } from '../contexts/SettingsContext';
import { useGameData } from '../contexts/GameDataContext';
import { makeSkillActionKey } from '../types/settings';
import { parseLoadoutJson, LoadoutParseError, filterLoadoutByChapters } from '../utils/loadoutData';
import LoadoutHeader from './LoadoutHeader';
import type { LoadoutHeaderHandle } from './LoadoutHeader';
import ChapterGroup from './ChapterGroup';
import './LoadoutEditor.css';

interface LoadoutEditorProps {
  loadoutId: number | null;
  folderBreadcrumb?: string[];
  isFolderReadOnly?: boolean;
  onNameChange?: (loadoutId: number, name: string) => void;
  onProtectionChange?: (loadoutId: number, isProtected: boolean) => void;
  onCreateLoadout?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export interface LoadoutEditorHandle {
  startEditingName: () => void;
}

const LoadoutEditor = forwardRef<LoadoutEditorHandle, LoadoutEditorProps>(({ loadoutId, folderBreadcrumb, isFolderReadOnly = false, onNameChange, onProtectionChange, onCreateLoadout, onDuplicate, onDelete }, ref) => {
  const { actions, skills, loading: gameDataLoading, error: gameDataError } = useGameData();
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [loadoutLoading, setLoadoutLoading] = useState(true);
  const [loadoutError, setLoadoutError] = useState<string | null>(null);
  const [activeChapter, setActiveChapter] = useState<number | 'all' | 'fav'>(0);
  const [searchFilter, setSearchFilter] = useState('');
  const { showToast } = useToast();
  const { settings, favouriteActionsSet, unlockedChaptersSet } = useSettings();
  const navigate = useNavigate();
  const headerRef = useRef<LoadoutHeaderHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Track previous values when locking actions, so unlock can restore them
  // Key: "type:originalId", Value: previous automation level
  const previousValuesRef = useRef<Map<string, number>>(new Map());
  // Track pending API calls per action to prevent race conditions
  // Key: "type:originalId", Value: AbortController
  const pendingUpdatesRef = useRef<Map<string, AbortController>>(new Map());
  // Undo/redo history stacks for loadout data
  const undoStackRef = useRef<LoadoutData[]>([]);
  const redoStackRef = useRef<LoadoutData[]>([]);
  const isUndoRedoRef = useRef(false);
  const MAX_UNDO_HISTORY = 50;

  useImperativeHandle(ref, () => ({
    startEditingName: () => headerRef.current?.startEditing()
  }));

  // Merge imported data with existing loadout data
  // When overwriteWhenNull is false, null values in the import are ignored and existing values preserved
  const mergeWithExisting = useCallback((importedData: LoadoutData, existingData: LoadoutData | undefined): LoadoutData => {
    if (!existingData || settings.overwriteWhenNull) {
      // No existing data or user wants nulls to overwrite - use imported data as-is
      return importedData;
    }

    // Start with a deep copy of existing data
    const result: LoadoutData = {};
    for (const typeKey of Object.keys(existingData)) {
      const actionType = Number(typeKey);
      result[actionType] = { ...existingData[actionType] };
    }

    // Merge imported data, but skip null values
    for (const typeKey of Object.keys(importedData)) {
      const actionType = Number(typeKey);
      const importedTypeData = importedData[actionType];

      if (!result[actionType]) {
        result[actionType] = {};
      }

      for (const actionKey of Object.keys(importedTypeData)) {
        const originalId = Number(actionKey);
        const importedValue = importedTypeData[originalId];

        // Only overwrite if imported value is not null
        if (importedValue !== null) {
          result[actionType][originalId] = importedValue;
        }
        // If importedValue is null and overwriteWhenNull is false, we skip it (keep existing value)
      }
    }

    return result;
  }, [settings.overwriteWhenNull]);

  // Apply default skill priorities to imported data
  const applyDefaultsToImport = useCallback((data: LoadoutData): LoadoutData => {
    if (!settings.applyDefaultsOnImport || Object.keys(settings.defaultSkillPriorities).length === 0) {
      return data;
    }

    const result: LoadoutData = { ...data };

    // For each action, if it's not set in the import, apply the default based on its skill and action type
    // Only apply to unlocked chapters
    actions.forEach(action => {
      // Skip actions from locked chapters
      if (!unlockedChaptersSet.has(action.chapter)) return;

      const typeData = result[action.type] ?? {};
      if (typeData[action.originalId] === undefined) {
        const key = makeSkillActionKey(action.skillId, action.type);
        const defaultPriority = settings.defaultSkillPriorities[key];
        if (defaultPriority !== undefined) {
          if (!result[action.type]) {
            result[action.type] = {};
          }
          result[action.type][action.originalId] = defaultPriority;
        }
      }
    });

    return result;
  }, [actions, settings.applyDefaultsOnImport, settings.defaultSkillPriorities, unlockedChaptersSet]);

  // Fetch loadout when loadoutId changes
  useEffect(() => {
    const fetchLoadout = async () => {
      if (!loadoutId) {
        setLoadout(null);
        setLoadoutLoading(false);
        return;
      }

      try {
        setLoadoutLoading(true);
        const loadoutData = await api.getLoadout(loadoutId);
        setLoadout(loadoutData);
        setLoadoutError(null);
      } catch (err) {
        setLoadoutError(err instanceof Error ? err.message : 'Failed to load loadout');
        console.error('Error fetching loadout:', err);
      } finally {
        setLoadoutLoading(false);
      }
    };

    // Clear undo/redo history when switching loadouts
    undoStackRef.current = [];
    redoStackRef.current = [];

    fetchLoadout();
  }, [loadoutId]);

  // Push current loadout data onto the undo stack
  const pushUndo = useCallback((currentData: LoadoutData) => {
    if (isUndoRedoRef.current) return;
    undoStackRef.current = [...undoStackRef.current.slice(-MAX_UNDO_HISTORY + 1), currentData];
    redoStackRef.current = [];
  }, []);

  const applyUndoRedo = useCallback(async (
    fromStack: LoadoutData[],
    toStack: LoadoutData[],
    label: string
  ) => {
    if (!loadout || !loadoutId || fromStack.length === 0) return;

    const targetData = fromStack.pop()!;
    toStack.push(loadout.data);

    isUndoRedoRef.current = true;
    setLoadout(prev => prev ? { ...prev, data: targetData, updatedAt: new Date().toISOString() } : prev);
    isUndoRedoRef.current = false;

    try {
      await api.importLoadout(loadoutId, targetData);
      showToast(label, 'success');
    } catch {
      showToast(`Failed to ${label.toLowerCase()}`, 'error');
      const loadoutData = await api.getLoadout(loadoutId);
      setLoadout(loadoutData);
    }
  }, [loadout, loadoutId, showToast]);

  const undo = useCallback(() => {
    applyUndoRedo(undoStackRef.current, redoStackRef.current, 'Undo');
  }, [applyUndoRedo]);

  const redo = useCallback(() => {
    applyUndoRedo(redoStackRef.current, undoStackRef.current, 'Redo');
  }, [applyUndoRedo]);

  // Handle global paste for import
  const handlePasteImport = useCallback(async (text: string) => {
    if (!loadout || !loadoutId) return;
    if (loadout.isProtected || isFolderReadOnly) return;

    pushUndo(loadout.data);

    try {
      const data = parseLoadoutJson(text);
      const mergedData = mergeWithExisting(data, loadout.data);
      const dataWithDefaults = applyDefaultsToImport(mergedData);
      await api.importLoadout(loadoutId, dataWithDefaults);

      // Refresh loadout data
      const loadoutData = await api.getLoadout(loadoutId);
      setLoadout(loadoutData);

      showToast('Loadout imported successfully!', 'success');
    } catch (err) {
      console.error('Error importing from paste:', err);
      if (err instanceof LoadoutParseError) {
        showToast(`Invalid loadout data: ${err.message}`, 'error');
      } else {
        showToast('Failed to import loadout', 'error');
      }
    }
  }, [loadout, loadoutId, showToast, mergeWithExisting, applyDefaultsToImport]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't intercept paste if user is in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const text = e.clipboardData?.getData('text');
      if (text && text.trim().startsWith('{')) {
        e.preventDefault();
        handlePasteImport(text);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePasteImport]);

  // Group actions by chapter, then by type
  const actionsByChapterAndType = useMemo(() => {
    const grouped = new Map<number, Map<number, IncrelutionAction[]>>();

    // Group actions
    actions.forEach(action => {
      if (!grouped.has(action.chapter)) {
        grouped.set(action.chapter, new Map());
      }
      const chapterMap = grouped.get(action.chapter)!;
      if (!chapterMap.has(action.type)) {
        chapterMap.set(action.type, []);
      }
      chapterMap.get(action.type)!.push(action);
    });

    return grouped;
  }, [actions]);

  // Compute which chapters have actions matching the search filter (for tab fading)
  const chaptersWithMatches = useMemo(() => {
    const normalizedFilter = searchFilter.toLowerCase().trim();
    if (!normalizedFilter) {
      return null;
    }

    const chaptersWithMatch = new Set<number>();
    actions.forEach(action => {
      // Only consider unlocked chapters
      if (!unlockedChaptersSet.has(action.chapter)) return;

      if (action.name.toLowerCase().includes(normalizedFilter)) {
        chaptersWithMatch.add(action.chapter);
      }
    });

    return chaptersWithMatch;
  }, [actions, searchFilter, unlockedChaptersSet]);

  // Compute which actions match the search filter and/or fav filter (for action filtering)
  const { matchingActionIds, chaptersToShow } = useMemo(() => {
    const normalizedFilter = searchFilter.toLowerCase().trim();
    const isFavView = activeChapter === 'fav';

    // If no filter and not fav view, no filtering needed
    if (!normalizedFilter && !isFavView) {
      return { matchingActionIds: null, chaptersToShow: null };
    }

    const matchingIds = new Set<number>();
    const chapters = new Set<number>();
    actions.forEach(action => {
      // Skip actions from locked chapters
      if (!unlockedChaptersSet.has(action.chapter)) return;

      const matchesSearch = !normalizedFilter || action.name.toLowerCase().includes(normalizedFilter);
      const matchesFav = !isFavView || favouriteActionsSet.has(action.id);

      if (matchesSearch && matchesFav) {
        matchingIds.add(action.id);
        chapters.add(action.chapter);
      }
    });

    return { matchingActionIds: matchingIds, chaptersToShow: chapters };
  }, [actions, searchFilter, activeChapter, favouriteActionsSet, unlockedChaptersSet]);

  const getAutomationLevel = useCallback((action: IncrelutionAction): AutomationLevel => {
    if (!loadout?.data) return null;
    const typeData = loadout.data[action.type];
    if (!typeData) return null;
    const level = typeData[action.originalId];
    return level !== undefined ? (level as AutomationLevel) : null;
  }, [loadout?.data]);

  const updateAutomationLevel = useCallback(async (action: IncrelutionAction, level: AutomationLevel) => {
    if (!loadout || !loadoutId) return;
    if (loadout.isProtected || isFolderReadOnly) return;

    pushUndo(loadout.data);

    const actionKey = `${action.type}:${action.originalId}`;

    // Abort any pending request for this action to prevent race conditions
    const pendingController = pendingUpdatesRef.current.get(actionKey);
    if (pendingController) {
      pendingController.abort();
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    pendingUpdatesRef.current.set(actionKey, controller);

    // Optimistic update
    setLoadout(prev => {
      if (!prev) return prev;

      const newData = { ...prev.data };

      // Ensure the action type exists
      if (!newData[action.type]) {
        newData[action.type] = {};
      } else {
        newData[action.type] = { ...newData[action.type] };
      }

      // Update or remove the automation level
      if (level === null) {
        delete newData[action.type][action.originalId];
      } else {
        newData[action.type][action.originalId] = level;
      }

      return {
        ...prev,
        data: newData,
        updatedAt: new Date().toISOString()
      };
    });

    // API call
    try {
      await api.updateActionAutomationLevel(loadoutId, action.type, action.originalId, level, controller.signal);
    } catch (err) {
      // Ignore aborted requests - they were superseded by a newer request
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('Error updating automation level:', err);
      // Revert on error by refetching
      const loadoutData = await api.getLoadout(loadoutId);
      setLoadout(loadoutData);
    } finally {
      // Clean up if this controller is still the current one
      if (pendingUpdatesRef.current.get(actionKey) === controller) {
        pendingUpdatesRef.current.delete(actionKey);
      }
    }
  }, [loadout, loadoutId]);

  const toggleActionLock = useCallback((action: IncrelutionAction) => {
    const currentLevel = getAutomationLevel(action);
    const actionKey = `${action.type}:${action.originalId}`;

    if (currentLevel === null) {
      // Unlocking: restore previous value, or fall back to default, or 0
      let restoreValue = previousValuesRef.current.get(actionKey);
      if (restoreValue === undefined) {
        // No history - check for a default skill priority
        const skillKey = makeSkillActionKey(action.skillId, action.type);
        restoreValue = settings.defaultSkillPriorities[skillKey] ?? 0;
      }
      previousValuesRef.current.delete(actionKey);
      updateAutomationLevel(action, restoreValue as AutomationLevel);
    } else {
      // Locking: save current value then set to null
      previousValuesRef.current.set(actionKey, currentLevel);
      updateAutomationLevel(action, null);
    }
  }, [getAutomationLevel, settings.defaultSkillPriorities, updateAutomationLevel]);

  // Get all actions for a given scope
  const getActionsForScope = useCallback((scope: number | 'all' | 'fav'): IncrelutionAction[] => {
    if (scope === 'fav') {
      return actions.filter(a => favouriteActionsSet.has(a.id) && unlockedChaptersSet.has(a.chapter));
    }
    if (scope === 'all') {
      return actions.filter(a => unlockedChaptersSet.has(a.chapter));
    }
    return actions.filter(a => a.chapter === scope && unlockedChaptersSet.has(a.chapter));
  }, [actions, favouriteActionsSet, unlockedChaptersSet]);

  // Bulk lock/unlock all actions in a scope
  const bulkToggleLock = useCallback(async (scope: number | 'all' | 'fav') => {
    if (!loadout || !loadoutId) return;
    if (loadout.isProtected || isFolderReadOnly) return;

    pushUndo(loadout.data);

    const scopeActions = getActionsForScope(scope);
    if (scopeActions.length === 0) return;

    // Check if any action is unlocked (non-null)
    const anyUnlocked = scopeActions.some(action => {
      const typeData = loadout.data[action.type];
      if (!typeData) return false;
      const level = typeData[action.originalId];
      return level !== undefined && level !== null;
    });

    // Build new data
    const newData: LoadoutData = {
      0: { ...loadout.data[0] },
      1: { ...loadout.data[1] },
      2: { ...loadout.data[2] }
    };

    for (const action of scopeActions) {
      const actionKey = `${action.type}:${action.originalId}`;

      if (anyUnlocked) {
        // Lock: save current value, remove from data
        const currentLevel = newData[action.type]?.[action.originalId];
        if (currentLevel !== undefined && currentLevel !== null) {
          previousValuesRef.current.set(actionKey, currentLevel);
        }
        delete newData[action.type][action.originalId];
      } else {
        // Unlock: restore previous or default
        let restoreValue = previousValuesRef.current.get(actionKey);
        if (restoreValue === undefined) {
          const skillKey = makeSkillActionKey(action.skillId, action.type);
          restoreValue = settings.defaultSkillPriorities[skillKey] ?? 0;
        }
        previousValuesRef.current.delete(actionKey);
        newData[action.type][action.originalId] = restoreValue;
      }
    }

    // Optimistic update
    const previousData = loadout.data;
    setLoadout(prev => prev ? { ...prev, data: newData } : prev);

    try {
      await api.importLoadout(loadoutId, newData);
      showToast(anyUnlocked ? `Locked ${scopeActions.length} actions` : `Unlocked ${scopeActions.length} actions`, 'success');
    } catch {
      showToast('Failed to update actions', 'error');
      setLoadout(prev => prev ? { ...prev, data: previousData } : prev);
    }
  }, [loadout, loadoutId, getActionsForScope, settings.defaultSkillPriorities, showToast]);

  const handleChapterClick = useCallback((e: React.MouseEvent, chapter: number | 'all' | 'fav') => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      bulkToggleLock(chapter);
    } else {
      setActiveChapter(chapter);
    }
  }, [bulkToggleLock]);

  const updateLoadoutName = async (name: string) => {
    if (!loadout || !loadoutId) return;

    const previousName = loadout.name;

    // Optimistic update locally
    setLoadout(prev => prev ? { ...prev, name, updatedAt: new Date().toISOString() } : prev);

    // Notify parent to update sidebar optimistically
    onNameChange?.(loadoutId, name);

    // API call
    try {
      await api.updateLoadoutName(loadoutId, name);
    } catch (err) {
      console.error('Error updating loadout name:', err);
      // Revert local state
      setLoadout(prev => prev ? { ...prev, name: previousName } : prev);
      // Revert sidebar
      onNameChange?.(loadoutId, previousName);
    }
  };

  const toggleProtection = async () => {
    if (!loadout || !loadoutId) return;

    const newProtection = !loadout.isProtected;

    // Optimistic update locally
    setLoadout(prev => prev ? { ...prev, isProtected: newProtection } : prev);

    // Notify parent to update sidebar optimistically
    onProtectionChange?.(loadoutId, newProtection);

    // API call
    try {
      await api.updateLoadoutProtection(loadoutId, newProtection);
    } catch (err) {
      console.error('Error updating loadout protection:', err);
      showToast('Failed to update protection', 'error');
      // Revert local state
      setLoadout(prev => prev ? { ...prev, isProtected: !newProtection } : prev);
      // Revert sidebar
      onProtectionChange?.(loadoutId, !newProtection);
    }
  };

  const handleImport = async (data: LoadoutData) => {
    if (!loadout || !loadoutId) return;

    pushUndo(loadout.data);

    try {
      const mergedData = mergeWithExisting(data, loadout.data);
      const dataWithDefaults = applyDefaultsToImport(mergedData);
      await api.importLoadout(loadoutId, dataWithDefaults);

      // Refresh loadout data
      const loadoutData = await api.getLoadout(loadoutId);
      setLoadout(loadoutData);

      showToast('Loadout imported successfully!', 'success');
    } catch (err) {
      console.error('Error importing loadout:', err);
      showToast('Failed to import loadout', 'error');
    }
  };

  const handleExportClipboard = useCallback(async () => {
    if (!loadoutId) return;

    try {
      const data = await api.exportLoadout(loadoutId);
      // Filter by unlocked chapters
      const filteredData = filterLoadoutByChapters(data, actions, unlockedChaptersSet);
      const jsonString = JSON.stringify(filteredData);

      await navigator.clipboard.writeText(jsonString);
      showToast('Loadout copied to clipboard!', 'success');
    } catch (err) {
      console.error('Error exporting to clipboard:', err);
      showToast('Failed to copy to clipboard', 'error');
    }
  }, [loadoutId, actions, unlockedChaptersSet, showToast]);

  useEffect(() => {
    const handleCopy = (e: KeyboardEvent) => {
      if (!loadoutId) return;
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      e.preventDefault();
      handleExportClipboard();
    };

    document.addEventListener('keydown', handleCopy);
    return () => document.removeEventListener('keydown', handleCopy);
  }, [loadoutId, handleExportClipboard]);

  // Ctrl+Z for undo, Ctrl+Y / Ctrl+Shift+Z for redo
  useEffect(() => {
    const handleUndoRedo = (e: KeyboardEvent) => {
      if (!loadoutId) return;
      if (!(e.ctrlKey || e.metaKey)) return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };

    document.addEventListener('keydown', handleUndoRedo);
    return () => document.removeEventListener('keydown', handleUndoRedo);
  }, [loadoutId, undo, redo]);

  if (!loadoutId) {
    return (
      <div className="loadout-editor-placeholder">
        <p>Select a loadout from the sidebar to begin editing</p>
        {onCreateLoadout && (
          <button className="placeholder-new-loadout-button" onClick={onCreateLoadout}>
            <i className="fas fa-plus" />
            New Loadout
          </button>
        )}
      </div>
    );
  }

  if (gameDataLoading || loadoutLoading) {
    return <div className="loading">Loading loadout editor...</div>;
  }

  if (gameDataError) {
    return <div className="error">Error: {gameDataError}</div>;
  }

  if (loadoutError) {
    return <div className="error">Error: {loadoutError}</div>;
  }

  if (!loadout) {
    return <div className="error">Loadout not found</div>;
  }

  const sortedChapters = Array.from(actionsByChapterAndType.keys())
    .sort((a, b) => a - b);
  const currentChapterData = typeof activeChapter === 'number' ? actionsByChapterAndType.get(activeChapter) : null;
  const isAllView = activeChapter === 'all';
  const isFavView = activeChapter === 'fav';

  return (
    <div className="loadout-editor">
      <LoadoutHeader
        ref={headerRef}
        loadout={loadout}
        folderBreadcrumb={folderBreadcrumb}
        isFolderReadOnly={isFolderReadOnly}
        onNameChange={updateLoadoutName}
        onImport={handleImport}
        onExportClipboard={handleExportClipboard}
        onToggleProtection={toggleProtection}
        onDuplicate={onDuplicate ?? (() => {})}
        onDelete={onDelete ?? (() => {})}
      />

      {/* Search Bar */}
      <div className="search-bar">
        <i className="fas fa-search search-icon" />
        <input
          ref={searchInputRef}
          type="text"
          className="search-input"
          placeholder="Filter actions..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        />
        {searchFilter && (
          <button
            className="search-clear"
            onClick={() => {
              setSearchFilter('');
              searchInputRef.current?.focus();
            }}
          >
            <i className="fas fa-times" />
          </button>
        )}
      </div>

      {/* Chapter Tabs */}
      <div className="chapter-tabs">
        <button
          className={`chapter-tab chapter-tab-all ${activeChapter === 'all' ? 'active' : ''} ${chaptersWithMatches && chaptersWithMatches.size === 0 ? 'faded' : ''}`}
          onClick={(e) => handleChapterClick(e, 'all')}
          title="All chapters (Ctrl+click to lock/unlock all)"
        >
          All
        </button>
        <button
          className={`chapter-tab chapter-tab-fav ${activeChapter === 'fav' ? 'active' : ''} ${favouriteActionsSet.size === 0 ? 'faded' : ''}`}
          onClick={(e) => handleChapterClick(e, 'fav')}
          title="Favourites (Ctrl+click to lock/unlock all)"
        >
          <i className="fas fa-star" />
        </button>
        {sortedChapters.map(chapterNumber => {
          const hasMatches = !chaptersWithMatches || chaptersWithMatches.has(chapterNumber);
          const isChapterLocked = !unlockedChaptersSet.has(chapterNumber);
          return (
            <button
              key={chapterNumber}
              className={`chapter-tab ${activeChapter === chapterNumber ? 'active' : ''} ${!hasMatches ? 'faded' : ''} ${isChapterLocked ? 'locked' : ''}`}
              onClick={(e) => isChapterLocked ? setActiveChapter(chapterNumber) : handleChapterClick(e, chapterNumber)}
              title={isChapterLocked ? `Chapter ${chapterNumber + 1} (locked)` : `Chapter ${chapterNumber + 1} (Ctrl+click to lock/unlock)`}
            >
              {chapterNumber + 1}
            </button>
          );
        })}
      </div>

      {/* Type headers */}
      <div className="type-headers">
        <h2 className="type-heading">Jobs</h2>
        <h2 className="type-heading">Construction</h2>
        <h2 className="type-heading">Exploration</h2>
      </div>

      {/* Empty Favourites State */}
      {isFavView && favouriteActionsSet.size === 0 && (
        <div className="empty-favourites-state">
          <p>You haven't added any favourite actions yet.</p>
          <p>
            Visit the{' '}
            <button className="link-button" onClick={() => navigate('/favourites')}>
              Favourites page
            </button>{' '}
            to mark actions for quick access.
          </p>
        </div>
      )}

      {/* All/Fav Chapters View */}
      {(isAllView || isFavView) && sortedChapters.map(chapterNumber => {
        const chapterData = actionsByChapterAndType.get(chapterNumber);
        if (!chapterData) return null;
        const isChapterLocked = !unlockedChaptersSet.has(chapterNumber);

        // Skip chapters with no matching actions when filtering or in fav view (but not locked chapters in all view)
        if (!isChapterLocked && chaptersToShow && !chaptersToShow.has(chapterNumber)) return null;
        // Skip locked chapters in fav view
        if (isChapterLocked && isFavView) return null;

        return (
          <div key={chapterNumber} className={`chapter-section ${isChapterLocked ? 'chapter-section-locked' : ''}`}>
            <div className="chapter-separator">
              <span className="chapter-separator-label">Chapter {chapterNumber + 1}</span>
            </div>
            <div className={`chapter-content ${isChapterLocked ? 'chapter-content-locked' : ''}`}>
              <ChapterGroup
                actions={chapterData.get(ActionType.Jobs) || []}
                skills={skills}
                getAutomationLevel={getAutomationLevel}
                onAutomationChange={updateAutomationLevel}
                onToggleLock={toggleActionLock}
                matchingActionIds={matchingActionIds}
                hideNonMatching={!isChapterLocked}
                disabled={isChapterLocked}
              />
              <ChapterGroup
                actions={chapterData.get(ActionType.Construction) || []}
                skills={skills}
                getAutomationLevel={getAutomationLevel}
                onAutomationChange={updateAutomationLevel}
                onToggleLock={toggleActionLock}
                matchingActionIds={matchingActionIds}
                hideNonMatching={!isChapterLocked}
                disabled={isChapterLocked}
              />
              <ChapterGroup
                actions={chapterData.get(ActionType.Exploration) || []}
                skills={skills}
                getAutomationLevel={getAutomationLevel}
                onAutomationChange={updateAutomationLevel}
                onToggleLock={toggleActionLock}
                matchingActionIds={matchingActionIds}
                hideNonMatching={!isChapterLocked}
                disabled={isChapterLocked}
              />
              {isChapterLocked && (
                <div className="frosted-glass-overlay" onClick={() => navigate('/settings#chapters')}>
                  <i className="fas fa-lock" />
                  <span>Unlock chapter in settings</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Single Chapter View */}
      {currentChapterData && (() => {
        const isChapterLocked = typeof activeChapter === 'number' && !unlockedChaptersSet.has(activeChapter);
        return (
          <div className={`chapter-content ${isChapterLocked ? 'chapter-content-locked' : ''}`}>
            <ChapterGroup
              actions={currentChapterData.get(ActionType.Jobs) || []}
              skills={skills}
              getAutomationLevel={getAutomationLevel}
              onAutomationChange={updateAutomationLevel}
              onToggleLock={toggleActionLock}
              matchingActionIds={matchingActionIds}
              hideNonMatching={false}
              disabled={isChapterLocked}
            />
            <ChapterGroup
              actions={currentChapterData.get(ActionType.Construction) || []}
              skills={skills}
              getAutomationLevel={getAutomationLevel}
              onAutomationChange={updateAutomationLevel}
              onToggleLock={toggleActionLock}
              matchingActionIds={matchingActionIds}
              hideNonMatching={false}
              disabled={isChapterLocked}
            />
            <ChapterGroup
              actions={currentChapterData.get(ActionType.Exploration) || []}
              skills={skills}
              getAutomationLevel={getAutomationLevel}
              onAutomationChange={updateAutomationLevel}
              onToggleLock={toggleActionLock}
              matchingActionIds={matchingActionIds}
              hideNonMatching={false}
              disabled={isChapterLocked}
            />
            {isChapterLocked && (
              <div className="frosted-glass-overlay" onClick={() => navigate('/settings#chapters')}>
                <i className="fas fa-lock" />
                <span>Unlock chapter in settings</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
});

export default LoadoutEditor;
