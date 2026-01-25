import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import type { Loadout } from '../types/models';
import type { LoadoutData } from '../types/models';
import { useToast } from './Toast';
import { parseLoadoutJson, LoadoutParseError } from '../utils/loadoutData';
import { ShareModal } from './ShareModal';

interface LoadoutHeaderProps {
  loadout: Loadout | null;
  folderBreadcrumb?: string[];
  onNameChange: (name: string) => void;
  onImport: (data: LoadoutData) => void;
  onExportClipboard: () => void;
  onToggleProtection: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export interface LoadoutHeaderHandle {
  startEditing: () => void;
}

const LoadoutHeader = forwardRef<LoadoutHeaderHandle, LoadoutHeaderProps>(({ loadout, folderBreadcrumb, onNameChange, onImport, onExportClipboard, onToggleProtection, onDuplicate, onDelete }, ref) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isPasteMode, setIsPasteMode] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const pasteInputRef = useRef<HTMLTextAreaElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (isPasteMode && pasteInputRef.current) {
      pasteInputRef.current.focus();
    }
  }, [isPasteMode]);

  const handlePasteImport = () => {
    setIsPasteMode(true);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    setIsPasteMode(false);

    try {
      const data = parseLoadoutJson(text);
      onImport(data);
    } catch (err) {
      console.error('Error importing from paste:', err);
      if (err instanceof LoadoutParseError) {
        showToast(`Invalid loadout data: ${err.message}`, 'error');
      } else {
        showToast('Failed to import loadout. Please check the format.', 'error');
      }
    }
  };

  const handlePasteBlur = () => {
    setIsPasteMode(false);
  };

  const handleStartEdit = () => {
    if (loadout && !loadout.isProtected) {
      setEditedName(loadout.name);
      setIsEditing(true);
    }
  };

  useImperativeHandle(ref, () => ({
    startEditing: handleStartEdit
  }));

  const handleSave = () => {
    if (editedName.trim()) {
      onNameChange(editedName.trim());
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  if (!loadout) {
    return <div className="loadout-header">Loading...</div>;
  }

  return (
    <div className="loadout-header">
      <div className="loadout-title-section">
        <div className="loadout-title">
          {isEditing ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              autoFocus
              className="loadout-name-input"
            />
          ) : (
            <h1
              onClick={handleStartEdit}
              className={`loadout-name ${loadout.isProtected ? 'protected' : ''}`}
            >
              {loadout.isProtected && <i className="fas fa-lock protected-icon"></i>}
              {folderBreadcrumb && folderBreadcrumb.length > 0 && (
                <span className="loadout-name-breadcrumb">
                  {folderBreadcrumb.join(' / ')} /&nbsp;
                </span>
              )}
              {loadout.name}
              {!loadout.isProtected && <i className="fas fa-edit edit-icon"></i>}
            </h1>
          )}
        </div>
        <div className="loadout-meta">
          <span className="loadout-updated">
            Last updated: {new Date(loadout.updatedAt).toLocaleString()}
          </span>
        </div>
      </div>
      <div className="loadout-actions">
        <button
          onClick={onToggleProtection}
          className={`loadout-button ${loadout.isProtected ? 'loadout-button-warning' : ''}`}
          title={loadout.isProtected ? 'Make this loadout editable' : 'Protect this loadout from changes'}
        >
          <i className={`fas ${loadout.isProtected ? 'fa-unlock' : 'fa-lock'}`}></i>
          {loadout.isProtected ? ' Set Writeable' : ' Set Readonly'}
        </button>
        {isPasteMode ? (
          <textarea
            ref={pasteInputRef}
            className="paste-input"
            placeholder="Press Ctrl+V to paste..."
            onPaste={handlePaste}
            onBlur={handlePasteBlur}
            onKeyDown={(e) => e.key === 'Escape' && setIsPasteMode(false)}
          />
        ) : (
          <button
            onClick={handlePasteImport}
            className="loadout-button"
            title="Paste loadout data exported from Increlution (Ctrl+V)"
            disabled={loadout.isProtected}
          >
            <i className="fas fa-clipboard"></i> Paste from Game
          </button>
        )}
        <button onClick={onExportClipboard} className="loadout-button" title="Copy loadout data to paste into Increlution">
          <i className="fas fa-copy"></i> Copy for Game
        </button>
        <button
          onClick={() => setShowShareModal(true)}
          className="loadout-button loadout-button-share"
          title="Share this loadout"
        >
          <i className="fas fa-share-alt"></i> Share
        </button>
        <button
          onClick={onDuplicate}
          className="loadout-button"
          title="Duplicate this loadout"
        >
          <i className="fas fa-copy"></i> Duplicate
        </button>
        <button
          onClick={onDelete}
          className="loadout-button loadout-button-danger"
          title="Delete this loadout"
          disabled={loadout.isProtected}
        >
          <i className="fas fa-trash"></i> Delete
        </button>
      </div>

      {showShareModal && loadout && (
        <ShareModal
          itemType="loadout"
          itemId={loadout.id}
          itemName={loadout.name}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
});

export default LoadoutHeader;
