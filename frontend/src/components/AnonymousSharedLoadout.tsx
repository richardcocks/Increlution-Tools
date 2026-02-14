import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import type { SharedLoadout } from '../types/models';
import { normalizeLoadoutData } from '../utils/loadoutData';
import { useGameData } from '../contexts/GameDataContext';
import { useToast } from './Toast';
import { ReadOnlyLoadoutDisplay } from './ReadOnlyLoadoutDisplay';
import { hasGuestData } from '../services/guestMigration';
import './EmbeddedSharedLoadout.css';
import './AnonymousSharedView.css';

interface AnonymousSharedLoadoutProps {
  token: string;
}

export function AnonymousSharedLoadout({ token }: AnonymousSharedLoadoutProps) {
  const { showToast } = useToast();
  const { actions, loading: gameDataLoading } = useGameData();

  const [loadout, setLoadout] = useState<SharedLoadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [token]);

  const allChapters = useMemo(() => {
    return new Set(actions.map(a => a.chapter));
  }, [actions]);

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

  if (loading || gameDataLoading) {
    return (
      <div className="anonymous-shared-view">
        <div className="embedded-shared-loading">
          <i className="fas fa-spinner fa-spin" />
          <p>Loading shared loadout...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="anonymous-shared-view">
        <div className="embedded-shared-error">
          <i className="fas fa-exclamation-circle" />
          <h2>Unable to Load</h2>
          <p>{error}</p>
          <Link to="/" className="embedded-shared-back">
            <i className="fas fa-home" />
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  if (!loadout) {
    return (
      <div className="anonymous-shared-view">
        <div className="embedded-shared-error">
          <i className="fas fa-question-circle" />
          <h2>Not Found</h2>
          <p>This share link doesn't exist or has been removed.</p>
          <Link to="/" className="embedded-shared-back">
            <i className="fas fa-home" />
            Go Home
          </Link>
        </div>
      </div>
    );
  }

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

      <div className="embedded-shared-loadout">
        <div className="embedded-shared-header">
          <div className="embedded-shared-title-row">
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
          unlockedChaptersOverride={allChapters}
        />
      </div>
    </div>
  );
}
