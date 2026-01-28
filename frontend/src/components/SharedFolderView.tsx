import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import type { SharedFolder, SharedFolderNode, SharedFolderLoadout, IncrelutionAction, AutomationLevel } from '../types/models';
import { ActionType } from '../types/models';
import { normalizeLoadoutData } from '../utils/loadoutData';
import { useAuth } from '../contexts/AuthContext';
import { useSavedShares } from '../contexts/SavedSharesContext';
import { useGameData } from '../contexts/GameDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from './Toast';
import ChapterGroup from './ChapterGroup';
import { PublicHeader } from './PublicHeader';
import './SharedFolderView.css';

export function SharedFolderView() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const { saveFolderShare, savedShares } = useSavedShares();
  const { showToast } = useToast();
  const { actions, skills, loading: gameDataLoading } = useGameData();
  const { unlockedChaptersSet, loading: settingsLoading } = useSettings();

  const [sharedFolder, setSharedFolder] = useState<SharedFolder | null>(null);
  const [selectedLoadout, setSelectedLoadout] = useState<SharedFolderLoadout | null>(null);
  const [selectedLoadoutId, setSelectedLoadoutId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadoutLoading, setLoadoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!token) return;

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
    if (!token) return;
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
    if (!token) return;
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
      <div key={node.id} className="shared-folder-tree-item">
        <div
          className="shared-folder-tree-header"
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
          <div className="shared-folder-tree-children">
            {node.subFolders.map(sub => renderFolderTree(sub, level + 1))}
            {node.loadouts.map(loadout => (
              <div
                key={loadout.id}
                className={`shared-folder-loadout-item ${selectedLoadoutId === loadout.id ? 'selected' : ''}`}
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

  if (loading || gameDataLoading || settingsLoading) {
    return (
      <>
        {!user && <PublicHeader />}
        <div className="shared-folder-loading">
          <i className="fas fa-spinner fa-spin" />
          <p>Loading shared folder...</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {!user && <PublicHeader />}
        <div className="shared-folder-error">
          <i className="fas fa-exclamation-circle" />
          <h1>Unable to Load</h1>
          <p>{error}</p>
          <Link to="/">Go to Home</Link>
        </div>
      </>
    );
  }

  if (!sharedFolder) {
    return (
      <>
        {!user && <PublicHeader />}
        <div className="shared-folder-error">
          <i className="fas fa-question-circle" />
          <h1>Not Found</h1>
          <p>This share link doesn't exist or has been removed.</p>
          <Link to="/">Go to Home</Link>
        </div>
      </>
    );
  }

  const sortedChapters = Array.from(actionsByChapterAndType.keys())
    .filter(ch => unlockedChaptersSet.has(ch))
    .sort((a, b) => a - b);

  return (
    <>
      {!user && <PublicHeader />}
      <div className="shared-folder-view">
        <div className="shared-folder-sidebar">
          <div className="shared-folder-sidebar-header">
            <div className="shared-folder-title">
              <i className="fas fa-folder" />
              <h2>{sharedFolder.folderName}</h2>
            </div>
            {sharedFolder.ownerName && (
              <span className="shared-folder-owner">
                <i className="fas fa-user" />
                Shared by {sharedFolder.ownerName}
              </span>
            )}
          </div>
          <div className="shared-folder-sidebar-actions">
            {user && (
              <button
                className="sidebar-action-button"
                onClick={handleSave}
                disabled={saving || isSaved}
              >
                {saving ? (
                  <><i className="fas fa-spinner fa-spin" /> Saving...</>
                ) : isSaved ? (
                  <><i className="fas fa-check" /> Saved</>
                ) : (
                  <><i className="fas fa-bookmark" /> Save to Collection</>
                )}
              </button>
            )}
          </div>
          <div className="shared-folder-tree">
            {renderFolderTree(sharedFolder.folderTree, 0)}
          </div>
        </div>

        <div className="shared-folder-main">
          {!selectedLoadout && !loadoutLoading && (
            <div className="shared-folder-empty">
              <i className="fas fa-hand-pointer" />
              <h2>Select a Loadout</h2>
              <p>Click on a loadout in the folder tree to view its contents.</p>
            </div>
          )}

          {loadoutLoading && (
            <div className="shared-folder-loadout-loading">
              <i className="fas fa-spinner fa-spin" />
              <p>Loading loadout...</p>
            </div>
          )}

          {selectedLoadout && !loadoutLoading && (
            <>
              <div className="shared-loadout-header">
                <div className="shared-loadout-header-content">
                  <div className="shared-loadout-title">
                    <h1>{selectedLoadout.name}</h1>
                    <span className="shared-badge">Shared Loadout</span>
                  </div>
                  <div className="shared-loadout-meta">
                    <span>
                      <i className="fas fa-clock" />
                      {' '}Updated {new Date(selectedLoadout.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="shared-loadout-actions">
                    <button
                      className="shared-action-button primary"
                      onClick={handleExportClipboard}
                      title="Copy loadout data to paste into Increlution"
                    >
                      <i className="fas fa-copy" />
                      Copy for Game
                    </button>
                  </div>
                </div>
              </div>

              <div className="shared-loadout-body">
                <div className="shared-loadout-content">
                  <div className="read-only-notice">
                    <i className="fas fa-eye" />
                    This is a read-only view. Use "Copy for Game" to paste into Increlution.
                  </div>

                  {!user && (
                    <div className="login-prompt">
                      <i className="fas fa-info-circle" />
                      <span className="login-prompt-text">
                        Log in to save this folder to your collection and view more chapters.
                      </span>
                      <Link to="/login" className="login-prompt-button">
                        Log In
                      </Link>
                    </div>
                  )}

                  <div className="shared-type-headers">
                    <h2>Jobs</h2>
                    <h2>Construction</h2>
                    <h2>Exploration</h2>
                  </div>

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
            </>
          )}
        </div>
      </div>
    </>
  );
}
