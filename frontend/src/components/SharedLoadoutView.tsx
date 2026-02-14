import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../contexts/ApiContext';
import type { LoadoutData } from '../types/models';
import { normalizeLoadoutData } from '../utils/loadoutData';
import { useSavedShares } from '../contexts/SavedSharesContext';
import { useGameData } from '../contexts/GameDataContext';
import { useToast } from './Toast';
import { ReadOnlyLoadoutDisplay } from './ReadOnlyLoadoutDisplay';
import { hasGuestData } from '../services/guestMigration';
import './EmbeddedSharedLoadout.css';
import './AnonymousSharedView.css';

interface SharedLoadoutViewProps {
  token: string;
  mode: 'embedded' | 'anonymous';
  onClose?: () => void;
}

interface LoadoutInfo {
  name: string;
  data: LoadoutData;
  updatedAt: string;
  ownerName?: string | null;
}

export function SharedLoadoutView({ token, mode, onClose }: SharedLoadoutViewProps) {
  const { api } = useApi();
  const { saveLoadoutShare, savedShares } = useSavedShares();
  const { showToast } = useToast();
  const { actions, loading: gameDataLoading } = useGameData();

  const [loadout, setLoadout] = useState<LoadoutInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchLoadout = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getSharedLoadout(token);
        setLoadout(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared loadout');
      } finally {
        setLoading(false);
      }
    };

    fetchLoadout();
  }, [token, api]);

  const isSaved = useMemo(() => {
    return savedShares.some(s => s.shareToken === token);
  }, [savedShares, token]);

  const allChapters = useMemo(() => {
    return new Set(actions.map(a => a.chapter));
  }, [actions]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveLoadoutShare(token);
      showToast('Saved to your collection!', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportClipboard = useCallback(async () => {
    if (!loadout) return;
    try {
      const jsonString = JSON.stringify(normalizeLoadoutData(loadout.data));
      await navigator.clipboard.writeText(jsonString);
      showToast('Copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy to clipboard', 'error');
    }
  }, [loadout, showToast]);

  const handleSignIn = () => {
    sessionStorage.setItem('share_return_url', window.location.pathname);
  };

  const isGuestUser = hasGuestData();
  const guestShareUrl = `/guest/shared/${token}`;

  // Loading state
  if (loading || gameDataLoading) {
    const loadingContent = (
      <div className="embedded-shared-loading">
        <i className="fas fa-spinner fa-spin" />
        <p>Loading shared loadout...</p>
      </div>
    );
    if (mode === 'anonymous') {
      return <div className="anonymous-shared-view">{loadingContent}</div>;
    }
    return loadingContent;
  }

  // Error state
  if (error) {
    const errorContent = (
      <div className="embedded-shared-error">
        <i className="fas fa-exclamation-circle" />
        <h2>Unable to Load</h2>
        <p>{error}</p>
        {mode === 'embedded' ? (
          <button className="embedded-shared-back" onClick={onClose}>
            <i className="fas fa-arrow-left" />
            Go Back
          </button>
        ) : (
          <Link to="/" className="embedded-shared-back">
            <i className="fas fa-home" />
            Go Home
          </Link>
        )}
      </div>
    );
    if (mode === 'anonymous') {
      return <div className="anonymous-shared-view">{errorContent}</div>;
    }
    return errorContent;
  }

  // Not found state
  if (!loadout) {
    const notFoundContent = (
      <div className="embedded-shared-error">
        <i className="fas fa-question-circle" />
        <h2>Not Found</h2>
        <p>This share link doesn't exist or has been removed.</p>
        {mode === 'embedded' ? (
          <button className="embedded-shared-back" onClick={onClose}>
            <i className="fas fa-arrow-left" />
            Go Back
          </button>
        ) : (
          <Link to="/" className="embedded-shared-back">
            <i className="fas fa-home" />
            Go Home
          </Link>
        )}
      </div>
    );
    if (mode === 'anonymous') {
      return <div className="anonymous-shared-view">{notFoundContent}</div>;
    }
    return notFoundContent;
  }

  // Main content
  const content = (
    <div className="embedded-shared-loadout">
      <div className="embedded-shared-header">
        <div className="embedded-shared-title-row">
          {mode === 'embedded' && (
            <button className="embedded-shared-back" onClick={onClose}>
              <i className="fas fa-arrow-left" />
            </button>
          )}
          <div className="embedded-shared-title">
            <h1>{loadout.name}</h1>
            <span className="embedded-shared-badge">Shared Loadout</span>
          </div>
        </div>
        <div className="embedded-shared-meta">
          {loadout.ownerName && (
            <span className="embedded-shared-owner">
              <i className="fas fa-user" />
              Shared by {loadout.ownerName}
            </span>
          )}
          <span>
            <i className="fas fa-clock" />
            Updated {new Date(loadout.updatedAt).toLocaleDateString()}
          </span>
        </div>
        <div className="embedded-shared-actions">
          {mode === 'embedded' && (
            <button
              className="embedded-action-button primary"
              onClick={handleSave}
              disabled={saving || isSaved}
            >
              {saving ? (
                <>
                  <i className="fas fa-spinner fa-spin" />
                  Saving...
                </>
              ) : isSaved ? (
                <>
                  <i className="fas fa-check" />
                  Saved
                </>
              ) : (
                <>
                  <i className="fas fa-bookmark" />
                  Save to Collection
                </>
              )}
            </button>
          )}
          <button
            className="embedded-action-button secondary"
            onClick={handleExportClipboard}
            title="Copy loadout data to paste into Increlution"
          >
            <i className="fas fa-copy" />
            Copy for Game
          </button>
        </div>
      </div>

      <ReadOnlyLoadoutDisplay
        loadoutData={loadout.data}
        onExportClipboard={handleExportClipboard}
        {...(mode === 'anonymous' ? { unlockedChaptersOverride: allChapters } : {})}
      />
    </div>
  );

  if (mode === 'anonymous') {
    return (
      <div className="anonymous-shared-view">
        <div className="anonymous-shared-header-bar">
          <Link to="/" className="anonymous-shared-home-link">
            Loadout Manager for Increlution
          </Link>
          <div className="anonymous-shared-auth-actions">
            <Link
              to={guestShareUrl}
              className="anonymous-auth-button guest"
            >
              <i className="fas fa-user" />
              {isGuestUser ? 'Continue as Guest' : 'Try as Guest'}
            </Link>
            <Link
              to="/login"
              className="anonymous-auth-button discord"
              onClick={handleSignIn}
            >
              <i className="fab fa-discord" />
              Sign In
            </Link>
          </div>
        </div>
        {content}
      </div>
    );
  }

  return content;
}
