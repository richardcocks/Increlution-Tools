/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

interface SidebarActionsContextValue {
  selectedLoadoutId: number | null;
  selectedFolderId: number | null;
  onLoadoutSelect: (id: number, folderId: number) => void;
  onFolderSelect: (id: number) => void;
  onCreateFolder: (parentId: number) => void;
  onRenameFolder: (folderId: number) => void;
  onDeleteFolder: (folderId: number) => void;
  onDuplicateFolder: (folderId: number) => void;
  onCreateLoadout: (folderId: number) => void;
  onDeleteLoadout: (loadoutId: number) => void;
  onRenameLoadout: (loadoutId: number) => void;
  onDuplicateLoadout: (loadoutId: number) => void;
  onMoveLoadout: (loadoutId: number, targetFolderId: number, sourceFolderId: number) => void;
  onMoveFolder: (folderId: number, targetParentId: number, sourceParentId: number) => void;
  onQuickExport: (loadoutId: number) => void;
}

const SidebarActionsContext = createContext<SidebarActionsContextValue | null>(null);

interface SidebarActionsProviderProps {
  children: ReactNode;
  selectedLoadoutId: number | null;
  selectedFolderId: number | null;
  onLoadoutSelect: (id: number, folderId: number) => void;
  onFolderSelect: (id: number) => void;
  onCreateFolder: (parentId: number) => void;
  onRenameFolder: (folderId: number) => void;
  onDeleteFolder: (folderId: number) => void;
  onDuplicateFolder: (folderId: number) => void;
  onCreateLoadout: (folderId: number) => void;
  onDeleteLoadout: (loadoutId: number) => void;
  onRenameLoadout: (loadoutId: number) => void;
  onDuplicateLoadout: (loadoutId: number) => void;
  onMoveLoadout: (loadoutId: number, targetFolderId: number, sourceFolderId: number) => void;
  onMoveFolder: (folderId: number, targetParentId: number, sourceParentId: number) => void;
  onQuickExport: (loadoutId: number) => void;
}

export function SidebarActionsProvider({
  children,
  selectedLoadoutId,
  selectedFolderId,
  onLoadoutSelect,
  onFolderSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDuplicateFolder,
  onCreateLoadout,
  onDeleteLoadout,
  onRenameLoadout,
  onDuplicateLoadout,
  onMoveLoadout,
  onMoveFolder,
  onQuickExport
}: SidebarActionsProviderProps) {
  const value = useMemo(() => ({
    selectedLoadoutId,
    selectedFolderId,
    onLoadoutSelect,
    onFolderSelect,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onDuplicateFolder,
    onCreateLoadout,
    onDeleteLoadout,
    onRenameLoadout,
    onDuplicateLoadout,
    onMoveLoadout,
    onMoveFolder,
    onQuickExport
  }), [
    selectedLoadoutId,
    selectedFolderId,
    onLoadoutSelect,
    onFolderSelect,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onDuplicateFolder,
    onCreateLoadout,
    onDeleteLoadout,
    onRenameLoadout,
    onDuplicateLoadout,
    onMoveLoadout,
    onMoveFolder,
    onQuickExport
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
