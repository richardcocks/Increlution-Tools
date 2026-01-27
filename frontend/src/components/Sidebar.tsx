import { useState } from 'react';
import type { FolderTreeNode, SharedFolderNode } from '../types/models';
import { useSidebarActions } from '../contexts/SidebarActionsContext';
import { useSavedShares } from '../contexts/SavedSharesContext';
import { useToast } from './Toast';
import './Sidebar.css';

type DragState =
  | { type: 'loadout'; loadoutId: number; sourceFolderId: number }
  | { type: 'folder'; folderId: number; sourceParentId: number; descendantIds: Set<number> };

type ReorderTarget = {
  folderId: number;
  itemType: 'folder' | 'loadout';
  targetId: number;
  position: 'above' | 'below';
} | null;

interface SidebarProps {
  folderTree: FolderTreeNode | null;
  onCreateLoadout?: () => void;
  onViewShare?: (token: string, shareType: 'loadout' | 'folder') => void;
  viewingShareToken?: string | null;
  viewingSharedFolder?: { token: string; loadoutId: number | null } | null;
  onQuickExportShare?: (token: string) => void;
  onQuickExportSharedFolderLoadout?: (folderToken: string, loadoutId: number) => void;
  onViewSharedFolderLoadout?: (folderToken: string, loadoutId: number) => void;
}

interface TreeNodeProps {
  node: FolderTreeNode;
  level: number;
  dragState: DragState | null;
  dropTargetFolderId: number | null;
  reorderTarget: ReorderTarget;
  onLoadoutDragStart: (loadoutId: number, sourceFolderId: number) => void;
  onFolderDragStart: (folderId: number, sourceParentId: number) => void;
  onDragEnd: () => void;
  onDropTargetChange: (folderId: number | null) => void;
  onDrop: (targetFolderId: number) => void;
  onReorderTargetChange: (target: ReorderTarget) => void;
  onReorderDrop: () => void;
}

