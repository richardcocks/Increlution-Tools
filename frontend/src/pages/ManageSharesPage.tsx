import { useState, useEffect } from 'react';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import type { UserShare } from '../types/models';
import './ManageSharesPage.css';

interface ManageSharesPageProps {
  onClose: () => void;
}

export function ManageSharesPage({ onClose }: ManageSharesPageProps) {
  const [shares, setShares] = useState<UserShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRevokeId, setPendingRevokeId] = useState<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const loadShares = async () => {
      try {
        const data = await api.getAllShares();
        setShares(data);
      } catch (err) {
        console.error('Error loading shares:', err);
        showToast('Failed to load shares', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadShares();
  }, [showToast]);

  const handleCopyLink = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy link', 'error');
    }
  };

  const handleRevokeClick = (shareId: number) => {
    setPendingRevokeId(shareId);
  };

  const handleRevokeCancel = () => {
    setPendingRevokeId(null);
  };

  const handleRevokeConfirm = async (shareId: number) => {
    try {
      await api.revokeShare(shareId);
      setShares(shares.filter(s => s.id !== shareId));
      setPendingRevokeId(null);
      showToast('Share link revoked', 'success');
    } catch (err) {
      console.error('Error revoking share:', err);
      showToast('Failed to revoke share', 'error');
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
        {shares.length === 0 ? (
          <div className="no-shares">
            <i className="fas fa-share-alt" />
            <p>You haven't shared any loadouts yet.</p>
            <p className="hint">Open a loadout and click the Share button to create a share link.</p>
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
                {shares.map(share => (
                  pendingRevokeId === share.id ? (
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
                          onClick={() => handleRevokeConfirm(share.id)}
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
                          onClick={() => handleCopyLink(share.shareToken)}
                          title="Copy share link"
                        >
                          <i className="fas fa-copy" />
                        </button>
                        <button
                          className="share-action-btn revoke-btn"
                          onClick={() => handleRevokeClick(share.id)}
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
        )}
      </div>
    </div>
  );
}
