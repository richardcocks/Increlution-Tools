import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import type { SharedLoadout, IncrelutionAction, AutomationLevel } from '../types/models';
import { ActionType } from '../types/models';
import { useAuth } from '../contexts/AuthContext';
import { useSavedShares } from '../contexts/SavedSharesContext';
import { useGameData } from '../contexts/GameDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './Toast';
import ChapterGroup from './ChapterGroup';
import './SharedLoadoutView.css';

export function SharedLoadoutView() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const { saveShare, savedShares } = useSavedShares();
  const { showToast } = useToast();
  const { actions, skills, loading: gameDataLoading } = useGameData();
  const { unlockedChaptersSet, loading: settingsLoading } = useSettings();

  const [sharedLoadout, setSharedLoadout] = useState<SharedLoadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;

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
    if (!token) return;
    setSaving(true);
    try {
      await saveShare(token);
      showToast('Saved to your collection!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportClipboard = async () => {
    if (!sharedLoadout) return;
    try {
      // Copy full loadout data (not filtered) so users can import the complete loadout
      const jsonString = JSON.stringify(sharedLoadout.data);
      await navigator.clipboard.writeText(jsonString);
      showToast('Copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  };

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

  if (loading || gameDataLoading || settingsLoading) {
    return (
      <div className="shared-loadout-loading">
        <i className="fas fa-spinner fa-spin" />
        <p>Loading shared loadout...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-loadout-error">
        <i className="fas fa-exclamation-circle" />
        <h1>Unable to Load</h1>
        <p>{error}</p>
        <Link to="/">Go to Home</Link>
      </div>
    );
  }

  if (!sharedLoadout) {
    return (
      <div className="shared-loadout-error">
        <i className="fas fa-question-circle" />
        <h1>Not Found</h1>
        <p>This share link doesn't exist or has been removed.</p>
        <Link to="/">Go to Home</Link>
      </div>
    );
  }

  const sortedChapters = Array.from(actionsByChapterAndType.keys())
    .filter(ch => unlockedChaptersSet.has(ch))
    .sort((a, b) => a - b);

  return (
    <div className="shared-loadout-view">
      <div className="shared-loadout-header">
        <div className="shared-loadout-header-content">
          <div className="shared-loadout-title">
            <h1>{sharedLoadout.name}</h1>
            <span className="shared-badge">Shared Loadout</span>
          </div>
          <div className="shared-loadout-meta">
            {sharedLoadout.ownerName && (
              <span className="shared-loadout-owner">
                <i className="fas fa-user" />
                Shared by {sharedLoadout.ownerName}
              </span>
            )}
            <span>
              <i className="fas fa-clock" />
              {' '}Updated {new Date(sharedLoadout.updatedAt).toLocaleDateString()}
            </span>
          </div>
          <div className="shared-loadout-actions">
            <button
              className={`shared-action-button ${user ? 'secondary' : 'primary copy-prominent'}`}
              onClick={handleExportClipboard}
            >
              <i className="fas fa-copy" />
              Copy to Clipboard
            </button>
            {user && (
              <button
                className="shared-action-button secondary"
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
            )}
          </div>
        </div>
      </div>

      <div className="shared-loadout-body">
        <div className="shared-loadout-content">
          <div className="read-only-notice">
            <i className="fas fa-eye" />
            This is a read-only view. Copy the data to your clipboard to import into your own loadout.
          </div>

          {!user && (
            <div className="login-prompt">
              <i className="fas fa-info-circle" />
              <span className="login-prompt-text">
                Log in to save this loadout to your collection and view more chapters.
              </span>
              <Link to="/login" className="login-prompt-button">
                Log In
              </Link>
            </div>
          )}

          {/* Type headers */}
          <div className="shared-type-headers">
            <h2>Jobs</h2>
            <h2>Construction</h2>
            <h2>Exploration</h2>
          </div>

          {/* All Chapters */}
          {sortedChapters.map(chapterNumber => {
            const chapterData = actionsByChapterAndType.get(chapterNumber);
            if (!chapterData) return null;

            return (
              <div key={chapterNumber} className="shared-chapter-section">
                <div className="shared-chapter-separator">
                  <span className="shared-chapter-separator-label">Chapter {chapterNumber + 1}</span>
                </div>
                <div className="shared-chapter-content">
                  <ChapterGroup
                    actions={chapterData.get(ActionType.Jobs) || []}
                    skills={skills}
                    getAutomationLevel={getAutomationLevel}
                    onAutomationChange={noopChange}
                    onToggleLock={noopToggle}
                    matchingActionIds={null}
                    hideNonMatching={false}
                  />
                  <ChapterGroup
                    actions={chapterData.get(ActionType.Construction) || []}
                    skills={skills}
                    getAutomationLevel={getAutomationLevel}
                    onAutomationChange={noopChange}
                    onToggleLock={noopToggle}
                    matchingActionIds={null}
                    hideNonMatching={false}
                  />
                  <ChapterGroup
                    actions={chapterData.get(ActionType.Exploration) || []}
                    skills={skills}
                    getAutomationLevel={getAutomationLevel}
                    onAutomationChange={noopChange}
                    onToggleLock={noopToggle}
                    matchingActionIds={null}
                    hideNonMatching={false}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
