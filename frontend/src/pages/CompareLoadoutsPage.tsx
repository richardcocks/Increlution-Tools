import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApi } from '../contexts/ApiContext';
import { useGameData } from '../contexts/GameDataContext';
import { useSettings } from '../contexts/SettingsContext';
import type { Loadout, IncrelutionAction, AutomationLevel } from '../types/models';
import { ActionType } from '../types/models';
import { findDifferingActions, getAutomationLevel, COMPARE_COLORS } from '../utils/compareLoadouts';
import CompareActionRow from '../components/CompareActionRow';
import './CompareLoadoutsPage.css';

interface CompareLoadoutsPageProps {
  onClose: () => void;
}

export function CompareLoadoutsPage({ onClose }: CompareLoadoutsPageProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { api, isGuest } = useApi();
  const { actions, skills, loading: gameDataLoading } = useGameData();
  const { unlockedChaptersSet } = useSettings();

  const [leftLoadout, setLeftLoadout] = useState<Loadout | null>(null);
  const [rightLoadout, setRightLoadout] = useState<Loadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeChapter, setActiveChapter] = useState<number | 'all'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Parse IDs from URL
  const ids = useMemo(() => {
    const idsParam = searchParams.get('ids');
    if (!idsParam) return null;
    const parsed = idsParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (parsed.length !== 2) return null;
    return { left: parsed[0], right: parsed[1] };
  }, [searchParams]);

  // Fetch both loadouts
  useEffect(() => {
    if (!ids) {
      setError('Invalid comparison URL. Please select two loadouts to compare.');
      setLoading(false);
      return;
    }

    const fetchLoadouts = async () => {
      setLoading(true);
      setError(null);
      try {
        const [left, right] = await Promise.all([
          api.getLoadout(ids.left),
          api.getLoadout(ids.right)
        ]);
        setLeftLoadout(left);
        setRightLoadout(right);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load loadouts');
      } finally {
        setLoading(false);
      }
    };

    fetchLoadouts();
  }, [ids, api]);

  // Find differing actions
  const differingActionIds = useMemo(() => {
    if (!leftLoadout || !rightLoadout) return new Set<number>();
    return findDifferingActions(leftLoadout, rightLoadout, actions);
  }, [leftLoadout, rightLoadout, actions]);

  // Group actions by chapter, then by type
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

  // Filter by search
  const matchingActionIds = useMemo(() => {
    const normalizedFilter = searchFilter.toLowerCase().trim();
    if (!normalizedFilter) return null;

    const matchingIds = new Set<number>();
    actions.forEach(action => {
      if (action.name.toLowerCase().includes(normalizedFilter)) {
        matchingIds.add(action.id);
      }
    });
    return matchingIds;
  }, [actions, searchFilter]);

  // Get automation levels
  const getLeftLevel = useCallback((action: IncrelutionAction): AutomationLevel => {
    if (!leftLoadout) return null;
    return getAutomationLevel(leftLoadout, action);
  }, [leftLoadout]);

  const getRightLevel = useCallback((action: IncrelutionAction): AutomationLevel => {
    if (!rightLoadout) return null;
    return getAutomationLevel(rightLoadout, action);
  }, [rightLoadout]);

  // Navigation to edit
  const handleEditLoadout = (loadoutId: number) => {
    const prefix = isGuest ? '/guest' : '/loadouts';
    navigate(`${prefix}/loadout/${loadoutId}`);
  };

  // Get unique chapters from actions
  const chapters = useMemo(() => {
    const chapterSet = new Set<number>();
    actions.forEach(action => chapterSet.add(action.chapter));
    return Array.from(chapterSet).sort((a, b) => a - b);
  }, [actions]);

  // Filter chapters based on active selection
  const visibleChapters = useMemo(() => {
    if (activeChapter === 'all') return chapters;
    return chapters.filter(c => c === activeChapter);
  }, [chapters, activeChapter]);

  // Count differences per chapter
  const differencesPerChapter = useMemo(() => {
    const counts = new Map<number, number>();
    actions.forEach(action => {
      if (differingActionIds.has(action.id)) {
        counts.set(action.chapter, (counts.get(action.chapter) || 0) + 1);
      }
    });
    return counts;
  }, [actions, differingActionIds]);

  if (loading || gameDataLoading) {
    return (
      <div className="compare-loading">
        <i className="fas fa-spinner fa-spin" />
        <p>Loading comparison...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="compare-error">
        <i className="fas fa-exclamation-circle" />
        <h2>Unable to Compare</h2>
        <p>{error}</p>
        <button className="compare-back-button" onClick={onClose}>
          <i className="fas fa-arrow-left" />
          Go Back
        </button>
      </div>
    );
  }

  if (!leftLoadout || !rightLoadout) {
    return (
      <div className="compare-error">
        <i className="fas fa-question-circle" />
        <h2>Loadouts Not Found</h2>
        <p>One or both loadouts could not be found.</p>
        <button className="compare-back-button" onClick={onClose}>
          <i className="fas fa-arrow-left" />
          Go Back
        </button>
      </div>
    );
  }

  const totalDifferences = differingActionIds.size;

  return (
    <div className="compare-loadouts-page">
      <div className="compare-header">
        <div className="compare-title-row">
          <button className="compare-back-button" onClick={onClose}>
            <i className="fas fa-arrow-left" />
          </button>
          <h1>Compare Loadouts</h1>
        </div>

        <div className="compare-legend">
          <div className="compare-legend-item">
            <div className="compare-legend-color" style={{ backgroundColor: COMPARE_COLORS.left }} />
            <span className="compare-legend-name">{leftLoadout.name}</span>
            <button
              className="compare-edit-link"
              onClick={() => handleEditLoadout(leftLoadout.id)}
              title="Edit this loadout"
            >
              <i className="fas fa-pencil-alt" />
            </button>
          </div>
          <span className="compare-legend-vs">vs</span>
          <div className="compare-legend-item">
            <div className="compare-legend-color" style={{ backgroundColor: COMPARE_COLORS.right }} />
            <span className="compare-legend-name">{rightLoadout.name}</span>
            <button
              className="compare-edit-link"
              onClick={() => handleEditLoadout(rightLoadout.id)}
              title="Edit this loadout"
            >
              <i className="fas fa-pencil-alt" />
            </button>
          </div>
        </div>

        <div className="compare-stats">
          {totalDifferences === 0 ? (
            <span className="compare-stats-identical">
              <i className="fas fa-check-circle" />
              These loadouts are identical
            </span>
          ) : (
            <span className="compare-stats-count">
              <i className="fas fa-exchange-alt" />
              {totalDifferences} difference{totalDifferences !== 1 ? 's' : ''} found
            </span>
          )}
        </div>
      </div>

      <div className="compare-controls">
        <div className="compare-search-bar">
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

        <label className="compare-show-all-toggle">
          <input
            type="checkbox"
            checked={showAllActions}
            onChange={(e) => setShowAllActions(e.target.checked)}
          />
          <span>Show all actions</span>
        </label>
      </div>

      <div className="compare-chapter-tabs">
        <button
          className={`compare-chapter-tab ${activeChapter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveChapter('all')}
        >
          All
          {totalDifferences > 0 && (
            <span className="compare-tab-badge">{totalDifferences}</span>
          )}
        </button>
        {chapters.filter(ch => unlockedChaptersSet.has(ch)).map(chapter => {
          const diffCount = differencesPerChapter.get(chapter) || 0;
          return (
            <button
              key={chapter}
              className={`compare-chapter-tab ${activeChapter === chapter ? 'active' : ''}`}
              onClick={() => setActiveChapter(chapter)}
            >
              Ch. {chapter + 1}
              {diffCount > 0 && (
                <span className="compare-tab-badge">{diffCount}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="compare-content">
        {/* Type headers */}
        <div className="compare-type-headers">
          <div className="compare-type-heading">Jobs</div>
          <div className="compare-type-heading">Construction</div>
          <div className="compare-type-heading">Exploration</div>
        </div>

        {visibleChapters.map(chapterNumber => {
          const chapterData = actionsByChapterAndType.get(chapterNumber);
          if (!chapterData) return null;
          const isChapterLocked = !unlockedChaptersSet.has(chapterNumber);
          if (isChapterLocked) return null;

          return (
            <div key={chapterNumber} className="compare-chapter-section">
              {activeChapter === 'all' && (
                <div className="compare-chapter-separator">
                  <span className="compare-chapter-separator-label">Chapter {chapterNumber + 1}</span>
                </div>
              )}
              <div className="compare-chapter-content">
                <CompareChapterGroup
                  actions={chapterData.get(ActionType.Jobs) || []}
                  skills={skills}
                  leftLoadout={leftLoadout}
                  rightLoadout={rightLoadout}
                  getLeftLevel={getLeftLevel}
                  getRightLevel={getRightLevel}
                  differingActionIds={differingActionIds}
                  matchingActionIds={matchingActionIds}
                  showAllActions={showAllActions}
                />
                <CompareChapterGroup
                  actions={chapterData.get(ActionType.Construction) || []}
                  skills={skills}
                  leftLoadout={leftLoadout}
                  rightLoadout={rightLoadout}
                  getLeftLevel={getLeftLevel}
                  getRightLevel={getRightLevel}
                  differingActionIds={differingActionIds}
                  matchingActionIds={matchingActionIds}
                  showAllActions={showAllActions}
                />
                <CompareChapterGroup
                  actions={chapterData.get(ActionType.Exploration) || []}
                  skills={skills}
                  leftLoadout={leftLoadout}
                  rightLoadout={rightLoadout}
                  getLeftLevel={getLeftLevel}
                  getRightLevel={getRightLevel}
                  differingActionIds={differingActionIds}
                  matchingActionIds={matchingActionIds}
                  showAllActions={showAllActions}
                />
              </div>
            </div>
          );
        })}

        {totalDifferences === 0 && !showAllActions && (
          <div className="compare-no-differences">
            <i className="fas fa-equals" />
            <p>No differences found between these loadouts.</p>
            <button
              className="compare-show-all-button"
              onClick={() => setShowAllActions(true)}
            >
              Show all actions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface CompareChapterGroupProps {
  actions: IncrelutionAction[];
  skills: Record<number, import('../types/models').Skill>;
  leftLoadout: Loadout;
  rightLoadout: Loadout;
  getLeftLevel: (action: IncrelutionAction) => AutomationLevel;
  getRightLevel: (action: IncrelutionAction) => AutomationLevel;
  differingActionIds: Set<number>;
  matchingActionIds: Set<number> | null;
  showAllActions: boolean;
}

function CompareChapterGroup({
  actions,
  skills,
  leftLoadout,
  rightLoadout,
  getLeftLevel,
  getRightLevel,
  differingActionIds,
  matchingActionIds,
  showAllActions
}: CompareChapterGroupProps) {
  return (
    <div className="compare-chapter-group">
      <div className="compare-actions-list">
        {actions.map(action => {
          const isDifferent = differingActionIds.has(action.id);
          const isSearchMatch = matchingActionIds === null || matchingActionIds.has(action.id);

          // Hide if not showing all and not different
          if (!showAllActions && !isDifferent) return null;

          // Hide if doesn't match search
          if (matchingActionIds !== null && !isSearchMatch) return null;

          return (
            <CompareActionRow
              key={action.id}
              action={action}
              skill={skills[action.skillId]}
              leftLoadout={{ name: leftLoadout.name, level: getLeftLevel(action) }}
              rightLoadout={{ name: rightLoadout.name, level: getRightLevel(action) }}
              isFaded={!isDifferent}
            />
          );
        })}
      </div>
    </div>
  );
}
