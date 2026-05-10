import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FolderTreeNode, LoadoutSummary, SharedFolder, SharedFolderLoadout } from '../types/models';
import { useApi } from '../contexts/ApiContext';
import { useGameData } from '../contexts/GameDataContext';
import { useToast } from './Toast';
import { ReadOnlyLoadoutDisplay } from './ReadOnlyLoadoutDisplay';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { LinkContext } from './MarkdownRenderer';
import { ReadmeEditor } from './ReadmeEditor';
import { hasGuestData } from '../services/guestMigration';
import { normalizeLoadoutData } from '../utils/loadoutData';
import './FolderView.css';
import './EmbeddedSharedLoadout.css';
import './EmbeddedSharedFolder.css';
import './AnonymousSharedView.css';

// Mirrors backend AppLimits.MaxFolderReadmeLength.
const MAX_README_LENGTH = 16384;

// =====================================================================
// Public types
// =====================================================================

interface OwnerProps {
  mode: 'owner';
  folder: FolderTreeNode;
  breadcrumb: string[];
  isRootFolder: boolean;
  isEffectivelyReadOnly: boolean;
  prefix: string;                     // '/loadouts' or '/guest'
  startEditing?: boolean;
  onStartEditingConsumed?: () => void;
  onRenameFolder: (name: string) => void;
  onCreateFolder: () => void;
  onCreateLoadout: () => void;
  onSelectLoadout: (loadoutId: number) => void;
  onUpdateReadme: (readme: string | null) => Promise<void>;
  onDuplicateFolder: () => void;
  onDeleteFolder: () => void;
  onShareFolder: () => void;
  onToggleReadOnly: () => void;
  hideShare?: boolean;
}

interface SharedProps {
  mode: 'embedded' | 'anonymous';
  shareToken: string;
  selectedLoadoutId?: number | null;
  onClose?: () => void;
}

export type FolderViewProps = OwnerProps | SharedProps;

// =====================================================================
// Main entry
// =====================================================================

export function FolderView(props: FolderViewProps) {
  if (props.mode === 'owner') return <OwnerView {...props} />;
  return <SharedView {...props} />;
}

// =====================================================================
// Owner mode
// =====================================================================

