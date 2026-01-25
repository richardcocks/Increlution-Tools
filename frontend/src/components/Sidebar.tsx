import { useState } from 'react';
import type { FolderTreeNode, SharedFolderNode } from '../types/models';
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
  onViewShare?: (token: string, shareType: 'loadout' | 'folder') => void;
  viewingShareToken?: string | null;
  onQuickExportShare?: (token: string) => void;
  onViewSharedFolderLoadout?: (folderToken: string, loadoutId: number) => void;
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
}

function SharedFolderTreeNode({ node, level, folderToken, selectedLoadoutId, onLoadoutClick }: SharedFolderTreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.subFolders.length > 0 || node.loadouts.length > 0;

  return (
    <div className="shared-folder-tree-node">
      {level > 0 && (
        <div
          className="shared-folder-item"
          style={{ paddingLeft: `${level * 16}px` }}
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
          <i className="fas fa-folder folder-icon" />
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
            />
          ))}
          {node.loadouts.map((loadout) => (
            <div
              key={loadout.id}
              className={`shared-loadout-item ${selectedLoadoutId === loadout.id ? 'selected' : ''}`}
              style={{ paddingLeft: `${(level + 1) * 16 + (level === 0 ? 8 : 24)}px` }}
              onClick={() => onLoadoutClick(loadout.id)}
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

export function Sidebar({ folderTree, onCreateLoadout, onViewShare, viewingShareToken, onQuickExportShare, onViewSharedFolderLoadout }: SidebarProps) {
  const { onMoveLoadout, onMoveFolder } = useSidebarActions();
  const { savedShares, removeSavedShare } = useSavedShares();
  const { showToast } = useToast();
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<number | null>(null);
  const [othersExpanded, setOthersExpanded] = useState(true);
  const [expandedFolderShares, setExpandedFolderShares] = useState<Set<number>>(new Set());
  const [selectedSharedLoadoutId, setSelectedSharedLoadoutId] = useState<number | null>(null);

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
    setSelectedSharedLoadoutId(loadoutId);
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
                        className={`saved-share-item folder-share ${viewingShareToken === share.shareToken ? 'selected' : ''}`}
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
                            selectedLoadoutId={selectedSharedLoadoutId}
                            onLoadoutClick={(loadoutId) => handleSharedFolderLoadoutClick(share.shareToken, loadoutId)}
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
