import { describe, it, expect } from 'vitest';
import { getDescendantIds } from './folderTree';
import type { FolderTreeNode } from '../types/models';

function makeFolder(id: number, parentId: number | null, subFolders: FolderTreeNode[] = []): FolderTreeNode {
  return {
    id,
    name: `Folder ${id}`,
    parentId,
    isReadOnly: false,
    subFolders,
    loadouts: [],
  };
}

describe('getDescendantIds', () => {
  it('should return empty set for a leaf folder', () => {
    const tree = makeFolder(1, null);
    const result = getDescendantIds(tree, 1);
    expect(result.size).toBe(0);
  });

  it('should return empty set when folder is not found', () => {
    const tree = makeFolder(1, null);
    const result = getDescendantIds(tree, 999);
    expect(result.size).toBe(0);
  });

  it('should return direct children', () => {
    const tree = makeFolder(1, null, [
      makeFolder(2, 1),
      makeFolder(3, 1),
    ]);
    const result = getDescendantIds(tree, 1);
    expect(result).toEqual(new Set([2, 3]));
  });

  it('should return all nested descendants', () => {
    const tree = makeFolder(1, null, [
      makeFolder(2, 1, [
        makeFolder(4, 2),
        makeFolder(5, 2),
      ]),
      makeFolder(3, 1),
    ]);
    const result = getDescendantIds(tree, 1);
    expect(result).toEqual(new Set([2, 3, 4, 5]));
  });

  it('should return descendants of a subtree', () => {
    const tree = makeFolder(1, null, [
      makeFolder(2, 1, [
        makeFolder(4, 2),
        makeFolder(5, 2, [
          makeFolder(6, 5),
        ]),
      ]),
      makeFolder(3, 1),
    ]);
    // Get descendants of folder 2 only
    const result = getDescendantIds(tree, 2);
    expect(result).toEqual(new Set([4, 5, 6]));
  });

  it('should not include the target folder itself', () => {
    const tree = makeFolder(1, null, [
      makeFolder(2, 1),
    ]);
    const result = getDescendantIds(tree, 1);
    expect(result.has(1)).toBe(false);
  });

  it('should handle deeply nested trees', () => {
    const tree = makeFolder(1, null, [
      makeFolder(2, 1, [
        makeFolder(3, 2, [
          makeFolder(4, 3, [
            makeFolder(5, 4),
          ]),
        ]),
      ]),
    ]);
    const result = getDescendantIds(tree, 1);
    expect(result).toEqual(new Set([2, 3, 4, 5]));
  });
});
