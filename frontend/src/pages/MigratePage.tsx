import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { api } from '../services/api';
import {
  readGuestData,
  countGuestItems,
  hasGuestSettings,
  migrateLoadouts,
  migrateSettings,
  clearGuestData,
} from '../services/guestMigration';
import type { MigrationProgress, MigrationResult } from '../services/guestMigration';
import type { GuestData } from '../services/guestApi';
import './MigratePage.css';

type Phase = 'choose' | 'confirm-discard' | 'migrating' | 'done' | 'error';

export function MigratePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { refetchSettings } = useSettings();
  const [phase, setPhase] = useState<Phase>('choose');
  const [guestData, setGuestData] = useState<GuestData | null>(null);
  const [importLoadoutsChecked, setImportLoadoutsChecked] = useState(true);
  const [importSettingsChecked, setImportSettingsChecked] = useState(true);
  const [progress, setProgress] = useState<MigrationProgress>({ phase: '', current: 0, total: 0 });
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const data = readGuestData();
    if (!data) {
      navigate('/loadouts', { replace: true });
      return;
    }
    // Intentional: loading localStorage data into state on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuestData(data);
  }, [navigate]);

  if (!guestData) return null;

  const counts = countGuestItems(guestData);
  const guestHasSettings = hasGuestSettings(guestData);
  const hasLoadouts = counts.folders > 0 || counts.loadouts > 0;
  const isFullImport =
    (!hasLoadouts || importLoadoutsChecked) &&
    (!guestHasSettings || importSettingsChecked);
  const isPartialImport =
    (importLoadoutsChecked && hasLoadouts) || (importSettingsChecked && guestHasSettings);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Build a description of what will be discarded
  const getDiscardDescription = (): string[] => {
    const discarded: string[] = [];
    if (hasLoadouts && !importLoadoutsChecked) {
      const parts: string[] = [];
      if (counts.loadouts > 0) parts.push(`${counts.loadouts} loadout${counts.loadouts !== 1 ? 's' : ''}`);
      if (counts.folders > 0) parts.push(`${counts.folders} folder${counts.folders !== 1 ? 's' : ''}`);
      discarded.push(parts.join(' and '));
    }
    if (guestHasSettings && !importSettingsChecked) {
      discarded.push('custom settings (unlocked chapters, favourites, skill priorities)');
    }
    return discarded;
  };

  const handleProceed = () => {
    if (isFullImport) {
      runMigration();
    } else {
      // Partial or no import -- confirm discard
      setPhase('confirm-discard');
    }
  };

  const handleConfirmDiscard = () => {
    if (isPartialImport) {
      runMigration();
    } else {
      // Nothing selected -- just clear and go
      clearGuestData();
      navigate('/loadouts', { replace: true });
    }
  };

  const runMigration = async () => {
    setPhase('migrating');
    setError(null);

    try {
      let foldersCreated = 0;
      let loadoutsImported = 0;
      let settingsMerged = false;

      if (importLoadoutsChecked && hasLoadouts) {
        setProgress({ phase: 'Preparing...', current: 0, total: counts.folders + counts.loadouts });
        const loadoutResult = await migrateLoadouts(api, guestData, setProgress);
        foldersCreated = loadoutResult.foldersCreated;
        loadoutsImported = loadoutResult.loadoutsImported;
      }

      if (importSettingsChecked && guestHasSettings) {
        setProgress(prev => ({ ...prev, phase: 'Merging settings...' }));
        await migrateSettings(api, guestData);
        settingsMerged = true;
        await refetchSettings();
      }

      setResult({ foldersCreated, loadoutsImported, settingsMerged });
      setPhase('done');
      clearGuestData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration failed');
      setPhase('error');
    }
  };

  const header = (
    <div className="migrate-header">
      <span className="migrate-header-title">Loadout Manager for Increlution</span>
      <div className="migrate-header-right">
        {user && <span className="migrate-header-user">{user.username}</span>}
        <button className="migrate-header-logout" onClick={handleLogout}>
          <i className="fas fa-sign-out-alt" />
          Logout
        </button>
      </div>
    </div>
  );

  if (phase === 'done' && result) {
    return (
      <div className="migrate-page">
        {header}
        <div className="migrate-body">
          <div className="migrate-container">
            <h1>Migration Complete</h1>
            <div className="migrate-success">
              <i className="fas fa-check-circle" />
              <div className="migrate-success-details">
                {result.loadoutsImported > 0 && (
                  <p>
                    Imported <strong>{result.loadoutsImported} loadout{result.loadoutsImported !== 1 ? 's' : ''}</strong>
                    {result.foldersCreated > 0 && (
                      <> and <strong>{result.foldersCreated} folder{result.foldersCreated !== 1 ? 's' : ''}</strong></>
                    )}.
                  </p>
                )}
                {result.settingsMerged && (
                  <p>Settings have been merged with your account.</p>
                )}
                <p>Guest data has been cleared from this browser.</p>
              </div>
            </div>
            <button className="migrate-continue-button" onClick={() => navigate('/loadouts')}>
              <i className="fas fa-arrow-right" />
              Go to Editor
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="migrate-page">
        {header}
        <div className="migrate-body">
          <div className="migrate-container">
            <h1>Migration Failed</h1>
            <div className="migrate-error">
              <i className="fas fa-exclamation-circle" />
              <div className="migrate-error-details">
                <p>{error}</p>
                <p>Your guest data has not been deleted. You can try again.</p>
              </div>
            </div>
            <div className="migrate-actions">
              <button className="migrate-import-button" onClick={() => { setPhase('choose'); }}>
                <i className="fas fa-redo" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'migrating') {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <div className="migrate-page">
        {header}
        <div className="migrate-body">
          <div className="migrate-container">
            <h1>Importing Guest Data</h1>
            <div className="migrate-progress">
              <div className="migrate-progress-bar-track">
                <div className="migrate-progress-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <p className="migrate-progress-text">{progress.phase} ({pct}%)</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'confirm-discard') {
    const discarded = getDiscardDescription();
    return (
      <div className="migrate-page">
        {header}
        <div className="migrate-body">
          <div className="migrate-container">
            <h1>{isPartialImport ? 'Confirm Partial Import' : 'Discard Guest Data'}</h1>
            <div className="migrate-warning">
              <i className="fas fa-exclamation-triangle" />
              <div className="migrate-warning-details">
                {discarded.length > 0 ? (
                  <>
                    <p>The following guest data will be <strong>permanently discarded</strong>:</p>
                    <ul>
                      {discarded.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </>
                ) : (
                  <p>All guest data will be <strong>permanently discarded</strong>.</p>
                )}
                <p>This cannot be undone.</p>
              </div>
            </div>
            <div className="migrate-actions">
              <button className="migrate-import-button migrate-discard-button" onClick={handleConfirmDiscard}>
                {isPartialImport ? (
                  <><i className="fas fa-download" /> Import Selected</>
                ) : (
                  <><i className="fas fa-trash" /> Discard and Continue</>
                )}
              </button>
              <button className="migrate-back-button" onClick={() => setPhase('choose')}>
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'choose'
  return (
    <div className="migrate-page">
      {header}
      <div className="migrate-body">
        <div className="migrate-container">
          <h1>Welcome back!</h1>
          <p className="migrate-subtitle">
            We found guest data saved in this browser. Would you like to import it into your account?
          </p>

          <div className="migrate-summary">
            {hasLoadouts && (
              <div className="migrate-summary-item">
                <i className="fas fa-file-alt" />
                <span>
                  <strong>{counts.loadouts}</strong> loadout{counts.loadouts !== 1 ? 's' : ''}
                  {counts.folders > 0 && (
                    <>, <strong>{counts.folders}</strong> folder{counts.folders !== 1 ? 's' : ''}</>
                  )}
                </span>
              </div>
            )}
            {guestHasSettings && (
              <div className="migrate-summary-item">
                <i className="fas fa-cog" />
                <span>Custom settings</span>
              </div>
            )}
          </div>

          <div className="migrate-options">
            {hasLoadouts && (
              <label className="migrate-option">
                <input
                  type="checkbox"
                  checked={importLoadoutsChecked}
                  onChange={e => setImportLoadoutsChecked(e.target.checked)}
                />
                <div className="migrate-option-content">
                  <span className="migrate-option-label">Import loadouts and folders</span>
                  <span className="migrate-option-desc">
                    Folders and loadouts will be added under your root folder. Existing account data is not affected.
                  </span>
                </div>
              </label>
            )}
            {guestHasSettings && (
              <label className="migrate-option">
                <input
                  type="checkbox"
                  checked={importSettingsChecked}
                  onChange={e => setImportSettingsChecked(e.target.checked)}
                />
                <div className="migrate-option-content">
                  <span className="migrate-option-label">Import settings</span>
                  <span className="migrate-option-desc">
                    Unlocked chapters, favourites, and skill priorities will be merged. Your existing account settings take precedence where both differ.
                  </span>
                </div>
              </label>
            )}
          </div>

          {!isFullImport && !isPartialImport && (
            <div className="migrate-discard-notice">
              <i className="fas fa-exclamation-triangle" />
              <span>All guest data will be permanently deleted.</span>
            </div>
          )}
          {isPartialImport && !isFullImport && (
            <div className="migrate-partial-notice">
              <i className="fas fa-info-circle" />
              <span>Unchecked items will be permanently deleted.</span>
            </div>
          )}
          <div className="migrate-actions">
            {isFullImport ? (
              <button className="migrate-import-button" onClick={handleProceed}>
                <i className="fas fa-download" /> Import All
              </button>
            ) : isPartialImport ? (
              <button className="migrate-import-button migrate-partial-button" onClick={handleProceed}>
                <i className="fas fa-download" /> Import Selected and Discard Rest
              </button>
            ) : (
              <button className="migrate-import-button migrate-discard-button" onClick={handleProceed}>
                <i className="fas fa-trash" /> Discard All Guest Data
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
