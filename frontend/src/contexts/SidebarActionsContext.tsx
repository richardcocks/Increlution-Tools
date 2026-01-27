/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

interface SidebarActionsContextValue {
  selectedLoadoutId: number | null;
  selectedFolderId: number | null;
  onLoadoutSelect: (id: number, folderId: number) => void;
  onFolderSelect: (id: number) => void;
  onMoveLoadout: (loadoutId: number, targetFolderId: number, sourceFolderId: number) => void;
  onMoveFolder: (folderId: number, targetParentId: number, sourceParentId: number) => void;
  onQuickExport: (loadoutId: number) => void;
  onReorder: (folderId: number, itemType: 'folder' | 'loadout', orderedIds: number[]) => void;
}

const SidebarActionsContext = createContext<SidebarActionsContextValue | null>(null);

interface SidebarActionsProviderProps {
  children: ReactNode;
  selectedLoadoutId: number | null;
  selectedFolderId: number | null;
  onLoadoutSelect: (id: number, folderId: number) => void;
  onFolderSelect: (id: number) => void;
  onMoveLoadout: (loadoutId: number, targetFolderId: number, sourceFolderId: number) => void;
  onMoveFolder: (folderId: number, targetParentId: number, sourceParentId: number) => void;
  onQuickExport: (loadoutId: number) => void;
  onReorder: (folderId: number, itemType: 'folder' | 'loadout', orderedIds: number[]) => void;
}

export function SidebarActionsProvider({
  children,
  selectedLoadoutId,
  selectedFolderId,
  onLoadoutSelect,
  onFolderSelect,
  onMoveLoadout,
  onMoveFolder,
  onQuickExport,
  onReorder
}: SidebarActionsProviderProps) {
  const value = useMemo(() => ({
    selectedLoadoutId,
    selectedFolderId,
    onLoadoutSelect,
    onFolderSelect,
    onMoveLoadout,
    onMoveFolder,
    onQuickExport,
    onReorder
  }), [
    selectedLoadoutId,
    selectedFolderId,
    onLoadoutSelect,
    onFolderSelect,
    onMoveLoadout,
    onMoveFolder,
    onQuickExport,
    onReorder
  ]);

  return (
    <SidebarActionsContext.Provider value={value}>
      {children}
    </SidebarActionsContext.Provider>
  );
}

export function useSidebarActions(): SidebarActionsContextValue {
  const context = useContext(SidebarActionsContext);
  if (!context) {
    throw new Error('useSidebarActions must be used within a SidebarActionsProvider');
  }
  return context;
}
