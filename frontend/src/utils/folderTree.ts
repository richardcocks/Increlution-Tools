import type { FolderTreeNode } from '../types/models';

/** Get all descendant folder IDs for a given folder in the tree */
export function getDescendantIds(tree: FolderTreeNode, folderId: number): Set<number> {
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
