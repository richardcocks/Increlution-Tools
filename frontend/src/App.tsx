import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import LoadoutEditor from './components/LoadoutEditor'
import type { LoadoutEditorHandle } from './components/LoadoutEditor'
import { Sidebar } from './components/Sidebar'
import { useToast } from './components/Toast'
import { DeleteConfirmation } from './components/DeleteConfirmation'
import { EmbeddedSharedLoadout } from './components/EmbeddedSharedLoadout'
import { EmbeddedSharedFolder } from './components/EmbeddedSharedFolder'
import { EmbeddedSharedFolderLoadout } from './components/EmbeddedSharedFolderLoadout'
import { TextInputModal } from './components/TextInputModal'
import { FolderView } from './components/FolderView'
import { ShareModal } from './components/ShareModal'
import { useAuth } from './contexts/AuthContext'
import { useSettings } from './contexts/SettingsContext'
import { useTheme } from './contexts/ThemeContext'
import { useGameData } from './contexts/GameDataContext'
import { SidebarActionsProvider } from './contexts/SidebarActionsContext'
import { useApi } from './contexts/ApiContext'
import type { FolderTreeNode } from './types/models'
import { ActionType } from './types/models'
import { makeSkillActionKey } from './types/settings'
import { filterLoadoutByChapters, normalizeLoadoutData } from './utils/loadoutData'
import { buildEffectiveReadOnlyMap } from './utils/folderUtils'
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

type ShareModalState =
  | { type: 'folder'; folderId: number; folderName: string }
  | null;

type ViewingSharedFolder = {
  token: string;
  loadoutId: number | null;
} | null;

