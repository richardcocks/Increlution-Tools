import { useState } from 'react';
import type { FolderTreeNode } from '../types/models';
import './DeleteConfirmation.css';

interface DeleteFolderProps {
  type: 'folder';
  folderId: number;
  folderTree: FolderTreeNode;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}

interface DeleteLoadoutProps {
  type: 'loadout';
  loadoutId: number;
  folderTree: FolderTreeNode;
  onConfirm: () => void;
  onCancel: () => void;
}

type DeleteConfirmationProps = DeleteFolderProps | DeleteLoadoutProps;

function findFolderPath(tree: FolderTreeNode, id: number, path: string[] = []): { folder: FolderTreeNode; path: string[] } | null {
  const currentPath = [...path, tree.name];
  if (tree.id === id) return { folder: tree, path: currentPath };
  for (const sub of tree.subFolders) {
    const found = findFolderPath(sub, id, currentPath);
    if (found) return found;
  }
  return null;
}

function findLoadoutPath(tree: FolderTreeNode, id: number, path: string[] = []): { loadout: { name: string; isProtected: boolean }; path: string[] } | null {
  const currentPath = [...path, tree.name];
  for (const loadout of tree.loadouts) {
    if (loadout.id === id) return { loadout, path: [...currentPath, loadout.name] };
  }
  for (const sub of tree.subFolders) {
    const found = findLoadoutPath(sub, id, currentPath);
    if (found) return found;
  }
  return null;
}

export function DeleteConfirmation(props: DeleteConfirmationProps) {
  const { type, folderTree, onConfirm, onCancel } = props;
  const [confirmName, setConfirmName] = useState('');

  if (type === 'folder') {
    const result = findFolderPath(folderTree, props.folderId);
    if (!result) {
      return (
        <div className="delete-confirmation">
          <div className="delete-confirmation-content">
            <p>Folder not found.</p>
            <button className="delete-cancel-button" onClick={onCancel}>Go Back</button>
          </div>
        </div>
      );
    }

    const { folder, path } = result;
    const hasContents = folder.subFolders.length > 0 || folder.loadouts.length > 0;

    // Count total items recursively
    const countItems = (f: FolderTreeNode): { folders: number; loadouts: number; protectedLoadouts: number } => {
      let folders = f.subFolders.length;
      let loadouts = f.loadouts.length;
      let protectedLoadouts = f.loadouts.filter(l => l.isProtected).length;
      for (const sub of f.subFolders) {
        const subCount = countItems(sub);
        folders += subCount.folders;
        loadouts += subCount.loadouts;
        protectedLoadouts += subCount.protectedLoadouts;
      }
      return { folders, loadouts, protectedLoadouts };
    };
    const totalItems = hasContents ? countItems(folder) : { folders: 0, loadouts: 0, protectedLoadouts: 0 };
    const unprotectedLoadouts = totalItems.loadouts - totalItems.protectedLoadouts;

    const canForceDelete = confirmName === folder.name;

    return (
      <div className="delete-confirmation">
        <div className="delete-confirmation-content">
          <h1>Delete Folder</h1>

          <div className="delete-target">
            <i className="fas fa-folder delete-target-icon folder" />
            <div className="delete-target-name">
              {path.map((segment, i) => (
                <span key={i}>
                  {i > 0 && <i className="fas fa-chevron-right delete-path-separator" />}
                  <span className={i === path.length - 1 ? 'delete-path-current' : ''}>{segment}</span>
                </span>
              ))}
            </div>
          </div>

          {hasContents ? (
            <>
              <div className="delete-warning">
                <i className="fas fa-exclamation-triangle" />
                <div>
                  <p><strong>This folder is not empty.</strong></p>
                  <p>
                    It contains {totalItems.folders} subfolder{totalItems.folders !== 1 ? 's' : ''} and {totalItems.loadouts} loadout{totalItems.loadouts !== 1 ? 's' : ''} (including nested items).
                  </p>
                  {unprotectedLoadouts > 0 && (
                    <p>
                      {unprotectedLoadouts} loadout{unprotectedLoadouts !== 1 ? 's' : ''} will be permanently deleted.
                    </p>
                  )}
                </div>
              </div>
              {totalItems.protectedLoadouts > 0 && (
                <div className="delete-info">
                  <i className="fas fa-lock" />
                  <div>
                    <p>
                      <strong>{totalItems.protectedLoadouts} protected loadout{totalItems.protectedLoadouts !== 1 ? 's' : ''}</strong> will be moved to the parent folder instead of deleted.
                    </p>
                  </div>
                </div>
              )}
              <div className="delete-confirm-input">
                <label>
                  Type <strong>{folder.name}</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={folder.name}
                  autoFocus
                />
              </div>
            </>
          ) : (
            <p className="delete-message">
              This folder is empty and can be safely deleted. This action cannot be undone.
            </p>
          )}

          <div className="delete-actions">
            <button className="delete-cancel-button" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="delete-confirm-button"
              onClick={() => onConfirm(hasContents)}
              disabled={hasContents && !canForceDelete}
            >
              {hasContents ? 'Delete Folder and Contents' : 'Delete Folder'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // type === 'loadout'
  const result = findLoadoutPath(folderTree, props.loadoutId);
  if (!result) {
    return (
      <div className="delete-confirmation">
        <div className="delete-confirmation-content">
          <p>Loadout not found.</p>
          <button className="delete-cancel-button" onClick={onCancel}>Go Back</button>
        </div>
      </div>
    );
  }

  const { loadout, path } = result;

  return (
    <div className="delete-confirmation">
      <div className="delete-confirmation-content">
        <h1>Delete Loadout</h1>

        <div className="delete-target">
          <i className="fas fa-file-alt delete-target-icon loadout" />
          <div className="delete-target-name">
            {path.map((segment, i) => (
              <span key={i}>
                {i > 0 && <i className="fas fa-chevron-right delete-path-separator" />}
                <span className={i === path.length - 1 ? 'delete-path-current' : ''}>{segment}</span>
              </span>
            ))}
          </div>
          {loadout.isProtected && (
            <span className="delete-target-protected">
              <i className="fas fa-lock" /> Protected
            </span>
          )}
        </div>

        {loadout.isProtected ? (
          <div className="delete-warning">
            <i className="fas fa-shield-alt" />
            <div>
              <p><strong>This loadout is protected.</strong></p>
              <p>Remove protection before deleting this loadout.</p>
            </div>
          </div>
        ) : (
          <p className="delete-message">
            This will permanently delete the loadout and all its automation settings. This action cannot be undone.
          </p>
        )}

        <div className="delete-actions">
          <button className="delete-cancel-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="delete-confirm-button"
            onClick={onConfirm}
            disabled={loadout.isProtected}
          >
            Delete Loadout
          </button>
        </div>
      </div>
    </div>
  );
}
