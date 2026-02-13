import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../contexts/ApiContext';
import type { SharedFolder, SharedFolderNode, SharedFolderLoadout } from '../types/models';
import { normalizeLoadoutData } from '../utils/loadoutData';
import { useSavedShares } from '../contexts/SavedSharesContext';
import { useGameData } from '../contexts/GameDataContext';
import { useToast } from './Toast';
import { ReadOnlyLoadoutDisplay } from './ReadOnlyLoadoutDisplay';
import './EmbeddedSharedLoadout.css';
import './EmbeddedSharedFolder.css';

interface EmbeddedSharedFolderProps {
  token: string;
  selectedLoadoutId?: number | null;
  onClose: () => void;
}

export function EmbeddedSharedFolder({ token, selectedLoadoutId, onClose }: EmbeddedSharedFolderProps) {
  const { api, isGuest } = useApi();
  const { saveFolderShare, savedShares } = useSavedShares();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { loading: gameDataLoading } = useGameData();
  const prefix = isGuest ? '/guest' : '/loadouts';

  const [sharedFolder, setSharedFolder] = useState<SharedFolder | null>(null);
  const [selectedLoadout, setSelectedLoadout] = useState<SharedFolderLoadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadoutLoading, setLoadoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchSharedFolder = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getSharedFolder(token);
        setSharedFolder(data);
        setExpandedFolders(new Set([data.folderTree.id]));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared folder');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedFolder();
  }, [token, api]);

  // Fetch the selected loadout when selectedLoadoutId changes
  useEffect(() => {
    if (!selectedLoadoutId) {
      setSelectedLoadout(null);
      return;
    }

    const fetchLoadout = async () => {
      setLoadoutLoading(true);
      try {
        const data = await api.getSharedFolderLoadout(token, selectedLoadoutId);
        setSelectedLoadout(data);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to load loadout', 'error');
        setSelectedLoadout(null);
      } finally {
        setLoadoutLoading(false);
      }
    };

    fetchLoadout();
  }, [token, selectedLoadoutId, api, showToast]);

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

  const handleLoadoutClick = (loadoutId: number) => {
    navigate(`${prefix}/shared/folder/${token}/${loadoutId}`);
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
                onClick={() => handleLoadoutClick(loadout.id)}
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

      {/* Body: folder tree sidebar + content area */}
      <div className="embedded-folder-body">
        <div className="embedded-folder-sidebar">
          <div className="embedded-folder-sidebar-title">Contents</div>
          <div className="embedded-folder-tree">
            {renderFolderTree(sharedFolder.folderTree, 0)}
          </div>
        </div>

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

              <ReadOnlyLoadoutDisplay
                loadoutData={selectedLoadout.data}
                onExportClipboard={handleExportClipboard}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
