import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { SharedLoadout, IncrelutionAction, AutomationLevel } from '../types/models';
import { ActionType } from '../types/models';
import { normalizeLoadoutData } from '../utils/loadoutData';
import { useSavedShares } from '../contexts/SavedSharesContext';
import { useGameData } from '../contexts/GameDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './Toast';
import ChapterGroup from './ChapterGroup';
import './EmbeddedSharedLoadout.css';

interface EmbeddedSharedLoadoutProps {
  token: string;
  onClose: () => void;
}

export function EmbeddedSharedLoadout({ token, onClose }: EmbeddedSharedLoadoutProps) {
  const { saveLoadoutShare, savedShares } = useSavedShares();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { actions, skills, loading: gameDataLoading } = useGameData();
  const { unlockedChaptersSet } = useSettings();

  const [sharedLoadout, setSharedLoadout] = useState<SharedLoadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchSharedLoadout = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getSharedLoadout(token);
        setSharedLoadout(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared loadout');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedLoadout();
  }, [token]);

  const isSaved = useMemo(() => {
    return savedShares.some(s => s.shareToken === token);
  }, [savedShares, token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveLoadoutShare(token);
      showToast('Saved to your collection!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportClipboard = useCallback(async () => {
    if (!sharedLoadout) return;
    try {
      // Copy full loadout data (not filtered) so users can import the complete loadout
      const jsonString = JSON.stringify(normalizeLoadoutData(sharedLoadout.data));
      await navigator.clipboard.writeText(jsonString);
      showToast('Copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  }, [sharedLoadout, showToast]);

  useEffect(() => {
    const handleCopy = (e: KeyboardEvent) => {
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
  }, [handleExportClipboard]);

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

  const getAutomationLevel = useCallback((action: IncrelutionAction): AutomationLevel => {
    if (!sharedLoadout?.data) return null;
    const typeData = sharedLoadout.data[action.type];
    if (!typeData) return null;
    const level = typeData[action.originalId];
    return level !== undefined ? (level as AutomationLevel) : null;
  }, [sharedLoadout?.data]);

  // No-op handlers for read-only view
  const noopChange = useCallback(() => {}, []);
  const noopToggle = useCallback(() => {}, []);

  if (loading || gameDataLoading) {
    return (
      <div className="embedded-shared-loading">
        <i className="fas fa-spinner fa-spin" />
        <p>Loading shared loadout...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="embedded-shared-error">
        <i className="fas fa-exclamation-circle" />
        <h2>Unable to Load</h2>
        <p>{error}</p>
        <button className="embedded-shared-back" onClick={onClose}>
          <i className="fas fa-arrow-left" />
          Go Back
        </button>
      </div>
    );
  }

  if (!sharedLoadout) {
    return (
      <div className="embedded-shared-error">
        <i className="fas fa-question-circle" />
        <h2>Not Found</h2>
        <p>This share link doesn't exist or has been removed.</p>
        <button className="embedded-shared-back" onClick={onClose}>
          <i className="fas fa-arrow-left" />
          Go Back
        </button>
      </div>
    );
  }

  const sortedChapters = Array.from(actionsByChapterAndType.keys())
    .sort((a, b) => a - b);

  return (
    <div className="embedded-shared-loadout">
      <div className="embedded-shared-header">
        <div className="embedded-shared-title-row">
          <button className="embedded-shared-back" onClick={onClose}>
            <i className="fas fa-arrow-left" />
          </button>
          <div className="embedded-shared-title">
            <h1>{sharedLoadout.name}</h1>
            <span className="embedded-shared-badge">Shared Loadout</span>
          </div>
        </div>
        <div className="embedded-shared-meta">
          {sharedLoadout.ownerName && (
            <span className="embedded-shared-owner">
              <i className="fas fa-user" />
              Shared by {sharedLoadout.ownerName}
            </span>
          )}
          <span>
            <i className="fas fa-clock" />
            Updated {new Date(sharedLoadout.updatedAt).toLocaleDateString()}
          </span>
        </div>
        <div className="embedded-shared-actions">
          <button
            className="embedded-action-button primary"
            onClick={handleSave}
            disabled={saving || isSaved}
          >
            {saving ? (
              <>
                <i className="fas fa-spinner fa-spin" />
                Saving...
              </>
            ) : isSaved ? (
              <>
                <i className="fas fa-check" />
                Saved
              </>
            ) : (
              <>
                <i className="fas fa-bookmark" />
                Save to Collection
              </>
            )}
          </button>
          <button
            className="embedded-action-button secondary"
            onClick={handleExportClipboard}
            title="Copy loadout data to paste into Increlution"
          >
            <i className="fas fa-copy" />
            Copy for Game
          </button>
        </div>
      </div>

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

        {/* Type headers */}
        <div className="type-headers">
          <h2 className="type-heading">Jobs</h2>
          <h2 className="type-heading">Construction</h2>
          <h2 className="type-heading">Exploration</h2>
        </div>

        {/* All Chapters */}
        {sortedChapters.map(chapterNumber => {
          const chapterData = actionsByChapterAndType.get(chapterNumber);
          if (!chapterData) return null;
          const isChapterLocked = !unlockedChaptersSet.has(chapterNumber);

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
                  <div className="frosted-glass-overlay" onClick={() => navigate('/settings#chapters')}>
                    <i className="fas fa-lock" />
                    <span>Unlock chapter in settings</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
