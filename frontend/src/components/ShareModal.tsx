import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { LoadoutShare, FolderShare } from '../types/models';
import { useToast } from './Toast';
import './ShareModal.css';

type ShareType = 'loadout' | 'folder';

interface ShareModalProps {
  itemType: ShareType;
  itemId: number;
  itemName: string;
  onClose: () => void;
}

type TabType = 'create' | 'manage';

const EXPIRATION_OPTIONS = [
  { label: '1 hour', value: 1 },
  { label: '24 hours', value: 24 },
  { label: '7 days', value: 24 * 7 },
  { label: '30 days', value: 24 * 30 },
  { label: 'Never', value: null },
];

export function ShareModal({ itemType, itemId, itemName, onClose }: ShareModalProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('create');
  const [shares, setShares] = useState<(LoadoutShare | FolderShare)[]>([]);
  const [loading, setLoading] = useState(false);

  // Create form state
  const [expiresInHours, setExpiresInHours] = useState<number | null>(null); // Default never
  const [showAttribution, setShowAttribution] = useState(false);
  const [customToken, setCustomToken] = useState('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedShareId, setCopiedShareId] = useState<number | null>(null);

  // Manage tab - inline token editing state
  const [editingShareId, setEditingShareId] = useState<number | null>(null);
  const [editTokenValue, setEditTokenValue] = useState('');
  const [editTokenError, setEditTokenError] = useState<string | null>(null);
  const [editTokenLoading, setEditTokenLoading] = useState(false);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const result = itemType === 'loadout'
        ? await api.getLoadoutShares(itemId)
        : await api.getFolderShares(itemId);
      setShares(result);
    } catch (err) {
      console.error('Failed to fetch shares:', err);
      showToast('Failed to load shares', 'error');
    } finally {
      setLoading(false);
    }
  }, [itemId, itemType, showToast]);

  useEffect(() => {
    if (activeTab === 'manage') {
      fetchShares();
    }
  }, [activeTab, fetchShares]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const options = { expiresInHours, showAttribution, customToken: customToken || undefined };
      const share = itemType === 'loadout'
        ? await api.createShare(itemId, { expiresInHours, showAttribution })
        : await api.createFolderShare(itemId, options);

      const linkPath = itemType === 'loadout'
        ? `/share/${share.shareToken}`
        : `/share/folder/${share.shareToken}`;
      const link = `${window.location.origin}${linkPath}`;
      setGeneratedLink(link);
      setCustomToken('');
      showToast('Share link created', 'success');
    } catch (err) {
      console.error('Failed to create share:', err);
      const message = err instanceof Error ? err.message : 'Failed to create share link';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('Failed to copy to clipboard', 'error');
    }
  };

  const handleRevoke = async (shareId: number) => {
    try {
      if (itemType === 'loadout') {
        await api.revokeShare(shareId);
      } else {
        await api.revokeFolderShare(shareId);
      }
      setShares(prev => prev.filter(s => s.id !== shareId));
      showToast('Share link revoked', 'success');
    } catch (err) {
      console.error('Failed to revoke share:', err);
      showToast('Failed to revoke share link', 'error');
    }
  };

  const handleStartEdit = (share: LoadoutShare | FolderShare) => {
    setEditingShareId(share.id);
    setEditTokenValue(share.shareToken);
    setEditTokenError(null);
  };

  const handleCancelEdit = () => {
    setEditingShareId(null);
    setEditTokenValue('');
    setEditTokenError(null);
  };

  const handleSaveToken = async () => {
    if (editingShareId === null) return;
    setEditTokenLoading(true);
    setEditTokenError(null);
    try {
      const updated = await api.updateFolderShareToken(editingShareId, editTokenValue);
      setShares(prev => prev.map(s => s.id === editingShareId ? { ...s, shareToken: updated.shareToken } : s));
      setEditingShareId(null);
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
      setShares(prev => prev.map(s => s.id === shareId ? { ...s, shareToken: updated.shareToken } : s));
      showToast('Token reverted to random', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate token';
      showToast(message, 'error');
    } finally {
      setEditTokenLoading(false);
    }
  };

  const handleCopyExisting = async (share: LoadoutShare | FolderShare) => {
    const linkPath = itemType === 'loadout'
      ? `/share/${share.shareToken}`
      : `/share/folder/${share.shareToken}`;
    const link = `${window.location.origin}${linkPath}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedShareId(share.id);
      setTimeout(() => setCopiedShareId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('Failed to copy to clipboard', 'error');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const isExpired = (share: LoadoutShare | FolderShare) => {
    if (!share.expiresAt) return false;
    return new Date(share.expiresAt) < new Date();
  };

  const typeLabel = itemType === 'loadout' ? 'loadout' : 'folder';
  const typeIcon = itemType === 'loadout' ? 'fa-file-alt' : 'fa-folder';

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>
        <div className="share-modal-header">
          <h2>
            <i className={`fas ${typeIcon}`} style={{ marginRight: '8px' }} />
            Share "{itemName}"
          </h2>
          <button className="share-modal-close" onClick={onClose}>
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="share-modal-tabs">
          <button
            className={`share-modal-tab ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            Create Link
          </button>
          <button
            className={`share-modal-tab ${activeTab === 'manage' ? 'active' : ''}`}
            onClick={() => setActiveTab('manage')}
          >
            Manage Links
          </button>
        </div>

        <div className="share-modal-content">
          {activeTab === 'create' ? (
            <>
              {itemType === 'folder' && (
                <div className="share-info-banner">
                  <i className="fas fa-info-circle" />
                  <span>Sharing this folder will include all subfolders and loadouts within it.</span>
                </div>
              )}

              <div className="share-form-group">
                <label>Expires After</label>
                <select
                  value={expiresInHours === null ? 'never' : expiresInHours}
                  onChange={e => setExpiresInHours(e.target.value === 'never' ? null : parseInt(e.target.value))}
                >
                  {EXPIRATION_OPTIONS.map(opt => (
                    <option key={opt.label} value={opt.value === null ? 'never' : opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="share-form-group share-checkbox-group">
                <input
                  type="checkbox"
                  id="showAttribution"
                  checked={showAttribution}
                  onChange={e => setShowAttribution(e.target.checked)}
                />
                <label htmlFor="showAttribution">Show my username to viewers</label>
              </div>

              {itemType === 'folder' && (
                <div className="share-form-group">
                  <label>Custom URL (optional)</label>
                  <input
                    type="text"
                    className="share-custom-token-input"
                    placeholder="e.g. my-loadouts"
                    value={customToken}
                    onChange={e => setCustomToken(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    maxLength={32}
                  />
                  <div className="share-custom-token-hint">
                    {customToken
                      ? <>{window.location.origin}/share/folder/<strong>{customToken}</strong></>
                      : 'Leave empty for an auto-generated token. Use lowercase letters, numbers, and hyphens.'}
                  </div>
                </div>
              )}

              <button
                className="share-generate-button"
                onClick={handleCreate}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <i className="fas fa-link" />
                    Generate Share Link
                  </>
                )}
              </button>

              {generatedLink && (
                <div className="share-link-container">
                  <div className="share-link-header">
                    <i className="fas fa-check-circle" />
                    Share link created!
                  </div>
                  <div className="share-link-input-group">
                    <input
                      type="text"
                      className="share-link-input"
                      value={generatedLink}
                      readOnly
                    />
                    <button
                      className={`share-link-copy ${copied ? 'copied' : ''}`}
                      onClick={handleCopy}
                    >
                      <i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`} />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="shares-list">
              {loading ? (
                <p>Loading...</p>
              ) : shares.length === 0 ? (
                <div className="shares-empty">
                  <i className="fas fa-link" />
                  <p>No active share links for this {typeLabel}</p>
                </div>
              ) : (
                shares.map(share => (
                  <div key={share.id} className="share-item">
                    <div className="share-item-header">
                      {editingShareId === share.id ? (
                        <div className="share-item-edit-token">
                          <input
                            type="text"
                            className="share-edit-token-input"
                            value={editTokenValue}
                            onChange={e => {
                              setEditTokenValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                              setEditTokenError(null);
                            }}
                            maxLength={32}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveToken();
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                          />
                          <button
                            className="share-edit-token-save"
                            onClick={handleSaveToken}
                            disabled={editTokenLoading || editTokenValue === share.shareToken}
                          >
                            <i className={`fas ${editTokenLoading ? 'fa-spinner fa-spin' : 'fa-check'}`} />
                          </button>
                          <button
                            className="share-edit-token-cancel"
                            onClick={handleCancelEdit}
                            disabled={editTokenLoading}
                          >
                            <i className="fas fa-times" />
                          </button>
                        </div>
                      ) : (
                        <span className="share-item-token">{share.shareToken}</span>
                      )}
                      <div className="share-item-actions">
                        {itemType === 'folder' && editingShareId !== share.id && (
                          <>
                            <button
                              className="share-item-edit"
                              onClick={() => handleStartEdit(share)}
                            >
                              <i className="fas fa-pen" />
                              Edit
                            </button>
                            <button
                              className="share-item-revert"
                              onClick={() => handleRegenerateToken(share.id)}
                              disabled={editTokenLoading}
                              title="Revert to random token"
                            >
                              <i className={`fas ${editTokenLoading ? 'fa-spinner fa-spin' : 'fa-random'}`} />
                              Revert
                            </button>
                          </>
                        )}
                        <button
                          className={`share-item-copy ${copiedShareId === share.id ? 'copied' : ''}`}
                          onClick={() => handleCopyExisting(share)}
                        >
                          <i className={`fas ${copiedShareId === share.id ? 'fa-check' : 'fa-copy'}`} />
                          {copiedShareId === share.id ? 'Copied!' : 'Copy'}
                        </button>
                        <button
                          className="share-item-revoke"
                          onClick={() => handleRevoke(share.id)}
                        >
                          <i className="fas fa-trash" />
                          Revoke
                        </button>
                      </div>
                    </div>
                    {editingShareId === share.id && editTokenError && (
                      <div className="share-edit-token-error">{editTokenError}</div>
                    )}
                    <div className="share-item-stats">
                      <span className="share-item-stat">
                        <i className="fas fa-calendar" />
                        Created {formatDate(share.createdAt)}
                      </span>
                      <span className={`share-item-stat ${isExpired(share) ? 'expired' : ''}`}>
                        <i className="fas fa-clock" />
                        {share.expiresAt
                          ? isExpired(share)
                            ? 'Expired'
                            : `Expires ${formatDate(share.expiresAt)}`
                          : 'Never expires'}
                      </span>
                      <span className="share-item-stat">
                        <i className={`fas ${share.showAttribution ? 'fa-user' : 'fa-user-secret'}`} />
                        {share.showAttribution ? 'Attributed' : 'Anonymous'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