function OwnerView(props: OwnerProps) {
  const linkContext: LinkContext = useMemo(
    () => ({ kind: 'owner', prefix: props.prefix }),
    [props.prefix],
  );

  return (
    <div className="folder-view">
      <OwnerHeader
        folder={props.folder}
        breadcrumb={props.breadcrumb}
        isRootFolder={props.isRootFolder}
        isEffectivelyReadOnly={props.isEffectivelyReadOnly}
        startEditing={props.startEditing}
        onStartEditingConsumed={props.onStartEditingConsumed}
        onRenameFolder={props.onRenameFolder}
      />
      <FolderActions
        folder={props.folder}
        isRootFolder={props.isRootFolder}
        isEffectivelyReadOnly={props.isEffectivelyReadOnly}
        hideShare={props.hideShare}
        onCreateFolder={props.onCreateFolder}
        onCreateLoadout={props.onCreateLoadout}
        onShareFolder={props.onShareFolder}
        onDuplicateFolder={props.onDuplicateFolder}
        onDeleteFolder={props.onDeleteFolder}
        onToggleReadOnly={props.onToggleReadOnly}
      />
      <FolderReadme
        readme={props.folder.readme}
        canEdit={!props.isEffectivelyReadOnly}
        linkContext={linkContext}
        onSave={props.onUpdateReadme}
      />
      <div className="folder-view-content">
        {props.folder.loadouts.length === 0 ? (
          <div className="folder-view-empty">
            <i className="fas fa-file-alt" />
            <p>No loadouts in this folder</p>
            <p className="hint">Click "New Loadout" to create one</p>
          </div>
        ) : (
          <FolderLoadoutCards loadouts={props.folder.loadouts} onSelect={props.onSelectLoadout} />
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Shared mode (embedded + anonymous)
// =====================================================================

function SharedView({ mode, shareToken, selectedLoadoutId, onClose }: SharedProps) {
  const { api, isGuest } = useApi();
  const { actions, loading: gameDataLoading } = useGameData();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [sharedFolder, setSharedFolder] = useState<SharedFolder | null>(null);
  const [selectedLoadout, setSelectedLoadout] = useState<SharedFolderLoadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadoutLoading, setLoadoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  // Fetch shared folder tree
  useEffect(() => {
    let cancelled = false;
    const fetchSharedFolder = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getSharedFolder(shareToken);
        if (cancelled) return;
        setSharedFolder(data);
        setExpandedFolders(new Set([data.folderTree.id]));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load shared folder');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchSharedFolder();
    return () => { cancelled = true; };
  }, [shareToken, api]);

  // Expand the tree to reveal the selected loadout when it changes
  useEffect(() => {
    if (!sharedFolder) return;
    const root = sharedFolder.folderTree;
    if (!selectedLoadoutId) {
      setExpandedFolders(new Set([root.id]));
      return;
    }
    const findAncestors = (node: FolderTreeNode, path: number[]): number[] | null => {
      if (node.loadouts.some(l => l.id === selectedLoadoutId)) return [...path, node.id];
      for (const sub of node.subFolders) {
        const result = findAncestors(sub, [...path, node.id]);
        if (result) return result;
      }
      return null;
    };
    const ancestors = findAncestors(root, []);
    setExpandedFolders(new Set(ancestors ?? [root.id]));
  }, [selectedLoadoutId, sharedFolder]);

  // Fetch the selected loadout
  useEffect(() => {
    let cancelled = false;
    const fetchLoadout = async () => {
      if (!selectedLoadoutId) {
        setSelectedLoadout(null);
        return;
      }
      setLoadoutLoading(true);
      try {
        const data = await api.getSharedFolderLoadout(shareToken, selectedLoadoutId);
        if (!cancelled) setSelectedLoadout(data);
      } catch (err) {
        if (cancelled) return;
        showToast(err instanceof Error ? err.message : 'Failed to load loadout', 'error');
        setSelectedLoadout(null);
      } finally {
        if (!cancelled) setLoadoutLoading(false);
      }
    };
    fetchLoadout();
    return () => { cancelled = true; };
  }, [shareToken, selectedLoadoutId, api, showToast]);

  const allChapters = useMemo(() => new Set(actions.map(a => a.chapter)), [actions]);

  const handleLoadoutClick = useCallback((loadoutId: number) => {
    if (mode === 'embedded') {
      navigate(isGuest
        ? `/guest/shared/folder/${shareToken}/${loadoutId}`
        : `/share/folder/${shareToken}/${loadoutId}`);
    } else {
      navigate(`/share/folder/${shareToken}/${loadoutId}`);
    }
  }, [mode, isGuest, shareToken, navigate]);

  const handleExportClipboard = useCallback(async () => {
    if (!selectedLoadout) return;
    try {
      const json = JSON.stringify(normalizeLoadoutData(selectedLoadout.data));
      await navigator.clipboard.writeText(json);
      showToast('Copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  }, [selectedLoadout, showToast]);

  const toggleFolder = useCallback((folderId: number) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const linkContext: LinkContext = useMemo(
    () => ({ kind: 'share', folderToken: shareToken }),
    [shareToken],
  );

  const isGuestUser = hasGuestData();
  const guestShareUrl = selectedLoadoutId
    ? `/guest/shared/folder/${shareToken}/${selectedLoadoutId}`
    : `/guest/shared/folder/${shareToken}`;
  const handleSignIn = () => {
    sessionStorage.setItem('share_return_url', window.location.pathname);
  };

  // Loading state
  if (loading || gameDataLoading) {
    return wrapAnonymous(mode, isGuestUser, guestShareUrl, handleSignIn,
      <div className="embedded-shared-loading">
        <i className="fas fa-spinner fa-spin" />
        <p>Loading shared folder...</p>
      </div>,
    );
  }

  // Error / not-found state
  if (error || !sharedFolder) {
    return wrapAnonymous(mode, isGuestUser, guestShareUrl, handleSignIn,
      <div className="embedded-shared-error">
        <i className={`fas fa-${error ? 'exclamation-circle' : 'question-circle'}`} />
        <h2>{error ? 'Unable to Load' : 'Not Found'}</h2>
        <p>{error || "This share link doesn't exist or has been removed."}</p>
        {mode === 'embedded' ? (
          <button className="embedded-shared-back" onClick={onClose}>
            <i className="fas fa-arrow-left" /> Go Back
          </button>
        ) : (
          <Link to="/" className="embedded-shared-back">
            <i className="fas fa-home" /> Go Home
          </Link>
        )}
      </div>,
    );
  }

  const folderTree = sharedFolder.folderTree;

  const content = (
    <div className="folder-view folder-view-shared">
      <SharedHeader
        folder={folderTree}
        ownerName={sharedFolder.ownerName}
        updatedAt={sharedFolder.updatedAt}
        mode={mode}
        onClose={onClose}
      />
      <FolderReadme
        readme={folderTree.readme}
        canEdit={false}
        linkContext={linkContext}
        onSave={() => Promise.resolve()}
      />
      <div className="embedded-folder-body">
        <div className="embedded-folder-sidebar">
          <div className="embedded-folder-sidebar-title">Contents</div>
          <div className="embedded-folder-tree">
            <SharedTree
              node={folderTree}
              level={0}
              expandedFolders={expandedFolders}
              onToggleFolder={toggleFolder}
              selectedLoadoutId={selectedLoadoutId ?? null}
              onLoadoutClick={handleLoadoutClick}
            />
          </div>
        </div>
        <div className="embedded-folder-content">
          {!selectedLoadout && !loadoutLoading && (
            <div className="embedded-folder-empty">
              <i className="fas fa-hand-pointer" />
              <h2>Select a Loadout</h2>
              <p>Click on a loadout in the folder tree to view its contents.</p>
            </div>
          )}
          {loadoutLoading && (
            <div className="embedded-folder-loadout-loading">
              <i className="fas fa-spinner fa-spin" />
              <p>Loading loadout...</p>
            </div>
          )}
          {selectedLoadout && !loadoutLoading && (
            <>
              <div className="embedded-loadout-header">
                <div className="embedded-loadout-title">
                  <h2>{selectedLoadout.name}</h2>
                  <span className="embedded-loadout-updated">
                    <i className="fas fa-clock" />
                    Updated {new Date(selectedLoadout.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="embedded-action-button secondary"
                  onClick={handleExportClipboard}
                  title="Copy loadout data to paste into Increlution"
                >
                  <i className="fas fa-copy" /> Copy for Game
                </button>
              </div>
              <ReadOnlyLoadoutDisplay
                loadoutData={selectedLoadout.data}
                onExportClipboard={handleExportClipboard}
                {...(mode === 'anonymous' ? { unlockedChaptersOverride: allChapters } : {})}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );

  return wrapAnonymous(mode, isGuestUser, guestShareUrl, handleSignIn, content);
}

// =====================================================================
// Subcomponents
// =====================================================================

interface OwnerHeaderProps {
  folder: FolderTreeNode;
  breadcrumb: string[];
  isRootFolder: boolean;
  isEffectivelyReadOnly: boolean;
  startEditing?: boolean;
  onStartEditingConsumed?: () => void;
  onRenameFolder: (name: string) => void;
}

function OwnerHeader({
  folder, breadcrumb, isRootFolder, isEffectivelyReadOnly,
  startEditing, onStartEditingConsumed, onRenameFolder,
}: OwnerHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const editStartedAtRef = useRef<number>(0);

  useEffect(() => {
    if (startEditing) {
      // Intentional: syncing prop signal to local editing state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditedName(folder.name);
      setIsEditing(true);
      editStartedAtRef.current = Date.now();
      onStartEditingConsumed?.();
    }
  }, [startEditing, onStartEditingConsumed, folder.name]);

  const handleStartEdit = () => {
    if (!isRootFolder && !isEffectivelyReadOnly) {
      setEditedName(folder.name);
      setIsEditing(true);
      editStartedAtRef.current = Date.now();
    }
  };

  const handleSave = () => {
    // Ignore blur events that fire immediately after entering edit mode
    // (e.g. when triggered programmatically via shift-click in sidebar).
    if (Date.now() - editStartedAtRef.current < 100) return;
    const trimmed = editedName.trim();
    if (trimmed && trimmed !== folder.name) onRenameFolder(trimmed);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') setIsEditing(false);
  };

  return (
    <div className="folder-view-header">
      {breadcrumb.length > 1 && (
        <div className="folder-view-breadcrumb">
          {breadcrumb.slice(0, -1).map((segment, i) => (
            <span key={i}>
              {i > 0 && <i className="fas fa-chevron-right breadcrumb-separator" />}
              <span className="breadcrumb-segment">{segment}</span>
            </span>
          ))}
        </div>
      )}
      <div className="folder-view-title-row">
        <i className={`fas ${isEffectivelyReadOnly ? 'fa-lock' : 'fa-folder'} folder-view-icon`} />
        {isEditing ? (
          <input
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            autoFocus
            className="folder-view-name-input"
          />
        ) : (
          <h1
            className={`folder-view-title ${!isRootFolder && !isEffectivelyReadOnly ? 'editable' : ''}`}
            onClick={handleStartEdit}
          >
            {folder.name}
            {!isRootFolder && !isEffectivelyReadOnly && <i className="fas fa-edit folder-view-edit-icon" />}
          </h1>
        )}
      </div>
    </div>
  );
}

interface SharedHeaderProps {
  folder: FolderTreeNode;
  ownerName: string | null;
  updatedAt: string;
  mode: 'embedded' | 'anonymous';
  onClose?: () => void;
}

function SharedHeader({ folder, ownerName, updatedAt, mode, onClose }: SharedHeaderProps) {
  return (
    <div className="folder-view-header folder-view-shared-header">
      <div className="folder-view-title-row">
        {mode === 'embedded' && onClose && (
          <button className="embedded-shared-back" onClick={onClose} title="Back">
            <i className="fas fa-arrow-left" />
          </button>
        )}
        <i className="fas fa-folder folder-view-icon" />
        <h1 className="folder-view-title">{folder.name}</h1>
        <span className="embedded-shared-badge">Shared Folder</span>
      </div>
      <div className="folder-view-shared-meta">
        {ownerName && (
          <span className="embedded-shared-owner">
            <i className="fas fa-user" /> Shared by {ownerName}
          </span>
        )}
        <span>
          <i className="fas fa-clock" /> Updated {new Date(updatedAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

interface FolderActionsProps {
  folder: FolderTreeNode;
  isRootFolder: boolean;
  isEffectivelyReadOnly: boolean;
  hideShare?: boolean;
  onCreateFolder: () => void;
  onCreateLoadout: () => void;
  onShareFolder: () => void;
  onDuplicateFolder: () => void;
  onDeleteFolder: () => void;
  onToggleReadOnly: () => void;
}

function FolderActions({
  folder, isRootFolder, isEffectivelyReadOnly, hideShare,
  onCreateFolder, onCreateLoadout, onShareFolder,
  onDuplicateFolder, onDeleteFolder, onToggleReadOnly,
}: FolderActionsProps) {
  return (
    <div className="folder-view-actions">
      <button
        className={`folder-view-action-btn secondary ${folder.isReadOnly ? 'folder-view-action-btn-active' : ''}`}
        onClick={onToggleReadOnly}
        title={folder.isReadOnly ? 'Make this folder editable' : 'Make this folder read-only'}
      >
        <i className={`fas ${folder.isReadOnly ? 'fa-unlock' : 'fa-lock'}`} />
        {folder.isReadOnly ? 'Set Writeable' : 'Set Readonly'}
      </button>
      <button className="folder-view-action-btn" onClick={onCreateLoadout} disabled={isEffectivelyReadOnly}>
        <i className="fas fa-file-medical" /> New Loadout
      </button>
      <button className="folder-view-action-btn secondary" onClick={onCreateFolder} disabled={isEffectivelyReadOnly}>
        <i className="fas fa-folder-plus" /> New Folder
      </button>
      {!isRootFolder && (
        <>
          {!hideShare && (
            <button className="folder-view-action-btn secondary" onClick={onShareFolder}>
              <i className="fas fa-share-alt" /> Share
            </button>
          )}
          <button className="folder-view-action-btn secondary" onClick={onDuplicateFolder} disabled={isEffectivelyReadOnly}>
            <i className="fas fa-copy" /> Duplicate
          </button>
          <button className="folder-view-action-btn danger" onClick={onDeleteFolder} disabled={isEffectivelyReadOnly}>
            <i className="fas fa-trash" /> Delete
          </button>
        </>
      )}
    </div>
  );
}

interface FolderReadmeProps {
  readme: string | null;
  canEdit: boolean;
  linkContext: LinkContext;
  onSave: (value: string | null) => Promise<void>;
}

function FolderReadme({ readme, canEdit, linkContext, onSave }: FolderReadmeProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ReadmeEditor
        initialValue={readme}
        maxLength={MAX_README_LENGTH}
        linkContext={linkContext}
        onSave={async (v) => {
          await onSave(v);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  if (!readme && !canEdit) return null;

  return (
    <div className="folder-readme">
      {readme ? (
        <MarkdownRenderer source={readme} linkContext={linkContext} />
      ) : (
        <p className="folder-readme-empty">No description yet.</p>
      )}
      {canEdit && (
        <button
          className="folder-view-action-btn secondary folder-readme-edit-btn"
          onClick={() => setEditing(true)}
        >
          <i className="fas fa-pen-to-square" /> {readme ? 'Edit Readme' : 'Add Readme'}
        </button>
      )}
    </div>
  );
}

interface FolderLoadoutCardsProps {
  loadouts: LoadoutSummary[];
  onSelect: (loadoutId: number) => void;
}

function FolderLoadoutCards({ loadouts, onSelect }: FolderLoadoutCardsProps) {
  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <>
      <h2 className="folder-view-section-title">Loadouts ({loadouts.length})</h2>
      <div className="folder-view-loadouts">
        {loadouts.map(loadout => (
          <div
            key={loadout.id}
            className="folder-view-loadout-card"
            onClick={() => onSelect(loadout.id)}
          >
            <div className="loadout-card-icon"><i className="fas fa-file-alt" /></div>
            <div className="loadout-card-info">
              <span className="loadout-card-name">{loadout.name}</span>
              <span className="loadout-card-date">Updated {formatDate(loadout.updatedAt)}</span>
            </div>
            {loadout.isProtected && (
              <i className="fas fa-lock loadout-card-protected" title="Protected" />
            )}
            <i className="fas fa-chevron-right loadout-card-arrow" />
          </div>
        ))}
      </div>
    </>
  );
}

interface SharedTreeProps {
  node: FolderTreeNode;
  level: number;
  expandedFolders: Set<number>;
  onToggleFolder: (id: number) => void;
  selectedLoadoutId: number | null;
  onLoadoutClick: (id: number) => void;
}

function SharedTree({ node, level, expandedFolders, onToggleFolder, selectedLoadoutId, onLoadoutClick }: SharedTreeProps) {
  const isExpanded = expandedFolders.has(node.id);
  const hasChildren = node.subFolders.length > 0 || node.loadouts.length > 0;

  return (
    <div className="embedded-folder-tree-item">
      <div
        className="embedded-folder-tree-header"
        style={{ paddingLeft: `${level * 16}px` }}
        onClick={() => onToggleFolder(node.id)}
      >
        {hasChildren ? (
          <button className="expand-btn" onClick={(e) => { e.stopPropagation(); onToggleFolder(node.id); }}>
            <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'}`} />
          </button>
        ) : (
          <span className="expand-placeholder" />
        )}
        <i className="fas fa-folder folder-icon" />
        <span className="folder-name">{node.name}</span>
      </div>
      {isExpanded && (
        <div className="embedded-folder-tree-children">
          {node.subFolders.map(sub => (
            <SharedTree
              key={sub.id}
              node={sub}
              level={level + 1}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              selectedLoadoutId={selectedLoadoutId}
              onLoadoutClick={onLoadoutClick}
            />
          ))}
          {node.loadouts.map(loadout => (
            <div
              key={loadout.id}
              className={`embedded-folder-loadout-item ${selectedLoadoutId === loadout.id ? 'selected' : ''}`}
              style={{ paddingLeft: `${(level + 1) * 16 + 24}px` }}
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

// =====================================================================
// Helpers
// =====================================================================

function wrapAnonymous(
  mode: 'embedded' | 'anonymous',
  isGuestUser: boolean,
  guestShareUrl: string,
  handleSignIn: () => void,
  content: React.ReactNode,
): React.ReactElement {
  if (mode !== 'anonymous') return <>{content}</>;
  return (
    <div className="anonymous-shared-view">
      <div className="anonymous-shared-header-bar">
        <Link to="/" className="anonymous-shared-home-link">
          Loadout Manager for Increlution
        </Link>
        <div className="anonymous-shared-auth-actions">
          <Link to={guestShareUrl} className="anonymous-auth-button guest">
            <i className="fas fa-user" />
            {isGuestUser ? 'Continue as Guest' : 'Try as Guest'}
          </Link>
          <Link to="/login" className="anonymous-auth-button discord" onClick={handleSignIn}>
            <i className="fab fa-discord" />
            Sign In
          </Link>
        </div>
      </div>
      {content}
    </div>
  );
}
