import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { SharedFolder, SharedFolderNode, SharedFolderLoadout, IncrelutionAction, AutomationLevel } from '../types/models';
import { ActionType } from '../types/models';
import { normalizeLoadoutData } from '../utils/loadoutData';
import { useSavedShares } from '../contexts/SavedSharesContext';
import { useGameData } from '../contexts/GameDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './Toast';
import ChapterGroup from './ChapterGroup';
import './EmbeddedSharedLoadout.css';
import './EmbeddedSharedFolder.css';

interface EmbeddedSharedFolderProps {
  token: string;
  onClose: () => void;
}

export function EmbeddedSharedFolder({ token, onClose }: EmbeddedSharedFolderProps) {
  const { saveFolderShare, savedShares } = useSavedShares();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { actions, skills, loading: gameDataLoading } = useGameData();
  const { unlockedChaptersSet } = useSettings();

  const [sharedFolder, setSharedFolder] = useState<SharedFolder | null>(null);
  const [selectedLoadout, setSelectedLoadout] = useState<SharedFolderLoadout | null>(null);
  const [selectedLoadoutId, setSelectedLoadoutId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadoutLoading, setLoadoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchSharedFolder = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getSharedFolder(token);
        setSharedFolder(data);
        // Expand root folder by default
        setExpandedFolders(new Set([data.folderTree.id]));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared folder');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedFolder();
  }, [token]);

  const fetchLoadout = useCallback(async (loadoutId: number) => {
    setLoadoutLoading(true);
    try {
      const data = await api.getSharedFolderLoadout(token, loadoutId);
      setSelectedLoadout(data);
      setSelectedLoadoutId(loadoutId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load loadout', 'error');
    } finally {
      setLoadoutLoading(false);
    }
  }, [token, showToast]);

  const isSaved = useMemo(() => {
    return savedShares.some(s => s.shareToken === token && s.shareType === 'folder');
  }, [savedShares, token]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveFolderShare(token);
      showToast('Saved to your collection!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportClipboard = useCallback(async () => {
    if (!selectedLoadout) return;
    try {
      const jsonString = JSON.stringify(normalizeLoadoutData(selectedLoadout.data));
      await navigator.clipboard.writeText(jsonString);
      showToast('Copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  }, [selectedLoadout, showToast]);

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

  const toggleFolder = (folderId: number) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

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
    if (!selectedLoadout?.data) return null;
    const typeData = selectedLoadout.data[action.type];
    if (!typeData) return null;
    const level = typeData[action.originalId];
    return level !== undefined ? (level as AutomationLevel) : null;
  }, [selectedLoadout?.data]);

  // No-op handlers for read-only view
  const noopChange = useCallback(() => {}, []);
  const noopToggle = useCallback(() => {}, []);

  // Recursive folder tree node component
  const renderFolderTree = (node: SharedFolderNode, level: number) => {
    const isExpanded = expandedFolders.has(node.id);
    const hasChildren = node.subFolders.length > 0 || node.loadouts.length > 0;

    return (
      <div key={node.id} className="embedded-folder-tree-item">
        <div
          className="embedded-folder-tree-header"
          style={{ paddingLeft: `${level * 16}px` }}
          onClick={() => toggleFolder(node.id)}
        >
          {hasChildren && (
            <button className="expand-btn" onClick={(e) => { e.stopPropagation(); toggleFolder(node.id); }}>
              <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'}`} />
            </button>
          )}
          {!hasChildren && <span className="expand-placeholder" />}
          <i className="fas fa-folder folder-icon" />
          <span className="folder-name">{node.name}</span>
        </div>
        {isExpanded && (
          <div className="embedded-folder-tree-children">
            {node.subFolders.map(sub => renderFolderTree(sub, level + 1))}
            {node.loadouts.map(loadout => (
              <div
                key={loadout.id}
                className={`embedded-folder-loadout-item ${selectedLoadoutId === loadout.id ? 'selected' : ''}`}
                style={{ paddingLeft: `${(level + 1) * 16 + 24}px` }}
                onClick={() => fetchLoadout(loadout.id)}
              >
                <i className="fas fa-file-alt loadout-icon" />
                <span className="loadout-name">{loadout.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading || gameDataLoading) {
    return (
      <div className="embedded-shared-loading">
        <i className="fas fa-spinner fa-spin" />
        <p>Loading shared folder...</p>
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

  if (!sharedFolder) {
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
    <div className="embedded-shared-folder">
      {/* Header */}
      <div className="embedded-folder-header">
        <div className="embedded-folder-title-row">
          <button className="embedded-shared-back" onClick={onClose}>
            <i className="fas fa-arrow-left" />
          </button>
          <div className="embedded-folder-title">
            <i className="fas fa-folder" />
            <h1>{sharedFolder.folderName}</h1>
            <span className="embedded-shared-badge">Shared Folder</span>
          </div>
        </div>
        <div className="embedded-folder-meta">
          {sharedFolder.ownerName && (
            <span className="embedded-shared-owner">
              <i className="fas fa-user" />
              Shared by {sharedFolder.ownerName}
            </span>
          )}
          <span>
            <i className="fas fa-clock" />
            Updated {new Date(sharedFolder.updatedAt).toLocaleDateString()}
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
        </div>
      </div>

      {/* Main content area with sidebar */}
      <div className="embedded-folder-body">
        {/* Folder tree sidebar */}
        <div className="embedded-folder-sidebar">
          <div className="embedded-folder-sidebar-title">Contents</div>
          <div className="embedded-folder-tree">
            {renderFolderTree(sharedFolder.folderTree, 0)}
          </div>
        </div>

        {/* Loadout content */}
        <div className="embedded-folder-content">
          {!selectedLoadout && !loadoutLoading && (
            <div className="embedded-folder-empty">
              <i className="fas fa-hand-pointer" />
              <h2>Select a Loadout</h2>
              <p>Click on a loadout in the folder tree to view its contents.</p>
            </div>
          )}

          {loadoutLoading && (
            <div className="embedded-folder-loadout-loading">
              <i className="fas fa-spinner fa-spin" />
              <p>Loading loadout...</p>
            </div>
          )}

          {selectedLoadout && !loadoutLoading && (
            <>
              <div className="embedded-loadout-header">
                <div className="embedded-loadout-title">
                  <h2>{selectedLoadout.name}</h2>
                  <span className="embedded-loadout-updated">
                    <i className="fas fa-clock" />
                    Updated {new Date(selectedLoadout.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="embedded-action-button secondary"
                  onClick={handleExportClipboard}
                  title="Copy loadout data to paste into Increlution"
                >
                  <i className="fas fa-copy" />
                  Copy for Game
                </button>
              </div>

              <div className="embedded-loadout-content">
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
