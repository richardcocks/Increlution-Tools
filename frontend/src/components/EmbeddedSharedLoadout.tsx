import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApi } from '../contexts/ApiContext';
import type { LoadoutData } from '../types/models';
import { normalizeLoadoutData } from '../utils/loadoutData';
import { useSavedShares } from '../contexts/SavedSharesContext';
import { useGameData } from '../contexts/GameDataContext';
import { useToast } from './Toast';
import { ReadOnlyLoadoutDisplay } from './ReadOnlyLoadoutDisplay';
import './EmbeddedSharedLoadout.css';

type SharedLoadoutSource =
  | { type: 'loadout-share'; token: string }
  | { type: 'folder-share'; folderToken: string; loadoutId: number };

interface EmbeddedSharedLoadoutProps {
  source: SharedLoadoutSource;
  onClose: () => void;
}

interface LoadoutInfo {
  name: string;
  data: LoadoutData;
  updatedAt: string;
  ownerName?: string | null;
}

export function EmbeddedSharedLoadout({ source, onClose }: EmbeddedSharedLoadoutProps) {
  const { api } = useApi();
  const { saveLoadoutShare, savedShares } = useSavedShares();
  const { showToast } = useToast();
  const { loading: gameDataLoading } = useGameData();

  const [loadout, setLoadout] = useState<LoadoutInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sourceKey = source.type === 'loadout-share'
    ? source.token
    : `${source.folderToken}/${source.loadoutId}`;

  useEffect(() => {
    const fetchLoadout = async () => {
      setLoading(true);
      setError(null);
      try {
        if (source.type === 'loadout-share') {
          const data = await api.getSharedLoadout(source.token);
          setLoadout(data);
        } else {
          const data = await api.getSharedFolderLoadout(source.folderToken, source.loadoutId);
          setLoadout(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared loadout');
      } finally {
        setLoading(false);
      }
    };

    fetchLoadout();
  }, [sourceKey, api]);

  const isLoadoutShare = source.type === 'loadout-share';

  const isSaved = useMemo(() => {
    if (!isLoadoutShare) return false;
    return savedShares.some(s => s.shareToken === source.token);
  }, [savedShares, source, isLoadoutShare]);

  const handleSave = async () => {
    if (!isLoadoutShare) return;
    setSaving(true);
    try {
      await saveLoadoutShare(source.token);
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

  if (loading || gameDataLoading) {
    return (
      <div className="embedded-shared-loading">
        <i className="fas fa-spinner fa-spin" />
        <p>Loading shared loadout...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="embedded-shared-error">
        <i className="fas fa-exclamation-circle" />
        <h2>Unable to Load</h2>
        <p>{error}</p>
        <button className="embedded-shared-back" onClick={onClose}>
          <i className="fas fa-arrow-left" />
          Go Back
        </button>
      </div>
    );
  }

  if (!loadout) {
    return (
      <div className="embedded-shared-error">
        <i className="fas fa-question-circle" />
        <h2>Not Found</h2>
        <p>This share link doesn't exist or has been removed.</p>
        <button className="embedded-shared-back" onClick={onClose}>
          <i className="fas fa-arrow-left" />
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="embedded-shared-loadout">
      <div className="embedded-shared-header">
        <div className="embedded-shared-title-row">
          <button className="embedded-shared-back" onClick={onClose}>
            <i className="fas fa-arrow-left" />
          </button>
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
          {isLoadoutShare && (
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
      />
    </div>
  );
}
