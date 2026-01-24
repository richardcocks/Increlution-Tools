import { useState } from 'react';
import type { FolderTreeNode } from '../types/models';
import { useSidebarActions } from '../contexts/SidebarActionsContext';
import { useSavedShares } from '../contexts/SavedSharesContext';
import { useToast } from './Toast';
import './Sidebar.css';

type DragState =
  | { type: 'loadout'; loadoutId: number; sourceFolderId: number }
  | { type: 'folder'; folderId: number; sourceParentId: number; descendantIds: Set<number> };

interface SidebarProps {
  folderTree: FolderTreeNode | null;
  onCreateLoadout?: () => void;
  onViewShare?: (token: string) => void;
  viewingShareToken?: string | null;
  onQuickExportShare?: (token: string) => void;
}

interface TreeNodeProps {
  node: FolderTreeNode;
  level: number;
  dragState: DragState | null;
  dropTargetFolderId: number | null;
  onLoadoutDragStart: (loadoutId: number, sourceFolderId: number) => void;
  onFolderDragStart: (folderId: number, sourceParentId: number) => void;
  onDragEnd: () => void;
  onDropTargetChange: (folderId: number | null) => void;
  onDrop: (targetFolderId: number) => void;
}

function TreeNode({ node, level, dragState, dropTargetFolderId, onLoadoutDragStart, onFolderDragStart, onDragEnd, onDropTargetChange, onDrop }: TreeNodeProps) {
  const {
    selectedLoadoutId,
    selectedFolderId,
    onLoadoutSelect,
    onFolderSelect,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onCreateLoadout,
    onDeleteLoadout,
    onRenameLoadout,
    onQuickExport
  } = useSidebarActions();

  const [expanded, setExpanded] = useState(true);

  const isRootFolder = node.parentId === null;
  const hasChildren = node.subFolders.length > 0 || node.loadouts.length > 0;
  const isSelected = selectedFolderId === node.id && selectedLoadoutId === null;
  const isDropTarget = dropTargetFolderId === node.id;
  const isDraggingThisFolder = dragState?.type === 'folder' && dragState.folderId === node.id;

  // Determine if we can drop here
  const canDrop = (() => {
    if (!dragState) return false;
    if (dragState.type === 'loadout') {
      // Loadout: can't drop on the folder it came from
      return dragState.sourceFolderId !== node.id;
    } else {
      // Folder: can't drop on itself or any of its descendants
      // Root IS a valid drop target (folders can be moved to root level)
      if (dragState.folderId === node.id) return false;
      if (dragState.descendantIds.has(node.id)) return false;
      return true;
    }
  })();

  const handleDragOver = (e: React.DragEvent) => {
    if (canDrop) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      onDropTargetChange(node.id);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're actually leaving this folder (not entering a child)
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!e.currentTarget.contains(relatedTarget)) {
      onDropTargetChange(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (canDrop) {
      onDrop(node.id);
    }
    onDropTargetChange(null);
  };

  return (
    <div className="tree-node">
      <div
        className={`folder-item ${isSelected ? 'selected' : ''} ${isDropTarget && canDrop ? 'drop-target-active' : ''} ${isDraggingThisFolder ? 'dragging' : ''}`}
        style={{ paddingLeft: `${level * 16}px` }}
        onClick={() => onFolderSelect(node.id)}
        draggable={!isRootFolder}
        onDragStart={!isRootFolder ? (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', `folder:${node.id}`);
          onFolderDragStart(node.id, node.parentId!);
        } : undefined}
        onDragEnd={!isRootFolder ? onDragEnd : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!isRootFolder && <i className="fas fa-grip-vertical drag-handle folder-drag-handle" />}
        {hasChildren && (
          <button
            className="expand-button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <i className={`fas fa-chevron-${expanded ? 'down' : 'right'}`} />
          </button>
        )}
        {!hasChildren && <span className="expand-placeholder" />}
        <div className="folder-info">
          <i className="fas fa-folder folder-icon" />
          <span className="folder-name">{node.name}</span>
        </div>

        <div className="folder-actions">
          {!isRootFolder && (
            <button
              className="action-button"
              onClick={(e) => {
                e.stopPropagation();
                onCreateLoadout(node.id);
              }}
              title="New Loadout"
            >
              <i className="fas fa-file-medical" />
            </button>
          )}
          <button
            className="action-button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateFolder(node.id);
            }}
            title="New Folder"
          >
            <i className="fas fa-folder-plus" />
          </button>
          {!isRootFolder && (
            <>
              <button
                className="action-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRenameFolder(node.id);
                }}
                title="Rename"
              >
                <i className="fas fa-edit" />
              </button>
              <button
                className="action-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(node.id);
                }}
                title="Delete"
              >
                <i className="fas fa-trash" />
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="folder-contents" style={{ '--level': level } as React.CSSProperties}>
          {node.subFolders.map((subFolder) => (
            <TreeNode
              key={subFolder.id}
              node={subFolder}
              level={level + 1}
              dragState={dragState}
              dropTargetFolderId={dropTargetFolderId}
              onLoadoutDragStart={onLoadoutDragStart}
              onFolderDragStart={onFolderDragStart}
              onDragEnd={onDragEnd}
              onDropTargetChange={onDropTargetChange}
              onDrop={onDrop}
            />
          ))}
          {node.loadouts.map((loadout) => (
            <div
              key={loadout.id}
              className={`loadout-item ${selectedLoadoutId === loadout.id ? 'selected' : ''} ${loadout.isProtected ? 'protected' : ''} ${dragState?.type === 'loadout' && dragState.loadoutId === loadout.id ? 'dragging' : ''}`}
              style={{ paddingLeft: `${(level + 1) * 16 + 24}px` }}
              onClick={() => onLoadoutSelect(loadout.id, node.id)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                }
              }}
              onMouseUp={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onQuickExport(loadout.id);
                }
              }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', `loadout:${loadout.id}`);
                onLoadoutDragStart(loadout.id, node.id);
              }}
              onDragEnd={onDragEnd}
            >
              <i className="fas fa-grip-vertical drag-handle" />
              <i className="fas fa-file-alt loadout-icon" />
              <span className="loadout-name">{loadout.name}</span>
              {loadout.isProtected && (
                <i className="fas fa-lock loadout-protected-icon" title="Protected" />
              )}
              <div className="loadout-item-actions">
                <button
                  className="action-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRenameLoadout(loadout.id);
                  }}
                  title="Rename"
                  disabled={loadout.isProtected}
                >
                  <i className="fas fa-edit" />
                </button>
                <button
                  className="action-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteLoadout(loadout.id);
                  }}
                  title="Delete"
                  disabled={loadout.isProtected}
                >
                  <i className="fas fa-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper to get all descendant folder IDs
