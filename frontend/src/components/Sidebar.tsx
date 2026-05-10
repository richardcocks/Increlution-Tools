import { useState } from 'react';
import type { FolderTreeNode } from '../types/models';
import { useSidebarActions } from '../contexts/SidebarActionsContext';
import { useSidebarResize } from '../hooks/useSidebarResize';
import { TreeNode } from './TreeNode';
import { getDescendantIds } from '../utils/folderTree';
import type { DragState, ReorderTarget } from './TreeNode';
import './Sidebar.css';

interface SidebarProps {
  folderTree: FolderTreeNode | null;
  effectiveReadOnlyMap: Map<number, boolean>;
  onCreateLoadout?: () => void;
}

export function Sidebar({ folderTree, effectiveReadOnlyMap, onCreateLoadout }: SidebarProps) {
  const { onMoveLoadout, onMoveFolder, onMoveToPosition } = useSidebarActions();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null);
  const [reorderTarget, setReorderTarget] = useState<ReorderTarget>(null);
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
      </div>
      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={handleResizeDoubleClick}
      />
    </div>
  );
}
