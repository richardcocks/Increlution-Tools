import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import LoadoutEditor from './components/LoadoutEditor'
import type { LoadoutEditorHandle } from './components/LoadoutEditor'
import { Sidebar } from './components/Sidebar'
import { useToast } from './components/Toast'
import { DeleteConfirmation } from './components/DeleteConfirmation'
import { EmbeddedSharedLoadout } from './components/EmbeddedSharedLoadout'
import { TextInputModal } from './components/TextInputModal'
import { FolderView } from './components/FolderView'
import { useAuth } from './contexts/AuthContext'
import { useSettings } from './contexts/SettingsContext'
import { useGameData } from './contexts/GameDataContext'
import { SidebarActionsProvider } from './contexts/SidebarActionsContext'
import { api } from './services/api'
import type { FolderTreeNode } from './types/models'
import { filterLoadoutByChapters } from './utils/loadoutData'
import { SettingsPage } from './pages/SettingsPage'
import { FavouritesPage } from './pages/FavouritesPage'
import { ManageSharesPage } from './pages/ManageSharesPage'
import { HelpPage } from './pages/HelpPage'
import './App.css'

type PendingDelete =
  | { type: 'folder'; id: number }
  | { type: 'loadout'; id: number }
  | null;

type FolderModal =
  | { type: 'create'; parentId: number }
  | { type: 'rename'; folderId: number; currentName: string }
  | null;