function getDescendantIds(tree: FolderTreeNode, folderId: number): Set<number> {
  const descendants = new Set<number>();

  const findFolder = (node: FolderTreeNode): FolderTreeNode | null => {
    if (node.id === folderId) return node;
    for (const sub of node.subFolders) {
      const found = findFolder(sub);
      if (found) return found;
    }
    return null;
  };

  const collectDescendants = (node: FolderTreeNode) => {
    for (const sub of node.subFolders) {
      descendants.add(sub.id);
      collectDescendants(sub);
    }
  };

  const folder = findFolder(tree);
  if (folder) {
    collectDescendants(folder);
  }

  return descendants;
}

export function Sidebar({ folderTree, onCreateLoadout, onViewShare, viewingShareToken, onQuickExportShare }: SidebarProps) {
  const { onMoveLoadout, onMoveFolder } = useSidebarActions();
  const { savedShares, removeSavedShare } = useSavedShares();
  const { showToast } = useToast();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null);
  const [othersExpanded, setOthersExpanded] = useState(true);

  const handleLoadoutDragStart = (loadoutId: number, sourceFolderId: number) => {
    setDragState({ type: 'loadout', loadoutId, sourceFolderId });
  };

  const handleFolderDragStart = (folderId: number, sourceParentId: number) => {
    const descendantIds = folderTree ? getDescendantIds(folderTree, folderId) : new Set<number>();
    setDragState({ type: 'folder', folderId, sourceParentId, descendantIds });
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDropTargetFolderId(null);
  };

  const handleDrop = (targetFolderId: number) => {
    if (dragState) {
      if (dragState.type === 'loadout') {
        onMoveLoadout(dragState.loadoutId, targetFolderId, dragState.sourceFolderId);
      } else {
        onMoveFolder(dragState.folderId, targetFolderId, dragState.sourceParentId);
      }
    }
    setDragState(null);
    setDropTargetFolderId(null);
  };

  const handleRemoveSavedShare = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeSavedShare(id);
      showToast('Removed from collection', 'success');
    } catch {
      showToast('Failed to remove', 'error');
    }
  };

  if (!folderTree) {
    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Loadouts</h2>
        </div>
        <div className="sidebar-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Loadouts</h2>
        <button
          className="new-loadout-button"
          onClick={onCreateLoadout}
          title="Create a new loadout"
        >
          <i className="fas fa-plus" />
          New Loadout
        </button>
      </div>
      <div className="sidebar-content">
        <TreeNode
          node={folderTree}
          level={0}
          dragState={dragState}
          dropTargetFolderId={dropTargetFolderId}
          onLoadoutDragStart={handleLoadoutDragStart}
          onFolderDragStart={handleFolderDragStart}
          onDragEnd={handleDragEnd}
          onDropTargetChange={setDropTargetFolderId}
          onDrop={handleDrop}
        />

        {/* Others' Loadouts Section */}
        {savedShares.length > 0 && (
          <div className="others-loadouts-section">
            <div
              className="others-loadouts-header"
              onClick={() => setOthersExpanded(!othersExpanded)}
            >
              <button className="expand-button">
                <i className={`fas fa-chevron-${othersExpanded ? 'down' : 'right'}`} />
              </button>
              <i className="fas fa-users others-icon" />
              <span className="others-title">Others' Loadouts</span>
              <span className="others-count">{savedShares.length}</span>
            </div>
            {othersExpanded && (
              <div className="others-loadouts-list">
                {savedShares.map(share => (
                  <div
                    key={share.id}
                    className={`saved-share-item ${viewingShareToken === share.shareToken ? 'selected' : ''}`}
                    onClick={() => onViewShare?.(share.shareToken)}
                    onMouseDown={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                      }
                    }}
                    onMouseUp={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        onQuickExportShare?.(share.shareToken);
                      }
                    }}
                  >
                    <i className="fas fa-link saved-share-icon" />
                    <div className="saved-share-info">
                      <span className="saved-share-name">{share.loadoutName}</span>
                      {share.ownerName && (
                        <span className="saved-share-owner">by {share.ownerName}</span>
                      )}
                    </div>
                    <button
                      className="action-button"
                      onClick={(e) => handleRemoveSavedShare(share.id, e)}
                      title="Remove from collection"
                    >
                      <i className="fas fa-times" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
