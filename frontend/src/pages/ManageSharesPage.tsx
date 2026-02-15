import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import type { UserShare, UserFolderShare } from '../types/models';
import './ManageSharesPage.css';

interface ManageSharesPageProps {
  onClose: () => void;
}

type TabType = 'loadouts' | 'folders';

export function ManageSharesPage({ onClose }: ManageSharesPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>('loadouts');
  const [loadoutShares, setLoadoutShares] = useState<UserShare[]>([]);
  const [folderShares, setFolderShares] = useState<UserFolderShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRevokeId, setPendingRevokeId] = useState<number | null>(null);
  const [pendingRevokeType, setPendingRevokeType] = useState<'loadout' | 'folder' | null>(null);
  const [editingTokenId, setEditingTokenId] = useState<number | null>(null);
  const [editTokenValue, setEditTokenValue] = useState('');
  const [editTokenError, setEditTokenError] = useState<string | null>(null);
  const [editTokenLoading, setEditTokenLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    const loadShares = async () => {
      try {
        const [loadouts, folders] = await Promise.all([
          api.getAllShares(),
          api.getAllFolderShares()
        ]);
        setLoadoutShares(loadouts);
        setFolderShares(folders);
      } catch (err) {
        console.error('Error loading shares:', err);
        showToast('Failed to load shares', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadShares();
  }, [showToast]);

  const handleCopyLink = async (token: string, type: 'loadout' | 'folder') => {
    const path = type === 'loadout' ? `/share/${token}` : `/share/folder/${token}`;
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy link', 'error');
    }
  };

  const handleRevokeClick = (shareId: number, type: 'loadout' | 'folder') => {
    setPendingRevokeId(shareId);
    setPendingRevokeType(type);
  };

  const handleRevokeCancel = () => {
    setPendingRevokeId(null);
    setPendingRevokeType(null);
  };

  const handleRevokeConfirm = async (shareId: number, type: 'loadout' | 'folder') => {
    try {
      if (type === 'loadout') {
        await api.revokeShare(shareId);
        setLoadoutShares(loadoutShares.filter(s => s.id !== shareId));
      } else {
        await api.revokeFolderShare(shareId);
        setFolderShares(folderShares.filter(s => s.id !== shareId));
      }
      setPendingRevokeId(null);
      setPendingRevokeType(null);
      showToast('Share link revoked', 'success');
    } catch (err) {
      console.error('Error revoking share:', err);
      showToast('Failed to revoke share', 'error');
    }
  };

  const handleStartEditToken = (share: UserFolderShare) => {
    setEditingTokenId(share.id);
    setEditTokenValue(share.shareToken);
    setEditTokenError(null);
  };

  const handleCancelEditToken = () => {
    setEditingTokenId(null);
    setEditTokenValue('');
    setEditTokenError(null);
  };

  const handleSaveToken = async (shareId: number) => {
    setEditTokenLoading(true);
    setEditTokenError(null);
    try {
      const updated = await api.updateFolderShareToken(shareId, editTokenValue);
      setFolderShares(prev => prev.map(s => s.id === shareId ? { ...s, shareToken: updated.shareToken } : s));
      setEditingTokenId(null);
      setEditTokenValue('');
      showToast('Share token updated', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update token';
      setEditTokenError(message);
    } finally {
      setEditTokenLoading(false);
    }
  };

  const handleRegenerateToken = async (shareId: number) => {
    setEditTokenLoading(true);
    try {
      const updated = await api.regenerateFolderShareToken(shareId);
      setFolderShares(prev => prev.map(s => s.id === shareId ? { ...s, shareToken: updated.shareToken } : s));
      showToast('Token reverted to random', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate token';
      showToast(message, 'error');
    } finally {
      setEditTokenLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <div className="manage-shares-page">
        <div className="shares-header">
          <div className="shares-header-content">
            <button className="back-button" onClick={onClose}>
              <i className="fas fa-arrow-left" />
              Back
            </button>
            <h2>Manage Shares</h2>
          </div>
        </div>
        <div className="shares-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const totalShares = loadoutShares.length + folderShares.length;

  return (
    <div className="manage-shares-page">
      <div className="shares-header">
        <div className="shares-header-content">
          <button className="back-button" onClick={onClose}>
            <i className="fas fa-arrow-left" />
            Back
          </button>
          <h2>Manage Shares</h2>
        </div>
      </div>

      <div className="shares-tabs">
        <button
          className={`shares-tab ${activeTab === 'loadouts' ? 'active' : ''}`}
          onClick={() => setActiveTab('loadouts')}
        >
          <i className="fas fa-file-alt" />
          Loadouts ({loadoutShares.length})
        </button>
        <button
          className={`shares-tab ${activeTab === 'folders' ? 'active' : ''}`}
          onClick={() => setActiveTab('folders')}
        >
          <i className="fas fa-folder" />
          Folders ({folderShares.length})
        </button>
      </div>

      <div className="shares-content">
        {totalShares === 0 ? (
          <div className="no-shares">
            <i className="fas fa-share-alt" />
            <p>You haven't shared any loadouts or folders yet.</p>
            <p className="hint">Open a loadout or folder and click the Share button to create a share link.</p>
          </div>
        ) : activeTab === 'loadouts' ? (
          loadoutShares.length === 0 ? (
            <div className="no-shares">
              <i className="fas fa-file-alt" />
              <p>No shared loadouts</p>
              <p className="hint">Open a loadout and click the Share button to share it.</p>
            </div>
          ) : (
            <div className="shares-list">
              <div className="shares-table">
                <div className="shares-table-header">
                  <div className="share-col-loadout">Loadout</div>
                  <div className="share-col-created">Created</div>
                  <div className="share-col-expires">Expires</div>
                  <div className="share-col-attribution">Attribution</div>
                  <div className="share-col-actions">Actions</div>
                </div>
                <div className="shares-table-body">
                  {loadoutShares.map(share => (
                    pendingRevokeId === share.id && pendingRevokeType === 'loadout' ? (
                      <div key={share.id} className="share-row confirming">
                        <div className="share-confirm-message">
                          <i className="fas fa-exclamation-triangle" />
                          <span>Revoke share for <strong>{share.loadoutName}</strong>? Anyone with this link will no longer be able to view it.</span>
                        </div>
                        <div className="share-confirm-actions">
                          <button
                            className="share-confirm-cancel"
                            onClick={handleRevokeCancel}
                          >
                            Cancel
                          </button>
                          <button
                            className="share-confirm-revoke"
                            onClick={() => handleRevokeConfirm(share.id, 'loadout')}
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={share.id}
                        className={`share-row ${isExpired(share.expiresAt) ? 'expired' : ''}`}
                      >
                        <div className="share-col-loadout">
                          <i className="fas fa-file-alt share-loadout-icon" />
                          <span className="share-loadout-name">{share.loadoutName}</span>
                        </div>
                        <div className="share-col-created">
                          {formatDate(share.createdAt)}
                        </div>
                        <div className="share-col-expires">
                          {share.expiresAt ? (
                            isExpired(share.expiresAt) ? (
                              <span className="expired-text">Expired</span>
                            ) : (
                              formatDate(share.expiresAt)
                            )
                          ) : (
                            <span className="never-expires">Never</span>
                          )}
                        </div>
                        <div className="share-col-attribution">
                          {share.showAttribution ? (
                            <span className="attribution-on">
                              <i className="fas fa-user" /> Shown
                            </span>
                          ) : (
                            <span className="attribution-off">
                              <i className="fas fa-user-slash" /> Hidden
                            </span>
                          )}
                        </div>
                        <div className="share-col-actions">
                          <button
                            className="share-action-btn copy-btn"
                            onClick={() => handleCopyLink(share.shareToken, 'loadout')}
                            title="Copy share link"
                          >
                            <i className="fas fa-copy" />
                          </button>
                          <button
                            className="share-action-btn revoke-btn"
                            onClick={() => handleRevokeClick(share.id, 'loadout')}
                            title="Revoke share"
                          >
                            <i className="fas fa-trash" />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>
          )
        ) : (
          folderShares.length === 0 ? (
            <div className="no-shares">
              <i className="fas fa-folder" />
              <p>No shared folders</p>
              <p className="hint">Open a folder and click the Share button to share it.</p>
            </div>
          ) : (
            <div className="shares-list">
              <div className="shares-table shares-table-folders">
                <div className="shares-table-header">
                  <div className="share-col-loadout">Folder</div>
                  <div className="share-col-token">Token</div>
                  <div className="share-col-created">Created</div>
                  <div className="share-col-expires">Expires</div>
                  <div className="share-col-attribution">Attribution</div>
                  <div className="share-col-actions">Actions</div>
                </div>
                <div className="shares-table-body">
                  {folderShares.map(share => (
                    pendingRevokeId === share.id && pendingRevokeType === 'folder' ? (
                      <div key={share.id} className="share-row confirming">
                        <div className="share-confirm-message">
                          <i className="fas fa-exclamation-triangle" />
                          <span>Revoke share for <strong>{share.folderName}</strong>? Anyone with this link will no longer be able to view it or its contents.</span>
                        </div>
                        <div className="share-confirm-actions">
                          <button
                            className="share-confirm-cancel"
                            onClick={handleRevokeCancel}
                          >
                            Cancel
                          </button>
                          <button
                            className="share-confirm-revoke"
                            onClick={() => handleRevokeConfirm(share.id, 'folder')}
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={share.id}
                        className={`share-row ${isExpired(share.expiresAt) ? 'expired' : ''}`}
                      >
                        <div className="share-col-loadout">
                          <i className="fas fa-folder share-loadout-icon folder-icon" />
                          <span className="share-loadout-name">{share.folderName}</span>
                        </div>
                        <div className="share-col-token">
                          {editingTokenId === share.id ? (
                            <div className="token-edit-inline">
                              <input
                                type="text"
                                className="token-edit-input"
                                value={editTokenValue}
                                onChange={e => {
                                  setEditTokenValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                                  setEditTokenError(null);
                                }}
                                maxLength={32}
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveToken(share.id);
                                  if (e.key === 'Escape') handleCancelEditToken();
                                }}
                              />
                              <div className="token-edit-buttons">
                                <button
                                  className="token-edit-save"
                                  onClick={() => handleSaveToken(share.id)}
                                  disabled={editTokenLoading || editTokenValue === share.shareToken}
                                  title="Save"
                                >
                                  <i className={`fas ${editTokenLoading ? 'fa-spinner fa-spin' : 'fa-check'}`} />
                                </button>
                                <button
                                  className="token-edit-cancel"
                                  onClick={handleCancelEditToken}
                                  disabled={editTokenLoading}
                                  title="Cancel"
                                >
                                  <i className="fas fa-times" />
                                </button>
                              </div>
                              {editTokenError && (
                                <div className="token-edit-error">{editTokenError}</div>
                              )}
                            </div>
                          ) : (
                            <div className="token-display">
                              <span className="token-value">{share.shareToken}</span>
                              <button
                                className="token-edit-btn"
                                onClick={() => handleStartEditToken(share)}
                                title="Edit token"
                              >
                                <i className="fas fa-pen" />
                              </button>
                              <button
                                className="token-revert-btn"
                                onClick={() => handleRegenerateToken(share.id)}
                                disabled={editTokenLoading}
                                title="Revert to random token"
                              >
                                <i className={`fas ${editTokenLoading ? 'fa-spinner fa-spin' : 'fa-random'}`} />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="share-col-created">
                          {formatDate(share.createdAt)}
                        </div>
                        <div className="share-col-expires">
                          {share.expiresAt ? (
                            isExpired(share.expiresAt) ? (
                              <span className="expired-text">Expired</span>
                            ) : (
                              formatDate(share.expiresAt)
                            )
                          ) : (
                            <span className="never-expires">Never</span>
                          )}
                        </div>
                        <div className="share-col-attribution">
                          {share.showAttribution ? (
                            <span className="attribution-on">
                              <i className="fas fa-user" /> Shown
                            </span>
                          ) : (
                            <span className="attribution-off">
                              <i className="fas fa-user-slash" /> Hidden
                            </span>
                          )}
                        </div>
                        <div className="share-col-actions">
                          <button
                            className="share-action-btn copy-btn"
                            onClick={() => handleCopyLink(share.shareToken, 'folder')}
                            title="Copy share link"
                          >
                            <i className="fas fa-copy" />
                          </button>
                          <button
                            className="share-action-btn revoke-btn"
                            onClick={() => handleRevokeClick(share.id, 'folder')}
                            title="Revoke share"
                          >
                            <i className="fas fa-trash" />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
