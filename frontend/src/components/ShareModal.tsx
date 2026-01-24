import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { LoadoutShare } from '../types/models';
import { useToast } from './Toast';
import './ShareModal.css';

interface ShareModalProps {
  loadoutId: number;
  loadoutName: string;
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

export function ShareModal({ loadoutId, loadoutName, onClose }: ShareModalProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('create');
  const [shares, setShares] = useState<LoadoutShare[]>([]);
  const [loading, setLoading] = useState(false);

  // Create form state
  const [expiresInHours, setExpiresInHours] = useState<number | null>(null); // Default never
  const [showAttribution, setShowAttribution] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedShareId, setCopiedShareId] = useState<number | null>(null);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getLoadoutShares(loadoutId);
      setShares(result);
    } catch (err) {
      console.error('Failed to fetch shares:', err);
      showToast('Failed to load shares', 'error');
    } finally {
      setLoading(false);
    }
  }, [loadoutId, showToast]);

  useEffect(() => {
    if (activeTab === 'manage') {
      fetchShares();
    }
  }, [activeTab, fetchShares]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const share = await api.createShare(loadoutId, {
        expiresInHours,
        showAttribution,
      });
      const link = `${window.location.origin}/share/${share.shareToken}`;
      setGeneratedLink(link);
      showToast('Share link created', 'success');
    } catch (err) {
      console.error('Failed to create share:', err);
      showToast('Failed to create share link', 'error');
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
      await api.revokeShare(shareId);
      setShares(prev => prev.filter(s => s.id !== shareId));
      showToast('Share link revoked', 'success');
    } catch (err) {
      console.error('Failed to revoke share:', err);
      showToast('Failed to revoke share link', 'error');
    }
  };

  const handleCopyExisting = async (share: LoadoutShare) => {
    const link = `${window.location.origin}/share/${share.shareToken}`;
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

  const isExpired = (share: LoadoutShare) => {
    if (!share.expiresAt) return false;
    return new Date(share.expiresAt) < new Date();
  };

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={e => e.stopPropagation()}>
        <div className="share-modal-header">
          <h2>Share "{loadoutName}"</h2>
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
                  <p>No active share links</p>
                </div>
              ) : (
                shares.map(share => (
                  <div key={share.id} className="share-item">
                    <div className="share-item-header">
                      <span className="share-item-token">{share.shareToken}</span>
                      <div className="share-item-actions">
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
