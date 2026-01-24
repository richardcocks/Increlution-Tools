import { useMemo, useState, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useGameData } from '../contexts/GameDataContext';
import type { IncrelutionAction } from '../types/models';
import { ActionType } from '../types/models';
import './FavouritesPage.css';

export function FavouritesPage({ onClose }: { onClose: () => void }) {
  const { favouriteActionsSet, toggleFavourite, unlockedChaptersSet, loading: settingsLoading } = useSettings();
  const { actions, skills, loading: gameDataLoading } = useGameData();
  const [searchFilter, setSearchFilter] = useState('');
  const [activeChapter, setActiveChapter] = useState<number | 'all' | 'fav'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const sortedChapters = Array.from(actionsByChapterAndType.keys())
    .filter(ch => unlockedChaptersSet.has(ch))
    .sort((a, b) => a - b);

  if (gameDataLoading || settingsLoading) {
    return (
      <div className="favourites-page">
        <div className="favourites-header">
          <div className="favourites-header-content">
            <button className="back-button" onClick={onClose}>
              <i className="fas fa-arrow-left" />
              Back
            </button>
            <h2>Favourite Actions</h2>
          </div>
        </div>
        <div className="favourites-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="favourites-page">
      <div className="favourites-header">
        <div className="favourites-header-content">
          <button className="back-button" onClick={onClose}>
            <i className="fas fa-arrow-left" />
            Back
          </button>
          <h2>Favourite Actions</h2>
          <span className="favourites-count">{favouriteActionsSet.size} selected</span>
        </div>
      </div>

      <div className="favourites-content">
        <p className="favourites-description">
          Click a row to toggle it as a favourite. Favourites appear in the Fav tab of the loadout editor.
        </p>

        {/* Search Bar */}
        <div className="favourites-search-bar">
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
            onClick={() => setActiveChapter('all')}
          >
            All
          </button>
          <button
            className={`chapter-tab chapter-tab-fav ${activeChapter === 'fav' ? 'active' : ''} ${favouriteActionsSet.size === 0 ? 'faded' : ''}`}
            onClick={() => setActiveChapter('fav')}
          >
            <i className="fas fa-star" />
          </button>
          {sortedChapters.map(chapterNumber => {
            const hasMatches = !chaptersWithMatches || chaptersWithMatches.has(chapterNumber);
            return (
              <button
                key={chapterNumber}
                className={`chapter-tab ${activeChapter === chapterNumber ? 'active' : ''} ${!hasMatches ? 'faded' : ''}`}
                onClick={() => setActiveChapter(chapterNumber)}
              >
                {chapterNumber + 1}
              </button>
            );
          })}
        </div>

        {/* Type Headers */}
        <div className="type-headers">
          <h3 className="type-heading">Jobs</h3>
          <h3 className="type-heading">Construction</h3>
          <h3 className="type-heading">Exploration</h3>
        </div>

        {/* All/Fav Chapters View */}
        {(activeChapter === 'all' || activeChapter === 'fav') && sortedChapters.map(chapterNumber => {
          const chapterData = actionsByChapterAndType.get(chapterNumber);
          if (!chapterData) return null;

          // Skip chapters with no matching actions when filtering or in fav view
          if (chaptersToShow && !chaptersToShow.has(chapterNumber)) return null;

          return (
            <div key={chapterNumber} className="chapter-section">
              <div className="chapter-separator">
                <span className="chapter-separator-label">Chapter {chapterNumber + 1}</span>
              </div>
              <div className="chapter-content">
                <ActionColumn
                  actions={chapterData.get(ActionType.Jobs) || []}
                  skills={skills}
                  favouriteActionsSet={favouriteActionsSet}
                  onToggleFavourite={toggleFavourite}
                  matchingActionIds={matchingActionIds}
                />
                <ActionColumn
                  actions={chapterData.get(ActionType.Construction) || []}
                  skills={skills}
                  favouriteActionsSet={favouriteActionsSet}
                  onToggleFavourite={toggleFavourite}
                  matchingActionIds={matchingActionIds}
                />
                <ActionColumn
                  actions={chapterData.get(ActionType.Exploration) || []}
                  skills={skills}
                  favouriteActionsSet={favouriteActionsSet}
                  onToggleFavourite={toggleFavourite}
                  matchingActionIds={matchingActionIds}
                />
              </div>
            </div>
          );
        })}

        {/* Single Chapter View */}
        {typeof activeChapter === 'number' && (() => {
          const chapterData = actionsByChapterAndType.get(activeChapter);
          if (!chapterData) return null;

          return (
            <div className="chapter-content">
              <ActionColumn
                actions={chapterData.get(ActionType.Jobs) || []}
                skills={skills}
                favouriteActionsSet={favouriteActionsSet}
                onToggleFavourite={toggleFavourite}
                matchingActionIds={matchingActionIds}
              />
              <ActionColumn
                actions={chapterData.get(ActionType.Construction) || []}
                skills={skills}
                favouriteActionsSet={favouriteActionsSet}
                onToggleFavourite={toggleFavourite}
                matchingActionIds={matchingActionIds}
              />
              <ActionColumn
                actions={chapterData.get(ActionType.Exploration) || []}
                skills={skills}
                favouriteActionsSet={favouriteActionsSet}
                onToggleFavourite={toggleFavourite}
                matchingActionIds={matchingActionIds}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}

interface ActionColumnProps {
  actions: IncrelutionAction[];
  skills: Record<number, { id: number; name: string; icon: string }>;
  favouriteActionsSet: Set<number>;
  onToggleFavourite: (actionId: number) => Promise<void>;
  matchingActionIds: Set<number> | null;
}

function ActionColumn({ actions, skills, favouriteActionsSet, onToggleFavourite, matchingActionIds }: ActionColumnProps) {
  const filteredActions = matchingActionIds
    ? actions.filter(action => matchingActionIds.has(action.id))
    : actions;

  return (
    <div className="action-column">
      {filteredActions.map(action => {
        const skill = skills[action.skillId];
        const isFavourite = favouriteActionsSet.has(action.id);

        return (
          <div
            key={action.id}
            className={`fav-action-row ${isFavourite ? 'fav-action-row-active' : ''}`}
            onClick={() => onToggleFavourite(action.id)}
            title={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
          >
            <div className="fav-action-info">
              <i className={`fas ${skill?.icon || 'fa-question'}`} />
              <span className="fav-action-name">{action.name}</span>
            </div>
            <span className={`fav-star-icon ${isFavourite ? 'fav-star-active' : ''}`}>
              <i className={isFavourite ? 'fas fa-star' : 'far fa-star'} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
