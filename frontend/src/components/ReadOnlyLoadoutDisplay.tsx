import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../contexts/ApiContext';
import type { IncrelutionAction, AutomationLevel, LoadoutData } from '../types/models';
import { ActionType } from '../types/models';
import { useGameData } from '../contexts/GameDataContext';
import { useSettings } from '../contexts/SettingsContext';
import ChapterGroup from './ChapterGroup';

interface ReadOnlyLoadoutDisplayProps {
  loadoutData: LoadoutData;
  onExportClipboard: () => void;
  unlockedChaptersOverride?: Set<number>;
}

export function ReadOnlyLoadoutDisplay({ loadoutData, onExportClipboard, unlockedChaptersOverride }: ReadOnlyLoadoutDisplayProps) {
  const { isGuest } = useApi();
  const navigate = useNavigate();
  const { actions, skills } = useGameData();
  const { unlockedChaptersSet: settingsUnlockedChapters } = useSettings();
  const unlockedChaptersSet = unlockedChaptersOverride ?? settingsUnlockedChapters;

  const [searchFilter, setSearchFilter] = useState('');
  const [showConfiguredOnly, setShowConfiguredOnly] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleCopy = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      e.preventDefault();
      onExportClipboard();
    };

    document.addEventListener('keydown', handleCopy);
    return () => document.removeEventListener('keydown', handleCopy);
  }, [onExportClipboard]);

  const actionsByChapterAndType = useMemo(() => {
    const grouped = new Map<number, Map<number, IncrelutionAction[]>>();

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

  const getAutomationLevel = useCallback((action: IncrelutionAction): AutomationLevel => {
    const typeData = loadoutData[action.type];
    if (!typeData) return null;
    const level = typeData[action.originalId];
    return level !== undefined ? (level as AutomationLevel) : null;
  }, [loadoutData]);

  const { matchingActionIds, chaptersToShow } = useMemo(() => {
    const normalizedFilter = searchFilter.toLowerCase().trim();

    if (!normalizedFilter && !showConfiguredOnly) {
      return { matchingActionIds: null, chaptersToShow: null };
    }

    const matchingIds = new Set<number>();
    const chapters = new Set<number>();
    actions.forEach(action => {
      const matchesSearch = !normalizedFilter || action.name.toLowerCase().includes(normalizedFilter);
      const matchesConfigured = !showConfiguredOnly || getAutomationLevel(action) !== null;

      if (matchesSearch && matchesConfigured) {
        matchingIds.add(action.id);
        chapters.add(action.chapter);
      }
    });
    return { matchingActionIds: matchingIds, chaptersToShow: chapters };
  }, [actions, searchFilter, showConfiguredOnly, getAutomationLevel]);

  const noopChange = useCallback(() => {}, []);
  const noopToggle = useCallback(() => {}, []);

  const sortedChapters = Array.from(actionsByChapterAndType.keys())
    .sort((a, b) => a - b);

  return (
    <div className="embedded-shared-content">
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
      <button
        className={`configured-only-toggle ${showConfiguredOnly ? 'configured-only-toggle-active' : ''}`}
        onClick={() => setShowConfiguredOnly(prev => !prev)}
      >
        <i className="fas fa-eye" />
        <span>{showConfiguredOnly ? 'Showing configured only' : 'Show configured only'}</span>
      </button>

      <div className="type-headers">
        <h2 className="type-heading">Jobs</h2>
        <h2 className="type-heading">Construction</h2>
        <h2 className="type-heading">Exploration</h2>
      </div>

      {sortedChapters.map(chapterNumber => {
        const chapterData = actionsByChapterAndType.get(chapterNumber);
        if (!chapterData) return null;
        const isChapterLocked = !unlockedChaptersSet.has(chapterNumber);

        if (!isChapterLocked && chaptersToShow && !chaptersToShow.has(chapterNumber)) return null;

        return (
          <div key={chapterNumber} className={`chapter-section ${isChapterLocked ? 'chapter-section-locked' : ''}`}>
            <div className="chapter-separator">
              <span className="chapter-separator-label">Chapter {chapterNumber + 1}</span>
            </div>
            <div className={`chapter-content embedded-readonly ${isChapterLocked ? 'chapter-content-locked' : ''}`}>
              <ChapterGroup
                actions={chapterData.get(ActionType.Jobs) || []}
                skills={skills}
                getAutomationLevel={getAutomationLevel}
                onAutomationChange={noopChange}
                onToggleLock={noopToggle}
                matchingActionIds={matchingActionIds}
                hideNonMatching={!isChapterLocked && !!matchingActionIds}
                disabled={isChapterLocked}
              />
              <ChapterGroup
                actions={chapterData.get(ActionType.Construction) || []}
                skills={skills}
                getAutomationLevel={getAutomationLevel}
                onAutomationChange={noopChange}
                onToggleLock={noopToggle}
                matchingActionIds={matchingActionIds}
                hideNonMatching={!isChapterLocked && !!matchingActionIds}
                disabled={isChapterLocked}
              />
              <ChapterGroup
                actions={chapterData.get(ActionType.Exploration) || []}
                skills={skills}
                getAutomationLevel={getAutomationLevel}
                onAutomationChange={noopChange}
                onToggleLock={noopToggle}
                matchingActionIds={matchingActionIds}
                hideNonMatching={!isChapterLocked && !!matchingActionIds}
                disabled={isChapterLocked}
              />
              {isChapterLocked && (
                <div className="frosted-glass-overlay" onClick={() => navigate(isGuest ? '/guest/settings#chapters' : '/settings#chapters')}>
                  <i className="fas fa-lock" />
                  <span>Unlock chapter in settings</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {showConfiguredOnly && chaptersToShow && chaptersToShow.size === 0 && (
        <div className="empty-filter-state">
          <p>No configured actions found{searchFilter ? ' matching your search' : ''}.</p>
        </div>
      )}
    </div>
  );
}