function App() {
  const [folderTree, setFolderTree] = useState<FolderTreeNode | null>(null)
  const [selectedLoadoutId, setSelectedLoadoutId] = useState<number | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [viewingShareToken, setViewingShareToken] = useState<string | null>(null)
  const [folderModal, setFolderModal] = useState<FolderModal>(null)
  const { showToast } = useToast()
  const { user, logout } = useAuth()
  const { unlockedChaptersSet } = useSettings()
  const { actions } = useGameData()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ token?: string }>()
  const loadoutEditorRef = useRef<LoadoutEditorHandle>(null)

  // Derive page state from URL
  const showSettings = location.pathname === '/settings'
  const showFavourites = location.pathname === '/favourites'
  const showShares = location.pathname === '/shares'
  const showHelp = location.pathname === '/help'

  // Handle /share/:token route for logged-in users
  useEffect(() => {
    if (params.token) {
      setViewingShareToken(params.token)
      setPendingDelete(null)
    }
  }, [params.token])

  const fetchFolderTree = async () => {
    try {
      const tree = await api.getFolderTree()
      setFolderTree(tree)
    } catch (err) {
      console.error('Error fetching folder tree:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFolderTree()
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/')
    } catch (err) {
      console.error('Error logging out:', err)
      showToast('Failed to logout', 'error')
    }
  }

  const handleCreateFolder = (parentId: number) => {
    setPendingDelete(null)
    setFolderModal({ type: 'create', parentId })
  }

  const handleCreateFolderSubmit = async (name: string) => {
    if (!folderModal || folderModal.type !== 'create') return
    const { parentId } = folderModal
    setFolderModal(null)

    try {
      await api.createFolder(name, parentId)
      await fetchFolderTree()
    } catch (err) {
      console.error('Error creating folder:', err)
      showToast('Failed to create folder', 'error')
    }
  }

  const handleRenameFolder = (folderId: number) => {
    setPendingDelete(null)
    // Find current folder name
    const findFolderName = (node: FolderTreeNode): string | null => {
      if (node.id === folderId) return node.name
      for (const sub of node.subFolders) {
        const found = findFolderName(sub)
        if (found) return found
      }
      return null
    }
    const currentName = folderTree ? findFolderName(folderTree) ?? '' : ''
    setFolderModal({ type: 'rename', folderId, currentName })
  }

  const handleRenameFolderSubmit = async (name: string) => {
    if (!folderModal || folderModal.type !== 'rename') return
    const { folderId } = folderModal
    setFolderModal(null)

    await doRenameFolder(folderId, name)
  }

  const doRenameFolder = async (folderId: number, name: string) => {
    // Optimistic update
    const previousTree = folderTree
    setFolderTree(prev => prev ? renameFolderInTree(prev, folderId, name) : prev)

    try {
      await api.renameFolder(folderId, name)
    } catch (err) {
      console.error('Error renaming folder:', err)
      showToast('Failed to rename folder', 'error')
      // Revert on error
      setFolderTree(previousTree)
    }
  }

  const handleDeleteFolder = (folderId: number) => {
    setPendingDelete({ type: 'folder', id: folderId })
  }

  const confirmDeleteFolder = async (folderId: number) => {
    try {
      await api.deleteFolder(folderId)
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null)
      }
      await fetchFolderTree()
    } catch (err) {
      console.error('Error deleting folder:', err)
      showToast('Failed to delete folder. Make sure it is empty.', 'error')
    }
  }

  const addLoadoutToTree = (tree: FolderTreeNode, folderId: number, loadout: { id: number; name: string; updatedAt: string; isProtected: boolean }): FolderTreeNode => {
    if (tree.id === folderId) {
      return {
        ...tree,
        loadouts: [...tree.loadouts, loadout]
      }
    }
    return {
      ...tree,
      subFolders: tree.subFolders.map(sub => addLoadoutToTree(sub, folderId, loadout))
    }
  }

  const renameFolderInTree = (tree: FolderTreeNode, folderId: number, newName: string): FolderTreeNode => {
    if (tree.id === folderId) {
      return { ...tree, name: newName }
    }
    return {
      ...tree,
      subFolders: tree.subFolders.map(sub => renameFolderInTree(sub, folderId, newName))
    }
  }

  const renameLoadoutInTree = (tree: FolderTreeNode, loadoutId: number, newName: string): FolderTreeNode => {
    return {
      ...tree,
      loadouts: tree.loadouts.map(l => l.id === loadoutId ? { ...l, name: newName } : l),
      subFolders: tree.subFolders.map(sub => renameLoadoutInTree(sub, loadoutId, newName))
    }
  }

  const updateLoadoutProtectionInTree = (tree: FolderTreeNode, loadoutId: number, isProtected: boolean): FolderTreeNode => {
    return {
      ...tree,
      loadouts: tree.loadouts.map(l => l.id === loadoutId ? { ...l, isProtected } : l),
      subFolders: tree.subFolders.map(sub => updateLoadoutProtectionInTree(sub, loadoutId, isProtected))
    }
  }

  const moveLoadoutInTree = (tree: FolderTreeNode, loadoutId: number, sourceFolderId: number, targetFolderId: number): FolderTreeNode => {
    // Find the loadout in the source folder
    let movedLoadout: { id: number; name: string; updatedAt: string; isProtected: boolean } | null = null;

    const findAndRemoveLoadout = (node: FolderTreeNode): FolderTreeNode => {
      if (node.id === sourceFolderId) {
        const loadout = node.loadouts.find(l => l.id === loadoutId);
        if (loadout) {
          movedLoadout = loadout;
        }
        return {
          ...node,
          loadouts: node.loadouts.filter(l => l.id !== loadoutId),
          subFolders: node.subFolders.map(findAndRemoveLoadout)
        };
      }
      return {
        ...node,
        subFolders: node.subFolders.map(findAndRemoveLoadout)
      };
    };

    const addLoadoutToFolder = (node: FolderTreeNode): FolderTreeNode => {
      if (node.id === targetFolderId && movedLoadout) {
        return {
          ...node,
          loadouts: [...node.loadouts, movedLoadout],
          subFolders: node.subFolders.map(addLoadoutToFolder)
        };
      }
      return {
        ...node,
        subFolders: node.subFolders.map(addLoadoutToFolder)
      };
    };

    const treeWithoutLoadout = findAndRemoveLoadout(tree);
    return addLoadoutToFolder(treeWithoutLoadout);
  }

  const moveFolderInTree = (tree: FolderTreeNode, folderId: number, sourceParentId: number, targetParentId: number): FolderTreeNode => {
    // Find and remove the folder from its source parent
    let movedFolder: FolderTreeNode | null = null;

    const findAndRemoveFolder = (node: FolderTreeNode): FolderTreeNode => {
      if (node.id === sourceParentId) {
        const folder = node.subFolders.find(f => f.id === folderId);
        if (folder) {
          movedFolder = { ...folder, parentId: targetParentId };
        }
        return {
          ...node,
          subFolders: node.subFolders.filter(f => f.id !== folderId).map(findAndRemoveFolder)
        };
      }
      return {
        ...node,
        subFolders: node.subFolders.map(findAndRemoveFolder)
      };
    };

    const addFolderToParent = (node: FolderTreeNode): FolderTreeNode => {
      if (node.id === targetParentId && movedFolder) {
        return {
          ...node,
          subFolders: [...node.subFolders.map(addFolderToParent), movedFolder]
        };
      }
      return {
        ...node,
        subFolders: node.subFolders.map(addFolderToParent)
      };
    };

    const treeWithoutFolder = findAndRemoveFolder(tree);
    return addFolderToParent(treeWithoutFolder);
  }

  // Helper to check if targetId is a descendant of folderId
  const isDescendant = (tree: FolderTreeNode, folderId: number, targetId: number): boolean => {
    const findFolder = (node: FolderTreeNode): FolderTreeNode | null => {
      if (node.id === folderId) return node;
      for (const sub of node.subFolders) {
        const found = findFolder(sub);
        if (found) return found;
      }
      return null;
    };

    const folder = findFolder(tree);
    if (!folder) return false;

    const checkDescendant = (node: FolderTreeNode): boolean => {
      if (node.id === targetId) return true;
      return node.subFolders.some(checkDescendant);
    };

    return checkDescendant(folder);
  }

  // Helper to get folder path (breadcrumb) for a given folder ID
  const getFolderPath = (tree: FolderTreeNode, folderId: number): string[] => {
    const path: string[] = [];

    const findPath = (node: FolderTreeNode, currentPath: string[]): boolean => {
      const newPath = [...currentPath, node.name];
      if (node.id === folderId) {
        path.push(...newPath);
        return true;
      }
      for (const sub of node.subFolders) {
        if (findPath(sub, newPath)) return true;
      }
      return false;
    };

    if (tree) {
      findPath(tree, []);
    }
    return path;
  }

  // Helper to find a folder node by ID
  const findFolderById = (tree: FolderTreeNode, folderId: number): FolderTreeNode | null => {
    if (tree.id === folderId) return tree;
    for (const sub of tree.subFolders) {
      const found = findFolderById(sub, folderId);
      if (found) return found;
    }
    return null;
  }

  const handleCreateLoadout = async (folderId: number) => {
    setPendingDelete(null)
    setViewingShareToken(null)  // Clear shared view when creating new loadout
    // Update URL to /loadouts if we're not already there
    if (location.pathname !== '/loadouts') {
      navigate('/loadouts')
    }
    try {
      const loadout = await api.createLoadout('Loadout', folderId)
      // Optimistically add to tree and select
      setFolderTree(prev => prev ? addLoadoutToTree(prev, folderId, {
        id: loadout.id,
        name: loadout.name,
        updatedAt: loadout.updatedAt,
        isProtected: loadout.isProtected
      }) : prev)
      setSelectedLoadoutId(loadout.id)
      // Refresh tree in background to sync with server
      fetchFolderTree()
    } catch (err) {
      console.error('Error creating loadout:', err)
      showToast('Failed to create loadout', 'error')
    }
  }

  const handleDeleteLoadout = (loadoutId: number) => {
    setPendingDelete({ type: 'loadout', id: loadoutId })
  }

  const confirmDeleteLoadout = async (loadoutId: number) => {
    try {
      await api.deleteLoadout(loadoutId)
      if (selectedLoadoutId === loadoutId) {
        setSelectedLoadoutId(null)
      }
      await fetchFolderTree()
    } catch (err) {
      console.error('Error deleting loadout:', err)
      showToast('Failed to delete loadout', 'error')
    }
  }

  const handleConfirmDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.type === 'folder') {
      confirmDeleteFolder(pendingDelete.id)
    } else {
      confirmDeleteLoadout(pendingDelete.id)
    }
    setPendingDelete(null)
  }

  const handleRenameLoadout = (loadoutId: number) => {
    setPendingDelete(null)
    if (loadoutId === selectedLoadoutId) {
      // Already selected, trigger inline editing
      loadoutEditorRef.current?.startEditingName()
    } else {
      // Select first, then trigger edit after a brief delay for editor to load
      setSelectedLoadoutId(loadoutId)
      setTimeout(() => {
        loadoutEditorRef.current?.startEditingName()
      }, 100)
    }
  }

  const handleFolderSelect = (folderId: number) => {
    setSelectedFolderId(folderId)
    setSelectedLoadoutId(null)
    setPendingDelete(null)
    setViewingShareToken(null)  // Clear shared view when selecting folder
    // Update URL to /loadouts if we're not already there
    if (location.pathname !== '/loadouts') {
      navigate('/loadouts')
    }
  }

  const handleLoadoutSelect = (loadoutId: number, folderId: number) => {
    setSelectedLoadoutId(loadoutId)
    setSelectedFolderId(folderId)
    setPendingDelete(null)
    setViewingShareToken(null)  // Clear shared view when selecting own loadout
    // Update URL to /loadouts if we're not already there
    if (location.pathname !== '/loadouts') {
      navigate('/loadouts')
    }
  }

  const handleViewShare = (token: string) => {
    setViewingShareToken(token)
    setSelectedLoadoutId(null)
    setPendingDelete(null)
    // Update URL to show the share token
    navigate(`/share/${token}`)
  }

  const handleCloseShare = () => {
    setViewingShareToken(null)
    // Navigate back to loadouts
    navigate('/loadouts')
  }

  const handleLoadoutNameChange = (loadoutId: number, name: string) => {
    // Update sidebar tree (LoadoutEditor handles API call and reverts on error)
    setFolderTree(prev => prev ? renameLoadoutInTree(prev, loadoutId, name) : prev)
  }

  const handleLoadoutProtectionChange = (loadoutId: number, isProtected: boolean) => {
    // Update sidebar tree (LoadoutEditor handles API call and reverts on error)
    setFolderTree(prev => prev ? updateLoadoutProtectionInTree(prev, loadoutId, isProtected) : prev)
  }

  const handleMoveLoadout = async (loadoutId: number, targetFolderId: number, sourceFolderId: number) => {
    // Don't move to same folder
    if (sourceFolderId === targetFolderId) return

    // Optimistic update
    const previousTree = folderTree
    setFolderTree(prev => prev ? moveLoadoutInTree(prev, loadoutId, sourceFolderId, targetFolderId) : prev)

    // Update selected folder if moving the selected loadout
    if (selectedLoadoutId === loadoutId) {
      setSelectedFolderId(targetFolderId)
    }

    try {
      await api.moveLoadout(loadoutId, targetFolderId)
    } catch (err) {
      console.error('Error moving loadout:', err)
      showToast('Failed to move loadout', 'error')
      // Revert on error
      setFolderTree(previousTree)
      if (selectedLoadoutId === loadoutId) {
        setSelectedFolderId(sourceFolderId)
      }
    }
  }

  const handleMoveFolder = async (folderId: number, targetParentId: number, sourceParentId: number) => {
    // Don't move to same parent
    if (sourceParentId === targetParentId) return

    // Don't move into itself or its descendants
    if (folderTree && (folderId === targetParentId || isDescendant(folderTree, folderId, targetParentId))) {
      showToast('Cannot move folder into itself or its subfolder', 'error')
      return
    }

    // Optimistic update
    const previousTree = folderTree
    setFolderTree(prev => prev ? moveFolderInTree(prev, folderId, sourceParentId, targetParentId) : prev)

    try {
      await api.moveFolder(folderId, targetParentId)
    } catch (err) {
      console.error('Error moving folder:', err)
      showToast('Failed to move folder', 'error')
      // Revert on error
      setFolderTree(previousTree)
    }
  }

  // Quick export loadout to clipboard (middle-click on sidebar)
  const handleQuickExport = useCallback(async (loadoutId: number) => {
    try {
      const data = await api.exportLoadout(loadoutId)
      const filteredData = filterLoadoutByChapters(data, actions, unlockedChaptersSet)
      const jsonString = JSON.stringify(filteredData)
      await navigator.clipboard.writeText(jsonString)
      showToast('Copied to clipboard!', 'success')
    } catch (err) {
      console.error('Error exporting to clipboard:', err)
      showToast('Failed to copy to clipboard', 'error')
    }
  }, [actions, unlockedChaptersSet, showToast])

  // Quick export shared loadout to clipboard (middle-click on sidebar)
  const handleQuickExportShare = useCallback(async (token: string) => {
    try {
      const sharedLoadout = await api.getSharedLoadout(token)
      const jsonString = JSON.stringify(sharedLoadout.data)
      await navigator.clipboard.writeText(jsonString)
      showToast('Copied to clipboard!', 'success')
    } catch (err) {
      console.error('Error exporting to clipboard:', err)
      showToast('Failed to copy to clipboard', 'error')
    }
  }, [showToast])

  // Compute breadcrumb for current selected folder
  const folderBreadcrumb = selectedFolderId && folderTree
    ? getFolderPath(folderTree, selectedFolderId)
    : []

  if (loading) {
    return <div className="app-loading">Loading...</div>
  }

  const renderMainContent = () => {
    if (viewingShareToken) {
      return (
        <EmbeddedSharedLoadout
          token={viewingShareToken}
          onClose={handleCloseShare}
        />
      );
    }

    if (pendingDelete && folderTree) {
      if (pendingDelete.type === 'folder') {
        return (
          <DeleteConfirmation
            type="folder"
            folderId={pendingDelete.id}
            folderTree={folderTree}
            onConfirm={handleConfirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        );
      } else {
        return (
          <DeleteConfirmation
            type="loadout"
            loadoutId={pendingDelete.id}
            folderTree={folderTree}
            onConfirm={handleConfirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        );
      }
    }

    // Show folder view when a folder is selected but no loadout
    if (!selectedLoadoutId && selectedFolderId && folderTree) {
      const currentFolder = findFolderById(folderTree, selectedFolderId);
      if (currentFolder) {
        return (
          <FolderView
            folder={currentFolder}
            breadcrumb={folderBreadcrumb}
            isRootFolder={currentFolder.parentId === null}
            onRenameFolder={(name) => doRenameFolder(selectedFolderId, name)}
            onCreateFolder={() => handleCreateFolder(selectedFolderId)}
            onCreateLoadout={() => handleCreateLoadout(selectedFolderId)}
            onSelectLoadout={(loadoutId) => handleLoadoutSelect(loadoutId, selectedFolderId)}
          />
        );
      }
    }

    return (
      <LoadoutEditor
        ref={loadoutEditorRef}
        loadoutId={selectedLoadoutId}
        folderBreadcrumb={folderBreadcrumb}
        onNameChange={handleLoadoutNameChange}
        onProtectionChange={handleLoadoutProtectionChange}
        onCreateLoadout={() => handleCreateLoadout(selectedFolderId ?? folderTree?.id ?? 0)}
      />
    );
  };

  return (
    <div className="app">
      <div className="app-header">
        <Link to="/loadouts" className="app-title">Increlution Automation Editor</Link>
        <div className="user-info">
          <span className="user-email">{user?.username}</span>
          <button className="help-button" onClick={() => { setPendingDelete(null); navigate('/help'); }} title="Help">
            <i className="fas fa-question-circle" />
          </button>
          <button className="favourites-button" onClick={() => { setPendingDelete(null); navigate('/favourites'); }} title="Favourites">
            <i className="fas fa-star" />
          </button>
          <button className="shares-button" onClick={() => { setPendingDelete(null); navigate('/shares'); }} title="Manage Shares">
            <i className="fas fa-share-alt" />
          </button>
          <button className="settings-button" onClick={() => { setPendingDelete(null); navigate('/settings'); }} title="Settings">
            <i className="fas fa-cog" />
          </button>
          <button className="logout-button" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt" />
            Logout
          </button>
        </div>
      </div>
      {showSettings ? (
        <div className="app-body">
          <SettingsPage onClose={() => navigate('/loadouts')} />
        </div>
      ) : showFavourites ? (
        <div className="app-body">
          <FavouritesPage onClose={() => navigate('/loadouts')} />
        </div>
      ) : showShares ? (
        <div className="app-body">
          <ManageSharesPage onClose={() => navigate('/loadouts')} />
        </div>
      ) : showHelp ? (
        <div className="app-body">
          <HelpPage onClose={() => navigate('/loadouts')} />
        </div>
      ) : (
        <SidebarActionsProvider
          selectedLoadoutId={selectedLoadoutId}
          selectedFolderId={selectedFolderId}
          onLoadoutSelect={handleLoadoutSelect}
          onFolderSelect={handleFolderSelect}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onCreateLoadout={handleCreateLoadout}
          onDeleteLoadout={handleDeleteLoadout}
          onRenameLoadout={handleRenameLoadout}
          onMoveLoadout={handleMoveLoadout}
          onMoveFolder={handleMoveFolder}
          onQuickExport={handleQuickExport}
        >
          <div className="app-body">
            <Sidebar
              folderTree={folderTree}
              onCreateLoadout={() => handleCreateLoadout(selectedFolderId ?? folderTree?.id ?? 0)}
              onViewShare={handleViewShare}
              viewingShareToken={viewingShareToken}
              onQuickExportShare={handleQuickExportShare}
            />
            <div className="main-content">
              {renderMainContent()}
            </div>
          </div>
        </SidebarActionsProvider>
      )}
      {folderModal && folderModal.type === 'create' && (
        <TextInputModal
          title="New Folder"
          label="Folder name"
          placeholder="Enter folder name"
          submitText="Create"
          onSubmit={handleCreateFolderSubmit}
          onCancel={() => setFolderModal(null)}
        />
      )}
      {folderModal && folderModal.type === 'rename' && (
        <TextInputModal
          title="Rename Folder"
          label="Folder name"
          placeholder="Enter folder name"
          initialValue={folderModal.currentName}
          submitText="Rename"
          onSubmit={handleRenameFolderSubmit}
          onCancel={() => setFolderModal(null)}
        />
      )}
    </div>
  )
}

export default App
