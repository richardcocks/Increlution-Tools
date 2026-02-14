import { useState } from 'react';
import type { FolderTreeNode } from '../types/models';
import { useSidebarActions } from '../contexts/SidebarActionsContext';
import { useSavedShares } from '../contexts/SavedSharesContext';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { useToast } from './Toast';
import { TreeNode, SharedFolderTreeNode } from './TreeNode';
import { getDescendantIds } from '../utils/folderTree';
import type { DragState, ReorderTarget } from './TreeNode';
import './Sidebar.css';

interface SidebarProps {
  folderTree: FolderTreeNode | null;
  effectiveReadOnlyMap: Map<number, boolean>;
  onCreateLoadout?: () => void;
  onViewShare?: (token: string, shareType: 'loadout' | 'folder') => void;
  viewingShareToken?: string | null;
  viewingSharedFolder?: { token: string; loadoutId: number | null } | null;
  onQuickExportShare?: (token: string) => void;
  onQuickExportSharedFolderLoadout?: (folderToken: string, loadoutId: number) => void;
  onViewSharedFolderLoadout?: (folderToken: string, loadoutId: number) => void;
}

export function Sidebar({ folderTree, effectiveReadOnlyMap, onCreateLoadout, onViewShare, viewingShareToken, viewingSharedFolder, onQuickExportShare, onQuickExportSharedFolderLoadout, onViewSharedFolderLoadout }: SidebarProps) {
  const { onMoveLoadout, onMoveFolder, onMoveToPosition } = useSidebarActions();
  const { savedShares, removeSavedShare } = useSavedShares();
  const { showToast } = useToast();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null);
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget>(null);
  const [othersExpanded, setOthersExpanded] = useState(true);
  const [expandedFolderShares, setExpandedFolderShares] = useState<Set<number>>(new Set());
  const { sidebarWidth, handleResizeMouseDown, handleResizeDoubleClick } = useSidebarResize();

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
      <div className="sidebar" style={{ width: sidebarWidth }}>
        <div className="sidebar-header">
          <h2>Loadouts</h2>
        </div>
        <div className="sidebar-content">
          <p>Loading...</p>
        </div>
        <div
          className="sidebar-resize-handle"
          onMouseDown={handleResizeMouseDown}
          onDoubleClick={handleResizeDoubleClick}
        />
      </div>
    );
  }

  return (
    <div className="sidebar" style={{ width: sidebarWidth }}>
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
          effectiveReadOnlyMap={effectiveReadOnlyMap}
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
      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={handleResizeDoubleClick}
      />
    </div>
  );
}
