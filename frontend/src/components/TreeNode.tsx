import { useState } from 'react';
import type { FolderTreeNode, SharedFolderNode } from '../types/models';
import { useSidebarActions } from '../contexts/SidebarActionsContext';

export type DragState =
  | { type: 'loadout'; loadoutId: number; sourceFolderId: number }
  | { type: 'folder'; folderId: number; sourceParentId: number; descendantIds: Set<number> };

export type ReorderTarget = {
  folderId: number;
  itemType: 'folder' | 'loadout';
  targetId: number;
  position: 'above' | 'below';
} | null;

interface TreeNodeProps {
  node: FolderTreeNode;
  level: number;
  effectiveReadOnlyMap: Map<number, boolean>;
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

export function TreeNode({ node, level, effectiveReadOnlyMap, dragState, dropTargetFolderId, reorderTarget, onLoadoutDragStart, onFolderDragStart, onDragEnd, onDropTargetChange, onDrop, onReorderTargetChange, onReorderDrop }: TreeNodeProps) {
  const {
    selectedLoadoutId,
    selectedFolderId,
    onLoadoutSelect,
    onFolderSelect,
    onQuickExport,
    onStartRenameFolder,
    onStartRenameLoadout
  } = useSidebarActions();

  const [expanded, setExpanded] = useState(true);

  const isRootFolder = node.parentId === null;
  const hasChildren = node.subFolders.length > 0 || node.loadouts.length > 0;
  const isSelected = selectedFolderId === node.id && selectedLoadoutId === null;
  const isDropTarget = dropTargetFolderId === node.id;
  const isDraggingThisFolder = dragState?.type === 'folder' && dragState.folderId === node.id;
  const isFolderEffectivelyReadOnly = effectiveReadOnlyMap.get(node.id) ?? false;

  // Can this folder accept a "move into" drop? (dropping ON the folder row)
  const canDropInto = (() => {
    if (!dragState) return false;
    if (isFolderEffectivelyReadOnly) return false;
    if (dragState.type === 'loadout') {
      // Also check if source folder is read-only (can't move out of read-only)
      const sourceReadOnly = effectiveReadOnlyMap.get(dragState.sourceFolderId) ?? false;
      if (sourceReadOnly) return false;
      return dragState.sourceFolderId !== node.id;
    } else {
      if (dragState.folderId === node.id) return false;
      if (dragState.descendantIds.has(node.id)) return false;
      // Check if source parent is read-only
      const sourceReadOnly = effectiveReadOnlyMap.get(dragState.sourceParentId) ?? false;
      if (sourceReadOnly) return false;
      return true;
    }
  })();

  // Can this folder row be a reorder target? (dragging a folder between siblings)
  const canFolderReorder = (() => {
    if (!dragState || dragState.type !== 'folder') return false;
    if (isRootFolder) return false;
    if (dragState.folderId === node.id) return false;
    if (dragState.descendantIds.has(node.id)) return false;
    if (node.parentId == null) return false;
    // Block reorder within read-only folders
    if (node.parentId != null && (effectiveReadOnlyMap.get(node.parentId) ?? false)) return false;
    return true;
  })();

  const REORDER_EDGE_RATIO = 0.25;

  const handleFolderDragOver = (e: React.DragEvent) => {
    if (!dragState) return;

    if (dragState.type === 'folder' && canFolderReorder) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const edgeSize = rect.height * REORDER_EDGE_RATIO;

      if (offsetY < edgeSize) {
        // Top edge: reorder above
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onReorderTargetChange({ folderId: node.parentId!, itemType: 'folder', targetId: node.id, position: 'above' });
        onDropTargetChange(null);
        return;
      } else if (offsetY > rect.height - edgeSize) {
        // Bottom edge: reorder below
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onReorderTargetChange({ folderId: node.parentId!, itemType: 'folder', targetId: node.id, position: 'below' });
        onDropTargetChange(null);
        return;
      }
      // Fall through to center: move into folder
    }

    // Center zone or non-reorderable: move into folder
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
      onReorderTargetChange(null);
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
    onReorderTargetChange(null);
  };

  const handleLoadoutDragOver = (e: React.DragEvent, loadoutId: number) => {
    if (!dragState) return;
    // When dragging a folder over a loadout, treat as dropping into this folder
    if (dragState.type === 'folder') {
      if (canDropInto) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDropTargetChange(node.id);
      }
      onReorderTargetChange(null);
      return;
    }
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
    } else if (dragState?.type === 'folder' && canDropInto) {
      onDrop(node.id);
      onDropTargetChange(null);
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`folder-item ${isSelected ? 'selected' : ''} ${isDropTarget && canDropInto ? 'drop-target-active' : ''} ${isDraggingThisFolder ? 'dragging' : ''} ${reorderTarget?.itemType === 'folder' && reorderTarget.targetId === node.id && reorderTarget.position === 'above' ? 'reorder-above' : ''} ${reorderTarget?.itemType === 'folder' && reorderTarget.targetId === node.id && reorderTarget.position === 'below' ? 'reorder-below' : ''}`}
        style={{ paddingLeft: `${level * 16}px` }}
        onClick={() => onFolderSelect(node.id)}
        draggable={!isRootFolder && !isFolderEffectivelyReadOnly}
        onDragStart={!isRootFolder && !isFolderEffectivelyReadOnly ? (e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', `folder:${node.id}`);
          onFolderDragStart(node.id, node.parentId!);
        } : undefined}
        onDragEnd={!isRootFolder && !isFolderEffectivelyReadOnly ? onDragEnd : undefined}
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
          <span
            className="folder-name"
            onClick={(e) => {
              if (e.shiftKey && !isRootFolder && !isFolderEffectivelyReadOnly) {
                e.stopPropagation();
                onFolderSelect(node.id);
                onStartRenameFolder(node.id);
              }
            }}
          >{node.name}</span>
          {isFolderEffectivelyReadOnly && (
            <i className="fas fa-lock folder-readonly-icon" title="Read-only" />
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
              effectiveReadOnlyMap={effectiveReadOnlyMap}
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
              draggable={!isFolderEffectivelyReadOnly}
              onDragStart={!isFolderEffectivelyReadOnly ? (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', `loadout:${loadout.id}`);
                onLoadoutDragStart(loadout.id, node.id);
              } : undefined}
              onDragEnd={!isFolderEffectivelyReadOnly ? onDragEnd : undefined}
              onDragOver={(e) => handleLoadoutDragOver(e, loadout.id)}
              onDrop={handleLoadoutDrop}
            >
              <i className="fas fa-grip-vertical drag-handle" />
              <i className="fas fa-file-alt loadout-icon" />
              <span
                className="loadout-name"
                onClick={(e) => {
                  if (e.shiftKey && !loadout.isProtected && !isFolderEffectivelyReadOnly) {
                    e.stopPropagation();
                    onLoadoutSelect(loadout.id, node.id);
                    onStartRenameLoadout(loadout.id, node.id);
                  }
                }}
              >{loadout.name}</span>
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

export function SharedFolderTreeNode({ node, level, folderToken, selectedLoadoutId, onLoadoutClick, onQuickExportLoadout }: SharedFolderTreeNodeProps) {
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
