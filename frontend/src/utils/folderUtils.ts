import type { FolderTreeNode } from '../types/models';

/**
 * Walk the folder tree and build a map of folderId -> effectiveReadOnly.
 * A folder is effectively read-only if it or any ancestor has isReadOnly=true.
 */
export function buildEffectiveReadOnlyMap(tree: FolderTreeNode | null): Map<number, boolean> {
  const map = new Map<number, boolean>();
  if (!tree) return map;

  function walk(node: FolderTreeNode, parentEffective: boolean) {
    const effective = parentEffective || node.isReadOnly;
    map.set(node.id, effective);
    for (const sub of node.subFolders) {
      walk(sub, effective);
    }
  }

  walk(tree, false);
  return map;
}
