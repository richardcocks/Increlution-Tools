import { useState, useEffect, useRef } from 'react';
import type { FolderTreeNode, LoadoutSummary } from '../types/models';
import './FolderView.css';

interface FolderViewProps {
  folder: FolderTreeNode;
  breadcrumb: string[];
  isRootFolder: boolean;
  isEffectivelyReadOnly: boolean;
  startEditing?: boolean;
  onStartEditingConsumed?: () => void;
  onRenameFolder: (name: string) => void;
  onCreateFolder: () => void;
  onCreateLoadout: () => void;
  onSelectLoadout: (loadoutId: number) => void;
  onDuplicateFolder: () => void;
  onDeleteFolder: () => void;
  onShareFolder: () => void;
  onToggleReadOnly: () => void;
  hideShare?: boolean;
}

export function FolderView({
  folder,
  breadcrumb,
  isRootFolder,
  isEffectivelyReadOnly,
  onRenameFolder,
  onCreateFolder,
  onCreateLoadout,
  onSelectLoadout,
  onDuplicateFolder,
  onDeleteFolder,
  onShareFolder,
  onToggleReadOnly,
  hideShare,
  startEditing: startEditingProp,
  onStartEditingConsumed
}: FolderViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const editStartedAtRef = useRef<number>(0);

  useEffect(() => {
    if (startEditingProp) {
      setEditedName(folder.name);
      setIsEditing(true);
      editStartedAtRef.current = Date.now();
      onStartEditingConsumed?.();
    }
  }, [startEditingProp, onStartEditingConsumed]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleStartEdit = () => {
    if (!isRootFolder && !isEffectivelyReadOnly) {
      setEditedName(folder.name);
      setIsEditing(true);
      editStartedAtRef.current = Date.now();
    }
  };

  const handleSave = () => {
    // Ignore blur events that fire immediately after entering edit mode
    // (e.g. when triggered programmatically via shift-click in sidebar)
    if (Date.now() - editStartedAtRef.current < 100) return;
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== folder.name) {
      onRenameFolder(trimmedName);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div className="folder-view">
      <div className="folder-view-header">
        {breadcrumb.length > 1 && (
          <div className="folder-view-breadcrumb">
            {breadcrumb.slice(0, -1).map((segment, i) => (
              <span key={i}>
                {i > 0 && <i className="fas fa-chevron-right breadcrumb-separator" />}
                <span className="breadcrumb-segment">{segment}</span>
              </span>
            ))}
          </div>
        )}
        <div className="folder-view-title-row">
          <i className={`fas ${isEffectivelyReadOnly ? 'fa-lock' : 'fa-folder'} folder-view-icon`} />
          {isEditing ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              autoFocus
              className="folder-view-name-input"
            />
          ) : (
            <h1
              className={`folder-view-title ${!isRootFolder && !isEffectivelyReadOnly ? 'editable' : ''}`}
              onClick={handleStartEdit}
            >
              {folder.name}
              {!isRootFolder && !isEffectivelyReadOnly && <i className="fas fa-edit folder-view-edit-icon" />}
            </h1>
          )}
        </div>
      </div>

      <div className="folder-view-actions">
        <button
          className={`folder-view-action-btn secondary ${folder.isReadOnly ? 'folder-view-action-btn-active' : ''}`}
          onClick={onToggleReadOnly}
          title={folder.isReadOnly ? 'Make this folder editable' : 'Make this folder read-only'}
        >
          <i className={`fas ${folder.isReadOnly ? 'fa-unlock' : 'fa-lock'}`} />
          {folder.isReadOnly ? 'Set Writeable' : 'Set Readonly'}
        </button>
        <button className="folder-view-action-btn" onClick={onCreateLoadout} disabled={isEffectivelyReadOnly}>
          <i className="fas fa-file-medical" />
          New Loadout
        </button>
        <button className="folder-view-action-btn secondary" onClick={onCreateFolder} disabled={isEffectivelyReadOnly}>
          <i className="fas fa-folder-plus" />
          New Folder
        </button>
        {!isRootFolder && (
          <>
            {!hideShare && (
              <button className="folder-view-action-btn secondary" onClick={onShareFolder}>
                <i className="fas fa-share-alt" />
                Share
              </button>
            )}
            <button className="folder-view-action-btn secondary" onClick={onDuplicateFolder} disabled={isEffectivelyReadOnly}>
              <i className="fas fa-copy" />
              Duplicate
            </button>
            <button className="folder-view-action-btn danger" onClick={onDeleteFolder} disabled={isEffectivelyReadOnly}>
              <i className="fas fa-trash" />
              Delete
            </button>
          </>
        )}
      </div>

      <div className="folder-view-content">
        {folder.loadouts.length === 0 ? (
          <div className="folder-view-empty">
            <i className="fas fa-file-alt" />
            <p>No loadouts in this folder</p>
            <p className="hint">Click "New Loadout" to create one</p>
          </div>
        ) : (
          <>
            <h2 className="folder-view-section-title">
              Loadouts ({folder.loadouts.length})
            </h2>
            <div className="folder-view-loadouts">
              {folder.loadouts.map((loadout: LoadoutSummary) => (
                <div
                  key={loadout.id}
                  className="folder-view-loadout-card"
                  onClick={() => onSelectLoadout(loadout.id)}
                >
                  <div className="loadout-card-icon">
                    <i className="fas fa-file-alt" />
                  </div>
                  <div className="loadout-card-info">
                    <span className="loadout-card-name">{loadout.name}</span>
                    <span className="loadout-card-date">
                      Updated {formatDate(loadout.updatedAt)}
                    </span>
                  </div>
                  {loadout.isProtected && (
                    <i className="fas fa-lock loadout-card-protected" title="Protected" />
                  )}
                  <i className="fas fa-chevron-right loadout-card-arrow" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

    </div>
  );
}