function App() {
  const [folderTree, setFolderTree] = useState<FolderTreeNode | null>(null)
  const [selectedLoadoutId, setSelectedLoadoutId] = useState<number | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [viewingShareToken, setViewingShareToken] = useState<string | null>(null)
  const [viewingSharedFolder, setViewingSharedFolder] = useState<ViewingSharedFolder>(null)
  const [renamingFolderId, setRenamingFolderId] = useState<number | null>(null)
  const pendingRenameLoadoutRef = useRef(false)
  const [folderModal, setFolderModal] = useState<FolderModal>(null)
  const [shareModalState, setShareModalState] = useState<ShareModalState>(null)
  const { showToast } = useToast()
  const { api, isGuest } = useApi()
  const { user, logout } = useAuth()
  const { unlockedChaptersSet, settings, updateSettings, loading: settingsLoading } = useSettings()
  const { themePreference, effectiveTheme, cycleTheme } = useTheme()
  const { actions, skills, loading: gameDataLoading } = useGameData()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{
    token?: string
    folderId?: string
    loadoutId?: string
    folderToken?: string
  }>()
  const prefix = isGuest ? '/guest' : '/loadouts'
  const loadoutEditorRef = useRef<LoadoutEditorHandle>(null)

  // Poll to trigger rename after loadout editor finishes loading
  useEffect(() => {
    if (!pendingRenameLoadoutRef.current) return
    const interval = setInterval(() => {
      if (loadoutEditorRef.current?.startEditingName()) {
        pendingRenameLoadoutRef.current = false
        clearInterval(interval)
      }
    }, 50)
    return () => clearInterval(interval)
  }, [selectedLoadoutId])

  // Initialize default skill priorities on startup if not yet initialized
  useEffect(() => {
    if (gameDataLoading || settingsLoading) return
    const skillIds = Object.keys(skills)
    if (skillIds.length === 0) return

    const existingKeys = Object.keys(settings.defaultSkillPriorities)
    const hasOldFormat = existingKeys.length > 0 && existingKeys.some(key => !key.includes('-'))

    if (hasOldFormat || !settings.skillPrioritiesInitialized) {
      const defaultPriorities: Record<string, number> = {}
      const actionTypes = [ActionType.Jobs, ActionType.Construction, ActionType.Exploration]
      skillIds.forEach(id => {
        actionTypes.forEach(type => {
          defaultPriorities[makeSkillActionKey(Number(id), type)] = 2
        })
      })
      updateSettings({ defaultSkillPriorities: defaultPriorities, skillPrioritiesInitialized: true })
    }
  }, [skills, gameDataLoading, settingsLoading, settings.skillPrioritiesInitialized, settings.defaultSkillPriorities, updateSettings])

  // Derive page state from URL
  const showSettings = location.pathname === '/settings' || location.pathname === '/guest/settings'
  const showFavourites = location.pathname === '/favourites' || location.pathname === '/guest/favourites'
  const showShares = location.pathname === '/shares'
  const showHelp = location.pathname === '/help' || location.pathname === '/guest/help'

  const fetchFolderTree = async () => {
    try {
      const tree = await api.getFolderTree()
      setFolderTree(tree)
      return tree
    } catch (err) {
      console.error('Error fetching folder tree:', err)
      return null
    } finally {
      setLoading(false)
    }
  }

  // Compute effective read-only map from folder tree
  const effectiveReadOnlyMap = useMemo(() => buildEffectiveReadOnlyMap(folderTree), [folderTree])

  // Initial fetch of folder tree
  useEffect(() => {
    fetchFolderTree()
  }, [])

  // Sync URL params to state (handles initial load, back/forward, and direct URL access)
  // Note: We intentionally omit state variables from deps to prevent infinite loops.
  // The effect should only run when URL params change, not when state changes.
  // State comparisons inside the effect prevent redundant updates.
  useEffect(() => {
    if (!folderTree) return
    if (showSettings || showFavourites || showShares || showHelp) return

    const urlFolderId = params.folderId ? parseInt(params.folderId, 10) : null
    const urlLoadoutId = params.loadoutId ? parseInt(params.loadoutId, 10) : null

    // Handle NaN for numeric params
    if ((params.folderId && isNaN(urlFolderId!)) || (params.loadoutId && isNaN(urlLoadoutId!))) {
      navigate(prefix, { replace: true })
      return
    }

    // Handle shared loadout: /loadouts/shared/:token
    if (params.token) {
      if (viewingShareToken !== params.token) {
        setViewingShareToken(params.token)
        setViewingSharedFolder(null)
        setSelectedLoadoutId(null)
        setSelectedFolderId(null)
        setPendingDelete(null)
      }
      return
    }

    // Handle shared folder: /loadouts/shared/folder/:folderToken or /loadouts/shared/folder/:folderToken/:loadoutId
    if (params.folderToken) {
      const sharedLoadoutId = urlLoadoutId
      const currentState = viewingSharedFolder

      if (!currentState || currentState.token !== params.folderToken || currentState.loadoutId !== sharedLoadoutId) {
        setViewingSharedFolder({ token: params.folderToken, loadoutId: sharedLoadoutId })
        setViewingShareToken(null)
        setSelectedLoadoutId(null)
        setSelectedFolderId(null)
        setPendingDelete(null)
      }
      return
    }

    // Clear shared state when viewing own content
    if (viewingShareToken || viewingSharedFolder) {
      setViewingShareToken(null)
      setViewingSharedFolder(null)
    }

    // Handle own loadout: /loadouts/loadout/:loadoutId
    if (urlLoadoutId) {
      const { folder, loadout } = findLoadoutInTree(folderTree, urlLoadoutId)
      if (loadout && folder) {
        if (selectedLoadoutId !== urlLoadoutId) {
          setSelectedLoadoutId(urlLoadoutId)
          setSelectedFolderId(folder.id)
        }
      } else {
        showToast('Loadout not found', 'error')
        navigate(prefix, { replace: true })
      }
      return
    }

    // Handle own folder: /loadouts/folder/:folderId
    if (urlFolderId) {
      const folder = findFolderById(folderTree, urlFolderId)
      if (folder) {
        if (selectedFolderId !== urlFolderId || selectedLoadoutId !== null) {
          setSelectedFolderId(urlFolderId)
          setSelectedLoadoutId(null)
        }
      } else {
        showToast('Folder not found', 'error')
        navigate(prefix, { replace: true })
      }
      return
    }

    // No params in URL (/loadouts) - select root folder
    if (selectedFolderId !== folderTree.id || selectedLoadoutId !== null) {
      setSelectedFolderId(folderTree.id)
      setSelectedLoadoutId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token, params.folderToken, params.folderId, params.loadoutId, folderTree, showSettings, showFavourites, showShares, showHelp])

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

  const confirmDeleteFolder = async (folderId: number, force = false) => {
    try {
      // Find the parent folder before deleting
      const folderToDelete = folderTree ? findFolderById(folderTree, folderId) : null
      const parentId = folderToDelete?.parentId

      const result = await api.deleteFolder(folderId, force)

      // Navigate to parent folder after deletion
      if (selectedFolderId === folderId) {
        if (parentId && folderTree && parentId !== folderTree.id) {
          navigate(`${prefix}/folder/${parentId}`)
        } else {
          navigate(prefix)
        }
      }
      await fetchFolderTree()

      // Build toast message
      const parts: string[] = []
      if (result.foldersDeleted > 0) {
        parts.push(`${result.foldersDeleted} folder${result.foldersDeleted !== 1 ? 's' : ''}`)
      }
      if (result.loadoutsDeleted > 0) {
        parts.push(`${result.loadoutsDeleted} loadout${result.loadoutsDeleted !== 1 ? 's' : ''}`)
      }
      let message = parts.length > 0 ? `Deleted ${parts.join(' and ')}` : 'Folder deleted'
      if (result.protectedLoadoutsMoved > 0) {
        message += `. ${result.protectedLoadoutsMoved} protected loadout${result.protectedLoadoutsMoved !== 1 ? 's' : ''} moved to parent folder`
      }
      showToast(message, 'success')
    } catch (err) {
      console.error('Error deleting folder:', err)
      showToast('Failed to delete folder', 'error')
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

  const reorderInTree = (tree: FolderTreeNode, folderId: number, itemType: 'folder' | 'loadout', orderedIds: number[]): FolderTreeNode => {
    if (tree.id === folderId) {
      if (itemType === 'folder') {
        const reordered = orderedIds.map(id => tree.subFolders.find(f => f.id === id)!).filter(Boolean);
        return { ...tree, subFolders: reordered };
      } else {
        const reordered = orderedIds.map(id => tree.loadouts.find(l => l.id === id)!).filter(Boolean);
        return { ...tree, loadouts: reordered };
      }
    }
    return {
      ...tree,
      subFolders: tree.subFolders.map(sub => reorderInTree(sub, folderId, itemType, orderedIds))
    };
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

  // Helper to find a loadout and its parent folder by loadout ID
  const findLoadoutInTree = (
    tree: FolderTreeNode,
    loadoutId: number
  ): { folder: FolderTreeNode | null; loadout: { id: number; name: string } | null } => {
    const loadout = tree.loadouts.find(l => l.id === loadoutId)
    if (loadout) return { folder: tree, loadout }
    for (const sub of tree.subFolders) {
      const result = findLoadoutInTree(sub, loadoutId)
      if (result.loadout) return result
    }
    return { folder: null, loadout: null }
  }

  const handleCreateLoadout = async (folderId: number) => {
    setPendingDelete(null)
    try {
      const loadout = await api.createLoadout('Loadout', folderId)
      // Optimistically add to tree
      setFolderTree(prev => prev ? addLoadoutToTree(prev, folderId, {
        id: loadout.id,
        name: loadout.name,
        updatedAt: loadout.updatedAt,
        isProtected: loadout.isProtected
      }) : prev)
      // Navigate to the new loadout
      navigate(`${prefix}/loadout/${loadout.id}`)
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
      // Navigate to parent folder after deletion
      if (selectedLoadoutId === loadoutId) {
        if (selectedFolderId && folderTree && selectedFolderId !== folderTree.id) {
          navigate(`${prefix}/folder/${selectedFolderId}`)
        } else {
          navigate(prefix)
        }
      }
      await fetchFolderTree()
    } catch (err) {
      console.error('Error deleting loadout:', err)
      showToast('Failed to delete loadout', 'error')
    }
  }

  const handleConfirmDeleteFolder = (force: boolean) => {
    if (!pendingDelete || pendingDelete.type !== 'folder') return
    confirmDeleteFolder(pendingDelete.id, force)
    setPendingDelete(null)
  }

  const handleConfirmDeleteLoadout = () => {
    if (!pendingDelete || pendingDelete.type !== 'loadout') return
    confirmDeleteLoadout(pendingDelete.id)
    setPendingDelete(null)
  }

  const handleFolderSelect = (folderId: number) => {
    setPendingDelete(null)
    // Navigate to URL - state will sync from URL sync effect
    if (folderTree && folderId === folderTree.id) {
      navigate(prefix)
    } else {
      navigate(`${prefix}/folder/${folderId}`)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleLoadoutSelect = (loadoutId: number, _folderId: number) => {
    setPendingDelete(null)
    // Navigate to URL - state will sync from URL sync effect
    navigate(`${prefix}/loadout/${loadoutId}`)
  }

  const handleViewShare = (token: string, shareType: 'loadout' | 'folder' = 'loadout') => {
    setPendingDelete(null)
    // Navigate to URL - state will sync from URL sync effect
    if (shareType === 'folder') {
      navigate(`${prefix}/shared/folder/${token}`)
    } else {
      navigate(`${prefix}/shared/${token}`)
    }
  }

  const handleViewSharedFolderLoadout = (folderToken: string, loadoutId: number) => {
    setPendingDelete(null)
    // Navigate to URL - state will sync from URL sync effect
    navigate(`${prefix}/shared/folder/${folderToken}/${loadoutId}`)
  }

  const handleCloseShare = () => {
    navigate(prefix)
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

  const handleDuplicateLoadout = async (loadoutId: number) => {
    try {
      const result = await api.duplicateLoadout(loadoutId)
      // Optimistically add to tree
      setFolderTree(prev => prev ? addLoadoutToTree(prev, result.folderId, {
        id: result.id,
        name: result.name,
        updatedAt: result.updatedAt,
        isProtected: result.isProtected
      }) : prev)
      // Navigate to the new duplicate
      navigate(`${prefix}/loadout/${result.id}`)
      showToast('Loadout duplicated', 'success')
    } catch (err) {
      console.error('Error duplicating loadout:', err)
      showToast(err instanceof Error ? err.message : 'Failed to duplicate loadout', 'error')
    }
  }

  const handleDuplicateFolder = async (folderId: number) => {
    try {
      const result = await api.duplicateFolder(folderId)
      // Refresh tree to get the new folder structure
      await fetchFolderTree()
      // Navigate to the new duplicate
      navigate(`${prefix}/folder/${result.id}`)
      showToast(`Duplicated ${result.totalFoldersCopied} folder${result.totalFoldersCopied !== 1 ? 's' : ''} and ${result.totalLoadoutsCopied} loadout${result.totalLoadoutsCopied !== 1 ? 's' : ''}`, 'success')
    } catch (err) {
      console.error('Error duplicating folder:', err)
      showToast(err instanceof Error ? err.message : 'Failed to duplicate folder', 'error')
    }
  }

  const handleToggleFolderReadOnly = async (folderId: number) => {
    const currentFolder = folderTree ? findFolderById(folderTree, folderId) : null
    if (!currentFolder) return

    const newValue = !currentFolder.isReadOnly

    // Optimistic update
    const previousTree = folderTree
    const updateReadOnly = (tree: FolderTreeNode, targetId: number, value: boolean): FolderTreeNode => {
      if (tree.id === targetId) {
        return { ...tree, isReadOnly: value }
      }
      return { ...tree, subFolders: tree.subFolders.map(sub => updateReadOnly(sub, targetId, value)) }
    }
    setFolderTree(prev => prev ? updateReadOnly(prev, folderId, newValue) : prev)

    try {
      await api.setFolderReadOnly(folderId, newValue)
    } catch (err) {
      console.error('Error toggling folder read-only:', err)
      showToast('Failed to update folder read-only setting', 'error')
      setFolderTree(previousTree)
    }
  }

  const handleMoveToPosition = useCallback(async (
    itemType: 'folder' | 'loadout',
    itemId: number,
    sourceFolderId: number,
    targetFolderId: number,
    orderedIds: number[]
  ) => {
    const previousTree = folderTree;
    const isSameFolder = sourceFolderId === targetFolderId;

    if (isSameFolder) {
      // Same folder: just reorder
      setFolderTree(prev => {
        if (!prev) return prev;
        return reorderInTree(prev, targetFolderId, itemType, orderedIds);
      });

      try {
        await api.reorderItems(targetFolderId, itemType, orderedIds);
      } catch (err) {
        console.error('Error reordering:', err);
        showToast('Failed to reorder items', 'error');
        setFolderTree(previousTree);
      }
    } else {
      // Different folder: move then reorder
      // Optimistic update: move item, then apply ordering
      setFolderTree(prev => {
        if (!prev) return prev;
        let updated: FolderTreeNode;
        if (itemType === 'loadout') {
          updated = moveLoadoutInTree(prev, itemId, sourceFolderId, targetFolderId);
        } else {
          updated = moveFolderInTree(prev, itemId, sourceFolderId, targetFolderId);
        }
        return reorderInTree(updated, targetFolderId, itemType, orderedIds);
      });

      if (selectedLoadoutId === itemId && itemType === 'loadout') {
        setSelectedFolderId(targetFolderId);
      }

      try {
        if (itemType === 'loadout') {
          await api.moveLoadout(itemId, targetFolderId);
        } else {
          await api.moveFolder(itemId, targetFolderId);
        }
        await api.reorderItems(targetFolderId, itemType, orderedIds);
      } catch (err) {
        console.error('Error moving to position:', err);
        showToast('Failed to move item', 'error');
        // Refetch server state to ensure consistency, since the move
        // may have succeeded while the reorder failed
        await fetchFolderTree();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderTree, selectedLoadoutId, showToast, api]);

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
  }, [actions, unlockedChaptersSet, showToast, api])

  // Quick export shared loadout to clipboard (middle-click on sidebar)
  const handleQuickExportShare = useCallback(async (token: string) => {
    try {
      const sharedLoadout = await api.getSharedLoadout(token)
      const jsonString = JSON.stringify(normalizeLoadoutData(sharedLoadout.data))
      await navigator.clipboard.writeText(jsonString)
      showToast('Copied to clipboard!', 'success')
    } catch (err) {
      console.error('Error exporting to clipboard:', err)
      showToast('Failed to copy to clipboard', 'error')
    }
  }, [showToast, api])

  // Quick export shared folder loadout to clipboard (middle-click on sidebar)
  const handleQuickExportSharedFolderLoadout = useCallback(async (folderToken: string, loadoutId: number) => {
    try {
      const loadout = await api.getSharedFolderLoadout(folderToken, loadoutId)
      const jsonString = JSON.stringify(normalizeLoadoutData(loadout.data))
      await navigator.clipboard.writeText(jsonString)
      showToast('Copied to clipboard!', 'success')
    } catch (err) {
      console.error('Error exporting to clipboard:', err)
      showToast('Failed to copy to clipboard', 'error')
    }
  }, [showToast, api])

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

    if (viewingSharedFolder) {
      if (viewingSharedFolder.loadoutId) {
        return (
          <EmbeddedSharedFolderLoadout
            folderToken={viewingSharedFolder.token}
            loadoutId={viewingSharedFolder.loadoutId}
            onClose={() => navigate(`${prefix}/shared/folder/${viewingSharedFolder.token}`)}
          />
        );
      } else {
        return (
          <EmbeddedSharedFolder
            token={viewingSharedFolder.token}
            onClose={handleCloseShare}
          />
        );
      }
    }

    if (pendingDelete && folderTree) {
      if (pendingDelete.type === 'folder') {
        return (
          <DeleteConfirmation
            type="folder"
            folderId={pendingDelete.id}
            folderTree={folderTree}
            onConfirm={handleConfirmDeleteFolder}
            onCancel={() => setPendingDelete(null)}
          />
        );
      } else {
        return (
          <DeleteConfirmation
            type="loadout"
            loadoutId={pendingDelete.id}
            folderTree={folderTree}
            onConfirm={handleConfirmDeleteLoadout}
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
            isEffectivelyReadOnly={effectiveReadOnlyMap.get(selectedFolderId) ?? false}
            startEditing={renamingFolderId === selectedFolderId}
            onStartEditingConsumed={() => setRenamingFolderId(null)}
            onRenameFolder={(name) => doRenameFolder(selectedFolderId, name)}
            onCreateFolder={() => handleCreateFolder(selectedFolderId)}
            onCreateLoadout={() => handleCreateLoadout(selectedFolderId)}
            onSelectLoadout={(loadoutId) => handleLoadoutSelect(loadoutId, selectedFolderId)}
            onDuplicateFolder={() => handleDuplicateFolder(selectedFolderId)}
            onDeleteFolder={() => handleDeleteFolder(selectedFolderId)}
            onShareFolder={() => setShareModalState({ type: 'folder', folderId: selectedFolderId, folderName: currentFolder.name })}
            onToggleReadOnly={() => handleToggleFolderReadOnly(selectedFolderId)}
            hideShare={isGuest}
          />
        );
      }
    }

    return (
      <LoadoutEditor
        ref={loadoutEditorRef}
        loadoutId={selectedLoadoutId}
        folderBreadcrumb={folderBreadcrumb}
        isFolderReadOnly={selectedFolderId ? (effectiveReadOnlyMap.get(selectedFolderId) ?? false) : false}
        onNameChange={handleLoadoutNameChange}
        onProtectionChange={handleLoadoutProtectionChange}
        onCreateLoadout={() => handleCreateLoadout(selectedFolderId ?? folderTree?.id ?? 0)}
        onDuplicate={() => selectedLoadoutId && handleDuplicateLoadout(selectedLoadoutId)}
        onDelete={() => selectedLoadoutId && handleDeleteLoadout(selectedLoadoutId)}
        hideShare={isGuest}
      />
    );
  };

  return (
    <div className="app">
      <div className="app-header">
        <Link to={prefix} className="app-title">Loadout Manager for Increlution</Link>
        <div className="user-info">
          {!isGuest && <span className="user-email">{user?.username}</span>}
          <button className="help-button" onClick={() => { setPendingDelete(null); navigate(isGuest ? '/guest/help' : '/help'); }} title="Help">
            <i className="fas fa-question-circle" />
          </button>
          <button className="favourites-button" onClick={() => { setPendingDelete(null); navigate(isGuest ? '/guest/favourites' : '/favourites'); }} title="Favourites">
            <i className="fas fa-star" />
          </button>
          {!isGuest && (
            <button className="shares-button" onClick={() => { setPendingDelete(null); navigate('/shares'); }} title="Manage Shares">
              <i className="fas fa-share-alt" />
            </button>
          )}
          <button className="settings-button" onClick={() => { setPendingDelete(null); navigate(isGuest ? '/guest/settings' : '/settings'); }} title="Settings">
            <i className="fas fa-cog" />
          </button>
          <button
            className="theme-toggle-button"
            onClick={cycleTheme}
            title={`Theme: ${themePreference} (currently ${effectiveTheme})`}
          >
            {themePreference === 'system' ? (
              <span className="theme-icon-system">
                <i className="fas fa-sun" />
                <i className="fas fa-moon" />
              </span>
            ) : (
              <i className={`fas ${effectiveTheme === 'dark' ? 'fa-moon' : 'fa-sun'}`} />
            )}
          </button>
          {isGuest ? (
            <Link to="/login" className="logout-button">
              <i className="fas fa-sign-in-alt" />
              Sign In
            </Link>
          ) : (
            <button className="logout-button" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt" />
              Logout
            </button>
          )}
        </div>
      </div>
      {isGuest && (
        <div className="guest-banner">
          Editing as guest -- data saved to this browser only.{' '}
          <Link to="/login">Sign in with Discord</Link> to sync across devices.
        </div>
      )}
      {showSettings ? (
        <div className="app-body">
          <SettingsPage onClose={() => navigate(prefix)} />
        </div>
      ) : showFavourites ? (
        <div className="app-body">
          <FavouritesPage onClose={() => navigate(prefix)} />
        </div>
      ) : showShares ? (
        <div className="app-body">
          <ManageSharesPage onClose={() => navigate(prefix)} />
        </div>
      ) : showHelp ? (
        <div className="app-body">
          <HelpPage onClose={() => navigate(prefix)} />
        </div>
      ) : (
        <SidebarActionsProvider
          selectedLoadoutId={selectedLoadoutId}
          selectedFolderId={selectedFolderId}
          onLoadoutSelect={handleLoadoutSelect}
          onFolderSelect={handleFolderSelect}
          onMoveLoadout={handleMoveLoadout}
          onMoveFolder={handleMoveFolder}
          onQuickExport={handleQuickExport}
          onMoveToPosition={handleMoveToPosition}
          onStartRenameFolder={(folderId) => setRenamingFolderId(folderId)}
          onStartRenameLoadout={(loadoutId, folderId) => {
            if (loadoutId === selectedLoadoutId) {
              loadoutEditorRef.current?.startEditingName()
            } else {
              pendingRenameLoadoutRef.current = true
              handleLoadoutSelect(loadoutId, folderId)
            }
          }}
        >
          <div className="app-body">
            <Sidebar
              folderTree={folderTree}
              effectiveReadOnlyMap={effectiveReadOnlyMap}
              onCreateLoadout={() => handleCreateLoadout(selectedFolderId ?? folderTree?.id ?? 0)}
              onViewShare={handleViewShare}
              viewingShareToken={viewingShareToken}
              viewingSharedFolder={viewingSharedFolder}
              onQuickExportShare={handleQuickExportShare}
              onQuickExportSharedFolderLoadout={handleQuickExportSharedFolderLoadout}
              onViewSharedFolderLoadout={handleViewSharedFolderLoadout}
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
      {shareModalState && (
        <ShareModal
          itemType="folder"
          itemId={shareModalState.folderId}
          itemName={shareModalState.folderName}
          onClose={() => setShareModalState(null)}
        />
      )}
    </div>
  )
}

export default App
