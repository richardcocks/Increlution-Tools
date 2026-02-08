import { useState, useCallback } from 'react';
import type { FolderTreeNode, LoadoutSummary } from '../types/models';
import { COMPARE_COLORS } from '../utils/compareLoadouts';
import './CompareLoadoutsPicker.css';

interface CompareLoadoutsPickerProps {
  folderTree: FolderTreeNode;
  onCompare: (leftId: number, rightId: number) => void;
  onCancel: () => void;
}

interface Selection {
  left: LoadoutSummary | null;
  right: LoadoutSummary | null;
}

export function CompareLoadoutsPicker({
  folderTree,
  onCompare,
  onCancel
}: CompareLoadoutsPickerProps) {
  const [selection, setSelection] = useState<Selection>({ left: null, right: null });
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(() => {
    // Start with root folder expanded
    return new Set([folderTree.id]);
  });

  const handleLoadoutClick = useCallback((loadout: LoadoutSummary) => {
    setSelection(prev => {
      // If this loadout is already selected as left, deselect it
      if (prev.left?.id === loadout.id) {
        return { ...prev, left: null };
      }
      // If this loadout is already selected as right, deselect it
      if (prev.right?.id === loadout.id) {
        return { ...prev, right: null };
      }
      // If no left selected, set as left
      if (!prev.left) {
        return { ...prev, left: loadout };
      }
      // If no right selected, set as right
      if (!prev.right) {
        return { ...prev, right: loadout };
      }
      // Both selected, replace right
      return { ...prev, right: loadout };
    });
  }, []);

  const toggleFolder = useCallback((folderId: number) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleCompare = () => {
    if (selection.left && selection.right) {
      onCompare(selection.left.id, selection.right.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const canCompare = selection.left !== null && selection.right !== null;

  return (
    <div className="compare-picker-overlay" onClick={onCancel} onKeyDown={handleKeyDown}>
      <div className="compare-picker-modal" onClick={e => e.stopPropagation()}>
        <h3>Compare Loadouts</h3>
        <p className="compare-picker-instructions">
          Select two loadouts to compare. Click a loadout to select it.
        </p>

        <div className="compare-picker-selection">
          <div className="compare-picker-slot" style={{ borderColor: COMPARE_COLORS.left }}>
            <span className="compare-picker-slot-label" style={{ color: COMPARE_COLORS.left }}>Left</span>
            <span className="compare-picker-slot-value">
              {selection.left?.name || 'Click to select...'}
            </span>
          </div>
          <span className="compare-picker-vs">vs</span>
          <div className="compare-picker-slot" style={{ borderColor: COMPARE_COLORS.right }}>
            <span className="compare-picker-slot-label" style={{ color: COMPARE_COLORS.right }}>Right</span>
            <span className="compare-picker-slot-value">
              {selection.right?.name || 'Click to select...'}
            </span>
          </div>
        </div>

        <div className="compare-picker-tree">
          <FolderNode
            node={folderTree}
            selection={selection}
            expandedFolders={expandedFolders}
            onLoadoutClick={handleLoadoutClick}
            onToggleFolder={toggleFolder}
            depth={0}
          />
        </div>

        <div className="compare-picker-actions">
          <button type="button" className="compare-picker-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="compare-picker-submit"
            disabled={!canCompare}
            onClick={handleCompare}
          >
            Compare
          </button>
        </div>
      </div>
    </div>
  );
}

interface FolderNodeProps {
  node: FolderTreeNode;
  selection: Selection;
  expandedFolders: Set<number>;
  onLoadoutClick: (loadout: LoadoutSummary) => void;
  onToggleFolder: (folderId: number) => void;
  depth: number;
}

function FolderNode({
  node,
  selection,
  expandedFolders,
  onLoadoutClick,
  onToggleFolder,
  depth
}: FolderNodeProps) {
  const isExpanded = expandedFolders.has(node.id);
  const hasChildren = node.subFolders.length > 0 || node.loadouts.length > 0;

  return (
    <div className="compare-picker-folder" style={{ marginLeft: depth * 16 }}>
      <div
        className="compare-picker-folder-header"
        onClick={() => onToggleFolder(node.id)}
      >
        <i className={`fas ${isExpanded ? 'fa-folder-open' : 'fa-folder'}`} />
        <span>{node.name}</span>
        {hasChildren && (
          <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} compare-picker-chevron`} />
        )}
      </div>

      {isExpanded && (
        <div className="compare-picker-folder-content">
          {node.loadouts.map(loadout => {
            const isLeft = selection.left?.id === loadout.id;
            const isRight = selection.right?.id === loadout.id;
            const selectionColor = isLeft ? COMPARE_COLORS.left : isRight ? COMPARE_COLORS.right : undefined;

            return (
              <div
                key={loadout.id}
                className={`compare-picker-loadout ${isLeft || isRight ? 'selected' : ''}`}
                style={selectionColor ? { borderColor: selectionColor, backgroundColor: `${selectionColor}15` } : undefined}
                onClick={() => onLoadoutClick(loadout)}
              >
                <i className="fas fa-file-alt" />
                <span>{loadout.name}</span>
                {isLeft && <span className="compare-picker-badge" style={{ backgroundColor: COMPARE_COLORS.left }}>L</span>}
                {isRight && <span className="compare-picker-badge" style={{ backgroundColor: COMPARE_COLORS.right }}>R</span>}
              </div>
            );
          })}

          {node.subFolders.map(subFolder => (
            <FolderNode
              key={subFolder.id}
              node={subFolder}
              selection={selection}
              expandedFolders={expandedFolders}
              onLoadoutClick={onLoadoutClick}
              onToggleFolder={onToggleFolder}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