function TreeNode({ node, level, dragState, dropTargetFolderId, reorderTarget, onLoadoutDragStart, onFolderDragStart, onDragEnd, onDropTargetChange, onDrop, onReorderTargetChange, onReorderDrop }: TreeNodeProps) {
  const {
    selectedLoadoutId,
    selectedFolderId,
    onLoadoutSelect,
    onFolderSelect,
    onQuickExport
  } = useSidebarActions();

  const [expanded, setExpanded] = useState(true);

  const isRootFolder = node.parentId === null;
  const hasChildren = node.subFolders.length > 0 || node.loadouts.length > 0;
  const isSelected = selectedFolderId === node.id && selectedLoadoutId === null;
  const isDropTarget = dropTargetFolderId === node.id;
  const isDraggingThisFolder = dragState?.type === 'folder' && dragState.folderId === node.id;

  // Can this folder accept a "move into" drop? (dropping ON the folder row)
  const canDropInto = (() => {
    if (!dragState) return false;
    if (dragState.type === 'loadout') {
      return dragState.sourceFolderId !== node.id;
    } else {
      if (dragState.folderId === node.id) return false;
      if (dragState.descendantIds.has(node.id)) return false;
      return true;
    }
  })();

  // Can this folder row be a reorder target? (dragging a folder between siblings)
  const canFolderReorder = (() => {
    if (!dragState || dragState.type !== 'folder') return false;
    if (isRootFolder) return false;
    if (dragState.folderId === node.id) return false;
    if (dragState.descendantIds.has(node.id)) return false;
    // Must share the same parent to reorder as siblings
    if (node.parentId == null) return false;
    // For same-parent: always allowed
    if (dragState.sourceParentId === node.parentId) return true;
    // For cross-parent: also allowed (will move + reorder)
    return true;
  })();

  const handleFolderDragOver = (e: React.DragEvent) => {
    if (!dragState) return;

    // Reorder: position between sibling folders
    if (canFolderReorder) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position = e.clientY < midY ? 'above' : 'below';
      onReorderTargetChange({ folderId: node.parentId!, itemType: 'folder', targetId: node.id, position });
      onDropTargetChange(null);
      return;
    }

    // Move into folder
    if (canDropInto) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      onDropTargetChange(node.id);
      onReorderTargetChange(null);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!e.currentTarget.contains(relatedTarget)) {
      onDropTargetChange(null);
    }
  };

  const handleFolderDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (reorderTarget && reorderTarget.targetId === node.id) {
      onReorderDrop();
      return;
    }
    if (canDropInto) {
      onDrop(node.id);
    }
    onDropTargetChange(null);
  };

  const handleLoadoutDragOver = (e: React.DragEvent, loadoutId: number) => {
    if (!dragState || dragState.type !== 'loadout') return;
    if (dragState.loadoutId === loadoutId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? 'above' : 'below';
    onReorderTargetChange({ folderId: node.id, itemType: 'loadout', targetId: loadoutId, position });
    onDropTargetChange(null);
  };

  const handleLoadoutDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (reorderTarget) {
      onReorderDrop();
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`folder-item ${isSelected ? 'selected' : ''} ${isDropTarget && canDropInto ? 'drop-target-active' : ''} ${isDraggingThisFolder ? 'dragging' : ''} ${reorderTarget?.itemType === 'folder' && reorderTarget.targetId === node.id && reorderTarget.position === 'above' ? 'reorder-above' : ''} ${reorderTarget?.itemType === 'folder' && reorderTarget.targetId === node.id && reorderTarget.position === 'below' ? 'reorder-below' : ''}`}
        style={{ paddingLeft: `${level * 16}px` }}
        onClick={() => onFolderSelect(node.id)}
        draggable={!isRootFolder}
        onDragStart={!isRootFolder ? (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', `folder:${node.id}`);
          onFolderDragStart(node.id, node.parentId!);
        } : undefined}
        onDragEnd={!isRootFolder ? onDragEnd : undefined}
        onDragOver={handleFolderDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleFolderDrop}
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
              reorderTarget={reorderTarget}
              onLoadoutDragStart={onLoadoutDragStart}
              onFolderDragStart={onFolderDragStart}
              onDragEnd={onDragEnd}
              onDropTargetChange={onDropTargetChange}
              onDrop={onDrop}
              onReorderTargetChange={onReorderTargetChange}
              onReorderDrop={onReorderDrop}
            />
          ))}
          {node.loadouts.map((loadout) => (
            <div
              key={loadout.id}
              className={`loadout-item ${selectedLoadoutId === loadout.id ? 'selected' : ''} ${loadout.isProtected ? 'protected' : ''} ${dragState?.type === 'loadout' && dragState.loadoutId === loadout.id ? 'dragging' : ''} ${reorderTarget?.itemType === 'loadout' && reorderTarget.targetId === loadout.id && reorderTarget.position === 'above' ? 'reorder-above' : ''} ${reorderTarget?.itemType === 'loadout' && reorderTarget.targetId === loadout.id && reorderTarget.position === 'below' ? 'reorder-below' : ''}`}
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
              onDragOver={(e) => handleLoadoutDragOver(e, loadout.id)}
              onDrop={handleLoadoutDrop}
            >
              <i className="fas fa-grip-vertical drag-handle" />
              <i className="fas fa-file-alt loadout-icon" />
              <span className="loadout-name">{loadout.name}</span>
              {loadout.isProtected && (
                <i className="fas fa-lock loadout-protected-icon" title="Protected" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Shared folder tree node component for displaying saved folder shares
interface SharedFolderTreeNodeProps {
  node: SharedFolderNode;
  level: number;
  folderToken: string;
  selectedLoadoutId: number | null;
  onLoadoutClick: (loadoutId: number) => void;
  onQuickExportLoadout?: (folderToken: string, loadoutId: number) => void;
}

function SharedFolderTreeNode({ node, level, folderToken, selectedLoadoutId, onLoadoutClick, onQuickExportLoadout }: SharedFolderTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.subFolders.length > 0 || node.loadouts.length > 0;

  return (
    <div className="shared-folder-tree-node">
      {level > 0 && (
        <div
          className="shared-folder-item"
          style={{ paddingLeft: `${level * 16}px` }}
          onClick={() => setExpanded(!expanded)}
        >
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
          <i className={`fas fa-folder${expanded && hasChildren ? '-open' : ''} folder-icon`} />
          <span className="folder-name">{node.name}</span>
        </div>
      )}

      {expanded && (
        <div className="shared-folder-contents">
          {node.subFolders.map((subFolder) => (
            <SharedFolderTreeNode
              key={subFolder.id}
              node={subFolder}
              level={level + 1}
              folderToken={folderToken}
              selectedLoadoutId={selectedLoadoutId}
              onLoadoutClick={onLoadoutClick}
              onQuickExportLoadout={onQuickExportLoadout}
            />
          ))}
          {node.loadouts.map((loadout) => (
            <div
              key={loadout.id}
              className={`shared-loadout-item ${selectedLoadoutId === loadout.id ? 'selected' : ''}`}
              style={{ paddingLeft: `${(level + 1) * 16 + (level === 0 ? 8 : 24)}px` }}
              onClick={() => onLoadoutClick(loadout.id)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                }
              }}
              onMouseUp={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onQuickExportLoadout?.(folderToken, loadout.id);
                }
              }}
            >
              <i className="fas fa-file-alt loadout-icon" />
              <span className="loadout-name">{loadout.name}</span>
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

export function Sidebar({ folderTree, onCreateLoadout, onViewShare, viewingShareToken, viewingSharedFolder, onQuickExportShare, onQuickExportSharedFolderLoadout, onViewSharedFolderLoadout }: SidebarProps) {
  const { onMoveLoadout, onMoveFolder, onMoveToPosition } = useSidebarActions();
  const { savedShares, removeSavedShare } = useSavedShares();
  const { showToast } = useToast();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null);
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget>(null);
  const [othersExpanded, setOthersExpanded] = useState(true);
  const [expandedFolderShares, setExpandedFolderShares] = useState<Set<number>>(new Set());

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
    setReorderTarget(null);
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
    setReorderTarget(null);
  };

  const findFolderNode = (tree: FolderTreeNode, folderId: number): FolderTreeNode | null => {
    if (tree.id === folderId) return tree;
    for (const sub of tree.subFolders) {
      const found = findFolderNode(sub, folderId);
      if (found) return found;
    }
    return null;
  };

  const handleReorderDrop = () => {
    if (!reorderTarget || !dragState || !folderTree) return;

    const parentFolder = findFolderNode(folderTree, reorderTarget.folderId);
    if (!parentFolder) return;

    if (reorderTarget.itemType === 'folder' && dragState.type === 'folder') {
      const ids = parentFolder.subFolders.map(f => f.id);
      const draggedId = dragState.folderId;
      // filter removes draggedId if it's already in this folder (same-folder reorder)
      // if cross-folder, filter is a no-op since draggedId isn't in the list
      const filtered = ids.filter(id => id !== draggedId);
      const targetIndex = filtered.indexOf(reorderTarget.targetId);
      const insertIndex = reorderTarget.position === 'above' ? targetIndex : targetIndex + 1;
      filtered.splice(insertIndex, 0, draggedId);
      onMoveToPosition('folder', draggedId, dragState.sourceParentId, reorderTarget.folderId, filtered);
    } else if (reorderTarget.itemType === 'loadout' && dragState.type === 'loadout') {
      const ids = parentFolder.loadouts.map(l => l.id);
      const draggedId = dragState.loadoutId;
      const filtered = ids.filter(id => id !== draggedId);
      const targetIndex = filtered.indexOf(reorderTarget.targetId);
      const insertIndex = reorderTarget.position === 'above' ? targetIndex : targetIndex + 1;
      filtered.splice(insertIndex, 0, draggedId);
      onMoveToPosition('loadout', draggedId, dragState.sourceFolderId, reorderTarget.folderId, filtered);
    }

    setDragState(null);
    setDropTargetFolderId(null);
    setReorderTarget(null);
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

  const toggleFolderShareExpanded = (shareId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolderShares(prev => {
      const next = new Set(prev);
      if (next.has(shareId)) {
        next.delete(shareId);
      } else {
        next.add(shareId);
      }
      return next;
    });
  };

  const handleSharedFolderLoadoutClick = (folderToken: string, loadoutId: number) => {
    onViewSharedFolderLoadout?.(folderToken, loadoutId);
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
          reorderTarget={reorderTarget}
          onLoadoutDragStart={handleLoadoutDragStart}
          onFolderDragStart={handleFolderDragStart}
          onDragEnd={handleDragEnd}
          onDropTargetChange={setDropTargetFolderId}
          onDrop={handleDrop}
          onReorderTargetChange={setReorderTarget}
          onReorderDrop={handleReorderDrop}
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
                  share.shareType === 'loadout' ? (
                    // Loadout share - flat item
                    <div
                      key={share.id}
                      className={`saved-share-item ${viewingShareToken === share.shareToken ? 'selected' : ''}`}
                      onClick={() => onViewShare?.(share.shareToken, 'loadout')}
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
                        <span className="saved-share-name">{share.itemName}</span>
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
                  ) : (
                    // Folder share - expandable tree
                    <div key={share.id} className="saved-folder-share">
                      <div
                        className={`saved-share-item folder-share ${viewingSharedFolder?.token === share.shareToken && !viewingSharedFolder.loadoutId ? 'selected' : ''}`}
                        onClick={() => onViewShare?.(share.shareToken, 'folder')}
                      >
                        {share.folderTree && (share.folderTree.subFolders.length > 0 || share.folderTree.loadouts.length > 0) && (
                          <button
                            className="expand-button"
                            onClick={(e) => toggleFolderShareExpanded(share.id, e)}
                          >
                            <i className={`fas fa-chevron-${expandedFolderShares.has(share.id) ? 'down' : 'right'}`} />
                          </button>
                        )}
                        {(!share.folderTree || (share.folderTree.subFolders.length === 0 && share.folderTree.loadouts.length === 0)) && (
                          <span className="expand-placeholder" />
                        )}
                        <i className="fas fa-folder saved-share-icon" />
                        <div className="saved-share-info">
                          <span className="saved-share-name">{share.itemName}</span>
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
                      {expandedFolderShares.has(share.id) && share.folderTree && (
                        <div className="saved-folder-tree">
                          <SharedFolderTreeNode
                            node={share.folderTree}
                            level={0}
                            folderToken={share.shareToken}
                            selectedLoadoutId={viewingSharedFolder?.token === share.shareToken ? viewingSharedFolder.loadoutId : null}
                            onLoadoutClick={(loadoutId) => handleSharedFolderLoadoutClick(share.shareToken, loadoutId)}
                            onQuickExportLoadout={onQuickExportSharedFolderLoadout}
                          />
                        </div>
                      )}
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
