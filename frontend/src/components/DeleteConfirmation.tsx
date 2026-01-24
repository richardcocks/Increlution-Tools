import type { FolderTreeNode } from '../types/models';
import './DeleteConfirmation.css';

interface DeleteFolderProps {
  type: 'folder';
  folderId: number;
  folderTree: FolderTreeNode;
  onConfirm: () => void;
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
            <div className="delete-warning">
              <i className="fas fa-exclamation-triangle" />
              <div>
                <p><strong>This folder is not empty.</strong></p>
                <p>It contains {folder.subFolders.length} subfolder(s) and {folder.loadouts.length} loadout(s). You must delete or move these items before deleting this folder.</p>
              </div>
            </div>
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
              onClick={onConfirm}
              disabled={hasContents}
            >
              Delete Folder
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
