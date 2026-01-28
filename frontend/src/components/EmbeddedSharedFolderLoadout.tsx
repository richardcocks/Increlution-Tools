import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../services/api';
import type { SharedFolderLoadout, IncrelutionAction, AutomationLevel } from '../types/models';
import { ActionType } from '../types/models';
import { normalizeLoadoutData } from '../utils/loadoutData';
import { useGameData } from '../contexts/GameDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './Toast';
import ChapterGroup from './ChapterGroup';
import './EmbeddedSharedLoadout.css';

interface EmbeddedSharedFolderLoadoutProps {
  folderToken: string;
  loadoutId: number;
  onClose: () => void;
}

export function EmbeddedSharedFolderLoadout({ folderToken, loadoutId, onClose }: EmbeddedSharedFolderLoadoutProps) {
  const { showToast } = useToast();
  const { actions, skills, loading: gameDataLoading } = useGameData();
  const { unlockedChaptersSet } = useSettings();

  const [loadout, setLoadout] = useState<SharedFolderLoadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLoadout = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getSharedFolderLoadout(folderToken, loadoutId);
        setLoadout(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared loadout');
      } finally {
        setLoading(false);
      }
    };

    fetchLoadout();
  }, [folderToken, loadoutId]);

  const handleExportClipboard = async () => {
    if (!loadout) return;
    try {
      const jsonString = JSON.stringify(normalizeLoadoutData(loadout.data));
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
    if (!loadout?.data) return null;
    const typeData = loadout.data[action.type];
    if (!typeData) return null;
    const level = typeData[action.originalId];
    return level !== undefined ? (level as AutomationLevel) : null;
  }, [loadout?.data]);

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

  if (!loadout) {
    return (
      <div className="embedded-shared-error">
        <i className="fas fa-question-circle" />
        <h2>Not Found</h2>
        <p>This loadout doesn't exist or has been removed.</p>
        <button className="embedded-shared-back" onClick={onClose}>
          <i className="fas fa-arrow-left" />
          Go Back
        </button>
      </div>
    );
  }

  const sortedChapters = Array.from(actionsByChapterAndType.keys())
    .filter(ch => unlockedChaptersSet.has(ch))
    .sort((a, b) => a - b);

  return (
    <div className="embedded-shared-loadout">
      <div className="embedded-shared-header">
        <div className="embedded-shared-title-row">
          <button className="embedded-shared-back" onClick={onClose}>
            <i className="fas fa-arrow-left" />
          </button>
          <div className="embedded-shared-title">
            <h1>{loadout.name}</h1>
            <span className="embedded-shared-badge">Shared Loadout</span>
          </div>
        </div>
        <div className="embedded-shared-meta">
          <span>
            <i className="fas fa-clock" />
            Updated {new Date(loadout.updatedAt).toLocaleDateString()}
          </span>
        </div>
        <div className="embedded-shared-actions">
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

          return (
            <div key={chapterNumber} className="chapter-section">
              <div className="chapter-separator">
                <span className="chapter-separator-label">Chapter {chapterNumber + 1}</span>
              </div>
              <div className="chapter-content embedded-readonly">
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
  );
}
